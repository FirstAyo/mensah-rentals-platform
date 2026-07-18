CREATE TABLE "public"."Role" (
    "id" TEXT NOT NULL, "name" TEXT NOT NULL, "displayName" TEXT NOT NULL,
    "description" TEXT, "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Role_name_format_check" CHECK (char_length("name") <= 64 AND "name" ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

CREATE TABLE "public"."Permission" (
    "id" TEXT NOT NULL, "key" TEXT NOT NULL, "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Permission_key_format_check" CHECK (char_length("key") <= 128 AND "key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

CREATE TABLE "public"."UserRole" (
    "userId" TEXT NOT NULL, "roleId" TEXT NOT NULL, "assignedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE "public"."RolePermission" (
    "roleId" TEXT NOT NULL, "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE UNIQUE INDEX "Role_name_key" ON "public"."Role"("name");
CREATE UNIQUE INDEX "Permission_key_key" ON "public"."Permission"("key");
CREATE INDEX "UserRole_roleId_idx" ON "public"."UserRole"("roleId");
CREATE INDEX "UserRole_assignedById_idx" ON "public"."UserRole"("assignedById");
CREATE INDEX "RolePermission_permissionId_idx" ON "public"."RolePermission"("permissionId");

ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "public"."Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
