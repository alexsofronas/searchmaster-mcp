/**
 * Run a short LLM prompt across providers until one returns text.
 * Blocking steps such as competitor discovery must finish even when a
 * single vendor model is retired or unavailable.
 */

export interface WaterfallResult {
  text: string;
  provider: string;
  model: string;
}

interface WaterfallOptions {
  temperature: number;
  maxTokens: number;
  timeoutMs?: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function readError(response: Response): Promise<string> {
  const body = await response.text();
  const clipped = body.replace(/\s+/g, " ").slice(0, 240);
  return `${response.status} ${response.statusText} ${clipped}`.trim();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function textFromChatCompletion(data: { choices?: Array<{ message?: { content?: unknown } }> }): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
    if (joined) return joined;
  }
  throw new Error("empty completion");
}

async function postChat(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  options: WaterfallOptions,
): Promise<string> {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      messages: [
        { role: "system", content: "Return only the requested JSON. No markdown." },
        { role: "user", content: prompt },
      ],
    }),
  }, options.timeoutMs ?? 20000);

  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return textFromChatCompletion(await response.json());
}

async function postAnthropic(apiKey: string, model: string, prompt: string, options: WaterfallOptions): Promise<string> {
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  }, options.timeoutMs ?? 20000);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = await response.json();
  const text = data?.content?.find?.((part: { type?: string; text?: string }) => part.type === "text")?.text
    ?? data?.content?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("empty anthropic response");
  }
  return text;
}

export async function completeWithWaterfall(prompt: string, options: WaterfallOptions): Promise<WaterfallResult> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("CHATGPT_OPENAI_API_KEY") || Deno.env.get("OPENAI_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const grokKey = Deno.env.get("GROK_API_KEY");
  const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

  const attempts: Array<{ provider: string; model: string; run: () => Promise<string> }> = [];

  if (anthropicKey) {
    attempts.push({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      run: () => postAnthropic(anthropicKey, "claude-haiku-4-5-20251001", prompt, options),
    });
  }
  if (openaiKey) {
    attempts.push({
      provider: "openai",
      model: "gpt-4o-mini",
      run: () => postChat("https://api.openai.com/v1/chat/completions", openaiKey, "gpt-4o-mini", prompt, options),
    });
  }
  if (lovableKey) {
    attempts.push({
      provider: "gemini",
      model: "google/gemini-2.5-flash",
      run: () => postChat(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        lovableKey,
        "google/gemini-2.5-flash",
        prompt,
        options,
      ),
    });
  }
  if (grokKey) {
    attempts.push({
      provider: "grok",
      model: "grok-4-fast-non-reasoning",
      run: () => postChat("https://api.x.ai/v1/chat/completions", grokKey, "grok-4-fast-non-reasoning", prompt, options),
    });
  }
  if (perplexityKey) {
    attempts.push({
      provider: "perplexity",
      model: "sonar",
      run: () => postChat("https://api.perplexity.ai/chat/completions", perplexityKey, "sonar", prompt, options),
    });
  }

  if (attempts.length === 0) {
    throw new Error("No LLM provider keys are configured");
  }

  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      console.log(`[llm-waterfall] trying ${attempt.provider}/${attempt.model}`);
      const text = await attempt.run();
      console.log(`[llm-waterfall] ${attempt.provider}/${attempt.model} succeeded`);
      return { text, provider: attempt.provider, model: attempt.model };
    } catch (error) {
      const message = `${attempt.provider}/${attempt.model}: ${errorMessage(error)}`;
      console.warn(`[llm-waterfall] ${message}`);
      failures.push(message);
    }
  }

  throw new Error(`All LLM providers failed. ${failures.join(" | ")}`);
}
