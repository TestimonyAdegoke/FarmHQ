import Link from "next/link";
import { UserRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { NavLinks } from "@/components/nav-links";
import { logoutAction, switchTenantAction } from "@/app/actions";
import type { NavGroup } from "@/lib/navigation";

export function Sidebar({ userName, userEmail, tenantName, tenantId, memberships, groups }: {
  userName:string; userEmail:string; tenantName:string; tenantId:string;
  memberships:{ tenantId:string; tenant:{ name:string }; role:string }[];
  groups: NavGroup[];
}) {
  return <aside className="sidebar">
    <Brand />
    {memberships.length > 1 ? <form action={switchTenantAction} style={{padding:"0 8px 15px"}}>
      <select className="tenant-select" name="tenantId" defaultValue={tenantId} aria-label="Workspace">
        {memberships.map(m => <option value={m.tenantId} key={m.tenantId}>{m.tenant.name}</option>)}
      </select><button className="button small" style={{width:"100%",marginTop:7}}>Switch workspace</button>
    </form> : <div style={{padding:"0 12px 16px", color:"#91a99a", fontSize:12}}>{tenantName}</div>}
    <NavLinks groups={groups} />
    <div className="sidebar-bottom">
      <Link href="/profile" className="user-chip"><UserRound size={16}/><span><strong>{userName}</strong><small>{userEmail}</small></span></Link>
      <form action={logoutAction}><button className="button secondary small" style={{width:"100%"}}>Sign out</button></form>
    </div>
  </aside>;
}
