# FarmHQ

> Current application milestone: **v0.5.0**

**FarmHQ is the operating system for modern farm businesses.**

FarmHQ is a multi-tenant SaaS foundation for commercial crop, livestock, poultry, aquaculture and mixed-farm operations. The data model is centered on a simple operational chain:

**Tenant → Farm → Production Unit → Production Cycle → Work / Inputs / Labour / Equipment / Output / Revenue**

That structure allows operational records to roll into traceability, inventory and profitability instead of living in disconnected spreadsheets.

## Implemented domains

### SaaS / tenancy
- Global user identity with tenant-specific memberships and roles
- Secure first-owner bootstrap flow
- Password authentication and HTTP-only JWT session cookie
- Multi-organization workspace switching
- Role/permission matrix for organization, farm, production, procurement, sales, workforce, finance, inventory and livestock domains
- Team invitations with expiring tokens
- Invitation acceptance for both new and existing FarmHQ users
- Immutable tenant audit log
- Optional PostgreSQL row-level-security hardening in `prisma/rls.sql`

### Farm structure
- Multiple farms per tenant
- Crop, livestock, poultry, aquaculture, greenhouse, orchard and mixed farm types
- Production units: fields, plots, greenhouses, orchards, barns, pens, poultry houses, ponds, tanks, grazing areas, nurseries and more
- Latitude/longitude plus GeoJSON-ready field geometry
- PostgreSQL/PostGIS-ready local database

### Production engine
- Unified crop, livestock, poultry and aquaculture production cycles
- Budget, target quantity, dates, status, commodity/species and variety/breed
- Work/tasks, priority, assignee, due date and lifecycle status

### Crop operations
- Field activity planning: land preparation, planting, irrigation, fertilizer, spraying, weeding, scouting and harvest
- Activity completion tracking
- Field scouting observations with severity, affected area, GPS coordinates and recommendations
- Issue resolution tracking
- Harvest records, grade and lot/batch tracking
- Optional harvest-to-inventory posting

### Inventory
- Warehouses and products
- Ledger-based stock rather than mutable quantity fields
- Receipts, purchases, issues, adjustments, production, sales, returns and waste
- Lot/batch references
- Production-cycle allocation of consumed inputs
- Reorder levels and low-stock exceptions
- Estimated stock valuation

### Procurement
- Vendor master
- Purchase requests and approval state
- Purchase orders
- Farm/request/warehouse references
- Product-linked PO lines
- Goods receipt from a PO directly into the inventory ledger

### Sales
- Customer master
- Sales orders linked to farms and production cycles
- Warehouse/product fulfilment
- Fulfilment posts inventory SALE movements
- Fulfilment automatically creates production-linked revenue

### Finance & profitability
- Production/farm expenses
- Revenue records
- Farm and cycle allocation
- Profitability by production cycle combining:
  - approved direct expenses
  - consumed inventory inputs
  - approved labour cost
  - equipment operating cost
  - revenue
  - harvest output
  - budget variance
  - cost per comparable output unit

### Livestock
- Individual animal register
- Species, breed, sex, tag, location and lifecycle state
- Health/production event history
- Weight, vaccination, treatment, deworming, diagnosis, breeding, pregnancy, birth and other events
- Medication, dosage, veterinarian and next-due date

### Poultry
- Poultry production cycles
- Daily flock records
- Opening birds, mortality, culls, feed, water, eggs and average weight
- Aggregated operational metrics

### Aquaculture
- Pond/tank production cycles
- Sampling records
- Average weight, mortality and feed
- pH, dissolved oxygen and temperature

### Workforce
- Farm workers, employees, contractors and seasonal labour
- Farm assignment, job title and default hourly rate
- Timesheets allocated to farm/production cycle
- Approval workflow
- Approved labour automatically contributes to production cost

### Equipment
- Machinery and equipment register
- Purchase value, meter reading and service thresholds
- Usage, fuel, maintenance, breakdown and inspection logs
- Production-cycle cost allocation
- Operating cost contributes directly to profitability

### Management
- Operational command-centre dashboard
- Low-stock alerts
- High/critical scouting exceptions
- Blocked work visibility
- Pending procurement visibility
- Revenue/spend operating position
- Analytics and cycle cost views

## Technology

- Next.js 16.3.8 App Router
- React 19
- TypeScript
- PostgreSQL + PostGIS
- Prisma ORM 7 with PostgreSQL driver adapter
- Zod validation
- `jose` JWT sessions
- `bcryptjs` password hashing
- Lucide icons
- Docker Compose for local PostGIS

