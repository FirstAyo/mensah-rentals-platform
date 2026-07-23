# Theme Foundation

The customer website, admin dashboard, and staff login use a shared `ThemeProvider` and accessible `ThemeToggle` from `packages/ui`. `next-themes` applies a class to the document, follows the operating-system theme on first visit, and stores a manual light/dark choice in browser storage for future visits on that application origin.

Theme preference is intentionally per application origin. Production customer and admin subdomains do not share authentication or preference storage. Both apps use matching semantic CSS variables (`background`, `foreground`, `card`, `muted`, `border`, `primary`, and `ring`) with Tailwind mappings. The document suppresses the expected hydration attribute difference, and the provider initializes the theme before interactive content to minimize flashing.

Test navigation, cards, tables, forms, status badges, loading/error/empty states, focus rings, and login in system-light, system-dark, manually selected light, and manually selected dark modes. Future Recharts configuration must read the same semantic variables instead of fixed light-only colors.

Phase 6 adds `primary-foreground`, `secondary`, and `accent` semantic pairs to the public application so bright dark-theme surfaces do not assume white text. The public Playwright suite verifies manual dark selection persists after reload; its axe scan and manual system-theme checks cover the catalogue at responsive widths.
