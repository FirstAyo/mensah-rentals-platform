# Development Roadmap

Work proceeds in small, reviewable vertical slices. Each phase includes its
database, API, authorization, UI, documentation, and tests where applicable.

1. **Foundation (current):** monorepo, local environment, architecture docs, empty Prisma boundary, temporary web/admin pages, API health, PostgreSQL, repeatable commands.
2. **Authentication:** secure staff/customer identity direction, guest support, session/token handling, protected API foundation.
3. **Permission-based RBAC:** users, roles, permissions, assignments, backend guards, initial role seeds, permission tests.
4. **Product and category foundation:** admin management contracts, public-safe DTOs, media direction, indexes, validation.
5. **Inventory foundation:** bulk and serialized models, confidential admin APIs, append-only transactions, permission and privacy tests.
6. **Customer website and catalogue:** public design system, catalogue search/filter/pagination, product details, accessibility and responsive testing.
7. **Rental cart:** client/server cart design with explicit proof that cart actions do not reserve inventory.
8. **Rental requests:** guest and account submission, reference numbers, preserved requested quantities, customer-safe tracking.
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
