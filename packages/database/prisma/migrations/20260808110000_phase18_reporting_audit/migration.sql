-- Phase 18 adds one append-only platform audit source for events that do not
-- already have an authoritative domain ledger, plus bounded-report indexes.
-- Existing operational rows are neither rewritten nor backfilled.

CREATE TABLE "PlatformAuditEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "domain" VARCHAR(40) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(80),
    "entityId" VARCHAR(128),
    "entityReference" VARCHAR(128),
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "requestId" VARCHAR(128),
    "sourceType" VARCHAR(80),
    "sourceId" VARCHAR(128),
    "sourceKey" VARCHAR(220),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAuditEvent_sourceKey_key" ON "PlatformAuditEvent"("sourceKey");
CREATE INDEX "PlatformAuditEvent_occurredAt_id_idx" ON "PlatformAuditEvent"("occurredAt", "id");
CREATE INDEX "PlatformAuditEvent_domain_occurredAt_id_idx" ON "PlatformAuditEvent"("domain", "occurredAt", "id");
CREATE INDEX "PlatformAuditEvent_actorUserId_occurredAt_id_idx" ON "PlatformAuditEvent"("actorUserId", "occurredAt", "id");
CREATE INDEX "PlatformAuditEvent_entityType_entityId_occurredAt_id_idx" ON "PlatformAuditEvent"("entityType", "entityId", "occurredAt", "id");
CREATE INDEX "PlatformAuditEvent_entityReference_occurredAt_id_idx" ON "PlatformAuditEvent"("entityReference", "occurredAt", "id");
CREATE INDEX "PlatformAuditEvent_requestId_occurredAt_id_idx" ON "PlatformAuditEvent"("requestId", "occurredAt", "id");

ALTER TABLE "PlatformAuditEvent"
ADD CONSTRAINT "PlatformAuditEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION protect_platform_audit_event_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Platform audit events are append-only';
END;
$$;

CREATE TRIGGER "PlatformAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "PlatformAuditEvent"
FOR EACH ROW EXECUTE FUNCTION protect_platform_audit_event_history();

CREATE INDEX "RentalRequest_submittedAt_id_idx" ON "RentalRequest"("submittedAt", "id");
CREATE INDEX "QuoteRevision_createdAt_id_idx" ON "QuoteRevision"("createdAt", "id");
CREATE INDEX "QuoteRevisionLifecycle_sentAt_quoteRevisionId_idx" ON "QuoteRevisionLifecycle"("sentAt", "quoteRevisionId");
CREATE INDEX "QuoteRevisionLifecycle_terminalAt_quoteRevisionId_idx" ON "QuoteRevisionLifecycle"("terminalAt", "quoteRevisionId");
CREATE INDEX "QuoteCustomerResponse_response_respondedAt_id_idx" ON "QuoteCustomerResponse"("response", "respondedAt", "id");
CREATE INDEX "InventoryTransaction_createdAt_id_idx" ON "InventoryTransaction"("createdAt", "id");
CREATE INDEX "InventoryTransaction_fromState_toState_createdAt_id_idx" ON "InventoryTransaction"("fromState", "toState", "createdAt", "id");
CREATE INDEX "OrderFulfilment_preparationStartedAt_id_idx" ON "OrderFulfilment"("preparationStartedAt", "id");
CREATE INDEX "OrderFulfilment_readyAt_id_idx" ON "OrderFulfilment"("readyAt", "id");
CREATE INDEX "OrderFulfilment_firstCheckedOutAt_id_idx" ON "OrderFulfilment"("firstCheckedOutAt", "id");
CREATE INDEX "OrderFulfilment_fullyCheckedOutAt_id_idx" ON "OrderFulfilment"("fullyCheckedOutAt", "id");
CREATE INDEX "ActiveRental_checkedOutAt_id_idx" ON "ActiveRental"("checkedOutAt", "id");
CREATE INDEX "RentalReturn_firstReturnAt_id_idx" ON "RentalReturn"("firstReturnAt", "id");
CREATE INDEX "RentalIssue_createdAt_id_idx" ON "RentalIssue"("createdAt", "id");
CREATE INDEX "MaintenanceWorkOrder_createdAt_id_idx" ON "MaintenanceWorkOrder"("createdAt", "id");
CREATE INDEX "MaintenanceWorkOrder_completedAt_id_idx" ON "MaintenanceWorkOrder"("completedAt", "id");
CREATE INDEX "MaintenanceWorkOrder_cancelledAt_id_idx" ON "MaintenanceWorkOrder"("cancelledAt", "id");
CREATE INDEX "EquipmentInspection_completedAt_result_id_idx" ON "EquipmentInspection"("completedAt", "result", "id");
