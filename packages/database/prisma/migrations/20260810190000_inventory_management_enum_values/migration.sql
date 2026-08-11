-- PostgreSQL requires newly-added enum values to commit before later migrations use them.
ALTER TYPE "InventoryTransactionAction" ADD VALUE 'STOCK_ADDED';
ALTER TYPE "InventoryTransactionAction" ADD VALUE 'STOCK_REDUCED';
ALTER TYPE "InventoryTransactionKind" ADD VALUE 'STOCK_ADDITION';
ALTER TYPE "InventoryTransactionKind" ADD VALUE 'STOCK_REDUCTION';
