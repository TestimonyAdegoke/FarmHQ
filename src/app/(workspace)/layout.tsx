import Link from "next/link";
import { UserRound } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/nav-links";
import { ConnectionBanner } from "@/components/connection-banner";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleNavGroups } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { humanize } from "@/lib/utils";
import { Crumbs } from "@/components/crumbs";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { session, membership } = await requireSession();
  const [memberships, unread] = await Promise.all([
    db.membership.findMany({ where: { userId: session.userId }, include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.notification.count({ where: { tenantId: session.tenantId, readAt: null } }),
  ]);
  const groups = visibleNavGroups(permission => can(membership.role, permission));
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
        <Crumbs fallback={membership.tenant.name} />
        <div className="topbar-actions">
          {unread ? <Link href="/automations" className="status warn" title="Unread alerts">{unread} alert{unread === 1 ? "" : "s"}</Link> : null}
          <span className="topbar-role">{humanize(membership.role)}</span>
          <Link href="/profile" className="icon-button" aria-label="My profile"><UserRound size={18}/></Link>
        </div>
      </header>
      <ConnectionBanner />
      <div className="content">{children}</div>
    </main>
    <MobileNav canSell={can(membership.role, "sales.manage")} />
  </div>;
}
