# FarmHQ

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

## Next build layers

The major remaining product layers are:

1. GIS map editor, spatial queries and PostGIS field boundary operations
2. Weather forecasts/history and farm-specific alerts
3. Satellite imagery / NDVI integrations
4. Full inventory transfer workflow and stock counts
5. Multi-line RFQ/quotation comparison and procurement approval rules
6. Dispatch, invoices, receivables and accounting integrations
7. Livestock breeding genealogy, milk records and medication withdrawal periods
8. Poultry FCR and cohort analytics
9. Aquaculture biomass/FCR forecasting
10. Compliance, certifications, chemical registers and inspections
11. Document/media storage
12. IoT device registry and sensor ingestion
13. Notification + rule/automation engine
14. Offline-first Flutter field app and sync queue
15. SaaS subscription billing, feature flags and platform super-admin
16. AI farm assistant grounded in each tenant's operational data
