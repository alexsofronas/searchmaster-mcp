import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { completeWithWaterfall } from "./llmWaterfall.ts";
import { validateWebsiteUrl } from "./urlValidation.ts";
import { resolveMcpIdentity, type McpIdentity } from "./mcpIdentity.ts";
import { addDataForSeoCosts, measuredMicrousd, readCompetitorDataForSeoCost, readDataForSeoCost, UNKNOWN_DATAFORSEO_COST, type DataForSeoCost } from "./dataForSeoCost.ts";
import {
  MCP_PUBLIC_URL,
  McpToolName,
  isMcpToolName,
  formatMcpResult,
  isModernRequest,
  openApiDocument,
  MODERN_PROTOCOL_VERSION,
  routeMcpRequest,
  serverCard,
  toolErrorResult,
  toolTextResult,
  wantsEventStream,
} from "./mcpProtocol.ts";
import {
  SPEND_CAP_MESSAGE,
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
  summarizeVisibilityWithNormalization,
} from "./visibilitySummary.ts";

export const mcpCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, idempotency-key, last-event-id, x-searchmaster-client-ip",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
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

function rpcResult(id: unknown, result: unknown, extraHeaders: Record<string, string> = {}): Response {
  return json({ jsonrpc: "2.0", id, result }, 200, extraHeaders);
}

function rpcError(id: unknown, message: string, code = -32601, status = 200, data?: unknown): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }, status);
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function platformIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const address = req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() || forwarded || "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) &&
      address.split(".").every((part) => Number(part) <= 255)) return address;
  if (/^[a-f\d:.]+$/i.test(address) && address.includes(":")) {
    try {
      return new URL(`http://[${address}]`).hostname.slice(1, -1);
    } catch {
      return "unknown";
    }
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
  const clientKey = `ip:${ipHash}`;
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

type ToolUsage = { costs: DataForSeoCost[]; dispatched: boolean };

function pricing(cost: DataForSeoCost, paid: boolean) {
  return {
    searchmaster_fee_usd: 0,
    dataforseo_cost_usd: cost.usd,
    dataforseo_cost_complete: cost.complete,
    pricing: paid ? "SearchMaster adds no fee." : "SearchMaster adds no fee. This call is covered by the free trial.",
  };
}

async function dataForSeo(endpoint: string, payload: unknown, usage: ToolUsage): Promise<any> {
  const login = Deno.env.get("DATAFORSEO_USERNAME") || Deno.env.get("DATAFORSEO_LOGIN");
  const password = Deno.env.get("DATAFORSEO_PASSWORD");
  if (!login || !password) throw new Error("DataForSEO credentials are not configured");
  usage.dispatched = true;
  const costIndex = usage.costs.push(UNKNOWN_DATAFORSEO_COST) - 1;
  const response = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${login}:${password}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  usage.costs[costIndex] = readDataForSeoCost(data);
  const task = data?.tasks?.[0];
  if (!response.ok || data?.status_code !== 20000 || (task?.status_code && task.status_code !== 20000)) {
    throw new Error("DataForSEO could not complete the request");
  }
  return data;
}

async function callFunction(slug: string, body: unknown, clientIp: string): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("SearchMaster functions are not configured");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
  };
  if (clientIp && clientIp !== "unknown") headers["x-searchmaster-client-ip"] = clientIp;
  const response = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  try {
    const data = await response.json();
    if (!response.ok && !data?.error) return { ...data, error: "SearchMaster backend could not complete the request" };
    return data;
  } catch {
    return { error: "SearchMaster backend returned an invalid response" };
  }
}

async function findCompetitors(domain: string, clientIp: string, usage: ToolUsage) {
  usage.dispatched = true;
  const costIndex = usage.costs.push(UNKNOWN_DATAFORSEO_COST) - 1;
  const data = await callFunction("get-top-competitors", { targetWebsite: domain, maxCount: 5 }, clientIp);
  usage.costs[costIndex] = readCompetitorDataForSeoCost(data);
  if (data?.spendCapReached) throw new SpendCapError();
  if (data?.error || !Array.isArray(data?.competitors)) throw new Error("Competitor discovery failed");
  return data;
}

function boundedKeywordLimit(value: unknown): number {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 50) : 20;
}

