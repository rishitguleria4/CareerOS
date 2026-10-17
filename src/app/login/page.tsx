import { loginAction } from "@/app/actions";
import { Submit } from "@/components/client-bits";
import { fieldCls } from "@/components/bits";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
      <form action={loginAction} className="w-full max-w-sm space-y-4 rounded-xl border p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Career OS</h1>
          <p className="text-sm text-muted-foreground">Private workspace. Enter your password.</p>
        </div>
        <input name="password" type="password" autoFocus required placeholder="Password" className={fieldCls} />
        {error && <p className="text-sm text-red-600">Incorrect password.</p>}
        <Submit className="w-full" pendingText="Signing in…">Sign in</Submit>
      </form>
    </div>
  );
}

