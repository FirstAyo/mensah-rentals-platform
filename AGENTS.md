# Mensah Rentals Platform — Codex Project Instructions

## Project Overview

This repository contains the new digital platform for Mensah Rentals & Services, an equipment rental company serving events, film productions, and other projects.

The long-term platform consists of:

1. A customer-facing website.
2. An equipment rental catalogue.
3. A customer rental cart.
4. A rental request system.
5. Optional customer accounts.
6. A rental request tracking system.
7. An administrative dashboard.
8. An inventory management system.
9. A quote management system.
10. A confirmed rental order management system.
11. Delivery and return management.
12. Equipment maintenance tracking.
13. Website content management.
14. Reporting and analytics.
15. User, role, and permission management.
16. Audit logging.
17. A React Native mobile application developed after the web platform and API are stable.

The system is a rental-request platform, not a traditional automatic-price e-commerce store.

Customers browse equipment, choose the quantities they want, add products to a cart, and submit a rental request.

Customers do not see or calculate a final rental price.

A salesperson or authorized administrator reviews the request, checks internal inventory availability, and decides whether the requested items can be supplied.

The staff member can then approve, partially approve, or reject the request.

For an approved or partially approved request, an authorized staff member prepares a custom quote and sends it to the customer.

An accepted quote can then become a confirmed rental order.

---

# Required Technology

Use TypeScript throughout the platform whenever supported.

## Customer Website

Use:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons
- TanStack Query where appropriate
- React Hook Form where appropriate
- Zod for validation where appropriate

## Admin Dashboard

Use:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Recharts
- TanStack Table
- TanStack Query
- React Hook Form
- Zod

## Backend API

Use:

- Node.js
- NestJS
- TypeScript
- REST API
- Prisma ORM
- PostgreSQL

## Infrastructure

Use:

- Docker
- Docker Compose
- PostgreSQL
- Redis only where justified
- Environment-based configuration

The production platform is expected to eventually run on a VPS.

The development environment must work locally before any deployment to the VPS.

## Mobile Application

The future mobile application should use:

- React Native
- Expo
- TypeScript
- Expo Router
- NativeWind
- TanStack Query
- React Hook Form
- Zod

Do not begin implementing the mobile application until explicitly instructed.

The website, API, admin dashboard, and core business workflows must be stable first.

---

# Repository Architecture

Use a monorepo.

The intended structure is approximately:

apps/web
apps/admin
apps/api
apps/mobile

packages/database
packages/ui
packages/types
packages/validation
packages/auth
packages/config

The architecture may be improved where there is a clear technical reason.

Do not create duplicate domain models, validation rules, or TypeScript types across applications when they can be safely shared.

Maintain clear boundaries between:

- Customer website functionality.
- Administrative functionality.
- Backend business logic.
- Database access.
- Shared types.
- Shared validation.
- Shared UI primitives.

---

# Core Business Workflow

The primary business workflow is:

Cart
-> Rental Request
-> Staff Review
-> Approval, Partial Approval, or Rejection
-> Quote
-> Customer Acceptance
-> Confirmed Rental Order
-> Inventory Reservation
-> Fulfillment
-> Return
-> Completion

These are separate concepts.

Do not represent all of these concepts as one generic Order entity.

In particular, maintain clear distinctions between:

- Cart.
- Rental Request.
- Quote.
- Confirmed Rental Order.
- Inventory Reservation.
- Fulfillment.
- Return.

---

# Customer Rental Workflow

Customers may:

- Browse products.
- Search products.
- Filter products.
- View product information.
- Select a desired quantity.
- Add products to a rental cart.
- Increase quantities.
- Decrease quantities.
- Remove products.
- Clear the cart.
- Select rental dates where required.
- Enter event or project information.
- Provide contact information.
- Submit a rental request.
- Receive a unique request number.
- Track the status of a request.
- Optionally create a customer account.

Guest rental requests must be supported.

A customer must not be required to create an account before submitting a rental request.

The public system must not automatically calculate or display a final rental price.

---

# Public Inventory Visibility

