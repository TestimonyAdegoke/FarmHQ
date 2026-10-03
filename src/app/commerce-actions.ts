"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ExpenseStatus, InvoiceStatus, MoneyAccountType, PaymentMethod, RevenueType, SalesOrderStatus, type Prisma } from "@/generated/prisma/client";
import { audit, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { attempt, dateValue, fail, integerValue, lineItems, numberValue, optional, text } from "@/lib/forms";
import { invoiceBalance, nextDocumentNumber } from "@/lib/ledger";
import { assertOrganisationWide, farmWhere, isScoped, memberCan, resolveFarmId } from "@/lib/farm-scope";
import type { Permission } from "@/lib/permissions";
import { formatNumber } from "@/lib/utils";

type Tx = Prisma.TransactionClient;
type Line = { productId?: string; description: string; quantity: number; unit: string; unitPrice: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

async function context(...permissions: Permission[]) {
  const { session, membership } = await requireSession();
  if (!permissions.some(p => memberCan(membership, p))) fail("Your role does not allow this action.");
  return { tenantId: session.tenantId, userId: session.userId, scope: membership.farmScope };
}

function refresh(...paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

/** Retries a whole transaction when two people grab the same document number at the same moment. */
async function withNumberRetry<T>(fn: () => Promise<T>) {
  for (let attemptNo = 0; ; attemptNo++) {
    try {
      return await fn();
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2002" || attemptNo >= 2) throw error;
    }
  }
}

async function ownedAccount(tx: Tx | typeof db, tenantId: string, accountId?: string) {
  if (!accountId) return undefined;
  const account = await tx.moneyAccount.findFirst({ where: { id: accountId, tenantId, active: true }, select: { id: true } });
  if (!account) fail("Select a valid cash, bank or mobile-money account");
  return account.id;
}

async function validateLines(tx: Tx, tenantId: string, lines: Line[]) {
  const ids = [...new Set(lines.map(l => l.productId).filter((v): v is string => Boolean(v)))];
  if (!ids.length) return new Map<string, { name: string; unit: string }>();
  const products = await tx.product.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, unit: true } });
  if (products.length !== ids.length) fail("One of the selected products no longer exists");
  return new Map(products.map(p => [p.id, p]));
}

/** Blocks sales that would push a product below zero in the selling warehouse. */
async function assertStockAvailable(tx: Tx, tenantId: string, warehouseId: string, lines: Line[]) {
  const need = new Map<string, number>();
  for (const l of lines) if (l.productId) need.set(l.productId, (need.get(l.productId) || 0) + l.quantity);
  if (!need.size) return;
  const rows = await tx.inventoryTransaction.groupBy({ by: ["productId", "type"], where: { tenantId, warehouseId, productId: { in: [...need.keys()] } }, _sum: { quantity: true } });
  const onHand = new Map<string, number>();
  for (const r of rows) {
    const q = Number(r._sum.quantity || 0);
    const sign = ["ISSUE", "TRANSFER_OUT", "ADJUSTMENT_OUT", "SALE", "WASTE"].includes(r.type) ? -1 : 1;
    onHand.set(r.productId, (onHand.get(r.productId) || 0) + sign * q);
  }
  for (const [productId, needed] of need) {
    const available = onHand.get(productId) || 0;
    if (needed > available + 1e-9) {
      const [product, warehouse] = await Promise.all([
        tx.product.findUnique({ where: { id: productId }, select: { name: true, unit: true } }),
        tx.warehouse.findUnique({ where: { id: warehouseId }, select: { name: true } }),
      ]);
      fail(`Not enough ${product?.name} in ${warehouse?.name}: ${Math.max(0, available)} ${product?.unit} available, ${needed} needed. Record the stock first or reduce the quantity.`);
    }
  }
}

