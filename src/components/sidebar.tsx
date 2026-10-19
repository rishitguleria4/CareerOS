import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { NavLinks } from "./nav-links";

export function Sidebar() {
  return (
    <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar select-none">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <Link href="/dashboard" className="group flex flex-col">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--brand)]" />
            <span className="font-serif text-xl tracking-tight text-foreground">Career OS</span>
          </div>
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            0→1 AI · US &amp; EU Remote
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-5 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Workspace
        </div>
        <NavLinks />

        <div className="mt-6 px-4">
          <div className="rounded-lg border border-border bg-card p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Target Mandate
              </span>
              <Link
                href="/profile"
                className="font-mono text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Edit
              </Link>
            </div>
            <div className="mt-1.5 font-medium text-foreground leading-snug">
              AI Full-Stack / Early-Stage
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Python · FastAPI · Postgres · TS · React/Next.js · LLM · RAG · Docker
            </div>

            <div className="mt-3 border-t border-border pt-2.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Comp Hierarchy (USD)
              </div>
              <dl className="mt-1.5 space-y-1 font-mono text-[11px] tnum">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Ideal</dt>
                  <dd className="font-medium text-[var(--brand)]">$3,500/mo</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Target</dt>
                  <dd className="text-foreground">$3,000/mo</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Minimum</dt>
                  <dd className="text-muted-foreground">$2,500/mo</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Upside</dt>
                  <dd className="text-foreground">$5,000+/mo</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <form action={logoutAction} className="border-t border-border p-3">
        <button className="w-full rounded-md px-3 py-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          Lock session →
        </button>
      </form>
    </aside>
  );
}
