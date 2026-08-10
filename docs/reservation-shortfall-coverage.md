# Reservation shortfall coverage

This correction separates physical inventory reservation from operational order coverage. A confirmed order may proceed when Mensah Rentals owns none or only part of the required equipment, but only after authorized staff document and acknowledge how every shortage will be sourced.

## Quantity rules

For every order line the API calculates `orderedQuantity`, `alreadyReservedQuantity`, `currentlyAvailableQuantity`, `requiredRemaining`, `reservableNow`, and `remainingShortfall`. It reserves only `reservableNow`. A missing inventory row is a truthful zero-internal line; the system does not create a fake inventory record, allocation, or transaction.

Physical status and coverage status are independent:

- `RESERVED` plus `FULLY_INTERNAL`: all equipment is covered by owned stock.
- `PARTIALLY_RESERVED` plus `SHORTFALL_ACKNOWLEDGED`: owned stock is reserved and the remainder has an approved plan.
- `NOT_RESERVED` plus `SHORTFALL_ACKNOWLEDGED`: no owned stock is reserved and the complete quantity has an approved external plan.
- `SHORTFALL_REQUIRES_PLAN`: preparation is blocked.

## Shortfall plan and authority

Each shortage line has one versioned `ReservationShortfall`. Acknowledgement requires `inventory.reservation.override`, a resolution type (`SUBRENT`, `PARTNER_SOURCE`, `TRANSFER`, or `OTHER`), a bounded internal note, the staff actor, timestamp, and exact acknowledged quantity. Reservation operations remain append-only and record the resolution type. Releasing owned stock recalculates coverage and can reopen unresolved work.

ADMIN and SUPER_ADMIN have the override permission. SALES_PERSON and read-only staff cannot approve plans. Active account and live permission state are rechecked by the API.

## Fulfilment, returns, and inventory safety

Preparation is permitted only when every line is covered. Warehouse preparation remains limited to owned reserved units. Checkout records internal and external quantities separately. Only internal checkout consumes reservations, moves owned inventory to RENTED, or creates an `InventoryTransaction`.

Active rentals and return intake retain the source split. External receipt or loss is reconciled operationally without changing Mensah Rentals inventory. Internal bulk and serialized returns continue through the existing inventory transaction rules.

## Confidentiality

Shortfalls, source types, staff notes, availability, reservation data, and serial/asset identifiers are administrative only. Customer order DTOs and official PDFs remain allowlisted and do not expose sourcing or shortage information.

## Windows verification

Stop normal applications, then run from the repository root:

```powershell
docker compose up -d postgres-test
pnpm test
pnpm test:e2e:reservation-shortfall
pnpm test:e2e:admin-reservations
pnpm test:e2e:admin-fulfilment
pnpm test:e2e:fulfilment-concurrency
pnpm test:e2e:returns
pnpm test:e2e:official-pdfs
pnpm test:e2e:customer-orders
```

The harness resets only the configured database ending in `_test`. Never point these commands at staging or production, and never reset the development database for this workflow.
