ALTER TYPE "InventoryTransactionAction" ADD VALUE 'ENTER_MAINTENANCE';
ALTER TYPE "InventoryTransactionAction" ADD VALUE 'MAINTENANCE_RETURN_TO_SERVICE';
ALTER TYPE "InventoryTransactionAction" ADD VALUE 'MAINTENANCE_REMAINS_DAMAGED';
ALTER TYPE "InventoryTransactionAction" ADD VALUE 'MAINTENANCE_CANCELLED_RELEASE';

CREATE TYPE "MaintenanceWorkOrderSource" AS ENUM ('MANUAL','RETURN_ISSUE','RETURN_DISPOSITION','FAILED_INSPECTION');
CREATE TYPE "MaintenanceWorkOrderType" AS ENUM ('CORRECTIVE','PREVENTIVE','INSPECTION_FOLLOWUP');
CREATE TYPE "MaintenanceWorkOrderStatus" AS ENUM ('OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_PARTS','READY_FOR_INSPECTION','COMPLETED','CANCELLED');
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW','NORMAL','HIGH','URGENT');
CREATE TYPE "MaintenanceCompletionOutcome" AS ENUM ('RETURN_TO_SERVICE','REMAINS_DAMAGED');
CREATE TYPE "MaintenanceOperationType" AS ENUM (
  'CREATED','ASSIGNED','UNASSIGNED','PRIORITY_CHANGED','SCHEDULE_CHANGED','STARTED',
  'WAITING_FOR_PARTS','WORK_RESUMED','READY_FOR_INSPECTION','COMPLETED','CANCELLED',
  'NOTE_ADDED','INVENTORY_MOVED','INSPECTION_SCHEDULED','INSPECTION_STARTED',
  'INSPECTION_PASSED','INSPECTION_FAILED','INSPECTION_CANCELLED','ISSUE_RESOLVED'
);
CREATE TYPE "EquipmentInspectionType" AS ENUM ('ROUTINE','POST_MAINTENANCE');
CREATE TYPE "EquipmentInspectionStatus" AS ENUM ('SCHEDULED','IN_PROGRESS','PASSED','FAILED','CANCELLED');
CREATE TYPE "EquipmentInspectionResult" AS ENUM ('PASSED','FAILED');

CREATE TABLE "MaintenanceWorkOrder" (
  "id" TEXT NOT NULL,
  "workOrderNumber" TEXT NOT NULL,
  "source" "MaintenanceWorkOrderSource" NOT NULL,
  "type" "MaintenanceWorkOrderType" NOT NULL,
  "status" "MaintenanceWorkOrderStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "inventoryId" TEXT NOT NULL,
  "inventoryItemId" TEXT,
  "quantity" INTEGER NOT NULL,
  "ingressState" "InventoryState" NOT NULL,
  "ingressMoved" BOOLEAN NOT NULL DEFAULT FALSE,
  "productNameSnapshot" TEXT NOT NULL,
  "assetNumberSnapshot" TEXT,
  "serialNumberSnapshot" TEXT,
  "sourceRentalReturnItemId" TEXT,
  "sourceRentalIssueId" TEXT,
  "sourceInspectionId" TEXT,
  "assignedStaffUserId" TEXT,
  "createdByStaffUserId" TEXT NOT NULL,
  "completedByStaffUserId" TEXT,
  "scheduledFor" TIMESTAMPTZ(3),
  "dueAt" TIMESTAMPTZ(3),
  "startedAt" TIMESTAMPTZ(3),
  "readyForInspectionAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "cancellationReason" TEXT,
  "completionSummary" TEXT,
  "completionOutcome" "MaintenanceCompletionOutcome",
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MaintenanceWorkOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceWorkOrder_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= 1000000),
  CONSTRAINT "MaintenanceWorkOrder_version_check" CHECK ("version" >= 0),
  CONSTRAINT "MaintenanceWorkOrder_text_check" CHECK (
    length(trim("workOrderNumber")) BETWEEN 1 AND 80 AND
    length(trim("title")) BETWEEN 1 AND 160 AND
    length(trim("description")) BETWEEN 1 AND 5000 AND
    length(trim("productNameSnapshot")) BETWEEN 1 AND 160
  ),
  CONSTRAINT "MaintenanceWorkOrder_schedule_check" CHECK ("dueAt" IS NULL OR "scheduledFor" IS NULL OR "dueAt" >= "scheduledFor"),
  CONSTRAINT "MaintenanceWorkOrder_source_check" CHECK (
    ("source" = 'MANUAL' AND "sourceRentalReturnItemId" IS NULL AND "sourceRentalIssueId" IS NULL AND "sourceInspectionId" IS NULL) OR
    ("source" = 'RETURN_DISPOSITION' AND "sourceRentalReturnItemId" IS NOT NULL AND "sourceRentalIssueId" IS NULL AND "sourceInspectionId" IS NULL) OR
    ("source" = 'RETURN_ISSUE' AND "sourceRentalReturnItemId" IS NULL AND "sourceRentalIssueId" IS NOT NULL AND "sourceInspectionId" IS NULL) OR
    ("source" = 'FAILED_INSPECTION' AND "sourceRentalReturnItemId" IS NULL AND "sourceRentalIssueId" IS NULL AND "sourceInspectionId" IS NOT NULL)
  ),
  CONSTRAINT "MaintenanceWorkOrder_ingress_check" CHECK (
    ("ingressState" = 'MAINTENANCE' AND "ingressMoved" = FALSE) OR
    ("ingressState" IN ('RENTABLE','DAMAGED') AND "ingressMoved" = TRUE)
  ),
  CONSTRAINT "MaintenanceWorkOrder_terminal_check" CHECK (
    ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedByStaffUserId" IS NOT NULL AND "completionSummary" IS NOT NULL AND "completionOutcome" IS NOT NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
    ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL AND "completedAt" IS NULL AND "completedByStaffUserId" IS NULL AND "completionSummary" IS NULL AND "completionOutcome" IS NULL) OR
    ("status" NOT IN ('COMPLETED','CANCELLED') AND "completedAt" IS NULL AND "completedByStaffUserId" IS NULL AND "completionSummary" IS NULL AND "completionOutcome" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
  )
);

