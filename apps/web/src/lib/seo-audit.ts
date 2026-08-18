import { PRODUCTION_SITE_ORIGIN } from './site-config';

export type SeoAuditEntry = {
  canonical: string;
  description: string;
  title: string;
};

const unsafeSeoText =
  /(?:localhost(?::\d+)?|127\.0\.0\.1|availableQuantity|reservedQuantity|inventoryId|capability|sessionToken|passwordHash)/i;

export function auditSeoEntries(entries: readonly SeoAuditEntry[]): string[] {
  const issues: string[] = [];
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const canonicals = new Set<string>();

  for (const entry of entries) {
    const title = entry.title.trim();
    const description = entry.description.trim();
    let canonical: URL | undefined;
    try {
      canonical = new URL(entry.canonical);
    } catch {
      issues.push(`Malformed canonical: ${entry.canonical}`);
    }
    if (!title) issues.push(`Missing title: ${entry.canonical}`);
    if (!description) issues.push(`Missing description: ${entry.canonical}`);
    if (canonical) {
      if (canonical.origin !== PRODUCTION_SITE_ORIGIN)
        issues.push(`Non-production canonical: ${entry.canonical}`);
      if (canonical.search || canonical.hash)
        issues.push(
          `Canonical contains a query or fragment: ${entry.canonical}`,
        );
      if (canonicals.has(canonical.href))
        issues.push(`Duplicate canonical: ${canonical.href}`);
      canonicals.add(canonical.href);
    }
    if (unsafeSeoText.test(`${title} ${description} ${entry.canonical}`))
      issues.push(`Unsafe SEO-visible value: ${entry.canonical}`);

    const normalizedTitle = title.toLocaleLowerCase('en-CA');
    const normalizedDescription = description.toLocaleLowerCase('en-CA');
    const previousTitle = titles.get(normalizedTitle);
    if (normalizedTitle && previousTitle)
      issues.push(`Duplicate title: ${previousTitle} and ${entry.canonical}`);
    else if (normalizedTitle) titles.set(normalizedTitle, entry.canonical);
    const previousDescription = descriptions.get(normalizedDescription);
    if (normalizedDescription && previousDescription)
      issues.push(
        `Duplicate description: ${previousDescription} and ${entry.canonical}`,
      );
    else if (normalizedDescription)
      descriptions.set(normalizedDescription, entry.canonical);
  }
  return issues;
}
