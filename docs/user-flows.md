# User flows

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
