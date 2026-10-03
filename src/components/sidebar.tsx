import Link from "next/link";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { NavLinks } from "@/components/nav-links";
import { logoutAction, switchTenantAction } from "@/app/actions";
import type { NavGroup } from "@/lib/navigation";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("") || "?";
}

export function Sidebar({ userName, userEmail, tenantName, tenantId, memberships, groups }: {
  userName:string; userEmail:string; tenantName:string; tenantId:string;
  memberships:{ tenantId:string; tenant:{ name:string }; role:string }[];
  groups: NavGroup[];
}) {
  return <aside className="sidebar">
    <Brand />
    {memberships.length > 1 ? <form action={switchTenantAction} className="tenant-switch">
      <select className="tenant-select" name="tenantId" defaultValue={tenantId} aria-label="Workspace">
        {memberships.map(m => <option value={m.tenantId} key={m.tenantId}>{m.tenant.name}</option>)}
      </select><button className="button secondary small">Switch workspace</button>
    </form> : <div className="sidebar-tenant" title={tenantName}>{tenantName}</div>}
    <NavLinks groups={groups} />
    <div className="sidebar-bottom">
      <Link href="/profile" className="user-chip"><span className="avatar" aria-hidden>{initials(userName)}</span><span><strong>{userName}</strong><small>{userEmail}</small></span></Link>
      <form action={logoutAction}><button className="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={16}/></button></form>
    </div>
  </aside>;
}