async function createInvoiceRecord(tx: Tx, args: {
  tenantId: string; userId: string; customerId: string; customerName: string; salesOrderId?: string; farmId?: string | null; cycleId?: string | null;
  items: Line[]; discount: number; tax: number; issueDate: Date; dueDate?: Date; notes?: string; revenueType: RevenueType;
}) {
  const subtotal = round2(args.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  if (args.discount < 0 || args.tax < 0) fail("Discount and tax cannot be negative");
  if (args.discount > subtotal) fail("Discount cannot be more than the invoice subtotal");
  const total = round2(subtotal - args.discount + args.tax);
  const invoiceNo = await nextDocumentNumber(tx, args.tenantId, "invoice");
  const invoice = await tx.invoice.create({
    data: {
      tenantId: args.tenantId, invoiceNo, customerId: args.customerId, salesOrderId: args.salesOrderId, farmId: args.farmId || undefined, cycleId: args.cycleId || undefined,
      status: total > 0 ? InvoiceStatus.ISSUED : InvoiceStatus.PAID, issueDate: args.issueDate, dueDate: args.dueDate, subtotal, discount: args.discount, tax: args.tax, total, notes: args.notes, createdById: args.userId,
      items: { create: args.items.map(i => ({ tenantId: args.tenantId, productId: i.productId, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, lineTotal: round2(i.quantity * i.unitPrice) })) },
    },
  });
  // Revenue is recognised when the invoice is issued, net of discount and excluding tax collected.
  const revenue = round2(subtotal - args.discount);
  if (revenue > 0) {
    await tx.revenue.create({ data: { tenantId: args.tenantId, farmId: args.farmId || undefined, cycleId: args.cycleId || undefined, type: args.revenueType, description: `Invoice ${invoiceNo}`, amount: revenue, customer: args.customerName, reference: invoiceNo, invoiceId: invoice.id, occurredAt: args.issueDate } });
  }
  return invoice;
}

async function applyPayment(tx: Tx, args: {
  tenantId: string; userId: string; customerId: string; invoiceId?: string; amount: number; method: PaymentMethod; accountId?: string; reference?: string; receivedAt: Date; notes?: string;
}) {
  if (!(args.amount > 0)) fail("Enter a payment amount greater than zero");
  let invoice: { id: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal } | null = null;
  if (args.invoiceId) {
    invoice = await tx.invoice.findFirst({ where: { id: args.invoiceId, tenantId: args.tenantId, customerId: args.customerId, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] } }, select: { id: true, total: true, amountPaid: true } });
    if (!invoice) fail("This invoice is not open for payment");
    const balance = invoiceBalance(invoice);
    if (args.amount > balance + 0.005) fail(`Payment is more than the outstanding balance of ${formatNumber(balance, 2)}`);
  }
  const receiptNo = await nextDocumentNumber(tx, args.tenantId, "receipt");
  const payment = await tx.paymentReceived.create({ data: { tenantId: args.tenantId, receiptNo, customerId: args.customerId, invoiceId: invoice?.id, accountId: args.accountId, amount: round2(args.amount), method: args.method, reference: args.reference, receivedAt: args.receivedAt, notes: args.notes, createdById: args.userId } });
  if (invoice) {
    const paid = round2(Number(invoice.amountPaid) + args.amount);
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: paid, status: paid >= Number(invoice.total) - 0.005 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID } });
  }
  return payment;
}

async function resolveCustomer(tx: Tx, tenantId: string, form: FormData) {
  const id = optional(form, "customerId");
  if (id) {
    const customer = await tx.customer.findFirst({ where: { id, tenantId }, select: { id: true, name: true, paymentTermsDays: true } });
    if (!customer) fail("Customer not found");
    return customer;
  }
  const name = optional(form, "newCustomerName") || "Walk-in customer";
  return tx.customer.upsert({
    where: { tenantId_name: { tenantId, name } },
    update: optional(form, "newCustomerPhone") ? { phone: optional(form, "newCustomerPhone") } : {},
    create: { tenantId, name, phone: optional(form, "newCustomerPhone") },
    select: { id: true, name: true, paymentTermsDays: true },
  });
}

function dueFrom(issueDate: Date, explicit: Date | undefined, termsDays: number | null | undefined) {
  if (explicit) return explicit;
  if (termsDays == null) return undefined;
  return new Date(issueDate.getTime() + termsDays * 86_400_000);
}

const methodOf = (form: FormData) => z.nativeEnum(PaymentMethod).parse(text(form, "method") || "CASH");

