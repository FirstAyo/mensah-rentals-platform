import Link from 'next/link';

import { requireStaffPermission } from '@/lib/auth-server';

const pages = [
  {
    key: 'about',
    title: 'About',
    description:
      'Company story, audiences, benefits, process, imagery, and calls to action.',
  },
  {
    key: 'contact',
    title: 'Contact',
    description:
      'Contact introduction, support content, imagery, FAQs, and rental guidance.',
  },
  {
    key: 'terms',
    title: 'Terms',
    description:
      'Website terms and presentation around the controlled official customer-form terms.',
  },
  {
    key: 'privacy',
    title: 'Privacy',
    description:
      'Privacy-policy sections, notice, metadata, and publication date.',
  },
] as const;

export default async function PublicPagesPage() {
  await requireStaffPermission('public_pages.view');
  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <header className="mb-8">
        <p className="text-sm font-medium text-primary">Website content</p>
        <h1 className="text-3xl font-bold tracking-tight">Public pages</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Edit structured page content, reuse managed images, preview drafts,
          and publish immutable revisions.
        </p>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        {pages.map((page) => (
          <Link
            className="rounded-2xl border border-border bg-card p-6 transition hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none"
            href={`/website/public-pages/${page.key}`}
            key={page.key}
          >
            <h2 className="text-2xl font-semibold">{page.title}</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              {page.description}
            </p>
            <span className="mt-6 inline-block text-sm font-semibold text-primary">
              Manage page →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
