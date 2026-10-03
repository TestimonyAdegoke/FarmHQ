-- v0.5 commerce, money and payroll tables. PasswordResetToken is user-scoped (no tenantId) and is intentionally excluded.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'MoneyAccount','AccountTransfer','Invoice','InvoiceItem','PaymentReceived','VendorPayment',
    'WorkerAdvance','PayRun','PayRunLine'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      table_name, table_name
    );
  END LOOP;
END $$;
