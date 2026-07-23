# API Data Visibility

API responses are designed for their audience. Prisma records and universal
product entities must never be serialized directly to the network. Queries use
allowlisted `select` projections and response mappers construct dedicated DTOs.

Staff authentication uses its own minimal response contract. It may contain
safe identity/profile fields, but never `passwordHash`, raw session tokens,
stored `tokenHash`, or cookie values. Authentication alone does not authorize
future administrative inventory responses; those will also require the
explicit internal permission documented below.

## Public product responses (implemented)

Future public product responses may contain:

```json
{
  "name": "Folding Chair",
  "slug": "folding-chair",
  "description": "Product description",
  "category": { "name": "Seating", "slug": "seating" },
  "images": [],
  "specifications": [],
  "rentalUnit": "each",
  "isFeatured": true
}
```

They must not contain inventory quantities or calculated availability.

## Customer account responses

Customer responses may include that customer's profile and customer-safe
request, quote, and rental statuses. They must not contain staff-only notes,
other customers' records, internal rejection details, or internal inventory
quantities. Customer authentication never grants administrative access.

## Administrative product responses

Authenticated staff product responses may contain internal catalogue-management
metadata permitted for that user. Product permissions do not automatically
grant inventory-quantity access. Product and inventory contracts remain
separate so an editor can manage descriptions without receiving inventory data.

Phase 4 admin catalogue responses contain only catalogue identifiers, descriptions, status/featured metadata, ordered image/specification metadata, category information, and timestamps. They also omit every inventory quantity because `product.view` is not `inventory.quantity.view`.

## Administrative inventory responses

Phase 5 administrative inventory routes require staff authentication. Metadata requires `inventory.view`; quantities and assets additionally require `inventory.quantity.view`; adjustments require `inventory.adjust`; history requires `inventory.transaction.view`. Responses are private/no-store. There is no public inventory controller.

Implemented state totals describe the present operational ledger only. They do not claim requested-period availability, and no reservation quantities or date-range availability are implemented.

## Permanently forbidden public/customer fields

Public and customer responses must never expose fields representing:

- `totalQuantity`
- `availableQuantity`
- `remainingQuantity`
- `reservedQuantity`
- `rentedQuantity`
- `damagedQuantity`
- `maintenanceQuantity`
- `lostQuantity`
- Any equivalent alias or calculated availability for a rental date range

This is enforced in database projections, response DTOs/mappers, backend
authorization, and recursive response-contract tests. Removing fields in the
browser or spreading a database object and deleting fields afterward is not an
acceptable control.
