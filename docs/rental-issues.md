# Rental return issues

`RentalIssue` is the current internal projection for a missing, damaged, maintenance-required, late, wrong-item, or unresolved-quantity concern discovered during return reconciliation. It is separate from the immutable return intake and from inventory transactions.

Damaged, missing, and maintenance issues are created atomically with their intake operation. Authorized staff may add bounded manual late, wrong-item, or unresolved-quantity issues. Each issue retains the originating return item and operation, optional exact serialized checkout occurrence, original internal description, optional customer-safe description, quantity, unresolved quantity, blocking flag, and monetary projections.

Issue workflow states describe staff work (`OPEN`, `UNDER_REVIEW`, `CUSTOMER_CONTACTED`, `AWAITING_ITEM_RETURN`, `AWAITING_INSPECTION`, `AWAITING_REPAIR`, `AWAITING_PAYMENT`, `RESOLVED`). Resolution outcomes are separate immutable events (`ITEM_RETURNED`, `REPAIRED`, `PAID`, `WAIVED`, `WRITTEN_OFF`, `REPLACED`, `OTHER`). Multiple partial resolution events are supported and the original issue is never overwritten or deleted.

Physical outcomes require a positive quantity and explicit resulting inventory state. Payment and waiver accept a positive resolution quantity but no inventory state and append no inventory movement. They may close the administrative issue when staff intentionally records a final commercial settlement, while the equipment remains in its existing `MISSING`, `DAMAGED`, or `MAINTENANCE` physical bucket. Recovery, repair, and write-off are the only outcomes that move physical inventory. Rental completion requires every blocking issue to be resolved.

Protected APIs are `GET /admin/rental-issues`, `GET /admin/rental-issues/:id`, and `POST /admin/rental-issues/:id/resolutions`. `/issues` and `/issues/:id` are permission-aware admin routes. They never become public APIs.

Permissions are independent and additive:

- `rental_issue.view` reads internal issue data.
- `rental_issue.update` creates manual issues.
- `rental_issue.resolve` plus `return.reconcile` records resolutions/recoveries.

`SUPER_ADMIN` and `ADMIN` receive all return and issue permissions. `SALES_PERSON` receives only `return.view` by default. `EDITOR` receives none. Backend enforcement is authoritative.
