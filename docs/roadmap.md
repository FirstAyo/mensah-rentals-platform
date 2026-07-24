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
9. **Admin dashboard and request review:** assignment, internal availability, conflicts, notes, permission-aware metrics.
10. **Approval decisions:** approve, partially approve, reject, audit history, separate approved quantity, customer-safe explanations.
11. **Quotes:** staff-entered pricing, revisions, sending, customer responses, decimal money handling.
12. **Confirmed rental orders:** accepted-quote conversion and operational order lifecycle.
13. **Date-based reservations:** half-open UTC ranges, concurrency-safe bulk/serialized allocation, overlap and double-booking tests.
14. **Operations:** calendar, deliveries, returns, and maintenance in separate slices.
15. **Content management:** pages, sections, galleries, FAQs, testimonials, SEO, EDITOR permissions.
16. **Reporting and audit:** permission-aware analytics, audit review, structured operational reporting.
17. **Hardening:** comprehensive tests, accessibility, responsive verification, security review, performance, backups, observability.
18. **Deployment:** local full-system verification, staging deployment/testing, then documented VPS production deployment.
19. **Mobile:** React Native/Expo only after the web platform and API are stable and only when explicitly instructed.

Redis remains deferred until a concrete cache, queue, distributed locking, or
session requirement justifies its operational cost.
