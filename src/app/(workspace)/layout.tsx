import Link from "next/link";
import { UserRound } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/nav-links";
import { ConnectionBanner } from "@/components/connection-banner";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleNavGroups } from "@/lib/navigation";
import { isScoped, memberCan } from "@/lib/farm-scope";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { session, membership } = await requireSession();
  const scoped = isScoped(membership.farmScope);
  const [memberships, unread] = await Promise.all([
    db.membership.findMany({ where: { userId: session.userId }, include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    // Alerts are organisation-wide, so farm-scoped members do not see them.
    scoped ? Promise.resolve(0) : db.notification.count({ where: { tenantId: session.tenantId, readAt: null } }),
  ]);
  const groups = visibleNavGroups(permission => memberCan(membership, permission), scoped);
  return <div className="workspace">
    <Sidebar
      userName={membership.user.name}
      userEmail={membership.user.email}
      tenantName={membership.tenant.name}
      tenantId={session.tenantId}
      memberships={memberships}
      groups={groups}
    />
    <main className="main">
      <header className="topbar">
        <div className="topbar-title"><strong>{membership.tenant.name}</strong><span className="muted topbar-sub">Farm operations</span></div>
        <div className="topbar-actions">
          {unread ? <Link href="/automations" className="status warn" title="Unread alerts">{unread} alert{unread === 1 ? "" : "s"}</Link> : null}
          <span className="status topbar-role">{membership.role.replaceAll("_", " ")}</span>
          <Link href="/profile" className="icon-button" aria-label="My profile"><UserRound size={18}/></Link>
        </div>
      </header>
      <ConnectionBanner />
      <div className="content">{children}</div>
    </main>
    <MobileNav canSell={memberCan(membership, "sales.manage")} />
  </div>;
}
