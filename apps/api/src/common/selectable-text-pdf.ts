const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 54;
const TOP = 738;
const BOTTOM = 54;
const FONT_SIZE = 10;
const LEADING = 14;

export interface SelectableTextPdfInput {
  lines: string[];
  title: string;
}

function pdfText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([\\()])/g, '\\$1');
}

function wrap(value: string, maximum = 88) {
  if (!value) return [''];
  const result: string[] = [];
  let current = '';
  for (const word of value.split(/\s+/)) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maximum)
      current = `${current} ${word}`;
    else {
      result.push(current);
      current = word;
    }
  }
  while (current.length > maximum) {
    result.push(current.slice(0, maximum));
    current = current.slice(maximum);
  }
  result.push(current);
  return result;
}

/** Builds a dependency-free, selectable-text PDF using a standard PDF font. */
export function buildSelectableTextPdf(input: SelectableTextPdfInput): Buffer {
  const lines = [input.title, '', ...input.lines].flatMap((line) => wrap(line));
  const linesPerPage = Math.floor((TOP - BOTTOM) / LEADING) + 1;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage)
    pages.push(lines.slice(index, index + linesPerPage));
  if (pages.length === 0) pages.push([]);

  const objects: string[] = [];
  const add = (value: string) => {
    objects.push(value);
    return objects.length;
  };
  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  for (const pageLines of pages) {
    const commands = [
      'BT',
      `/F1 ${FONT_SIZE} Tf`,
      `${LEADING} TL`,
      `${LEFT} ${TOP} Td`,
      ...pageLines.flatMap((line, index) => [
        ...(index > 0 ? ['T*'] : []),
        `(${pdfText(line)}) Tj`,
      ]),
      'ET',
    ].join('\n');
    const contentId = add(
      `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`,
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let output = '%PDF-1.4\n%MensahRentals\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}

export function safePdfFilename(...parts: string[]) {
  const stem = parts
    .join('-')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  return `${stem || 'document'}.pdf`;
}
