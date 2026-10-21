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
    label: "Best fit (India Remote)",
    description: "Tier S/A · 100% Remote & eligible from India · fit score 75+.",
    tiers: ["S", "A"],
    minScore: 75,
    requireEligible: true,
  },
  strong: {
    label: "Strong (India Remote)",
    description: "Tier S/A · 100% Remote & eligible from India · fit score 70+.",
    tiers: ["S", "A"],
    minScore: 70,
    requireEligible: true,
  },
  broad: {
    label: "Broad (India Remote)",
    description: "Tier S/A/B · 100% Remote & eligible from India · fit score 58+.",
    tiers: ["S", "A", "B"],
    minScore: 58,
    requireEligible: true,
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
 * tier S → A → B, then confirmed India eligibility → likely → regional outreach, then fit score.
 * Built only from the fixed presets above, never from user input.
 */
export const BEST_FIT_ORDER = `
  CASE o.tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
  CASE o.fit->'remote'->>'indiaEligible' WHEN 'yes' THEN 0 WHEN 'likely' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END,
  o.score DESC NULLS LAST`;

/**
 * Strict filter for direct Applications:
 * 100% Remote roles ONLY AND eligible from India ('yes' or 'likely').
 * Non-India remote roles ('OUTREACH ONLY') and on-site roles are strictly excluded.
 */
export function qualifyingWhere(preset: MatchPreset): string {
  const tiers = preset.tiers.map((t) => `'${t}'`).join(",");
  const parts = [
    `o.tier IN (${tiers})`,
    `COALESCE(o.score, 0) >= ${Number(preset.minScore)}`,
    `o.fit->'remote'->>'indiaEligible' IN ('yes','likely')`,
    `o.fit->'remote'->>'cls' IN ('india','worldwide','remote')`,
    `COALESCE(o.fit->>'action', '') <> 'OUTREACH ONLY'`,
  ];
  return parts.join(" AND ");
}

/**
 * Filter for Founder Outreach:
 * Targets (1) Remote roles that are NOT open to India right now (`action = 'OUTREACH ONLY'`, `cls = 'regional'`)
 * where cold-emailing the founder/CTO as an India remote contractor is the primary entry path, AND
 * (2) Top India-eligible remote startup roles (`APPLY + OUTREACH` / `OUTREACH FIRST`).
 */
export function outreachQualifyingWhere(preset: MatchPreset): string {
  const minOutreachScore = Math.max(60, Number(preset.minScore) - 10);
  return `(
    (o.fit->>'action' = 'OUTREACH ONLY' AND o.fit->'remote'->>'cls' = 'regional' AND o.tier IN ('S','A','B') AND COALESCE(o.score, 0) >= ${minOutreachScore})
    OR (${qualifyingWhere(preset)} AND o.fit->>'action' LIKE '%OUTREACH%')
  )`;
}
