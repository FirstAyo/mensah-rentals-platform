# API Data Visibility

## Phase 18.4 search visibility

SEO metadata and JSON-LD use the same explicit customer-safe homepage and catalogue projections as visible pages. They may include public names, descriptions, category identity, managed public media, and slugs. They must recursively exclude inventory/availability, reservations and shortfalls, internal pricing, staff/RBAC, maintenance, serial/asset identifiers, database-only IDs, tokens, capabilities, and session data.

Sitemap reads active public endpoints only. API routes never enter the sitemap. Private web proxy and document responses retain authorization, `private,no-store`, and `X-Robots-Tag` protection; SEO is not used as an access-control mechanism.

## Phase 18.3 inventory-management visibility

Inventory metadata, lifecycle state, physical totals, reservations, stock acquisitions/reductions, archive reasons, serialized identifiers, transaction history, and audit evidence are administrative data. They are available only through authenticated `/admin/inventory` routes with exact inventory permissions and private/no-store responses. Public catalogue, customer order, tracking, quote, and official PDF mappers remain explicit allowlists and expose none of these fields. There is no public inventory-management endpoint.

Reservation shortfall types, coverage state, staff notes, and internal/external fulfilment source splits are administrative-only. Customer DTOs and PDFs must not contain them. See [Reservation shortfall coverage](reservation-shortfall-coverage.md).

## Phase 17 maintenance confidentiality

Maintenance work orders and equipment inspections are administrative-only. Authorized DTOs may contain internal target quantities, serialized identity, source links, schedule, priority, assignment, notes, results, and audit history according to exact permissions.

Public and customer responses contain none of: maintenance/inspection numbers or IDs, maintenance status, priority, target quantity, asset/serial identity, repair or condition notes, inspection results, assignment/staff identity, activity, operation IDs/hashes, maintenance cost, or internal source links. The public catalogue and customer order/return mappers remain separate allowlists and do not select maintenance relations. Recursive confidentiality tests reject these keys at every depth.

## Phase 16.4.1 Google Reviews visibility

`GET /public/homepage/google-reviews` is a separate no-store public DTO. A live response contains only business display name, rating, review count, Google Maps profile URI, up to three ordered review presentations, an ordering notice, and safe read/write links. Review presentations contain only the returned rating/text/date, required author attribution, source/report links, translation state/original text, and visit month/year where supplied.

It excludes API keys, Place IDs, request headers, raw Google payloads, technical failures, diagnostics, environment data, staff/RBAC, homepage drafts, persistence identifiers, inventory, reservations, and rental operations. Fallback responses contain only a truthful message and safe Google links. Exact Zod schemas reject unknown output keys.

Administrative status/test DTOs expose configuration booleans and safe classifications, never configuration values, review text, authors, raw provider errors, or credentials.

## Phase 16.4A media-library and category-image visibility

Administrative media-library responses are allowlisted to a media reference, managed URL, safe label/description, dimensions/size where known, source type, product display name where relevant, and aggregate saved-reference count. They never contain filesystem paths, content hashes, creators, permissions, or raw storage metadata. Category-cover administration returns only its assignment and resolved presentation source.

Public homepage category DTOs contain `name`, `slug`, public description, and an image object limited to managed URL or null, alt text, focal position, and the safe source label. Public hero DTOs contain only enabled slides with managed desktop/mobile URLs and presentation metadata. Product/homepage IDs used for assignments, revisions, actors, hashes, storage paths, inventory, availability, and RBAC data are excluded.

## Phase 16.4 public homepage visibility

`GET /public/homepage` may contain published structured copy, active public-safe categories/products, managed homepage URLs, and public Google links. An exact shared allowlist schema rejects unknown fields. It never contains homepage media/database IDs, draft/publication pointers, actors, activity/audit data, permissions, credentials, Place IDs, raw provider data, filesystem paths, inventory, availability, reservations, staff, or workflow internals. Public media retrieval is limited to assets referenced by the current publication. Preview and draft media use separate staff-authenticated private/no-store/noindex routes.

## Phase 15 fulfilment visibility

Administrative DTOs may contain reserved/prepared/checked-out/shortfall quantities and serialized identities after exact permissions. Customer order DTOs may contain only a coarse status, inclusive expected return date, and checked-out product summary. They exclude reservation/preparation/shortfall counts, assets/serials, internal notes, staff, transactions, versions, operations, and hashes.

## Phase 14 reservation visibility

Reservation and date-range availability endpoints exist only under
`/admin/orders`. They require staff authentication plus exact live permissions.
Administrative responses may include ordered, reserved, shortfall, physical
rentable, available-to-reserve, overlapping reservation, asset, and internal
activity data only when permitted.

Public request, quote, order, PDF, and catalogue responses must not contain
reservation state, reservation IDs, reserved/available/shortfall quantities,
overlap results, asset/serial identifiers, activity, override reasons, or
availability calculations. Customer wording remains neutral: fulfilment is
being arranged. No reservation endpoint exists in the public namespace.

## Phase 13 private customer responses

Private revision and change-request APIs require a request-scoped capability. Customer revision DTOs may include the customer-provided contact, company, project, fulfilment, delivery, notes, dates, and customer-safe item snapshots needed to edit the request. They exclude staff identities, assignment, internal notes/reasons, RBAC data, operational IDs/hashes, capability data, quote/order internals, inventory quantities/states, availability, reservations, and serialized assets. Missing, invalid, expired, revoked, and mismatched capabilities use the same unavailable response.

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

