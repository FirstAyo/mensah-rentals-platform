CREATE TABLE "Cart" (
  "id" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Cart_tokenHash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "CartItem" (
  "cartId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "desiredQuantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("cartId", "productId"),
  CONSTRAINT "CartItem_desiredQuantity_check" CHECK ("desiredQuantity" BETWEEN 1 AND 1000)
);

CREATE UNIQUE INDEX "Cart_tokenHash_key" ON "Cart"("tokenHash");
CREATE INDEX "Cart_expiresAt_id_idx" ON "Cart"("expiresAt", "id");
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
