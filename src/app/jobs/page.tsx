import Link from "next/link";
import { addManualJobAction, runDiscoveryAction, setOppStatusAction, startApplicationAction } from "@/app/actions";
import { Empty, OppRow, PageHeader, fieldCls, linkBtn } from "@/components/bits";
import { Submit } from "@/components/client-bits";
import { query } from "@/lib/db";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VIEWS: [string, string][] = [
  ["open", "Open"],
  ["strong", "S / A only"],
  ["outreach", "Outreach-first"],
  ["skipped", "Skipped"],
  ["all", "All"],
];

export default async function Jobs({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; discovered?: string; dupes?: string; rejected?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view ?? "open";
  const q = (sp.q ?? "").trim();
  const where: string[] = [];
  const params: any[] = [];
  if (view === "open") where.push("status IN ('NEW','REVIEWING')");
  if (view === "strong") where.push("status IN ('NEW','REVIEWING') AND tier IN ('S','A')");
  if (view === "outreach") where.push("status IN ('NEW','REVIEWING','OUTREACH') AND fit->>'action' = 'OUTREACH FIRST'");
  if (view === "skipped") where.push("status = 'SKIPPED'");
  if (q) {
    params.push(`%${q}%`);
    where.push(`(title ILIKE $${params.length} OR company_name ILIKE $${params.length})`);
  }
  const rows = await query<any>(
    `SELECT id, title, company_name, location, tier, score, fit, seen_on, status, first_seen FROM opportunities
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY (CASE WHEN tier='SKIP' THEN 1 ELSE 0 END), score DESC NULLS LAST, first_seen DESC LIMIT 200`,
    params
  );

  return (
    <div>
      <PageHeader
        title="Opportunities"
        sub="Deduplicated across all boards. Hard constraints (US-only, 3+ years required, senior) are filtered before scoring."
        actions={
          <form action={runDiscoveryAction}>
            <Submit pendingText="Scanning… (≈30s)">Run discovery</Submit>
          </form>
        }
      />
      {sp.discovered && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Discovery finished: {sp.discovered} new, {sp.dupes} duplicates merged into existing records.
        </div>
      )}
      {sp.rejected && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">That job was filtered out (irrelevant or senior title).</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {VIEWS.map(([k, label]) => (
          <Link
            key={k}
            href={`/jobs?view=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={cn("rounded-full border px-3 py-1 text-sm", view === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={q} placeholder="Search title / company" className={cn(fieldCls, "h-8 w-56 py-1")} />
        </form>
      </div>

      <div className="rounded-xl border px-4">
        {rows.length === 0 ? (
          <div className="p-6"><Empty>Nothing here. Run discovery or add a job manually below.</Empty></div>
        ) : (
          rows.map((o) => (
            <OppRow
              key={o.id}
              o={o}
              right={
                <div className="flex gap-1.5">
                  <Link href={`/jobs/${o.id}`} className={linkBtn}>Review</Link>
                  {o.tier !== "SKIP" && !["APPLYING", "APPLIED"].includes(o.status) && (
                    <form action={startApplicationAction.bind(null, o.id)}><Submit>Apply</Submit></form>
                  )}
                  {o.status !== "SKIPPED" && (
                    <form action={setOppStatusAction.bind(null, o.id, "SKIPPED")}>
                      <button className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted">Skip</button>
                    </form>
                  )}
                </div>
              }
            />
          ))
        )}
      </div>

      <details className="mt-8 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">+ Add a job manually (company career page, YC, LinkedIn, anything)</summary>
        <form action={addManualJobAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="company" required placeholder="Company" className={fieldCls} />
          <input name="title" required placeholder="Job title" className={fieldCls} />
          <input name="url" required type="url" placeholder="Application URL" className={fieldCls} />
          <input name="location" placeholder="Location (e.g. Remote - Worldwide)" className={fieldCls} />
          <input name="salary" placeholder="Salary (optional, e.g. $3k-4k/mo)" className={fieldCls} />
          <textarea name="description" required rows={8} placeholder="Paste the full job description" className={cn(fieldCls, "md:col-span-2")} />
          <div className="md:col-span-2"><Submit>Analyze & add</Submit></div>
        </form>
      </details>
    </div>
  );
}

