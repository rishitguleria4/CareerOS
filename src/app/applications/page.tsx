import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/bits";
import { query } from "@/lib/db";
import { cn, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const COLS: [string, string[]][] = [
  ["Preparing", ["PREPARING", "READY"]],
  ["Applied", ["APPLIED"]],
  ["Interview / Offer", ["INTERVIEW", "OFFER"]],
  ["Closed", ["REJECTED", "DORMANT", "WITHDRAWN"]],
];

export default async function Applications() {
  const apps = await query<any>(
    `SELECT a.id, a.status, a.resume_variant, a.applied_at, a.next_followup_at, a.followup_count, o.title, o.company_name, o.tier
     FROM applications a JOIN opportunities o ON o.id=a.opportunity_id ORDER BY a.created_at DESC`
  );
  return (
    <div>
      <PageHeader title="Applications" sub="One opportunity → one application → one status. Follow-ups: day 4, then day 9, then dormant." />
      {apps.length === 0 ? (
        <Empty>No applications yet. Open an opportunity and click <b>Prepare application</b>.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLS.map(([title, statuses]) => {
            const items = apps.filter((a) => statuses.includes(a.status));
            return (
              <div key={title} className="rounded-xl border bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between text-sm font-medium">
                  {title}
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((a) => {
                    const due = a.next_followup_at && new Date(a.next_followup_at) <= new Date();
                    return (
                      <Link key={a.id} href={`/applications/${a.id}`} className="block rounded-lg border bg-background p-3 text-sm hover:shadow-sm">
                        <div className="font-medium leading-tight">{a.company_name}</div>
                        <div className="text-xs text-muted-foreground">{a.title}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Pill>{a.status}</Pill>
                          {a.applied_at && <Pill>applied {fmtDate(a.applied_at)}</Pill>}
                          {a.next_followup_at && (
                            <span className={cn("rounded-full px-2 py-0.5 text-xs", due ? "bg-orange-100 text-orange-800" : "bg-muted text-muted-foreground")}>
                              follow-up {fmtDate(a.next_followup_at)}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

