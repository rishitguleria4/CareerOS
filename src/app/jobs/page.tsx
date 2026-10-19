import Link from "next/link";
import {
  addManualJobAction,
  prepareOutreachDraft,
  runDiscoveryAction,
  setOppStatusAction,
  startApplicationAction,
} from "@/app/actions";
import { Empty, OppRow, PageHeader, fieldCls, ghostBtn, linkBtn } from "@/components/bits";
import { Submit } from "@/components/client-bits";
import { BEST_FIT_ORDER, MATCH_PRESETS, qualifyingWhere } from "@/lib/automation";
import { query, queryOne } from "@/lib/db";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VIEWS: { key: string; label: string; sub: string }[] = [
  { key: "best", label: "Best Fit", sub: "Tier S/A · Confirmed/Likely India Remote · ≥75%" },
  { key: "strong", label: "Strong Fit", sub: "Tier S/A · ≥70%" },
  { key: "open", label: "All Qualifying", sub: "Tier S/A/B" },
  { key: "outreach", label: "Outreach-First", sub: "Founder-led / high outreach signal" },
  { key: "unavailable", label: "Closed / Unavailable", sub: "Removed from ATS board or 404/closed" },
  { key: "skipped", label: "Filtered Out", sub: "Non-India onsite / US-only / Senior" },
];