Phase 10 public tracking may add a customer-safe decision outcome,
customer-safe explanation, decision time, and approved quantity only for full
or partial approval. Rejection omits approved quantities. It never exposes the
internal reason, deciding staff identity, operation/payload identifiers,
review versions, administrative quote eligibility, or inventory data. Admin
decision DTOs are separate and are never serialized into public responses.
Customer explanations are revalidated at the public mapping boundary. Unsafe
legacy or directly inserted text is replaced with a generic server-owned
message; it is never copied through merely because it exists in the database.
The web BFF additionally validates decision scalar types, terminal outcome,
timestamp, and exact server-owned notice text before returning a response.

Administrative quote responses include an existing confirmed-order reference
only when the current staff user also holds live `order.view`. `quote.view`
alone does not disclose the order ID or order number.

## Private customer quote responses

Quote number is display-only and never grants access. The public quote API requires a revision-scoped capability and uses an explicit mapper. It may return customer display name, rental dates, item/product snapshots, quoted/approved quantities, integer-cent prices and totals, customer-visible charges, tax snapshot, customer notes, terms, validity, safe lifecycle status, and the required non-reservation notice.

It never returns internal notes, staff identities, contact details not needed for the quote, decision IDs or internal reasons, operation/payload identifiers, lifecycle versions, capability/access records, activity, permissions, inventory quantities/states/assets, availability, reservations, or order internals. The customer web BFF recursively checks the exact allowed shape and returns a sanitized `502` if the API adds an unexpected key.

## Private customer confirmed-order responses

Order number alone grants no access. An order-scoped capability may return only
customer/project/rental-date/fulfillment snapshots, accepted item and financial
snapshots, customer-visible notes/terms, confirmed status, fixed
`NOT_RESERVED`, confirmation time, and a server-owned scheduling notice. The
API maps an explicit DTO and the web BFF recursively rejects unknown fields.

It never exposes staff/roles/permissions, internal notes or decisions,
operation/payload identifiers, capabilities/access/activity, inventory
quantities/states/assets, availability, reservation records, or allocations.

## Phase 12.1 private documents and work summaries

Quote and order PDFs use dedicated customer-document projections, not
administrative DTOs with fields removed. They may contain the corresponding
document number, revision/status, snapshotted customer/project/rental details,
items, charges, discount type/rate/base/calculated cents, tax, total,
customer-visible notes/terms, and the required non-reservation or scheduling
notice. They never contain internal notes, staff, decisions, activity,
source/operation/payload IDs, raw or hashed capability material, capability
URLs, inventory, availability, reservations, or allocations.

Staff PDF routes require the live domain view permission. Customer PDF routes
require the same exact valid capability as the matching private HTML/JSON view.
Readable quote or order numbers never authorize a PDF. Binary BFF responses are
size bounded, accept only `application/pdf`, forward only allowlisted headers,
and are `private, no-store`.

The administrative work summary is not public. It conditionally omits request,
quote, or order groups unless the active staff user has the documented
permissions. Counts are current workflow facts only; they are not inventory
availability, reservation, return, missing/damaged, or financial-report data.

Phase 16 staff return APIs may contain condition totals, internal issue descriptions, staff evidence, serialized asset identity, and ledger-linked state. They require explicit return/issue permissions and are never public. The order-capability response uses a distinct allowlisted mapper and exposes only coarse return status, the customer's own accounted/outstanding contract quantities, and a bounded customer-safe message. It recursively excludes inventory balances/states, asset and serial IDs, issue type/status/responsibility/amount, internal notes, staff, operation/hash/version/activity, and ledger data. Customer PDFs use the same safe projection.

## Phase 16.2 catalogue deletion visibility

Rows with `deletedAt` are excluded from administrative catalogue lists, category selectors, public categories, public products, related products, and public slug details. Deleted products cannot be newly added to a cart or request. Historical request, quote, order, inventory, fulfilment, return, and issue endpoints continue to use protected projections and immutable snapshots. Tombstone markers, dependency counts, and retention decisions are never public fields.

Phase 16.3 applies the same boundary to direct product deletion. `DELETE /admin/products/{id}` and its dependency preflight are authenticated administrative operations protected by `product.delete`. The internal response may state hard-delete versus tombstone retention and whether inventory/media were preserved; none of those fields enter public catalogue, cart, request, quote, order, or customer-capability DTOs. A removed product returns 404 from public slug routes and cannot be newly added to a cart or amendment.

## Phase 18 internal data

Reports, audit history, exports, detailed system status, and backup verification are administrative only. They require a staff session and exact permissions. Inventory quantities retain their confidential domain checks. CSV and audit DTOs are allowlists. Public health remains minimal and reveals no operational diagnostics.

# Official customer PDF visibility

Customer Order and Return PDF renderers receive no monetary, inventory, reservation, preparation, serialized-asset, issue-internal, staff, operation, audit, session, or capability fields. `GET /public/orders/current/pdf` and `GET /public/orders/current/return-pdf` require the existing order capability and return private/no-store responses. There is no public raw-ID return PDF endpoint.

## Phase 18.5 capability visibility

`GET /public/features` is explicitly mapped to `{ rentalRequests, customerOrderPortal }`. It never serializes feature rows and omits state names, Testing detail, dependencies, versions, reasons, actors, audit fields, RBAC data, inventory, or internal workflow state. Authenticated staff navigation receives only key/available/testing values. Full settings, previews, blockers, and mutations require the new settings permissions.
