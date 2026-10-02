import Link from "next/link";
import { BarChart3, Bird, Boxes, ClipboardCheck, Cog, DollarSign, Fish, Grid3X3, HardHat, LayoutDashboard, Leaf, PackageOpen, ShoppingBag, ShoppingCart, Sprout, Tractor, TrendingUp, Users, Warehouse } from "lucide-react";
import { Brand } from "@/components/brand";
import { logoutAction, switchTenantAction } from "@/app/actions";

const links = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/farms", "Farms", Sprout],
  ["/fields", "Fields & Units", Grid3X3],
  ["/production", "Production", BarChart3],
  ["/crop-operations", "Crop Operations", Leaf],
  ["/poultry", "Poultry", Bird],
  ["/aquaculture", "Aquaculture", Fish],
  ["/livestock", "Livestock", PackageOpen],
  ["/tasks", "Work & Tasks", ClipboardCheck],
  ["/inventory", "Inventory", Warehouse],
  ["/procurement", "Procurement", ShoppingCart],
  ["/sales", "Sales", ShoppingBag],
  ["/finance", "Finance", DollarSign],
  ["/profitability", "Profitability", TrendingUp],
  ["/equipment", "Equipment", Tractor],
  ["/workforce", "Workforce", HardHat],
  ["/team", "Team", Users],
  ["/analytics", "Analytics", Boxes],
  ["/settings", "Settings", Cog],
] as const;

export function Sidebar({ userName, userEmail, tenantName, tenantId, memberships }: {
  userName:string; userEmail:string; tenantName:string; tenantId:string;
  memberships:{ tenantId:string; tenant:{ name:string }; role:string }[];
}) {
  return <aside className="sidebar">
    <Brand />
    {memberships.length > 1 ? <form action={switchTenantAction} style={{padding:"0 8px 15px"}}>
      <select className="tenant-select" name="tenantId" defaultValue={tenantId}>
        {memberships.map(m => <option value={m.tenantId} key={m.tenantId}>{m.tenant.name}</option>)}
      </select><button className="button small" style={{width:"100%",marginTop:7}}>Switch workspace</button>
    </form> : <div style={{padding:"0 12px 16px", color:"#91a99a", fontSize:12}}>{tenantName}</div>}
    <nav className="nav">{links.map(([href,label,Icon]) => <Link href={href} key={href}><Icon size={17}/>{label}</Link>)}</nav>
    <div className="sidebar-bottom">
      <div className="user-chip"><strong>{userName}</strong><small>{userEmail}</small></div>
      <form action={logoutAction}><button className="button secondary small" style={{width:"100%"}}>Sign out</button></form>
    </div>
  </aside>;
}

export function MobileNav() {
  return <nav className="mobile-nav">
    <Link href="/dashboard"><LayoutDashboard size={18}/><span>Home</span></Link>
    <Link href="/farms"><Sprout size={18}/><span>Farms</span></Link>
    <Link href="/tasks"><ClipboardCheck size={18}/><span>Tasks</span></Link>
    <Link href="/inventory"><Warehouse size={18}/><span>Stock</span></Link>
    <Link href="/settings"><Cog size={18}/><span>More</span></Link>
  </nav>;
}
