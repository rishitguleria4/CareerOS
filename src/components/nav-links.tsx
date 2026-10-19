"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, LayoutDashboard, Mail, Send, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Command Queue", icon: LayoutDashboard },
  { href: "/jobs", label: "Opportunities", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: Send },
  { href: "/outreach", label: "Founder Outreach", icon: Mail },
  { href: "/profile", label: "Mandate & Sources", icon: SlidersHorizontal },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 px-3 md:grid md:gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
              active
                ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(20,20,19,0.04)] ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
          >
            {active && (
              <span
                aria-hidden
                className="hidden md:block absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[var(--brand)]"
              />
            )}
            <Icon
              className={cn(
                "size-3.5 shrink-0 transition-colors",
                active ? "text-[var(--brand)]" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
