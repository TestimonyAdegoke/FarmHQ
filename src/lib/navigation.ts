import type { Permission } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; permission: Permission; hint?: string };
export type NavGroup = { label: string; items: NavItem[] };

// Icons are referenced by name so this module can be shared by server and client components.
export const navGroups: NavGroup[] = [
  { label: "Today", items: [
    { href: "/dashboard", label: "Overview", icon: "LayoutDashboard", permission: "farm.view", hint: "Farm health at a glance" },
    { href: "/tasks", label: "Work & Tasks", icon: "ClipboardCheck", permission: "production.view", hint: "Assign and close work" },
    { href: "/field", label: "Field App", icon: "Smartphone", permission: "production.view", hint: "Offline capture in the field" },
    { href: "/weather", label: "Weather", icon: "CloudSun", permission: "farm.view", hint: "Forecast and advisories" },
  ] },
  { label: "Sell & get paid", items: [
    { href: "/sales/quick", label: "Quick Sale", icon: "Zap", permission: "sales.manage", hint: "Sell, invoice and take payment" },
    { href: "/sales", label: "Sales Orders", icon: "ShoppingBag", permission: "sales.view", hint: "Customers and orders" },
    { href: "/sales/invoices", label: "Invoices", icon: "ReceiptText", permission: "sales.view", hint: "Bills, receipts and debtors" },
  ] },
  { label: "Production", items: [
    { href: "/farms", label: "Farms", icon: "Sprout", permission: "farm.view" },
    { href: "/fields", label: "Fields & Units", icon: "Grid3X3", permission: "farm.view" },
    { href: "/maps", label: "Farm Maps", icon: "MapPinned", permission: "farm.view" },
    { href: "/production", label: "Production Cycles", icon: "BarChart3", permission: "production.view" },
    { href: "/crop-operations", label: "Crop Operations", icon: "Leaf", permission: "production.view" },
    { href: "/poultry", label: "Poultry", icon: "Bird", permission: "livestock.view" },
    { href: "/livestock", label: "Livestock", icon: "PackageOpen", permission: "livestock.view" },
    { href: "/aquaculture", label: "Aquaculture", icon: "Fish", permission: "livestock.view" },
  ] },
  { label: "Stock & buying", items: [
    { href: "/inventory", label: "Inventory", icon: "Warehouse", permission: "inventory.view" },
    { href: "/stock-control", label: "Stock Control", icon: "PackageSearch", permission: "inventory.view" },
    { href: "/procurement", label: "Purchasing", icon: "ShoppingCart", permission: "procurement.view" },
    { href: "/traceability", label: "Traceability", icon: "QrCode", permission: "inventory.view" },
    { href: "/equipment", label: "Equipment", icon: "Tractor", permission: "equipment.view" },
  ] },
  { label: "Money", items: [
    { href: "/finance", label: "Expenses & Income", icon: "DollarSign", permission: "finance.view" },
    { href: "/accounts", label: "Cash & Bank", icon: "Landmark", permission: "finance.view", hint: "Cash, bank and mobile money" },
    { href: "/profitability", label: "Profitability", icon: "TrendingUp", permission: "finance.view" },
    { href: "/reports", label: "Reports & Export", icon: "FileSpreadsheet", permission: "analytics.view" },
    { href: "/analytics", label: "Analytics", icon: "Boxes", permission: "analytics.view" },
  ] },
  { label: "People", items: [
    { href: "/workforce", label: "Workers & Attendance", icon: "HardHat", permission: "workforce.view" },
    { href: "/payroll", label: "Payroll", icon: "Banknote", permission: "workforce.view" },
    { href: "/team", label: "Team & Access", icon: "Users", permission: "team.manage" },
  ] },
  { label: "Control", items: [
    { href: "/compliance", label: "Compliance", icon: "FileCheck2", permission: "production.view" },
    { href: "/iot", label: "IoT & Sensors", icon: "RadioTower", permission: "farm.view" },
    { href: "/automations", label: "Alerts & Automations", icon: "BellRing", permission: "farm.view" },
    { href: "/weather-history", label: "Weather History", icon: "CloudRain", permission: "farm.view" },
    { href: "/settings", label: "Settings", icon: "Cog", permission: "farm.view" },
  ] },
];

export function visibleNavGroups(allowed: (permission: Permission) => boolean) {
  return navGroups.map(g => ({ ...g, items: g.items.filter(i => allowed(i.permission)) })).filter(g => g.items.length);
}
