import { logoutAction } from "@/app/actions";
import { NavLinks } from "./nav-links";

export function Sidebar() {
  return (
    <aside className="hidden md:flex h-screen w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="flex h-14 items-center border-b px-5 text-base font-semibold tracking-tight">
        Career OS
      </div>
      <div className="flex-1 overflow-auto py-4">
        <NavLinks />
      </div>
      <form action={logoutAction} className="border-t p-3">
        <button className="w-full rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted">
          Sign out
        </button>
      </form>
    </aside>
  );
}