async function rankedKeywords(domain: string, limit: number, usage: ToolUsage) {
  const data = await dataForSeo("dataforseo_labs/google/ranked_keywords/live", [{
    target: domain,
    limit: boundedKeywordLimit(limit),
    location_code: 2840,
    language_code: "en",
  }], usage);
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const keywords = items.map((item: any) => ({
    keyword: item.keyword_data?.keyword || "",
    search_volume: item.keyword_data?.keyword_info?.search_volume || 0,
    rank: item.ranked_serp_element?.serp_item?.rank_absolute || null,
  })).filter((item: { keyword: string }) => item.keyword);
  return { keywords, total_count: data.tasks?.[0]?.result?.[0]?.total_count || keywords.length, cost: usage.costs.at(-1)?.usd ?? 0 };
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

async function generateLlmsTxt(domain: string, clientIp: string, usage: ToolUsage) {
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
  const keywordResult = await rankedKeywords(domain, 15, usage);
  let competitors: Array<{ domain: string; verified?: boolean }> = [];
  try {
    const found = await findCompetitors(domain, clientIp, usage);
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

async function checkAiVisibility(companyInput: unknown, industryInput: unknown, clientIp: string, usage: ToolUsage, meteredAccount: boolean) {
  const company = cleanCompany(companyInput);
  const industry = cleanIndustry(industryInput);
  const costJson = Deno.env.get("FREE_SPEND_COSTS_JSON");

  usage.dispatched = true;
  const validation = await callFunction("validate-company", { company, industry }, clientIp);
  if (validation?.spendCapReached) throw new SpendCapError();
  if (validation?.needsContext || validation?.isAmbiguous || validation?.canProceed === false) {
    if (!meteredAccount) {
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
      const data = await callFunction(slug, { company: resolved, industry }, clientIp);
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
    throw new Error("The models are unavailable right now. Try again in a minute.");
  }

  const summary = await summarizeVisibilityWithNormalization({ company: resolved, models }, async (names) => {
    const normalized = await callFunction("normalize-competitors", { competitors: names, targetCompany: resolved }, clientIp);
    return normalized?.spendCapReached ? undefined : normalized?.nameMapping;
  });
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

async function callTool(name: McpToolName, args: Record<string, unknown>, clientIp: string, usage: ToolUsage, meteredAccount: boolean): Promise<Record<string, unknown>> {
  switch (name) {
    case "check_ai_visibility":
      return await checkAiVisibility(args.company, args.industry, clientIp, usage, meteredAccount);
    case "find_competitors": {
      const domain = normalizeDomain(String(args.domain || ""));
      assertPublicDomain(domain);
      const found = await findCompetitors(domain, clientIp, usage);
      return { ...found, domain };
    }
    case "ranked_keywords": {
      const domain = normalizeDomain(String(args.domain || ""));
      assertPublicDomain(domain);
      const ranked = await rankedKeywords(domain, boundedKeywordLimit(args.limit), usage);
      return { domain, ...ranked };
    }
    case "generate_llms_txt": {
      const domain = normalizeDomain(String(args.domain || ""));
      assertPublicDomain(domain);
      const generated = await generateLlmsTxt(domain, clientIp, usage);
      return { domain, ...generated };
    }
    default: {
      const unknown: never = name;
      throw new Error(`Unknown tool ${unknown}`);
    }
  }
}

type AccountReservation = { status: "free" | "paid"; reservationId: string; holdMicrousd: number };
type AccountReplay = { status: "duplicate"; reservationId: string; settledMicrousd: number | null; released: boolean; mode: "free" | "paid" };
type AccountAdmission = AccountReservation | AccountReplay | {
  status: "insufficient" | "input_rejected" | "subsidy_exhausted" | "rate_limited" | "billing_unavailable" | "unavailable";
};

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, sortedJson(item)]));
  }
  return value;
}

const RETRY_ID = /^[a-z0-9_.:-]{8,128}$/i;

/** Used after account authentication, solely as input to the private idempotency hash. */
async function accountCredentialScope(req: Request, userId: string): Promise<string> {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") || "")?.[1] || "";
  if (token.startsWith("smcp_")) return await sha256(`mcp-credential:${token}`);
  try {
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof claims.session_id === "string" && RETRY_ID.test(claims.session_id)) return `session:${claims.session_id}`;
    if (typeof claims.client_id === "string" && RETRY_ID.test(claims.client_id)) return `client:${claims.client_id}`;
  } catch {
    // Some verified JWT deployments omit session metadata.
  }
  return `account:${userId}`;
}

async function accountRequestKey(req: Request, account: Extract<McpIdentity, { kind: "account" }>, id: unknown, name: McpToolName, args: Record<string, unknown>) {
  const supplied = req.headers.get("Idempotency-Key");
  const inputHash = await sha256(JSON.stringify([name, sortedJson(args)]));
  if (supplied !== null) {
    if (!RETRY_ID.test(supplied)) return null;
    return { key: await sha256(JSON.stringify(["explicit", account.credential, supplied])), inputHash };
  }
  const scope = await accountCredentialScope(req, account.userId);
  return { key: await sha256(JSON.stringify(["implicit", scope, id, inputHash])), inputHash };
}

