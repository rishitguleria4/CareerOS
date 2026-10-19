"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-card px-2 font-mono text-[11px] text-foreground transition-colors hover:bg-muted"
      title="Copy to clipboard"
    >
      {done ? <Check className="size-3 text-[var(--brand)]" /> : <Copy className="size-3 text-muted-foreground" />}
      {label ?? (done ? "Copied" : "Copy")}
    </button>
  );
}

export function Submit({
  children,
  className,
  pendingText = "Working…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-[0_1px_1px_rgba(20,20,19,0.08)] transition-opacity hover:opacity-90 disabled:opacity-60",
        className
      )}
    >
      {pending ? pendingText : children}
    </button>
  );
}