Inventory quantities are confidential operational information.

Customers must never be shown:

- Total quantity owned.
- Available quantity.
- Remaining quantity.
- Reserved quantity.
- Currently rented quantity.
- Damaged quantity.
- Maintenance quantity.
- Lost quantity.

This restriction applies to:

- The public website.
- Guest users.
- Registered customer accounts.
- Public API responses.
- The future customer mobile application.

Customers may select and request their desired quantities without knowing how much inventory Mensah Rentals currently has available.

For example, a customer may request:

100 Folding Chairs

The customer must not be told:

80 available

or:

Only 80 remaining

The customer should be allowed to submit the requested quantity.

Authorized staff will review the request and decide what can actually be supplied.

The customer-facing application must not expose confidential inventory information.

Do not solve inventory privacy by merely hiding values in the frontend.

The public API itself must not send confidential inventory values to the customer's browser or mobile application.

Create separate public and administrative API response models where necessary.

A public product response may contain information such as:

- id
- name
- slug
- description
- category
- images
- specifications
- rental unit information
- related products

A public product response must not contain information such as:

- totalQuantity
- availableQuantity
- remainingQuantity
- reservedQuantity
- rentedQuantity
- damagedQuantity
- maintenanceQuantity
- lostQuantity

Administrative inventory APIs may expose operational quantities only after authentication and authorization checks.

---

# Rental Request Review

Submitting a rental request does not mean the equipment is automatically approved.

After a customer submits a request, authorized staff must review it.

Staff should be able to see:

- Customer information.
- Event or project information.
- Requested rental dates.
- Requested products.
- Requested quantities.
- Internal available quantities.
- Existing reservations.
- Relevant date conflicts.
- Inventory currently rented.
- Inventory under maintenance.
- Inventory marked as damaged where appropriate.

Authorized staff can then determine whether the company can fulfill the request.

The system should support the following general outcomes:

- Approved.
- Partially approved.
- Rejected.

The exact request status workflow should be carefully designed before implementation.

---

# Partial Approval

A customer may request more equipment than Mensah Rentals can supply.

For example:

Customer requests:
100 Folding Chairs

Internal staff determines:
80 can be supplied

Authorized staff should be able to adjust the proposed approved quantity.

The system should preserve:

- The quantity originally requested by the customer.
- The quantity approved by staff.

Do not overwrite the customer's original requested quantity in a way that destroys the request history.

Important changes must remain auditable.

---

# Request Rejection

Authorized staff may reject a rental request when appropriate.

The system should support an internal rejection reason.

Where appropriate, the customer may receive a customer-safe explanation.

Internal staff notes and private rejection information must not automatically be exposed to customers.

---

# Inventory Reservation Rules

This is rental inventory, not traditional retail inventory.

Adding an item to a cart does not reserve inventory.

Submitting a rental request does not automatically create a permanent inventory reservation.

A rental request must first go through the required review and business workflow.

Inventory should be reserved only at the correct approved or confirmed stage defined by the final domain design.

The system must prevent accidental double-booking at the actual inventory reservation stage.

Availability must eventually support date ranges.

---

# Inventory Rules

The inventory system must support operational inventory management.

Inventory concepts should support:

- Total quantity.
- Available quantity.
- Reserved quantity.
- Currently rented quantity.
- Maintenance quantity.
- Damaged quantity.
- Lost quantity where required.

These values are for authorized internal users only.

Customers must never see these quantities.

The system must support both:

- BULK inventory.
- SERIALIZED inventory.

## Bulk Inventory

Examples may include:

- Chairs.
- Tables.
- Traffic cones.
- Similar interchangeable equipment.

Bulk inventory is generally tracked by quantity.

## Serialized Inventory

Some individual equipment may need its own identity.

Examples may include equipment with:

- Asset numbers.
- Serial numbers.
- Maintenance history.
- Individual condition records.

The system architecture should support both models without requiring a future complete redesign.

---

# Date-Based Rental Availability

Rental availability cannot be based only on a single current quantity value.

The system must eventually determine whether inventory is available for a requested rental period.

