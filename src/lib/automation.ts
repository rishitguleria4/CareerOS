import type { Profile } from "./types";

export type MatchQuality = "best" | "strong" | "broad";

export interface MatchPreset {
  label: string;
  description: string;
  tiers: ("S" | "A" | "B" | "C")[];
  minScore: number;
  /** When true, only roles where India eligibility is confirmed ("yes") or likely qualify. */
  requireEligible: boolean;
}

export const MATCH_PRESETS: Record<MatchQuality, MatchPreset> = {
  best: {
    label: "Best fit",
    description: "S and A tier only, India eligibility confirmed or likely, fit score 75+.",
    tiers: ["S", "A"],
    minScore: 75,
    requireEligible: true,
  },
  strong: {
    label: "Strong",
    description: "S and A tier, fit score 70+, including roles where eligibility is unclear.",
    tiers: ["S", "A"],
    minScore: 70,
    requireEligible: false,
  },
  broad: {
    label: "Broad",
    description: "S, A and B tier, fit score 55+. More volume, more manual review.",
    tiers: ["S", "A", "B"],
    minScore: 55,
    requireEligible: false,
  },
};

export const LIMITS = { apps: { min: 0, max: 25 }, outreach: { min: 0, max: 15 } } as const;

export interface AutomationSettings {
  appsPerRun: number;
  outreachPerRun: number;
  quality: MatchQuality;
  preset: MatchPreset;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

export function automationSettings(p: Partial<Profile>): AutomationSettings {
  const quality: MatchQuality = p.matchQuality && p.matchQuality in MATCH_PRESETS ? p.matchQuality : "best";
  return {
    appsPerRun: clamp(Number(p.prepAppsPerRun ?? 5), LIMITS.apps.min, LIMITS.apps.max),
    outreachPerRun: clamp(Number(p.prepOutreachPerRun ?? 3), LIMITS.outreach.min, LIMITS.outreach.max),
    quality,
    preset: MATCH_PRESETS[quality],
  };
}

export function clampApps(n: number) {
  return clamp(Number.isFinite(n) ? n : 5, LIMITS.apps.min, LIMITS.apps.max);
}
export function clampOutreach(n: number) {
  return clamp(Number.isFinite(n) ? n : 3, LIMITS.outreach.min, LIMITS.outreach.max);
}

/**
 * SQL fragments (alias `o` = opportunities) that rank roles best-fit first:
 * tier S → A → B, then confirmed India eligibility → likely → unclear, then fit score.
 * Built only from the fixed presets above, never from user input.
 */
export const BEST_FIT_ORDER = `
  CASE o.tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
  CASE o.fit->'remote'->>'indiaEligible' WHEN 'yes' THEN 0 WHEN 'likely' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END,
  o.score DESC NULLS LAST`;

export function qualifyingWhere(preset: MatchPreset): string {
  const tiers = preset.tiers.map((t) => `'${t}'`).join(",");
  const parts = [`o.tier IN (${tiers})`, `COALESCE(o.score, 0) >= ${Number(preset.minScore)}`];
  if (preset.requireEligible) parts.push(`o.fit->'remote'->>'indiaEligible' IN ('yes','likely')`);
  return parts.join(" AND ");
}
