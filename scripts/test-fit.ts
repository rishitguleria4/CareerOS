import { analyzeJob } from "../src/lib/fit";
import { fingerprint } from "../src/lib/text";
import { DEFAULT_PROFILE } from "../src/lib/profile";
import type { Profile, RawJob } from "../src/lib/types";

const profile: Profile = {
  ...DEFAULT_PROFILE,
  skills: ["Python", "FastAPI", "PostgreSQL", "Next.js", "TypeScript", "RAG", "Agents"],
};

const cases: [string, RawJob, string][] = [
  ["worldwide remote, no exp, startup", { company: "A", title: "AI Engineer", url: "x", source: "ashby", location: "Remote - Worldwide", remoteFlag: true,
    description: "We are an early-stage seed startup (YC). Build LLM agents and RAG pipelines in Python and FastAPI with PostgreSQL. Own features end-to-end. Salary $3,000-$4,000 per month." }, "PASS/MAYBE S|A"],
  ["US only", { company: "B", title: "Backend Engineer", url: "x", source: "greenhouse", location: "Remote (US)", remoteFlag: true,
    description: "Must be authorized to work in the United States. Python, FastAPI." }, "SKIP"],
  ["3+ years required", { company: "C", title: "Python Engineer", url: "x", source: "lever", location: "Remote", remoteFlag: true, description: "Requirements:\n- 3+ years of experience with Python\n- worldwide remote" }, "SKIP"],
  ["2 years preferred", { company: "D", title: "Software Engineer", url: "x", source: "ashby", location: "Remote worldwide", remoteFlag: true, description: "Nice to have:\n- 2 years of experience with Python\nWe hire anywhere in the world." }, "not SKIP"],
  ["senior title", { company: "E", title: "Senior Backend Engineer", url: "x", source: "ashby", location: "Remote", remoteFlag: true, description: "Python" }, "SKIP"],
  ["onsite SF", { company: "F", title: "AI Engineer", url: "x", source: "ashby", location: "San Francisco, CA", description: "Python LLM. In office 5 days." }, "SKIP"],
  ["india remote", { company: "G", title: "Junior Backend Engineer", url: "x", source: "lever", location: "Remote - India", remoteFlag: true, description: "Python FastAPI Postgres" }, "PASS"],
  ["EU only", { company: "H", title: "Backend Engineer", url: "x", source: "lever", location: "Remote - Europe only", remoteFlag: true, description: "Python. Must be based in Europe." }, "SKIP"],
];

let bad = 0;
for (const [name, job, expect] of cases) {
  const f = analyzeJob(job, profile);
  console.log(`${name.padEnd(36)} -> ${f.verdict}/${f.tier} ${f.score} | ${f.action} | exp=${f.experience.kind} remote=${f.remote.cls} | ${f.hardReasons.join("; ")}`);
  const ok = expect === "SKIP" ? f.verdict === "SKIP" : expect === "not SKIP" ? f.verdict !== "SKIP" : expect === "PASS" ? f.verdict === "PASS" : f.verdict !== "SKIP";
  if (!ok) { bad++; console.log("   ^^^ UNEXPECTED, wanted", expect); }
}
console.log("dedupe:", fingerprint("Acme, Inc.", "AI Engineer (Remote)") === fingerprint("ACME", "AI Engineer - Remote") ? "ok" : "MISMATCH");
process.exit(bad ? 1 : 0);

