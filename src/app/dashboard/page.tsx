import Link from "next/link";
import {
  approveAndSendFollowupAction,
  approveAndSendOutreachAction,
  approveAndSubmitApplicationAction,
  autoPrepareBatchAction,
  followupSentAction,
   prepareOutreachDraft,
  runDiscoveryAction,
  setOppStatusAction,
  startApplicationAction,
} from "@/app/actions";
import { Empty, OppRow, PageHeader, Pill, TierBadge, fieldCls, linkBtn } from "@/components/bits";
import { Submit } from "@/components/client-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { query, queryOne } from "@/lib/db";
import { hasGemini } from "@/lib/gemini";
import { hasDirectEmailConfig } from "@/lib/mailer";
import { getProfile } from "@/lib/profile";
import { VARIANTS } from "@/lib/resume";
import type { FormFieldItem } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [counts, readyApps, readyOutreach, top, appFollow, outFollow, profile] = await Promise.all([
    queryOne<any>(`SELECT
        (SELECT COUNT(*)::int FROM opportunities WHERE status='NEW') AS new_opps,
        (SELECT COUNT(*)::int FROM opportunities WHERE status='NEW' AND tier IN ('S','A')) AS strong,
        (SELECT COUNT(*)::int FROM applications WHERE status IN ('READY','PREPARING')) AS apps_ready,
        (SELECT COUNT(*)::int FROM outreach WHERE status='DRAFT') AS outreach_ready,
        (SELECT COUNT(*)::int FROM applications WHERE status='APPLIED') AS applied,
        (SELECT COUNT(*)::int FROM opportunities) AS total`),
    query<any>(
      `SELECT a.*, o.title, o.company_name, o.url, o.location, o.tier, o.score
       FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
       WHERE a.status IN ('READY','PREPARING')
       ORDER BY o.score DESC NULLS LAST, a.created_at DESC LIMIT 6`
    ),
    query<any>(
      `SELECT r.*, o.title AS job_title, o.tier, o.score
       FROM outreach r LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE r.status = 'DRAFT'
       ORDER BY r.created_at DESC LIMIT 6`
    ),
    query<any>(
      `SELECT id, title, company_name, location, tier, score, fit, seen_on FROM opportunities
       WHERE status='NEW' AND verdict <> 'SKIP' ORDER BY score DESC NULLS LAST LIMIT 8`
    ),
    query<any>(
      `SELECT a.id, a.followup_count, a.next_followup_at, o.title, o.company_name FROM applications a
       JOIN opportunities o ON o.id=a.opportunity_id
       WHERE a.status='APPLIED' AND a.next_followup_at <= NOW() ORDER BY a.next_followup_at`
    ),
    query<any>(
      `SELECT id, company_name, contact_name, contact_role, contact_email, subject, followup_count, next_followup_at FROM outreach
       WHERE status='SENT' AND next_followup_at <= NOW() ORDER BY next_followup_at`
    ),
    getProfile(),
  ]);

  const c = counts!;
  const stats = [
    ["New opportunities", c.new_opps],
    ["Strong matches (S/A)", c.strong],
    ["Applications ready to approve", c.apps_ready],
    ["Outreach ready to approve", c.outreach_ready],
    ["Follow-ups due", appFollow.length + outFollow.length],
  ];
  const setupNeeded = profile.skills.length === 0;
  const emailConfigured = hasDirectEmailConfig(profile);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Career OS — 1-Tap Approval Center"
        sub={`${c.total} opportunities tracked · ${c.applied} applications submitted · Machine prepares everything, you just review & tap Approve.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <form action={autoPrepareBatchAction}>
              <Submit className="bg-emerald-600 text-white hover:bg-emerald-700" pendingText="Auto-preparing kits & emails…">
                ⚡ Auto-Prepare Top Matches ({c.strong})
              </Submit>
            </form>
            <form action={runDiscoveryAction}>
              <Submit pendingText="Scanning & auto-preparing… (≈30s)">Run Discovery + Auto-Prepare</Submit>
            </form>
          </div>
        }
      />

      {setupNeeded && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Step 1:</b> Upload your resume once so the auto-applier has your real name, email, phone, skills, and projects →{" "}
          <Link href="/profile" className="font-semibold underline">
            Open Profile & Upload Resume
          </Link>
          .{!hasGemini() && " (Optional: add GEMINI_API_KEY for AI tailoring & cold emails.)"}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(([label, v]) => (
          <Card key={label as string}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ================= 1-TAP APPLICATION APPROVAL QUEUE ================= */}
      <Card className="border-emerald-500/40">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">🚀 1. Applications Ready for Your 1-Tap Approval ({readyApps.length})</CardTitle>
            <p className="text-xs text-muted-foreground">
              Tailored PDF resume, cover note, and portal form answers are pre-built. Inspect the preview below and tap{" "}
              <b>Approve & Auto-Submit</b>.
            </p>
          </div>
          {readyApps.length === 0 && c.strong > 0 && (
            <form action={autoPrepareBatchAction}>
              <Submit pendingText="Preparing…">Prepare {Math.min(8, c.strong)} S/A Applications Now</Submit>
            </form>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {readyApps.length === 0 ? (
            <Empty>
              No applications waiting in your approval queue. Click <b>⚡ Auto-Prepare Top Matches</b> above to pre-build kits for your top roles.
            </Empty>
          ) : (
            readyApps.map((a) => {
              const fields: FormFieldItem[] = Array.isArray(a.form_fields) ? a.form_fields : [];
              const reviewCount = fields.filter((f) => f.needsReview).length;
              const atsMatch = (a.tailored_resume ?? "").match(/% ATS SCORE:\s*(\d+)\/100/);
              const atsScore = atsMatch ? Number(atsMatch[1]) : 96;
              return (
                <form
                  key={a.id}
                  action={approveAndSubmitApplicationAction.bind(null, a.id)}
                  className="space-y-3 rounded-xl border bg-muted/15 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <TierBadge tier={a.tier} />
                      <div>
                        <div className="font-semibold">
                          {a.company_name} — {a.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{a.location || "Remote"}</span>
                          <span>·</span>
                          <span className="font-mono">{a.score}% Fit</span>
                          <span>·</span>
                          <Pill tone="good">ATS {atsScore}% · LaTeX</Pill>
                          <Pill tone="info">
                            {VARIANTS[a.resume_variant as keyof typeof VARIANTS]?.label ?? a.resume_variant}
                          </Pill>
                          {reviewCount > 0 && <Pill tone="warn">{reviewCount} custom answer(s) to verify</Pill>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`/applications/${a.id}/resume.tex`} target="_blank" rel="noreferrer" className={linkBtn}>
                        📐 LaTeX (.tex) ↗
                      </a>
                      <a href={`/applications/${a.id}/resume.pdf`} target="_blank" rel="noreferrer" className={linkBtn}>
                        📄 ATS PDF ↗
                      </a>
                      <a href={a.url} target="_blank" rel="noreferrer" className={linkBtn}>
                        Portal ↗
                      </a>
                    </div>
                  </div>

                  {a.submit_log && (
                    <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
                      <b>Last Automation Run:</b> {a.submit_log}
                    </div>
                  )}

                  <details className="rounded-lg border bg-background p-3">
                    <summary className="cursor-pointer text-xs font-medium">
                      👁️ Preview & Edit Pre-Filled Form Answers ({fields.length} fields) + Tailored Cover Note & LaTeX Resume (.tex)
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        {fields.map((f, idx) => (
                          <label key={idx} className="grid gap-1 text-xs">
                            <span className="font-medium text-muted-foreground">
                              {f.label} {f.required ? "*" : ""}{" "}
                              {f.needsReview && <span className="text-amber-600">(check answer)</span>}
                            </span>
                            <input
                              name={`field_${idx}`}
                              defaultValue={f.value}
                              className={fieldCls + (f.needsReview ? " border-amber-400 bg-amber-50/40" : "")}
                            />
                          </label>
                        ))}
                      </div>
                      <label className="grid gap-1 text-xs">
                        <span className="font-medium text-muted-foreground">Cover Note</span>
                        <textarea name="cover_note" defaultValue={a.cover_note ?? ""} rows={3} className={fieldCls} />
                      </label>
                      <label className="grid gap-1 text-xs">
                        <span className="font-medium text-muted-foreground">
                          Tailored LaTeX Resume (.tex — Jake&apos;s Resume Single-Column Highest-ATS → auto-compiled to PDF on submit)
                        </span>
                        <textarea
                          name="tailored_resume"
                          defaultValue={a.tailored_resume ?? ""}
                          rows={10}
                          className={fieldCls + " font-mono text-xs"}
                        />
                      </label>
                    </div>
                  </details>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input type="hidden" name="mode" value="submit" />
                    <Submit
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      pendingText="Launching browser, filling & submitting…"
                    >
                      ✅ Approve & Auto-Submit Application
                    </Submit>
                    <button
                      type="submit"
                      name="mode"
                      value="fill"
                      className={linkBtn}
                      title="Opens Chrome/Edge, fills all fields & uploads PDF, and pauses at the Submit button"
                    >
                      🖥️ Auto-Fill Browser & Pause at Submit
                    </button>
                    <Link href={`/applications/${a.id}`} className={linkBtn}>
                      Full View
                    </Link>
                  </div>
                </form>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ================= 1-TAP OUTREACH & FOLLOW-UP APPROVAL QUEUE ================= */}
      <Card className="border-sky-500/40">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">
              📨 2. Outreach & Follow-Ups Ready for 1-Tap Send ({readyOutreach.length + outFollow.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {emailConfigured ? (
                <span className="text-emerald-700">
                  ✓ Direct SMTP email is active — tapping <b>Approve & Send Email</b> sends immediately from your mail account.
                </span>
              ) : (
                <span>
                  Add your Gmail + App Password in <Link href="/profile" className="underline">Profile</Link> for 1-tap direct sending, or use <b>Open in Mail App ↗</b>.
                </span>
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {readyOutreach.length === 0 && outFollow.length === 0 ? (
            <Empty>No outreach emails waiting for approval.</Empty>
          ) : (
            <>
              {readyOutreach.map((o) => {
                const mailto = `mailto:${o.contact_email ?? ""}?subject=${encodeURIComponent(o.subject ?? "")}&body=${encodeURIComponent(o.body ?? "")}`;
                return (
                  <form
                    key={o.id}
                    action={approveAndSendOutreachAction.bind(null, o.id)}
                    className="space-y-3 rounded-xl border bg-muted/15 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {o.tier && <TierBadge tier={o.tier} />}
                        <span className="font-semibold">{o.company_name}</span>
                        {o.job_title && <span className="text-xs text-muted-foreground">· {o.job_title}</span>}
                        <Pill>DRAFT</Pill>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(o.company_name)}%20founder%20OR%20CTO`}
                          target="_blank"
                          rel="noreferrer"
                          className={linkBtn}
                        >
                          Verify Founder on LinkedIn ↗
                        </a>
                      </div>
                    </div>

                    {o.send_log && (
                      <div className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{o.send_log}</div>
                    )}

                    <div className="grid gap-2 md:grid-cols-3">
                      <input
                        name="contact_name"
                        defaultValue={o.contact_name ?? ""}
                        placeholder="Recipient Name"
                        className={fieldCls}
                      />
                      <input
                        name="contact_role"
                        defaultValue={o.contact_role ?? ""}
                        placeholder="Role (Founder / CTO)"
                        className={fieldCls}
                      />
                      <input
                        name="contact_email"
                        defaultValue={o.contact_email ?? ""}
                        placeholder="recipient@company.com"
                        required
                        className={fieldCls}
                      />
                    </div>
                    <input name="subject" defaultValue={o.subject ?? ""} placeholder="Subject" className={fieldCls} />
                    <textarea name="body" defaultValue={o.body ?? ""} rows={5} className={fieldCls} />

                    <div className="flex flex-wrap items-center gap-3">
                      <Submit className="bg-sky-600 text-white hover:bg-sky-700" pendingText="Sending email…">
                        📨 Approve & Send Email Now
                      </Submit>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" name="attach_resume" defaultChecked className="rounded" />
                        Attach tailored PDF resume
                      </label>
                      <a href={mailto} className={linkBtn}>
                        Open in Mail App ↗
                      </a>
                    </div>
                  </form>
                );
              })}

              {outFollow.map((o) => (
                <div key={`f-${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-300 bg-orange-50/50 p-4">
                  <div>
                    <div className="font-semibold">
                      Follow-Up Due: {o.company_name} → {o.contact_name || o.contact_email}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Follow-up #{o.followup_count + 1} for “{o.subject}” · due {fmtDate(o.next_followup_at)}
                    </div>
                  </div>
                  <form action={approveAndSendFollowupAction.bind(null, o.id)}>
                    <Submit className="bg-orange-600 text-white hover:bg-orange-700" pendingText="Sending follow-up…">
                      📨 Approve & Auto-Send Follow-Up #{o.followup_count + 1}
                    </Submit>
                  </form>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* ================= REMAINING NEW OPPORTUNITIES & DUE APP FOLLOW-UPS ================= */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>More Discovered Matches</CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <Empty>
                No unprocessed opportunities. Click <b>Run Discovery + Auto-Prepare</b> above.
              </Empty>
            ) : (
              top.map((o) => (
                <OppRow
                  key={o.id}
                  o={o}
                  right={
                    <div className="flex gap-1.5">
                      <Link href={`/jobs/${o.id}`} className={linkBtn}>
                        Review
                      </Link>
                      <form action={startApplicationAction.bind(null, o.id)}>
                        <Submit pendingText="Preparing…">Prepare Kit</Submit>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          await prepareOutreachDraft(o.id);
                        }}
                      >
                        <button className={linkBtn}>+ Outreach</button>
                      </form>
                      <form action={setOppStatusAction.bind(null, o.id, "SKIPPED")}>
                        <button className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted">Skip</button>
                      </form>
                    </div>
                  }
                />
              ))
            )}
            <div className="pt-4">
              <Link href="/jobs" className={linkBtn}>
                All opportunities →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Application Follow-Ups Due</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {appFollow.length === 0 && <Empty>No application follow-ups due today. 🎉</Empty>}
            {appFollow.map((a) => (
              <div key={`a${a.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                    {a.company_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {a.title} · follow-up #{a.followup_count + 1} · due {fmtDate(a.next_followup_at)}
                  </div>
                </div>
                <form action={followupSentAction.bind(null, a.id)}>
                  <Submit>Done</Submit>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
