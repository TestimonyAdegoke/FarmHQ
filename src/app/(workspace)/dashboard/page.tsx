import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDollarSign, ClipboardCheck, ClipboardList, HandCoins, PackagePlus, Receipt, Sprout, UserCheck, Wallet, Zap } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { accountBalances, invoiceBalance, isOverdue, purchaseOrderTotals, stockPositions } from "@/lib/ledger";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Overview" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const ctx = await tenantContext();
  const denied = (await searchParams).denied;
  const t = ctx.tenantId;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const showMoney = ctx.can("finance.view");
  const [farms, activeCycles, monthRevenue, monthSpend, openTasks, myTasks, recentCycles, products, positions, criticalObservations, openInvoices, openPOs, balances, pendingSheets, pendingExpenses, unread] = await Promise.all([
    db.farm.count({ where: { tenantId: t, active: true, ...ctx.scope.farms } }),
    db.productionCycle.count({ where: { tenantId: t, status: "ACTIVE", ...ctx.scope.byFarm } }),
    db.revenue.aggregate({ where: { tenantId: t, occurredAt: { gte: monthStart }, ...ctx.scope.byFarm }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { tenantId: t, status: { in: ["APPROVED", "PAID"] }, incurredAt: { gte: monthStart }, ...ctx.scope.byFarm }, _sum: { amount: true } }),
    db.task.findMany({ where: { tenantId: t, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, ...ctx.scope.byFarm }, include: { farm: true, assignedTo: true }, orderBy: [{ priority: "desc" }, { dueAt: "asc" }], take: 8 }),
    db.task.count({ where: { tenantId: t, assignedToId: ctx.userId, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, ...ctx.scope.byFarm } }),
    db.productionCycle.findMany({ where: { tenantId: t, status: { in: ["ACTIVE", "PLANNED"] }, ...ctx.scope.byFarm }, include: { farm: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.product.findMany({ where: { tenantId: t, active: true, reorderLevel: { not: null } }, select: { id: true, name: true, unit: true, reorderLevel: true } }),
    stockPositions(t, db, ctx.farmScope),
    db.scoutingObservation.findMany({ where: { tenantId: t, resolvedAt: null, severity: { in: ["HIGH", "CRITICAL"] }, ...ctx.scope.byFarm }, include: { farm: true }, orderBy: { observedAt: "desc" }, take: 3 }),
    showMoney || ctx.can("sales.view") ? db.invoice.findMany({ where: { tenantId: t, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, ...ctx.scope.byFarm }, select: { total: true, amountPaid: true, dueDate: true, status: true } }) : Promise.resolve([]),
    showMoney ? db.purchaseOrder.findMany({ where: { tenantId: t, status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] }, ...ctx.scope.byFarm }, include: { items: true, payments: true } }) : Promise.resolve([]),
    showMoney && !ctx.scope.limited ? accountBalances(t) : Promise.resolve(new Map<string, { balance: number }>()),
    ctx.can("workforce.manage") ? db.timesheet.count({ where: { tenantId: t, status: "SUBMITTED", ...ctx.scope.byFarm } }) : Promise.resolve(0),
    ctx.can("finance.manage") ? db.expense.count({ where: { tenantId: t, status: "SUBMITTED", ...ctx.scope.byFarm } }) : Promise.resolve(0),
    ctx.scope.limited ? Promise.resolve(0) : db.notification.count({ where: { tenantId: t, readAt: null } }),
  ]);
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const nowMs = new Date().getTime();
  const lowStock = products.filter(p => (positions.byProduct.get(p.id) || 0) <= Number(p.reorderLevel)).slice(0, 4);
  const receivable = openInvoices.reduce((s, i) => s + invoiceBalance(i), 0);
  const overdueCount = openInvoices.filter(i => isOverdue(i)).length;
  const payable = openPOs.reduce((s, po) => s + purchaseOrderTotals(po).balance, 0);
  const cash = [...balances.values()].reduce((s, b) => s + b.balance, 0);
  const income = Number(monthRevenue._sum.amount || 0), spend = Number(monthSpend._sum.amount || 0);

  const actions = [
    ctx.can("sales.manage") && { href: "/sales/quick", label: "Record a sale", icon: Zap, primary: true },
    (ctx.can("workforce.manage") || ctx.can("workforce.attendance")) && { href: "/workforce", label: "Take attendance", icon: UserCheck },
    ctx.can("finance.manage") && { href: "/finance", label: "Add expense", icon: Receipt },
    ctx.can("inventory.manage") && { href: "/inventory", label: "Receive / issue stock", icon: PackagePlus },
    ctx.can("production.view") && { href: "/field", label: "Field capture", icon: Sprout },
    ctx.can("task.manage") && { href: "/tasks", label: myTasks ? `My tasks (${myTasks})` : "Tasks", icon: ClipboardList },
  ].filter(Boolean).slice(0, 4) as { href: string; label: string; icon: typeof Zap; primary?: boolean }[];

  const alerts: { key: string; title: string; text: string; href: string }[] = [
    ...lowStock.map(p => ({ key: `s${p.id}`, title: `${p.name} is running low`, text: `${formatNumber(positions.byProduct.get(p.id) || 0)} ${p.unit} left (reorder at ${formatNumber(p.reorderLevel || 0)})`, href: "/inventory" })),
    ...criticalObservations.map(o => ({ key: `o${o.id}`, title: o.issue, text: `${o.farm.name} · ${o.severity.toLowerCase()} field issue`, href: "/crop-operations" })),
    ...(overdueCount ? [{ key: "inv", title: `${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"}`, text: "Customers have not paid on time. Send reminders.", href: "/sales/invoices?status=overdue" }] : []),
    ...(pendingSheets ? [{ key: "ts", title: `${pendingSheets} attendance record${pendingSheets === 1 ? "" : "s"} to approve`, text: "Approve so workers can be paid.", href: "/workforce" }] : []),
    ...(pendingExpenses ? [{ key: "ex", title: `${pendingExpenses} expense${pendingExpenses === 1 ? "" : "s"} awaiting approval`, text: "Review and approve spending.", href: "/finance?tab=approvals" }] : []),
    ...openTasks.filter(x => x.status === "BLOCKED").map(x => ({ key: `t${x.id}`, title: `${x.title} is blocked`, text: x.farm?.name || "Organization-wide task", href: "/tasks" })),
    ...(unread ? [{ key: "n", title: `${unread} unread alert${unread === 1 ? "" : "s"}`, text: "From your automation rules", href: "/automations" }] : []),
  ];

  return <>
    <PageHeader eyebrow={new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long" }).format(new Date())} title={`${greeting()}, ${ctx.user.name.split(" ")[0]}`} description="Here is what needs your attention across the farm today." />
    {denied ? <div className="error-banner" role="alert">{denied === "organisation" ? "That page covers the whole organization, and your access is limited to specific farms." : <>Your role doesn&apos;t include access to that page.</>} Ask an administrator if you need it.</div> : null}
    {actions.length ? <div className="quick-actions">{actions.map(a => <Link key={a.href} href={a.href} className={`quick-action ${a.primary ? "primary" : ""}`}><span className="icon-box"><a.icon size={18} /></span>{a.label}</Link>)}</div> : null}

    <section className="metrics">
      {showMoney ? <>
        <MetricCard label="Money available" value={ctx.scope.limited ? "—" : money(cash)} hint={ctx.scope.limited ? "Managed for the whole organization" : balances.size ? "Cash, bank & mobile money" : "Add accounts under Cash & Bank"} icon={<Wallet size={18} />} />
        <MetricCard label="Owed to you" value={money(receivable)} hint={overdueCount ? `${overdueCount} overdue invoices` : "Unpaid invoices"} icon={<HandCoins size={18} />} />
        <MetricCard label="This month's result" value={money(income - spend)} hint={`${money(income)} in · ${money(spend)} out`} icon={<CircleDollarSign size={18} />} />
        <MetricCard label="You owe suppliers" value={money(payable)} hint={`${activeCycles} active cycles · ${farms} farms`} icon={<Receipt size={18} />} />
      </> : <>
        <MetricCard label="Active farms" value={String(farms)} hint="In this organization" icon={<Sprout size={18} />} />
        <MetricCard label="Active cycles" value={String(activeCycles)} hint="Currently in production" icon={<CheckCircle2 size={18} />} />
        <MetricCard label="Open tasks" value={String(openTasks.length)} hint={`${myTasks} assigned to you`} icon={<ClipboardCheck size={18} />} />
        <MetricCard label="Field alerts" value={String(criticalObservations.length)} hint="High / critical issues" icon={<AlertTriangle size={18} />} />
      </>}
    </section>

    <section className="grid-2">
      <div className="card"><div className="card-head"><div><h2>Needs attention</h2><div className="muted small-text" style={{ marginTop: 4 }}>Things to act on today</div></div><AlertTriangle size={19} color="#9b6a10" /></div>
        <div className="alert-list">{alerts.slice(0, 8).map(a => <Link className="alert" key={a.key} href={a.href}><AlertTriangle size={18} color="#9b6a10" /><div><b>{a.title}</b><small>{a.text}</small></div></Link>)}
          {!alerts.length && <div className="alert"><CheckCircle2 size={18} color="var(--brand)" /><div><b>All clear</b><small>Low stock, field problems, overdue invoices and approvals will show up here.</small></div></div>}</div>
      </div>
      <div className="card"><div className="card-head"><div><h2>Production</h2><div className="muted small-text" style={{ marginTop: 4 }}>Active and planned cycles</div></div><Link className="link small-text" href="/production">All cycles</Link></div>
        {recentCycles.length ? recentCycles.map(c => {
          const total = c.startDate && c.expectedEndDate ? c.expectedEndDate.getTime() - c.startDate.getTime() : 0;
          const pct = c.status === "PLANNED" || !total ? 5 : Math.min(100, Math.max(3, (nowMs - c.startDate!.getTime()) / total * 100));
          return <div className="progress-row" key={c.id}><div className="progress-label"><span><b>{c.commodity}</b> · {c.farm.name}</span><span className={`status ${c.status === "PLANNED" ? "neutral" : ""}`}>{c.status.toLowerCase()}</span></div><div className="progress"><span style={{ width: `${pct}%` }} /></div><small className="muted">{c.name}{c.expectedEndDate ? ` · ends ${safeDate(c.expectedEndDate)}` : ""}</small></div>;
        }) : <div className="empty"><strong>No production cycles yet</strong><span>Start a crop season, flock or pond cycle from Production.</span></div>}
      </div>
      <div className="card" style={{ gridColumn: "1/-1" }}><div className="card-head"><div><h2>Work queue</h2><div className="muted small-text" style={{ marginTop: 4 }}>Priority tasks across your operation</div></div><Link className="link small-text" href="/tasks">All tasks</Link></div>
        {openTasks.length ? <div className="table-wrap"><table><thead><tr><th>Task</th><th>Farm</th><th>Assignee</th><th>Due</th><th>Status</th></tr></thead><tbody>{openTasks.map(x => <tr key={x.id}><td><b>{x.title}</b></td><td>{x.farm?.name || "All farms"}</td><td>{x.assignedTo?.name || "Unassigned"}</td><td>{x.dueAt && x.dueAt < new Date() ? <span className="status danger">{safeDate(x.dueAt)}</span> : safeDate(x.dueAt)}</td><td><span className={`status ${x.status === "BLOCKED" ? "warn" : x.status === "TODO" ? "neutral" : ""}`}>{x.status.replaceAll("_", " ").toLowerCase()}</span></td></tr>)}</tbody></table></div> : <div className="empty"><strong>No open tasks</strong><span>Work assigned across farms will appear here.</span></div>}
      </div>
    </section>
  </>;
}
