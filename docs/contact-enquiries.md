# Contact enquiries

## Relationship to Cart enquiries

General `ContactEnquiry` and structured `CartEnquiry` are deliberately separate. Cart enquiries snapshot selected equipment, quantities, rental dates, fulfilment and project/contact details, and own a company-delivery outbox that can use authenticated SMTP. General Contact enquiries continue to use their existing database queue, are not routed through that SMTP transport, and are not silently converted. Both remain durable even when mail delivery is unavailable.

## Architecture

`POST /public/contact-enquiries` accepts a small allowlisted contact payload and creates one durable `ContactEnquiry`. This database-backed queue is the source of truth. Phase 18.6 does not configure an outbound email provider and never reports email delivery. Authorized staff review enquiries at `/contact-enquiries` in Admin.

The public Next.js BFF exposes only `POST /api/contact-enquiries`. It enforces the exact web Origin, JSON content type, and an 8 KiB byte limit, forwards to one fixed API path, validates the successful receipt, and maps upstream errors to customer-safe messages. API Origin validation repeats the boundary check.

## Fields and lifecycle

Stored fields are reference number, name, normalized email, optional phone/company, enquiry type, message, status, operation UUID, payload hash, status actor, and timestamps. Submission identity and content are database-trigger protected from updates. Staff may change only the declared `NEW`, `READ`, and `RESOLVED` status; each successful change creates a `PlatformAuditEvent`.

The public receipt contains only `accepted`, a safe message, and the customer-safe enquiry reference. It never contains the stored message, staff data, roles, permissions, operation/payload values, inventory, reservation, capability, or session information.

## Abuse and retry controls

- Shared Zod validation trims input, lowercases email, rejects unknown fields, and bounds every value.
- A visually hidden `website` honeypot is ignored with a uniform accepted response and no stored record.
- The API limits submissions by a SHA-256-derived IP/email key and a bounded global counter. Defaults are five submissions per identity per hour and 1,000 globally per minute per API process.
- The browser disables the submit button while a request is pending.
- A UUID operation ID makes exact retries idempotent. Reusing it with another payload returns `409`.
- Public responses use private/no-store and noindex headers. Sensitive values are not logged.

The in-memory limiter is suitable for the current single-process VPS direction. Before horizontally scaling the API, replace it with a shared rate-limit store; Redis remains unjustified until that concrete deployment need exists.

## Permissions

- `contact_enquiry.view`: list and read stored customer enquiries.
- `contact_enquiry.manage`: update enquiry status.

SUPER_ADMIN receives all permissions. ADMIN and SALES_PERSON receive both contact permissions by seeded default. EDITOR receives neither. The API permission guard is authoritative; Admin navigation visibility is only a convenience.

## Email-provider direction

Phase 19.2 adds a durable outbox and optional authenticated SMTP transport only for structured Cart enquiries. `SMTP_ENABLED=true` selects it and validated deployment configuration supplies the host, port/TLS mode, username, password, and sender identity. This does not retrofit general Contact enquiries: their Admin queue remains the notification source and the application makes no email-delivery claim for them.

Cart delivery records attempts separately from the accepted enquiry. SMTP delivery is not exactly once: provider acceptance followed by an interrupted database update can leave an ambiguous `PROCESSING` row, and an operator retry could send a duplicate. Staff may recover a claim older than ten minutes with the audited manual retry action, but there is no scheduled retry worker. A future shared delivery worker must preserve each accepted source record, use bounded retry/dead-letter handling, alert operators, and use provider-supported idempotency where available.
