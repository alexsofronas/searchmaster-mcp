export const MCP_PUBLIC_URL = "https://oowilxxepsyzpjnubyyk.supabase.co/functions/v1/get-top-competitors";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

export const SERVER_INFO = { name: "searchmaster", version: "1.1.0" };

const TOOL_ANNOTATIONS = {
  title: "",
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

function readOnlyTool(title: string, name: string, description: string, inputSchema: Record<string, unknown>) {
  return {
    name,
    title,
    description,
    inputSchema,
    annotations: { ...TOOL_ANNOTATIONS, title },
  };
}

export const MCP_TOOLS = [
  readOnlyTool(
    "Check AI visibility",
    "check_ai_visibility",
    "For a company, return its top competitors and the average rank of each across ChatGPT, Claude, Gemini, Grok, and Perplexity.",
    {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name, for example Notion" },
        industry: { type: "string", description: "Industry, when the company name is ambiguous" },
      },
      required: ["company"],
      additionalProperties: false,
    },
  ),
  readOnlyTool(
    "Find competitors",
    "find_competitors",
    "Find direct competitor domains for a website. DataForSEO cost is passed through with a $0 SearchMaster fee. Free trial included.",
    {
      type: "object",
      properties: {
        domain: { type: "string", description: "Website domain, for example postpilot.com" },
      },
      required: ["domain"],
      additionalProperties: false,
    },
  ),
  readOnlyTool(
    "Ranked keywords",
    "ranked_keywords",
    "Return the keywords a domain ranks for, with search volume and rank. DataForSEO cost is passed through with a $0 SearchMaster fee.",
    {
      type: "object",
      properties: {
        domain: { type: "string" },
        limit: { type: "number", description: "Max keywords, 1 to 50. Defaults to 20." },
      },
      required: ["domain"],
      additionalProperties: false,
    },
  ),
  readOnlyTool(
    "Generate llms.txt",
    "generate_llms_txt",
    "Generate an llms.txt file for a domain using its competitors and ranked keywords. Place the result at https://theirdomain/llms.txt.",
    {
      type: "object",
      properties: {
        domain: { type: "string" },
      },
      required: ["domain"],
      additionalProperties: false,
    },
  ),
];

export type McpToolName = "check_ai_visibility" | "find_competitors" | "ranked_keywords" | "generate_llms_txt";

export function isMcpToolName(name: string): name is McpToolName {
  switch (name) {
    case "check_ai_visibility":
    case "find_competitors":
    case "ranked_keywords":
    case "generate_llms_txt":
      return true;
    default:
      return false;
  }
}

export function negotiateProtocolVersion(requested: unknown): string {
  if (typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) {
    return requested;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

export function wantsEventStream(acceptHeader: string | null): boolean {
  return (acceptHeader || "")
    .toLowerCase()
    .split(",")
    .some((part) => part.trim().startsWith("text/event-stream"));
}

export type McpRequestBody = {
  id?: unknown;
  method?: string;
  params?: Record<string, unknown>;
};

export type RoutedMcpRequest =
  | { type: "notification" }
  | { type: "result"; id: unknown; result: unknown }
  | { type: "error"; id: unknown; code: number; message: string }
  | { type: "tool"; id: unknown; name: string; args: Record<string, unknown> };

export function routeMcpRequest(body: McpRequestBody): RoutedMcpRequest {
  const id = body.id === undefined ? null : body.id;
  const method = typeof body.method === "string" ? body.method : "";
  const params = body.params && typeof body.params === "object" ? body.params : {};

  if (method.startsWith("notifications/")) {
    return { type: "notification" };
  }
  if (method === "ping") {
    return { type: "result", id, result: {} };
  }
  if (method === "initialize") {
    return {
      type: "result",
      id,
      result: {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
      },
    };
  }
  if (method === "tools/list") {
    return { type: "result", id, result: { tools: MCP_TOOLS } };
  }
  if (method === "resources/list") {
    return { type: "result", id, result: { resources: [] } };
  }
  if (method === "prompts/list") {
    return { type: "result", id, result: { prompts: [] } };
  }
  if (method === "tools/call") {
    const name = String(params.name || "");
    const rawArgs = params.arguments;
    const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? rawArgs as Record<string, unknown>
      : {};
    return { type: "tool", id, name, args };
  }
  return { type: "error", id, code: -32601, message: `Method not found: ${method}` };
}

export function serverCard(dailySpendCapUsd: number) {
  return {
    name: "SearchMaster MCP",
    protocol: DEFAULT_PROTOCOL_VERSION,
    transport: "streamable-http",
    url: MCP_PUBLIC_URL,
    free_trial_calls: 40,
    daily_spend_cap_usd: dailySpendCapUsd,
    searchmaster_fee_usd: 0,
    tools: MCP_TOOLS.map((tool) => tool.name),
    note: "No API key is required. Anonymous use is limited per network and by a shared daily spend cap.",
  };
}

export function openApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "SearchMaster",
      version: "1.1.0",
      description: "Competitor, keyword, llms.txt, and AI visibility checks. DataForSEO cost is passed through with no SearchMaster fee.",
    },
    servers: [{ url: MCP_PUBLIC_URL }],
    paths: {
      "/": {
        post: {
          operationId: "callSearchMaster",
          summary: "MCP JSON-RPC endpoint",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { "200": { description: "JSON-RPC result" } },
        },
      },
    },
  };
}

export function toolTextResult(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function toolErrorResult(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
