ALTER TABLE "Category" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
ALTER TABLE "Product" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE INDEX "Category_deletedAt_sortOrder_name_id_idx"
ON "Category"("deletedAt", "sortOrder", "name", "id");

CREATE INDEX "Product_deletedAt_categoryId_name_id_idx"
ON "Product"("deletedAt", "categoryId", "name", "id");

DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r.id
  AND rp."permissionId" = p.id
  AND r.name = 'EDITOR'
  AND r."isSystem" = TRUE
  AND p.key = 'category.delete';
