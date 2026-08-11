# Admin notifications

Phase 18.3.1 adds one reusable notification layer at the Admin application provider boundary. It observes same-origin, state-changing Admin BFF requests (`POST`, `PUT`, `PATCH`, and `DELETE`) and never observes public/customer traffic. Successful mutations show a concise success notification and invalidate active TanStack Query data so screens reload authoritative server state. API failures prefer the bounded server message and otherwise use a safe domain-specific fallback. Network failures clearly ask staff to check their connection and retry.

The system covers the existing mutation styles used by Inventory, Products/Categories, Rental Requests, Quotes, Orders/Reservations/Fulfilment, Returns, Maintenance, Homepage CMS, Issues, and staff/RBAC routes without duplicating toast state across each feature. Existing local pending-state and idempotency protections remain responsible for double-submit safety.

Notifications:

- appear in a fixed top-right stack (full-width with safe margins on small screens);
- use semantic light/dark theme tokens;
- expose success as `role=status` and failure as `role=alert`;
- remain for approximately 4.25 seconds, then fade and are removed;
- support a labelled manual dismiss button;
- honor reduced-motion preferences;
- stack up to five visible messages without blocking the page.

Inventory success messages are exact:

- `Inventory updated successfully`
- `Stock added successfully`
- `Inventory reduced successfully`
- `Serialized asset added successfully`
- `Inventory archived successfully`
- `Inventory restored successfully`
- `Inventory deleted successfully`

Run focused verification only against the guarded test database:

```powershell
docker compose up -d postgres-test
pnpm test:e2e:admin-notifications
```

The unit suite verifies exact endpoint-to-message mapping across representative mutation architectures. The browser suite verifies success/error announcements, stacking-compatible roles, mobile containment, dark mode, and serious/critical Axe results in the real Admin UI.
