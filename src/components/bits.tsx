import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/types";

const tierStyle: Record<string, string> = {
  S: "bg-[var(--brand)] text-[var(--brand-ink)] border border-[var(--brand)]",
  A: "bg-foreground text-background border border-foreground",
  B: "bg-muted text-foreground border border-border",
  C: "bg-background text-muted-foreground border border-border",
  SKIP: "bg-[var(--bad-soft)] text-[var(--bad)] border border-[#8c2620]/20",
};

export function TierBadge({ tier }: { tier: Tier | string | null }) {
  if (!tier) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1.5 font-mono text-[11px] font-medium tracking-tight tnum",
        tierStyle[tier] ?? "bg-muted text-muted-foreground border border-border"
      )}
      title={`Fit Tier ${tier}`}
    >
      {tier === "SKIP" ? "SKIP" : tier}
    </span>
  );
}

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "good" | "warn" | "bad" | "info";
  className?: string;
}) {
  const t = {
    muted: "bg-muted/80 text-muted-foreground border-border/80",
    good: "bg-[var(--brand-soft)] text-[var(--brand)] border-[#174e38]/20",
    warn: "bg-[var(--warn-soft)] text-[var(--warn)] border-[#7c4d12]/20",
    bad: "bg-[var(--bad-soft)] text-[var(--bad)] border-[#8c2620]/20",
    info: "bg-[var(--info-soft)] text-[var(--info)] border-[#1d4567]/20",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] leading-none tracking-tight",
        t,
        className
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="font-serif text-[30px] leading-[1.1] tracking-[-0.015em] text-foreground">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const linkBtn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-[0_1px_1px_rgba(20,20,19,0.03)] transition-colors hover:bg-muted";
export const linkBtnPrimary =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-[0_1px_1px_rgba(20,20,19,0.08)] transition-opacity hover:opacity-90";
export const linkBtnBrand =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-[var(--brand-ink)] shadow-[0_1px_1px_rgba(20,20,19,0.08)] transition-opacity hover:opacity-90";
export const ghostBtn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
export const fieldCls =
  "w-full rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-foreground outline-none transition-colors focus:border-foreground/50";

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-9 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}

export function OppRow({
  o,
  right,
}: {
  o: {
    id: number;
    title: string;
    company_name: string;
    location: string | null;
    tier: string | null;
    score: number | null;
    fit: any;
    seen_on?: string[];
  };
  right?: React.ReactNode;
}) {
  const elig = o.fit?.remote?.indiaEligible;
  const eligLabel =
    elig === "yes"
      ? "India remote"
      : elig === "likely"
        ? "Worldwide remote"
        : elig === "unknown"
          ? "Remote (unverified)"
          : null;
  const salaryNote = o.fit?.salary?.note && !o.fit.salary.note.startsWith("Not stated") ? o.fit.salary.note : null;

  return (
    <div className="group flex flex-wrap items-center justify-between gap-3 border-b border-border/80 py-3 last:border-0 transition-colors hover:bg-muted/25 px-2 -mx-2 rounded">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5">
          <TierBadge tier={o.tier} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/jobs/${o.id}`}
              className="truncate text-[13.5px] font-medium text-foreground underline-offset-4 group-hover:underline"
            >
              {o.title}
            </Link>
            {eligLabel && (
              <Pill tone={elig === "yes" ? "good" : elig === "likely" ? "info" : "muted"}>{eligLabel}</Pill>
            )}
            {salaryNote && <Pill tone="good">{salaryNote}</Pill>}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{o.company_name}</span>
            <span> · {o.location || "Remote"}</span>
            {o.seen_on && o.seen_on.length > 1 ? ` · ${o.seen_on.length} sources` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {o.fit?.action && o.fit.action !== "SKIP" && (
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground sm:inline">
            {o.fit.action.replace(/^🔥\s*/, "")}
          </span>
        )}
        <span className="w-11 text-right font-mono text-xs font-medium text-foreground tnum">
          {o.score ?? "—"}%
        </span>
        {right}
      </div>
    </div>
  );
}
