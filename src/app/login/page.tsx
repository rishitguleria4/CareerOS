import { loginAction } from "@/app/actions";
import { Submit } from "@/components/client-bits";
import { fieldCls } from "@/components/bits";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
      <form
        action={loginAction}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-7 shadow-[0_4px_24px_rgba(20,20,19,0.05)]"
      >
        <div>
          <div className="eyebrow mb-1">0→1 AI · US &amp; EU Remote Workbench</div>
          <h1 className="font-serif text-3xl tracking-tight text-foreground">Career OS</h1>
          <p className="mt-1 text-xs text-muted-foreground">Enter your workspace passphrase to continue.</p>
        </div>
        <input name="password" type="password" autoFocus required placeholder="Passphrase" className={fieldCls} />
        {error && <p className="text-xs text-[var(--bad)]">Incorrect passphrase.</p>}
        <Submit className="w-full" pendingText="Unlocking…">
          Unlock Workspace →
        </Submit>
      </form>
    </div>
  );
}