/** One-step sale for the farm gate or market: order, stock movement, invoice and payment together. */
export async function quickSaleAction(form: FormData) {
  let invoiceId = "";
  const result = await attempt(async () => {
    const { tenantId, userId, scope } = await context("sales.manage");
    const items = lineItems(form);
    const warehouseId = optional(form, "warehouseId");
    const farmId = resolveFarmId(scope, optional(form, "farmId"));
    const cycleId = optional(form, "cycleId");
    const saleDate = dateValue(form, "saleDate") || new Date();
    const discount = numberValue(form, "discount") || 0;
    const tax = numberValue(form, "tax") || 0;
    const method = methodOf(form);
    const revenueType = z.nativeEnum(RevenueType).parse(text(form, "revenueType") || "HARVEST_SALE");
    const outcome = await withNumberRetry(() => db.$transaction(async tx => {
      await validateLines(tx, tenantId, items);
      if (warehouseId && !(await tx.warehouse.findFirst({ where: { id: warehouseId, tenantId, ...farmWhere(scope) }, select: { id: true } }))) fail("Warehouse not found");
      if (farmId && !(await tx.farm.findFirst({ where: { id: farmId, tenantId }, select: { id: true } }))) fail("Farm not found");
      if (cycleId && !(await tx.productionCycle.findFirst({ where: { id: cycleId, tenantId, ...farmWhere(scope) }, select: { id: true } }))) fail("Production cycle not found");
      const accountId = await ownedAccount(tx, tenantId, optional(form, "accountId"));
      const customer = await resolveCustomer(tx, tenantId, form);
      if (warehouseId) await assertStockAvailable(tx, tenantId, warehouseId, items);
      const orderNo = `SO-${saleDate.getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const order = await tx.salesOrder.create({
        data: {
          tenantId, farmId, cycleId, customerId: customer.id, warehouseId, orderNo, status: SalesOrderStatus.INVOICED, orderDate: saleDate, deliveryDate: saleDate, notes: optional(form, "notes"),
          items: { create: items.map(i => ({ tenantId, productId: i.productId, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, fulfilledQty: warehouseId && i.productId ? i.quantity : 0 })) },
        },
      });
      if (warehouseId) {
        for (const i of items.filter(l => l.productId)) {
          await tx.inventoryTransaction.create({ data: { tenantId, warehouseId, productId: i.productId!, cycleId, type: "SALE", quantity: i.quantity, reference: order.orderNo, occurredAt: saleDate } });
        }
      }
      const invoice = await createInvoiceRecord(tx, { tenantId, userId, customerId: customer.id, customerName: customer.name, salesOrderId: order.id, farmId, cycleId, items, discount, tax, issueDate: saleDate, dueDate: dueFrom(saleDate, dateValue(form, "dueDate"), customer.paymentTermsDays), notes: optional(form, "notes"), revenueType });
      const paidInFull = text(form, "paidInFull") === "on";
      const amount = paidInFull ? Number(invoice.total) : numberValue(form, "amountPaid") || 0;
      let receiptNo: string | undefined;
      if (amount > 0) receiptNo = (await applyPayment(tx, { tenantId, userId, customerId: customer.id, invoiceId: invoice.id, amount, method, accountId, reference: optional(form, "paymentReference"), receivedAt: saleDate })).receiptNo;
      return { invoice, order, receiptNo };
    }));
    invoiceId = outcome.invoice.id;
    await audit("sale.quick", "Invoice", outcome.invoice.id, { invoiceNo: outcome.invoice.invoiceNo, orderNo: outcome.order.orderNo, total: outcome.invoice.total.toString() });
    refresh("/sales", "/sales/invoices", "/inventory", "/finance", "/accounts", "/dashboard", "/profitability");
  });
  if (result.ok && invoiceId) redirect(`/sales/invoices/${invoiceId}?created=1`);
  return result;
}

export async function createSalesOrderAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, scope } = await context("sales.manage");
    const items = lineItems(form);
    const customerId = text(form, "customerId");
    const farmId = resolveFarmId(scope, optional(form, "farmId"));
    const cycleId = optional(form, "cycleId");
    const warehouseId = optional(form, "warehouseId");
    const order = await db.$transaction(async tx => {
      await validateLines(tx, tenantId, items);
      const [customer, farm, cycle, warehouse] = await Promise.all([
        tx.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } }),
        farmId ? tx.farm.findFirst({ where: { id: farmId, tenantId }, select: { id: true } }) : Promise.resolve({ id: "" }),
        cycleId ? tx.productionCycle.findFirst({ where: { id: cycleId, tenantId, ...farmWhere(scope) }, select: { id: true } }) : Promise.resolve({ id: "" }),
        warehouseId ? tx.warehouse.findFirst({ where: { id: warehouseId, tenantId, ...farmWhere(scope) }, select: { id: true } }) : Promise.resolve({ id: "" }),
      ]);
      if (!customer) fail("Select a customer");
      if (!farm || !cycle || !warehouse) fail("Invalid farm, cycle or warehouse");
      const orderDate = dateValue(form, "orderDate") || new Date();
      return tx.salesOrder.create({
        data: {
          tenantId, farmId, cycleId, customerId, warehouseId, orderNo: `SO-${orderDate.getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          status: z.enum(["DRAFT", "CONFIRMED"]).parse(text(form, "status") || "CONFIRMED"), orderDate, deliveryDate: dateValue(form, "deliveryDate"), notes: optional(form, "notes"),
          items: { create: items.map(i => ({ tenantId, ...i })) },
        },
      });
    });
    await audit("sales_order.create", "SalesOrder", order.id, { orderNo: order.orderNo });
    refresh("/sales");
    return `Order ${order.orderNo} created`;
  });
}

