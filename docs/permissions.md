# Permissions and Roles

## Phase 16.4A media and category-cover enforcement

Reusable media listing requires both `homepage.view` and `product.view`. Homepage upload/removal still requires `homepage.media.manage`; editing placements requires `homepage.edit`; preview and publish remain independent. Category-cover assignment/removal requires both `category.update` and `homepage.media.manage`, including a live active-user permission check inside the serializable mutation transaction. `homepage.view` alone is genuinely read-only. SALES_PERSON receives none of these media-management rights.

## Phase 16.4 homepage permissions

`homepage.view`, `homepage.edit`, `homepage.publish`, `homepage.media.manage`, `homepage.preview`, and `homepage.google_reviews.view_status` protect independent capabilities. SUPER_ADMIN, ADMIN, and EDITOR receive all six seeded defaults; SALES_PERSON receives none. Public homepage access requires no staff permission and reads only the published allowlisted DTO.

## Phase 15 permissions

`fulfilment.view`, `fulfilment.prepare`, `fulfilment.checkout`, `fulfilment.partial_checkout`, `fulfilment.handoff`, `fulfilment.pdf`, and `active_rental.view` are independent. SUPER_ADMIN/ADMIN receive all, SALES_PERSON receives view-only fulfilment access, and EDITOR receives none.

## Phase 14 permissions

- `inventory.reservation.view`: view internal reservation aggregates/history.
- `inventory.reservation.create`: create a reservation for a confirmed order.
- `inventory.reservation.update`: complete a recorded shortfall.
- `inventory.reservation.release`: release bulk quantities/assets.
- `inventory.reservation.override`: intentionally record partial/shortfall
  outcomes with a reason.
- `inventory.availability.view`: view internal date-range availability and
  eligible serialized assets.

`SUPER_ADMIN` and `ADMIN` receive all six. `SALES_PERSON` and `EDITOR` receive
none by default. Reservation
authority is never inferred from `order.create`, `order.update`,
`inventory.view`, or frontend visibility. Dashboard reservation metrics are
omitted without `inventory.reservation.view`.

## Phase 13 permissions

- `rental_request_revision.view`
- `rental_request_amendment.view`
- `rental_request_amendment.review`
- `rental_change_request.view`
- `rental_change_request.review`

SUPER_ADMIN receives every permission. ADMIN and SALES_PERSON receive these sales/operational permissions. EDITOR receives none of them. Customer capabilities are request-scoped ownership grants, not staff permissions. Backend enforcement remains authoritative.

Authorization is permission-based. Roles collect permissions; users may have multiple roles; effective permissions are the de-duplicated union of every assigned role. The API enforces permissions. Admin navigation filtering is only a usability aid.

## Final Phase 3 permission catalogue

- Products: `product.view`, `product.create`, `product.update`, `product.delete`
- Categories: `category.view`, `category.create`, `category.update`, `category.delete`

`category.update` permits editing and reversible activation/deactivation. `category.delete` is separate permanent catalogue-removal authority. Phase 16.2 grants permanent category deletion by default to `SUPER_ADMIN` and `ADMIN`; `EDITOR` and `SALES_PERSON` do not receive it. The Phase 16.2 migration removes the former broad `category.delete` assignment from the system `EDITOR` role while preserving custom-role mappings.

`product.update` permits metadata/slug editing and reversible activation/deactivation. `product.delete` is separate irreversible catalogue-removal authority. Phase 16.3 grants it by default only to `SUPER_ADMIN` and `ADMIN`; `EDITOR` and `SALES_PERSON` do not receive it. Migration `20260731130000_phase16_3_product_deletion` removes only the system EDITOR mapping and preserves custom-role assignments.