For example:

Mensah Rentals owns 100 chairs.

Rental A reserves:

60 chairs
July 10 to July 12

Rental B requests:

70 chairs
July 11 to July 14

The system must recognize the overlapping dates when authorized staff review availability.

The availability calculation should consider relevant reservations and inventory states.

Do not expose the calculated available quantity to public customers.

Only authorized staff should see the internal availability result.

---

# Inventory Transactions

Important inventory changes must create transaction or history records.

Do not silently change important inventory quantities without preserving history.

Inventory history may include:

- Inventory added.
- Inventory removed.
- Inventory reserved.
- Inventory released.
- Equipment rented out.
- Equipment returned.
- Equipment damaged.
- Equipment sent to maintenance.
- Equipment restored from maintenance.
- Equipment marked lost.
- Manual adjustments.

Important inventory operations should record appropriate information such as:

- Action.
- Date.
- Quantity.
- User responsible.
- Related rental order where applicable.
- Notes.
- Previous state where appropriate.
- New state where appropriate.

Use database transactions when partial database updates could corrupt inventory consistency.

---

# Quote Workflow

Customers do not automatically receive calculated prices.

After staff review and appropriate approval, an authorized staff member may prepare a quote.

A quote may eventually contain:

- Product or equipment.
- Approved quantity.
- Unit rental price entered by staff.
- Line totals.
- Delivery charges.
- Setup charges.
- Labour charges.
- Discounts.
- Taxes.
- Other approved charges.
- Notes.
- Terms.

Price calculations should occur only after authorized staff enter the required pricing information.

A quote may have statuses such as:

- Draft.
- Sent.
- Viewed.
- Accepted.
- Rejected.
- Expired.
- Superseded.

The final status design should be documented before implementation.

Quote revisions should preserve appropriate history.

---

# Confirmed Rental Orders

An accepted quote may become a confirmed rental order according to the final business workflow.

A confirmed rental order is different from:

- A cart.
- A submitted rental request.
- A quote.

The order system should eventually support:

- Customer.
- Event or project.
- Products.
- Approved quantities.
- Rental dates.
- Delivery or pickup information.
- Assigned employees where appropriate.
- Internal notes.
- Operational status.
- Inventory reservations.
- Fulfillment.
- Returns.

---

# User Roles and Permissions

Implement proper role-based access control.

Use a structure based on:

User
Role
Permission
UserRole
RolePermission

Do not scatter hard-coded checks such as:

if user.role === "ADMIN"

throughout the application.

Prefer permission-based authorization.

The system must initially support:

- SUPER_ADMIN
- ADMIN
- EDITOR
- SALES_PERSON

The architecture must support future custom roles.

Examples of possible future roles include:

- Warehouse Manager.
- Dispatcher.
- Sales Manager.
- Content Manager.
- Operations Manager.

Authorized administrators must be able to create roles and assign permissions according to the final permission model.

---

# Super Admin

SUPER_ADMIN has full system access.

This may include:

- Users.
- Roles.
- Permissions.
- Products.
- Categories.
- Inventory.
- Rental requests.
- Quotes.
- Confirmed rental orders.
- Customers.
- Reports.
- Website content.
- Settings.
- Audit logs.

Protected owner-level actions should remain appropriately restricted.

---

# Admin

ADMIN has broad operational administrative access.

Possible capabilities include:

- Review rental requests.
- Approve requests.
- Partially approve requests.
- Reject requests.
- View internal inventory quantities.
- Manage products.
- Manage inventory.
- Manage quotes.
- Manage orders.
- Manage customers.
- View operational reports.
- Manage employees where permitted.
- Manage website content where permitted.

An ADMIN should not automatically be allowed to perform protected SUPER_ADMIN actions unless explicitly permitted.

---

# Editor

EDITOR primarily manages public-facing website content.

Possible capabilities include:

- View products.
- Create products.
- Edit products.
- Manage product descriptions.
- Manage categories.
- Upload product images.
- Manage galleries.
- Manage website pages.
- Manage FAQs.
- Manage testimonials.
- Manage featured content.
- Manage SEO content where appropriate.

