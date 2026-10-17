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
  return json<Draft>(
    `Write a ${stage} cold email.\nCOMPANY: ${job.company_name}\nROLE: ${job.title}\nRECIPIENT: ${contact.name || "the hiring team"} (${contact.role || "unknown role"})\nJOB DESCRIPTION EXCERPT:\n${(job.description ?? "").slice(0, 3000)}\n\nCANDIDATE FACTS:\n${JSON.stringify({
      name: profile.name, skills: profile.skills, projects: profile.projects, github: profile.github, portfolio: profile.portfolio, summary: profile.summary,
    })}`,
    { type: "object", properties: { subject: str, body: str }, required: ["subject", "body"] },
    `You write short, specific, humble cold emails (under 120 words) from a junior engineer to a founder/engineering lead. Reference ONE concrete thing about the company/role and ONE relevant project from the candidate facts with a link if present. Never invent experience, metrics or relationships. Single clear low-pressure ask. No buzzwords, no flattery, plain text. For followup: one short bump adding something new. For final: a graceful one-line close.`
  );
}

export async function draftCoverNote(profile: Profile, job: Opportunity): Promise<string> {
  const d = await json<{ note: string }>(
    `ROLE: ${job.title} at ${job.company_name}\n${(job.description ?? "").slice(0, 4000)}\n\nCANDIDATE FACTS:\n${JSON.stringify({
      name: profile.name, skills: profile.skills, projects: profile.projects, summary: profile.summary,
    })}`,
    { type: "object", properties: { note: str }, required: ["note"] },
    "Write a 3-4 sentence application note for a fresher. Cite one or two real projects as evidence. Never invent experience. Plain, direct tone."
  );
  return d.note;
}

// ---------- no-key fallbacks so the app is usable without Gemini ----------
export function fallbackOutreach(profile: Profile, job: Opportunity, contact: { name?: string }): Draft {
  const proj = profile.projects[0];
  return {
    subject: `${job.title} — ${profile.name || "a quick note"}`,
    body: `Hi ${contact.name || "there"},\n\nI came across ${job.company_name}'s ${job.title} role and wanted to reach out directly. ${
      proj ? `I recently built ${proj.name} (${proj.tech.slice(0, 4).join(", ")})${proj.url ? ` — ${proj.url}` : ""}, which overlaps with what you're hiring for.` : ""
    }\n\nI'm based in India, available for remote/contract work, and early in my career, so I'd be keen to prove myself on a small paid task if that's useful. Would you be open to a quick chat?\n\nThanks,\n${profile.name}\n${profile.github || ""}`,
  };
}

export function fallbackCoverNote(profile: Profile, job: Opportunity): string {
  const proj = profile.projects[0];
  return `Hi ${job.company_name} team — I'm applying for the ${job.title} role. ${
    proj ? `I built ${proj.name} using ${proj.tech.slice(0, 4).join(", ")}, which is close to the work described.` : ""
  } I'm based in India and available for remote work. Happy to do a short paid trial task.`;
}