CREATE TABLE "EquipmentInspection" (
  "id" TEXT NOT NULL,
  "inspectionNumber" TEXT NOT NULL,
  "type" "EquipmentInspectionType" NOT NULL,
  "status" "EquipmentInspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "result" "EquipmentInspectionResult",
  "inventoryId" TEXT NOT NULL,
  "inventoryItemId" TEXT,
  "quantity" INTEGER NOT NULL,
  "ingressState" "InventoryState",
  "ingressMoved" BOOLEAN NOT NULL DEFAULT FALSE,
  "productNameSnapshot" TEXT NOT NULL,
  "assetNumberSnapshot" TEXT,
  "serialNumberSnapshot" TEXT,
  "sourceWorkOrderId" TEXT,
  "assignedStaffUserId" TEXT,
  "createdByStaffUserId" TEXT NOT NULL,
  "completedByStaffUserId" TEXT,
  "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "summary" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "EquipmentInspection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquipmentInspection_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= 1000000),
  CONSTRAINT "EquipmentInspection_version_check" CHECK ("version" >= 0),
  CONSTRAINT "EquipmentInspection_text_check" CHECK (length(trim("inspectionNumber")) BETWEEN 1 AND 80 AND length(trim("productNameSnapshot")) BETWEEN 1 AND 160),
  CONSTRAINT "EquipmentInspection_source_check" CHECK (("type" = 'ROUTINE' AND "sourceWorkOrderId" IS NULL) OR ("type" = 'POST_MAINTENANCE' AND "sourceWorkOrderId" IS NOT NULL)),
  CONSTRAINT "EquipmentInspection_ingress_check" CHECK (
    ("ingressState" IS NULL AND "ingressMoved" = FALSE) OR
    ("ingressState" = 'MAINTENANCE' AND "ingressMoved" = FALSE) OR
    ("ingressState" IN ('RENTABLE','DAMAGED') AND "ingressMoved" = TRUE)
  ),
  CONSTRAINT "EquipmentInspection_terminal_check" CHECK (
    ("status" IN ('PASSED','FAILED') AND "result"::text = "status"::text AND "completedAt" IS NOT NULL AND "completedByStaffUserId" IS NOT NULL AND "summary" IS NOT NULL AND "cancelledAt" IS NULL) OR
    ("status" = 'CANCELLED' AND "result" IS NULL AND "cancelledAt" IS NOT NULL AND "completedAt" IS NULL AND "completedByStaffUserId" IS NULL AND "summary" IS NOT NULL) OR
    ("status" IN ('SCHEDULED','IN_PROGRESS') AND "result" IS NULL AND "completedAt" IS NULL AND "completedByStaffUserId" IS NULL AND "cancelledAt" IS NULL)
  )
);