An EDITOR should not automatically have permission to:

- View confidential inventory quantities.
- Adjust inventory.
- Approve rental requests.
- Manage roles.
- Manage permissions.
- Access protected financial information.

Permissions remain the final source of authorization.

---

# Sales Person

SALES_PERSON primarily manages customer rental and quotation workflows.

Possible capabilities include:

- View rental requests.
- View assigned rental requests.
- View customer information required for sales work.
- View internal product availability where permission is granted.
- Review requested quantities.
- Add internal sales notes.
- Contact customers.
- Prepare quotes.
- Edit permitted quotes.
- Send quotes.
- Manage follow-up activities.
- Perform permitted rental workflow actions.

A SALES_PERSON should not automatically be allowed to:

- Manage system roles.
- Manage permissions.
- Delete protected inventory history.
- Modify protected system settings.

Permissions remain the final source of authorization.

---

# Permission Model

Possible permissions include:

product.view
product.create
product.update
product.delete

category.view
category.create
category.update
category.delete

inventory.view
inventory.quantity.view
inventory.adjust
inventory.transaction.view

rental_request.view
rental_request.assign
rental_request.update
rental_request.approve
rental_request.partially_approve
rental_request.reject

quote.view
quote.create
quote.update
quote.send
quote.approve

order.view
order.create
order.update

customer.view
customer.update

user.view
user.create
user.update
user.delete

role.view
role.create
role.update
role.delete
role.manage_permissions

content.view
content.create
content.update
content.delete

report.view

audit_log.view

The final permission names may be improved during architecture design.

Backend authorization must always be enforced.

Hiding a frontend button is not sufficient authorization.

---

# Admin Dashboard

The administrative dashboard should eventually support the following major areas:

- Dashboard.
- Rental Requests.
- Quotes.
- Rental Orders.
- Calendar.
- Inventory.
- Products.
- Categories.
- Customers.
- Companies where appropriate.
- Deliveries.
- Returns.
- Maintenance.
- Website Content.
- Users.
- Roles and Permissions.
- Reports.
- Activity Logs.
- Notifications.
- Settings.

The dashboard should use professional and readable metrics.

Use appropriate components such as:

- Metric cards.
- Charts.
- Tables.
- Filters.
- Search.
- Status badges.
- Empty states.
- Loading skeletons.
- Confirmation dialogs.
- Toast notifications.

Use shadcn/ui where appropriate.

Use Lucide icons consistently.

Use Recharts for suitable dashboard data visualizations.

Use TanStack Table where appropriate for complex administrative tables.

---

# Dashboard Metrics

Potential dashboard metrics may include:

- New rental requests.
- Requests awaiting review.
- Quotes awaiting customer response.
- Confirmed rentals.
- Today's deliveries.
- Today's returns.
- Total inventory.
- Available inventory.
- Reserved inventory.
- Currently rented inventory.
- Damaged equipment.
- Equipment in maintenance.

Confidential inventory metrics must only appear to authorized users.

Dashboard metrics should respect permissions.

---

# Customer Website Pages

The public website should eventually include appropriate pages such as:

- Home.
- Rentals.
- Product Categories.
- Product Details.
- Industries.
- Services.
- About.
- Projects or Gallery.
- FAQ.
- Contact.
- Rental Cart.
- Rental Request.
- Rental Request Confirmation.
- Track Request.
- Customer Account.
- Customer Requests.
- Customer Quotes.
- Customer Rentals.
- Customer Profile.
- Privacy Policy.
- Terms.
- Accessibility where appropriate.

The exact information architecture may be refined during design.

---

# Product Catalogue

The public catalogue should eventually support:

- Product search.
- Categories.
- Subcategories where appropriate.
- Filters.
- Sorting.
- Grid or list presentation where appropriate.
- Pagination or another scalable loading strategy.
- Related products.
- Featured products.

Do not expose confidential inventory quantities.

Do not display phrases such as:

- 10 remaining.
- Only 2 left.
- 50 available.

Customers may choose their desired quantities and submit their request.