/** Delivers an order: posts stock out (if a warehouse is set) and issues the invoice that recognises revenue. */
export async function fulfillSalesOrderAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId, scope } = await context("sales.manage");
    const id = text(form, "id");
    const invoice = await withNumberRetry(() => db.$transaction(async tx => {
      const order = await tx.salesOrder.findFirst({ where: { id, tenantId, ...farmWhere(scope) }, include: { items: true, customer: true, invoice: true } });
      if (!order || !["DRAFT", "CONFIRMED"].includes(order.status)) fail("This order has already been delivered or cancelled");
      const lines: Line[] = order.items.map(i => ({ productId: i.productId || undefined, description: i.description, quantity: Number(i.quantity), unit: i.unit, unitPrice: Number(i.unitPrice) }));
      const now = new Date();
      if (order.warehouseId) {
        const outstanding = order.items.filter(i => i.productId && Number(i.quantity) > Number(i.fulfilledQty)).map(i => ({ ...i, outstanding: Number(i.quantity) - Number(i.fulfilledQty) }));
        await assertStockAvailable(tx, tenantId, order.warehouseId, outstanding.map(i => ({ productId: i.productId!, description: i.description, quantity: i.outstanding, unit: i.unit, unitPrice: 0 })));
        for (const item of outstanding) {
          await tx.inventoryTransaction.create({ data: { tenantId, warehouseId: order.warehouseId, productId: item.productId!, cycleId: order.cycleId, type: "SALE", quantity: item.outstanding, reference: order.orderNo, occurredAt: now } });
          await tx.salesOrderItem.update({ where: { id: item.id }, data: { fulfilledQty: item.quantity } });
        }
      }
      const created = order.invoice ?? await createInvoiceRecord(tx, { tenantId, userId, customerId: order.customerId, customerName: order.customer.name, salesOrderId: order.id, farmId: order.farmId, cycleId: order.cycleId, items: lines, discount: 0, tax: 0, issueDate: now, dueDate: dueFrom(now, undefined, order.customer.paymentTermsDays), revenueType: RevenueType.HARVEST_SALE });
      await tx.salesOrder.update({ where: { id: order.id }, data: { status: SalesOrderStatus.INVOICED, deliveryDate: order.deliveryDate ?? now } });
      return created;
    }));
    await audit("sales_order.fulfill", "SalesOrder", id, { invoiceNo: invoice.invoiceNo });
    refresh("/sales", "/sales/invoices", "/inventory", "/finance", "/profitability", "/dashboard");
    return `Delivered and invoiced as ${invoice.invoiceNo}`;
  });
}

