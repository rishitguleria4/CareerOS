import { query, queryOne } from "./db";
import type { Profile, Source } from "./types";

export const DEFAULT_PROFILE: Profile = {
  name: "",
  email: "",
  phone: "",
  location: "India",
  timezone: "IST (UTC+5:30) · US/EU overlap",
  github: "",
  linkedin: "",
  portfolio: "",
  headline: "AI Full-Stack / Early-Stage Engineer",
  summary: "I build 0→1 AI products and production backend systems end-to-end.",
  targetRoles: [
    "Founding Engineer",
    "Early Engineer",
    "AI Product Engineer",
    "AI Full-Stack Engineer",
    "Backend + AI Engineer",
    "Product Engineer",
  ],
  skills: [
    "Python",
    "FastAPI",
    "PostgreSQL",
    "TypeScript",
    "React",
    "Next.js",
    "LLM",
    "RAG",
    "Docker",
  ],
  projects: [],
  education: [],
  experience: [],
  achievements: [],
  workAuth: "Based in India. Available for remote contractor / B2B roles with US & EU startups.",
  yearsExperience: 0,
  minSalaryUsdMonthly: 2500,
  targetSalaryUsdMonthly: 3000,
  idealSalaryUsdMonthly: 3500,
  upsideSalaryUsdMonthly: 5000,
  prepAppsPerRun: 5,
  prepOutreachPerRun: 3,
  matchQuality: "best",
  answers: [
    {
      q: "Are you authorized to work in the US / EU?",
      a: "I am based in India and work full-time as an international contractor (Deel / Rippling / direct B2B); no visa sponsorship required.",
    },
    { q: "Notice period / earliest start date", a: "Immediate" },
    { q: "Expected compensation", a: "$3,000–$3,500/month USD (flexible for high-upside founding roles)" },
  ],
  resumeText: "",
};

export async function getProfile(): Promise<Profile> {
  const row = await queryOne<{ data: Partial<Profile> }>("SELECT data FROM profile WHERE id = 1");
  const d = row?.data ?? {};
  const isLegacyHeadline = !d.headline || d.headline === "AI / Backend Engineer";
  return {
    ...DEFAULT_PROFILE,
    ...d,
    headline: isLegacyHeadline ? DEFAULT_PROFILE.headline : d.headline!,
    summary: d.summary?.trim() ? d.summary : DEFAULT_PROFILE.summary,
    skills: d.skills && d.skills.length > 0 ? d.skills : DEFAULT_PROFILE.skills,
    targetRoles: d.targetRoles && d.targetRoles.length > 0 ? d.targetRoles : DEFAULT_PROFILE.targetRoles,
    minSalaryUsdMonthly: d.minSalaryUsdMonthly || DEFAULT_PROFILE.minSalaryUsdMonthly,
    targetSalaryUsdMonthly: d.targetSalaryUsdMonthly || DEFAULT_PROFILE.targetSalaryUsdMonthly,
    idealSalaryUsdMonthly: d.idealSalaryUsdMonthly || DEFAULT_PROFILE.idealSalaryUsdMonthly,
    upsideSalaryUsdMonthly: d.upsideSalaryUsdMonthly || DEFAULT_PROFILE.upsideSalaryUsdMonthly,
  };
}