---

# Rental Cart

The rental cart should allow customers to:

- Add products.
- Change quantities.
- Remove products.
- Clear the cart.
- Continue browsing.
- Enter or select rental information.
- Proceed to submit a rental request.

Adding products to a cart must not reserve inventory.

The cart must not expose internal availability quantities.

---

# Rental Request Information

The eventual rental request flow may collect appropriate information such as:

Customer information:

- Full name.
- Company where applicable.
- Email.
- Phone.

Project or event information:

- Event or project name.
- Event type.
- Rental start date.
- Rental end date.
- Location.
- Other relevant details.

Fulfillment information:

- Pickup.
- Delivery.
- Delivery and setup where available.

Additional information:

- Special instructions.
- Customer notes.

The final fields should be based on actual Mensah Rentals business requirements.

---

# Request Tracking

A submitted rental request should receive a unique reference number.

Example format:

MR-2026-001284

The exact format may be refined.

Customers should eventually be able to securely track their request.

Possible customer-facing statuses may include:

- Request Submitted.
- Under Review.
- Quote Being Prepared.
- Quote Sent.
- Awaiting Customer Confirmation.
- Confirmed.
- Preparing Equipment.
- Ready for Pickup.
- Out for Delivery.
- Rental Active.
- Return Scheduled.
- Completed.

Internal statuses may be more detailed.

Do not expose confidential internal information or staff-only notes through customer tracking.

---

# Content Management

The platform should include a lightweight content management system because authorized staff must be able to maintain the website without editing application source code.

Potential content areas include:

- Homepage sections.
- About page.
- Services.
- Industries.
- FAQs.
- Galleries.
- Testimonials.
- Announcements.
- Featured content.
- SEO metadata.

The EDITOR role should primarily manage this area according to permissions.

---

# API Rules

Use consistent REST API conventions.

Use appropriate HTTP status codes.

Validate request input.

Return consistent error structures.

Implement pagination for endpoints returning large collections.

Support server-side:

- Searching.
- Filtering.
- Sorting.
- Pagination.

Do not implement critical filtering only against the currently loaded frontend page.

Document API contracts.

Separate public responses from internal administrative responses when confidentiality requires it.

Never expose internal inventory quantities from public APIs.

---

# Database Rules

Use PostgreSQL.

Use Prisma migrations.

Do not manually modify the production database schema.

Use appropriate:

- Primary keys.
- Foreign keys.
- Unique constraints.
- Database indexes.

Use indexes for fields frequently used for:

- Searching.
- Filtering.
- Sorting.
- Joining.

Use appropriate decimal database types for money.

Do not use normal JavaScript floating-point arithmetic as the authoritative source of monetary values.

Use createdAt and updatedAt timestamps for important entities.

Use audit logging for important administrative actions.

Prefer preserving business history rather than permanently deleting important records.

Consider soft deletion where permanent deletion would damage historical records.

---

# Core Domain Areas

The final domain model should consider entities such as:

User
Role
Permission
UserRole
RolePermission

Customer
CustomerAddress

Product
Category
ProductImage
ProductSpecification

Inventory
InventoryItem
InventoryTransaction

Cart
CartItem

RentalRequest
RentalRequestItem

Quote
QuoteItem

RentalOrder
RentalOrderItem

InventoryReservation

Delivery
Return

MaintenanceRecord

Notification

AuditLog

Page
PageSection

Media

Do not blindly create every suggested entity.

Evaluate domain relationships carefully and document significant architecture decisions.

---

# Authentication and Authorization

Implement secure authentication.

Enforce authorization on the backend.

Do not rely solely on frontend route protection.

Use permission checks for protected business actions.

Sensitive administrative endpoints must require authentication and appropriate permissions.

Public customer endpoints must expose only information appropriate for customers.

Never send confidential administrative data and rely on the frontend to hide it.

---

# Security Rules

Never expose secrets to the browser.

Never commit real secrets to the repository.

Do not commit production environment files.

Provide safe `.env.example` files.

Validate and sanitize user-controlled input where necessary.

