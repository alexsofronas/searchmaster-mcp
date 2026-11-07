import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { completeWithWaterfall } from "./llmWaterfall.ts";
import { validateWebsiteUrl } from "./urlValidation.ts";
import {
  MCP_PUBLIC_URL,
  McpToolName,
  isMcpToolName,
  openApiDocument,
  routeMcpRequest,
  serverCard,
  toolErrorResult,
  toolTextResult,
  wantsEventStream,
} from "./mcpProtocol.ts";
import {
  SPEND_CAP_MESSAGE,
  SettledSpendError,
  SpendCapError,
  resolveCallCostUsd,
  visibilityRunCostUsd,
} from "./spendPolicy.ts";
import {
  dailySpendCapUsd,
  endpointCostUsd,
  refundFreeDailySpend,
  reserveFreeDailySpend,
  verifiedSessionUserId,
} from "./freeSpendCap.ts";
import {
  VisibilityModelId,
  VisibilityModelResult,
  collectNormalizationNames,
  summarizeVisibility,
} from "./visibilitySummary.ts";

export const mcpCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version, mcp-session-id, last-event-id, x-searchmaster-client-ip",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const corsHeaders = mcpCorsHeaders;

const TRIAL_CALLS = 40;
const IP_DAILY_CALLS = 80;

const VISIBILITY_FUNCTIONS: Array<[VisibilityModelId, string]> = [
  ["chatgpt", "homepage-chatgpt-analysis"],
  ["claude", "homepage-claude-analysis"],
  ["gemini", "homepage-gemini-analysis"],
  ["grok", "grok-competitive-analysis"],
  ["perplexity", "perplexity-competitive-analysis"],
];

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function rpcResult(id: unknown, result: unknown): Response {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: unknown, message: string, code = -32601): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message } });
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function platformIp(req: Request): string {
  const cloudflare = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return "unknown";
}

function serviceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

async function reserveTrial(req: Request): Promise<{ clientKey: string; ipHash: string } | { error: string }> {
  const supabase = serviceClient();
  if (!supabase) return { error: "Trial storage is not configured" };
  const ipHash = await sha256(platformIp(req));
  const userId = await verifiedSessionUserId(req);
  const clientKey = userId ? `user:${userId}` : `ip:${ipHash}`;
  const { data, error } = await supabase.rpc("consume_mcp_trial", {
    p_client_key: clientKey,
    p_ip_hash: ipHash,
    p_key_limit: TRIAL_CALLS,
    p_ip_limit: IP_DAILY_CALLS,
  });
  if (error) return { error: "Trial quota could not be reserved" };
  if (data !== true) {
    return { error: `Free trial limit reached (${TRIAL_CALLS} calls). Connect SearchMaster to keep going.` };
  }
  return { clientKey, ipHash };
}

async function refundTrial(clientKey: string, ipHash: string) {
  const supabase = serviceClient();
  if (!supabase) return;
  await supabase.rpc("refund_mcp_trial", { p_client_key: clientKey, p_ip_hash: ipHash });
}

async function recordCost(clientKey: string, cost: number) {
  if (!cost) return;
  const supabase = serviceClient();
  if (!supabase) return;
  const { data } = await supabase.from("mcp_trial_usage").select("dataforseo_cost").eq("client_key", clientKey).maybeSingle();
  await supabase.from("mcp_trial_usage").update({
    dataforseo_cost: Number(data?.dataforseo_cost ?? 0) + cost,
    updated_at: new Date().toISOString(),
  }).eq("client_key", clientKey);
}

function pricing(cost: number) {
  return {
    searchmaster_fee_usd: 0,
    dataforseo_cost_usd: Number(cost.toFixed(5)),
    pricing: "DataForSEO's price is passed through. SearchMaster adds no fee. This call is covered by the free trial.",
  };
}

async function reserveAnonymousSpend(req: Request, endpoint: string): Promise<number> {
  if (await verifiedSessionUserId(req)) return 0;
  const cost = endpointCostUsd(endpoint);
  const decision = await reserveFreeDailySpend(cost);
  if (!decision.allowed) throw new SpendCapError();
  return decision.skipped ? 0 : cost;
}

async function dataForSeo(endpoint: string, payload: unknown): Promise<{ data: any; cost: number }> {
  const login = Deno.env.get("DATAFORSEO_USERNAME") || Deno.env.get("DATAFORSEO_LOGIN");
  const password = Deno.env.get("DATAFORSEO_PASSWORD");
  if (!login || !password) throw new Error("DataForSEO credentials are not configured");
  const response = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${login}:${password}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || data.status_code !== 20000) {
    throw new Error(data.status_message || `DataForSEO HTTP ${response.status}`);
  }
  return { data, cost: Number(data.cost || 0) };
}

async function callFunction(slug: string, body: unknown, req: Request): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("SearchMaster functions are not configured");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
  };
  const ip = platformIp(req);
  if (ip && ip !== "unknown") headers["x-searchmaster-client-ip"] = ip;
  const response = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function findCompetitors(domain: string, req: Request) {
  const data = await callFunction("get-top-competitors", { targetWebsite: domain, maxCount: 5 }, req);
  if (data?.spendCapReached) throw new SpendCapError();
  if (data?.error) throw new Error(data.error || "Competitor discovery failed");
  return data;
}

