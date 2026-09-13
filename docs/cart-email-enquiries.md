# Cart email enquiries and customer submission mode

Phase 19.2 introduces a simple launch workflow without deleting or weakening the advanced Rental Request platform. A customer can still browse, choose unrestricted desired quantities, and manage the existing guest Cart. The authoritative database setting decides what a new submission becomes.

## Authoritative modes

`CustomerWorkflowSetting` is a singleton row with an optimistic version and one typed mode:

- `EMAIL_INQUIRY` (the seeded and launch default): Cart submission creates a durable `CartEnquiry` and company-email outbox entry.
- `PLATFORM_REQUEST`: new Cart submissions use the existing Rental Request workflow.

The public capability endpoint returns only the safe mode and the minimum availability booleans needed to choose the UI path. It never exposes internal feature rows, reasons, dependencies, actors, inventory, or workflow state. The API rechecks the current database mode inside each submission boundary; changing the browser payload or stale UI cannot bypass it. Switching mode affects only new submissions and never converts or deletes existing enquiries or requests.

Settings → Features provides the mode control. `WEBSITE_AND_EMAIL_ENQUIRIES` atomically selects `EMAIL_INQUIRY` with the optional operational modules disabled. The existing advanced presets remain available and the advanced Request → Decision → Quote → Order → Reservation → Fulfilment → Return implementation remains intact. Every successful mode change is audited and stale versions/conflicting operation IDs fail safely.

## Durable enquiry aggregate

- `CartEnquiry` stores an immutable customer/contact/project/date/fulfilment snapshot, optional company, notes and “additional equipment” plain text, source Cart capability hash, unique reference, operation ID/payload hash, and a mutable `NEW`, `READ`, or `RESOLVED` staff status.
- `CartEnquiryItem` stores an append-only complete snapshot of Product/category names and slugs, rental unit, desired quantity, and order. It does not rely on later Product edits for historical meaning.
- `OutboundEmail` is a durable company-delivery job with explicit `QUEUED`, `PROCESSING`, `SENT`, and `FAILED` state, attempt count, safe failure summary, retry time, and provider reference.
- `OutboundEmailAttempt` is append-only delivery history.

Submission uses transaction-scoped advisory locks and idempotency. A retry with the same Cart, operation ID, and payload returns the original result. Reusing an operation ID or source Cart with different content returns a conflict. The enquiry and company outbox row commit together before delivery is attempted, so provider failure cannot lose the accepted enquiry.

Email delivery uses an expiring processing claim. A fresh `PROCESSING` job cannot be retried, while an authorized staff member may recover one after ten minutes through the audited retry action. Delivery remains at-least-once: if SMTP accepted a message before an interrupted database update, staff must check the provider or mailbox before retrying because a duplicate is possible.

## Customer flow

The enquiry form is `/cart/enquiry`. It reads the existing HttpOnly guest Cart capability through a fixed Web BFF and accepts name, email, phone, optional company/project, rental dates, fulfilment method, optional location, optional notes, and optional bounded “additional equipment” text. Inputs use strict shared Zod schemas; the API repeats origin, content-type, capability, body-size, and rate-limit checks. The honeypot receives the same safe accepted response without persistence.

Successful submission returns only `accepted`, a safe message, and a reference number. This is an on-screen receipt; the current implementation does **not** queue a customer acknowledgement email. It queues the company notification only. No mail-provider error is returned to the customer.

Email-enquiry mode creates no RentalRequest, decision, Quote, Order, Reservation, fulfilment, return, customer account, acceptance link, availability calculation, inventory transaction, or inventory mutation. Customers may request quantities greater than internal stock and are never told availability.

## Delivery behavior and environment

`CART_ENQUIRY_RECIPIENT_EMAIL` is the authoritative deployment-level company recipient. Set it to a monitored mailbox. Local and test processes use an in-memory safe-capture transport and make no network request. Staging and production use authenticated SMTP when `SMTP_ENABLED=true`; startup validation also requires `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASSWORD`. `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME` control transport security and sender identity. Secrets belong only in the permission-restricted deployment `.env`.

Confirm SMTP host, port, TLS mode, username, and sender authorization with the mailbox provider. Staging must use a controlled recipient. The service requires TLS 1.2 or newer, uses authenticated SMTP, stores only a bounded provider reference, and never logs the password. An accepted enquiry is durable before delivery starts; delivery success becomes `SENT`, while provider failure becomes `FAILED` and is retryable by authorized staff. A database row proves acceptance, while `SENT` plus a controlled-mailbox smoke test proves provider delivery.

## Admin visibility and RBAC

Admin routes are `/enquiries` and the corresponding detail view. Staff can search/filter durable records, view the exact snapshot, see delivery state, mark `NEW`/`READ`/`RESOLVED`, and requeue a failed/queued company delivery. API routes are:

- `POST /public/cart/enquiries`
- `GET /admin/cart-enquiries`
- `GET /admin/cart-enquiries/:id`
- `PUT /admin/cart-enquiries/:id/status`
- `POST /admin/cart-enquiries/:id/email/retry`
- `PUT /admin/feature-settings/customer-workflow`
- `GET /public/features`

Viewing requires `cart_enquiry.view`; status/retry requires `cart_enquiry.manage`. SUPER_ADMIN and ADMIN receive both. SALES_PERSON receives both for customer follow-up. EDITOR receives neither. Staff sessions and backend permissions remain authoritative.

## Confidentiality and legal boundary

Public receipt/capability DTOs exclude contact snapshots, email body/delivery diagnostics, raw Cart tokens or hashes, operation/payload hashes, staff identities, RBAC data, Product internal prices, inventory quantities/states, reservations, and availability. Administrative email diagnostics use sanitized failure text and never expose credentials.

The existing Privacy content should be reviewed by the business owner to ensure it accurately describes enquiry contact/project/equipment data and operational email processing. Do not overwrite already published legal CMS content automatically.

## Local setup and testing

After copying `.env.example` to `.env`, set `CART_ENQUIRY_RECIPIENT_EMAIL` to a safe development mailbox value. Leave `SMTP_ENABLED=false`; local/test uses capture-only delivery and does not need real credentials.

```powershell
docker compose up -d postgres postgres-test
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Sign in at `http://localhost:3001/login`, open Settings → Features, and apply **Website + Email Enquiries**. At `http://localhost:3000`, add Products to Cart, open `/cart/enquiry`, submit valid contact/date details, then verify the reference and the record under Admin → Enquiries. The delivery state should reflect local safe capture; no external mailbox message is expected.

Before completion run:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:integrity
pnpm rbac:verify
pnpm seo:audit
pnpm test:e2e:gallery-homepage-launch-flow
git diff --check
```

Browser tests must own and reset only the guarded `_test` database. They must not target development, staging, or production.

## Staging-safe rollout

Do not deploy this phase automatically. Before a reviewed staging deployment, create and verify a staging database dump and media archive, confirm `.env` remains permission-restricted, configure `CART_ENQUIRY_RECIPIENT_EMAIL` and all required `SMTP_*` values, fast-forward to the reviewed commit, build, run migration deploy, seed/verify RBAC, and recreate only Mensah staging services. Confirm staging remains Basic-auth protected, `SITE_INDEXING_ENABLED=false`, sitemap 404, and all responses carry noindex headers.

Smoke-test Gallery, Cart, enquiry persistence, Admin visibility, controlled-mailbox delivery, retry behavior, and mode switching. Roll back the application to the previous image/commit if code checks fail; if migration/data checks fail, stop staging writers and restore the verified database and media backups together. Never use `down -v`, reset, truncate, or change main-domain DNS.
