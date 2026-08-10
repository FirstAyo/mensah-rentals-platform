const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 42;
const RIGHT = 553;
const DARK = 0.27;

export const OFFICIAL_CUSTOMER_FORM_TEMPLATE_VERSION = '2026-08-mrs-v1';

export const OFFICIAL_CUSTOMER_FORM_TERMS = [
  '1. Charges: Total charges are estimates based on the rental period and customer-provided information.',
  '2. Risk of Loss: Customer assumes all risks associated with equipment rented during the rental period, including injury, loss or damage to persons, property, and the equipment.',
  '3. Authorized Use: Only properly trained individuals are permitted to use the equipment.',
  '4. Equipment Issues: If the equipment malfunctions, is unsuitable, lacks instructions, or if there are any questions, the customer must immediately cease use and contact Mensah Rental & Services.',
  '5. Equipment Condition: Equipment must be returned as received, reasonable wear and tear excepted. A cleaning fee applies if returned significantly dirty.',
  '6. Misuse and Indemnification: Misuse of equipment or use of damaged/malfunctioning equipment is prohibited and may cause serious injury or death. The customer assumes all associated risks and will indemnify Mensah Rental & Services against all claims and damages resulting from such misuse or use.',
  '7. Acceptance of Terms: By taking possession of the equipment, the customer acknowledges they have read, understood, and agreed to all estimated charges and these terms and conditions.',
  '8. Equipment Return: The customer must contact Mensah Rental & Services to arrange equipment pickup, obtain a Pick-Up confirmation, and remain responsible for the equipment until it is retrieved by Mensah Rental & Services.',
] as const;

export const OFFICIAL_CUSTOMER_FORM_ACKNOWLEDGEMENT =
  'The customer acknowledges that this rental is subject to the terms and conditions and understands that in particular that the equipment is NOT covered by insurance. Additional charges apply for late returns. All loss or damage is payable upon return.';

export interface OfficialCustomerFormItem {
  description: string;
  duration: string;
  quantity: number;
}

export interface OfficialCustomerFormInput {
  customerId: string;
  customerName: string;
  documentDate: string;
  documentNumber: string;
  dueDate: string;
  eventName: string;
  items: OfficialCustomerFormItem[];
  kind: 'ORDER' | 'RETURN';
  location: string;
  poNumber: string;
  quoteNumber: string;
  rentalEndDate: string;
  rentalStartDate: string;
}

interface PageBuilder {
  commands: string[];
}

function escaped(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([\\()])/g, '\\$1');
}

