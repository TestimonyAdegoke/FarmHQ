import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { logoutAction, switchTenantAction } from "@/app/actions";
import { NavIcon } from "@/components/nav-icon";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { visibleNavGroups } from "@/lib/navigation";
import { tenantContext } from "@/lib/tenant";

export const metadata = { title: "Menu" };

/** Full app menu for phones and tablets, where the sidebar is hidden. */
export default async function MenuPage() {
  const ctx = await tenantContext();
  const memberships = await db.membership.findMany({ where: { userId: ctx.userId }, include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  const groups = visibleNavGroups(ctx.can, ctx.scope.limited);
  return <>
    <PageHeader eyebrow={ctx.tenant.name} title="Everything in FarmHQ" />
    {groups.map(group => <section className="menu-group" key={group.label}>
      <h2>{group.label}</h2>
      <div className="menu-grid">{group.items.map(item => <Link key={item.href} href={item.href} className="menu-tile"><span className="icon-box"><NavIcon name={item.icon} size={18} /></span><b>{item.label}</b>{item.hint ? <small>{item.hint}</small> : null}</Link>)}</div>
    </section>)}
    <section className="menu-group"><h2>Account</h2>
      <div className="menu-grid">
        <Link href="/profile" className="menu-tile"><span className="icon-box"><UserRound size={18} /></span><b>{ctx.user.name}</b><small>Profile & password</small></Link>
        <form action={logoutAction} className="menu-tile" style={{ justifyContent: "center" }}><button className="button secondary" style={{ width: "100%" }}><LogOut size={16} /> Sign out</button></form>
      </div>
      {memberships.length > 1 ? <form action={switchTenantAction} className="card" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}><select name="tenantId" defaultValue={ctx.tenantId} aria-label="Workspace" style={{ flex: 1, minWidth: 180 }}>{memberships.map(m => <option key={m.tenantId} value={m.tenantId}>{m.tenant.name}</option>)}</select><button className="button">Switch workspace</button></form> : null}
    </section>
  </>;
}
