import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/types";

const tierStyle: Record<string, string> = {
  S: "bg-emerald-600 text-white",
  A: "bg-sky-600 text-white",
  B: "bg-amber-500 text-white",
  C: "bg-zinc-400 text-white",
  SKIP: "bg-red-100 text-red-700",
};

export function TierBadge({ tier }: { tier: Tier | string | null }) {
  if (!tier) return null;
  return (
    <span className={cn("inline-flex size-6 items-center justify-center rounded-md text-xs font-bold", tierStyle[tier] ?? "bg-muted")}>
      {tier === "SKIP" ? "✕" : tier}
    </span>
  );
}

export function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "good" | "warn" | "bad" | "info" }) {
  const t = {
    muted: "bg-muted text-muted-foreground",
    good: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-800",
    bad: "bg-red-100 text-red-700",
    info: "bg-sky-100 text-sky-800",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export const linkBtn =
  "inline-flex h-8 items-center justify-center rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted";
export const linkBtnPrimary =
  "inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90";
export const ghostBtn =
  "inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
export const fieldCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40";

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function OppRow({
  o,
  right,
}: {
  o: { id: number; title: string; company_name: string; location: string | null; tier: string | null; score: number | null; fit: any; seen_on?: string[] };
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <TierBadge tier={o.tier} />
        <div className="min-w-0">
          <Link href={`/jobs/${o.id}`} className="block truncate font-medium hover:underline">
            {o.title}
          </Link>
          <div className="truncate text-xs text-muted-foreground">
            {o.company_name} · {o.location || "—"}
            {o.seen_on && o.seen_on.length > 1 ? ` · on ${o.seen_on.length} boards` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {o.fit?.action && <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{o.fit.action}</span>}
        <span className="w-12 text-right font-mono text-sm">{o.score ?? "—"}%</span>
        {right}
      </div>
    </div>
  );
}