FarmHQ is intentionally a modular monolith at this stage. The domains are separated in the model and UI, but keeping one deployable application avoids premature distributed-system complexity while the product surface is evolving.

## Run locally

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Set a strong `SESSION_SECRET`.

3. Start PostgreSQL/PostGIS:

```bash
docker compose up -d db
```

4. Install dependencies:

```bash
npm install
```

5. Generate Prisma Client and create the first migration:

```bash
npm run db:generate
npm run db:migrate -- --name init
```

6. Run the app:

```bash
npm run dev
```

7. On a fresh database, open:

```text
http://localhost:3000/setup
```

Create the first organization owner. The bootstrap route closes once a user exists.

## Database security

Every domain action validates the active tenant and scopes records by `tenantId`. Tenant-owned operational tables also carry `tenantId` so PostgreSQL RLS can be enabled as defense in depth.

`prisma/rls.sql` assumes each tenant-bound database transaction sets:

```sql
SET LOCAL app.tenant_id = '<tenant-id>';
```

Do not enable the RLS policies until the deployment's database transaction/session strategy sets this value reliably.

## v0.3.0 additions

- Interactive MapLibre farm map with editable GeoJSON production-unit boundaries
- Farm latitude/longitude management
- Open-Meteo seven-day farm forecasts with server-side caching
- Warehouse-to-warehouse stock transfers
- Physical stock counts with automatic variance adjustments into the inventory ledger
- Compliance / certification / inspection register
- Chemical application register with PHI and REI fields
- Evidence/document URL register with expiry dates
- Tenant automation rules and notification inbox
- Hourly Vercel cron evaluation endpoint protected by `CRON_SECRET`
- Installable PWA shell and offline fallback page
- Multi-file Prisma schema organization
- GitHub Actions validation for Prisma generation, TypeScript and ESLint

The web PWA currently caches only the public application shell. Offline authenticated data capture and queued write synchronization are intentionally not claimed as complete yet.


## v0.4.0 additions

- PostGIS-backed production-unit polygons with a GiST spatial index and point-in-field lookup API
- GPS-assisted field resolution from the Field App
- Historical rainfall, temperature and reference evapotranspiration views
- Forecast-driven operational advisories for wind, rain, heat, dry periods and disease-conducive humidity
- Lot-level traceability with parent/child lots, trace events, public trace tokens and QR labels
- Public farm-to-customer lot history pages without exposing tenant administration data
- IoT device registry with hashed device secrets and authenticated telemetry ingestion
- Soil, weather, water, meter, GPS and livestock telemetry storage
- IndexedDB-based offline field mutation queue for scouting, task completion and crop-activity completion
- Idempotent offline sync API and registered field-device tracking
- Session-based physical stock counts with delayed adjustment posting until count closure
- Compliance corrective actions with assignment, due dates and lifecycle status
- HTTPS notification webhook endpoints with severity filters, retry history and HMAC signing support
- Automation cron now evaluates farm rules and then delivers eligible notifications
- Repeatable `db:postgis` and `db:bootstrap` commands for new environments

### v0.4 database bootstrap

For a new development database:

```bash
npm run db:bootstrap
```

For an existing FarmHQ database whose Prisma schema is already applied:

```bash
npm run db:postgis
```

The PostGIS step enables the extension, adds the spatial polygon column/index to `ProductionUnit`, backfills existing GeoJSON boundaries and installs the synchronization trigger.

For production environments, establish a reviewed Prisma migration baseline before replacing an existing schema with `prisma db push`; `db:bootstrap` is intended for new environments.

## v0.5.0 additions: run the farm business from a phone

v0.5 closes the gaps between "recording operations" and "running a farm business", with the realities of
sub-Saharan African farms in mind: cash and mobile-money sales, buyers on credit, casual day labour, wage advances,
patchy connectivity and teams who work mostly on phones.

### Sell & get paid
- **Quick sale** (`/sales/quick`): one screen that sells from a store, issues the invoice and receipts the payment.
  Walk-in customers need no setup; selling prices and live per-store stock are filled in automatically.
- **Invoices** with sequential numbers (`INV-2026-00001`), discounts, tax/VAT, due dates from customer payment terms,
  partial payments, receipts (`RCT-…`), voiding, print/PDF and **WhatsApp sharing**.
- **Receivables**: unpaid/overdue filters, ageing buckets, customer statements with running balances, credit limits
  and one-tap WhatsApp payment reminders. Customer payments are allocated to the oldest invoices first.