export async function cancelSalesOrderAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, scope } = await context("sales.manage");
    const id = text(form, "id");
    const order = await db.salesOrder.findFirst({ where: { id, tenantId, ...farmWhere(scope) }, select: { status: true } });
    if (!order || !["DRAFT", "CONFIRMED"].includes(order.status)) fail("Only open orders can be cancelled");
    await db.salesOrder.update({ where: { id }, data: { status: SalesOrderStatus.CANCELLED } });
    await audit("sales_order.cancel", "SalesOrder", id);
    refresh("/sales");
  });
}

export async function createInvoiceAction(form: FormData) {
  let invoiceId = "";
  const result = await attempt(async () => {
    const { tenantId, userId, scope } = await context("sales.manage");
    const items = lineItems(form);
    const farmId = resolveFarmId(scope, optional(form, "farmId"));
    const cycleId = optional(form, "cycleId");
    const invoice = await withNumberRetry(() => db.$transaction(async tx => {
      await validateLines(tx, tenantId, items);
      if (farmId && !(await tx.farm.findFirst({ where: { id: farmId, tenantId }, select: { id: true } }))) fail("Farm not found");
      if (cycleId && !(await tx.productionCycle.findFirst({ where: { id: cycleId, tenantId, ...farmWhere(scope) }, select: { id: true } }))) fail("Production cycle not found");
      const customer = await resolveCustomer(tx, tenantId, form);
      const issueDate = dateValue(form, "issueDate") || new Date();
      return createInvoiceRecord(tx, { tenantId, userId, customerId: customer.id, customerName: customer.name, farmId, cycleId, items, discount: numberValue(form, "discount") || 0, tax: numberValue(form, "tax") || 0, issueDate, dueDate: dueFrom(issueDate, dateValue(form, "dueDate"), customer.paymentTermsDays), notes: optional(form, "notes"), revenueType: z.nativeEnum(RevenueType).parse(text(form, "revenueType") || "OTHER") });
    }));
    invoiceId = invoice.id;
    await audit("invoice.create", "Invoice", invoice.id, { invoiceNo: invoice.invoiceNo, total: invoice.total.toString() });
    refresh("/sales/invoices", "/finance", "/dashboard", "/profitability");
  });
  if (result.ok && invoiceId) redirect(`/sales/invoices/${invoiceId}?created=1`);
  return result;
}

export async function recordInvoicePaymentAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId, scope } = await context("sales.manage", "finance.manage");
    const invoiceId = text(form, "invoiceId");
    const payment = await withNumberRetry(() => db.$transaction(async tx => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId, ...farmWhere(scope) }, select: { customerId: true } });
      if (!invoice) fail("Invoice not found");
      return applyPayment(tx, { tenantId, userId, customerId: invoice.customerId, invoiceId, amount: z.number().positive().parse(numberValue(form, "amount")), method: methodOf(form), accountId: await ownedAccount(tx, tenantId, optional(form, "accountId")), reference: optional(form, "reference"), receivedAt: dateValue(form, "receivedAt") || new Date(), notes: optional(form, "notes") });
    }));
    await audit("payment.receive", "PaymentReceived", payment.id, { receiptNo: payment.receiptNo, amount: payment.amount.toString() });
    refresh(`/sales/invoices/${invoiceId}`, "/sales/invoices", "/accounts", "/dashboard");
    return `Payment recorded · receipt ${payment.receiptNo}`;
  });
}

/** Receives money from a customer and allocates it to their oldest open invoices; any excess is kept as customer credit. */
export async function receiveCustomerPaymentAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId, scope } = await context("sales.manage", "finance.manage");
    const customerId = text(form, "customerId");
    const amount = z.number().positive().parse(numberValue(form, "amount"));
    const receipts = await withNumberRetry(() => db.$transaction(async tx => {
      if (!(await tx.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } }))) fail("Customer not found");
      const accountId = await ownedAccount(tx, tenantId, optional(form, "accountId"));
      const open = await tx.invoice.findMany({ where: { tenantId, customerId, ...farmWhere(scope), status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] } }, orderBy: [{ issueDate: "asc" }, { invoiceNo: "asc" }], select: { id: true, total: true, amountPaid: true } });
      let remaining = round2(amount);
      const made: string[] = [];
      const base = { tenantId, userId, customerId, method: methodOf(form), accountId, reference: optional(form, "reference"), receivedAt: dateValue(form, "receivedAt") || new Date(), notes: optional(form, "notes") };
      for (const inv of open) {
        if (remaining <= 0) break;
        const share = round2(Math.min(remaining, invoiceBalance(inv)));
        if (share <= 0) continue;
        made.push((await applyPayment(tx, { ...base, invoiceId: inv.id, amount: share })).receiptNo);
        remaining = round2(remaining - share);
      }
      if (remaining > 0 && isScoped(scope)) fail(`This is ${formatNumber(remaining, 2)} more than the customer owes on your farms' invoices. Ask someone with access to all farms to record customer credit.`);
      if (remaining > 0) made.push((await applyPayment(tx, { ...base, amount: remaining, notes: base.notes || "Customer credit / advance payment" })).receiptNo);
      return made;
    }));
    await audit("payment.receive_customer", "Customer", customerId, { amount, receipts });
    refresh(`/sales/customers/${customerId}`, "/sales/invoices", "/accounts", "/dashboard");
    return `Payment recorded · ${receipts.join(", ")}`;
  });
}

