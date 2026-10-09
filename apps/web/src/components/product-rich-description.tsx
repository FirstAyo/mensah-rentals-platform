import type {
  ProductDescriptionDocument,
  ProductDescriptionMark,
} from '@mensah-rentals/types';
import type { ReactNode } from 'react';

function safeHref(href: string): string | null {
  if (href.startsWith('/') || href.startsWith('#')) return href;
  try {
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(
      new URL(href).protocol,
    )
      ? href
      : null;
  } catch {
    return null;
  }
}

function marks(value: ReactNode, list: ProductDescriptionMark[] = []) {
  return list.reduce<ReactNode>((content, mark, index) => {
    if (mark.type === 'bold') return <strong key={index}>{content}</strong>;
    if (mark.type === 'italic') return <em key={index}>{content}</em>;
    const href = safeHref(mark.attrs.href);
    return href ? (
      <a
        className="font-medium text-primary underline underline-offset-4"
        href={href}
        key={index}
        rel="noopener noreferrer"
        target={mark.attrs.target ?? undefined}
      >
        {content}
      </a>
    ) : (
      content
    );
  }, value);
}

function node(value: ProductDescriptionDocument, key: number): ReactNode {
  const children = value.content?.map((child, index) => node(child, index));
  if (value.type === 'text')
    return <span key={key}>{marks(value.text ?? '', value.marks)}</span>;
  if (value.type === 'hardBreak') return <br key={key} />;
  if (value.type === 'paragraph') return <p key={key}>{children}</p>;
  if (value.type === 'heading' && value.attrs?.level === 2)
    return <h2 key={key}>{children}</h2>;
  if (value.type === 'heading' && value.attrs?.level === 3)
    return <h3 key={key}>{children}</h3>;
  if (value.type === 'bulletList') return <ul key={key}>{children}</ul>;
  if (value.type === 'orderedList') return <ol key={key}>{children}</ol>;
  if (value.type === 'listItem') return <li key={key}>{children}</li>;
  if (value.type === 'blockquote')
    return <blockquote key={key}>{children}</blockquote>;
  if (value.type === 'doc') return <>{children}</>;
  return null;
}

export function ProductRichDescription({
  document,
  fallback,
}: {
  document: ProductDescriptionDocument | null;
  fallback: string;
}) {
  return (
    <div className="prose prose-slate mt-6 max-w-[72ch] leading-8 dark:prose-invert prose-headings:tracking-tight prose-a:text-primary">
      {document ? node(document, 0) : <p>{fallback}</p>}
    </div>
  );
}
