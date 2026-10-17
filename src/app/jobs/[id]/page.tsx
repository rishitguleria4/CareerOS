import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createOutreachAction,
  saveOppNotesAction,
  setOppStatusAction,
  startApplicationAction,
} from "@/app/actions";
import { Pill, TierBadge, fieldCls, linkBtn } from "@/components/bits";
import { Submit } from "@/components/client-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { query, queryOne } from "@/lib/db";
import type { Opportunity } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Bar({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-36 text-muted-foreground">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full", v >= 80 ? "bg-emerald-500" : v >= 55 ? "bg-amber-500" : "bg-red-400")}
          style={{ width: `${v}%` }}
        />
      </div>
      <div className="w-10 text-right font-mono text-xs">{v}%</div>
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <TierBadge tier={o.tier} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{o.title}</h1>
            <p className="text-sm text-muted-foreground">
              {o.company_name} · {o.location || "—"} · first seen {fmtDate(o.first_seen)} · on {(o.seen_on ?? [o.source]).join(", ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={o.url} target="_blank" rel="noreferrer" className={linkBtn}>Open posting ↗</a>
          {app ? (
            <Link href={`/applications/${app.id}`} className={linkBtn}>Application ({app.status})</Link>
          ) : (
            o.tier !== "SKIP" && (
              <form action={startApplicationAction.bind(null, o.id)}><Submit pendingText="Preparing kit…">Prepare application</Submit></form>
            )
          )}
          <form action={setOppStatusAction.bind(null, o.id, o.status === "SKIPPED" ? "NEW" : "SKIPPED")}>
            <button className={linkBtn}>{o.status === "SKIPPED" ? "Restore" : "Skip"}</button>
          </form>
        </div>
      </div>
      {sp.dupe && <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">This job already existed — merged into the existing record (no duplicate created).</div>}

      {f && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Fit report</CardTitle>
                <div className="flex items-center gap-2">
                  <Pill tone={tone}>{f.verdict}</Pill>
                  <span className="font-mono text-lg font-semibold">{f.score}/100</span>
                </div>
              </div>
              <p className="text-sm font-medium">{f.action}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {f.hardReasons.length > 0 && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <b>Hard constraint failed (not rescued by score):</b>
                  <ul className="mt-1 list-disc pl-5">{f.hardReasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              )}
              <Bar label="Technical fit" v={f.breakdown.technical} />
              <Bar label="Experience fit" v={f.breakdown.experience} />
              <Bar label="Remote fit" v={f.breakdown.remote} />
              <Bar label="Location fit" v={f.breakdown.location} />
              <Bar label="Compensation fit" v={f.breakdown.compensation} />
              <Bar label="Application friction" v={f.breakdown.friction} />
              <Bar label="Outreach opportunity" v={f.breakdown.outreach} />
              {f.signals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">{f.signals.map((s) => <Pill key={s} tone="info">{s}</Pill>)}</div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Eligibility</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Remote:</span> {f.remote.cls} — {f.remote.note}</div>
                <div><span className="text-muted-foreground">India eligible:</span> <b>{f.remote.indiaEligible}</b></div>
                <div><span className="text-muted-foreground">Experience:</span> {f.experience.note}</div>
                <div><span className="text-muted-foreground">Salary:</span> {o.salary_text || "—"} ({f.salary.note})</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Skill match</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {f.skills.length === 0 && <span className="text-sm text-muted-foreground">No known skills detected in JD.</span>}
                {f.skills.map((s) => (
                  <Pill key={s.name} tone={s.level === "strong" ? "good" : s.level === "partial" ? "warn" : "muted"}>
                    {s.name}
                  </Pill>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Outreach</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <a className={linkBtn} target="_blank" rel="noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${co}%20founder%20OR%20CTO%20OR%20%22engineering%20manager%22`}>Find founder / CTO on LinkedIn ↗</a>
            <a className={linkBtn} target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${co}+founder+OR+CTO+email`}>Search web ↗</a>
            <a className={linkBtn} target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${co}+careers+remote`}>Careers page ↗</a>
          </div>
          <form action={createOutreachAction.bind(null, o.id)} className="grid gap-3 md:grid-cols-4">
            <input name="contact_name" placeholder="Contact name" className={fieldCls} />
            <input name="contact_role" placeholder="Role (CTO, Founder…)" className={fieldCls} />
            <input name="contact_email" placeholder="Email (if known)" className={fieldCls} />
            <input name="contact_url" placeholder="LinkedIn URL" className={fieldCls} />
            <div className="md:col-span-4"><Submit pendingText="Drafting…">Draft outreach email</Submit></div>
          </form>
          {outreach.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {outreach.length} draft(s) exist — <Link className="underline" href="/outreach">open outreach</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Job description</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">{o.description || "No description captured."}</pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <form action={saveOppNotesAction.bind(null, o.id)} className="space-y-2">
              <textarea name="notes" defaultValue={o.notes ?? ""} rows={8} className={fieldCls} />
              <Submit>Save notes</Submit>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