export async function voidInvoiceAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, scope } = await context("sales.manage");
    const id = text(form, "id");
    const reason = optional(form, "reason");
    await db.$transaction(async tx => {
      const invoice = await tx.invoice.findFirst({ where: { id, tenantId, ...farmWhere(scope) }, select: { status: true, amountPaid: true, notes: true } });
      if (!invoice || invoice.status === InvoiceStatus.VOID) fail("Invoice not found or already void");
      if (Number(invoice.amountPaid) > 0) fail("This invoice has payments. Record a refund expense instead of voiding it.");
      await tx.revenue.deleteMany({ where: { tenantId, invoiceId: id } });
      await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.VOID, voidedAt: new Date(), notes: reason ? `${invoice.notes ? invoice.notes + "\n" : ""}Voided: ${reason}` : invoice.notes } });
    });
    await audit("invoice.void", "Invoice", id, { reason });
    refresh(`/sales/invoices/${id}`, "/sales/invoices", "/finance", "/profitability", "/dashboard");
    return "Invoice voided";
  });
}

export async function saveCustomerAction(form: FormData) {
  return attempt(async () => {
    const { tenantId } = await context("sales.manage");
    const id = optional(form, "id");
    const data = {
      name: z.string().min(2, "Enter the customer name").parse(text(form, "name")),
      email: optional(form, "email") ? z.string().email().parse(text(form, "email")) : null,
      phone: optional(form, "phone") || null,
      address: optional(form, "address") || null,
      paymentTermsDays: integerValue(form, "paymentTermsDays") ?? null,
      creditLimit: numberValue(form, "creditLimit") ?? null,
    };
    if (id) {
      if (!(await db.customer.findFirst({ where: { id, tenantId }, select: { id: true } }))) fail("Customer not found");
      await db.customer.update({ where: { id }, data });
      await audit("customer.update", "Customer", id, { name: data.name });
      refresh(`/sales/customers/${id}`, "/sales");
      return "Customer updated";
    }
    const customer = await db.customer.create({ data: { tenantId, ...data } });
    await audit("customer.create", "Customer", customer.id, { name: customer.name });
    refresh("/sales", "/sales/quick", "/sales/invoices");
    return `${customer.name} added`;
  });
}

// ── Money accounts ──────────────────────────────────────────────────────────

export async function createMoneyAccountAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, scope } = await context("finance.manage");
    assertOrganisationWide(scope, "cash and bank accounts");
    const account = await db.moneyAccount.create({
      data: {
        tenantId,
        name: z.string().min(2, "Enter an account name").parse(text(form, "name")),
        type: z.nativeEnum(MoneyAccountType).parse(text(form, "type") || "CASH"),
        provider: optional(form, "provider"),
        accountNumber: optional(form, "accountNumber"),
        openingBalance: numberValue(form, "openingBalance") || 0,
      },
    });
    await audit("account.create", "MoneyAccount", account.id, { name: account.name });
    refresh("/accounts");
    return `${account.name} created`;
  });
}

