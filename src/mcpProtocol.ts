export const MCP_PUBLIC_URL = "https://oowilxxepsyzpjnubyyk.supabase.co/functions/v1/get-top-competitors";

export const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS] as const;

export const DEFAULT_PROTOCOL_VERSION = "2025-11-25";

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
  if (typeof requested === "string" && (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) {
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

export type McpRequestBody = unknown;

type RpcId = string | number;
type JsonObject = Record<string, unknown>;

export type RoutedMcpRequest =
  | { type: "notification" }
  | { type: "result"; id: RpcId; result: JsonObject }
  | { type: "error"; id: RpcId | null; code: number; message: string; status?: number; data?: unknown }
  | { type: "tool"; id: RpcId; name: string; args: JsonObject };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeHeader(value: string | null): string | null {
  if (!value?.startsWith("=?base64?") || !value.endsWith("?=")) return value;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(value.slice(9, -2)), (char) => char.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

const VERSION_META = "io.modelcontextprotocol/protocolVersion";
const CAPABILITIES_META = "io.modelcontextprotocol/clientCapabilities";
const LEGACY_CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false },
  prompts: { listChanged: false },
};

type RequestHeaders = Pick<Headers, "get" | "has">;
const NO_HEADERS: RequestHeaders = { get: () => null, has: () => false };

export function isModernRequest(body: unknown, headers: RequestHeaders): boolean {
  if (!isObject(body)) return false;
  const params = isObject(body.params) ? body.params : {};
  return body.method === "server/discover" ||
    (isObject(params._meta) && VERSION_META in params._meta) ||
    headers.has("Mcp-Method") ||
    headers.get("MCP-Protocol-Version") === MODERN_PROTOCOL_VERSION;
}

export function routeMcpRequest(body: McpRequestBody, headers: RequestHeaders = NO_HEADERS): RoutedMcpRequest {
  if (!isObject(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string" || !body.method) {
    return { type: "error", id: null, code: -32600, message: "Invalid request", status: 400 };
  }
  const method = body.method;
  const id = body.id;
  if (id === undefined) return { type: "notification" };
  if (typeof id !== "string" && !(typeof id === "number" && Number.isInteger(id))) {
    return { type: "error", id: null, code: -32600, message: "Invalid request ID", status: 400 };
  }
  if (body.params !== undefined && !isObject(body.params)) {
    return { type: "error", id, code: -32602, message: "Parameters must be an object" };
  }
  const params = isObject(body.params) ? body.params : {};
  const modern = isModernRequest(body, headers);
  const versionHeader = headers.get("MCP-Protocol-Version");
  if (modern) {
    const meta = isObject(params._meta) ? params._meta : {};
    const version = meta[VERSION_META];
    const name = method === "resources/read" ? params.uri : params.name;
    const expectsName = ["tools/call", "resources/read", "prompts/get"].includes(method);
    if (versionHeader === null || versionHeader !== version || headers.get("Mcp-Method") !== method ||
      (expectsName && (typeof name !== "string" || decodeHeader(headers.get("Mcp-Name")) !== name))) {
      return { type: "error", id, code: -32020, message: "MCP request headers do not match the message", status: 400 };
    }
    if (version !== MODERN_PROTOCOL_VERSION) {
      return {
        type: "error", id, code: -32022, message: "Unsupported protocol version", status: 400,
        data: { supported: SUPPORTED_PROTOCOL_VERSIONS, requested: version },
      };
    }
    if (!isObject(meta[CAPABILITIES_META])) {
      return { type: "error", id, code: -32602, message: "Client capabilities metadata is required", status: 400 };
    }
  } else if (versionHeader && !(LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(versionHeader)) {
    return { type: "error", id, code: -32600, message: "Unsupported MCP-Protocol-Version header", status: 400 };
  }

  const complete = (result: JsonObject = {}): RoutedMcpRequest => ({
    type: "result", id, result: formatMcpResult(result, modern),
  });

  if (method === "ping") return complete();
  if (modern && method === "server/discover") {
    return complete({
      supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
      capabilities: { tools: { listChanged: false } },
    });
  }
  if (!modern && method === "initialize") {
    return complete({
      protocolVersion: negotiateProtocolVersion(params.protocolVersion),
      capabilities: LEGACY_CAPABILITIES,
      serverInfo: SERVER_INFO,
    });
  }
  if (method === "tools/list") return complete({ tools: MCP_TOOLS });
  if (!modern && method === "resources/list") return complete({ resources: [] });
  if (!modern && method === "prompts/list") return complete({ prompts: [] });
  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments === undefined ? {} : params.arguments;
    if (typeof name !== "string" || !name || !isObject(args)) {
      return { type: "error", id, code: -32602, message: "A tool name and object arguments are required" };
    }
    if (modern && !isMcpToolName(name)) {
      return { type: "error", id, code: -32602, message: "Unknown tool" };
    }
    return { type: "tool", id, name, args };
  }
  return {
    type: "error", id, code: -32601, message: `Method not found: ${method}`,
    status: modern ? 404 : undefined,
  };
}

export function formatMcpResult(result: JsonObject, modern: boolean): JsonObject {
  if (!modern) return result;
  const meta = isObject(result._meta) ? result._meta : {};
  return { ...result, resultType: "complete", _meta: { ...meta, "io.modelcontextprotocol/serverInfo": SERVER_INFO } };
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
