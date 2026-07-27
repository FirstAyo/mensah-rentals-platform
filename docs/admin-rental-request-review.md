# Administrative Rental-Request Review

Phase 9 gives authorized staff a secure queue and a non-decision review
workspace. It does **not** approve, partially approve, or reject a request. It
does not calculate a price, create a quote or order, reserve equipment, change
inventory, or promise that equipment is available for the requested dates.

## Workflow boundary

The implemented internal progression is deliberately narrow:

```text
SUBMITTED -> UNDER_REVIEW
```

Starting review records who performed the action and when. It does not create
an approved quantity or alter the immutable `requestedQuantity` on any request
item. Decision statuses and separate approved quantities belong to Phase 10.

The queue supports server-side pagination, reference/customer search, status,
assignment, fulfillment-method and rental-date filters, plus sorting by
submission date, rental start date, or recent activity. Search, filtering,
sorting, and pagination occur in PostgreSQL through the API; the browser does
not filter only its currently loaded page.

## Data model and integrity

Phase 9 extends `RentalRequest` with an optional assignee, assignment and review
timestamps, and an integer `reviewVersion`. Every assignment, reassignment,
unassignment, or review-state write supplies the version the staff member last
read. A stale version is rejected instead of silently overwriting newer work.
The write and its activity record are committed in one database transaction.

`RentalRequestInternalNote` is append-only. It stores its request, author,
validated body, operation identifier, and creation time. Notes are not edited
or deleted through this phase's API. A repeated operation identifier can be
handled without creating a duplicate note.

`RentalRequestActivity` is append-only history for assignment, reassignment,
unassignment, note creation, and starting review. Assignment events preserve
the previous and new assignee; review events preserve the previous and new
state. User foreign keys are restrictive so deleting a staff identity cannot
erase business history.

The migrations for this foundation are:

```text
20260727150000_admin_rental_request_review
20260727150100_admin_rental_request_review_constraints
```

The second migration installs status-dependent constraints after PostgreSQL
has committed the new `UNDER_REVIEW` enum value.

The existing database trigger continues to prevent updates or deletion of
`RentalRequestItem` snapshots. Catalogue edits therefore cannot rewrite a
customer's original product snapshot or requested quantity.

## Assignment

Staff with both `rental_request.view` and `rental_request.assign` can assign,
reassign, or unassign a request.
Only an eligible, active staff user may be selected; disabled or unknown users
are rejected. Assignment means ownership of the review task only. It is not an
approval and has no effect on inventory or reservations.

The assignment control sends the current `reviewVersion`. If another staff
member changes the request first, the stale update receives a conflict response.
Refresh the detail page, review the latest assignment, and then retry if the
change is still appropriate.

## Internal notes and activity

Staff with both `rental_request.view` and `rental_request.update` can add a
non-empty, bounded internal note.
Notes are rendered as text, not trusted HTML, and are not copied into ordinary
application logs. The author and timestamp remain visible to authorized staff.

Activity history is not a customer conversation. It exists to preserve review
accountability and must not contain passwords, capability values, session
tokens, or unnecessary customer secrets. This is a focused request-review
history; the wider cross-domain audit-log module remains a later phase.

## Permissions

The API is the authorization boundary:

- `rental_request.view` permits queue and detail access.
- `rental_request.view` plus `rental_request.assign` permits assignment,
  reassignment, and unassignment.
- `rental_request.view` plus `rental_request.update` permits internal notes and
  starting review.
- `inventory.view` **and** `inventory.quantity.view` are required before the
  request detail includes internal inventory context.

`rental_request.approve`, `rental_request.partially_approve`, and
`rental_request.reject` are not used by Phase 9 actions.

Default intent remains:

- `SUPER_ADMIN` and `ADMIN` have all Phase 9 review capabilities.
- `SALES_PERSON` can view, be assigned, assign where mapped, add permitted
  review information, and view quantities only because its seeded role has the
  explicit inventory permissions.
- `EDITOR` has no rental-request review permission by default.

Navigation visibility is only a usability feature. Direct API requests are
still independently authenticated and authorized. Missing authentication
returns 401; an authenticated staff member without the required permission
receives 403.

## Internal inventory context

The detail view can associate each immutable request line with the product's
current inventory definition and currently supported operational totals. These
values are omitted unless the caller holds both inventory permissions above.
A request viewer without quantity access can still review the rest of the
request.

Every quantity display must carry this limitation:

> Current internal inventory context only. Date-based booking conflicts are not
> yet calculated.

These totals describe the ledger now. They are not an availability calculation
for the customer's requested date range. Opening a request, assigning it,
adding a note, or starting review creates no inventory transaction, changes no
inventory state, creates no reservation, and assigns no serialized asset.

## Administrative API

All routes below require a valid active staff session and the stated permission:

- `GET /admin/rental-requests` — paginated queue (`rental_request.view`).
- `GET /admin/rental-requests/:id` — internal detail
  (`rental_request.view`; inventory context is additionally permission gated).
- `GET /admin/rental-requests/assignees` — eligible active staff
  (`rental_request.view` + `rental_request.assign`).
- `PUT /admin/rental-requests/:id/assignment` — assign or reassign
  (`rental_request.view` + `rental_request.assign`).
- `DELETE /admin/rental-requests/:id/assignment` — unassign
  (`rental_request.view` + `rental_request.assign`).
- `GET /admin/rental-requests/:id/notes` — internal notes
  (`rental_request.view`).
- `POST /admin/rental-requests/:id/notes` — append a note
  (`rental_request.view` + `rental_request.update`).
- `PUT /admin/rental-requests/:id/review-state` — start review only
  (`rental_request.view` + `rental_request.update`).
- `GET /admin/rental-requests/:id/activity` — append-only history
  (`rental_request.view`).

Mutation payloads use shared Zod validation. Request IDs, assignee IDs, note
bodies, operation IDs, state values, and expected versions are never accepted
without validation.

## Admin routes

- `http://localhost:3001/rental-requests` — request queue.
- `http://localhost:3001/rental-requests/{id}` — internal request detail and
  review tools.

The wide admin shell provides search, filters, pagination, loading/empty/error
states, responsive table/card presentation, assignment, notes, activity, and
the start-review action according to effective permissions. It remains usable
in light and dark themes and at narrow widths. The page is private/no-store and
not intended for indexing.

## Public confidentiality

Customer tracking continues to require its guest capability and uses a
separate allowlisted mapper. It never includes assigned staff, staff IDs,
internal notes, activity, internal inventory counts, conflict assessments,
review comments, permissions, capability/session hashes, or staff session data.
Internal status is mapped to a customer-safe status where required; internal
names and history are not serialized automatically.

The reference number is readable identification, not authorization. Phase 9
does not add customer authentication and does not weaken guest tracking.

## Phase 10 continuation

Phase 10 now adds approval, partial approval, rejection, separate approved
quantities, safe decision communication, and append-only decision history.
Assignment is frozen once a decision is terminal. Internal notes may still be
appended. See [Rental request decisions](rental-request-decisions.md). Quotes,
prices, confirmed orders, reservations, requested-period availability,
delivery, return, maintenance, customer accounts, and mobile remain deferred.
