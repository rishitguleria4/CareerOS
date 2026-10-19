import Link from "next/link";
import { Empty, PageHeader, Pill, TierBadge } from "@/components/bits";
import { BEST_FIT_ORDER } from "@/lib/automation";
import { query } from "@/lib/db";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const COLS: [string, string, string[]][] = [
  ["Staged for Approval", "Queue", ["PREPARING", "READY"]],
  ["Submitted", "Active Cadence", ["APPLIED"]],
  ["Interview / Offer", "In Process", ["INTERVIEW", "OFFER"]],
  ["Archived", "Closed / Dormant", ["REJECTED", "DORMANT", "WITHDRAWN"]],
];

export default async function Applications() {
  const apps = await query<any>(
    `SELECT a.id, a.status, a.resume_variant, a.applied_at, a.next_followup_at, a.followup_count,
            o.title, o.company_name, o.tier, o.score, o.fit
     FROM applications a
     JOIN opportunities o ON o.id = a.opportunity_id
     ORDER BY ${BEST_FIT_ORDER}, a.created_at DESC`
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline Board · 1 Role → 1 Kit"
        title="Applications"
        sub="Ordered by Best Fit within each stage. Automated follow-ups trigger at +4 days and +9 days after submission."
      />

      {apps.length === 0 ? (
        <Empty>
          No application kits created yet. Use <b>Prepare Batch</b> on the{" "}
          <Link href="/dashboard" className="font-medium text-foreground underline">
            Command Queue
          </Link>{" "}
          or open any opportunity to generate a tailored LaTeX kit.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLS.map(([title, sub, statuses]) => {
            const items = apps.filter((a) => statuses.includes(a.status));
            return (
              <div key={title} className="flex flex-col rounded-lg border border-border bg-card p-3.5">
                <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2.5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{sub}</div>
                    <div className="mt-0.5 font-serif text-lg text-foreground">{title}</div>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground tnum">{items.length}</span>
                </div>

                <div className="space-y-2.5">
                  {items.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">Empty</div>
                  ) : (
                    items.map((a) => {
                      const due = a.next_followup_at && new Date(a.next_followup_at) <= new Date();
                      return (
                        <Link
                          key={a.id}
                          href={`/applications/${a.id}`}
                          className="group block rounded-md border border-border bg-background/60 p-3 transition-colors hover:border-foreground/40 hover:bg-background"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <TierBadge tier={a.tier} />
                              <span className="truncate text-xs font-semibold text-foreground group-hover:underline">
                                {a.company_name}
                              </span>
                            </div>
                            {a.score && (
                              <span className="font-mono text-[11px] text-[var(--brand)] tnum">{a.score}%</span>
                            )}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{a.title}</div>
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            <Pill tone={a.status === "OFFER" || a.status === "INTERVIEW" ? "good" : "muted"}>
                              {a.status}
                            </Pill>
                            {a.applied_at && <Pill>sent {fmtDate(a.applied_at)}</Pill>}
                            {a.next_followup_at && (
                              <Pill tone={due ? "warn" : "muted"}>follow-up {fmtDate(a.next_followup_at)}</Pill>
                            )}
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
