-- Optional production hardening for PostgreSQL row-level security.
-- Apply only when every request/transaction sets `app.tenant_id` on the database session.
-- Application queries also enforce tenant filters; RLS is defense in depth.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Farm','ProductionUnit','ProductionCycle','Task','Warehouse','Product',
    'InventoryTransaction','Expense','Animal','Equipment','Invitation','AuditLog',
    'CropActivity','ScoutingObservation','HarvestRecord','Revenue','Vendor',
    'PurchaseRequest','PurchaseRequestItem','PurchaseOrder','PurchaseOrderItem',
    'AnimalHealthEvent','PoultryDailyRecord','AquacultureRecord',
    'Customer','SalesOrder','SalesOrderItem','WorkforceMember','Timesheet','EquipmentLog'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      table_name, table_name
    );
  END LOOP;
END $$;