Enforce backend authorization.

Rate-limit sensitive public endpoints where appropriate.

Use secure password hashing.

Use secure session or token handling.

Do not log:

- Passwords.
- Authentication secrets.
- Private tokens.
- Sensitive security credentials.

Treat uploaded files as untrusted.

Protect administrative APIs.

Avoid exposing implementation details through production errors.

Follow the principle of least privilege.

---

# UI and Design Rules

The website and administrative dashboard should look:

- Professional.
- Modern.
- Clean.
- Trustworthy.
- Appropriate for an equipment rental and logistics company.

Avoid generic AI-looking interfaces.

Use:

- Strong visual hierarchy.
- Consistent spacing.
- Clear typography.
- Accessible contrast.
- Responsive layouts.
- Useful empty states.
- Loading skeletons.
- Error states.
- Confirmation dialogs for destructive actions.
- Toasts for important successful actions.

Use shadcn/ui components where appropriate instead of unnecessarily rebuilding common primitives.

Use Lucide icons consistently.

Do not add unnecessary animation.

Do not sacrifice usability for decoration.

The admin dashboard should make operational information easy to understand.

---

# Accessibility

Build accessible interfaces.

Use:

- Semantic HTML.
- Keyboard-accessible controls.
- Proper form labels.
- Accessible dialogs.
- Appropriate focus states.
- Sufficient contrast.
- Useful error messages.

Accessibility should be considered throughout development rather than added only at the end.

---

# Responsive Design

The customer website must work properly on:

- Desktop.
- Laptop.
- Tablet.
- Mobile browsers.

The admin dashboard should also be responsive where practical.

Complex administrative tables may use appropriate responsive patterns without sacrificing usability.

---

# Local Development Requirement

The complete web platform must be testable locally before deployment to any VPS.

The intended local development environment is approximately:

Customer Website:
http://localhost:3000

Admin Dashboard:
http://localhost:3001

Backend API:
http://localhost:4000

PostgreSQL:
localhost:5432

Redis:
localhost:6379

Actual ports may be adjusted when necessary, but they must be documented clearly.

Use Docker Compose to simplify local infrastructure where appropriate.

A developer must be able to test the system locally without requiring access to the production VPS.

---

# Local Development Documentation

Maintain beginner-friendly documentation explaining exactly how to:

- Install prerequisites.
- Install dependencies.
- Configure environment variables.
- Start Docker Desktop.
- Start local infrastructure.
- Run database migrations.
- Seed development data where appropriate.
- Start the customer website.
- Start the admin dashboard.
- Start the API.
- Run all applications together where supported.
- Stop the applications.
- Stop Docker services.
- Reset the development database safely.
- Run linting.
- Run type checking.
- Run tests.
- Run production builds.

Use exact commands.

Do not assume the developer already knows undocumented setup steps.

The primary development instructions should support Windows.

---

# Testing Requirements

The project should eventually include:

- Unit tests.
- Integration tests.
- API tests.
- Permission tests.
- Inventory tests.
- Rental availability tests.
- End-to-end tests.
- Responsive testing.
- Accessibility testing.
- Security review.

Important business rules require dedicated tests.

Tests should verify that:

- Public users cannot access confidential inventory quantities.
- Customer APIs do not return confidential inventory fields.
- Unauthorized users cannot access inventory quantities.
- Authorized users can access permitted inventory data.
- Cart actions do not reserve inventory.
- Submitting a rental request does not automatically create an unintended reservation.
- Original requested quantities remain preserved after partial approval.
- Permission rules are enforced on the backend.
- Inventory reservation logic handles overlapping rental dates correctly.

---

# Coding Standards

Write production-quality TypeScript.

Do not use `any` unless there is a strong and documented reason.

Use clear and descriptive names.

Prefer straightforward code over unnecessarily clever code.

Do not duplicate business logic.

Validate external input.

Use Zod where appropriate for shared validation.

Keep NestJS controllers thin.

Put business logic in appropriate services.

Keep database access predictable and appropriately isolated.

Avoid giant React components.

Separate:

