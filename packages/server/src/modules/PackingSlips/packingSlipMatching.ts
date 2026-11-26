import {
  InvoiceCandidate,
  MatchResult,
  RecognizedLine,
  ScanPage,
  SlipProposal,
} from './packingSlip.types';

const CONFIDENCE = 0.9;
const numberKey = (value: string) =>
  (value || '').trim().replace(/\s+/g, ' ').toUpperCase();
const words = (value: string) =>
  numberKey(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const unique = <T>(values: T[]) => [...new Set(values)];
const generic = new Set([
  'THE',
  'AND',
  'CO',
  'COMPANY',
  'INC',
  'LLC',
  'LTD',
  'STORE',
  'MARKET',
  'CUSTOMER',
  'CUSTOMERS',
  'RETAIL',
  'SHOP',
]);
const distinctiveName = (value: string) =>
  words(value)
    .split(' ')
    .some((word) => word.length >= 4 && !generic.has(word));
const distinctiveAddress = (value: string) =>
  /\d/.test(value) &&
  words(value).length >= 12 &&
  words(value).split(' ').length >= 3;
const distinctiveReference = (value: string) =>
  words(value)
    .replace(/\b(?:PO|ORDER|REF|REFERENCE|TRACKING)\b/g, '')
    .replace(/\s/g, '').length >= 5;
const invoiceLabel =
  /^(?:(?:invoice|inv\.?)\s+(?:no\b\.?|number\b)|(?:invoice|inv\.?)\s*#)\s*:?\s*/i;
const customerLabel = /^(?:customer(?:\s+name)?|sold\s+to)\s*(?:[:#]\s*|$)/i;
const billingLabel = /^bill(?:ed)?\s+to\b\s*:?\s*/i;
const billingDepartment =
  /^(?:ACCOUNTING|ACCOUNTS PAYABLE|ACCOUNTS RECEIVABLE|BILLING|FINANCE)(?: (?:DEPARTMENT|DEPT))?$/;
const billingAddressLine =
  /^(?:(?:PO|P O|POST OFFICE) BOX \d|(?:UNIT|SUITE|APT|APARTMENT|FLOOR|BLDG|BUILDING) \d|\d+[A-Z]?(?: \d+[A-Z]?)? (?:.+ )?(?:STREET|ST|ROAD|RD|LANE|LN|DRIVE|DR|AVENUE|AVE|BOULEVARD|BLVD|COURT|CT|WAY|PLACE|PL|CIRCLE|CIR|HIGHWAY|HWY|PARKWAY|PKWY|TERRACE|TER|TRAIL|TRL)\b)/;
const addressLabel =
  /^(?:(?:ship|deliver)\s+to|(?:shipping|delivery)\s+address)\b\s*:?\s*/i;
const referenceLabel =
  /^(?:(?:customer\s+p\.?o\b\.?(?:\s*\/\s*reference\b)?|(?:purchase\s+order|order|reference|p\.?o\.?)\s+(?:number\b|no\b\.?|#))\s*:?\s*|(?:p\.?o\b\.?|purchase\s+order\b|reference\b)\s*(?:[:#]\s*|$))/i;
const trackingLabel =
  /^tracking\b(?:\s+(?:number\b|no\b\.?|#)\s*:?\s*|\s*(?:[:#]\s*|$))/i;
const dateLabel = /^(?:shipping|delivery|ship|delivered)\s+date\b\s*:?\s*/i;
const anyField = (text: string) =>
  [
    invoiceLabel,
    customerLabel,
    billingLabel,
    addressLabel,
    referenceLabel,
    trackingLabel,
    dateLabel,
  ].some((label) => label.test(text)) ||
  /^(?:invoice\s+date|due\s+date|date(?:\s+(?:of\s+issue|due))?|terms|ship\s+via)\b/i.test(
    text,
  );
const pageMarker = /\bpage\s+(\d+)\s*(?:of|\/)\s*(\d+)(?=$|[\s),;]|\.(?!\d))/i;
const paginationShape =
  /\bpage\b\s*[:#]?\s*(?:[^\s/]+?\s*)?(?:[o0]f(?=\s|\d|$)|\/)/gi;
const pageIndexOnly = /^page\s*[:#]?\s*[\dIOl|?]+[.)]?$/i;
const continuedTitle =
  /^(?:(?:packing\s+(?:slip|list))\s*[-–—:(]?\s*)?(?:continued|continuation)\s*\)?[.:]?$/i;
const packingTitle =
  /^packing\s+(?:slip|list)(?:\s*[-–—:(]?\s*(?:continued|continuation)\s*\)?)?[.:]?$/i;
const otherTitle =
  /^(?:tax\s+invoice|sales\s+invoice|invoice|purchase\s+order|credit\s+note|statement|delivery\s+receipt)(?:\s+(?:copy|original))?\s*$/i;
const tableHeader =
  /^(?:item(?:\s+code)?|sku|code|description|quantity|qty|unit)(?:\s+(?:item|sku|code|description|quantity|qty|unit))*$/i;
const footer =
  /^(?:total(?:\s+(?:quantity|qty))?|subtotal|signature|signed|notes?|payment\s+instructions)(?:\s*[:#]|\s*$|\s+\d)/i;

interface Row {
  text: string;
  confidence: number;
  lines: RecognizedLine[];
}
interface Field {
  text: string;
  confidence: number;
  firstConfidence: number;
  page: number;
  parts: string[];
}
interface Evidence {
  rows: Row[];
  numbers: Field[];
  customers: Field[];
  billing: Field[];
  addresses: Field[];
  references: Field[];
  tracking: Field[];
  dates: Field[];
  documentOk: boolean;
  reasons: string[];
}

function rowsFor(page: ScanPage): Row[] {
  const lines = page.lines
    .filter(
      (line) =>
        typeof line.text === 'string' &&
        line.text.trim() &&
        [line.x, line.y, line.width, line.height, line.confidence].every(
          Number.isFinite,
        ) &&
        line.x >= 0 &&
        line.y >= 0 &&
        line.x <= 1 &&
        line.y <= 1 &&
        line.width > 0 &&
        line.height > 0,
    )
    .map((line) => ({ ...line, text: line.text.trim() }));
  const rows: RecognizedLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find(
      (group) =>
        Math.abs(group[0].y + group[0].height / 2 - line.y - line.height / 2) <=
        Math.min(0.012, Math.min(group[0].height, line.height) / 2),
    );
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows.map((group) => {
    group.sort((a, b) => a.x - b.x);
    return {
      text: group.map((line) => line.text).join(' '),
      confidence: Math.min(...group.map((line) => line.confidence)),
      lines: group,
    };
  });
}

// Label and value may be separate OCR lines. Stop at the next label in the
// same row and follow only the matching column for stacked values.
function fields(
  page: ScanPage,
  rows: Row[],
  label: RegExp,
  consumed: Set<RecognizedLine>,
  block = false,
): Field[] {
  const result: Field[] = [];
  rows.forEach((row, index) =>
    row.lines.forEach((line) => {
      if (!label.test(line.text)) return;
      consumed.add(line);
      const inline = line.text.replace(label, '').trim();
      let confidence = line.confidence;
      let firstConfidence = inline ? confidence : 0;
      const parts = inline ? [inline] : [];
      let lastY = line.y;
      const add = (value: RecognizedLine) => {
        confidence = Math.min(confidence, value.confidence);
        if (!parts.length) firstConfidence = confidence;
        parts.push(value.text);
        consumed.add(value);
        lastY = value.y;
      };
      const beside = row.lines[row.lines.indexOf(line) + 1];
      if (
        !inline &&
        !block &&
        beside &&
        beside.x >= line.x + line.width - 0.01 &&
        beside.x - line.x - line.width <= 0.15 &&
        !anyField(beside.text)
      )
        add(beside);
      if (block || !parts.length) {
        for (const next of rows.slice(index + 1, index + 7)) {
          if (
            next.lines[0].y - lastY > 0.08 ||
            next.lines.some(
              (cell) =>
                tableHeader.test(cell.text) ||
                packingTitle.test(cell.text) ||
                continuedTitle.test(cell.text) ||
                pageMarker.test(cell.text),
            )
          )
            break;
          const aligned = next.lines.filter(
            (cell) => Math.abs(cell.x - line.x) <= 0.035,
          );
          if (!aligned.length) continue;
          if (
            aligned.length !== 1 ||
            anyField(aligned[0].text) ||
            footer.test(aligned[0].text) ||
            /^.+\s+\d+(?:\.\d+)?\s+[a-z]+$/i.test(aligned[0].text)
          )
            break;
          add(aligned[0]);
          if (!block) break;
        }
      }
      result.push({
        text: parts.join(' '),
        confidence: parts.length ? confidence : 0,
        firstConfidence,
        page: page.page,
        parts,
      });
    }),
  );
  return result;
}

function extract(pages: ScanPage[]): Evidence {
  const evidence: Evidence = {
    rows: [],
    numbers: [],
    customers: [],
    billing: [],
    addresses: [],
    references: [],
    tracking: [],
    dates: [],
    documentOk: pages.length > 0,
    reasons: [],
  };
  for (const page of pages) {
    const rows = rowsFor(page);
    const lines = rows.flatMap((row) => row.lines);
    const title = lines.find(
      (line) =>
        line.confidence >= CONFIDENCE &&
        line.y < 0.4 &&
        packingTitle.test(line.text),
    );
    const other = lines.some(
      (line) =>
        line.y < 0.4 &&
        otherTitle.test(line.text) &&
        (!referenceLabel.test(line.text) ||
          !title ||
          Math.abs(line.y - title.y) <= 0.03),
    );
    const packing = Boolean(title);
    if (!packing || other) {
      evidence.documentOk = false;
      evidence.reasons.push(
        `Page ${page.page}: packing slip classification ${other ? 'conflicts with another document title' : 'missing or uncertain'}.`,
      );
    }
    const consumed = new Set<RecognizedLine>();
    evidence.numbers.push(...fields(page, rows, invoiceLabel, consumed));
    evidence.customers.push(...fields(page, rows, customerLabel, consumed));
    evidence.billing.push(...fields(page, rows, billingLabel, consumed, true));
    evidence.addresses.push(
      ...fields(page, rows, addressLabel, consumed, true),
    );
    evidence.references.push(...fields(page, rows, referenceLabel, consumed));
    evidence.tracking.push(...fields(page, rows, trackingLabel, consumed));
    evidence.dates.push(...fields(page, rows, dateLabel, consumed));
    if (lines.some((line) => line.confidence < CONFIDENCE))
      evidence.reasons.push(
        `Page ${page.page}: low-confidence OCR cannot establish automatic verification.`,
      );
    evidence.rows.push(
      ...rows.filter((row) => !row.lines.some((line) => consumed.has(line))),
    );
  }
  return evidence;
}

function highValues(fields: Field[], normalize = words): string[] {
  return unique(
    fields
      .filter((field) => field.confidence >= CONFIDENCE)
      .map((field) => normalize(field.text)),
  );
}

function dateKey(value: string): string {
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})(?:T.*)?\s*$/.exec(value);
  const us = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value);
  const printed = /^\s*(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s*$/i.exec(value);
  const month =
    printed &&
    [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ].indexOf(printed[2].toUpperCase()) + 1;
  let canonical = '';
  if (iso) canonical = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (us)
    canonical = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  else if (printed && month)
    canonical = `${printed[3]}-${String(month).padStart(2, '0')}-${printed[1].padStart(2, '0')}`;
  const parsed = new Date(canonical + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === canonical
    ? canonical
    : '';
}

function candidateIndex(invoices: InvoiceCandidate[]) {
  const names = new Map<string, Set<number>>();
  const addresses = new Map<string, Set<number>>();
  const references = new Map<string, number>();
  const tracking = new Map<string, number>();
  for (const invoice of invoices) {
    for (const [map, key] of [
      [names, words(invoice.customerName)],
      [addresses, words(invoice.shippingAddress)],
    ] as const) {
      const customers = map.get(key) || new Set<number>();
      customers.add(invoice.customerId);
      map.set(key, customers);
    }
    for (const [map, key] of [
      [references, numberKey(invoice.referenceNo)],
      [tracking, numberKey(invoice.trackingNo)],
    ] as const) {
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return { names, addresses, references, tracking };
}

interface Assessment {
  invoice: InvoiceCandidate;
  reasons: string[];
  score: number;
  customer: boolean;
  address: boolean;
  conflict: boolean;
  lines: boolean;
  complete: boolean;
  uniqueReference: boolean;
  hasReference: boolean;
  date: boolean;
}
function assess(
  e: Evidence,
  invoice: InvoiceCandidate,
  index: ReturnType<typeof candidateIndex>,
): Assessment {
  const reasons: string[] = [];
  const name = words(invoice.customerName);
  const address = words(invoice.shippingAddress);
  const explicitCustomers = highValues(e.customers);
  const destinations = highValues(e.addresses);
  const addresses = destinations.map((value) =>
    value !== address && value.startsWith(name + ' ')
      ? value.slice(name.length + 1)
      : value,
  );
  const billedNames = e.billing
    .filter((field) => field.firstConfidence >= CONFIDENCE)
    .map((field) => words(field.parts[0]))
    .filter(
      (value) =>
        distinctiveName(value) &&
        !billingAddressLine.test(value) &&
        !billingDepartment.test(value),
    );
  const shippedNames = e.addresses
    .filter((field) => field.confidence >= CONFIDENCE)
    .map((field) => words(field.parts[0]));
  const namePresent =
    explicitCustomers.includes(name) ||
    billedNames.includes(name) ||
    shippedNames.includes(name) ||
    destinations.some(
      (value) => value === name || value.startsWith(name + ' '),
    );
  const customer =
    distinctiveName(name) && namePresent && index.names.get(name)?.size === 1;
  const addressPresent =
    distinctiveAddress(address) && addresses.includes(address);
  const addressMatch =
    addressPresent && index.addresses.get(address)?.size === 1;
  const customerConflict =
    explicitCustomers.some((value) => value !== name) ||
    billedNames.some((value) => value !== name) ||
    shippedNames.some(
      (value) =>
        value !== name && distinctiveName(value) && index.names.has(value),
    );
  const addressConflict = addresses.some(
    (value) => value !== name && value !== address,
  );
  const uncertain = [
    ...e.customers,
    ...e.addresses,
    ...e.references,
    ...e.tracking,
    ...e.dates,
  ].some((field) => field.confidence < CONFIDENCE);
  let conflict = customerConflict || addressConflict || uncertain;
  if (uncertain)
    reasons.push(
      'An explicit customer, delivery or secondary reference field is unreadable or uncertain.',
    );
  reasons.push(
    customerConflict
      ? 'Customer conflicts.'
      : customer
        ? `Customer matched: ${invoice.customerName}.`
        : `Customer ${namePresent ? 'is shared or generic' : 'missing or not matched'}.`,
  );
  reasons.push(
    addressMatch
      ? `Delivery address matched: ${invoice.shippingAddress}.`
      : `Delivery address ${addressConflict ? 'conflicts' : addressPresent ? 'is shared by customers' : 'missing or not matched'}.`,
  );
  const dateValues = highValues(e.dates, dateKey);
  const date =
    dateValues.length === 1 &&
    !!dateValues[0] &&
    dateValues[0] === dateKey(invoice.shippingDate);
  if (dateValues.length && !date) {
    conflict = true;
    reasons.push('Explicit delivery date conflicts or is unreadable.');
  } else
    reasons.push(
      date
        ? 'Explicit delivery date matched.'
        : 'Explicit delivery date missing.',
    );
  let uniqueReference = false;
  const referencePairs = [
    [e.references, 'referenceNo', index.references],
    [e.tracking, 'trackingNo', index.tracking],
  ] as const;
  for (const [source, key, counts] of referencePairs) {
    const values = highValues(source, numberKey);
    for (const value of values) {
      if (value !== numberKey(invoice[key])) {
        conflict = true;
        reasons.push(`${key} conflicts: ${value}.`);
      } else if (!distinctiveReference(value))
        reasons.push(`${key} is not distinctive: ${value}.`);
      else if (counts.get(value) !== 1)
        reasons.push(`${key} is reused: ${value}.`);
      else {
        uniqueReference = true;
        reasons.push(`${key} uniquely matched: ${value}.`);
      }
    }
  }
  const hasReference = e.references.length + e.tracking.length > 0;
  if (!hasReference) reasons.push('Secondary reference missing.');
  const itemCheck = checkItems(e.rows, invoice);
  conflict ||= itemCheck.conflict;
  reasons.push(...itemCheck.reasons);
  if (!invoice.eligible)
    reasons.push('Invoice is not eligible (draft, deleted or unavailable).');
  return {
    invoice,
    reasons,
    score:
      (customer ? 4 : 0) +
      (addressMatch ? 3 : 0) +
      (uniqueReference ? 4 : 0) +
      (itemCheck.lines ? 2 : 0) +
      (date ? 1 : 0) +
      (highValues(e.numbers, numberKey).includes(numberKey(invoice.invoiceNo))
        ? 10
        : 0),
    customer,
    address: addressMatch,
    conflict,
    lines: itemCheck.lines,
    complete: itemCheck.complete,
    uniqueReference,
    hasReference,
    date,
  };
}

function checkItems(
  rows: Row[],
  invoice: InvoiceCandidate,
): { lines: boolean; complete: boolean; conflict: boolean; reasons: string[] } {
  const totals = new Map<number, number>();
  let unsafe = false;
  let conflict = false;
  let inTable = false;
  const aliases = invoice.entries.map((entry) =>
    unique(
      [
        entry.code,
        entry.name,
        entry.description,
        [entry.code, entry.name].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .map(numberKey),
    ),
  );
  const units = unique(
    invoice.entries.map((entry) => numberKey(entry.unit)).filter(Boolean),
  );
  for (const row of rows) {
    if (tableHeader.test(row.text)) {
      inTable = true;
      continue;
    }
    if (
      row.lines.some(
        (line) =>
          packingTitle.test(line.text) ||
          continuedTitle.test(line.text) ||
          footer.test(line.text) ||
          pageMarker.test(line.text),
      )
    ) {
      inTable = false;
      continue;
    }
    if (anyField(row.text)) continue;
    const parsed =
      /^(.+?)\s+([+\-]?\d+(?:\.\d+)?)(?:\s+([a-z][a-z0-9 /]*))?$/i.exec(
        row.text,
      );
    const text = numberKey(row.text);
    const possibleItem = aliases.some((values) =>
      values.some((alias) => text === alias || text.startsWith(alias + ' ')),
    );
    const endsInUnit = units.some((unit) => text.endsWith(' ' + unit));
    if (!parsed) {
      unsafe ||= possibleItem || inTable || endsInUnit;
      continue;
    }
    const identity = numberKey(parsed[1]);
    const matches = aliases
      .map((values, i) => (values.includes(identity) ? i : -1))
      .filter((i) => i >= 0);
    if (!inTable && !possibleItem && !parsed[3]) continue;
    if (matches.length !== 1 || row.confidence < CONFIDENCE) {
      unsafe = true;
      conflict ||=
        matches.length === 0 &&
        row.confidence >= CONFIDENCE &&
        (endsInUnit || inTable);
      continue;
    }
    const index = matches[0];
    const quantity = Number(parsed[2]);
    // Units must be explicit and exactly equal: never infer case/piece conversions.
    const unit = numberKey(invoice.entries[index].unit);
    if (
      !unit ||
      numberKey(parsed[3]) !== unit ||
      quantity <= 0 ||
      !Number.isFinite(quantity)
    ) {
      unsafe = true;
      conflict ||=
        quantity <= 0 ||
        Boolean(unit && parsed[3] && numberKey(parsed[3]) !== unit);
      continue;
    }
    totals.set(index, (totals.get(index) || 0) + quantity);
  }
  for (const [index, quantity] of totals)
    if (
      quantity > invoice.entries[index].quantity ||
      !Number.isFinite(invoice.entries[index].quantity)
    )
      conflict = true;
  const lines = totals.size > 0 && !unsafe && !conflict;
  const complete =
    lines &&
    invoice.entries.length > 1 &&
    totals.size === invoice.entries.length &&
    [...totals].every(
      ([index, quantity]) => quantity === invoice.entries[index].quantity,
    ) &&
    new Set(
      invoice.entries.map((entry) =>
        numberKey(entry.code || entry.name || entry.description),
      ),
    ).size === invoice.entries.length;
  return {
    lines,
    complete,
    conflict,
    reasons: [
      lines
        ? `Item identities, explicit units and shipped quantities matched (${totals.size} distinct items${complete ? ', complete delivery' : ''}).`
        : `Item/quantity evidence ${conflict ? 'conflicts' : unsafe ? 'is incomplete or uncertain' : 'is missing'}.`,
    ],
  };
}

function match(
  pages: ScanPage[],
  invoices: InvoiceCandidate[],
  index: ReturnType<typeof candidateIndex>,
): MatchResult {
  const evidence = extract(pages);
  const assessed = invoices
    .map((invoice) => assess(evidence, invoice, index))
    .sort((a, b) => b.score - a.score || a.invoice.id - b.invoice.id);
  const candidates = assessed
    .slice(0, 10)
    .map((a) => ({
      invoiceId: a.invoice.id,
      invoiceNo: a.invoice.invoiceNo,
      customerName: a.invoice.customerName,
      reasons: a.reasons,
    }));
  const reasons = [...evidence.reasons];
  const review = (reason: string): MatchResult => ({
    verified: false,
    route: 'review',
    reasons: [...reasons, reason],
    candidates,
  });
  const accept = (a: Assessment, route: MatchResult['route']): MatchResult => ({
    verified: true,
    invoiceId: a.invoice.id,
    route,
    reasons: [...reasons, `Verified using ${route}.`, ...a.reasons],
    candidates,
  });
  if (!evidence.documentOk)
    return review(
      'Every assigned page must be confidently classified as a packing slip.',
    );
  if (!completeBoundary(pages))
    return review(
      'Page sequence is incomplete or ambiguous. Verify all continuation pages.',
    );
  const allNumbers = unique(
    evidence.numbers.map((field) => numberKey(field.text)).filter(Boolean),
  );
  const confidentNumbers = highValues(evidence.numbers, numberKey);
  if (allNumbers.length > 1)
    return review(
      'Conflicting printed invoice numbers; fallback cannot override them.',
    );
  if (
    pages.length > 1 &&
    !pages.every(
      (page) =>
        !!numberIdentity(
          evidence.numbers.filter((field) => field.page === page.page),
        ),
    )
  ) {
    return review(
      'Each continuation page needs the same confidently read invoice number.',
    );
  }
  const exact = assessed.filter((a) =>
    allNumbers.includes(numberKey(a.invoice.invoiceNo)),
  );
  if (exact.length) {
    if (exact.length !== 1)
      return review(
        'Printed invoice number resolves to multiple existing invoices.',
      );
    const a = exact[0];
    if (confidentNumbers.length !== 1)
      return review(
        'Printed invoice number is low confidence; explicit review is required.',
      );
    if (!a.invoice.eligible || a.conflict || !(a.customer || a.address))
      return review(
        'Printed number resolves to an invoice but corroboration is missing/conflicting or the invoice is ineligible; fallback is blocked.',
      );
    return accept(a, 'invoice-number');
  }
  reasons.push(
    allNumbers.length
      ? `Printed invoice number has no exact match: ${allNumbers.join(', ')}.`
      : 'Labeled invoice number missing or unreadable.',
  );
  const reference = assessed.filter(
    (a) =>
      a.invoice.eligible &&
      !a.conflict &&
      a.customer &&
      a.address &&
      a.uniqueReference &&
      a.lines,
  );
  if (reference.length === 1) return accept(reference[0], 'reference');
  if (reference.length > 1)
    return review('Multiple invoices satisfy reference verification.');
  const contents = assessed.filter(
    (a) =>
      a.invoice.eligible &&
      !a.conflict &&
      a.customer &&
      a.address &&
      !a.hasReference &&
      a.date &&
      a.complete,
  );
  if (contents.length === 1) return accept(contents[0], 'contents');
  return review(
    contents.length > 1
      ? 'Competing invoices have the same delivery contents and date.'
      : 'No unique invoice satisfies conservative fallback verification; inspect candidate evidence.',
  );
}

export function matchSlip(
  pages: ScanPage[],
  invoices: InvoiceCandidate[],
): MatchResult {
  return match(pages, invoices, candidateIndex(invoices));
}

function pageBoundary(page: ScanPage) {
  const rows = rowsFor(page);
  const pagination = rows.flatMap((row) => {
    const count = [...row.text.matchAll(paginationShape)].length;
    return count || row.lines.some((line) => pageIndexOnly.test(line.text))
      ? [{ row, count }]
      : [];
  });
  const parsed =
    pagination.length === 1 &&
    pagination[0].count === 1 &&
    pageMarker.exec(pagination[0].row.text);
  const marker = parsed
    ? { index: Number(parsed[1]), total: Number(parsed[2]) }
    : undefined;
  const continuations = rows
    .flatMap((row) => row.lines)
    .filter((line) => continuedTitle.test(line.text));
  const uncertain =
    Boolean(
      pagination.length &&
        (!marker ||
          marker.index < 1 ||
          marker.index > marker.total ||
          marker.total > 200 ||
          pagination[0].row.confidence < CONFIDENCE),
    ) ||
    continuations.some((line) => line.confidence < CONFIDENCE) ||
    Boolean(marker?.index === 1 && continuations.length);
  return { marker, continued: continuations.length > 0, uncertain };
}

function completeBoundary(pages: ScanPage[]): boolean {
  const boundaries = pages.map(pageBoundary);
  if (boundaries.some((boundary) => boundary.uncertain)) return false;
  const numbered = boundaries.flatMap((boundary) =>
    boundary.marker ? [boundary.marker] : [],
  );
  if (numbered.length) {
    return (
      numbered.length === pages.length &&
      numbered.every((marker) => marker.total === pages.length) &&
      new Set(numbered.map((marker) => marker.index)).size === pages.length
    );
  }
  const count = boundaries.filter((boundary) => boundary.continued).length;
  return (
    (pages.length === 1 && count === 0) || (pages.length === 2 && count === 1)
  );
}

function numberIdentity(numbers: Field[]): string {
  if (numbers.some((field) => field.confidence < CONFIDENCE)) return '';
  const values = highValues(numbers, numberKey);
  return values.length === 1 ? values[0] : '';
}

export function analyzePages(
  pages: ScanPage[],
  invoices: InvoiceCandidate[],
): SlipProposal[] {
  const index = candidateIndex(invoices);
  const entries = [...pages]
    .sort((a, b) => a.page - b.page)
    .map((page) => {
      const evidence = extract([page]);
      return {
        page,
        ...pageBoundary(page),
        identity: evidence.documentOk ? numberIdentity(evidence.numbers) : '',
      };
    });
  type Entry = (typeof entries)[number];
  const additions = new Map<Entry, Entry[]>();
  const candidateHeads = new Set<Entry>();
  for (const tail of entries) {
    if (
      !tail.identity ||
      tail.uncertain ||
      !(tail.marker ? tail.marker.index > 1 : tail.continued)
    )
      continue;
    const heads = entries.filter(
      (head) =>
        !head.uncertain &&
        !head.continued &&
        head.identity === tail.identity &&
        (tail.marker
          ? head.marker?.index === 1 && head.marker.total === tail.marker.total
          : !head.marker),
    );
    heads.forEach((head) => candidateHeads.add(head));
    if (heads.length === 1)
      additions.set(heads[0], [...(additions.get(heads[0]) || []), tail]);
  }
  const groups = new Map<Entry, SlipProposal>();
  const assigned = new Set<Entry>();
  for (const [head, tails] of additions) {
    const members = [head, ...tails]
      .map((entry) => entry.page)
      .sort((a, b) => a.page - b.page);
    if (!completeBoundary(members)) continue;
    const result = match(members, invoices, index);
    if (!result.verified) continue;
    groups.set(head, { pages: members.map((page) => page.page), result });
    tails.forEach((tail) => assigned.add(tail));
  }
  return entries.flatMap((entry) => {
    if (assigned.has(entry)) return [];
    const group = groups.get(entry);
    if (group) return [group];
    let result = match([entry.page], invoices, index);
    if (result.verified && candidateHeads.has(entry)) {
      result = {
        verified: false,
        route: 'review',
        candidates: result.candidates,
        reasons: [
          'Page sequence is incomplete or ambiguous. Verify all continuation pages.',
        ],
      };
    }
    return [{ pages: [entry.page.page], result }];
  });
}
