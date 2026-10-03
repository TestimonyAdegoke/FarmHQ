"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, LayoutDashboard, Menu, Warehouse, Zap } from "lucide-react";
import { NavIcon } from "@/components/nav-icon";
import type { NavGroup } from "@/lib/navigation";

function isActive(pathname: string, href: string, all: string[]) {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  // Prefer the most specific match so /sales/invoices does not also light up /sales.
  return !all.some(other => other !== href && other.startsWith(href + "/") && (pathname === other || pathname.startsWith(other + "/")));
}

export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const all = groups.flatMap(g => g.items.map(i => i.href));
  return <nav className="nav" aria-label="Main">
    {groups.map(group => <div className="nav-group" key={group.label}>
      <div className="nav-group-label">{group.label}</div>
      {group.items.map(item => <Link href={item.href} key={item.href} className={isActive(pathname, item.href, all) ? "active" : undefined} aria-current={isActive(pathname, item.href, all) ? "page" : undefined}><NavIcon name={item.icon} />{item.label}</Link>)}
    </div>)}
  </nav>;
}

export function MobileNav({ canSell }: { canSell: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: ClipboardCheck },
    ...(canSell ? [{ href: "/sales/quick", label: "Sell", icon: Zap }] : []),
    { href: "/inventory", label: "Stock", icon: Warehouse },
    { href: "/menu", label: "More", icon: Menu },
  ];
  return <nav className="mobile-nav" aria-label="Quick navigation">
    {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`${pathname === href || pathname.startsWith(href + "/") ? "active" : ""} ${href === "/sales/quick" ? "primary" : ""}`}><Icon size={href === "/sales/quick" ? 20 : 18} /><span>{label}</span></Link>)}
  </nav>;
}