- UI.
- State.
- Domain logic.
- API communication.

Use Next.js Server Components where they genuinely improve the application.

Use Client Components only when client-side behavior is necessary.

Do not rewrite unrelated working code.

Do not introduce unnecessary dependencies.

When adding a significant dependency, ensure there is a clear reason.

---

# Audit Logging

Important administrative and business actions should be auditable.

Potential audited actions include:

- Request approval.
- Partial approval.
- Request rejection.
- Quote creation.
- Quote modification.
- Quote sending.
- Inventory adjustment.
- Inventory reservation.
- Inventory release.
- Product deletion or archival.
- Role changes.
- Permission changes.
- User administration.

Audit records should include appropriate context such as:

- User.
- Action.
- Target entity.
- Timestamp.
- Relevant metadata.

Do not place confidential information unnecessarily into audit logs.

---

# Application Logging

Use structured application logging where appropriate.

Do not rely only on random console.log statements in production code.

Logs should help diagnose problems without exposing secrets.

Log appropriate information for:

- Application errors.
- Failed background operations.
- Important integration failures.
- Unexpected business workflow failures.

---

# Production and VPS Direction

The production environment is expected to eventually run on a VPS such as a Hostinger VPS.

The final architecture may include:

- Docker containers.
- Reverse proxy.
- HTTPS.
- Customer website.
- Admin dashboard.
- Backend API.
- PostgreSQL or an appropriate managed PostgreSQL service.
- Redis where required.
- Backups.
- Monitoring.
- Logging.

Potential production domains may include:

mensahrentals.com
admin.mensahrentals.com
api.mensahrentals.com

Potential staging domains may include:

staging.mensahrentals.com
admin-staging.mensahrentals.com
api-staging.mensahrentals.com

Do not make production deployment decisions without documenting them.

---

# Environment Strategy

The intended environment progression is:

Local Development
-> Staging
-> Production

Changes should be tested locally first.

Important changes should then be verified in staging before production deployment.

Never treat the production server as the primary development environment.

---

# Development Workflow

Before implementing a large feature:

1. Read all applicable AGENTS.md instructions.
2. Inspect the existing repository.
3. Read relevant project documentation.
4. Identify affected modules.
5. Write a concise implementation plan.
6. Identify database changes.
7. Identify API changes.
8. Identify frontend changes.
9. Identify authorization requirements.
10. Identify relevant tests.
11. Implement the smallest complete vertical slice.
12. Run formatting.
13. Run linting.
14. Run type checking.
15. Run tests.
16. Run builds where applicable.
17. Review the diff.
18. Report what changed.
19. Report unresolved issues or risks.

Do not rewrite unrelated working code.

Do not make major architecture changes without documenting the reason.

---

# Agent Delegation

The primary Codex agent acts as the Lead Engineering Agent.

Use specialized subagents for bounded and independent work where useful.

Suggested responsibilities include:

## Architecture Agent

Responsible for reviewing:

- Overall architecture.
- Application boundaries.
- Shared package boundaries.
- Cross-application technical decisions.
- Major architecture changes.

## Database Agent

Responsible for reviewing:

- PostgreSQL.
- Prisma.
- Schema design.
- Database relationships.
- Data integrity.
- Transactions.
- Inventory.
- Reservations.
- Date-based availability.

## Backend Agent

Responsible for:

- NestJS modules.
- REST APIs.
- Services.
- Business logic.
- Backend validation.
- Authorization integration.

## Frontend Agent

Responsible for:

- Customer website.
- Next.js.
- Responsive layouts.
- Public rental catalogue.
- Customer workflows.
- Accessibility.

## Admin Dashboard Agent

Responsible for:

- Administrative workflows.
- Dashboard metrics.
- Tables.
- Charts.
- Inventory interfaces.
- Request management interfaces.
- User and permission interfaces.

## Security Agent

Responsible for reviewing:

- Authentication.
- Authorization.
- API exposure.
- Secrets.
- Input validation.
- Public versus administrative data boundaries.

## QA Agent

Responsible for:

