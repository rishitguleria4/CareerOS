"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, LayoutDashboard, Mail, Send, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Opportunities", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: Send },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/profile", label: "Profile & Sources", icon: User },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="grid gap-1 px-3 text-sm font-medium">
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

