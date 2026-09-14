# Theme Foundation

## Phase 19.2 company-experience surfaces

Services, Gallery cards/detail/lightbox, the Homepage Gallery carousel, Rentals mega menu/mobile accordion, Cart enquiry form, and Admin Gallery/enquiry screens use the same semantic light/dark tokens. Focus indicators, overlays, status labels, controls, and error/success states must remain readable in both modes. Motion uses transforms/opacity and respects `prefers-reduced-motion`; the carousel does not autoplay for reduced-motion users.

Phase 19.2.1 standardizes customer-facing content on the shared `public-container`: a centered 1440 px maximum with responsive 16/24/32 px gutters. Hero photography and intentional section color bands remain full bleed while their text, navigation, grids, and cards stay constrained. The desktop Rentals menu uses an opaque semantic background and elevated card surface in both themes. Pointer intent waits 140 ms before opening and 240 ms before closing; canceled intent never flashes the menu. Its 200 ms entrance and 150 ms exit retain the panel until animation completion, while reduced-motion users receive opacity-only movement. Mobile continues to use the independent touch-friendly accordion.

The Homepage Services-to-Featured-Categories transition uses 56 px bottom plus 40 px top padding at desktop (96 px total), replacing the accidental 96 px plus 96 px combination. At smaller widths it uses 48 px plus 32 px (80 px total). No empty CMS block or hidden layout element occupies that transition.

Phase 16.4 homepage and CMS components use the existing semantic tokens and system-first persisted theme provider. Hero overlays provide stable contrast in both modes; the guarded browser suite checks 320px layout, dark persistence, and serious/critical Axe findings.

The customer website, admin dashboard, and staff login use a shared `ThemeProvider` and accessible `ThemeToggle` from `packages/ui`. `next-themes` applies a class to the document, follows the operating-system theme on first visit, and stores a manual light/dark choice in browser storage for future visits on that application origin.

Theme preference is intentionally per application origin. Production customer and admin subdomains do not share authentication or preference storage. Both apps use matching semantic CSS variables (`background`, `foreground`, `card`, `muted`, `border`, `primary`, and `ring`) with Tailwind mappings. The document suppresses the expected hydration attribute difference, and the provider initializes the theme before interactive content to minimize flashing.

Test navigation, cards, tables, forms, status badges, loading/error/empty states, focus rings, and login in system-light, system-dark, manually selected light, and manually selected dark modes. Future Recharts configuration must read the same semantic variables instead of fixed light-only colors.

Phase 6 adds `primary-foreground`, `secondary`, and `accent` semantic pairs to the public application so bright dark-theme surfaces do not assume white text. The public Playwright suite verifies manual dark selection persists after reload; its axe scan and manual system-theme checks cover the catalogue at responsive widths.
