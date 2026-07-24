# Rental Cart Foundation

## Phase 7 boundary

Phase 7 implements a persistent anonymous customer rental cart. A guest can add
an active catalogue product, set an absolute desired quantity, update it,
remove a line, clear the cart, continue browsing, and recover the cart after a
reload. Customer authentication is not required.

The cart is not a rental request, quote, order, reservation, or availability
calculation. It contains no prices, customer details, project details, rental
dates, approved quantities, inventory quantities, or reservation records.
Rental dates and request submission belong to Phase 8, when the complete
rental-request contract is designed.

## Data model

`Cart` stores an internal ID, a unique SHA-256 token hash, an absolute expiry,
and timestamps. `CartItem` uses `(cartId, productId)` as its composite primary
key and stores only the customer's `desiredQuantity` plus timestamps. The
database and Zod both enforce a technical range of 1 through 1000. This range
limits abusive input; it says nothing about inventory availability.

`CartItem` relates to `Product`, not `Inventory`. There is no cart relation to
staff `User`, `Customer`, `RentalRequest`, `Reservation`, `Quote`, or
`RentalOrder`. Future optional customer accounts must preserve first-class
guest carts rather than making accounts mandatory.

## Guest capability and cookie

The API generates a 256-bit opaque token on the first mutation. Only its
SHA-256 hash is stored in PostgreSQL. The raw token is transferred between the
API and server-side web BFF through a private response header; it is never
placed in JSON, a URL, localStorage, logs, or browser JavaScript.

The web application stores the token in a separate host-only, HttpOnly,
SameSite=Lax cookie. Local HTTP development uses `mensah_rental_cart` without
`Secure`. Production requires HTTPS, `Secure`, and a `__Host-` cookie name with
no Domain attribute. The default expiry is 30 days and is extended only by
successful mutations. Unknown or expired capabilities return an empty cart and
are cleared by the BFF.

## Request flow

Browser code calls only fixed same-origin `/api/cart` BFF handlers. The BFF:

- accepts only the documented cart paths and methods;
- requires the exact `WEB_ORIGIN` and JSON for mutations;
- forwards only the named cart capability, never arbitrary cookies;
- sends requests to fixed `/public/cart` API paths;
- strips private upstream token headers from browser responses;
- marks responses `private, no-store`.

The API repeats exact web-Origin and JSON checks. Cart endpoints are public in
the sense that staff authentication is not required; possession of the random
capability authorizes access only to that temporary guest cart.

## API routes

- `GET /public/cart`
- `PUT /public/cart/items/:productSlug` with `{ "desiredQuantity": 1 }`
- `DELETE /public/cart/items/:productSlug`
- `DELETE /public/cart`

`PUT` is an idempotent absolute quantity operation, so retrying the same
request cannot accidentally increment a line twice. A cart is created lazily
on the first successful `PUT`. New lines require an active product in an active
category. A product deactivated after selection remains visible as **No longer
listed**, preserving customer intent without implying an inventory shortage.

## Public response boundary

Cart responses contain only customer-safe product/category descriptions, one
managed image, the customer's desired line quantity, a non-inventory
`requestable` catalogue state, and aggregate counts of customer intent.
Runtime allowlists reject unknown fields and explicit inventory, availability,
stock, reservation, price, asset, serial, authentication, staff, and RBAC
aliases. `desiredQuantity` is customer input and is intentionally distinct from
every internal inventory quantity.

## Non-reservation proof

PostgreSQL integration tests create internal inventory with capacity 2, then
successfully place desired quantity 100 in a guest cart. The tests compare the
inventory record and inventory item/transaction counts before and after. No
inventory data changes and the cart response exposes none of it. The cart
module does not import the inventory service or select an inventory relation.

## Operational follow-ups

Expired rows are rejected immediately even before cleanup. A bounded scheduled
cleanup task can be added when operations scheduling is introduced. Before a
public production launch, mutation rate limiting should be enforced at a
trusted reverse proxy and, if the API is horizontally scaled, use a shared
limiter store. Redis remains unjustified for the current single-process local
foundation.