- Unit tests.
- Integration tests.
- End-to-end tests.
- Business rule tests.
- Edge cases.
- Regression review.
- Local testing instructions.

## DevOps Agent

Responsible for:

- Docker.
- Docker Compose.
- CI/CD.
- VPS deployment.
- Reverse proxy configuration.
- Staging.
- Production deployment.
- Backups.
- Monitoring.

## Mobile Agent

Responsible for the future React Native application.

Do not use the Mobile Agent to begin implementation until explicitly instructed.

---

# Agent Coordination Rules

Do not allow multiple agents to modify the same critical files simultaneously without coordination.

Prefer using specialist agents for:

- Research.
- Architecture review.
- Security review.
- Database review.
- QA review.
- Independent analysis.

Use the primary Lead Engineering Agent to:

- Combine findings.
- Make final implementation decisions.
- Coordinate file changes.
- Review integrated work.

For complex features, specialist agents may review the implementation before completion.

Do not assume code is correct merely because an agent generated it.

---

# Required Verification

Do not claim that a feature works merely because code was generated.

Verify it.

When applicable, run:

- Formatting checks.
- Linting.
- Type checking.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Production builds.

For user-facing workflows, verify the workflow end-to-end when tooling allows.

Report any tests that could not be run.

Do not claim that a test passed if it was not actually executed successfully.

---

# Documentation Requirements

Keep important project documentation inside the repository.

The project should eventually maintain documentation such as:

docs/architecture.md
docs/domain-model.md
docs/permissions.md
docs/api-visibility.md
docs/roadmap.md
docs/local-development.md
docs/testing-guide.md
docs/deployment.md

Update documentation when major architectural decisions change.

---

# Current Development Priority

Build the web platform before the mobile application.

The intended development order is:

1. Repository foundation.
2. Local development environment.
3. Architecture documentation.
4. Database foundation.
5. Authentication.
6. Role-based access control.
7. Product and category foundation.
8. Inventory foundation.
9. Customer-facing public website.
10. Rental catalogue.
11. Rental cart.
12. Rental request workflow.
13. Administrative dashboard.
14. Internal rental request review.
15. Request approval, partial approval, and rejection.
16. Quote system.
17. Confirmed rental orders.
18. Date-based inventory reservations.
19. Operational calendar.
20. Deliveries.
21. Returns.
22. Maintenance.
23. Website content management.
24. Reporting and analytics.
25. Audit logging.
26. Comprehensive testing.
27. Security hardening.
28. Local full-system verification.
29. Staging deployment.
30. Staging testing.
31. Production deployment.
32. React Native mobile application.

Do not start implementing the mobile application until explicitly instructed.

---

# Current Immediate Scope

Unless instructed otherwise, begin with the web platform foundation.

Do not attempt to build the entire platform in one task.

Use small, reviewable development phases.

The immediate priority is:

- Correct repository architecture.
- Reliable local development.
- Clear documentation.
- Working customer website foundation.
- Working admin dashboard foundation.
- Working API foundation.
- Working PostgreSQL development connection.
- Repeatable testing commands.

Business features should then be implemented one feature at a time.

---

# Important Permanent Business Rules

The following rules are mandatory throughout the entire project:

1. Customers must never see internal inventory quantities.

2. Public APIs must not expose internal inventory quantities.

3. Customers may request their desired quantity regardless of the currently available internal quantity.

4. Adding an item to a cart does not reserve inventory.

5. Submitting a rental request does not automatically reserve inventory.

6. Authorized staff review requested quantities against internal inventory.

7. Authorized staff may approve, partially approve, or reject a request.

8. The original customer-requested quantity must be preserved when staff adjust an approved quantity.

9. Customers do not receive automatic rental pricing.

10. Authorized staff prepare custom quotes.

11. Cart, Rental Request, Quote, and Confirmed Rental Order are separate domain concepts.

12. Authorization must be enforced on the backend.

13. Inventory history must be preserved through appropriate transaction or audit records.

14. The website and backend are developed before the mobile application.

15. The entire web platform must be capable of being run and tested locally before VPS deployment.