export async function toggleMoneyAccountAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, scope } = await context("finance.manage");
    assertOrganisationWide(scope, "cash and bank accounts");
    const id = text(form, "id");
    const account = await db.moneyAccount.findFirst({ where: { id, tenantId }, select: { active: true } });
    if (!account) fail("Account not found");
    await db.moneyAccount.update({ where: { id }, data: { active: !account.active } });
    await audit("account.toggle", "MoneyAccount", id, { active: !account.active });
    refresh("/accounts");
  });
}

export async function transferFundsAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId, scope } = await context("finance.manage");
    assertOrganisationWide(scope, "transfers between accounts");
    const fromAccountId = await ownedAccount(db, tenantId, text(form, "fromAccountId"));
    const toAccountId = await ownedAccount(db, tenantId, text(form, "toAccountId"));
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) fail("Choose two different accounts");
    const transfer = await db.accountTransfer.create({
      data: { tenantId, fromAccountId, toAccountId, amount: z.number().positive().parse(numberValue(form, "amount")), transferredAt: dateValue(form, "transferredAt") || new Date(), reference: optional(form, "reference"), notes: optional(form, "notes"), createdById: userId },
    });
    await audit("account.transfer", "AccountTransfer", transfer.id, { amount: transfer.amount.toString() });
    refresh("/accounts", "/dashboard");
    return "Transfer recorded";
  });
}

// ── Expenses & supplier payments ────────────────────────────────────────────

export async function updateExpenseStatusAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, scope } = await context("finance.manage");
    const id = text(form, "id");
    const status = z.nativeEnum(ExpenseStatus).parse(text(form, "status"));
    const expense = await db.expense.findFirst({ where: { id, tenantId, ...farmWhere(scope) }, select: { status: true } });
    if (!expense) fail("Expense not found");
    const allowed: Record<string, ExpenseStatus[]> = {
      DRAFT: ["SUBMITTED", "APPROVED", "REJECTED", "VOID"], SUBMITTED: ["APPROVED", "REJECTED", "VOID"], APPROVED: ["PAID", "VOID"], REJECTED: ["SUBMITTED", "VOID"], PAID: ["VOID"], VOID: [],
    };
    if (!allowed[expense.status].includes(status)) fail(`A ${expense.status.toLowerCase()} expense cannot be marked ${status.toLowerCase()}`);
    const accountId = status === "PAID" ? await ownedAccount(db, tenantId, optional(form, "accountId")) : undefined;
    await db.expense.update({ where: { id }, data: { status, ...(status === "PAID" ? { accountId, paidAt: dateValue(form, "paidAt") || new Date() } : {}), ...(status === "VOID" ? { accountId: null } : {}) } });
    await audit("expense.status", "Expense", id, { status });
    refresh("/finance", "/accounts", "/profitability", "/dashboard");
  });
}

export async function recordVendorPaymentAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId, scope } = await context("procurement.manage", "finance.manage");
    const purchaseOrderId = optional(form, "purchaseOrderId");
    if (!purchaseOrderId && isScoped(scope)) fail("Select the purchase order this payment is for.");
    let vendorId = optional(form, "vendorId");
    const amount = z.number().positive().parse(numberValue(form, "amount"));
    if (purchaseOrderId) {
      const po = await db.purchaseOrder.findFirst({ where: { id: purchaseOrderId, tenantId, ...farmWhere(scope) }, include: { items: true, payments: true } });
      if (!po) fail("Purchase order not found");
      vendorId = po.vendorId;
      const total = po.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
      const paid = po.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (amount > total - paid + 0.005) fail(`Payment is more than the ${formatNumber(total - paid, 2)} still owed on ${po.orderNo}`);
    }
    if (!vendorId || !(await db.vendor.findFirst({ where: { id: vendorId, tenantId }, select: { id: true } }))) fail("Select a supplier");
    const payment = await db.vendorPayment.create({
      data: { tenantId, vendorId, purchaseOrderId, accountId: await ownedAccount(db, tenantId, optional(form, "accountId")), amount, method: methodOf(form), reference: optional(form, "reference"), paidAt: dateValue(form, "paidAt") || new Date(), notes: optional(form, "notes"), createdById: userId },
    });
    await audit("vendor_payment.create", "VendorPayment", payment.id, { amount: payment.amount.toString() });
    refresh("/procurement", "/accounts", "/dashboard");
    return "Supplier payment recorded";
  });
}
