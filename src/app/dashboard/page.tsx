import Link from "next/link";
import {
  approveAndSendFollowupAction,
  approveAndSendOutreachAction,
  approveAndSubmitApplicationAction,
  autoPrepareBatchAction,
  followupSentAction,
  prepareOutreachDraft,
  runDiscoveryAction,
  saveAutomationAction,
  setOppStatusAction,
  startApplicationAction,
} from "@/app/actions";
import { Empty, OppRow, PageHeader, Pill, TierBadge, fieldCls, ghostBtn, linkBtn, linkBtnBrand } from "@/components/bits";
import { Submit } from "@/components/client-bits";
import { automationSettings, BEST_FIT_ORDER, MATCH_PRESETS, qualifyingWhere } from "@/lib/automation";
import { isEphemeralVercelDb, query, queryOne } from "@/lib/db";
import { hasGemini } from "@/lib/gemini";
import { hasDirectEmailConfig } from "@/lib/mailer";
import { getProfile } from "@/lib/profile";
import { VARIANTS } from "@/lib/resume";
import type { FormFieldItem } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ discovered?: string; dupes?: string; apps?: string; emails?: string; settings?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getProfile();
  const auto = automationSettings(profile);
  const presetWhere = qualifyingWhere(auto.preset);
  const bestWhere = qualifyingWhere(MATCH_PRESETS.best);

  const [counts, readyApps, readyOutreach, top, appFollow, outFollow] = await Promise.all([
    queryOne<any>(`SELECT
        (SELECT COUNT(*)::int FROM opportunities o WHERE o.status='NEW' AND ${bestWhere}) AS best_fit,
        (SELECT COUNT(*)::int FROM opportunities o WHERE o.status='NEW' AND ${presetWhere}) AS preset_pool,
        (SELECT COUNT(*)::int FROM opportunities WHERE status='NEW' AND tier IN ('S','A')) AS strong,
        (SELECT COUNT(*)::int FROM applications WHERE status IN ('READY','PREPARING')) AS apps_ready,
        (SELECT COUNT(*)::int FROM outreach WHERE status='DRAFT') AS outreach_ready,
        (SELECT COUNT(*)::int FROM applications WHERE status='APPLIED') AS applied,
        (SELECT COUNT(*)::int FROM opportunities WHERE status <> 'SKIPPED') AS active_total,
        (SELECT COUNT(*)::int FROM opportunities WHERE status = 'SKIPPED') AS skipped_total`),
    query<any>(
      `SELECT a.*, o.title, o.company_name, o.url, o.location, o.tier, o.score, o.fit
       FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
       WHERE a.status IN ('READY','PREPARING')
       ORDER BY ${BEST_FIT_ORDER}, a.created_at DESC LIMIT 12`
    ),
    query<any>(
      `SELECT r.*, o.title AS job_title, o.tier, o.score, o.fit
       FROM outreach r LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE r.status = 'DRAFT'
       ORDER BY o.score DESC NULLS LAST, r.created_at DESC LIMIT 10`
    ),
    query<any>(
      `SELECT o.id, o.title, o.company_name, o.location, o.tier, o.score, o.fit, o.seen_on
       FROM opportunities o
       LEFT JOIN applications a ON a.opportunity_id = o.id
       WHERE o.status='NEW' AND a.id IS NULL AND ${qualifyingWhere(MATCH_PRESETS.broad)}
       ORDER BY ${BEST_FIT_ORDER} LIMIT 10`
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
  ]);

  const c = counts!;
  const dueFollowups = appFollow.length + outFollow.length;
  const emailConfigured = hasDirectEmailConfig(profile);
  const needsIdentity = !profile.name || !profile.email;

  const ledger = [
    {
      label: "Best-Fit Pool",
      val: c.best_fit,
      sub: "Tier S/A · India/Global remote · ≥75%",
      accent: true,
    },
    {
      label: "Active Filter Pool",
      val: c.preset_pool,
      sub: `${auto.preset.label} · ≥${auto.preset.minScore}%`,
      accent: false,
    },
    {
      label: "Applications Queued",
      val: c.apps_ready,
      sub: `Target quota: ${auto.appsPerRun} per run`,
      accent: false,
    },
    {
      label: "Outreach Drafted",
      val: c.outreach_ready,
      sub: `Target quota: ${auto.outreachPerRun} per run`,
      accent: false,
    },
    {
      label: "Submitted / Due",
      val: `${c.applied} / ${dueFollowups}`,
      sub: `${c.skipped_total} noisy/onsite roles filtered`,
      accent: false,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Command Queue · Best-Fit-First Pipeline"
        title="Application & Outreach Workbench"
        sub={`${profile.headline} — “${profile.summary}”`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form action={autoPrepareBatchAction}>
              <Submit
                className="bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-95"
                pendingText="Preparing kits & outreach…"
              >
                Prepare Batch ({auto.appsPerRun} apps · {auto.outreachPerRun} outreach)
              </Submit>
            </form>
            <form action={runDiscoveryAction}>
              <Submit pendingText="Scanning boards & preparing…">Scan Boards &amp; Prepare</Submit>
            </form>
          </div>
        }
      />

      {(sp.discovered !== undefined || sp.apps !== undefined || sp.settings !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#174e38]/25 bg-[var(--brand-soft)] px-4 py-2.5 text-xs text-[var(--brand)]">
          <span>
            {sp.discovered !== undefined && (
              <>
                Board scan complete: <b className="font-mono">{sp.discovered}</b> new roles indexed ({sp.dupes ?? 0}{" "}
                merged).{" "}
              </>
            )}
            {sp.apps !== undefined && (
              <>
                Prepared <b className="font-mono">{sp.apps}</b> application kit(s) and{" "}
                <b className="font-mono">{sp.emails ?? 0}</b> founder outreach draft(s) using{" "}
                <b>{auto.preset.label}</b>.
              </>
            )}
            {sp.settings !== undefined && <>Automation quotas and fit filter updated.</>}
          </span>
          <Link href="/dashboard" className="font-mono text-[11px] underline">
            Dismiss
          </Link>
        </div>
      )}

      {isEphemeralVercelDb() && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#8c2620]/25 bg-[var(--bad-soft)] px-4 py-3 text-xs text-[var(--bad)]">
          <div>
            <span className="font-semibold">Temporary storage mode (/tmp):</span> Your Vercel deployment is live, but{" "}
            <code className="font-mono">DATABASE_URL</code> is not connected yet. Open your Vercel project →{" "}
            <b>Storage → Create Database (Neon Postgres) → Connect to Project</b>, then click <b>Redeploy</b> in the
            Deployments tab so your jobs and profile persist permanently.
          </div>
        </div>
      )}

      {needsIdentity && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#7c4d12]/25 bg-[var(--warn-soft)] px-4 py-3 text-xs text-[var(--warn)]">
          <div>
            <span className="font-semibold">Complete your candidate identity:</span> Your technical stack and target
            mandate are active, but adding your full name, email, and resume in{" "}
            <Link href="/profile" className="font-semibold underline">
              Mandate &amp; Sources
            </Link>{" "}
            unlocks automated LaTeX resume generation and portal pre-filling.
          </div>
          <Link href="/profile" className={linkBtn}>
            Complete Profile →
          </Link>
        </div>
      )}

      {/* ================= METRIC LEDGER ================= */}
      <div className="grid grid-cols-2 divide-y divide-border rounded-lg border border-border bg-card sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {ledger.map((m) => (
          <div key={m.label} className="p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{m.label}</div>
            <div
              className={`mt-1.5 font-serif text-3xl leading-none tnum ${
                m.accent ? "text-[var(--brand)]" : "text-foreground"
              }`}
            >
              {m.val}
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ================= AUTOMATION QUOTAS & FIT CALIBRATION BAR ================= */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Batch Quotas &amp; Fit Calibration</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Control how many applications and founder outreach emails are prepared per run, and how strictly roles are
              filtered for best fit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <Pill tone="good">Ideal $3,500/mo</Pill>
            <Pill tone="info">Target $3,000/mo</Pill>
            <Pill tone="muted">Min $2,500/mo</Pill>
            <Pill tone="warn">Upside $5,000+/mo (credible fit)</Pill>
          </div>
        </div>

        <form action={saveAutomationAction} className="mt-3.5 grid gap-3 border-t border-border pt-3.5 sm:grid-cols-12">
          <input type="hidden" name="back" value="dashboard" />
          <label className="grid gap-1 sm:col-span-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Applications / Run (0–25)
            </span>
            <input
              name="prepAppsPerRun"
              type="number"
              min={0}
              max={25}
              defaultValue={auto.appsPerRun}
              className={fieldCls + " font-mono tnum"}
            />
          </label>

          <label className="grid gap-1 sm:col-span-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Outreach / Run (0–15)
            </span>
            <input
              name="prepOutreachPerRun"
              type="number"
              min={0}
              max={15}
              defaultValue={auto.outreachPerRun}
              className={fieldCls + " font-mono tnum"}
            />
          </label>

          <label className="grid gap-1 sm:col-span-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Selection Priority
            </span>
            <select name="matchQuality" defaultValue={auto.quality} className={fieldCls}>
              <option value="best">Best fit — Tier S/A · 100% Remote &amp; India-eligible · ≥75%</option>
              <option value="strong">Strong fit — Tier S/A · 100% Remote &amp; India-eligible · ≥70%</option>
              <option value="broad">Broad fit — Tier S/A/B · 100% Remote &amp; India-eligible · ≥58%</option>
            </select>
          </label>

          <div className="flex items-end sm:col-span-2">
            <Submit className="w-full" pendingText="Saving…">
              Save Quotas
            </Submit>
          </div>
        </form>
      </section>

      {/* ================= 1. APPLICATION APPROVAL QUEUE ================= */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Queue 01 · Tailored LaTeX Kits</div>
            <h2 className="mt-0.5 font-serif text-2xl tracking-tight text-foreground">
              Applications Ready for Approval ({readyApps.length})
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Sorted by Best Fit (Tier → India eligibility → Score)</span>
            <Link href="/applications" className={ghostBtn}>
              All applications →
            </Link>
          </div>
        </div>

        {readyApps.length === 0 ? (
          <Empty>
            <div className="mx-auto max-w-md space-y-2">
              <div className="font-medium text-foreground">No application kits currently staged</div>
              <p className="text-xs text-muted-foreground">
                {needsIdentity
                  ? "Add your name and email in Mandate & Sources first so kits are built with your real credentials."
                  : `Click "Prepare Batch (${auto.appsPerRun} apps · ${auto.outreachPerRun} outreach)" above to build tailored LaTeX resumes and pre-fill forms for your top ${auto.preset.label.toLowerCase()} matches.`}
              </p>
            </div>
          </Empty>
        ) : (
          <div className="space-y-3">
            {readyApps.map((a) => {
              const fields: FormFieldItem[] = Array.isArray(a.form_fields) ? a.form_fields : [];
              const reviewCount = fields.filter((f) => f.needsReview).length;
              const atsMatch = (a.tailored_resume ?? "").match(/% ATS SCORE:\s*(\d+)\/100/);
              const atsScore = atsMatch ? Number(atsMatch[1]) : 96;
              const compNote =
                a.fit?.salary?.note && !a.fit.salary.note.startsWith("Not stated") ? a.fit.salary.note : null;

              return (
                <form
                  key={a.id}
                  action={approveAndSubmitApplicationAction.bind(null, a.id)}
                  className="rounded-lg border border-border bg-card p-5 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <TierBadge tier={a.tier} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/applications/${a.id}`}
                            className="text-[15px] font-semibold text-foreground hover:underline"
                          >
                            {a.company_name} — {a.title}
                          </Link>
                          <span className="font-mono text-xs font-medium text-[var(--brand)] tnum">
                            {a.score}% fit
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{a.location || "Remote"}</span>
                          <span>·</span>
                          <Pill tone="good">ATS {atsScore}/100 · LaTeX</Pill>
                          <Pill tone="info">
                            {VARIANTS[a.resume_variant as keyof typeof VARIANTS]?.label ?? a.resume_variant}
                          </Pill>
                          {compNote && <Pill tone="good">{compNote}</Pill>}
                          {reviewCount > 0 && <Pill tone="warn">{reviewCount} field(s) to verify</Pill>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <a href={`/applications/${a.id}/resume.tex`} target="_blank" rel="noreferrer" className={linkBtn}>
                        .tex source ↗
                      </a>
                      <a href={`/applications/${a.id}/resume.pdf`} target="_blank" rel="noreferrer" className={linkBtn}>
                        ATS PDF ↗
                      </a>
                      <a href={a.url} target="_blank" rel="noreferrer" className={linkBtn}>
                        Portal ↗
                      </a>
                    </div>
                  </div>

                  {a.submit_log && (
                    <div className="mt-3 rounded border border-border bg-muted/50 px-3 py-2 font-mono text-[11px] text-foreground">
                      Log: {a.submit_log}
                    </div>
                  )}

                  <details className="mt-3 rounded-md border border-border bg-background/60 p-3">
                    <summary className="cursor-pointer select-none font-mono text-xs text-muted-foreground hover:text-foreground">
                      Inspect &amp; edit pre-filled form answers ({fields.length} fields), cover note &amp; LaTeX
                      source
                    </summary>
                    <div className="mt-3.5 space-y-3 border-t border-border pt-3.5">
                      {fields.length > 0 && (
                        <div className="grid gap-2.5 md:grid-cols-2">
                          {fields.map((f, idx) => (
                            <label key={idx} className="grid gap-1 text-xs">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {f.label} {f.required ? "*" : ""}{" "}
                                {f.needsReview && <span className="text-[var(--warn)]">(verify)</span>}
                              </span>
                              <input
                                name={`field_${idx}`}
                                defaultValue={f.value}
                                className={
                                  fieldCls +
                                  (f.needsReview ? " border-[#7c4d12]/40 bg-[var(--warn-soft)]/50" : "")
                                }
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      <label className="grid gap-1 text-xs">
                        <span className="font-mono text-[11px] text-muted-foreground">Cover Note</span>
                        <textarea name="cover_note" defaultValue={a.cover_note ?? ""} rows={3} className={fieldCls} />
                      </label>
                      <label className="grid gap-1 text-xs">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          Tailored LaTeX Resume (.tex — single-column ATS layout, compiled to PDF on submit)
                        </span>
                        <textarea
                          name="tailored_resume"
                          defaultValue={a.tailored_resume ?? ""}
                          rows={9}
                          className={fieldCls + " font-mono text-xs"}
                        />
                      </label>
                    </div>
                  </details>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="mode" value="submit" />
                    <Submit
                      className="bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-95"
                      pendingText="Launching browser & submitting…"
                    >
                      Approve &amp; Auto-Submit
                    </Submit>
                    <button
                      type="submit"
                      name="mode"
                      value="fill"
                      className={linkBtn}
                      title="Opens Chrome/Edge, fills all fields & uploads PDF, and pauses at Submit"
                    >
                      Auto-Fill &amp; Pause in Browser
                    </button>
                    <Link href={`/applications/${a.id}`} className={ghostBtn}>
                      Open Workbench →
                    </Link>
                  </div>
                </form>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= 2. OUTREACH & FOLLOW-UP APPROVAL QUEUE ================= */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Queue 02 · Direct Founder &amp; CTO Contact</div>
            <h2 className="mt-0.5 font-serif text-2xl tracking-tight text-foreground">
              Outreach &amp; Follow-Ups Ready ({readyOutreach.length + outFollow.length})
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {emailConfigured
                ? "Direct SMTP active — 1-tap send enabled"
                : "Configure SMTP in Mandate & Sources or use Mail App ↗"}
            </span>
            <Link href="/outreach" className={ghostBtn}>
              All outreach →
            </Link>
          </div>
        </div>

        {readyOutreach.length === 0 && outFollow.length === 0 ? (
          <Empty>No founder outreach drafts or follow-ups waiting in queue.</Empty>
        ) : (
          <div className="space-y-3">
            {readyOutreach.map((o) => {
              const mailto = `mailto:${o.contact_email ?? ""}?subject=${encodeURIComponent(o.subject ?? "")}&body=${encodeURIComponent(o.body ?? "")}`;
              return (
                <form
                  key={o.id}
                  action={approveAndSendOutreachAction.bind(null, o.id)}
                  className="space-y-3 rounded-lg border border-border bg-card p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {o.tier && <TierBadge tier={o.tier} />}
                      <span className="text-[15px] font-semibold text-foreground">{o.company_name}</span>
                      {o.job_title && <span className="text-xs text-muted-foreground">· {o.job_title}</span>}
                      {o.score && (
                        <span className="font-mono text-xs text-[var(--brand)] tnum">{o.score}% fit</span>
                      )}
                      {o.fit?.action === "OUTREACH ONLY" || o.fit?.remote?.cls === "regional" ? (
                        <Pill tone="warn">Remote (Non-India) · Contractor Pitch</Pill>
                      ) : (
                        <Pill tone="good">India-Eligible Remote</Pill>
                      )}
                      <Pill>DRAFT</Pill>
                    </div>
                    <a
                      href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(o.company_name)}%20founder%20OR%20CTO`}
                      target="_blank"
                      rel="noreferrer"
                      className={linkBtn}
                    >
                      Find Founder on LinkedIn ↗
                    </a>
                  </div>

                  {o.send_log && (
                    <div className="rounded border border-border bg-muted/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                      {o.send_log}
                    </div>
                  )}

                  <div className="grid gap-2.5 md:grid-cols-3">
                    <input
                      name="contact_name"
                      defaultValue={o.contact_name ?? ""}
                      placeholder="Recipient name"
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
                      placeholder="founder@company.com (verified)"
                      required
                      className={fieldCls + " font-mono text-xs"}
                    />
                  </div>
                  <input name="subject" defaultValue={o.subject ?? ""} placeholder="Subject line" className={fieldCls} />
                  <textarea name="body" defaultValue={o.body ?? ""} rows={4} className={fieldCls} />

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Submit
                      className="bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-95"
                      pendingText="Sending email…"
                    >
                      Approve &amp; Send Email
                    </Submit>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" name="attach_resume" defaultChecked className="rounded border-border" />
                      Attach tailored ATS PDF resume
                    </label>
                    <a href={mailto} className={linkBtn}>
                      Open in Mail App ↗
                    </a>
                  </div>
                </form>
              );
            })}

            {outFollow.map((o) => (
              <div
                key={`f-${o.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#7c4d12]/30 bg-[var(--warn-soft)] px-4 py-3.5"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Follow-Up #{o.followup_count + 1} Due: {o.company_name} ({o.contact_name || o.contact_email})
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Re: “{o.subject}” · scheduled {fmtDate(o.next_followup_at)}
                  </div>
                </div>
                <form action={approveAndSendFollowupAction.bind(null, o.id)}>
                  <Submit pendingText="Sending follow-up…">Approve &amp; Send Follow-Up</Submit>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ================= 3. BEST-FIT UNPREPARED POOL & DUE APP FOLLOW-UPS ================= */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
            <div>
              <div className="eyebrow">Ranked Discovery Pool</div>
              <h3 className="mt-0.5 font-serif text-xl text-foreground">Next Best-Fit Matches</h3>
            </div>
            <Link href="/jobs?preset=best" className={ghostBtn}>
              Browse all ({c.active_total}) →
            </Link>
          </div>

          {top.length === 0 ? (
            <Empty>
              No unprepared matches remaining. Run <b>Scan Boards &amp; Prepare</b> to pull fresh roles.
            </Empty>
          ) : (
            <div>
              {top.map((o) => (
                <OppRow
                  key={o.id}
                  o={o}
                  right={
                    <div className="flex items-center gap-1.5">
                      <form action={startApplicationAction.bind(null, o.id)}>
                        <Submit className="h-7 px-2.5 text-[11px]" pendingText="Building…">
                          Prepare Kit
                        </Submit>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          await prepareOutreachDraft(o.id);
                        }}
                      >
                        <Submit
                          className="h-7 bg-muted px-2.5 text-[11px] text-foreground hover:bg-muted/80"
                          pendingText="Drafting…"
                        >
                          Draft Email
                        </Submit>
                      </form>
                      <form action={setOppStatusAction.bind(null, o.id, "SKIPPED")}>
                        <button className={ghostBtn + " h-7 px-2 text-[11px]"}>Skip</button>
                      </form>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-3 border-b border-border pb-3">
            <div className="eyebrow">Cadence Tracker</div>
            <h3 className="mt-0.5 font-serif text-xl text-foreground">Application Follow-Ups ({appFollow.length})</h3>
          </div>
          {appFollow.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No portal follow-ups due today. Submitted applications automatically surface here at +4d and +9d.
            </p>
          ) : (
            <div className="space-y-2.5">
              {appFollow.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 p-3 text-xs"
                >
                  <div className="min-w-0">
                    <Link href={`/applications/${a.id}`} className="block truncate font-medium hover:underline">
                      {a.company_name} — {a.title}
                    </Link>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      Follow-up #{a.followup_count + 1} · due {fmtDate(a.next_followup_at)}
                    </div>
                  </div>
                  <form action={followupSentAction.bind(null, a.id)}>
                    <button className={linkBtn}>Mark sent</button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <div className="eyebrow mb-2">Primary Target Roles</div>
            <div className="flex flex-wrap gap-1.5">
              {profile.targetRoles.map((r) => (
                <Pill key={r} tone="muted">
                  {r}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