- Inventory: `inventory.view`, `inventory.quantity.view`, `inventory.adjust`, `inventory.transaction.view`
- Rental requests: `rental_request.view`, `rental_request.assign`, `rental_request.update`, `rental_request.approve`, `rental_request.partially_approve`, `rental_request.reject`
- Quotes: `quote.view`, `quote.create`, `quote.update`, `quote.send`, `quote.approve`
- Orders: `order.view`, `order.create`, `order.update`
- Customers: `customer.view`, `customer.update`
- Users: `user.view`, `user.create`, `user.update`, `user.delete`, `user.role.manage`
- Roles: `role.view`, `role.create`, `role.update`, `role.delete`, `role.manage_permissions`, `role.super_admin.manage`
- Content: `content.view`, `content.create`, `content.update`, `content.delete`
- Reports and audit: `report.view`, `audit_log.view`

`user.role.manage` and `role.super_admin.manage` refine the original suggested catalogue. Separating role assignment from general user updates and owner-role assignment from ordinary role management prevents accidental privilege escalation.

## Seeded roles and exact mappings

### SUPER_ADMIN

Receives all 56 catalogue permissions. The seed additively grants any newly introduced catalogue permission to this role.

### ADMIN

Receives: all `product.*`, all `category.*`, all four inventory permissions, all six rental-request permissions, all five quote permissions, all three order permissions, both customer permissions, `user.view`, `user.create`, `user.update`, `role.view`, all four content permissions, and `report.view`.

It does not receive `user.delete`, `user.role.manage`, any role mutation permission, `role.super_admin.manage`, or `audit_log.view`.

### EDITOR

Receives exactly: all four product permissions, all four category permissions, and all four content permissions.

It does not receive confidential inventory quantities, inventory adjustment, rental decisions, user/role management, reports, or audit logs.

### SALES_PERSON

Receives exactly: `product.view`, `category.view`, `inventory.view`, `inventory.quantity.view`, `rental_request.view`, `rental_request.assign`, `rental_request.update`, `quote.view`, `quote.create`, `quote.update`, `quote.send`, `customer.view`, and `customer.update`.

The confidential quantity permission is an explicit internal grant. It does not receive approval/rejection, role management, owner-level, inventory-adjustment, report, or audit permissions.

## Custom roles and seed behavior

The schema supports future custom roles (`isSystem = false`). The idempotent seed creates missing catalogue entries and system roles. It populates a non-super system role only when that role is first created, so later intentional mapping changes are not overwritten. It never deletes custom roles or permissions. A reserved role name found as a custom role causes the seed to fail safely.

## Super-admin protections

- `SUPER_ADMIN` is a protected system role and its permission mapping cannot be edited through Phase 3 APIs.
- Adding or removing it requires both `user.role.manage` and `role.super_admin.manage`.
- The last active staff user holding `SUPER_ADMIN` cannot lose it.
- An actor cannot assign a role or permission set containing permissions the actor does not hold.
- System-role deletion and renaming are impossible because Phase 3 exposes no role metadata/deletion endpoints.

## Inventory confidentiality

`inventory.quantity.view` is required for operational quantities. Customers, guest users, customer accounts, public APIs, and future customer mobile clients must never receive total, available, remaining, reserved, rented, damaged, maintenance, or lost quantities. Frontend hiding is not a security boundary.

Phase 5 uses cumulative checks: metadata requires `inventory.view`; quantities and serialized assets also require `inventory.quantity.view`; mutations additionally require `inventory.adjust`; append-only history additionally requires `inventory.transaction.view`. ADMIN and SUPER_ADMIN have all four. SALES_PERSON has metadata and quantity access only. EDITOR has none.

## Phase 9 rental-request review enforcement

- `rental_request.view` authorizes the internal queue, request detail, notes
  timeline, and activity timeline.
- `rental_request.assign`, together with `rental_request.view`, authorizes
  assignment, reassignment, and unassignment to eligible active staff.
- `rental_request.update`, together with `rental_request.view`, authorizes
  appending an internal note and the non-decision
  `SUBMITTED -> UNDER_REVIEW` transition.
