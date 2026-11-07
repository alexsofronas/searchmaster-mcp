export const VISIBILITY_MODELS = ["chatgpt", "claude", "gemini", "grok", "perplexity"] as const;

export type VisibilityModelId = (typeof VISIBILITY_MODELS)[number];

export type VisibilityCompany = {
  name: string;
  ranking: number;
};

export type VisibilityModelResult = {
  model: VisibilityModelId;
  success: boolean;
  companies?: VisibilityCompany[];
  errorMessage?: string;
  spendCapReached?: boolean;
};

export type VisibilityCompetitor = {
  name: string;
  average_rank: number;
  appearances: number;
  ranks: Partial<Record<VisibilityModelId, number>>;
};

export type VisibilitySummary = {
  company: string;
  summary: string;
  average_rank: number | null;
  models_checked: VisibilityModelId[];
  models_with_ranks: VisibilityModelId[];
  spend_cap_reached: boolean;
  unavailable: boolean;
  company_ranks: Partial<Record<VisibilityModelId, number | null>>;
  competitors: VisibilityCompetitor[];
};

const LEGAL_SUFFIX_PATTERN = /[\s,]+(incorporated|inc|llc|l\.l\.c|corp|corporation|company|co|ltd|limited|plc|gmbh|sa|s\.a|ag|nv|bv|oy|ab|pty|holdings|group)\.?$/i;

const MODEL_LABELS: Record<VisibilityModelId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  perplexity: "Perplexity",
};

export function canonicalCompanyKey(name: string): string {
  let key = (name || "").toLowerCase().trim().replace(/[.,]+$/g, "");
  let previous = "";
  while (key !== previous) {
    previous = key;
    key = key.replace(LEGAL_SUFFIX_PATTERN, "").trim();
  }
  return key.replace(/\s+/g, " ");
}

export function companyNamesMatch(a: string, b: string): boolean {
  const left = (a || "").toLowerCase().trim();
  const right = (b || "").toLowerCase().trim();
  if (!left || !right) return false;
  if (left === right) return true;

  const leftKey = canonicalCompanyKey(a);
  const rightKey = canonicalCompanyKey(b);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;

  const wordBoundary = (haystack: string, needle: string) =>
    new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`).test(haystack);

  return wordBoundary(leftKey, rightKey) || wordBoundary(rightKey, leftKey);
}

/** Unique names, capped at the normalize-competitors schema limit of 20. */
export function collectNormalizationNames(models: VisibilityModelResult[], limit = 20): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const model of models) {
    if (!model.success) continue;
    for (const entry of model.companies || []) {
      const name = entry?.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
      if (names.length >= limit) return names;
    }
  }
  return names;
}

export function applyNameMapping(name: string, nameMapping: Record<string, string> | null | undefined): string {
  if (!name || !nameMapping) return name;
  const direct = nameMapping[name.toLowerCase().trim()];
  if (direct) return direct;

  const targetKey = canonicalCompanyKey(name);
  if (!targetKey) return name;

  for (const [alias, canonical] of Object.entries(nameMapping)) {
    if (canonicalCompanyKey(alias) === targetKey) return canonical;
  }
  return name;
}

function roundRank(value: number): number {
  return Math.round(value * 10) / 10;
}

function rankFor(companies: VisibilityCompany[] | undefined, target: string, nameMapping: Record<string, string>): number | null {
  if (!companies) return null;
  for (const company of companies) {
    if (!company || typeof company.name !== "string" || typeof company.ranking !== "number") continue;
    const mapped = applyNameMapping(company.name, nameMapping);
    if (companyNamesMatch(mapped, target) || companyNamesMatch(company.name, target)) {
      return company.ranking;
    }
  }
  return null;
}

export function summarizeVisibility(input: {
  company: string;
  models: VisibilityModelResult[];
  nameMapping?: Record<string, string> | null;
  competitorLimit?: number;
}): VisibilitySummary {
  const nameMapping = input.nameMapping || {};
  const company = applyNameMapping(input.company, nameMapping) || input.company;
  const limit = input.competitorLimit ?? 8;
  const companyRanks: Partial<Record<VisibilityModelId, number | null>> = {};
  const buckets = new Map<string, { name: string; ranks: Partial<Record<VisibilityModelId, number>> }>();

  for (const model of input.models) {
    companyRanks[model.model] = model.success ? rankFor(model.companies, company, nameMapping) : null;
    for (const entry of model.companies || []) {
      if (!entry || typeof entry.name !== "string" || typeof entry.ranking !== "number") continue;
      const mapped = applyNameMapping(entry.name, nameMapping);
      if (companyNamesMatch(mapped, company)) continue;
      const key = canonicalCompanyKey(mapped) || mapped.toLowerCase();
      const bucket = buckets.get(key) || { name: mapped, ranks: {} };
      bucket.ranks[model.model] = entry.ranking;
      buckets.set(key, bucket);
    }
  }

  const ownRanks = Object.values(companyRanks).filter((rank): rank is number => typeof rank === "number");
  const averageRank = ownRanks.length
    ? roundRank(ownRanks.reduce((sum, rank) => sum + rank, 0) / ownRanks.length)
    : null;

  const competitors = Array.from(buckets.values())
    .map((bucket) => {
      const values = Object.values(bucket.ranks);
      return {
        name: bucket.name,
        average_rank: roundRank(values.reduce((sum, rank) => sum + rank, 0) / values.length),
        appearances: values.length,
        ranks: bucket.ranks,
      };
    })
    .sort((a, b) => a.average_rank - b.average_rank || b.appearances - a.appearances || a.name.localeCompare(b.name))
    .slice(0, limit);

  const modelsWithRanks = input.models
    .filter((model) => typeof companyRanks[model.model] === "number")
    .map((model) => model.model);
  const answered = input.models.some((model) => model.success);
  const spendCapReached = input.models.length > 0 && input.models.every((model) => model.spendCapReached) && !answered;
  const unavailable = input.models.length > 0 && !answered && !spendCapReached;

  const closest = competitors.slice(0, 3).map((item) => `${item.name} (${item.average_rank})`).join(", ");
  let summary: string;
  if (spendCapReached) {
    summary = "Free checks are used up for today. Connect SearchMaster to keep going.";
  } else if (unavailable) {
    summary = "The models are unavailable right now. Try again in a minute.";
  } else if (averageRank == null) {
    summary = `${company} did not receive a rank from the models that answered.`;
  } else if (closest) {
    summary = `${company} averages rank ${averageRank} across ${modelsWithRanks.map((model) => MODEL_LABELS[model]).join(", ")}. Closest competitors: ${closest}.`;
  } else {
    summary = `${company} averages rank ${averageRank} across ${modelsWithRanks.map((model) => MODEL_LABELS[model]).join(", ")}.`;
  }

  return {
    company,
    summary,
    average_rank: averageRank,
    models_checked: input.models.map((model) => model.model),
    models_with_ranks: modelsWithRanks,
    spend_cap_reached: spendCapReached,
    unavailable,
    company_ranks: companyRanks,
    competitors,
  };
}