export async function saveProfile(p: Profile): Promise<void> {
  await query(
    `INSERT INTO profile (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [JSON.stringify(p)]
  );
}

/**
 * Multi-platform discovery roster:
 * 1) Low-traffic / high-signal founder channels (YC Jobs stream, HN "Who is hiring?")
 * 2) Global & EU/US remote startup aggregators (Himalayas, Arbeitnow EU, Jobicy, Working Nomads, WWR, RemoteOK, Remotive)
 * 3) Direct ATS boards (Ashby, Greenhouse, Lever, Workable) for 0→1 AI, LLM/RAG, Python/FastAPI, and TypeScript/Next.js startups
 */
export const STARTER_SOURCES: { kind: string; slug: string }[] = [
  // Independent Founder & Remote Startup Channels
  { kind: "feed", slug: "hn-whoishiring" },
  { kind: "feed", slug: "yc-jobs" },
  { kind: "feed", slug: "himalayas" },
  { kind: "feed", slug: "arbeitnow" },
  { kind: "feed", slug: "jobicy" },
  { kind: "feed", slug: "workingnomads" },
  { kind: "feed", slug: "weworkremotely" },
  { kind: "feed", slug: "remoteok" },
  { kind: "feed", slug: "remotive" },

  // Ashby — High-conviction AI, Agentic, RAG & Full-Stack Startups (US & EU)
  { kind: "ashby", slug: "langchain" },
  { kind: "ashby", slug: "langfuse" },
  { kind: "ashby", slug: "llamaindex" },
  { kind: "ashby", slug: "supabase" },
  { kind: "ashby", slug: "neon" },
  { kind: "ashby", slug: "resend" },
  { kind: "ashby", slug: "inngest" },
  { kind: "ashby", slug: "browserbase" },
  { kind: "ashby", slug: "e2b" },
  { kind: "ashby", slug: "exa" },
  { kind: "ashby", slug: "perplexity" },
  { kind: "ashby", slug: "elevenlabs" },
  { kind: "ashby", slug: "modal" },
  { kind: "ashby", slug: "baseten" },
  { kind: "ashby", slug: "replicate" },
  { kind: "ashby", slug: "cohere" },
  { kind: "ashby", slug: "pinecone" },
  { kind: "ashby", slug: "weaviate" },
  { kind: "ashby", slug: "qdrant" },
  { kind: "ashby", slug: "unstructured" },
  { kind: "ashby", slug: "vellum" },
  { kind: "ashby", slug: "braintrust" },
  { kind: "ashby", slug: "helicone" },
  { kind: "ashby", slug: "dust" },
  { kind: "ashby", slug: "n8n" },
  { kind: "ashby", slug: "cal" },
  { kind: "ashby", slug: "dub" },
  { kind: "ashby", slug: "twenty" },
  { kind: "ashby", slug: "infisical" },
  { kind: "ashby", slug: "posthog" },
  { kind: "ashby", slug: "linear" },
  { kind: "ashby", slug: "railway" },
  { kind: "ashby", slug: "livekit" },
  { kind: "ashby", slug: "deepgram" },
  { kind: "ashby", slug: "replit" },
  { kind: "ashby", slug: "clickhouse" },
  { kind: "ashby", slug: "ramp" },
  { kind: "ashby", slug: "vanta" },
  { kind: "ashby", slug: "openai" },

  // Greenhouse — AI & Cloud Engineering Teams
  { kind: "greenhouse", slug: "vercel" },
  { kind: "greenhouse", slug: "anthropic" },
  { kind: "greenhouse", slug: "gitlab" },
  { kind: "greenhouse", slug: "scaleai" },
  { kind: "greenhouse", slug: "togetherai" },
  { kind: "greenhouse", slug: "arizeai" },
  { kind: "greenhouse", slug: "grafanalabs" },
  { kind: "greenhouse", slug: "temporal" },
  { kind: "greenhouse", slug: "sourcegraph" },

  // Lever & Workable — Remote-friendly US/EU Engineering Teams
  { kind: "lever", slug: "mistral" },
  { kind: "lever", slug: "huggingface" },
  { kind: "lever", slug: "wealthsimple" },
  { kind: "workable", slug: "huggingface" },
];

let seededStarterSources = false;

export async function getSources(): Promise<Source[]> {
  if (!seededStarterSources) {
    for (const s of STARTER_SOURCES) {
      await query("INSERT INTO sources (kind, slug, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [
        s.kind,
        s.slug,
        s.slug,
      ]);
    }
    seededStarterSources = true;
  }
  return query<Source>("SELECT * FROM sources ORDER BY kind, slug");
}
