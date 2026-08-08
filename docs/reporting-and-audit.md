# Operational reporting and audit history

Phase 18 adds internal, read-only operational intelligence. Reports query authoritative workflow tables; they do not maintain a second mutable reporting store and never change business state. Calendar boundaries use `REPORTING_TIME_ZONE` (default `Africa/Accra`) and are converted to UTC before querying.

## Report definitions

- Overview: selected-period request decisions, quote lifecycle, confirmed orders, preparation/checkouts, rental activations, returns, issues, maintenance, and inspections. Current workload cards are explicitly labelled snapshots. Rental-request volume includes an accessible chart and tabular fallback, bucketed by the configured business timezone.
- Rental requests: submitted requests with masked email, rental dates, current status/revision, quote progression, and whether an order exists. Filters: period, search, and request status.
- Quotes and orders: quote revisions/threads and confirmed orders, including created/sent/viewed/accepted/superseded counts and exact commercial snapshot values. Filters: period, search, record type, and quote status.
- Rentals and returns: active/overdue rentals, expected-return dates, partial/completed/reconciliation returns, and opened/resolved/current issues. Filters: period, search, record type, and overdue state.
- Inventory: confidential current physical states, a separately labelled remaining date-based reservation commitment, and authoritative movements. Filters: period, search, product/category ID, BULK/SERIALIZED, and movement action.
- Maintenance: created/open/waiting/overdue/completed/cancelled work, priority/type breakdowns, average completion duration, and scheduled/performed/pass/fail inspection metrics. Filters: period, search, record type, status, and priority.

## Stable metric definitions

- **Orders prepared** counts the immutable time a fulfilment reached ready state (`readyAt`), not the time preparation merely started.
- **Partial checkout events** count immutable checkout handoffs whose cumulative checked-out quantity still left part of the snapshotted commercial equipment list outstanding. A later full checkout does not remove the earlier partial event.
- **Partial return events** count immutable return-intake operations whose cumulative received quantity still left checked-out equipment outstanding. Later reconciliation or completion does not rewrite that historical event.
- **Reconciliation requested events** use append-only return activity. **Currently requiring reconciliation** is separately labelled as a current snapshot.
- **Inspections scheduled** counts inspection records created in the selected period regardless of their later performed or cancelled state.
- Daily request-volume dates project PostgreSQL `timestamptz` instants directly into `REPORTING_TIME_ZONE` before selecting the calendar date.

Lists are globally ordered and server paginated. Combined-source pages fetch only a bounded number of projected rows (maximum page 100 and page size 100). Presets are Today, Last 7 Days, Last 30 Days, This Month, Previous Month, This Year, and a validated custom range.

## Financial terminology

Quote and order values are stored in integer cents and rendered as CAD currency. `Sent quote value`, `Accepted quote value`, and `Confirmed order value` are immutable commercial snapshots. Quote acceptance rate uses quote revisions sent in the selected period as the denominator. There is no payment ledger, so the UI and exports never call these amounts revenue, cash received, profit, receivables, or paid value.

## Exports

Export is POST-only and requires `report.view`, `report.export`, and all domain permissions for that report. Audit export requires `audit_log.view` plus `audit_log.export`. Permissions are reloaded from PostgreSQL immediately before generation so removal takes effect without trusting a browser token.

`REPORT_EXPORT_MAX_ROWS` defaults to 10,000 and `REPORT_EXPORT_MAX_DAYS` to 366. Exceeding either returns 422 and no partial file. Filenames and headers are fixed allowlists. CSV uses UTF-8 BOM and RFC 4180 quoting. Cells beginning with formula-control characters after whitespace (`=`, `+`, `-`, `@`, tab, or carriage return) are prefixed safely so spreadsheet software treats them as text. Export audit metadata stores dates, row count, report key, and allowlisted non-free-text filters; customer search text and CSV content are not stored.

## Unified immutable audit history

`GET /admin/audit` projects `PlatformAuditEvent` and existing authoritative request, quote, order, reservation, fulfilment, inventory, return, maintenance, inspection, and homepage histories into one bounded timeline. It supports period, search, domain, action, and actor filters. Detail is `GET /admin/audit/:source/:id`; there is no mutation route.

Public DTOs are not reused. Audit summaries are allowlisted and omit raw metadata, payload hashes, operation IDs, internal notes, reasons, capability/session values, passwords, keys, and database details. `PlatformAuditEvent` has a unique source key for retry safety, and a PostgreSQL trigger rejects UPDATE and DELETE. Existing domain histories remain authoritative rather than being overwritten or copied destructively.

## Permissions and routes

SUPER_ADMIN and ADMIN receive `report.view`, `report.export`, `audit_log.view`, `audit_log.export`, `observability.view`, and `backup.view_status`. EDITOR and SALES_PERSON receive none by default. Detail navigation and server pages require the underlying domain permissions; API guards remain authoritative.

Admin routes are `/reports`, five report detail routes, `/reports/audit`, and `/reports/audit/:source/:id`. API routes are `/admin/reports/overview`, the five report resources and their `/export` actions, plus `/admin/audit`, `/admin/audit/:source/:id`, and `/admin/audit/export`. All responses are `private, no-store` and never public/customer contracts.

## Known boundaries

Current-state workload cards are not historical trends. Order completion has no separate authoritative order-completed timestamp, so the report does not invent one. Customer payments/revenue and predictive maintenance remain out of scope. Reporting is query-time and intentionally has no Redis cache; permission changes therefore take effect safely.
