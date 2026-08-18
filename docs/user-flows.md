# User flows

## Search discovery and private workflow boundary

Search engines may discover the homepage, clean rental catalogue, active category/product pages, and legal pages. Catalogue query variants remain usable to customers but canonicalize to the clean route and are noindex. A product or category that is inactive or tombstoned leaves the sitemap and returns 404 publicly while historical operational records remain intact.

Cart, rental submission, tracking results, amendments, change requests, quotes, confirmed orders, and official documents are transactional/private flows. They are never sitemap entries and use noindex headers/metadata. A public reference number or URL is never elevated into authentication, and capability material never appears in search metadata.

## Inventory administration

1. An authorized Admin opens one inventory aggregate and selects a tracking-mode-appropriate action.
2. Metadata editing never contains a quantity field or changes product/history identity.
3. Bulk **Add stock** appends a positive acquisition into `RENTABLE`; **Reduce / retire stock** removes only eligible, uncommitted owned stock with a typed reason.
4. Serialized inventory uses **Add serialized asset**, creating one exact internal asset per unit.
5. Delete first performs authoritative lifecycle analysis. A truly unused zero-stock aggregate can be permanently deleted through a custom confirmation dialog. Historical aggregates are offered archive only when no live commitment blocks it.
6. Archived inventory leaves the normal active workflow but remains reportable and can be restored when its parent product and current state allow it.
7. Every command is permission checked, idempotent, transactionally locked, and recorded in inventory/audit history. No customer response changes.

## Internal maintenance work order

1. Authorized staff create a manual preventive/corrective work order or open the action from an eligible return/issue.
2. The API locks and validates the exact equipment target, current physical state, reservations/preparation commitments, and active maintenance claims.
3. Equipment not already in maintenance moves there through one append-only inventory transaction. Existing maintenance disposition is linked without a second movement.
4. Staff may assign, schedule, start, wait for parts, resume, add notes, and mark work ready for inspection according to exact permissions and lifecycle.
5. A post-maintenance inspection is scheduled and performed. Failure returns work to progress and keeps equipment unavailable. Passing permits explicit completion.
6. Completion returns the equipment to `RENTABLE` or `DAMAGED`, records one inventory movement and append-only activity, and never changes physical total.
7. A linked rental issue remains unchanged unless authorized staff explicitly resolve it as repaired through the issue-resolution workflow.

## One-time routine inspection

1. Authorized staff schedule an inspection for bulk equipment or one exact serialized asset.
2. Starting the inspection safely claims/moves the equipment when needed.
3. A pass records the structured result and releases any inspection-owned hold exactly once.
4. A failure keeps the target unavailable and offers an explicit corrective work order; no work order, recurrence, or inventory movement is silently invented.

Customers do not participate in either flow and never receive maintenance data.

## Staff reporting flow

Authorized staff select a bounded date period and see only reports allowed by reporting plus domain permissions. An export rechecks live permissions, returns allowlisted CSV, and records an immutable audit event. Audit History is searchable but cannot be edited. System Status is safe and read-only; backup and restore remain operator-only commands outside the UI.

# Official document downloads

After the first confirmed pickup or delivery handoff, the private customer order page offers **Download Order Form**. Before that event it explains that the form is not yet available. After the return is finally completed, the same private page offers **Download Return Form**. Partial returns do not produce a final Return Form.
