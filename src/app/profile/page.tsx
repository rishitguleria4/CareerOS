import {
  addSourceAction,
  removeSourceAction,
  rescoreAction,
  saveProfileAction,
  toggleSourceAction,
  uploadResumeAction,
} from "@/app/actions";
import { PageHeader, Pill, fieldCls } from "@/components/bits";
import { Submit } from "@/components/client-bits";
import { automationSettings } from "@/lib/automation";
import { hasGemini } from "@/lib/gemini";
import { hasDirectEmailConfig } from "@/lib/mailer";
import { getProfile, getSources } from "@/lib/profile";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

function F({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`grid gap-1 text-xs ${wide ? "md:col-span-2" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; imported?: string; error?: string; automation?: string }>;
}) {
  const sp = await searchParams;
  const [p, sources] = await Promise.all([getProfile(), getSources()]);
  const auto = automationSettings(p);
  const projectsText = p.projects
    .map((x) => [x.name, x.tech.join(", "), x.description.replace(/\n/g, " "), x.url ?? ""].join(" | "))
    .join("\n");
  const answersText = p.answers.map((a) => `${a.q} => ${a.a}`).join("\n");

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Candidate Mandate · Single Source of Truth"
        title="Mandate, Quotas &amp; Sources"
        sub="Controls role scoring, compensation hierarchy, batch preparation quotas, LaTeX resume generation, and direct SMTP outreach."
      />

      {sp.saved && (
        <div className="rounded-md border border-[#174e38]/25 bg-[var(--brand-soft)] px-4 py-2.5 text-xs text-[var(--brand)]">
          Mandate saved. All open opportunities have been re-scored against your updated stack and compensation tiers.
        </div>
      )}
      {sp.automation && (
        <div className="rounded-md border border-[#174e38]/25 bg-[var(--brand-soft)] px-4 py-2.5 text-xs text-[var(--brand)]">
          Automation quotas and match filter updated.
        </div>
      )}
      {sp.imported && (
        <div className="rounded-md border border-[#1d4567]/25 bg-[var(--info-soft)] px-4 py-2.5 text-xs text-[var(--info)]">
          Resume parsed ({sp.imported === "ai" ? "Gemini structured extraction" : "deterministic keyword extraction"}).
          Review the fields below and click Save Mandate.
        </div>
      )}
      {sp.error && (
        <div className="rounded-md border border-[#8c2620]/25 bg-[var(--bad-soft)] px-4 py-2.5 text-xs text-[var(--bad)]">
          Could not read that file. Please upload a text-based PDF, DOCX, LaTeX (.tex), or TXT file.
        </div>
      )}

      {/* 1. RESUME IMPORT */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <div className="eyebrow">Step 01 · Fast Onboarding</div>
            <h2 className="mt-0.5 font-serif text-xl text-foreground">
              Import Master Resume (.tex / .pdf / .docx / .txt)
            </h2>
          </div>
          <Pill tone={hasGemini() ? "good" : "muted"}>
            {hasGemini() ? "Gemini AI Extraction Active" : "Deterministic Parser"}
          </Pill>
        </div>
        <form action={uploadResumeAction} className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="resume"
            accept=".tex,.pdf,.docx,.txt,.md"
            required
            className="text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:font-mono file:text-xs file:text-foreground"
          />
          <Submit pendingText="Parsing resume…">Extract into Profile</Submit>
          <span className="text-xs text-muted-foreground">
            Every tailored application kit compiles a single-column highest-ATS LaTeX (.tex) resume to PDF.
          </span>
        </form>
      </section>

      <form action={saveProfileAction} className="space-y-7">
        {/* 2. AUTOMATION QUOTAS & COMPENSATION HIERARCHY */}
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="border-b border-border pb-3">
            <div className="eyebrow">Step 02 · Quotas &amp; Compensation Strategy</div>
            <h2 className="mt-0.5 font-serif text-xl text-foreground">
              Batch Preparation Limits &amp; Compensation Hierarchy
            </h2>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <F label="Applications per run (0–25)">
              <input
                name="prepAppsPerRun"
                type="number"
                min={0}
                max={25}
                defaultValue={auto.appsPerRun}
                className={fieldCls + " font-mono tnum"}
              />
            </F>
            <F label="Outreach emails per run (0–15)">
              <input
                name="prepOutreachPerRun"
                type="number"
                min={0}
                max={15}
                defaultValue={auto.outreachPerRun}
                className={fieldCls + " font-mono tnum"}
              />
            </F>
            <F label="Match Quality Filter">
              <select name="matchQuality" defaultValue={auto.quality} className={fieldCls}>
                <option value="best">Best fit only — Tier S/A · India/Global remote · ≥75%</option>
                <option value="strong">Strong fit — Tier S/A · ≥70%</option>
                <option value="broad">Broad fit — Tier S/A/B · ≥55%</option>
              </select>
            </F>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Compensation Hierarchy (USD / Month)
              </span>
              <span className="text-xs text-muted-foreground">
                Upside ($5k+/mo) is rewarded with 100% comp score only when technical + startup fit is credible.
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <F label="Minimum Acceptable" hint="Floor">
                <input
                  name="minSalaryUsdMonthly"
                  type="number"
                  defaultValue={p.minSalaryUsdMonthly || 2500}
                  className={fieldCls + " font-mono tnum"}
                />
              </F>
              <F label="Target" hint="Core goal">
                <input
                  name="targetSalaryUsdMonthly"
                  type="number"
                  defaultValue={p.targetSalaryUsdMonthly || 3000}
                  className={fieldCls + " font-mono tnum"}
                />
              </F>
              <F label="Ideal" hint="100% comp score">
                <input
                  name="idealSalaryUsdMonthly"
                  type="number"
                  defaultValue={p.idealSalaryUsdMonthly || 3500}
                  className={fieldCls + " font-mono tnum"}
                />
              </F>
              <F label="Upside (Credible Fit)" hint="High-fit stretch">
                <input
                  name="upsideSalaryUsdMonthly"
                  type="number"
                  defaultValue={p.upsideSalaryUsdMonthly || 5000}
                  className={fieldCls + " font-mono tnum"}
                />
              </F>
            </div>
          </div>
        </section>

        {/* 3. POSITIONING & MASTER PROFILE */}
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="border-b border-border pb-3">
            <div className="eyebrow">Step 03 · Candidate Positioning &amp; Credentials</div>
            <h2 className="mt-0.5 font-serif text-xl text-foreground">Master Candidate Profile</h2>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <F label="Full Name">
              <input name="name" defaultValue={p.name} placeholder="Your full name" className={fieldCls} />
            </F>
            <F label="Primary Positioning Headline">
              <input name="headline" defaultValue={p.headline} className={fieldCls} />
            </F>
            <F label="One-Line Pitch / Summary" wide>
              <input name="summary" defaultValue={p.summary} className={fieldCls} />
            </F>
            <F label="Email">
              <input name="email" defaultValue={p.email} placeholder="you@domain.com" className={fieldCls} />
            </F>
            <F label="Phone">
              <input name="phone" defaultValue={p.phone} placeholder="+91 …" className={fieldCls} />
            </F>
            <F label="Location">
              <input name="location" defaultValue={p.location} className={fieldCls} />
            </F>
            <F label="Timezone">
              <input name="timezone" defaultValue={p.timezone} className={fieldCls} />
            </F>
            <F label="GitHub URL">
              <input name="github" defaultValue={p.github} placeholder="https://github.com/…" className={fieldCls} />
            </F>
            <F label="LinkedIn URL">
              <input
                name="linkedin"
                defaultValue={p.linkedin}
                placeholder="https://linkedin.com/in/…"
                className={fieldCls}
              />
            </F>
            <F label="Portfolio / Personal Site">
              <input name="portfolio" defaultValue={p.portfolio} placeholder="https://…" className={fieldCls} />
            </F>
            <F label="Years of Engineering Experience">
              <input
                name="yearsExperience"
                type="number"
                min={0}
                step={0.5}
                defaultValue={p.yearsExperience}
                className={fieldCls + " font-mono tnum"}
              />
            </F>
            <F label="Work Authorization &amp; Remote Contract Status" wide>
              <input name="workAuth" defaultValue={p.workAuth} className={fieldCls} />
            </F>
            <F label="Primary Target Roles (comma separated — US or EU remote startups)" wide>
              <input name="targetRoles" defaultValue={p.targetRoles.join(", ")} className={fieldCls} />
            </F>
            <F
              label="Primary Technical Stack (comma separated)"
              hint="Only include skills you can defend in live technical interviews"
              wide
            >
              <textarea name="skills" rows={2} defaultValue={p.skills.join(", ")} className={fieldCls} />
            </F>
            <F label="Projects — one per line: Name | tech, tech | measurable 0→1 outcome | url" wide>
              <textarea
                name="projects"
                rows={6}
                defaultValue={projectsText}
                placeholder="Agentic RAG Engine | Python, FastAPI, PostgreSQL, Docker | Built multi-tenant hybrid retrieval service handling 50k queries/day with sub-400ms p95 latency | https://github.com/..."
                className={fieldCls + " font-mono text-xs"}
              />
            </F>
            <F label="Education (one per line)">
              <textarea name="education" rows={3} defaultValue={p.education.join("\n")} className={fieldCls} />
            </F>
            <F label="Experience (one per line)">
              <textarea name="experience" rows={3} defaultValue={p.experience.join("\n")} className={fieldCls} />
            </F>
            <F label="Key Achievements / Proof of Work (one per line)" wide>
              <textarea name="achievements" rows={3} defaultValue={p.achievements.join("\n")} className={fieldCls} />
            </F>
            <F label="Standard Portal Answers — one per line: Question => Answer" wide>
              <textarea
                name="answers"
                rows={4}
                defaultValue={answersText}
                className={fieldCls + " font-mono text-xs"}
              />
            </F>
          </div>
        </section>

        {/* 4. DIRECT SMTP EMAIL */}
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <div className="eyebrow">Step 04 · Direct Founder Outreach</div>
              <h2 className="mt-0.5 font-serif text-xl text-foreground">SMTP / Gmail App Password</h2>
            </div>
            <Pill tone={hasDirectEmailConfig(p) ? "good" : "warn"}>
              {hasDirectEmailConfig(p) ? "Direct Send Ready" : "Using Mail App Fallback"}
            </Pill>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Enables 1-tap sending of founder outreach emails (with your compiled ATS PDF resume attached) directly from
            your inbox. Create a 16-character Google App Password at{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline"
            >
              myaccount.google.com/apppasswords ↗
            </a>
            .
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <F label="SMTP / Gmail Address">
              <input
                name="smtpUser"
                defaultValue={p.smtpUser ?? p.email ?? ""}
                placeholder="you@gmail.com"
                className={fieldCls}
              />
            </F>
            <F label="16-Char App Password">
              <input
                name="smtpPass"
                type="password"
                placeholder={p.smtpPass ? "•••••••••••••••• (saved)" : "xxxx xxxx xxxx xxxx"}
                className={fieldCls}
              />
            </F>
            <F label="SMTP Host">
              <input name="smtpHost" defaultValue={p.smtpHost || "smtp.gmail.com"} className={fieldCls} />
            </F>
            <F label="SMTP Port">
              <input
                name="smtpPort"
                type="number"
                defaultValue={p.smtpPort || 465}
                className={fieldCls + " font-mono tnum"}
              />
            </F>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Submit
            className="bg-[var(--brand)] px-5 py-2 text-[var(--brand-ink)] hover:opacity-95"
            pendingText="Saving & re-scoring all opportunities…"
          >
            Save Mandate &amp; Re-Score Pipeline
          </Submit>
        </div>
      </form>

      {/* 5. DISCOVERY SOURCES */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <div className="eyebrow">Step 05 · ATS &amp; Feed Connectors</div>
            <h2 className="mt-0.5 font-serif text-xl text-foreground">Discovery Sources ({sources.length})</h2>
          </div>
          <form action={rescoreAction}>
            <Submit pendingText="Re-scoring…">Re-Score All Indexed Roles</Submit>
          </form>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Add any US or EU startup by its public ATS board slug (e.g.{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">jobs.ashbyhq.com/linear</code> →{" "}
          <code className="font-mono text-[11px]">ashby / linear</code>).
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border border-border bg-background/50 px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className={s.enabled ? "font-medium text-foreground" : "text-muted-foreground line-through"}>
                  {s.slug}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Pill>{s.kind}</Pill>
                  <span className="font-mono tnum">
                    {s.last_run ? `${s.last_found} roles · ${timeAgo(s.last_run)}` : "not scanned yet"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <form action={toggleSourceAction.bind(null, s.id, !s.enabled)}>
                  <button className="rounded px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                    {s.enabled ? "Pause" : "Enable"}
                  </button>
                </form>
                <form action={removeSourceAction.bind(null, s.id)}>
                  <button className="rounded px-2 py-1 font-mono text-[11px] text-[var(--bad)] hover:bg-[var(--bad-soft)]">
                    ×
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>

        <form action={addSourceAction} className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <select name="kind" className={fieldCls + " w-40"}>
            <option value="ashby">Ashby</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="workable">Workable</option>
          </select>
          <input name="slug" required placeholder="company-slug (e.g. cursor, resend, modal)" className={fieldCls + " w-64"} />
          <Submit>Add Board</Submit>
        </form>
      </section>
    </div>
  );
}
