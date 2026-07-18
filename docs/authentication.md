# Staff authentication

Authentication is for internal staff only. Phase 3 layers staff roles and
permissions onto it, but does not implement customer accounts or business
features. Guest customer rental requests remain an explicit future requirement.

## Architecture

The admin application uses a same-origin backend-for-frontend (BFF) boundary:

1. The browser posts JSON to `http://localhost:3001/api/auth/login`.
2. The fixed Next.js route forwards the request to the NestJS
   `POST /auth/login` endpoint.
3. NestJS validates the credentials and creates a database-backed session.
4. The BFF relays the API's `Set-Cookie` header to the browser.
5. Protected Next.js Server Components forward that cookie to `GET /auth/me`
   and render only after the API validates the session.

The session token is never placed in a URL, response body, JavaScript-readable
storage, or `localStorage`. The API remains the source of authentication truth.
The customer website has no authentication code and no dependency on staff
identity assumptions.

## Passwords

Passwords are hashed with Argon2id using explicit memory, time, parallelism,
hash-length settings, and a random salt supplied by the maintained `argon2`
library. Plaintext passwords exist only long enough to validate or hash an
incoming value. They are never stored, returned, or logged.

Unknown-email and wrong-password attempts both perform Argon2 work and return
the same `401 Invalid email or password` response. Disabled users receive the
same response, so the API does not disclose whether an account exists or is
disabled. Password inputs are limited to 128 characters.

## Sessions and cookies

Successful login creates a cryptographically random 256-bit token. Only its
SHA-256 hash is stored in `StaffSession`; the raw value is stored in an
HTTP-only browser cookie. Every protected request checks that the session
exists, has not expired, and belongs to an `ACTIVE` staff user.

Default lifetime is 12 hours and is controlled by
`STAFF_SESSION_TTL_HOURS`. Logout deletes the matching database session and
clears the cookie. Logout is idempotent: stale or missing sessions can still be
cleared. If the API is unavailable during logout, the admin BFF still clears
the local cookie; the server-side session then remains usable only until its
expiry if its raw token were independently retained.

Cookie attributes are:

- `HttpOnly`: always.
- `Path=/`: always.
- `SameSite=Lax`: always.
- `Secure=false`: local HTTP development only.
- `Secure=true`: required by configuration validation in production.
- No `Domain` attribute: the cookie is host-only and is not shared broadly
  across subdomains.

Development uses `mensah_staff_session`. Production must use a `__Host-`
prefixed name, such as `__Host-mensah_staff_session`, together with HTTPS,
`Secure=true`, `Path=/`, and no `Domain`. With the BFF deployed on
`admin.mensahrentals.com`, the browser cookie stays on the admin host; the BFF
communicates server-to-server with `api.mensahrentals.com`.

## CSRF, origins, and CORS

SameSite is defense in depth, not the only CSRF control. The admin BFF and API
require the exact configured `ADMIN_ORIGIN` for authentication and protected
administrative state-changing requests. Auth POST requests must be JSON.
Foreign or missing origins are rejected. Explicitly public endpoints are not
mistaken for admin endpoints; future guest rental submissions can apply their
own public-origin and abuse controls. The BFF accepts only fixed auth paths,
overwrites the upstream Origin header, and does not act as a general-purpose
proxy.

Local API CORS permits credentials only from the exact admin origin
`http://localhost:3001`; it is not a wildcard and does not grant the customer
website credentialed staff-auth access. Browser code normally uses the
same-origin BFF, which also avoids tying the browser to API cookie-domain
details. Production must set `ADMIN_ORIGIN=https://admin.mensahrentals.com`
and `API_INTERNAL_URL=https://api.mensahrentals.com` (or a private service URL).

## API behavior

- `POST /auth/login`: public, origin-checked, JSON-only, validation and
  rate-limit protected; returns a safe user and sets the cookie.
- `POST /auth/logout`: public so stale cookies can be cleared, but
  origin-checked and JSON-only; invalidates the session and returns `204`.
- `GET /auth/me`: authenticated; returns a safe user or `401`.

All API routes are authenticated by default unless explicitly marked public.
The health endpoints and login/logout are explicit exceptions. This guard
establishes identity only; permission enforcement belongs to the future RBAC
phase.

Safe user responses contain `id`, `email`, `firstName`, `lastName`, `status`,
`lastLoginAt`, `createdAt`, and `updatedAt`. They never contain `passwordHash`,
the raw session token, or `tokenHash`.

## Brute-force protection

Login has an in-process request tracker controlled by
`AUTH_LOGIN_RATE_LIMIT` and `AUTH_LOGIN_RATE_WINDOW_SECONDS` (defaults: five
attempts per 60 seconds). Behind the BFF, requests may share the BFF's upstream
network identity, so this is a conservative process-local safeguard rather
than a complete per-user/per-client production control. Before staging or
production exposure, configure trusted-proxy handling deliberately and add
reverse-proxy per-client limits. Before horizontal scaling, add a bounded
shared limiter store. Redis remains deferred until that concrete distributed
use case exists.

Authentication logs contain event names and, only after successful login, the
staff user ID. They do not contain emails, passwords, cookie values, or session
hashes. A future security phase should add retention, monitoring, alerting, and
auditable administrative account lifecycle events.

## Disabled accounts

`User.status` is either `ACTIVE` or `DISABLED`, defaulting to `DISABLED`.
Disabled users cannot log in. Existing sessions also fail immediately because
status is checked on every session validation. Session rows are retained until
logout or cleanup; a future scheduled cleanup should delete expired sessions.

## Create the first local staff user

This command is development-only and refuses any other `NODE_ENV`. In the
ignored root `.env`, set:

```dotenv
STAFF_BOOTSTRAP_EMAIL=your-local-staff-email@example.test
STAFF_BOOTSTRAP_PASSWORD=choose-a-unique-local-password-of-at-least-12-characters
STAFF_BOOTSTRAP_FIRST_NAME=Your
STAFF_BOOTSTRAP_LAST_NAME=Name
```

Then run:

```powershell
pnpm db:migrate
pnpm staff:bootstrap
```

The script normalizes the email and creates one `ACTIVE` staff user. Repeating
it does not duplicate, overwrite, reactivate, or change an existing account.
Never put real production credentials in `.env.example` or source control.

## RBAC integration

Phase 3 now implements this integration. Session validation loads the active user with current roles and permissions on each request. `/auth/me` safely includes role summaries and effective permission keys, but never password hashes, session IDs, token hashes, or raw tokens. The permission guard runs after authentication, returning 401 for no valid session and 403 for an authenticated principal lacking a required permission.

RBAC mutation services re-check the actor inside their database transaction, so an authorization change between initial session validation and mutation cannot authorize stale privilege. No permission cache is used.

The `User` identity relates to implemented `Role`, `Permission`, `UserRole`, and
`RolePermission` models. The authentication guard establishes current identity;
the authorization guard checks named permissions at protected backend actions.
No customer identity has been added.