async function rankedKeywords(domain: string, limit: number) {
  const bounded = Math.min(Math.max(limit, 1), 50);
  const { data, cost } = await dataForSeo("dataforseo_labs/google/ranked_keywords/live", [{
    target: domain,
    limit: bounded,
    location_code: 2840,
    language_code: "en",
  }]);
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const keywords = items.map((item: any) => ({
    keyword: item.keyword_data?.keyword || "",
    search_volume: item.keyword_data?.keyword_info?.search_volume || 0,
    rank: item.ranked_serp_element?.serp_item?.rank_absolute || null,
  })).filter((item: { keyword: string }) => item.keyword);
  return { keywords, total_count: data.tasks?.[0]?.result?.[0]?.total_count || keywords.length, ...pricing(cost), cost };
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);
}

async function generateLlmsTxt(domain: string, req: Request) {
  let homepage = "";
  try {
    const page = await fetch(`https://${domain}`, {
      redirect: "manual",
      headers: { "User-Agent": "SearchMaster-llms.txt" },
    });
    if (page.ok) homepage = visibleText(await page.text());
  } catch {
    homepage = "";
  }
  const keywordResult = await rankedKeywords(domain, 15);
  let competitors: Array<{ domain: string; verified?: boolean }> = [];
  try {
    const found = await findCompetitors(domain, req);
    competitors = found.competitors || [];
  } catch (error) {
    if (error instanceof SpendCapError) throw error;
    competitors = [];
  }
  const prompt = `Write an llms.txt file for ${domain}.
Homepage excerpt: ${homepage || "unavailable"}
Ranked keywords: ${keywordResult.keywords.map((item: { keyword: string }) => item.keyword).slice(0, 15).join(", ")}
Competitor domains: ${competitors.map((item) => item.domain).join(", ") || "unknown"}

Use this shape and no other commentary:
# Company name
> one sentence description

## Product
- short bullets a language model can quote

## Competitors
- domain: why a buyer compares them

## Keywords
- keyword`;
  const draft = await completeWithWaterfall(prompt, { temperature: 0.2, maxTokens: 1200, timeoutMs: 20000 });
  return {
    llms_txt: draft.text,
    provider: draft.provider,
    model: draft.model,
    competitors: competitors.map((item) => item.domain),
    keywords: keywordResult.keywords,
    ...pricing(keywordResult.cost),
    cost: keywordResult.cost,
  };
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 31) return true;
  }
  return false;
}

function cleanCompany(value: unknown): string {
  const company = String(value || "").trim().replace(/\s+/g, " ");
  if (!company || company.length > 120) throw new Error("A company name is required");
  if (hasControlCharacter(company)) throw new Error("That company name is not allowed");
  return company;
}

function cleanIndustry(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const industry = String(value).trim().replace(/\s+/g, " ");
  if (!industry || industry.length > 120 || hasControlCharacter(industry)) {
    throw new Error("That industry is not allowed");
  }
  return industry;
}

async function checkAiVisibility(companyInput: unknown, industryInput: unknown, req: Request) {
  const company = cleanCompany(companyInput);
  const industry = cleanIndustry(industryInput);
  const costJson = Deno.env.get("FREE_SPEND_COSTS_JSON");

  const validation = await callFunction("validate-company", { company, industry }, req);
  if (validation?.spendCapReached) throw new SpendCapError();
  if (validation?.needsContext || validation?.isAmbiguous || validation?.canProceed === false) {
    if (!(await verifiedSessionUserId(req))) {
      const unused = visibilityRunCostUsd(costJson) - resolveCallCostUsd("validate-company", costJson);
      await refundFreeDailySpend(unused);
    }
    return {
      company,
      needs_input: true,
      message: validation?.message || "Add an industry so this company can be checked.",
      corrected_name: validation?.correctedName ?? null,
      ambiguous_companies: Array.isArray(validation?.ambiguousCompanies) ? validation.ambiguousCompanies : [],
    };
  }

  const resolved = typeof validation?.correctedName === "string" && validation.correctedName.trim()
    ? validation.correctedName.trim()
    : company;
  const models: VisibilityModelResult[] = await Promise.all(VISIBILITY_FUNCTIONS.map(async ([model, slug]) => {
    try {
      const data = await callFunction(slug, { company: resolved, industry }, req);
      return {
        model,
        success: Boolean(data?.success),
        companies: Array.isArray(data?.companies) ? data.companies : [],
        errorMessage: typeof data?.errorMessage === "string" ? data.errorMessage : undefined,
        spendCapReached: Boolean(data?.spendCapReached),
      };
    } catch {
      return { model, success: false, companies: [], errorMessage: "Temporarily unavailable" };
    }
  }));

  if (!models.some((model) => model.success)) {
    if (models.length > 0 && models.every((model) => model.spendCapReached)) throw new SpendCapError();
    throw new SettledSpendError("The models are unavailable right now. Try again in a minute.");
  }

  const names = collectNormalizationNames(models, 20);
  let nameMapping: Record<string, string> = {};
  if (names.length > 0) {
    const normalized = await callFunction("normalize-competitors", { competitors: names, targetCompany: resolved }, req);
    if (!normalized?.spendCapReached && normalized?.nameMapping && typeof normalized.nameMapping === "object") {
      nameMapping = normalized.nameMapping;
    }
  }

  const summary = summarizeVisibility({ company: resolved, models, nameMapping });
  if (summary.spend_cap_reached) throw new SpendCapError();
  return summary;
}

