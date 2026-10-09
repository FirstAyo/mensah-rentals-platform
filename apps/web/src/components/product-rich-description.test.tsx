import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProductRichDescription } from './product-rich-description';

describe('ProductRichDescription', () => {
  it('renders supported semantic content without raw HTML or an extra H1', () => {
    const html = renderToStaticMarkup(
      <ProductRichDescription
        document={{
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Equipment details' }],
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Strong', marks: [{ type: 'bold' }] },
                { type: 'text', text: ' and useful.' },
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
                      content: [{ type: 'text', text: 'First feature' }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
        fallback="Unused fallback"
      />,
    );

    expect(html).toContain('<h2><span>Equipment details</span></h2>');
    expect(html).toContain('<strong>Strong</strong>');
    expect(html).toContain('<ul>');
    expect(html).not.toContain('<h1>');
    expect(html).not.toContain('Unused fallback');
  });

  it('retains the existing plain description fallback', () => {
    const html = renderToStaticMarkup(
      <ProductRichDescription document={null} fallback="Existing details" />,
    );
    expect(html).toContain('<p>Existing details</p>');
  });
});
