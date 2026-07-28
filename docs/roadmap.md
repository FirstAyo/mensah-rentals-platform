# Development Roadmap

Work proceeds in small, reviewable vertical slices. Each phase includes its
database, API, authorization, UI, documentation, and tests where applicable.

1. **Foundation (complete):** monorepo, local environment, architecture docs, Prisma boundary, temporary web/admin pages, API health, PostgreSQL, repeatable commands.
2. **Staff authentication foundation (complete):** staff identity, Argon2id passwords, database sessions, secure cookies, admin BFF, protected admin foundation, bootstrap, and auth tests. Customer authentication remains deferred; guest support remains required.
3. **Permission-based RBAC (complete):** roles, permissions, assignments, live backend authorization, protected system-role seed, permission-aware admin shell, and authorization tests.
4. **Product and category foundation (complete):** admin management contracts/UI, public-safe APIs/catalogue, optimized four-image upload pipeline, theme, technical SEO, indexes, validation, and privacy tests.
5. **Inventory foundation (complete):** bulk and serialized models, confidential admin APIs/UI, concurrency-safe append-only transactions, permission and privacy tests.
6. **Customer website and catalogue expansion (complete):** refined public visual design, server-backed combined filters and numbered pagination, bounded related products, accessible media gallery, hardened public projections, and Playwright/axe responsive automation.
7. **Rental cart (complete):** database-backed guest cart, opaque HttpOnly capability, fixed web BFF, idempotent desired quantities, responsive management UI, and explicit proof that cart actions do not inspect or reserve inventory.
8. **Rental requests (complete):** guest submission, random references, atomic/idempotent cart conversion, immutable requested quantities, private capability-based customer-safe tracking, and explicit non-reservation tests. Optional customer-account linking remains deferred until customer identity exists.
   8.1. **Cross-phase hardening (complete):** cart abuse limits, bounded expired-access cleanup, isolated integration-test database, recursive public-data regression checks, and partitioned browser suites. No staff request review or decision workflow is included.
9. **Administrative rental-request review (complete):** protected server-side queue, eligible-staff assignment with optimistic concurrency, append-only internal notes/activity, the non-decision `SUBMITTED -> UNDER_REVIEW` transition, and permission-gated current inventory context. No requested-date availability, reservation, decision, or dashboard metrics are included.
10. **Approval decisions (complete):** permission-separated approve, partial approval, and rejection; immutable decision records; separate approved quantities; customer-safe explanations; concurrency/idempotency protection; and explicit non-reservation proof.
11. **Quotes (complete):** decision-derived immutable revisions, exact CAD cents and basis-point tax, secure sending, revision-scoped customer capabilities, accept/reject responses, public confidentiality, and non-reservation proof.
12. **Confirmed rental orders (complete):** explicit accepted-revision conversion, immutable exact snapshots, dedicated customer access, confirmed/non-reserved status, and non-inventory regression proof.
    12.1. **Cross-phase workflow hardening (complete):** full-width admin shell, permission-aware actionable-work summaries, source-backed dashboard cards, fixed/percentage quote discounts, safe in-place unsent-draft editing, resend and explicit capability rotation, explicit order-link lifecycle, and confidential server-generated PDFs. It adds no reservation or inventory mutation.
13. **Customer amendments:** authenticated-or-capability-owned amendment requests with explicit staff review, preserved original history, and no automatic change to an accepted quote, confirmed order, or reservation.
14. **Date-based reservations:** half-open UTC ranges, concurrency-safe bulk/serialized allocation, overlap and double-booking tests.
15. **Operational dashboard and notifications:** reviewed cross-domain work queues and delivery mechanisms beyond the bounded Phase 12.1 polling foundation.
16. **Fulfilment:** separate pickup/delivery preparation, handoff, and asset/quantity fulfilment records.
17. **Returns and reconciliation:** return intake, missing/damaged outcomes, inventory reconciliation, and maintenance handoff with audit history.
18. **Content management:** pages, sections, galleries, FAQs, testimonials, SEO, EDITOR permissions.
19. **Reporting and audit:** permission-aware analytics, audit review, structured operational reporting.
20. **Hardening:** comprehensive tests, accessibility, responsive verification, security review, performance, backups, observability.
21. **Deployment:** local full-system verification, staging deployment/testing, then documented VPS production deployment.
22. **Mobile:** React Native/Expo only after the web platform and API are stable and only when explicitly instructed.

Redis remains deferred until a concrete cache, queue, distributed locking, or
session requirement justifies its operational cost.