CREATE TABLE "MaintenanceOperation" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT,
  "inspectionId" TEXT,
  "type" "MaintenanceOperationType" NOT NULL,
  "operationId" UUID NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "resultingVersion" INTEGER NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceOperation_target_check" CHECK (("workOrderId" IS NOT NULL) <> ("inspectionId" IS NOT NULL)),
  CONSTRAINT "MaintenanceOperation_version_check" CHECK (
    ("type" IN ('CREATED','INSPECTION_SCHEDULED') AND "expectedVersion" = 0 AND "resultingVersion" = 0) OR
    ("type" NOT IN ('CREATED','INSPECTION_SCHEDULED') AND "expectedVersion" >= 0 AND "resultingVersion" = "expectedVersion" + 1)
  ),
  CONSTRAINT "MaintenanceOperation_shape_check" CHECK (
    ("type" IN ('INSPECTION_SCHEDULED','INSPECTION_STARTED','INSPECTION_PASSED','INSPECTION_FAILED','INSPECTION_CANCELLED') AND "inspectionId" IS NOT NULL AND "workOrderId" IS NULL) OR
    ("type" NOT IN ('INSPECTION_SCHEDULED','INSPECTION_STARTED','INSPECTION_PASSED','INSPECTION_FAILED','INSPECTION_CANCELLED') AND "workOrderId" IS NOT NULL AND "inspectionId" IS NULL)
  ),
  CONSTRAINT "MaintenanceOperation_text_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$' AND length(trim("summary")) BETWEEN 1 AND 3000)
);

CREATE TABLE "MaintenanceNote" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceNote_body_check" CHECK (length(trim("body")) BETWEEN 1 AND 3000)
);

ALTER TABLE "InventoryTransaction" ADD COLUMN "maintenanceOperationId" TEXT;

CREATE UNIQUE INDEX "MaintenanceWorkOrder_workOrderNumber_key" ON "MaintenanceWorkOrder"("workOrderNumber");
CREATE UNIQUE INDEX "MaintenanceWorkOrder_sourceInspectionId_key" ON "MaintenanceWorkOrder"("sourceInspectionId");
CREATE UNIQUE INDEX "MaintenanceWorkOrder_active_serialized_key" ON "MaintenanceWorkOrder"("inventoryItemId") WHERE "inventoryItemId" IS NOT NULL AND "status" IN ('OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_PARTS','READY_FOR_INSPECTION');
CREATE INDEX "MaintenanceWorkOrder_status_dueAt_id_idx" ON "MaintenanceWorkOrder"("status","dueAt","id");
CREATE INDEX "MaintenanceWorkOrder_status_scheduledFor_id_idx" ON "MaintenanceWorkOrder"("status","scheduledFor","id");
CREATE INDEX "MaintenanceWorkOrder_priority_status_updatedAt_id_idx" ON "MaintenanceWorkOrder"("priority","status","updatedAt","id");
CREATE INDEX "MaintenanceWorkOrder_assignedStaffUserId_status_dueAt_id_idx" ON "MaintenanceWorkOrder"("assignedStaffUserId","status","dueAt","id");
CREATE INDEX "MaintenanceWorkOrder_inventoryId_status_id_idx" ON "MaintenanceWorkOrder"("inventoryId","status","id");
CREATE INDEX "MaintenanceWorkOrder_inventoryItemId_status_id_idx" ON "MaintenanceWorkOrder"("inventoryItemId","status","id");
CREATE INDEX "MaintenanceWorkOrder_sourceRentalReturnItemId_status_id_idx" ON "MaintenanceWorkOrder"("sourceRentalReturnItemId","status","id");
CREATE INDEX "MaintenanceWorkOrder_sourceRentalIssueId_status_id_idx" ON "MaintenanceWorkOrder"("sourceRentalIssueId","status","id");