function accountPaidHold(name: McpToolName, args: Record<string, unknown>): number {
  // DataForSEO Labs Google Live lists $0.012 per task plus $0.00012 per item.
  // The call sites use one task per domain and request at most 50 items or five competitors.
  const oneTask = 12_000;
  const oneItem = 120;
  const competitors = 5 * (oneTask + oneItem);
  switch (name) {
    case "ranked_keywords": return oneTask + oneItem * boundedKeywordLimit(args.limit);
    case "find_competitors": return competitors;
    case "generate_llms_txt": return competitors + oneTask + oneItem * 15;
    case "check_ai_visibility": return 0;
  }
}

async function admitAccountCall(
  req: Request,
  account: Extract<McpIdentity, { kind: "account" }>,
  id: unknown,
  name: McpToolName,
  args: Record<string, unknown>,
  freeEstimateUsd: number,
): Promise<AccountAdmission> {
  try {
    const supabase = serviceClient();
    if (!supabase) return { status: "unavailable" };
    const request = await accountRequestKey(req, account, id, name, args);
    if (!request) return { status: "input_rejected" };
    const paidEnabled = account.credential === "personal_key" && Deno.env.get("MCP_ENABLE_PAID_TOOLS") !== "false";
    const holdMicrousd = paidEnabled ? accountPaidHold(name, args) : 0;
    const paidSubsidyMicrousd = paidEnabled && name !== "ranked_keywords"
      ? Math.ceil((freeEstimateUsd - accountPaidHold(name, args) / 1_000_000) * 1_000_000)
      : 0;
    const parameters = {
      p_user_id: account.userId,
      p_request_key: request.key,
      p_input_hash: request.inputHash,
      p_ip_hash: await sha256(platformIp(req)),
      p_free_max_microusd: Math.ceil(freeEstimateUsd * 1_000_000),
      p_max_microusd: holdMicrousd,
      p_paid_subsidy_microusd: paidSubsidyMicrousd,
      p_daily_cap_microusd: Math.floor(dailySpendCapUsd() * 1_000_000),
    };
    const { data, error } = await supabase.rpc("reserve_mcp_account_call", parameters);
    if (error) return { status: "unavailable" };
    switch (data?.status) {
      case "free":
      case "paid":
        if (data.status === "paid" && (!paidEnabled || (holdMicrousd <= 0 && paidSubsidyMicrousd <= 0))) {
          return { status: "billing_unavailable" };
        }
        return typeof data.reservation_id === "string"
          ? { status: data.status, reservationId: data.reservation_id, holdMicrousd }
          : { status: "unavailable" };
      case "duplicate": {
        if (typeof data.reservation_id !== "string" || (data.mode !== "free" && data.mode !== "paid")) {
          return { status: "unavailable" };
        }
        let receipt = data;
        if (receipt.settled_microusd == null) {
          try {
            const { data: reconciled } = await supabase.rpc("reconcile_mcp_account_call", { p_reservation_id: data.reservation_id });
            if (reconciled === true) {
              const { data: current } = await supabase.rpc("reserve_mcp_account_call", parameters);
              if (current?.status === "duplicate" && current.reservation_id === data.reservation_id) receipt = current;
            }
          } catch {
            // Keep returning the owned receipt if the ledger is temporarily unavailable.
          }
        }
        return {
          status: "duplicate",
          reservationId: data.reservation_id,
          mode: data.mode,
          settledMicrousd: Number.isSafeInteger(receipt.settled_microusd) ? receipt.settled_microusd : null,
          released: receipt.released === true,
        };
      }
      case "insufficient":
      case "input_rejected":
      case "subsidy_exhausted":
      case "rate_limited":
      case "billing_unavailable":
        return { status: data.status };
      default:
        return { status: "unavailable" };
    }
  } catch {
    return { status: "unavailable" };
  }
}

async function settleAccountCall(reservation: AccountReservation, actualMicrousd: number | null, succeeded: boolean) {
  const supabase = serviceClient();
  if (!supabase) return false;
  const parameters = {
    p_reservation_id: reservation.reservationId,
    p_actual_microusd: actualMicrousd,
    p_succeeded: succeeded,
  };

  async function attempt(fn: "record_mcp_account_settlement" | "settle_mcp_account_call") {
    try {
      const client = supabase;
      if (!client) return false;
      const { data, error } = await client.rpc(fn, parameters);
      return !error && data === true;
    } catch {
      return false;
    }
  }

  // A checkpoint lets duplicate requests recover settlement without dispatching providers again.
  if (!(await attempt("record_mcp_account_settlement"))) await attempt("record_mcp_account_settlement");
  return await attempt("settle_mcp_account_call") || await attempt("settle_mcp_account_call");
}

