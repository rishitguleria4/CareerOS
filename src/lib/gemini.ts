import { GoogleGenAI } from "@google/genai";
import type { Opportunity, Profile } from "./types";
import type { TailorPlan } from "./resume";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

export const hasGemini = () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

let client: GoogleGenAI | null = null;
function ai() {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
  return client;
}

async function json<T>(input: string, schema: Record<string, unknown>, system: string): Promise<T> {
  const res = await ai().interactions.create({
    model: MODEL,
    system_instruction: system,
    input,
    response_format: { type: "text", mime_type: "application/json", schema },
  } as any);
  const text = (res as any).output_text as string | null;
  if (!text) throw new Error("Empty response from Gemini");
  return JSON.parse(text) as T;
}

const str = { type: "string" };
const strArr = { type: "array", items: { type: "string" } };

export async function extractProfile(resumeText: string): Promise<Partial<Profile>> {
  const out = await json<any>(
    `Extract a candidate profile from this resume. Only use facts present in the text; use empty strings/arrays when absent.\n\nRESUME:\n${resumeText.slice(0, 30000)}`,
    {
      type: "object",
      properties: {
        name: str, email: str, phone: str, location: str, github: str, linkedin: str, portfolio: str,
        headline: str, summary: str, skills: strArr, education: strArr, experience: strArr, achievements: strArr,
        yearsExperience: { type: "number" },
        projects: {
          type: "array",
          items: {
            type: "object",
            properties: { name: str, description: str, tech: strArr, url: str },
            required: ["name", "description", "tech"],
          },
        },
      },
      required: ["name", "skills", "projects"],
    },
    "You are a precise resume parser. Never invent information."
  );
  return out;
}

export async function tailorPlan(profile: Profile, job: Opportunity): Promise<TailorPlan> {
  return json<TailorPlan>(
    `JOB: ${job.title} at ${job.company_name}\n${(job.description ?? "").slice(0, 8000)}\n\nCANDIDATE FACTS (the ONLY source of truth):\n${JSON.stringify(
      { skills: profile.skills, projects: profile.projects, summary: profile.summary, yearsExperience: profile.yearsExperience }
    )}`,
    {
      type: "object",
      properties: {
        summary: str,
        skillOrder: strArr,
        projectOrder: {
          type: "array",
          items: { type: "object", properties: { name: str, bullets: strArr }, required: ["name"] },
        },
      },
      required: ["summary", "skillOrder", "projectOrder"],
    },
    `You tailor resumes for a fresher with no employment experience. RULES: never invent employers, titles, years of experience, metrics, skills or projects. skillOrder may only contain skills from the candidate's list, reordered by relevance to the job. projectOrder may only contain the candidate's own project names; bullets must restate only facts in that project's description, phrased to emphasise relevance to the job. The summary (max 2 sentences) must be truthful and must not claim professional experience.`
  );
}

export interface Draft {
  subject: string;
  body: string;
}

export async function draftOutreach(
  profile: Profile,
  job: Opportunity,
  contact: { name?: string; role?: string },
  stage: "initial" | "followup" | "final" = "initial"
): Promise<Draft> {
  const nonIndiaRemote =
    job.fit?.remote?.cls === "regional" ||
    job.fit?.action === "OUTREACH ONLY" ||
    job.fit?.remote?.indiaEligible === "no";

  return json<Draft>(
    `Write a ${stage} cold email.\nCOMPANY: ${job.company_name}\nROLE: ${job.title}\nLISTED LOCATION: ${job.location || "Remote"}\nINDIA ELIGIBILITY STATUS: ${
      nonIndiaRemote
        ? "Remote role currently scoped outside India (US/EU) — pitch working remotely from India as an independent contractor (Deel / B2B, zero visa overhead, US/EU timezone overlap)"
        : "Remote role eligible from India"
    }\nRECIPIENT: ${contact.name || "the hiring team"} (${contact.role || "Founder / CTO"})\nJOB DESCRIPTION EXCERPT:\n${(job.description ?? "").slice(0, 3000)}\n\nCANDIDATE FACTS:\n${JSON.stringify({
      name: profile.name,
      headline: profile.headline,
      skills: profile.skills,
      projects: profile.projects,
      github: profile.github,
      portfolio: profile.portfolio,
      summary: profile.summary,
    })}`,
    { type: "object", properties: { subject: str, body: str }, required: ["subject", "body"] },
    `You write short, specific, high-signal cold emails (under 125 words) from an AI Full-Stack / 0→1 early-stage engineer in India to a startup founder or CTO. Reference ONE concrete detail about the company/role and ONE relevant project from the candidate facts (with link if present). ${
      nonIndiaRemote
        ? "Because the role is remote but currently listed for US/EU, briefly and transparently note that while the post is scoped to " +
          (job.location || "US/EU") +
          ", their team already works remotely and offer to join as a full-time independent contractor from India (via Deel / B2B, zero visa overhead, full US/EU timezone overlap, or a 1-week paid trial)."
        : "Offer a low-pressure ask (quick chat or short paid trial task)."
    } Never invent experience, metrics or relationships. No buzzwords, no flattery, plain text. For followup: one short bump adding something new. For final: a graceful one-line close.`
  );
}