CREATE UNIQUE INDEX "EquipmentInspection_inspectionNumber_key" ON "EquipmentInspection"("inspectionNumber");
CREATE UNIQUE INDEX "EquipmentInspection_active_post_work_order_key" ON "EquipmentInspection"("sourceWorkOrderId") WHERE "sourceWorkOrderId" IS NOT NULL AND "status" IN ('SCHEDULED','IN_PROGRESS');
CREATE UNIQUE INDEX "EquipmentInspection_active_serialized_key" ON "EquipmentInspection"("inventoryItemId") WHERE "inventoryItemId" IS NOT NULL AND "status" IN ('SCHEDULED','IN_PROGRESS');
CREATE INDEX "EquipmentInspection_status_scheduledFor_id_idx" ON "EquipmentInspection"("status","scheduledFor","id");
CREATE INDEX "EquipmentInspection_assignedStaffUserId_status_scheduledFor_id_idx" ON "EquipmentInspection"("assignedStaffUserId","status","scheduledFor","id");
CREATE INDEX "EquipmentInspection_inventoryId_status_id_idx" ON "EquipmentInspection"("inventoryId","status","id");
CREATE INDEX "EquipmentInspection_inventoryItemId_status_id_idx" ON "EquipmentInspection"("inventoryItemId","status","id");
CREATE INDEX "EquipmentInspection_sourceWorkOrderId_status_id_idx" ON "EquipmentInspection"("sourceWorkOrderId","status","id");

