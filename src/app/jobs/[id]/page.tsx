import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createOutreachAction,
  saveOppNotesAction,
  setOppStatusAction,
  startApplicationAction,
} from "@/app/actions";
import { Pill, TierBadge, fieldCls, ghostBtn, linkBtn } from "@/components/bits";
import { Submit } from "@/components/client-bits";
import { query, queryOne } from "@/lib/db";
import type { Opportunity } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Bar({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-40 text-muted-foreground">{label}</div>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-all",
            v >= 80 ? "bg-[var(--brand)]" : v >= 55 ? "bg-foreground/70" : "bg-[var(--bad)]"
          )}
          style={{ width: `${v}%` }}
        />
      </div>
      <div className="w-10 text-right font-mono text-[11px] tnum">{v}%</div>
    </div>
  );
}

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dupe?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const o = await queryOne<Opportunity>("SELECT * FROM opportunities WHERE id=$1", [Number(id)]);
  if (!o) notFound();
  const [app, outreach] = await Promise.all([
    queryOne<{ id: number; status: string }>("SELECT id, status FROM applications WHERE opportunity_id=$1", [o.id]),
    query<{ id: number; status: string }>("SELECT id, status FROM outreach WHERE opportunity_id=$1", [o.id]),
  ]);
  const f = o.fit;
  const co = encodeURIComponent(o.company_name);
  const tone = f?.verdict === "PASS" ? "good" : f?.verdict === "MAYBE" ? "warn" : "bad";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <TierBadge tier={o.tier} />
          </div>
          <div>
            <div className="eyebrow mb-1">{o.company_name} · Opportunity Dossier</div>
            <h1 className="font-serif text-[28px] leading-tight tracking-tight text-foreground">{o.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {o.location || "Remote"} · first indexed {fmtDate(o.first_seen)} · source:{" "}
              {(o.seen_on ?? [o.source]).join(", ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/jobs" className={ghostBtn}>
            ← Back
          </Link>
          <a href={o.url} target="_blank" rel="noreferrer" className={linkBtn}>
            Original Posting ↗
          </a>
          {app ? (
            <Link href={`/applications/${app.id}`} className={linkBtn}>
              Open Application Kit ({app.status}) →
            </Link>
          ) : (
            o.tier !== "SKIP" && (
              <form action={startApplicationAction.bind(null, o.id)}>
                <Submit
                  className="bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-95"
                  pendingText="Preparing LaTeX kit…"
                >
                  Prepare Application Kit
                </Submit>
              </form>
            )
          )}
          <form action={setOppStatusAction.bind(null, o.id, o.status === "SKIPPED" ? "NEW" : "SKIPPED")}>
            <button className={linkBtn}>{o.status === "SKIPPED" ? "Restore Role" : "Skip Role"}</button>
          </form>
        </div>
      </div>

      {sp.dupe && (
        <div className="rounded-md border border-border bg-muted px-4 py-2.5 text-xs text-foreground">
          This posting was already indexed — merged into the existing record without duplication.
        </div>
      )}

      {f && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <div>
                <div className="eyebrow">Deterministic Evaluation</div>
                <h2 className="mt-0.5 font-serif text-xl text-foreground">Fit &amp; Mandate Breakdown</h2>
              </div>
              <div className="flex items-center gap-2.5">
                <Pill tone={tone}>{f.verdict}</Pill>
                <span className="font-mono text-sm font-medium text-foreground">
                  {f.action.replace(/^🔥\s*/, "")}
                </span>
                <span className="font-serif text-2xl text-[var(--brand)] tnum">{f.score}/100</span>
              </div>
            </div>

            <div className="space-y-3">
              {f.hardReasons.length > 0 && (
                <div className="rounded-md border border-[#8c2620]/25 bg-[var(--bad-soft)] p-3 text-xs text-[var(--bad)]">
                  <div className="font-semibold">Hard constraint failed (never rescued by score):</div>
                  <ul className="mt-1 list-disc pl-5">
                    {f.hardReasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Bar label="Technical stack match" v={f.breakdown.technical} />
              <Bar label="Experience gate" v={f.breakdown.experience} />
              <Bar label="Remote work policy" v={f.breakdown.remote} />
              <Bar label="India / Global eligibility" v={f.breakdown.location} />
              <Bar label="Compensation alignment" v={f.breakdown.compensation} />
              <Bar label="ATS portal low-friction" v={f.breakdown.friction} />
              <Bar label="Founder outreach leverage" v={f.breakdown.outreach} />

              {f.signals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {f.signals.map((s) => (
                    <Pill key={s} tone="info">
                      {s}
                    </Pill>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="eyebrow mb-2">Logistics &amp; Compensation</div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">Remote Policy</dt>
                  <dd className="text-right font-medium text-foreground">{f.remote.note}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">India Eligible</dt>
                  <dd className="font-mono uppercase text-foreground">{f.remote.indiaEligible}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">Experience</dt>
                  <dd className="text-right text-foreground">{f.experience.note}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Compensation</dt>
                  <dd className="text-right font-mono text-foreground">{f.salary.note}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="eyebrow mb-2.5">Detected Stack Overlap</div>
              <div className="flex flex-wrap gap-1.5">
                {f.skills.length === 0 && (
                  <span className="text-xs text-muted-foreground">No specific stack keywords detected in JD.</span>
                )}
                {f.skills.map((s) => (
                  <Pill key={s.name} tone={s.level === "strong" ? "good" : s.level === "partial" ? "warn" : "muted"}>
                    {s.name}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <div className="eyebrow">Direct Founder / CTO Channel</div>
            <h2 className="mt-0.5 font-serif text-xl text-foreground">Draft Founder Outreach</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className={linkBtn}
              target="_blank"
              rel="noreferrer"
              href={`https://www.linkedin.com/search/results/people/?keywords=${co}%20founder%20OR%20CTO%20OR%20%22engineering%20manager%22`}
            >
              Find Founder / CTO on LinkedIn ↗
            </a>
            <a
              className={linkBtn}
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/search?q=${co}+founder+OR+CTO+email`}
            >
              Search Founder Email ↗
            </a>
          </div>
        </div>

        <form action={createOutreachAction.bind(null, o.id)} className="grid gap-3 md:grid-cols-4">
          <input name="contact_name" placeholder="Contact name (optional)" className={fieldCls} />
          <input name="contact_role" placeholder="Role (Founder, CTO…)" className={fieldCls} />
          <input name="contact_email" placeholder="Verified email (if known)" className={fieldCls} />
          <input name="contact_url" placeholder="LinkedIn URL" className={fieldCls} />
          <div className="md:col-span-4">
            <Submit pendingText="Drafting email…">Generate Tailored Cold Email</Submit>
          </div>
        </form>
        {outreach.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {outreach.length} outreach draft(s) already created for this role —{" "}
            <Link className="font-medium text-foreground underline" href="/outreach">
              open Founder Outreach
            </Link>
            .
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <div className="eyebrow mb-3">Original Specification</div>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-foreground/90">
            {o.description || "No description captured."}
          </pre>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="eyebrow mb-3">Research Notes</div>
          <form action={saveOppNotesAction.bind(null, o.id)} className="space-y-3">
            <textarea
              name="notes"
              defaultValue={o.notes ?? ""}
              rows={9}
              placeholder="Founder background, product links, demo ideas…"
              className={fieldCls}
            />
            <Submit>Save Notes</Submit>
          </form>
        </div>
      </div>
    </div>
  );
}
