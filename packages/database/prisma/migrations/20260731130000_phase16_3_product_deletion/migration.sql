DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r.id
  AND rp."permissionId" = p.id
  AND r.name = 'EDITOR'
  AND r."isSystem" = TRUE
  AND p.key = 'product.delete';
