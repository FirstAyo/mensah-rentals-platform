# Official customer Order and Return forms

Phase 18.1 uses the supplied `MRS Order Form.pdf` and `MRS Return Form.pdf` as the authoritative visual and legal references. The controlled renderer version is `2026-08-mrs-v1`. It produces selectable-text A4 business forms locally in the NestJS API without a browser, remote renderer, or paid service.

## Absolute no-price policy

The customer Order and Return form renderer accepts only customer-safe identity, event, date, reference, and equipment fields. Its input type has no price, currency, tax, discount, deposit, charge, assessed-damage, or total fields. The forms contain no price columns or financial summary. Internal quotes, order commercial snapshots, staff screens, and reporting remain unchanged.

The exact eight official Terms and Conditions and the following acknowledgement remain controlled shared source constants in `packages/types/src/official-customer-form-terms.ts`. Both the official PDF renderer and public Terms page import that one source so they cannot silently drift. References to charges inside that authoritative legal copy are retained; no customer-specific monetary value is present.

## Field mapping

| Form field                  | Authoritative source                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| QUOTE #                     | Immutable order relation's human-readable quote number                                        |
| DATE on Order Form          | `OrderFulfilment.firstCheckedOutAt`, established by the first successful checkout/handoff     |
| DATE on Return Form         | `RentalReturn.completedAt`, set by final return completion                                    |
| CUSTOMER ID                 | Rental request reference number; raw database IDs are never used                              |
| DUE DATE                    | Immutable order rental end date                                                               |
| Customer                    | Immutable order contact/company snapshots                                                     |
| Show/Event                  | Immutable order project-name snapshot                                                         |
| PO#                         | Blank because the current domain has no authoritative PO field                                |
| Location                    | Immutable order project-location snapshot                                                     |
| Rental Period Start/End     | Immutable order rental dates                                                                  |
| Order description/quantity  | Immutable `RentalOrderItem` product-name snapshot and accepted quoted quantity                |
| Return description/quantity | Immutable order description joined to the final aggregate `RentalReturnItem.receivedQuantity` |
| Duration                    | Inclusive calendar days: end minus start plus one, minimum one day                            |

Signatures and signature dates remain blank because the platform does not collect an authoritative customer signature. The prominent operational DATE is separate.

## Lifecycle and access

- A final Order Form is unavailable until the first confirmed checkout. Later partial checkouts cannot change `firstCheckedOutAt`.
- A final Return Form is unavailable during partial intake, inspection, reconciliation, or unresolved return work. It becomes available only when the return is `COMPLETED` and has `completedAt`.
- Staff Order Form access requires `order.view`; staff Return Form access requires both `return.view` and `return.pdf`.
- Customer downloads use the existing opaque order capability. The same capability can access the completed Return Form; no public return-ID route exists.
- Order capabilities retain their configured expiry (90 days by default). If a long-running rental finishes after expiry, staff must issue a fresh order access link through the existing rotate/resend workflow before the customer can download the Return Form.
- Invalid, expired, revoked, missing, or ineligible capability requests receive the uniform unavailable response.
- API and BFF responses are private/no-store, noindex, nosniff, and use attachment filenames based on the customer-safe order number.

## Historical accuracy and aggregation

Catalogue changes do not affect old forms because product descriptions and quantities come from confirmed-order snapshots. Final return quantities use the aggregate return-item totals maintained transactionally by idempotent return operations. Missing quantities, serial/asset numbers, inventory states, issue details, notes, staff identities, operation IDs, and capability material are excluded.

## Layout and overflow

Normal forms retain the one-page official structure: company header, large ORDER/RETURN heading, dark label bars, customer/rental fields, ruled DESCRIPTION/QTY/DURATION table, exact legal copy, blank signature line, and official contact footer. Long item lists continue across numbered equipment pages and the legal/signature/footer block is retained on the final page. Text remains selectable and printable in grayscale.

No approved standalone logo asset currently exists in the repository. The renderer therefore uses a local typographic `M.` mark based on the supplied form, without external URLs or extracted low-quality images.

## Timezone note

Operational timestamps are stored in UTC. Official-form checkout and completion timestamps are displayed in `America/Vancouver`, matching the Richmond, British Columbia company address. Existing reporting configuration uses `Africa/Accra`; Phase 18.1 does not alter that global configuration. The business should confirm its canonical operating timezone before a separate configuration-alignment change.

## Verification

```powershell
pnpm test
pnpm test:e2e:official-pdfs
pnpm test:e2e:returns
pnpm test:e2e:admin-fulfilment
```

Representative PDFs are generated only into an ignored temporary review directory and rendered to images with Poppler; generated PDFs/screenshots are not repository fixtures.
