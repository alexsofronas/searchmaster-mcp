export interface DataForSeoCost {
  usd: number;
  complete: boolean;
}

export const NO_DATAFORSEO_COST: DataForSeoCost = { usd: 0, complete: true };
export const UNKNOWN_DATAFORSEO_COST: DataForSeoCost = { usd: 0, complete: false };

function validCost(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function addDataForSeoCosts(costs: DataForSeoCost[]): DataForSeoCost {
  return {
    usd: costs.reduce((sum, cost) => sum + cost.usd, 0),
    complete: costs.every((cost) => cost.complete),
  };
}

// DataForSEO reports a response-level total, even when an individual task fails.
export function readDataForSeoCost(payload: unknown): DataForSeoCost {
  if (!payload || typeof payload !== "object") return UNKNOWN_DATAFORSEO_COST;
  const body = payload as { cost?: unknown; tasks?: Array<{ cost?: unknown } | null> };
  if (validCost(body.cost)) return { usd: body.cost, complete: true };
  if (!Array.isArray(body.tasks) || body.tasks.length === 0) return UNKNOWN_DATAFORSEO_COST;
  return addDataForSeoCosts(body.tasks.map((task) => validCost(task?.cost)
    ? { usd: task.cost, complete: true }
    : UNKNOWN_DATAFORSEO_COST));
}

export function readCompetitorDataForSeoCost(payload: unknown): DataForSeoCost {
  if (!payload || typeof payload !== "object") return UNKNOWN_DATAFORSEO_COST;
  const body = payload as { dataforseo_cost_usd?: unknown; dataforseo_cost_complete?: unknown };
  if (!validCost(body.dataforseo_cost_usd)) return UNKNOWN_DATAFORSEO_COST;
  return { usd: body.dataforseo_cost_usd, complete: body.dataforseo_cost_complete === true };
}

export function measuredMicrousd(usd: number): number {
  if (!validCost(usd)) return 0;
  return Math.floor(usd * 1_000_000);
}