- **Multi-line sales orders**. "Deliver & invoice" posts stock out and issues the invoice in one step.
- Sales can no longer push stock below zero; the seller sees what is available in that store.
- Revenue is now recognised from invoices (net of discount, excluding tax), so profitability and finance reports
  stay consistent with what was actually billed.

### Money
- **Cash & bank** (`/accounts`): cash boxes, bank accounts and mobile-money wallets with opening balances, transfers
  and a live balance computed from receipts, supplier payments, paid expenses, wage advances and payroll.
- **Expense workflow**: draft → submitted → approved → paid (from a chosen account) or rejected/void.
- **Payables**: supplier payments against purchase orders, with "owed to suppliers" totals and over-payment protection.
- **Reports & export** (`/reports`): monthly profit & loss, best-selling products, top customers, spending by
  category, and CSV downloads (Excel-friendly, formula-injection safe) for invoices, sales lines, payments, expenses,
  income, supplier payments, stock, stock movements, labour and payroll.

### People
- **Pay bases** for workers: hourly, **daily rate**, **monthly salary** and **piece rate** (per crate, bag, kg).
- **Daily attendance register**: tick who came, adjust hours (half days) or pieces, save once. Supervisors can take
  attendance (new `workforce.attendance` permission); their entries wait for a manager's approval.
- **Wage advances** recovered automatically in the next pay run.
- **Payroll** (`/payroll`): pay runs from approved work and pro-rated salaries, allowances/deductions, approval,
  payment from an account, printable payroll sheet and **payslips over WhatsApp**. Paid wages appear in expenses.
- **Team & access**: change roles, remove members, revoke invitations, shareable invite links (WhatsApp), and
  admin-issued single-use **password reset links** (no email service required). Owners are protected from being
  demoted or removed by non-owners, and the last owner cannot be removed.
- **Profile**: change name, add a phone number and change password. **Sign in with email or phone number**
  (local `0803…` and international `+234803…` formats both work).

### Phone, tablet and desktop
- Grouped, role-aware navigation: people only see modules their role can open.
- Phone bottom bar (Home · Tasks · **Sell** · Stock · More) and a full **More** menu, so every module is reachable
  on a phone. Tablet layout with a narrower sidebar.
- Create-forms collapse on small screens so lists and numbers come first; inputs are 16px (no iOS zoom) with
  46px touch targets; compact 2-column metrics on phones.
- Forms show validation and business-rule errors inline instead of crashing the page, lock while saving (no double
  posts on slow networks) and stay locked until the page has hydrated.
- Offline banner, workspace error/loading/not-found screens, and print styles for invoices, statements and payroll.
- **Page-level permission checks** on every workspace page (previously any role could open any page).

### Offline Field App
- New offline record types: **daily attendance** and **poultry daily records** (one record per flock per day; a
  re-capture replaces it).
- The sync API now enforces role permissions per record type.
- Items rejected by the server are shown with the reason and can be discarded instead of retrying forever.

### Fixes
- Inventory "on hand" was calculated from only the latest 100 ledger movements; it now uses the full ledger.
- Profitability labour cost now respects daily and piece-rate pay.
- Manual stock issues/adjustments can no longer drive stock negative.

### v0.5 database steps

The schema changes live in `prisma/v05-commerce.prisma` plus new fields on existing models. For a new database:

```bash
npm run db:bootstrap
npm run db:seed        # optional: realistic demo farm, see scripts/seed-demo.ts for demo logins
```

For an existing v0.4 database, apply the schema with `npm run db:push` (or generate a reviewed migration with
`npm run db:migrate`). If you use PostgreSQL row-level security, also apply `prisma/rls-v05.sql`.

## Next build layers

Still outstanding after v0.5, in rough priority order:

1. Server-side farm-scope enforcement (`Membership.farmScope` is stored but queries are not yet filtered by it)
2. SMS / WhatsApp Business API delivery (today documents are shared through `wa.me` links the user sends)
3. Mobile-money payment collection (M-Pesa, MTN MoMo, Paystack/Flutterwave) and bank-feed reconciliation
4. Multi-line purchase orders, RFQ/quotation comparison and configurable approval limits
5. Credit notes / returns that reverse stock and revenue, and customer deposits applied to future invoices
6. Payroll statutory deductions per country (PAYE, pension, NHF, NSSF…) and bulk payment files
7. Offline capture for sales, stock movements and animal health events; installable native wrapper
8. Satellite imagery / NDVI, barcode/QR scanning for stock, media storage for photos and documents
9. Localisation (French, Swahili, Hausa, Yoruba, Amharic…), local number/date formats per tenant
10. Subscription billing, feature flags, platform super-admin and an AI farm assistant grounded in tenant data
