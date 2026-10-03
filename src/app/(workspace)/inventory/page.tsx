import { ArrowDownToLine, ArrowRightLeft, Boxes, Warehouse as WarehouseIcon } from "lucide-react";
import { createProductAction, createWarehouseAction, postInventoryAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { stockPositions } from "@/lib/ledger";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Inventory" };

const outbound = ["ISSUE","ADJUSTMENT_OUT","WASTE"];

export default async function InventoryPage() {
  const ctx = await tenantContext("inventory.view");
  const [farms, warehouses, products, cycles, txns, positions, valuationRows] = await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.warehouse.findMany({where:{tenantId:ctx.tenantId,active:true},include:{farm:true},orderBy:{name:"asc"}}),
    db.product.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.productionCycle.findMany({where:{tenantId:ctx.tenantId,status:{in:["PLANNED","ACTIVE","PAUSED"]}},orderBy:{name:"asc"}}),
    db.inventoryTransaction.findMany({where:{tenantId:ctx.tenantId},include:{product:true,warehouse:true,cycle:true},orderBy:{occurredAt:"desc"},take:100}),
    stockPositions(ctx.tenantId),
    // Weighted inbound cost per product, used to value what is on hand.
    db.inventoryTransaction.groupBy({by:["productId"],where:{tenantId:ctx.tenantId,type:{in:["OPENING","PURCHASE","RECEIPT","PRODUCTION","ADJUSTMENT_IN","RETURN"]},unitCost:{not:null}},_sum:{quantity:true},_avg:{unitCost:true}}),
  ]);
  const stock = positions.byProduct;
  const avgCost = new Map(valuationRows.map(r=>[r.productId,Number(r._avg.unitCost||0)]));
  const value = new Map(products.map(p=>[p.id,(stock.get(p.id)||0)*(avgCost.get(p.id)||Number(p.standardCost||0))]));
  const lowStock = products.filter(p=>p.reorderLevel!=null && (stock.get(p.id)||0)<=Number(p.reorderLevel)).length;
  const totalValue = [...value.values()].reduce((a,b)=>a+b,0);
  const money = (n: number | string | { toString(): string }) => formatMoney(n,ctx.tenant.currency);

  return <>
    <PageHeader eyebrow="Stock control" title="Inventory" description="Inputs, feed, chemicals, spares and harvested stock, worked out from every movement in and out."/>
    <section className="metrics">
      <MetricCard label="Products" value={String(products.length)} hint={`${lowStock} at or below reorder level`} icon={<Boxes size={16}/>}/>
      <MetricCard label="Warehouses" value={String(warehouses.length)} hint="Active stock locations" icon={<WarehouseIcon size={16}/>}/>
      <MetricCard label="Estimated stock value" value={money(totalValue)} hint="Based on recorded unit costs" icon={<ArrowDownToLine size={16}/>}/>
      <MetricCard label="Movements" value={String(txns.length)} hint="Latest 100 shown below" icon={<ArrowRightLeft size={16}/>}/>
    </section>

    <div className="drawers">
      <FormDetails title="Receive or issue stock" hint="Stock levels are worked out from these movements, never edited directly.">
        <ActionForm action={postInventoryAction} success="Movement posted">
          <div className="form-grid two">
            <div className="field"><label>Warehouse</label><select name="warehouseId" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="field"><label>Product</label><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label>Movement</label><select name="type" defaultValue="RECEIPT"><option value="RECEIPT">Receipt</option><option value="ISSUE">Issue</option><option value="ADJUSTMENT_IN">Adjustment in</option><option value="ADJUSTMENT_OUT">Adjustment out</option></select></div>
            <div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div>
            <div className="field"><label>Unit cost</label><input name="unitCost" type="number" min="0" step="0.0001"/></div>
            <div className="field"><label>Lot / batch</label><input name="lotNumber"/></div>
            <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not allocated</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Reference</label><input name="reference" placeholder="PO, GRN, work order..."/></div>
          </div>
          <div className="form-actions"><button className="button" disabled={!warehouses.length||!products.length}>Post movement</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Add product" hint="Anything you buy, store, use or sell." open={!products.length}>
        <ActionForm action={createProductAction} success="Product added">
          <div className="form-grid two">
            <div className="field"><label>Name</label><input name="name" required placeholder="NPK 15-15-15"/></div>
            <div className="field"><label>SKU</label><input name="sku"/></div>
            <div className="field"><label>Category</label><input name="category" required placeholder="Fertilizer"/></div>
            <div className="field"><label>Unit</label><input name="unit" required placeholder="bag"/></div>
            <div className="field"><label>Reorder level</label><input name="reorderLevel" type="number" min="0" step="0.001"/></div>
            <div className="field"><label>Standard cost</label><input name="standardCost" type="number" min="0" step="0.01"/></div>
            <div className="field span-2"><label>Selling price (used on sales &amp; invoices)</label><input name="sellingPrice" type="number" min="0" step="0.01"/></div>
          </div>
          <div className="form-actions"><button className="button">Add product</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Add warehouse" hint="A store, shed or cold room where stock is kept." open={!warehouses.length}>
        <ActionForm action={createWarehouseAction} success="Warehouse added">
          <div className="form-grid two">
            <div className="field"><label>Name</label><input name="name" required placeholder="Central Store"/></div>
            <div className="field"><label>Farm (optional)</label><select name="farmId" defaultValue=""><option value="">Organization-wide</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          </div>
          <div className="form-actions"><button className="button">Add warehouse</button></div>
        </ActionForm>
      </FormDetails>
    </div>

    {products.length ? <div className="card"><div className="card-head"><div><h2>Stock position</h2><div className="card-sub">What is on hand now, by product and store</div></div></div>
      <div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th className="text-right">On hand</th><th>By store</th><th className="text-right">Reorder at</th><th className="text-right">Selling price</th><th className="text-right">Est. value</th><th>Status</th></tr></thead><tbody>{products.map(p=>{
        const on=stock.get(p.id)||0;
        const low=p.reorderLevel!=null&&on<=Number(p.reorderLevel);
        return <tr key={p.id}><td><b>{p.name}</b><div className="sub">{p.sku||"No SKU"}</div></td><td>{p.category}</td><td className="text-right nowrap">{formatNumber(on,3)} {p.unit}</td><td className="sub">{warehouses.map(w=>[w.name,positions.byLocation.get(`${w.id}:${p.id}`)||0] as const).filter(([,q])=>q).map(([n,q])=>`${n}: ${formatNumber(q,2)}`).join(" · ")||"—"}</td><td className="text-right">{p.reorderLevel?formatNumber(p.reorderLevel,3):"—"}</td><td className="text-right">{p.sellingPrice?money(p.sellingPrice):"—"}</td><td className="text-right">{money(value.get(p.id)||0)}</td><td><span className={`status ${low?"warn":""}`}>{low?"Reorder":"OK"}</span></td></tr>;
      })}</tbody></table></div>
    </div> : <div className="card"><EmptyState title="No inventory yet" text="Add a warehouse and a product, then post your first stock receipt." icon={<Boxes size={20}/>}/></div>}

    {txns.length ? <div className="card"><div className="card-head"><h2>Recent movements</h2></div>
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Movement</th><th>Product</th><th>Warehouse</th><th className="text-right">Quantity</th><th>Cycle / reference</th></tr></thead><tbody>{txns.map(t=><tr key={t.id}><td>{safeDate(t.occurredAt)}</td><td><span className={`status ${outbound.includes(t.type)?"neutral":"info"}`}>{humanize(t.type)}</span></td><td>{t.product.name}</td><td>{t.warehouse.name}</td><td className="text-right nowrap">{formatNumber(t.quantity,3)} {t.product.unit}</td><td>{t.cycle?.name||"—"}<div className="sub">{t.reference||""}</div></td></tr>)}</tbody></table></div>
    </div> : null}
  </>;
}
