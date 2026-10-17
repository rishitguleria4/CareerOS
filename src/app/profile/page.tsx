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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasGemini } from "@/lib/gemini";
import { hasDirectEmailConfig } from "@/lib/mailer";
import { getProfile, getSources } from "@/lib/profile";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`grid gap-1 text-sm ${wide ? "md:col-span-2" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; imported?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const [p, sources] = await Promise.all([getProfile(), getSources()]);
  const projectsText = p.projects
    .map((x) => [x.name, x.tech.join(", "), x.description.replace(/\n/g, " "), x.url ?? ""].join(" | "))
    .join("\n");
  const answersText = p.answers.map((a) => `${a.q} => ${a.a}`).join("\n");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile, 1-Tap Email & Sources"
        sub="Your master candidate profile is the single source of truth for scoring, auto-filling portals, tailoring resumes, and sending outreach."
      />
      {sp.saved && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Saved. Open opportunities were re-scored.
        </div>
      )}
      {sp.imported && (
        <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">
          Resume imported (
          {sp.imported === "ai"
            ? "AI extraction"
            : "keyword extraction — add GEMINI_API_KEY for full parsing"}
          ). Review the fields below and click Save to approve.
        </div>
      )}
      {sp.error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Could not read that file. Use a text-based PDF or DOCX.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1 · Upload Master Resume (LaTeX .tex / PDF / DOCX / TXT)</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={uploadResumeAction} className="flex flex-wrap items-center gap-3">
            <input type="file" name="resume" accept=".tex,.pdf,.docx,.txt,.md" required className="text-sm" />
            <Submit pendingText="Parsing…">Import</Submit>
            <span className="text-xs text-muted-foreground">
              AI parsing: {hasGemini() ? "on" : "off (no GEMINI_API_KEY)"}. Every tailored resume is generated strictly in
              single-column highest-ATS LaTeX (.tex) and compiled to ATS PDF.
            </span>
          </form>
        </CardContent>
      </Card>

      <form action={saveProfileAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>2 · Master profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <F label="Full name">
              <input name="name" defaultValue={p.name} className={fieldCls} />
            </F>
            <F label="Headline">
              <input name="headline" defaultValue={p.headline} className={fieldCls} />
            </F>
            <F label="Email">
              <input name="email" defaultValue={p.email} className={fieldCls} />
            </F>
            <F label="Phone">
              <input name="phone" defaultValue={p.phone} className={fieldCls} />
            </F>
            <F label="Location">
              <input name="location" defaultValue={p.location} className={fieldCls} />
            </F>
            <F label="Timezone">
              <input name="timezone" defaultValue={p.timezone} className={fieldCls} />
            </F>
            <F label="GitHub">
              <input name="github" defaultValue={p.github} className={fieldCls} />
            </F>
            <F label="LinkedIn">
              <input name="linkedin" defaultValue={p.linkedin} className={fieldCls} />
            </F>
            <F label="Portfolio">
              <input name="portfolio" defaultValue={p.portfolio} className={fieldCls} />
            </F>
            <F label="Work authorization / availability">
              <input name="workAuth" defaultValue={p.workAuth} className={fieldCls} />
            </F>
            <F label="Years of professional engineering experience">
              <input
                name="yearsExperience"
                type="number"
                min={0}
                step={0.5}
                defaultValue={p.yearsExperience}
                className={fieldCls}
              />
            </F>
            <F label="Minimum salary (USD / month)">
              <input
                name="minSalaryUsdMonthly"
                type="number"
                defaultValue={p.minSalaryUsdMonthly}
                className={fieldCls}
              />
            </F>
            <F label="Target roles (comma separated)" wide>
              <input name="targetRoles" defaultValue={p.targetRoles.join(", ")} className={fieldCls} />
            </F>
            <F label="Skills (comma separated — only list what you can defend in an interview)" wide>
              <textarea name="skills" rows={3} defaultValue={p.skills.join(", ")} className={fieldCls} />
            </F>
            <F label="Summary (truthful, 1–2 sentences)" wide>
              <textarea name="summary" rows={2} defaultValue={p.summary} className={fieldCls} />
            </F>
            <F label="Projects — one per line:  Name | tech, tech | description | url" wide>
              <textarea
                name="projects"
                rows={6}
                defaultValue={projectsText}
                className={fieldCls + " font-mono text-xs"}
              />
            </F>
            <F label="Education (one per line)">
              <textarea name="education" rows={3} defaultValue={p.education.join("\n")} className={fieldCls} />
            </F>
            <F label="Experience (one per line; leave empty if none)">
              <textarea name="experience" rows={3} defaultValue={p.experience.join("\n")} className={fieldCls} />
            </F>
            <F label="Achievements (one per line)" wide>
              <textarea name="achievements" rows={3} defaultValue={p.achievements.join("\n")} className={fieldCls} />
            </F>
            <F label="Standard application answers — one per line:  Question => Answer" wide>
              <textarea
                name="answers"
                rows={5}
                defaultValue={answersText}
                className={fieldCls + " font-mono text-xs"}
              />
            </F>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>3 · 1-Tap Direct Email Sending (Gmail App Password / SMTP)</CardTitle>
              <Pill tone={hasDirectEmailConfig(p) ? "good" : "warn"}>
                {hasDirectEmailConfig(p) ? "Active" : "Not configured"}
              </Pill>
            </div>
            <p className="text-xs text-muted-foreground">
              Allows the <b>Approve & Send Email Now</b> button to send outreach & follow-ups directly from your Gmail
              (with your tailored PDF resume attached). Generate a 16-character Google App Password at{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                myaccount.google.com/apppasswords ↗
              </a>
              .
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <F label="Your Gmail / SMTP Email">
              <input
                name="smtpUser"
                defaultValue={p.smtpUser ?? p.email ?? ""}
                placeholder="you@gmail.com"
                className={fieldCls}
              />
            </F>
            <F label="16-char Gmail App Password (saved locally in DB)">
              <input
                name="smtpPass"
                type="password"
                placeholder={p.smtpPass ? "•••••••••••••••• (already saved)" : "xxxx xxxx xxxx xxxx"}
                className={fieldCls}
              />
            </F>
            <F label="SMTP Host">
              <input name="smtpHost" defaultValue={p.smtpHost || "smtp.gmail.com"} className={fieldCls} />
            </F>
            <F label="SMTP Port">
              <input name="smtpPort" type="number" defaultValue={p.smtpPort || 465} className={fieldCls} />
            </F>
          </CardContent>
        </Card>

        <Submit pendingText="Saving & re-scoring…">Save profile, email settings & re-score opportunities</Submit>
      </form>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>4 · Discovery sources</CardTitle>
            <form action={rescoreAction}>
              <Submit pendingText="Re-scoring…">Re-score all</Submit>
            </form>
          </div>
          <p className="text-xs text-muted-foreground">
            Boards are public APIs. Add any company by its board slug (e.g.{" "}
            <code>
              jobs.lever.co/<b>acme</b>
            </code>{" "}
            → lever / acme). Dead slugs are skipped harmlessly.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <div>
                  <div className={s.enabled ? "font-medium" : "text-muted-foreground line-through"}>{s.slug}</div>
                  <div className="text-xs text-muted-foreground">
                    <Pill>{s.kind}</Pill>{" "}
                    {s.last_run ? `${s.last_found} jobs · ${timeAgo(s.last_run)}` : "never run"}
                  </div>
                </div>
                <div className="flex gap-1">
                  <form action={toggleSourceAction.bind(null, s.id, !s.enabled)}>
                    <button className="rounded px-2 py-1 text-xs hover:bg-muted">
                      {s.enabled ? "Pause" : "Enable"}
                    </button>
                  </form>
                  <form action={removeSourceAction.bind(null, s.id)}>
                    <button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">✕</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <form action={addSourceAction} className="flex flex-wrap gap-2">
            <select name="kind" className={fieldCls + " w-auto"}>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
            </select>
            <input name="slug" required placeholder="company-slug" className={fieldCls + " w-56"} />
            <Submit>Add source</Submit>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