function assertPublicDomain(domain: string) {
  if (!domain || !domain.includes(".")) throw new Error("A domain like postpilot.com is required");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain) || domain.includes(":") || domain.endsWith(".local") || domain.endsWith(".internal")) {
    throw new Error("That domain is not allowed");
  }
  const urlCheck = validateWebsiteUrl(`https://${domain}`);
  if (!urlCheck.valid) throw new Error(urlCheck.error || "That domain is not allowed");
}

async function callTool(name: McpToolName, args: Record<string, unknown>, req: Request): Promise<{ payload: unknown; cost: number }> {
  switch (name) {
    case "check_ai_visibility":
      return { payload: await checkAiVisibility(args.company, args.industry, req), cost: 0 };
    case "find_competitors": {
      const domain = normalizeDomain(String(args.domain || ""));
      assertPublicDomain(domain);
      const found = await findCompetitors(domain, req);
      return { payload: { ...found, ...pricing(0), domain }, cost: 0 };
    }
    case "ranked_keywords": {
      const domain = normalizeDomain(String(args.domain || ""));
      assertPublicDomain(domain);
      const ranked = await rankedKeywords(domain, Number(args.limit || 20));
      return { payload: { domain, ...ranked }, cost: ranked.cost };
    }
    case "generate_llms_txt": {
      const domain = normalizeDomain(String(args.domain || ""));
      assertPublicDomain(domain);
      const generated = await generateLlmsTxt(domain, req);
      return { payload: { domain, ...generated }, cost: generated.cost };
    }
    default: {
      const unknown: never = name;
      throw new Error(`Unknown tool ${unknown}`);
    }
  }
}

async function executeTool(id: unknown, name: string, args: Record<string, unknown>, req: Request): Promise<Response> {
  if (!isMcpToolName(name)) {
    return rpcResult(id, toolErrorResult(`Unknown tool: ${name}`));
  }
  const trial = await reserveTrial(req);
  if ("error" in trial) return rpcResult(id, toolErrorResult(trial.error));

  let reserved = 0;
  try {
    if (name === "check_ai_visibility") {
      if (!(await verifiedSessionUserId(req))) {
        const cost = visibilityRunCostUsd(Deno.env.get("FREE_SPEND_COSTS_JSON"));
        const decision = await reserveFreeDailySpend(cost);
        if (!decision.allowed) throw new SpendCapError();
        reserved = decision.skipped ? 0 : cost;
      }
    } else {
      reserved = await reserveAnonymousSpend(req, name);
    }
    const result = await callTool(name, args, req);
    if (name === "ranked_keywords" && reserved > 0) {
      const actual = Number(result.cost || 0);
      const delta = actual - reserved;
      if (delta > 0.000001) await reserveFreeDailySpend(delta);
      if (delta < -0.000001) await refundFreeDailySpend(-delta);
      reserved = 0;
    }
    await recordCost(trial.clientKey, result.cost);
    return rpcResult(id, toolTextResult(result.payload));
  } catch (error) {
    if (reserved > 0 && !(error instanceof SettledSpendError)) await refundFreeDailySpend(reserved);
    await refundTrial(trial.clientKey, trial.ipHash);
    const message = error instanceof SpendCapError
      ? SPEND_CAP_MESSAGE
      : error instanceof Error
        ? error.message
        : "Tool failed";
    return rpcResult(id, toolErrorResult(message));
  }
}

export async function handleSearchMasterMcp(req: Request, providedBody?: { id?: unknown; method?: string; params?: Record<string, unknown> }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "DELETE") return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(req.url);
  if (req.method === "GET") {
    if (wantsEventStream(req.headers.get("accept"))) {
      return json(
        { error: "SSE streams are not supported. POST a JSON-RPC message instead." },
        405,
        { Allow: "POST" },
      );
    }
    if (url.pathname.endsWith("openapi.json")) return json(openApiDocument());
    return json(serverCard(dailySpendCapUsd()));
  }

  const routed = routeMcpRequest(providedBody || {});
  switch (routed.type) {
    case "notification":
      return new Response(null, { status: 202, headers: corsHeaders });
    case "result":
      return rpcResult(routed.id, routed.result);
    case "error":
      return rpcError(routed.id, routed.message, routed.code);
    case "tool":
      return await executeTool(routed.id, routed.name, routed.args, req);
    default: {
      const unknown: never = routed;
      return rpcError(null, `Method not found: ${String(unknown)}`);
    }
  }
}

export { MCP_PUBLIC_URL };