- `inventory.view` plus `inventory.quantity.view` is required to add current
  internal inventory totals to a request detail response.

The approval, partial-approval, and rejection permissions are deliberately not
accepted for ordinary Phase 9 review actions. ADMIN and SUPER_ADMIN have full
review access under existing mappings. SALES_PERSON has the three review
permissions and the explicit inventory context permissions. EDITOR has none by
default. Backend permission checks are authoritative; permission-aware
navigation does not authorize an action. The three review permissions here are
`view`, `assign`, and `update`; they are not decision authority.

Phase 10 uses the decision permissions independently:

- `rental_request.approve` records full approval.
- `rental_request.partially_approve` records exact per-line partial approval.
- `rental_request.reject` records rejection.

Each also requires `rental_request.view`, an active staff session, and a live
transaction-time permission recheck. One decision permission never substitutes
for another. Default role mappings remain unchanged: SUPER_ADMIN and ADMIN
have all three. SALES_PERSON has none of the three decision permissions under
the current intentional mapping, despite having review permissions. EDITOR has
none.

## Phase 11 quote enforcement

- `quote.view`: list and view internal quote details and revision history.
- `quote.create`: create the first immutable draft from an eligible request; also requires `rental_request.view`.
- `quote.update`: create a later immutable revision; also requires `quote.view`.
- `quote.send`: send the latest draft and create customer access; also requires `quote.view`.
- `quote.approve`: remains catalogued but intentionally unused in Phase 11 because no managerial approval gate was specified.

SUPER_ADMIN has all five. ADMIN has all five under the existing broad mapping. SALES_PERSON has view/create/update/send but not approve. EDITOR has no quote permissions. Every mutation rechecks ACTIVE status and exact live permissions inside its transaction, so disabling a user or revoking permission takes effect before mutation/replay.

## Phase 12 confirmed-order enforcement

- `order.view`: list/view immutable internal confirmed-order snapshots.
- `order.create`: explicitly convert the authoritative accepted revision.
- `order.update`: controls Phase 12.1 customer-access lifecycle actions only;
  order commercial and reservation-state updates remain unimplemented.

SUPER_ADMIN and ADMIN have all three. SALES_PERSON and EDITOR have none by
default; quote permissions never imply order authority. Conversion rechecks
active status and live `order.create` inside the locked transaction.

## Phase 12.1 hardening enforcement

- `quote.update` permits in-place changes only to the latest unsent `DRAFT`;
  sent and terminal commercial snapshots remain immutable.
- `quote.send` plus `quote.view` permits initial send, safe resend of the same
  active link, and explicit capability rotation. Resend and rotation are
  distinct audited actions.
- `quote.view` permits staff PDF download for an immutable revision.
- `order.view` permits order detail and staff PDF download.
- `order.update` plus `order.view` permits generate, revoke, rotate, and resend
  of order customer access. It does not edit order snapshots, reserve inventory,
  or change order/reservation status.

`GET /admin/work-summary` returns only sections supported by the active user's
permissions. The actionable rental-request badge requires
`rental_request.view`; approved-awaiting-quote also requires `quote.create`;
accepted-awaiting-order requires `order.create`; order cards require
`order.view`. Backend omission, not frontend hiding, is the confidentiality
boundary.

## Phase 16 returns

The permission catalogue adds `return.view`, `return.create`, `return.partial`, `return.inspect`, `return.reconcile`, `return.complete`, `return.pdf`, `rental_issue.view`, `rental_issue.update`, and `rental_issue.resolve`. `SUPER_ADMIN` and `ADMIN` receive all ten. `SALES_PERSON` receives `return.view` only. `EDITOR` receives none. Creating intake requires create plus inspect; intentional partial intake also requires partial. Completion requires reconcile plus complete. A physical issue resolution requires issue resolve plus return reconcile. Staff PDFs require return view plus return PDF. Inventory, order, fulfilment, or active-rental permissions never imply return authority.