export async function draftCoverNote(profile: Profile, job: Opportunity): Promise<string> {
  const d = await json<{ note: string }>(
    `ROLE: ${job.title} at ${job.company_name}\n${(job.description ?? "").slice(0, 4000)}\n\nCANDIDATE FACTS:\n${JSON.stringify({
      name: profile.name, skills: profile.skills, projects: profile.projects, summary: profile.summary,
    })}`,
    { type: "object", properties: { note: str }, required: ["note"] },
    "Write a 3-4 sentence application note for an AI Full-Stack / early-stage engineer. Cite one or two real projects as evidence. Never invent experience. Plain, direct tone."
  );
  return d.note;
}

// ---------- no-key fallbacks so the app is usable without Gemini ----------
export function fallbackOutreach(profile: Profile, job: Opportunity, contact: { name?: string }): Draft {
  const proj = profile.projects[0];
  const nonIndiaRemote =
    job.fit?.remote?.cls === "regional" ||
    job.fit?.action === "OUTREACH ONLY" ||
    job.fit?.remote?.indiaEligible === "no";

  if (nonIndiaRemote) {
    return {
      subject: `Remote ${job.title} (India contractor / US-EU overlap) — ${profile.name || "quick note"}`,
      body: `Hi ${contact.name || "there"},\n\nI saw ${job.company_name} is hiring a remote ${job.title} (${job.location || "US/EU"}). I know the posting is currently scoped outside India, but since your team works remotely, I wanted to reach out directly in case you're open to a full-time independent contractor from India (via Deel / B2B, zero visa overhead) overlapping US/EU hours.\n\nI build 0→1 AI products and production backends end-to-end (Python, FastAPI, PostgreSQL, TypeScript, React/Next.js, LLM/RAG).${
        proj ? ` Recently shipped ${proj.name} (${proj.tech.slice(0, 4).join(", ")})${proj.url ? ` — ${proj.url}` : ""}.` : ""
      }\n\nHappy to prove velocity on a short paid trial task first. Open to a quick chat?\n\nBest,\n${profile.name}\n${profile.github || ""}`,
    };
  }

  return {
    subject: `${job.title} at ${job.company_name} — ${profile.name || "quick note"}`,
    body: `Hi ${contact.name || "there"},\n\nI came across ${job.company_name}'s remote ${job.title} role and wanted to reach out directly. ${
      proj ? `I recently built ${proj.name} (${proj.tech.slice(0, 4).join(", ")})${proj.url ? ` — ${proj.url}` : ""}, which overlaps directly with your stack.` : ""
    }\n\nI'm based in India (comfortable with US/EU timezone overlap via Deel/B2B contractor setup) and would love to prove myself on a small paid trial task if useful. Open to a quick chat?\n\nBest,\n${profile.name}\n${profile.github || ""}`,
  };
}

export function fallbackCoverNote(profile: Profile, job: Opportunity): string {
  const proj = profile.projects[0];
  return `Hi ${job.company_name} team — I'm applying for the ${job.title} role. ${
    proj ? `I built ${proj.name} using ${proj.tech.slice(0, 4).join(", ")}, which is close to the work described.` : ""
  } I'm based in India and available for remote work. Happy to do a short paid trial task.`;
}

