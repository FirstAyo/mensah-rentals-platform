import { describe, expect, it } from 'vitest';
import {
  categoryPresentationSchema,
  productDescriptionDocumentSchema,
} from './index';

describe('product description documents', () => {
  it('accepts the supported semantic document', () => {
    expect(
      productDescriptionDocumentSchema.parse({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Details' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Read more',
                marks: [
                  { type: 'bold' },
                  { type: 'link', attrs: { href: 'https://example.com' } },
                ],
              },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'One' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBeTruthy();
  });

  it.each(['javascript:alert(1)', 'data:text/html,bad'])(
    'rejects unsafe link %s',
    (href) => {
      expect(() =>
        productDescriptionDocumentSchema.parse({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Bad',
                  marks: [{ type: 'link', attrs: { href } }],
                },
              ],
            },
          ],
        }),
      ).toThrow();
    },
  );

  it('rejects H1, raw HTML nodes, and inline style attributes', () => {
    for (const document of [
      {
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 1 }, content: [] }],
      },
      { type: 'doc', content: [{ type: 'html', text: '<script />' }] },
      {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { style: 'color:red' }, content: [] },
        ],
      },
    ])
      expect(() => productDescriptionDocumentSchema.parse(document)).toThrow();
  });
});

describe('category presentation', () => {
  it('enforces four visuals and alt/decorative semantics', () => {
    const item = {
      mediaRef: 'media-1',
      altText: 'Tent installation',
      focalPoint: 'center',
      isDecorative: false,
    };
    expect(
      categoryPresentationSchema.parse({ items: [item] }).items,
    ).toHaveLength(1);
    expect(() =>
      categoryPresentationSchema.parse({
        items: Array.from({ length: 5 }, () => item),
      }),
    ).toThrow();
    expect(() =>
      categoryPresentationSchema.parse({ items: [{ ...item, altText: '' }] }),
    ).toThrow();
    expect(
      categoryPresentationSchema.parse({
        items: [{ ...item, altText: '', isDecorative: true }],
      }),
    ).toBeTruthy();
  });
});
