"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { navGroups } from "@/lib/navigation";

const extra: Record<string, [string, string]> = {
  "/profile": ["Account", "My profile"],
  "/menu": ["Today", "All sections"],
  "/sales/customers": ["Sell & get paid", "Customers"],
};

/** Where am I: section and page, derived from the same navigation map the sidebar uses. */
export function Crumbs({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  let best: { group: string; label: string; href: string } | undefined;
  for (const g of navGroups) for (const i of g.items) {
    if ((pathname === i.href || pathname.startsWith(i.href + "/")) && (!best || i.href.length > best.href.length)) best = { group: g.label, label: i.label, href: i.href };
  }
  const special = Object.entries(extra).find(([href]) => pathname === href || pathname.startsWith(href + "/"));
  const [group, label] = special && (!best || special[0].length > best.href.length) ? special[1] : best ? [best.group, best.label] : ["", fallback];
  return <div className="crumbs">{group ? <><span>{group}</span><ChevronRight size={14} aria-hidden /></> : null}<strong>{label}</strong></div>;
}
