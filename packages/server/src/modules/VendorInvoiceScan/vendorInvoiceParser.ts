interface RecognizedLine {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScanPage {
  page: number;
  lines: RecognizedLine[];
  textLines?: RecognizedLine[];
}

export interface VendorInvoiceLine {
  code: string;
  description: string;
  billingUnit: string;
  pack: string;
  shipped: string;
  unitPrice: string;
  amount: string;
  page: number;
  attention?: string;
}

export interface ParsedVendorInvoice {
  vendorName: string;
  invoiceNumber: string;
  billDate: string;
  dueDate: string;
  currency: string;
  total: string;
  shipping: string;
  tax: string;
  discount: string;
  lines: VendorInvoiceLine[];
  warnings: string[];
  blocked?: boolean;
}

// Confirmed vendor identities from the matching record. Pack text is
// historical comparison evidence, never a source of current purchase values.
export const pjpMatches: Readonly<Record<string, {
  name: string;
  needsConversion?: boolean;
  pack?: string;
}>> = Object.freeze({
  '355403': { name: 'PC 9oz', pack: '25/100' },
  '355402': { name: 'PC 7oz', pack: '25/100' },
  '340155': { name: 'Foam:FP 9"-3 Comp', pack: '4/125' },
  '340150': { name: 'Foam:FP 9"W-NL', pack: '4/125' },
  '176300': { name: 'Spoon-Import', pack: '1000' },
  '175352': { name: 'Cutlery-4 Piece', pack: '250' },
  '167324': { name: 'Sani Wipes', pack: '12/72' },
  '166195': { name: 'Roll Towel-W', pack: "6/800'" },
  '123072': { name: 'L-FoldNap', pack: '20/400' },
  '113756': { name: 'Foam:FHC85HT3', pack: '200' },
  '113610': { name: 'Foam:FB6ozWHT', pack: '1000' },
  '013803': { name: 'PF18"x2000FT', pack: "2000'", needsConversion: true },
  '351717': { name: 'Soufflés:SCL2oz-AM', pack: '2500' },
  '351712': { name: 'Soufflés:SC2ozCLR-AM', pack: '2500' },
  '176378': { name: 'Soup Spoon-HVY MP', pack: '1000' },
  '176377': { name: 'Spoon-HVY MP', pack: '1000' },
  '166910': { name: "Roll-Br300'", pack: "12/350'" },
  '164533': { name: 'Hand Soap', pack: '4/1GAL' },
  '161572': { name: 'TB-17G-1.2', pack: '10/25' },
  '112460': { name: 'Deli Comb-Hvy 8oz', pack: '240' },
  '063103': { name: 'SB 1/6 Senior', pack: '250' },
  VBUB6704BINP: { name: 'Urinal Screen', pack: '10', needsConversion: true },
  '173219': { name: 'Coffee Stirrer', pack: '10/500', needsConversion: true },
});

const centerY = (line: RecognizedLine) => line.y + line.height / 2;
const sameRow = (a: RecognizedLine, b: RecognizedLine) =>
  Math.abs(centerY(a) - centerY(b)) <=
  Math.max(.006, Math.min(a.height, b.height) * .66);

const invoiceNoLabel = /\binvoice\s*(?:no\.?|number|#)\s*[:#]?\s*/i;
const vendorCode = /^[A-Za-z0-9][A-Za-z0-9./_-]{1,59}$/;
const pjpBrand = /^penn\s+jersey\s+paper\s+co\.?$/i;
const datePattern = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/;

function date(text: string) {
  const matched = text.match(datePattern)?.[0];
  if (!matched) return '';
  const fields = matched.split(/[-/]/);
  const [year, month, day] = fields[0].length === 4
    ? fields
    : [fields[2], fields[0], fields[1]];
  const iso = [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  const value = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== iso
    ? ''
    : iso;
}

function decimal(text?: string, places = 2) {
  if (!text) return '';
  const value = text.trim().replace(/^\$\s*/, '');
  const format = new RegExp(
    `^(?:\\d{1,3}(?:,\\d{3})+|\\d{1,9})(?:\\.\\d{1,${places}})?$`,
  );
  return format.test(value) ? value.replace(/,/g, '') : '';
}

function decimalUnits(text: string, places: number) {
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole + fraction.padEnd(places, '0'));
}

function amountFromLabel(lines: RecognizedLine[], label: RegExp) {
  const values = lines.flatMap((line) => {
    if (!label.test(line.text)) return [];
    const inline = decimal(line.text.replace(label, '').replace(/^\s*:\s*/, ''), 2);
    if (inline) return [inline];
    const values = lines.filter((other) =>
      other.x > line.x && sameRow(line, other) && decimal(other.text, 2),
    );
    return values.length === 1 ? [decimal(values[0].text, 2)] : [];
  });
  return [...new Set(values)];
}

function headerDate(lines: RecognizedLine[], label: RegExp) {
  for (const line of lines) {
    if (!label.test(line.text)) continue;
    const inline = date(line.text);
    if (inline) return inline;
    const candidate = lines.find((other) =>
      Math.abs(other.x - line.x) < .046 &&
      other.y > line.y &&
      other.y - line.y < .055 &&
      date(other.text),
    );
    if (candidate) return date(candidate.text);
  }
  return '';
}

function headerInvoiceNo(lines: RecognizedLine[], pjp: boolean) {
  const numbers: string[] = [];
  for (const line of lines) {
    const match = invoiceNoLabel.exec(line.text);
    if (!match) continue;
    const tail = line.text.slice(match.index + match[0].length);
    const possible = tail.split(/\s+/)[0];
    if (vendorCode.test(possible) && /\d/.test(possible)) {
      numbers.push(possible);
      continue;
    }
    const candidates = lines.filter((other) =>
      other.y > line.y && other.y - line.y < .06 &&
      other.x + other.width >= line.x - .02 && other.x <= line.x + .08,
    );
    const values = candidates.flatMap((other) => {
      if (pjp) return other.text.match(/(?:^|\s)\d{7,12}(?=\s|$)/g)?.map((n) => n.trim()) ?? [];
      return vendorCode.test(other.text) && /\d/.test(other.text) ? [other.text] : [];
    });
    if (values.length === 1) numbers.push(values[0]);
  }
  // PJP continuation/total pages can show only "2 of 3" and the invoice
  // number over the right edge, without an adjacent "Invoice No." heading.
  if (pjp && !numbers.length) {
    const marker = lines.find((line) => /^\d+\s+of\s+\d+$/i.test(line.text));
    const candidate = marker && lines.find((line) =>
      line.x > marker.x + .16 && sameRow(marker, line) && /^\d{7,12}$/.test(line.text),
    );
    if (candidate) numbers.push(candidate.text);
  }
  return numbers;
}

interface Column {
  name: 'code' | 'description' | 'pack' | 'unit' | 'shipped' | 'unitPrice' | 'amount';
  left: number;
  right: number;
}

function readTable(page: ScanPage, pjp: boolean): VendorInvoiceLine[] {
  const lines = [...page.lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const headings = lines.find((line) =>
    /^(?:description|item description|product description)$/i.test(line.text),
  );
  if (!headings) return [];
  const header = lines.filter((line) => sameRow(line, headings));
  const heading = (pattern: RegExp) => header.find((line) => pattern.test(line.text));
  const code = heading(/^(?:item|product|sku)(?:\s*(?:no\.?|code|#|number))?$/i);
  const quantity = heading(/^(?:shipped|qty\.? shipped|quantity shipped|ordered shipped)$/i)
    ?? heading(/^(?:qty\.?|quantity)$/i);
  const price = heading(/^unit (?:price|cost)(?:\s+extended)?$|^price$/i);
  const amount = heading(/^(?:extended|extension|amount|line total|total|unit price extended)$/i);
  if (!quantity || !price || !amount) return [];

  // PJP uses fixed column gutters in its printed form. Merged OCR headings
  // such as "ORDERED SHIPPED" cannot safely identify those columns alone.
  const cols: Column[] = pjp
    ? [
        { name: 'code', left: 0, right: .094 },
        { name: 'description', left: .15, right: .385 },
        { name: 'pack', left: .385, right: .45 },
        { name: 'unit', left: .45, right: .52 },
        { name: 'shipped', left: .601, right: .697 },
        { name: 'unitPrice', left: .735, right: .847 },
        { name: 'amount', left: .847, right: 1 },
      ]
    : makeColumns([
        ['code', code],
        ['description', headings],
        ['pack', heading(/^(?:pack|pack size|um\s*desc)$/i)],
        ['unit', heading(/^(?:unit|uom|um)$/i)],
        ['shipped', !/^ordered shipped$/i.test(quantity.text) ? quantity : undefined],
        ['unitPrice', price !== amount ? price : undefined],
        ['amount', price !== amount ? amount : undefined],
      ]);
  const firstFooter = lines.find((line) => line.y > headings.y &&
    /^(?:(?:merchandise|invoice|grand|sub)\s*total\b|balance due\b|amount due\b)/i.test(line.text),
  );
  const pageMarkers = lines.filter((line) => /^\d+\s+of\s+\d+$/i.test(line.text));
  const table = lines.filter((line) =>
    centerY(line) > centerY(headings) + .01 &&
    (!firstFooter || line.y < firstFooter.y - .007) &&
    !pageMarkers.some((marker) => sameRow(marker, line)),
  );

  const columnOf = (line: RecognizedLine) => cols.find((column) =>
    line.x >= column.left && line.x < column.right,
  )?.name;

  const anchors: RecognizedLine[] = [];
  for (const line of table) {
    const column = columnOf(line);
    const monetaryCell = (column === 'amount' || column === 'unitPrice') &&
      (/^\$/.test(line.text) || (line.text.includes('.') && decimal(line.text, 6)));
    const codeCell = column === 'code' && vendorCode.test(line.text) &&
      (pjp ? /^[A-Z0-9][A-Z0-9./_-]{4,59}$/i.test(line.text) : /\d/.test(line.text));
    if ((monetaryCell || codeCell) && !anchors.some((anchor) => sameRow(anchor, line))) {
      anchors.push(line);
    }
  }

  return anchors.map((anchor, index) => {
    const next = anchors[index + 1];
    const row = table.filter((cell) => sameRow(anchor, cell));
    const notes: string[] = [];
    let usedTextLayer = false;
    const embedded = (name: Column['name'], wrapped: boolean) => {
      const column = cols.find((candidate) => candidate.name === name);
      if (!pjp || !column) return '';
      const candidates = (page.textLines ?? []).filter((cell) =>
        columnOf(cell) === name && cell.x + cell.width <= column.right + .008 &&
        (sameRow(anchor, cell) || (wrapped &&
          centerY(cell) > centerY(anchor) &&
          centerY(cell) < (next ? centerY(next) - .007 : centerY(anchor) + .026))),
      ).sort((a, b) => a.y - b.y);
      if (!candidates.length || !sameRow(anchor, candidates[0])) return '';
      if (wrapped && candidates.length <= 3 &&
        candidates.every((cell) => Math.abs(cell.x - candidates[0].x) < .012)) {
        return candidates.map((cell) => cell.text).join('');
      }
      return candidates.length === 1 ? candidates[0].text : '';
    };
    const text = (name: Column['name']) => {
      const matches = row.filter((cell) => columnOf(cell) === name);
      return matches.length === 1 ? matches[0].text : '';
    };
    const field = (name: Column['name'], validate: (value: string) => string, wrapped = false) => {
      const visual = validate(text(name));
      const layer = validate(embedded(name, wrapped));
      if (layer && !visual) {
        usedTextLayer = true;
        return layer;
      }
      if (layer && layer !== visual) {
        const confidence = row.find((cell) => columnOf(cell) === name)?.confidence ?? 0;
        if (name === 'pack' && confidence < .55) {
          usedTextLayer = true;
          return layer;
        }
        notes.push('The PDF text differs from the scan. Check the original invoice.');
      }
      return visual;
    };
    const continuations = table.filter((cell) =>
      centerY(cell) >= centerY(anchor) - .009 &&
      centerY(cell) < (next ? centerY(next) - .009 : centerY(anchor) + .06),
    );
    const description = continuations
      .filter((cell) => columnOf(cell) === 'description')
      .map((cell) => cell.text).join(' ');
    const code = field('code', (value) => vendorCode.test(value) ? value : '', true);
    const pack = field('pack', (value) => value);
    const billingUnit = field('unit', (value) => {
      const unit = value.toUpperCase();
      const pattern = pjp ? /^(?:CS|EA|INP|BX|PK)$/ : /^[A-Z]{1,5}$/;
      return pattern.test(unit) ? unit : '';
    });
    const unitPrice = field('unitPrice', (value) => decimal(value, 6));
    const amount = field('amount', (value) => decimal(value));
    let shipped = field('shipped', (value) => decimal(value, 6));
    if (usedTextLayer) notes.push('Check values read from the PDF text against the original invoice.');

    if (!code) notes.push('Vendor code needs review.');
    if (!billingUnit) notes.push('Billing unit needs review.');

    if (unitPrice && amount) {
      const rate = decimalUnits(unitPrice, 6);
      const extension = decimalUnits(amount, 2);
      if (shipped) {
        const raw = decimalUnits(shipped, 6) * rate;
        if ((raw + 5000000000n) / 10000000000n !== extension) {
          notes.push('Shipped quantity does not match the extended price.');
        }
      } else if (rate > 0n && extension > 0n && (extension * 10000n) % rate === 0n) {
        shipped = String((extension * 10000n) / rate);
        notes.push('Shipped quantity calculated from the current extended and unit prices. Verify against the invoice.');
      }
    }

    if (!unitPrice || !amount || !shipped) notes.push('Quantity or price needs review.');
    if (row.some((cell) => cell.confidence < .55 &&
      ['code', 'pack', 'unit', 'shipped', 'unitPrice', 'amount'].includes(columnOf(cell)))) {
      notes.push('Check low-confidence values against the invoice.');
    }
    const substitute = continuations.find((cell) => /\b(?:sub for|substitut)/i.test(cell.text));
    if (substitute) notes.push(substitute.text);

    return {
      code, description, billingUnit, pack, shipped, unitPrice, amount, page: page.page,
      ...(notes.length ? { attention: [...new Set(notes)].join(' ') } : {}),
    };
  });
}

function makeColumns(
  cells: [Column['name'], RecognizedLine | undefined][],
): Column[] {
  const ranges = cells.flatMap(([name, line]) => line ? [{ name, line }] : []);
  ranges.sort((a, b) => a.line.x - b.line.x);
  return ranges.map(({ name, line }, index) => ({
    name,
    left: index === 0 ? 0 : Math.max(
      (line.x + ranges[index - 1].line.x) / 2,
      line.x - .035,
    ),
    right: index + 1 === ranges.length ? 1 : Math.max(
      (line.x + ranges[index + 1].line.x) / 2,
      ranges[index + 1].line.x - .035,
    ),
  }));
}

export function parseVendorInvoice(input: ScanPage[]): ParsedVendorInvoice {
  const pages = input.map((page) => ({
    ...page,
    lines: normalizeLines(page.lines),
    textLines: page.textLines && normalizeLines(page.textLines),
  }));
  const pjp = pages.some((page) =>
    page.lines.some((line) => line.y < .22 && pjpBrand.test(line.text)),
  );
  const headers = pages.flatMap((page) => {
    const table = page.lines.find((line) => /^description$/i.test(line.text));
    return page.lines.filter((line) => line.y < (table?.y ?? .5));
  });
  const allLines = pages.flatMap((page) => page.lines);
  const warnings: string[] = [];
  const invoiceNumbers = [...new Set(pages.flatMap((page) =>
    headerInvoiceNo(page.lines.filter((line) => line.y < .43), pjp),
  ))];
  if (invoiceNumbers.length > 1) warnings.push('Multiple invoice numbers detected. Separate these pages before posting.');
  const labeledVendor = headers.find((line) => /^(?:vendor|supplier)\s*:\s*\S/i.test(line.text));
  const vendorName = pjp ? 'Penn Jersey Paper Co.' :
    labeledVendor?.text.replace(/^(?:vendor|supplier)\s*:\s*/i, '') ?? '';

  function amount(label: RegExp, purpose: string) {
    const candidates = amountFromLabel(allLines, label);
    if (candidates.length > 1) warnings.push(`Conflicting ${purpose} values. Review the original pages.`);
    return candidates.length === 1 ? candidates[0] : '';
  }

  const lines = pages.flatMap((page) => readTable(page, pjp));
  if (!lines.length) warnings.push('No product rows could be read. Add them from the original invoice.');
  if (lines.some((line) => line.attention)) warnings.push('Some product values need review.');
  const total = amount(/^(?:invoice total|grand total|total due|amount due|balance due|total)(?:\s*:\s*|\s+(?=\$?\d)|$)/i, 'invoice total');
  const taxes = amount(/^(?:sales tax|taxes|tax)(?:\s*:\s*|\s+(?=\$?\d)|$)/i, 'tax');
  const fees = [
    amount(/^(?:shipping(?: fee)?|delivery(?: fee)?)(?:\s*:\s*|\s+(?=\$?\d)|$)/i, 'delivery'),
    amount(/^(?:freight(?:\/other)?)(?:\s*:\s*|\s+(?=\$?\d)|$)/i, 'freight'),
    amount(/^small order fee(?:\s*:\s*|\s+(?=\$?\d)|$)/i, 'small order fee'),
  ].filter(Boolean);
  const shippingCents = fees.reduce((sum, fee) => sum + decimalUnits(fee, 2), 0n);
  const shipping = fees.length
    ? `${shippingCents / 100n}.${String(shippingCents % 100n).padStart(2, '0')}`
    : '';
  const discount = amount(/^(?:invoice\s+)?discount(?:\s*:\s*|\s+(?=\$?\d)|$)/i, 'discount');
  const subtotal = amount(/^(?:merchandise total|sub\s*total)(?:\s*:\s*|\s+(?=\$?\d)|$)/i, 'merchandise subtotal');
  if (subtotal && lines.every((line) => line.amount)) {
    const sum = lines.reduce((acc, line) => acc + decimalUnits(line.amount, 2), 0n);
    if (sum !== decimalUnits(subtotal, 2)) {
      warnings.push('Product extensions do not add up to the merchandise subtotal. Check for missing or misread lines.');
    }
  }
  const currencies = [...new Set(allLines.flatMap((line) =>
    line.text.match(/\b(?:USD|CAD|EUR|GBP|AUD)\b/g) || [],
  ))];
  return {
    vendorName,
    invoiceNumber: invoiceNumbers.length === 1 ? invoiceNumbers[0] : '',
    billDate: headerDate(headers, /^(?:invoice\s+)?date\s*[: ]|^(?:invoice\s+)?date$/i),
    dueDate: headerDate(headers, /^(?:payment due|due date)\b/i),
    currency: currencies.length === 1 ? currencies[0] : pjp && !currencies.length ? 'USD' : '',
    total,
    shipping,
    tax: taxes,
    discount,
    lines,
    warnings,
    ...(invoiceNumbers.length > 1 ? { blocked: true } : {}),
  };
}

function normalizeLines(lines: RecognizedLine[]) {
  return lines.map((line) => ({
    ...line,
    text: line.text.normalize('NFKC').replace(/[’′]/g, "'").replace(/\s+/g, ' ').trim(),
  })).filter((line) => line.text);
}
