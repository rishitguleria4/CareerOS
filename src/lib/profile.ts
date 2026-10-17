import { query, queryOne } from "./db";
import type { Profile, Source } from "./types";

export const DEFAULT_PROFILE: Profile = {
  name: "",
  email: "",
  phone: "",
  location: "India",
  timezone: "IST (UTC+5:30)",
  github: "",
  linkedin: "",
  portfolio: "",
  headline: "AI / Backend Engineer",
  summary: "",
  targetRoles: [
    "AI Engineer",
    "Backend Engineer",
    "AI Full-Stack Engineer",
    "Python Engineer",
    "Software Engineer",
    "Founding Engineer",
    "AI Product Engineer",
  ],
  skills: [],
  projects: [],
  education: [],
  experience: [],
  achievements: [],
  workAuth: "Based in India. Available for remote / contract work worldwide.",
  yearsExperience: 0,
  minSalaryUsdMonthly: 2500,
  answers: [
    { q: "Are you authorized to work in the US?", a: "I am based in India and work as a remote contractor; I do not require sponsorship for contract work." },
    { q: "Notice period / earliest start date", a: "" },
    { q: "Expected salary", a: "" },
  ],
  resumeText: "",
};

export async function getProfile(): Promise<Profile> {
  const row = await queryOne<{ data: Partial<Profile> }>("SELECT data FROM profile WHERE id = 1");
  return { ...DEFAULT_PROFILE, ...(row?.data ?? {}) };
}

export async function saveProfile(p: Profile): Promise<void> {
  await query(
    `INSERT INTO profile (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [JSON.stringify(p)]
  );
}

/** Starter boards. Unknown/dead slugs are skipped harmlessly; edit under Profile → Sources. */
export const STARTER_SOURCES: { kind: string; slug: string }[] = [
  { kind: "feed", slug: "weworkremotely" },
  { kind: "feed", slug: "remoteok" },
  { kind: "feed", slug: "remotive" },
  { kind: "ashby", slug: "openai" },
  { kind: "ashby", slug: "ramp" },
  { kind: "ashby", slug: "linear" },
  { kind: "ashby", slug: "supabase" },
  { kind: "ashby", slug: "replit" },
  { kind: "ashby", slug: "cohere" },
  { kind: "ashby", slug: "elevenlabs" },
  { kind: "ashby", slug: "modal" },
  { kind: "ashby", slug: "pinecone" },
  { kind: "ashby", slug: "posthog" },
  { kind: "ashby", slug: "langchain" },
  { kind: "ashby", slug: "clickhouse" },
  { kind: "ashby", slug: "vanta" },
  { kind: "greenhouse", slug: "anthropic" },
  { kind: "greenhouse", slug: "vercel" },
  { kind: "greenhouse", slug: "gitlab" },
  { kind: "greenhouse", slug: "scaleai" },
  { kind: "greenhouse", slug: "brex" },
  { kind: "greenhouse", slug: "figma" },
  { kind: "lever", slug: "palantir" },
  { kind: "lever", slug: "wealthsimple" },
];

export async function getSources(): Promise<Source[]> {
  const n = await queryOne<{ c: number }>("SELECT COUNT(*)::int AS c FROM sources");
  if (!n || n.c === 0) {
    for (const s of STARTER_SOURCES)
      await query("INSERT INTO sources (kind, slug, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [
        s.kind,
        s.slug,
        s.slug,
      ]);
  }
  return query<Source>("SELECT * FROM sources ORDER BY kind, slug");
}