CREATE UNIQUE INDEX "MaintenanceOperation_operationId_key" ON "MaintenanceOperation"("operationId");
CREATE INDEX "MaintenanceOperation_workOrderId_createdAt_id_idx" ON "MaintenanceOperation"("workOrderId","createdAt","id");
CREATE INDEX "MaintenanceOperation_inspectionId_createdAt_id_idx" ON "MaintenanceOperation"("inspectionId","createdAt","id");
CREATE INDEX "MaintenanceOperation_actorUserId_createdAt_id_idx" ON "MaintenanceOperation"("actorUserId","createdAt","id");
CREATE UNIQUE INDEX "MaintenanceNote_operationId_key" ON "MaintenanceNote"("operationId");
CREATE INDEX "MaintenanceNote_workOrderId_createdAt_id_idx" ON "MaintenanceNote"("workOrderId","createdAt","id");
CREATE INDEX "MaintenanceNote_authorUserId_createdAt_id_idx" ON "MaintenanceNote"("authorUserId","createdAt","id");
CREATE INDEX "InventoryTransaction_maintenanceOperationId_createdAt_id_idx" ON "InventoryTransaction"("maintenanceOperationId","createdAt","id");
CREATE UNIQUE INDEX "InventoryTransaction_maintenance_operation_key" ON "InventoryTransaction"("maintenanceOperationId") WHERE "maintenanceOperationId" IS NOT NULL;

ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_sourceRentalReturnItemId_fkey" FOREIGN KEY ("sourceRentalReturnItemId") REFERENCES "RentalReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_sourceRentalIssueId_fkey" FOREIGN KEY ("sourceRentalIssueId") REFERENCES "RentalIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_sourceInspectionId_fkey" FOREIGN KEY ("sourceInspectionId") REFERENCES "EquipmentInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_assignedStaffUserId_fkey" FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_createdByStaffUserId_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_completedByStaffUserId_fkey" FOREIGN KEY ("completedByStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EquipmentInspection" ADD CONSTRAINT "EquipmentInspection_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentInspection" ADD CONSTRAINT "EquipmentInspection_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentInspection" ADD CONSTRAINT "EquipmentInspection_sourceWorkOrderId_fkey" FOREIGN KEY ("sourceWorkOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentInspection" ADD CONSTRAINT "EquipmentInspection_assignedStaffUserId_fkey" FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentInspection" ADD CONSTRAINT "EquipmentInspection_createdByStaffUserId_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentInspection" ADD CONSTRAINT "EquipmentInspection_completedByStaffUserId_fkey" FOREIGN KEY ("completedByStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenanceOperation" ADD CONSTRAINT "MaintenanceOperation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceOperation" ADD CONSTRAINT "MaintenanceOperation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "EquipmentInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceOperation" ADD CONSTRAINT "MaintenanceOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceNote" ADD CONSTRAINT "MaintenanceNote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceNote" ADD CONSTRAINT "MaintenanceNote_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "MaintenanceOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceNote" ADD CONSTRAINT "MaintenanceNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_maintenanceOperationId_fkey" FOREIGN KEY ("maintenanceOperationId") REFERENCES "MaintenanceOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_maintenance_target() RETURNS trigger AS $$
DECLARE mode "InventoryTrackingMode";
BEGIN
  SELECT "trackingMode" INTO mode FROM "Inventory" WHERE "id" = NEW."inventoryId";
  IF mode = 'SERIALIZED' THEN
    IF NEW."inventoryItemId" IS NULL OR NEW."quantity" <> 1 OR NOT EXISTS (
      SELECT 1 FROM "InventoryItem" WHERE "id" = NEW."inventoryItemId" AND "inventoryId" = NEW."inventoryId"
    ) THEN RAISE EXCEPTION 'Serialized maintenance target must identify one matching asset'; END IF;
  ELSIF mode = 'BULK' AND NEW."inventoryItemId" IS NOT NULL THEN
    RAISE EXCEPTION 'Bulk maintenance target cannot identify a serialized asset';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MaintenanceWorkOrder_target_guard" BEFORE INSERT OR UPDATE OF "inventoryId","inventoryItemId","quantity" ON "MaintenanceWorkOrder" FOR EACH ROW EXECUTE FUNCTION validate_maintenance_target();
CREATE TRIGGER "EquipmentInspection_target_guard" BEFORE INSERT OR UPDATE OF "inventoryId","inventoryItemId","quantity" ON "EquipmentInspection" FOR EACH ROW EXECUTE FUNCTION validate_maintenance_target();

CREATE FUNCTION protect_maintenance_work_order_identity() RETURNS trigger AS $$
BEGIN
  IF OLD."workOrderNumber" <> NEW."workOrderNumber" OR OLD."source" <> NEW."source" OR OLD."type" <> NEW."type" OR
     OLD."inventoryId" <> NEW."inventoryId" OR OLD."inventoryItemId" IS DISTINCT FROM NEW."inventoryItemId" OR
     OLD."quantity" <> NEW."quantity" OR OLD."ingressState" <> NEW."ingressState" OR OLD."ingressMoved" <> NEW."ingressMoved" OR
     OLD."sourceRentalReturnItemId" IS DISTINCT FROM NEW."sourceRentalReturnItemId" OR
     OLD."sourceRentalIssueId" IS DISTINCT FROM NEW."sourceRentalIssueId" OR OLD."sourceInspectionId" IS DISTINCT FROM NEW."sourceInspectionId" OR
     OLD."productNameSnapshot" <> NEW."productNameSnapshot" OR OLD."assetNumberSnapshot" IS DISTINCT FROM NEW."assetNumberSnapshot" OR
     OLD."serialNumberSnapshot" IS DISTINCT FROM NEW."serialNumberSnapshot" THEN
    RAISE EXCEPTION 'Maintenance work-order identity and source are immutable';
  END IF;
  IF OLD."status" IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Terminal maintenance work orders are immutable'; END IF;
  IF OLD."status" <> NEW."status" AND NOT (
    (OLD."status"='OPEN' AND NEW."status" IN ('ASSIGNED','IN_PROGRESS','CANCELLED')) OR
    (OLD."status"='ASSIGNED' AND NEW."status" IN ('OPEN','IN_PROGRESS','CANCELLED')) OR
    (OLD."status"='IN_PROGRESS' AND NEW."status" IN ('WAITING_FOR_PARTS','READY_FOR_INSPECTION','COMPLETED','CANCELLED')) OR
    (OLD."status"='WAITING_FOR_PARTS' AND NEW."status" IN ('IN_PROGRESS','CANCELLED')) OR
    (OLD."status"='READY_FOR_INSPECTION' AND NEW."status" IN ('IN_PROGRESS','COMPLETED','CANCELLED'))
  ) THEN RAISE EXCEPTION 'Invalid maintenance work-order transition'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MaintenanceWorkOrder_identity_lifecycle_guard" BEFORE UPDATE ON "MaintenanceWorkOrder" FOR EACH ROW EXECUTE FUNCTION protect_maintenance_work_order_identity();

CREATE FUNCTION protect_equipment_inspection_identity() RETURNS trigger AS $$
BEGIN
  IF OLD."inspectionNumber" <> NEW."inspectionNumber" OR OLD."type" <> NEW."type" OR
     OLD."inventoryId" <> NEW."inventoryId" OR OLD."inventoryItemId" IS DISTINCT FROM NEW."inventoryItemId" OR OLD."quantity" <> NEW."quantity" OR
     OLD."sourceWorkOrderId" IS DISTINCT FROM NEW."sourceWorkOrderId" OR OLD."productNameSnapshot" <> NEW."productNameSnapshot" OR
     OLD."assetNumberSnapshot" IS DISTINCT FROM NEW."assetNumberSnapshot" OR OLD."serialNumberSnapshot" IS DISTINCT FROM NEW."serialNumberSnapshot" THEN
    RAISE EXCEPTION 'Equipment inspection identity and source are immutable';
  END IF;
  IF OLD."ingressState" IS NOT NULL AND (OLD."ingressState" IS DISTINCT FROM NEW."ingressState" OR OLD."ingressMoved" <> NEW."ingressMoved") THEN
    RAISE EXCEPTION 'Equipment inspection ingress ownership is immutable once recorded';
  END IF;
  IF OLD."ingressState" IS NULL AND NEW."ingressState" IS NOT NULL AND NOT (OLD."status"='SCHEDULED' AND NEW."status"='IN_PROGRESS') THEN
    RAISE EXCEPTION 'Inspection ingress ownership may only be recorded when work starts';
  END IF;
  IF OLD."status" IN ('PASSED','FAILED','CANCELLED') THEN RAISE EXCEPTION 'Terminal equipment inspections are immutable'; END IF;
  IF OLD."status" <> NEW."status" AND NOT (
    (OLD."status"='SCHEDULED' AND NEW."status" IN ('IN_PROGRESS','CANCELLED')) OR
    (OLD."status"='IN_PROGRESS' AND NEW."status" IN ('PASSED','FAILED','CANCELLED'))
  ) THEN RAISE EXCEPTION 'Invalid equipment inspection transition'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "EquipmentInspection_identity_lifecycle_guard" BEFORE UPDATE ON "EquipmentInspection" FOR EACH ROW EXECUTE FUNCTION protect_equipment_inspection_identity();

CREATE FUNCTION protect_phase17_history() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MaintenanceOperation_append_only" BEFORE UPDATE OR DELETE ON "MaintenanceOperation" FOR EACH ROW EXECUTE FUNCTION protect_phase17_history();
CREATE TRIGGER "MaintenanceNote_append_only" BEFORE UPDATE OR DELETE ON "MaintenanceNote" FOR EACH ROW EXECUTE FUNCTION protect_phase17_history();

CREATE FUNCTION validate_maintenance_history_identity() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'MaintenanceNote' AND NOT EXISTS (
    SELECT 1 FROM "MaintenanceOperation" o WHERE o."id"=NEW."operationId" AND o."workOrderId"=NEW."workOrderId" AND o."actorUserId"=NEW."authorUserId" AND o."type"='NOTE_ADDED'
  ) THEN RAISE EXCEPTION 'Maintenance note identity does not match its operation'; END IF;
  IF TG_TABLE_NAME = 'InventoryTransaction' AND NEW."maintenanceOperationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "MaintenanceOperation" o
    LEFT JOIN "MaintenanceWorkOrder" w ON w."id"=o."workOrderId"
    LEFT JOIN "EquipmentInspection" i ON i."id"=o."inspectionId"
    WHERE o."id"=NEW."maintenanceOperationId" AND NEW."inventoryId"=COALESCE(w."inventoryId",i."inventoryId")
      AND NEW."inventoryItemId" IS NOT DISTINCT FROM COALESCE(w."inventoryItemId",i."inventoryItemId")
  ) THEN RAISE EXCEPTION 'Maintenance inventory movement does not match its target'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "MaintenanceNote_identity_guard" AFTER INSERT ON "MaintenanceNote" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_maintenance_history_identity();
CREATE CONSTRAINT TRIGGER "InventoryTransaction_maintenance_identity_guard" AFTER INSERT OR UPDATE OF "maintenanceOperationId" ON "InventoryTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_maintenance_history_identity();