export default async function Jobs({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; preset?: string; q?: string; discovered?: string; dupes?: string; rejected?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view ?? sp.preset ?? "best";
  const q = (sp.q ?? "").trim();
  const where: string[] = [];
  const params: any[] = [];

  if (view === "best") {
    where.push(`o.status IN ('NEW','REVIEWING','APPLYING') AND ${qualifyingWhere(MATCH_PRESETS.best)}`);
  } else if (view === "strong") {
    where.push(`o.status IN ('NEW','REVIEWING','APPLYING') AND ${qualifyingWhere(MATCH_PRESETS.strong)}`);
  } else if (view === "open") {
    where.push("o.status IN ('NEW','REVIEWING','APPLYING') AND o.verdict <> 'SKIP'");
  } else if (view === "outreach") {
    where.push("o.status IN ('NEW','REVIEWING','OUTREACH','APPLYING') AND o.fit->>'action' LIKE '%OUTREACH%'");
  } else if (view === "unavailable") {
    where.push("o.status = 'UNAVAILABLE'");
  } else if (view === "skipped") {
    where.push("o.status = 'SKIPPED'");
  }

  if (q) {
    params.push(`%${q}%`);
    where.push(`(o.title ILIKE $${params.length} OR o.company_name ILIKE $${params.length})`);
  }

  const [rows, counts] = await Promise.all([
    query<any>(
      `SELECT o.id, o.title, o.company_name, o.location, o.tier, o.score, o.fit, o.seen_on, o.status, o.first_seen
       FROM opportunities o
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY (CASE WHEN o.tier='SKIP' THEN 1 ELSE 0 END), ${BEST_FIT_ORDER}, o.first_seen DESC LIMIT 200`,
      params
    ),
    queryOne<any>(`SELECT
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.status IN ('NEW','REVIEWING','APPLYING') AND ${qualifyingWhere(MATCH_PRESETS.best)}) AS best,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.status IN ('NEW','REVIEWING','APPLYING') AND ${qualifyingWhere(MATCH_PRESETS.strong)}) AS strong,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.status IN ('NEW','REVIEWING','APPLYING') AND o.verdict <> 'SKIP') AS open,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.status IN ('NEW','REVIEWING','OUTREACH','APPLYING') AND o.fit->>'action' LIKE '%OUTREACH%') AS outreach,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.status = 'UNAVAILABLE') AS unavailable,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.status = 'SKIPPED') AS skipped`),
  ]);

  const tabCount: Record<string, number> = {
    best: counts?.best ?? 0,
    strong: counts?.strong ?? 0,
    open: counts?.open ?? 0,
    outreach: counts?.outreach ?? 0,
    unavailable: counts?.unavailable ?? 0,
    skipped: counts?.skipped ?? 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discovery Index · Ranked by Fit"
        title="Opportunities"
        sub="Deduplicated across Ashby, Greenhouse, Lever, and global remote feeds. Ranked strictly by Tier, India remote eligibility, and technical/compensation fit."
        actions={
          <form action={runDiscoveryAction}>
            <Submit pendingText="Scanning boards…">Scan Boards &amp; Prepare</Submit>
          </form>
        }
      />

      {sp.discovered && (
        <div className="rounded-md border border-[#174e38]/25 bg-[var(--brand-soft)] px-4 py-2.5 text-xs text-[var(--brand)]">
          Discovery finished: <b className="font-mono">{sp.discovered}</b> new roles added,{" "}
          <b className="font-mono">{sp.dupes}</b> duplicates merged.
        </div>
      )}
      {sp.rejected && (
        <div className="rounded-md border border-[#8c2620]/25 bg-[var(--bad-soft)] px-4 py-2.5 text-xs text-[var(--bad)]">
          That posting was filtered out by hard constraints (irrelevant or senior-level title).
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {VIEWS.map((v) => {
            const active = view === v.key;
            return (
              <Link
                key={v.key}
                href={`/jobs?view=${v.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                title={v.sub}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs transition-colors",
                  active
                    ? "border-foreground bg-foreground font-medium text-background"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span>{v.label}</span>
                <span
                  className={cn(
                    "font-mono text-[10px] tnum",
                    active ? "text-background/75" : "text-muted-foreground"
                  )}
                >
                  {tabCount[v.key] ?? 0}
                </span>
              </Link>
            );
          })}
        </div>

        <form className="flex items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Filter by role or company…"
            className={cn(fieldCls, "h-8 w-56 py-1 text-xs")}
          />
        </form>
      </div>

      <div className="rounded-lg border border-border bg-card px-5 py-2">
        {rows.length === 0 ? (
          <div className="py-6">
            <Empty>
              No roles match this view. Switch to <b>All Qualifying</b> or run <b>Scan Boards &amp; Prepare</b>.
            </Empty>
          </div>
        ) : (
          rows.map((o) => (
            <OppRow
              key={o.id}
              o={o}
              right={
                <div className="flex items-center gap-1.5">
                  <Link href={`/jobs/${o.id}`} className={linkBtn + " h-7 px-2.5 text-[11px]"}>
                    Inspect
                  </Link>
                  {o.tier !== "SKIP" && !["APPLYING", "APPLIED"].includes(o.status) && (
                    <form action={startApplicationAction.bind(null, o.id)}>
                      <Submit className="h-7 px-2.5 text-[11px]" pendingText="Building…">
                        Prepare Kit
                      </Submit>
                    </form>
                  )}
                  {o.tier !== "SKIP" && (
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
                        Outreach
                      </Submit>
                    </form>
                  )}
                  {o.status !== "SKIPPED" && (
                    <form action={setOppStatusAction.bind(null, o.id, "SKIPPED")}>
                      <button className={ghostBtn + " h-7 px-2 text-[11px]"}>Skip</button>
                    </form>
                  )}
                </div>
              }
            />
          ))
        )}
      </div>

      <details className="rounded-lg border border-border bg-card p-5">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.08em] text-foreground">
          + Add a custom opportunity (Careers page, YC Work at a Startup, LinkedIn, X/Twitter)
        </summary>
        <form action={addManualJobAction} className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
          <input name="company" required placeholder="Company name" className={fieldCls} />
          <input name="title" required placeholder="Role title (e.g. Founding AI Engineer)" className={fieldCls} />
          <input name="url" required type="url" placeholder="Application URL" className={fieldCls} />
          <input name="location" placeholder="Location (e.g. Remote — US/EU/Worldwide)" className={fieldCls} />
          <input name="salary" placeholder="Compensation (optional, e.g. $3,500/mo or $120k–$150k)" className={fieldCls} />
          <textarea
            name="description"
            required
            rows={7}
            placeholder="Paste the full job description…"
            className={cn(fieldCls, "md:col-span-2")}
          />
          <div className="md:col-span-2">
            <Submit>Score &amp; Index Opportunity</Submit>
          </div>
        </form>
      </details>
    </div>
  );
}
