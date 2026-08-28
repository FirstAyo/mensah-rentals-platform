import type { PublicLegalPageContent } from '@mensah-rentals/validation';

export function LegalDocument({
  content,
  sectionSupplement,
}: {
  content: PublicLegalPageContent;
  sectionSupplement?: (id: string) => React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-[1460px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-8 lg:py-20">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <details className="rounded-2xl border border-border bg-card p-4 lg:hidden">
          <summary className="cursor-pointer font-semibold">
            Jump to section
          </summary>
          <TableOfContents sections={content.sections} />
        </details>
        <nav
          aria-label="On this page"
          className="hidden rounded-2xl border border-border bg-card p-5 lg:block"
        >
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            On this page
          </p>
          <TableOfContents sections={content.sections} />
        </nav>
      </aside>
      <article className="min-w-0 rounded-[1.75rem] border border-border bg-card px-5 py-8 shadow-sm sm:px-9 lg:px-12 lg:py-12">
        {content.notice ? (
          <div className="mb-10 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
              Important
            </p>
            <p className="mt-2 leading-7 text-muted-foreground">
              {content.notice}
            </p>
          </div>
        ) : null}
        <div className="space-y-12">
          {content.sections.map((section, index) => (
            <section
              className="scroll-mt-28 border-b border-border pb-11 last:border-0 last:pb-0"
              id={section.id}
              key={section.id}
            >
              <p className="text-sm font-bold text-foreground">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                {section.title}
              </h2>
              <SafeRichText value={section.body} />
              {sectionSupplement?.(section.id)}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}

function TableOfContents({
  sections,
}: {
  sections: PublicLegalPageContent['sections'];
}) {
  return (
    <ol className="mt-4 space-y-1.5 text-sm">
      {sections.map((section, index) => (
        <li key={section.id}>
          <a
            className="block rounded-lg px-2 py-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            href={`#${section.id}`}
          >
            {index + 1}. {section.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

function SafeRichText({ value }: { value: string }) {
  const blocks = value.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="mt-5 space-y-4 text-[1.02rem] leading-8 text-muted-foreground">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^[-*] /.test(line)))
          return (
            <ul className="list-disc space-y-2 pl-5" key={index}>
              {lines.map((line) => (
                <li key={line}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        if (lines.every((line) => /^\d+\. /.test(line)))
          return (
            <ol className="list-decimal space-y-2 pl-5" key={index}>
              {lines.map((line) => (
                <li key={line}>{line.replace(/^\d+\. /, '')}</li>
              ))}
            </ol>
          );
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}
