import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { QuickSaleForm } from "@/components/quick-sale-form";
import { db } from "@/lib/db";
import { stockPositions } from "@/lib/ledger";
import { tenantContext } from "@/lib/tenant";
import { toDateInput } from "@/lib/utils";

export const metadata = { title: "Quick Sale" };

export default async function QuickSalePage() {
  const ctx = await tenantContext("sales.manage");
  const [customers, products, warehouses, accounts, farms, cycles, positions] = await Promise.all([
    db.customer.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id: true, name: true, unit: true, sellingPrice: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.byFarm }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.moneyAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.farms }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PLANNED", "PAUSED"] }, ...ctx.scope.byFarm }, select: { id: true, name: true, farmId: true }, orderBy: { name: "asc" } }),
    stockPositions(ctx.tenantId, db, ctx.farmScope),
  ]);
  const stock: Record<string, Record<string, number>> = {};
  for (const [key, qty] of positions.byLocation) {
    const [warehouseId, productId] = key.split(":");
    (stock[warehouseId] ||= {})[productId] = Math.round(qty * 1000) / 1000;
  }
  return <>
    <PageHeader eyebrow="Sell & get paid" title="Quick sale" description="Record a farm-gate or market sale in one step: stock goes out, an invoice is issued and the payment is receipted." action={<Link href="/sales/invoices" className="button secondary small">View invoices</Link>} />
    {!accounts.length ? <div className="alert" style={{ marginBottom: 16 }}><div><b>Tip: add your cash box, bank and mobile-money wallets</b><small>Set them up under <Link className="link" href="/accounts">Cash &amp; Bank</Link> so every payment lands in the right place and balances stay accurate.</small></div></div> : null}
    <QuickSaleForm
      customers={customers}
      products={products.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.sellingPrice != null ? Number(p.sellingPrice) : null }))}
      warehouses={warehouses} accounts={accounts} farms={farms} farmRequired={ctx.scope.limited} cycles={cycles} stock={stock}
      currency={ctx.tenant.currency} today={toDateInput(new Date())}
    />
  </>;
}