function pendingBillingResult(reservationId: string) {
  return {
    ...toolErrorResult(`SearchMaster is still reconciling this request. Reference ${reservationId}.`),
    structuredContent: { billing_status: "pending", request_reference: reservationId },
  };
}

function replayBillingResult(replay: AccountReplay) {
  if (replay.settledMicrousd === null) return pendingBillingResult(replay.reservationId);
  const chargedUsd = replay.mode === "paid" ? replay.settledMicrousd / 1_000_000 : 0;
  const state = replay.released ? "released" : "completed";
  const message = replay.released
    ? "This call ended before billable work. Use a new request ID for a fresh call."
    : "SearchMaster already processed this request. Use a new request ID for a fresh call.";
  return {
    ...toolErrorResult(`${message} Charge $${chargedUsd}. Reference ${replay.reservationId}.`),
    structuredContent: { billing_status: state, charged_usd: chargedUsd, request_reference: replay.reservationId },
  };
}

async function executeTool(id: unknown, name: string, args: Record<string, unknown>, req: Request, modern: boolean): Promise<Response> {
  const resultResponse = (result: Record<string, unknown>) => rpcResult(id, formatMcpResult(result, modern));
  if (!isMcpToolName(name)) {
    return resultResponse(toolErrorResult(`Unknown tool: ${name}`));
  }
  const identity = await resolveMcpIdentity(req.headers.get("Authorization"), {
    publicProjectToken: Deno.env.get("SUPABASE_ANON_KEY"),
    verifySession: () => verifiedSessionUserId(req),
    resolvePersonalKey: async (token) => {
      const supabase = serviceClient();
      if (!supabase) throw new Error("MCP key store unavailable");
      const { data, error } = await supabase.rpc("resolve_mcp_personal_key", { p_token: token });
      if (error) throw new Error("MCP key store unavailable");
      return typeof data === "string" ? data : null;
    },
  });
  if (identity.kind === "invalid") {
    return json({
      jsonrpc: "2.0", id,
      error: { code: -32600, message: "Invalid or revoked SearchMaster credential" },
    }, 401, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
  }
  if (identity.kind === "unavailable") {
    return json({
      jsonrpc: "2.0", id,
      error: { code: -32603, message: "SearchMaster authentication is temporarily unavailable" },
    }, 503);
  }
  const usage: ToolUsage = { costs: [], dispatched: false };
  const estimate = name === "check_ai_visibility"
    ? visibilityRunCostUsd(Deno.env.get("FREE_SPEND_COSTS_JSON"))
    : endpointCostUsd(name);
  const vendorBoundUsd = accountPaidHold(name, args) / 1_000_000;
  const freeEstimateUsd = name === "ranked_keywords"
    ? Math.max(estimate, vendorBoundUsd) : estimate + vendorBoundUsd;
  let reservation: AccountReservation | undefined;
  let trial: { clientKey: string; ipHash: string } | undefined;
  let anonymousReserved = false;

  try {
    if (!Number.isFinite(freeEstimateUsd) || freeEstimateUsd <= 0) {
      return resultResponse(toolErrorResult("SearchMaster usage accounting is temporarily unavailable"));
    }
    if (identity.kind === "account") {
      const admission = await admitAccountCall(req, identity, id, name, args, freeEstimateUsd);
      if (admission.status === "duplicate") return resultResponse(replayBillingResult(admission));
      if (admission.status !== "free" && admission.status !== "paid") {
        const messages = {
          input_rejected: "Use a valid retry identifier with the original tool inputs.",
          insufficient: identity.credential === "session"
            ? "This session has no free calls left. Use a SearchMaster personal MCP key for prepaid calls."
            : "No free calls or eligible prepaid balance are available for this request.",
          rate_limited: "The SearchMaster daily request limit was reached.",
          subsidy_exhausted: SPEND_CAP_MESSAGE,
          billing_unavailable: "SearchMaster prepaid billing is temporarily unavailable.",
          unavailable: "SearchMaster usage accounting is temporarily unavailable",
        };
        return resultResponse(toolErrorResult(messages[admission.status]));
      }
      reservation = admission;
    } else {
      const admitted = await reserveTrial(req);
      if ("error" in admitted) return resultResponse(toolErrorResult(admitted.error));
      trial = admitted;
      const decision = await reserveFreeDailySpend(freeEstimateUsd);
      if (!decision.allowed || decision.skipped) throw new SpendCapError();
      anonymousReserved = true;
    }

    const payload = await callTool(name, args, platformIp(req), usage, Boolean(reservation));
    const cost = addDataForSeoCosts(usage.costs);
    let chargedMicrousd = 0;
    if (reservation) {
      const paid = reservation.status === "paid";
      if (!cost.complete) return resultResponse(pendingBillingResult(reservation.reservationId));
      const measured = paid ? measuredMicrousd(cost.usd) : null;
      const settled = await settleAccountCall(reservation, measured, true);
      if (!settled) return resultResponse(pendingBillingResult(reservation.reservationId));
      if (measured !== null) chargedMicrousd = Math.min(measured, reservation.holdMicrousd);
    } else if (trial) {
      if (name === "ranked_keywords" && cost.complete && cost.usd < freeEstimateUsd) {
        await refundFreeDailySpend(freeEstimateUsd - cost.usd);
      }
      await recordCost(trial.clientKey, cost.usd);
    }
    const reference = reservation ? { request_reference: reservation.reservationId } : {};
    if (name === "check_ai_visibility") return resultResponse(toolTextResult({ ...payload, ...reference }));
    return resultResponse(toolTextResult({
      ...payload,
      ...reference,
      ...(name === "generate_llms_txt" ? { cost: cost.usd } : {}),
      ...pricing(cost, reservation?.status === "paid"),
      charged_usd: chargedMicrousd / 1_000_000,
    }));
  } catch (error) {
    const cost = addDataForSeoCosts(usage.costs);
    let receipt: Record<string, unknown> | undefined;
    if (reservation) {
      if (usage.dispatched && !cost.complete) return resultResponse(pendingBillingResult(reservation.reservationId));
      const actual = usage.dispatched && reservation.status === "paid" ? measuredMicrousd(cost.usd) : null;
      if (!(await settleAccountCall(reservation, actual, usage.dispatched))) {
        return resultResponse(pendingBillingResult(reservation.reservationId));
      }
      receipt = {
        billing_status: usage.dispatched ? "completed" : "released",
        charged_usd: Math.min(actual ?? 0, reservation.holdMicrousd) / 1_000_000,
        request_reference: reservation.reservationId,
      };
    } else if (trial && !usage.dispatched) {
      if (anonymousReserved) await refundFreeDailySpend(freeEstimateUsd);
      await refundTrial(trial.clientKey, trial.ipHash);
    }
    const message = error instanceof SpendCapError
      ? SPEND_CAP_MESSAGE
      : error instanceof Error
        ? error.message
        : "Tool failed";
    return resultResponse({ ...toolErrorResult(message), ...(receipt ? { structuredContent: receipt } : {}) });
  }
}

export async function handleSearchMasterMcp(req: Request, providedBody?: unknown): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "DELETE" && req.headers.get("MCP-Protocol-Version") !== MODERN_PROTOCOL_VERSION) {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  if (req.method === "GET") {
    if (req.headers.get("MCP-Protocol-Version") === MODERN_PROTOCOL_VERSION || wantsEventStream(req.headers.get("accept"))) {
      return json(
        { error: "SSE streams are not supported. POST a JSON-RPC message instead." },
        405,
        { Allow: "POST" },
      );
    }
    if (url.pathname.endsWith("openapi.json")) return json(openApiDocument());
    return json(serverCard(dailySpendCapUsd()));
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });

  const origin = req.headers.get("Origin");
  const configuredOrigins = (Deno.env.get("MCP_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigins = ["https://searchmaster.app", "https://www.searchmaster.app", ...configuredOrigins];
  if (origin !== null && origin !== url.origin && !allowedOrigins.includes(origin)) {
    return json({ error: "Origin is not allowed" }, 403);
  }
  const routed = routeMcpRequest(providedBody, req.headers);
  switch (routed.type) {
    case "notification":
      return new Response(null, { status: 202, headers: corsHeaders });
    case "result": {
      const initializing = (providedBody as { method?: string }).method === "initialize";
      return rpcResult(routed.id, routed.result, initializing ? { "Mcp-Session-Id": crypto.randomUUID() } : {});
    }
    case "error":
      return rpcError(routed.id, routed.message, routed.code, routed.status, routed.data);
    case "tool":
      return await executeTool(routed.id, routed.name, routed.args, req, isModernRequest(providedBody, req.headers));
    default: {
      const unknown: never = routed;
      return rpcError(null, `Method not found: ${String(unknown)}`);
    }
  }
}

export { MCP_PUBLIC_URL };
