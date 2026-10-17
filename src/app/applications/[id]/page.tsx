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
import { Pill, fieldCls, linkBtn, linkBtnPrimary } from "@/components/bits";
import { CopyButton, Submit } from "@/components/client-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryOne } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { VARIANTS } from "@/lib/resume";
import type { FormFieldItem } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate">{value}</div>
      </div>
      <CopyButton text={value} />
    </div>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await queryOne<any>(
    `SELECT a.*, o.title, o.company_name, o.url, o.tier, o.score, o.id AS opp_id FROM applications a
     JOIN opportunities o ON o.id=a.opportunity_id WHERE a.id=$1`,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {a.company_name} — {a.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Pill tone={a.status === "APPLIED" ? "info" : a.status === "OFFER" ? "good" : "muted"}>{a.status}</Pill>
            <Pill tone="good">ATS {atsScore}% · LaTeX</Pill>
            {a.applied_at && <span>applied {fmtDate(a.applied_at)}</span>}
            {a.next_followup_at && (
              <span className={due ? "font-medium text-orange-600" : ""}>
                next follow-up {fmtDate(a.next_followup_at)}
              </span>
            )}
            <Link href={`/jobs/${a.opp_id}`} className="underline">
              fit report
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/applications/${a.id}/resume.tex`} target="_blank" rel="noreferrer" className={linkBtn}>
            📐 Download LaTeX (.tex) ↗
          </a>
          <a href={`/applications/${a.id}/resume.pdf`} target="_blank" rel="noreferrer" className={linkBtn}>
            📄 Download ATS PDF ↗
          </a>
          <a href={a.url} target="_blank" rel="noreferrer" className={linkBtn}>
            Open Portal Manually ↗
          </a>
          {a.status !== "APPLIED" && (
            <form action={markAppliedAction.bind(null, a.id)}>
              <Submit className="bg-zinc-700 text-white">Mark Applied Manually</Submit>
            </form>
          )}
        </div>
      </div>

      {a.submit_log && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          <b>Automation Execution Log:</b> {a.submit_log}
        </div>
      )}

      {due && (
        <div className="flex items-center justify-between rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
          <span>
            Follow-up #{a.followup_count + 1} is due. Send a short bump to the recruiter / hiring manager, then log it.
          </span>
          <form action={followupSentAction.bind(null, a.id)}>
            <Submit>Logged follow-up</Submit>
          </form>
        </div>
      )}

      {/* 1-Tap Approval & Form Preview */}
      <form action={approveAndSubmitApplicationAction.bind(null, a.id)} className="space-y-6">
        <Card className="border-emerald-500/40">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>1-Tap Application Preview & Auto-Submit</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Review the pre-filled form answers, cover note, and tailored LaTeX resume below. Tap{" "}
                  <b>Approve & Auto-Submit</b> to automatically fill the portal, upload your compiled ATS PDF resume, and submit.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input type="hidden" name="mode" value="submit" />
                <Submit
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  pendingText="Launching browser, filling & submitting…"
                >
                  ✅ Approve & Auto-Submit Application
                </Submit>
                <button type="submit" name="mode" value="fill" className={linkBtnPrimary}>
                  🖥️ Auto-Fill Browser & Pause at Submit
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {fields.map((f, idx) => (
                <label key={idx} className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    {f.label} {f.required ? "*" : ""}{" "}
                    {f.needsReview && <span className="text-amber-600">(verify answer)</span>}
                  </span>
                  <input
                    name={`field_${idx}`}
                    defaultValue={f.value}
                    className={fieldCls + (f.needsReview ? " border-amber-400 bg-amber-50/40" : "")}
                  />
                </label>
              ))}
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Tailored Cover Note</span>
              <textarea name="cover_note" defaultValue={a.cover_note ?? ""} rows={4} className={fieldCls} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Tailored LaTeX Resume (.tex — Jake&apos;s Resume Single-Column Highest-ATS — automatically compiled to PDF on upload)
              </span>
              <textarea
                name="tailored_resume"
                defaultValue={a.tailored_resume ?? ""}
                rows={18}
                className={fieldCls + " font-mono text-xs"}
              />
            </label>
            <input type="hidden" name="notes" value={a.notes ?? ""} />
            <div className="flex flex-wrap gap-2">
              <button formAction={saveApplicationAction.bind(null, a.id)} className={linkBtn}>
                Save Edits Only
              </button>
              <a href={`/applications/${a.id}/resume.tex`} target="_blank" rel="noreferrer" className={linkBtn}>
                📐 Open .tex Source ↗
              </a>
              <CopyButton text={a.tailored_resume ?? ""} label="Copy LaTeX (.tex)" />
            </div>
          </CardContent>
        </Card>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Switch Resume Variant</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Copy Clipboard Fallback</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Full name" value={p.name} />
            <Field label="Email" value={p.email} />
            <Field label="Phone" value={p.phone} />
            <Field label="GitHub" value={p.github} />
            <Field label="LinkedIn" value={p.linkedin} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Update Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {["INTERVIEW", "OFFER", "REJECTED", "DORMANT", "WITHDRAWN"].map((s) => (
            <form key={s} action={setApplicationStatusAction.bind(null, a.id, s)}>
              <button className={linkBtn}>{s.charAt(0) + s.slice(1).toLowerCase()}</button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
