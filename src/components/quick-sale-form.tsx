"use client";

import { useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { LineItemsEditor } from "@/components/line-items-editor";
import { quickSaleAction } from "@/app/commerce-actions";
import { paymentMethods, revenueTypes } from "@/lib/options";

type Option = { id: string; name: string };

export function QuickSaleForm({ customers, products, warehouses, accounts, farms, cycles, stock, currency, today }: {
  customers: (Option & { phone: string | null })[];
  products: { id: string; name: string; unit: string; price: number | null }[];
  warehouses: Option[];
  accounts: (Option & { type: string })[];
  farms: Option[];
  cycles: (Option & { farmId: string })[];
  stock: Record<string, Record<string, number>>;
  currency: string;
  today: string;
}) {
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses.length === 1 ? warehouses[0].id : "");
  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [paidInFull, setPaidInFull] = useState(true);
  const [method, setMethod] = useState("CASH");
  const lineProducts = useMemo(() => products.map(p => ({ ...p, onHand: warehouseId ? stock[warehouseId]?.[p.id] ?? 0 : undefined })), [products, stock, warehouseId]);
  const suggestedAccount = accounts.find(a => (method === "CASH" && a.type === "CASH") || (method === "MOBILE_MONEY" && a.type === "MOBILE_MONEY") || (["BANK_TRANSFER", "POS_CARD", "CHEQUE"].includes(method) && a.type === "BANK"));

  return <ActionForm action={quickSaleAction} className="form-card" reset={false}>
    <div className="card-head"><div><h3>1. Who is buying?</h3><div className="muted small-text" style={{ marginTop: 4 }}>Leave blank for a walk-in cash customer.</div></div><Zap size={19} /></div>
    <div className="form-grid">
      <div className="field span-2"><label>Customer</label><select name="customerId" value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">New or walk-in customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}</select></div>
      {!customerId ? <>
        <div className="field"><label>Name (optional)</label><input name="newCustomerName" placeholder="Walk-in customer" /></div>
        <div className="field"><label>Phone (optional)</label><input name="newCustomerPhone" type="tel" inputMode="tel" placeholder="0803 000 0000" /></div>
      </> : null}
    </div>

    <div className="card-head" style={{ marginTop: 22 }}><h3>2. What are they buying?</h3></div>
    <div className="form-grid">
      <div className="field"><label>Sell from store</label><select name="warehouseId" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}><option value="">Don&apos;t reduce stock</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div className="field"><label>Farm</label><select name="farmId" value={farmId} onChange={e => setFarmId(e.target.value)}><option value="">Organization-wide</option>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
      <div className="field"><label>Production cycle (optional)</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{cycles.filter(c => !farmId || c.farmId === farmId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="field"><label>Income type</label><select name="revenueType" defaultValue="HARVEST_SALE">{revenueTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
    </div>
    <LineItemsEditor products={lineProducts} currency={currency} adjustments />

    <div className="card-head" style={{ marginTop: 22 }}><h3>3. Payment</h3></div>
    <div className="form-grid">
      <div className="field"><label>Sale date</label><input name="saleDate" type="date" defaultValue={today} /></div>
      <div className="field"><label>Paid how?</label><select name="method" value={method} onChange={e => setMethod(e.target.value)}>{paymentMethods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="field"><label>Into account</label><select name="accountId" key={suggestedAccount?.id || "none"} defaultValue={suggestedAccount?.id || ""}><option value="">Not tracked</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <div className="field"><label>Reference (optional)</label><input name="paymentReference" placeholder="Transfer / transaction ID" /></div>
      <div className="field span-2" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <input id="paidInFull" name="paidInFull" type="checkbox" checked={paidInFull} onChange={e => setPaidInFull(e.target.checked)} style={{ width: 22, height: 22, minHeight: 0 }} />
        <label htmlFor="paidInFull" style={{ fontSize: 14 }}>Customer paid the full amount now</label>
      </div>
      {!paidInFull ? <>
        <div className="field"><label>Amount paid now</label><input name="amountPaid" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0 if on credit" /></div>
        <div className="field"><label>Balance due by</label><input name="dueDate" type="date" /></div>
      </> : null}
      <div className="field span-2"><label>Notes</label><input name="notes" placeholder="Delivery details, vehicle, buyer's agent…" /></div>
    </div>
    <div className="form-actions"><button className="button"><Zap size={16} /> Complete sale</button></div>
  </ActionForm>;
}
