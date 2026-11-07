export const SPEND_CAP_MESSAGE =
  "Free checks are used up for today. Connect SearchMaster to keep going.";

export const DEFAULT_DAILY_SPEND_CAP_USD = 5;

/**
 * Estimated provider cost for one free/anonymous call.
 * FREE_DAILY_SPEND_CAP_USD overrides the daily total.
 * FREE_SPEND_COSTS_JSON overrides individual amounts, for example {"homepage-chatgpt":0.02}.
 */
export const DEFAULT_CALL_COSTS_USD: Record<string, number> = {
  "validate-company": 0.008,
  "normalize-competitors": 0.012,
  "homepage-chatgpt": 0.015,
  "homepage-claude": 0.02,
  "homepage-gemini": 0.015,
  "grok-competitive-analysis": 0.02,
  "perplexity-competitive-analysis": 0.06,
  find_competitors: 0.04,
  ranked_keywords: 0.05,
  generate_llms_txt: 0.1,
};

export class SpendCapError extends Error {
  readonly spendCapReached = true;

  constructor(message: string = SPEND_CAP_MESSAGE) {
    super(message);
    this.name = "SpendCapError";
  }
}

/** Paid provider work already happened, so the daily ledger charge stays. */
export class SettledSpendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettledSpendError";
  }
}

export function resolveDailySpendCapUsd(raw: string | undefined | null): number {
  if (raw == null || raw.trim() === "") return DEFAULT_DAILY_SPEND_CAP_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DAILY_SPEND_CAP_USD;
  return value;
}

export function resolveCallCostUsd(endpoint: string, rawJson: string | undefined | null): number {
  const fallback = DEFAULT_CALL_COSTS_USD[endpoint] ?? 0.02;
  if (!rawJson || !rawJson.trim()) return fallback;
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const override = parsed[endpoint];
    if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
      return override;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function spendWouldExceed(spentUsd: number, amountUsd: number, capUsd: number): boolean {
  if (!(amountUsd > 0)) return false;
  return spentUsd + amountUsd > capUsd + 1e-9;
}

export const VISIBILITY_SPEND_ENDPOINTS = [
  "validate-company",
  "homepage-chatgpt",
  "homepage-claude",
  "homepage-gemini",
  "grok-competitive-analysis",
  "perplexity-competitive-analysis",
  "normalize-competitors",
] as const;

export function visibilityRunCostUsd(rawJson: string | undefined | null): number {
  return VISIBILITY_SPEND_ENDPOINTS.reduce(
    (sum, endpoint) => sum + resolveCallCostUsd(endpoint, rawJson),
    0,
  );
}
