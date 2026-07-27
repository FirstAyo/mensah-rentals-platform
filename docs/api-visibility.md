# API Data Visibility

API responses are designed for their audience. Prisma records and universal
product entities must never be serialized directly to the network. Queries use
allowlisted `select` projections and response mappers construct dedicated DTOs.

Staff authentication uses its own minimal response contract. It may contain
safe identity/profile fields, but never `passwordHash`, raw session tokens,
stored `tokenHash`, or cookie values. Authentication alone does not authorize
implemented administrative inventory responses; those also require the
explicit internal permissions documented below.

## Public product responses (implemented)

Public product responses may contain:

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

Phase 6 public endpoints accept only public descriptive query fields. Administrative controls such as `categoryId`, `isActive`, and timestamp field names are rejected. Lists select one public image; details select up to four and may include up to four active same-category related products. Every object is mapped through an explicit public allowlist, and the customer server boundary rejects unknown keys and non-managed media paths.

## Public rental cart responses (implemented)

`GET/PUT/DELETE /public/cart` routes require no staff session and return only
customer-safe product descriptions, one managed image, the customer's own
`desiredQuantity`, a non-inventory `requestable` catalogue state, and aggregate
counts of customer intent. They never contain a cart ID, capability token/hash,
price, inventory relationship, operational quantity, asset/serial identity,
availability, reservation, staff, authentication, or RBAC data.

Cart mutations require exact `WEB_ORIGIN` and JSON. The browser uses a fixed
same-origin BFF and an HttpOnly capability cookie; the capability is never a
JSON response field. An internal inventory quantity cannot influence whether a
customer may save a desired quantity.

## Public rental request responses (implemented)

`POST /public/rental-requests` converts the owning guest cart atomically. The
response contains only reference, customer-safe status, project name, rental
dates, fulfillment method, and immutable requested item snapshots. Tracking at
`GET /public/rental-requests/:referenceNumber` additionally requires the owning
guest capability; the reference alone never grants access.

Public request responses exclude contact details, email, phone, address, notes,
database/session/cart identifiers, raw or hashed capabilities, staff/RBAC data,
internal status/decisions, prices, inventory, availability, and reservations.
The API uses a narrow Prisma select plus an explicit mapper; the web client
recursively rejects unknown or confidential keys.

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

Phase 8.1 expands recursive regression coverage across catalogue, cart, and
request DTOs for all documented inventory states, asset/serial identity,
authentication/RBAC data, internal storage paths, staff/assignment/rejection
data, audit information, and premature quote/price fields. The public Next.js
BFFs also validate successful cart/request DTOs before returning them to the
browser and fail closed with sanitized `502` responses on a contract violation.

## Administrative rental-request responses

Phase 9 `/admin/rental-requests` responses require an active staff session and
`rental_request.view`. They may include customer contact/project information,
rental dates, fulfillment method, immutable request-item snapshots, internal
review state, safe assignee profile, internal notes, and activity needed for
authorized review. They never include password hashes, raw or hashed staff
sessions, guest capability tokens/hashes, cart capability data, raw media
storage paths, or unrelated authentication/RBAC records.

Internal quantity context has a second authorization boundary: both
`inventory.view` and `inventory.quantity.view` are required. Without those
permissions, the same request detail remains usable but omits the inventory
context entirely. Returned totals are current internal operational state only,
not requested-date availability.

Public tracking continues to use its own narrow projection and mapper. It never
receives assignee/staff data, internal notes, internal activity, review
comments, inventory context, internal conflict assessments, or permissions.
Recursive confidentiality tests must enforce this at every nesting depth; UI
hiding is not a control.