function clampText(value: string) {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrap(value: string, maximum: number) {
  const words = clampText(value).split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const sourceWord of words) {
    let word = sourceWord;
    while (word.length > maximum) {
      const head = word.slice(0, maximum);
      word = word.slice(maximum);
      if (current) lines.push(current);
      lines.push(head);
      current = '';
    }
    if (!word) continue;
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maximum)
      current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function text(
  page: PageBuilder,
  value: string,
  x: number,
  y: number,
  size = 9,
  bold = false,
) {
  page.commands.push(
    `BT /${bold ? 'F2' : 'F1'} ${size} Tf 0 g ${x} ${y} Td (${escaped(value)}) Tj ET`,
  );
}

function line(
  page: PageBuilder,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width = 0.5,
) {
  page.commands.push(`${width} w 0 G ${x1} ${y1} m ${x2} ${y2} l S`);
}

function rect(
  page: PageBuilder,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = false,
) {
  page.commands.push(
    fill
      ? `${DARK} g ${x} ${y} ${width} ${height} re f`
      : `0.5 w 0 G ${x} ${y} ${width} ${height} re S`,
  );
}

function whiteText(
  page: PageBuilder,
  value: string,
  x: number,
  y: number,
  size = 8,
) {
  page.commands.push(
    `BT /F2 ${size} Tf 1 g ${x} ${y} Td (${escaped(value)}) Tj ET`,
  );
}

function header(page: PageBuilder, input: OfficialCustomerFormInput) {
  text(page, 'M.', LEFT, 777, 34, true);
  text(page, 'Mensah Rentals & Services Inc.', LEFT, 748, 17, true);
  text(page, '126 - 11566 Eburne Way', LEFT, 729, 9, true);
  text(page, 'Richmond, BC  V6V 2G7', LEFT, 713, 9, true);
  text(page, 'Phone: (604) 644-5265', LEFT, 697, 9, true);
  text(page, 'info@mensahrentals.com', LEFT, 681, 9);
  text(page, 'GST #   75093 9837', LEFT, 665, 9, true);
  text(page, 'PST #   1502 1771', LEFT, 649, 9, true);
  rect(page, LEFT - 2, 628, 220, 18, true);

  text(page, input.kind, 430, 751, 28, true);
  rect(page, 374, 666, 179, 20, true);
  whiteText(page, 'QUOTE #', 389, 673, 8);
  whiteText(page, 'DATE', 500, 673, 8);
  text(page, input.quoteNumber, 382, 650, 8);
  text(page, input.documentDate, 486, 650, 8);
  line(page, 374, 643, 553, 643);
  rect(page, 374, 616, 179, 20, true);
  whiteText(page, 'CUSTOMER ID', 377, 623, 8);
  whiteText(page, 'DUE DATE', 490, 623, 8);
  text(page, input.customerId, 382, 600, 8);
  text(page, input.dueDate, 486, 600, 8);
  line(page, 374, 593, 553, 593);
  rect(page, 374, 566, 179, 18, true);
  whiteText(page, 'Rental Period', 380, 572, 8);
  text(page, 'Start', 405, 550, 8);
  text(page, input.rentalStartDate, 457, 550, 8);
  text(page, 'End', 405, 535, 8);
  text(page, input.rentalEndDate, 457, 535, 8);

  text(page, input.customerName, LEFT, 609, 10, true);
  text(page, `Order #: ${input.documentNumber}`, LEFT, 591, 8);
  text(page, `Show/Event: ${input.eventName}`, LEFT, 553, 9);
  text(page, `PO#: ${input.poNumber}`, LEFT, 537, 9);
  text(page, `Location: ${input.location}`, LEFT, 521, 9);
}

function continuationHeader(
  page: PageBuilder,
  input: OfficialCustomerFormInput,
  pageNumber: number,
) {
  text(page, 'Mensah Rentals & Services Inc.', LEFT, 793, 14, true);
  text(page, `${input.kind} ${input.documentNumber}`, 392, 793, 12, true);
  text(page, `Equipment continuation - page ${pageNumber}`, LEFT, 774, 8);
  line(page, LEFT, 765, RIGHT, 765, 0.8);
}

function tableHeader(page: PageBuilder, y: number) {
  rect(page, LEFT, y - 22, RIGHT - LEFT, 22, true);
  whiteText(page, 'DESCRIPTION', LEFT + 4, y - 14, 8);
  whiteText(page, 'QTY', 452, y - 14, 8);
  whiteText(page, 'DURATION', 489, y - 14, 8);
  return y - 22;
}

function itemHeight(item: OfficialCustomerFormItem) {
  return Math.max(18, wrap(item.description, 78).length * 9 + 7);
}

function tableRow(
  page: PageBuilder,
  item: OfficialCustomerFormItem,
  top: number,
) {
  const height = itemHeight(item);
  const bottom = top - height;
  rect(page, LEFT, bottom, RIGHT - LEFT, height);
  line(page, 440, bottom, 440, top);
  line(page, 483, bottom, 483, top);
  wrap(item.description, 78).forEach((entry, index) =>
    text(page, entry, LEFT + 4, top - 12 - index * 9, 7.5),
  );
  text(page, String(item.quantity), 455, top - 12, 8);
  text(page, item.duration, 490, top - 12, 8);
  return bottom;
}

function blankTableRow(page: PageBuilder, top: number) {
  const bottom = top - 18;
  rect(page, LEFT, bottom, RIGHT - LEFT, 18);
  line(page, 440, bottom, 440, top);
  line(page, 483, bottom, 483, top);
  return bottom;
}

function legal(page: PageBuilder, top: number) {
  text(page, 'Terms and Conditions', LEFT, top, 6.8, true);
  let y = top - 8;
  for (const term of OFFICIAL_CUSTOMER_FORM_TERMS) {
    const lines = wrap(term, 136);
    lines.forEach((entry) => {
      text(page, entry, LEFT, y, 6.05, entry.startsWith(term.slice(0, 2)));
      y -= 7.2;
    });
  }
  y -= 4;
  wrap(OFFICIAL_CUSTOMER_FORM_ACKNOWLEDGEMENT, 130).forEach((entry) => {
    text(page, entry, LEFT, y, 6.1, true);
    y -= 7.3;
  });
  const signatureY = Math.max(42, y - 21);
  text(page, 'Signature:', LEFT, signatureY, 8);
  line(page, 84, signatureY - 1, 214, signatureY - 1);
  text(page, 'Date:', 222, signatureY, 8);
  line(page, 250, signatureY - 1, 321, signatureY - 1);
  text(
    page,
    'If you have any questions about this invoice, please contact',
    325,
    signatureY + 12,
    6.8,
  );
  text(
    page,
    'Bobby Mensah, (604) 644-5265, info@mensahrentals.com',
    325,
    signatureY,
    6.8,
    true,
  );
}

function infoPage(input: OfficialCustomerFormInput) {
  const page: PageBuilder = { commands: [] };
  header(page, input);
  return page;
}

function buildPages(input: OfficialCustomerFormInput) {
  const pages: PageBuilder[] = [];
  let itemIndex = 0;
  let pageNumber = 1;
  while (itemIndex < input.items.length || pages.length === 0) {
    const page = pageNumber === 1 ? infoPage(input) : { commands: [] };
    if (pageNumber > 1) continuationHeader(page, input, pageNumber);
    let y = tableHeader(page, pageNumber === 1 ? 505 : 753);
    const legalReserve = input.items.length <= 10 && pageNumber === 1 ? 235 : 0;
    const minimumY = 45 + legalReserve;
    while (itemIndex < input.items.length) {
      const height = itemHeight(input.items[itemIndex]!);
      if (y - height < minimumY) break;
      y = tableRow(page, input.items[itemIndex]!, y);
      itemIndex += 1;
    }
    if (input.items.length === 0) y = blankTableRow(page, y);
    if (itemIndex === input.items.length) {
      if (input.items.length <= 10 && pageNumber === 1)
        while (y - 18 >= 278) y = blankTableRow(page, y);
      if (y >= 260) legal(page, Math.min(y - 14, 255));
      else {
        pages.push(page);
        const finalPage: PageBuilder = { commands: [] };
        continuationHeader(finalPage, input, pageNumber + 1);
        legal(finalPage, 735);
        pages.push(finalPage);
        return pages;
      }
    }
    pages.push(page);
    pageNumber += 1;
  }
  return pages;
}

/** Builds a customer-safe, selectable-text official Order or Return form. */
export function buildOfficialCustomerFormPdf(
  input: OfficialCustomerFormInput,
): Buffer {
  const pages = buildPages({
    ...input,
    items: input.items.map((item) => ({
      description: clampText(item.description),
      duration: clampText(item.duration),
      quantity: item.quantity,
    })),
  });
  const objects: string[] = [];
  const add = (value: string) => {
    objects.push(value);
    return objects.length;
  };
  const catalogId = add('');
  const pagesId = add('');
  const regularFontId = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  );
  const boldFontId = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  );
  const infoId = add(
    `<< /Title (${escaped(`Mensah Rentals ${input.kind} Form`)}) /Author (Mensah Rentals & Services Inc.) /Subject (${escaped(`${input.kind} Form`)}) >>`,
  );
  const pageIds: number[] = [];
  for (const page of pages) {
    const commands = page.commands.join('\n');
    const contentId = add(
      `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`,
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let output = '%PDF-1.4\n%MensahRentalsOfficialForm\n';
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
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}
