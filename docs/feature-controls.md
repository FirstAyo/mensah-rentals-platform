# Feature controls and progressive rollout

Phase 18.5 adds durable global controls for optional rental-operation modules. Controls change runtime availability only: they never delete or rewrite business records, capabilities, snapshots, media, inventory, or audit history.

## States

- `ENABLED`: normal behavior subject to authentication, RBAC, customer capabilities, and workflow rules.
- `INTERNAL_TESTING`: Admin-authorized staff may use the module. Public/customer flows work in the explicit `LOCAL` and `STAGING` environments for end-to-end QA, but are non-discoverable and unavailable publicly in `PRODUCTION`.
- `DISABLED`: normal navigation and public entry points are hidden; direct API access is rejected with `FEATURE_UNAVAILABLE`; historical data remains intact.

`PLATFORM_ENVIRONMENT` must be `LOCAL`, `STAGING`, or `PRODUCTION`. It is explicit and is never inferred from a request hostname. The validation default is deliberately `PRODUCTION`, so omitting the variable fails closed for public Testing-mode access. Local and staging environments must opt in explicitly.

## Controlled features

`RENTAL_REQUESTS`, `QUOTES_AND_ORDERS`, `CUSTOMER_ORDER_PORTAL`, `INVENTORY_TRACKING`, `RESERVATIONS`, `FULFILMENT`, `RETURNS`, `DAMAGED_RETURN_HANDLING`, `MAINTENANCE`, `INSPECTIONS`, and `OPERATIONAL_REPORTING`.

Authentication, RBAC, audit, integrity protections, security middleware, health, backup/recovery, safe errors, homepage/CMS, catalogue, products, categories, media, legal pages, confidentiality, sitemap, robots, and SEO are deliberately not toggleable. There is no dedicated Contact page in the current repository; Phase 18.5 does not invent one.

## Dependencies

- Quotes and Orders requires Rental Requests because current quotes originate from an exact decided request revision.
- Customer Order Portal requires Quotes and Orders.
- Reservations requires Inventory Tracking and Quotes and Orders.
- Fulfilment requires Reservations, Inventory Tracking, and Quotes and Orders.
- Returns requires Fulfilment.
- Damaged Return Handling requires Returns and Inventory Tracking.
- Maintenance requires Inventory Tracking.
- Inspections requires Maintenance and Inventory Tracking.

Enabling a child at `ENABLED` requires all transitive prerequisites at `ENABLED`; Testing requires prerequisites at Testing or Enabled. Disabling a prerequisite requires explicit inclusion of every active dependent. The preview dialog lists every resulting change, and the backend applies it as one serializable transaction.

## Live-work blockers

Full disable is rejected when requests await review or re-review, approved or partially approved requests still await commercial follow-up, quotes or unreserved confirmed orders need handling, formal change requests remain submitted/under review/approved for requote, active customer quote/order links remain valid, reservations retain commitments, fulfilments remain in preparation/ready/partial checkout, active rentals still require returns, return issues remain unresolved, maintenance work orders are nonterminal, or inspections remain scheduled/in progress. Moving to Testing does not strand staff work and is allowed when dependencies remain valid. Blocker messages expose business-safe summaries, not raw database relationships.

## Presets

- **Website Only:** all optional operations Disabled; core public website and catalogue stay available.
- **Website + Rental Requests:** Rental Requests Enabled and other optional modules Disabled.
- **Staged Operations Test:** every optional module Testing.
- **Full Operations:** every optional module Enabled.

Preset preview is mandatory. A preset succeeds completely or leaves the configuration unchanged. Disabling changes require a 10–500 character internal reason.

## Persistence, concurrency, and audit

`PlatformFeatureSetting` stores one row per typed key, its state, optimistic version, update timestamp, and optional updater. Migration `20260827230000_platform_feature_controls` creates and seeds all 11 rows as Enabled so an upgrade preserves current behavior.

Mutations require a UUID operation ID and expected versions. A process-wide request/change coordinator prevents a guarded domain request from overlapping a setting transition in the current single-API VPS architecture. The setting transaction also uses a global PostgreSQL advisory lock and serializable isolation to prevent concurrent half-configurations; stale versions return `FEATURE_SETTINGS_STALE`. An exact operation replay returns the current authoritative settings without a duplicate audit event, while reuse with a different payload returns `OPERATION_ID_CONFLICT`. Before horizontally scaling the API, replace the process coordinator with an equivalent cross-instance database lease.

Append-only `PlatformAuditEvent` entries use `FEATURE_STATE_CHANGED` or `FEATURE_PRESET_APPLIED` and record safe changes, reason, actor, preset, operation ID, and payload hash. Secrets are never included.

## Enforcement and visibility

The reusable NestJS `@RequireFeature` decorator and global `FeatureGuard` enforce controllers after authentication and permission checks. The guard holds a read lease through response completion, while settings changes take the exclusive lease; this closes the guard-to-commit race in the current single API process. Damaged, missing, or maintenance return outcomes also perform an explicit payload-aware check before inventory mutation. Critical workflows have no non-controller transport in the current architecture, so the guarded HTTP application boundary is also the service entry boundary; future queues or jobs must acquire the same policy boundary before invoking mutations.

Admin navigation uses an authenticated, allowlisted availability response. Disabled direct routes first enforce normal page permission and then show a polished disabled page. Testing items have a text-and-icon badge. Audit History and System Status remain available independently.

The public response contains only `rentalRequests` and `customerOrderPortal` booleans. It contains no internal state names, graph, version, reason, actor, audit, inventory, or workflow data. Catalogue pages remain public and indexable. Disabled transactional pages retain noindex behavior and are excluded from the sitemap.

## Admin UX and notifications

Settings → Features requires `feature_settings.view`; changes require `feature_settings.manage`. SUPER_ADMIN and ADMIN receive both; EDITOR and SALES_PERSON receive neither. Cards show friendly names, descriptions, state text/icons, dependencies, dependents, and last change date. Accessible custom dialogs handle previews and blockers. Real pending state disables controls, uses `aria-busy`, prevents duplicates, and displays a reduced-motion-safe spinner.

Settings reuses the global top-right Admin notification provider. Success uses a polite status; failures use an alert. Notifications stack up to five, can be dismissed, and begin auto-dismiss after 4.25 seconds with a 250 ms transition. Failed persistence never leaves a locally optimistic state selected.

## Local verification

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Sign in at `http://localhost:3001/login`, open Settings → Features, preview a preset, and confirm it. Use `pnpm test:e2e:feature-settings` for isolated browser QA. It resets only `mensah_rentals_test`, never the development database. Restore Full Operations after manual development testing unless a different local rollout is intentional.
