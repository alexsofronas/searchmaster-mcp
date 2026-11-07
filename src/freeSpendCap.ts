import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import {
  SPEND_CAP_MESSAGE,
  resolveCallCostUsd,
  resolveDailySpendCapUsd,
} from "./spendPolicy.ts";

export { SPEND_CAP_MESSAGE };

type SpendDecision = { allowed: boolean; skipped?: boolean };

function spendClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function ledgerMissing(error: { message?: string; code?: string } | null): boolean {
  const message = (error?.message || "").toLowerCase();
  return message.includes("does not exist") || message.includes("could not find") || error?.code === "PGRST202";
}

function bearerToken(req: Request): string {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}

function tokensMatch(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function isServiceRoleRequest(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return tokensMatch(serviceKey, bearerToken(req));
}

const verifiedUserIds = new WeakMap<Request, Promise<string | null>>();

/**
 * A bearer token grants a spend-cap exemption only after GoTrue accepts it.
 * Decoding the payload is not enough: verify_jwt is off on the MCP host,
 * so an unsigned token can claim role "authenticated".
 */
export function verifiedSessionUserId(req: Request): Promise<string | null> {
  const cached = verifiedUserIds.get(req);
  if (cached) return cached;
  const pending = lookupVerifiedUserId(req);
  verifiedUserIds.set(req, pending);
  return pending;
}

async function lookupVerifiedUserId(req: Request): Promise<string | null> {
  if (isServiceRoleRequest(req)) return null;
  const token = bearerToken(req);
  if (token.split(".").length !== 3) return null;
  const supabase = spendClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id || data.user.id.length <= 8) return null;
  return data.user.id;
}

/** Direct public calls. Internal MCP calls use the service role and are capped by the caller. */
export async function isAnonymousFreeRequest(req: Request): Promise<boolean> {
  if (isServiceRoleRequest(req)) return false;
  const userId = await verifiedSessionUserId(req);
  return !userId;
}

export function dailySpendCapUsd(): number {
  return resolveDailySpendCapUsd(Deno.env.get("FREE_DAILY_SPEND_CAP_USD"));
}

export function endpointCostUsd(endpoint: string): number {
  return resolveCallCostUsd(endpoint, Deno.env.get("FREE_SPEND_COSTS_JSON"));
}

async function callSpendRpc(fn: "reserve_free_daily_spend" | "peek_free_daily_spend", amountUsd: number): Promise<SpendDecision> {
  if (!(amountUsd > 0)) return { allowed: true };
  const supabase = spendClient();
  if (!supabase) {
    console.warn("[spend-cap] Supabase is not configured; allowing the call");
    return { allowed: true, skipped: true };
  }
  const { data, error } = await supabase.rpc(fn, {
    p_amount: amountUsd,
    p_cap: dailySpendCapUsd(),
  });
  if (error) {
    if (ledgerMissing(error)) {
      console.warn("[spend-cap] Daily ledger is not installed yet; allowing the call");
    } else {
      console.error(`[spend-cap] ${fn} failed`, error.message);
    }
    return { allowed: true, skipped: true };
  }
  return { allowed: Boolean((data as { allowed?: boolean } | null)?.allowed) };
}

export function reserveFreeDailySpend(amountUsd: number): Promise<SpendDecision> {
  return callSpendRpc("reserve_free_daily_spend", amountUsd);
}

export function peekFreeDailySpend(amountUsd: number): Promise<SpendDecision> {
  return callSpendRpc("peek_free_daily_spend", amountUsd);
}

export async function refundFreeDailySpend(amountUsd: number): Promise<void> {
  if (!(amountUsd > 0)) return;
  const supabase = spendClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("refund_free_daily_spend", { p_amount: amountUsd });
  if (error && !ledgerMissing(error)) {
    console.error("[spend-cap] Refund failed", error.message);
  }
}

export async function spendCapBlockedResponse(
  req: Request,
  endpoint: string,
  corsHeaders: Record<string, string>,
  shape: "analysis" | "validation" | "normalize" | "competitors",
): Promise<Response | null> {
  if (!(await isAnonymousFreeRequest(req))) return null;
  const decision = await reserveFreeDailySpend(endpointCostUsd(endpoint));
  if (decision.allowed) return null;

  const body = shape === "validation"
    ? { valid: false, canProceed: false, reason: "spend_cap", message: SPEND_CAP_MESSAGE, spendCapReached: true }
    : shape === "normalize"
      ? { success: false, errorMessage: SPEND_CAP_MESSAGE, spendCapReached: true, normalized: [], nameMapping: {} }
      : shape === "competitors"
        ? { error: SPEND_CAP_MESSAGE, spendCapReached: true, competitors: [] }
        : { success: false, errorMessage: SPEND_CAP_MESSAGE, spendCapReached: true };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
