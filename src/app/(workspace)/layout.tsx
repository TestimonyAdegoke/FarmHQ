import { Sidebar, MobileNav } from "@/components/sidebar";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { session, membership } = await requireSession();
  const memberships = await db.membership.findMany({
    where: { userId: session.userId },
    include: { tenant: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return <div className="workspace">
    <Sidebar
      userName={membership.user.name}
      userEmail={membership.user.email}
      tenantName={membership.tenant.name}
      tenantId={session.tenantId}
      memberships={memberships}
    />
    <main className="main">
      <header className="topbar"><div><strong>{membership.tenant.name}</strong><span className="muted" style={{marginLeft:10,fontSize:13}}>Farm operations</span></div><span className="status">{membership.role.replaceAll("_", " ")}</span></header>
      <div className="content">{children}</div>
    </main>
    <MobileNav />
  </div>;
}
