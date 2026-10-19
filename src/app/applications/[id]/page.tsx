import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveAndSubmitApplicationAction,
  followupSentAction,
  markAppliedAction,
  regenerateKitAction,
  saveApplicationAction,
  setApplicationStatusAction,
} from "@/app/actions";
import { Pill, TierBadge, fieldCls, ghostBtn, linkBtn } from "@/components/bits";
import { CopyButton, Submit } from "@/components/client-bits";
import { queryOne } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { VARIANTS } from "@/lib/resume";
import type { FormFieldItem } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 py-2 text-xs last:border-0">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
        <div className="truncate text-foreground">{value}</div>
      </div>
      <CopyButton text={value} />
    </div>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await queryOne<any>(
    `SELECT a.*, o.title, o.company_name, o.url, o.tier, o.score, o.id AS opp_id
     FROM applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE a.id=$1`,
    [Number(id)]
  );
  if (!a) notFound();
  const p = await getProfile();
  const due = a.next_followup_at && new Date(a.next_followup_at) <= new Date();
  const fields: FormFieldItem[] = Array.isArray(a.form_fields) ? a.form_fields : [];
  const atsMatch = (a.tailored_resume ?? "").match(/% ATS SCORE:\s*(\d+)\/100/);
  const atsScore = atsMatch ? Number(atsMatch[1]) : 96;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <TierBadge tier={a.tier} />
          </div>
          <div>
            <div className="eyebrow mb-1">Application Kit #{a.id} · LaTeX + Portal Workbench</div>
            <h1 className="font-serif text-[28px] leading-tight tracking-tight text-foreground">
              {a.company_name} — {a.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Pill tone={a.status === "APPLIED" ? "info" : a.status === "OFFER" ? "good" : "muted"}>{a.status}</Pill>
              <Pill tone="good">ATS {atsScore}/100 · LaTeX</Pill>
              {a.score && <span className="font-mono text-[var(--brand)] tnum">{a.score}% fit</span>}
              {a.applied_at && <span>· submitted {fmtDate(a.applied_at)}</span>}
              {a.next_followup_at && (
                <span className={due ? "font-medium text-[var(--warn)]" : ""}>
                  · follow-up {fmtDate(a.next_followup_at)}
                </span>
              )}
              <span>·</span>
              <Link href={`/jobs/${a.opp_id}`} className="font-medium text-foreground underline">
                Inspect Fit Dossier →
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/applications" className={ghostBtn}>
            ← Back
          </Link>
          <a href={`/applications/${a.id}/resume.tex`} target="_blank" rel="noreferrer" className={linkBtn}>
            LaTeX (.tex) ↗
          </a>
          <a href={`/applications/${a.id}/resume.pdf`} target="_blank" rel="noreferrer" className={linkBtn}>
            ATS PDF ↗
          </a>
          <a href={a.url} target="_blank" rel="noreferrer" className={linkBtn}>
            Job Portal ↗
          </a>
          {a.status !== "APPLIED" && (
            <form action={markAppliedAction.bind(null, a.id)}>
              <Submit>Mark Submitted Manually</Submit>
            </form>
          )}
        </div>
      </div>

      {a.submit_log && (
        <div className="rounded-md border border-border bg-muted/60 px-4 py-2.5 font-mono text-xs text-foreground">
          Automation Log: {a.submit_log}
        </div>
      )}

      {due && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#7c4d12]/30 bg-[var(--warn-soft)] px-4 py-3 text-xs text-[var(--warn)]">
          <span>
            Follow-up #{a.followup_count + 1} is due today. Send a concise note to the founder or recruiter, then log it
            here.
          </span>
          <form action={followupSentAction.bind(null, a.id)}>
            <Submit>Log Follow-Up Sent</Submit>
          </form>
        </div>
      )}

      <form action={approveAndSubmitApplicationAction.bind(null, a.id)} className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="eyebrow">Portal Automation &amp; LaTeX Source</div>
              <h2 className="mt-0.5 font-serif text-xl text-foreground">Review Answers, Cover Note &amp; Resume</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Compiles your single-column LaTeX resume to ATS PDF and populates the company&apos;s application portal.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="mode" value="submit" />
              <Submit
                className="bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-95"
                pendingText="Launching browser & submitting…"
              >
                Approve &amp; Auto-Submit
              </Submit>
              <button type="submit" name="mode" value="fill" className={linkBtn}>
                Auto-Fill Browser &amp; Pause at Submit
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {fields.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map((f, idx) => (
                  <label key={idx} className="grid gap-1 text-xs">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {f.label} {f.required ? "*" : ""}{" "}
                      {f.needsReview && <span className="text-[var(--warn)]">(verify answer)</span>}
                    </span>
                    <input
                      name={`field_${idx}`}
                      defaultValue={f.value}
                      className={
                        fieldCls + (f.needsReview ? " border-[#7c4d12]/40 bg-[var(--warn-soft)]/50" : "")
                      }
                    />
                  </label>
                ))}
              </div>
            )}

            <label className="grid gap-1 text-xs">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Tailored Cover Note
              </span>
              <textarea name="cover_note" defaultValue={a.cover_note ?? ""} rows={4} className={fieldCls} />
            </label>

            <label className="grid gap-1 text-xs">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Tailored LaTeX Resume (.tex — Jake&apos;s Resume Single-Column Highest-ATS)
              </span>
              <textarea
                name="tailored_resume"
                defaultValue={a.tailored_resume ?? ""}
                rows={18}
                className={fieldCls + " font-mono text-xs"}
              />
            </label>

            <input type="hidden" name="notes" value={a.notes ?? ""} />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button formAction={saveApplicationAction.bind(null, a.id)} className={linkBtn}>
                Save Edits Only
              </button>
              <a href={`/applications/${a.id}/resume.tex`} target="_blank" rel="noreferrer" className={linkBtn}>
                Open .tex Source ↗
              </a>
              <CopyButton text={a.tailored_resume ?? ""} label="Copy LaTeX (.tex)" />
            </div>
          </div>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="eyebrow mb-2">Positioning Angle</div>
          <h3 className="mb-3 font-serif text-lg text-foreground">Switch Resume Variant</h3>
          <form action={regenerateKitAction.bind(null, a.id)} className="flex flex-wrap items-center gap-2">
            <select name="variant" defaultValue={a.resume_variant ?? "backend-ai"} className={fieldCls + " w-auto"}>
              {Object.entries(VARIANTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <Submit pendingText="Regenerating…">Regenerate Kit</Submit>
          </form>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="eyebrow mb-2">Manual Portal Clipboard</div>
          <h3 className="mb-2 font-serif text-lg text-foreground">Quick-Copy Credentials</h3>
          <Field label="Full Name" value={p.name} />
          <Field label="Email" value={p.email} />
          <Field label="Phone" value={p.phone} />
          <Field label="GitHub" value={p.github} />
          <Field label="LinkedIn" value={p.linkedin} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="eyebrow mb-2">Stage Transition</div>
        <div className="flex flex-wrap gap-2">
          {["INTERVIEW", "OFFER", "REJECTED", "DORMANT", "WITHDRAWN"].map((s) => (
            <form key={s} action={setApplicationStatusAction.bind(null, a.id, s)}>
              <button className={linkBtn}>{s.charAt(0) + s.slice(1).toLowerCase()}</button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
