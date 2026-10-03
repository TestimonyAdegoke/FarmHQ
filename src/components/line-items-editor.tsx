"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export type LineProduct = { id: string; name: string; unit: string; price: number | null; onHand?: number };

type Row = { key: number; productId: string; description: string; quantity: string; unit: string; unitPrice: string };

const blank = (key: number): Row => ({ key, productId: "", description: "", quantity: "", unit: "", unitPrice: "" });

/** Multi-line item entry. Field names repeat per row and are read server-side with FormData.getAll. */
export function LineItemsEditor({ products, currency, adjustments = false, priceLabel = "Unit price" }: {
  products: LineProduct[]; currency: string; adjustments?: boolean; priceLabel?: string;
}) {
  const uid = useId();
  const [rows, setRows] = useState<Row[]>([blank(1)]);
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");
  const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(n || 0);

  const update = (key: number, patch: Partial<Row>) => setRows(current => current.map(r => r.key === key ? { ...r, ...patch } : r));
  const pickProduct = (key: number, productId: string) => {
    const p = products.find(x => x.id === productId);
    update(key, p ? { productId, description: p.name, unit: p.unit, unitPrice: p.price != null ? String(p.price) : "" } : { productId: "" });
  };
  const subtotal = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0);
  const total = subtotal - (Number(discount) || 0) + (Number(tax) || 0);

  return <div className="line-items">
    {rows.map((row, index) => {
      const product = products.find(p => p.id === row.productId);
      const short = product?.onHand != null && Number(row.quantity) > product.onHand;
      const id = (field: string) => `${uid}-${row.key}-${field}`;
      return <div className="line-row" key={row.key}>
        <div className="field line-product"><label htmlFor={id("product")}>Item {index + 1}</label>
          <select id={id("product")} name="lineProductId" value={row.productId} onChange={e => pickProduct(row.key, e.target.value)}>
            <option value="">Other / not in stock list</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.onHand != null ? ` (${p.onHand} ${p.unit} in stock)` : ""}</option>)}
          </select>
        </div>
        <div className="field line-desc"><label htmlFor={id("desc")}>Description</label><input id={id("desc")} name="lineDescription" value={row.description} onChange={e => update(row.key, { description: e.target.value })} required placeholder="e.g. Crate of eggs" /></div>
        <div className="field line-qty"><label htmlFor={id("qty")}>Qty</label><input id={id("qty")} name="lineQuantity" type="number" inputMode="decimal" min="0.001" step="0.001" value={row.quantity} onChange={e => update(row.key, { quantity: e.target.value })} required />{short ? <small className="warn-text">Only {product?.onHand} in stock</small> : null}</div>
        <div className="field line-unit"><label htmlFor={id("unit")}>Unit</label><input id={id("unit")} name="lineUnit" value={row.unit} onChange={e => update(row.key, { unit: e.target.value })} required placeholder="kg" /></div>
        <div className="field line-price"><label htmlFor={id("price")}>{priceLabel}</label><input id={id("price")} name="lineUnitPrice" type="number" inputMode="decimal" min="0" step="0.01" value={row.unitPrice} onChange={e => update(row.key, { unitPrice: e.target.value })} required /></div>
        <div className="line-total"><small>Line total</small><b>{money((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0))}</b></div>
        {rows.length > 1 ? <button type="button" className="icon-button" aria-label={`Remove item ${index + 1}`} onClick={() => setRows(current => current.filter(r => r.key !== row.key))}><Trash2 size={16} /></button> : <span />}
      </div>;
    })}
    <div className="line-footer">
      <button type="button" className="button secondary small" onClick={() => setRows(current => [...current, blank(Math.max(...current.map(r => r.key)) + 1)])}><Plus size={15} /> Add item</button>
      <div className="line-summary">
        {adjustments ? <>
          <label className="inline-field">Discount<input name="discount" type="number" inputMode="decimal" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} /></label>
          <label className="inline-field">Tax / VAT<input name="tax" type="number" inputMode="decimal" min="0" step="0.01" value={tax} onChange={e => setTax(e.target.value)} /></label>
        </> : null}
        <div className="grand-total"><small>Total</small><strong>{money(total)}</strong></div>
      </div>
    </div>
  </div>;
}
