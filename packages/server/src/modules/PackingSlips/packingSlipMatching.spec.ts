import { analyzePages, matchSlip } from './packingSlipMatching';
import { InvoiceCandidate, ScanPage } from './packingSlip.types';

const invoice = (
  overrides: Partial<InvoiceCandidate> = {},
): InvoiceCandidate => ({
  id: 1,
  invoiceNo: 'INV-00017/A',
  customerId: 10,
  customerName: 'Orchard Market',
  shippingAddress: '18 Apple Road Albany NY 12201',
  referenceNo: 'PO-82719',
  trackingNo: '',
  shippingDate: '2026-11-12',
  invoiceDate: '2026-11-10',
  eligible: true,
  entries: [
    {
      code: 'APL-RED',
      name: 'Red apples',
      description: '',
      quantity: 12,
      unit: 'case',
    },
    {
      code: 'PEAR-GRN',
      name: 'Green pears',
      description: '',
      quantity: 4,
      unit: 'case',
    },
  ],
  ...overrides,
});
const page = (texts: string[], number = 1, confidence = 0.99): ScanPage => ({
  page: number,
  lines: texts.map((text, i) => ({
    text,
    confidence,
    x: 0.05,
    y: 0.03 + i * 0.055,
    width: 0.8,
    height: 0.025,
  })),
});
const primary = (no = 'INV-00017/A', name = 'Orchard Market', number = 1) =>
  page(['PACKING SLIP', `Invoice No: ${no}`, `Customer: ${name}`], number);
const fallback = (extra: string[] = [], number = 1) =>
  page(
    [
      'PACKING SLIP',
      'Customer: Orchard Market',
      'Ship to: 18 Apple Road Albany NY 12201',
      'PO: PO-82719',
      'APL-RED 6 case',
      ...extra,
    ],
    number,
  );
const review = (
  p: ScanPage[],
  candidates: InvoiceCandidate[] = [invoice()],
) => {
  const result = matchSlip(p, candidates);
  expect(result.verified).toBe(false);
  expect(result.route).toBe('review');
  expect(result.invoiceId).toBeUndefined();
  expect(result.reasons.length).toBeGreaterThan(0);
  return result;
};

describe('packing slip identity', () => {
  test('matches a labeled exact number and distinctive customer', () => {
    expect(matchSlip([primary()], [invoice()])).toMatchObject({
      invoiceId: 1,
      verified: true,
      route: 'invoice-number',
    });
  });
  test.each(['INV-17/A', 'INV00017/A', 'INV-00017-A', 'INV-OOO17/A'])(
    'preserves zeros, punctuation and confusables: %s',
    (no) => {
      review([primary(no)]);
    },
  );
  test('case and harmless whitespace normalize without collapsing records', () => {
    expect(matchSlip([primary('inv-00017/a')], [invoice()]).verified).toBe(
      true,
    );
    review(
      [primary()],
      [invoice(), invoice({ id: 2, invoiceNo: 'inv-00017/a' })],
    );
  });
  test('requires customer corroboration and rejects drafts', () => {
    review([page(['PACKING SLIP', 'Invoice No: INV-00017/A'])]);
    review([primary()], [invoice({ eligible: false })]);
  });
  test('recognizes invoice value in aligned next row without taking another column', () => {
    const p = primary();
    p.lines = [
      p.lines[0],
      { ...p.lines[1], text: 'Invoice No:', width: 0.25 },
      { ...p.lines[1], text: 'Date: 2026-11-12', x: 0.6, width: 0.35 },
      { ...p.lines[1], text: 'INV-00017/A', y: 0.12, width: 0.25 },
      { ...p.lines[2], y: 0.18 },
    ];
    expect(matchSlip([p], [invoice()]).verified).toBe(true);
  });
  test('rejects conflicting explicit customer even when address matches', () => {
    review([
      page([
        'PACKING SLIP',
        'Invoice No: INV-00017/A',
        'Customer: Ocean Bakery',
        'Ship to: 18 Apple Road Albany NY 12201',
      ]),
    ]);
  });
  test('blocks fallback when printed number resolves to another existing invoice', () => {
    review(
      [fallback(['Invoice No: INV-222'])],
      [
        invoice(),
        invoice({
          id: 2,
          invoiceNo: 'INV-222',
          customerId: 20,
          customerName: 'Ocean Bakery',
        }),
      ],
    );
  });
  test('multiple printed numbers never establish one invoice', () => {
    review(
      [primary(), primary('INV-222', 'Orchard Market', 2)],
      [invoice(), invoice({ id: 2, invoiceNo: 'INV-222' })],
    );
  });
  test('rejects conflicting customers across pages', () => {
    review([primary(), primary('INV-00017/A', 'Ocean Bakery', 2)], [invoice()]);
  });
  test('distinctive unique shipping address can corroborate an exact number', () => {
    expect(
      matchSlip(
        [
          page([
            'PACKING SLIP',
            'Invoice No: INV-00017/A',
            'Ship to: 18 Apple Road Albany NY 12201',
          ]),
        ],
        [invoice()],
      ).verified,
    ).toBe(true);
  });
  test('shared address and generic customer names cannot corroborate identity', () => {
    const p = page([
      'PACKING SLIP',
      'Invoice No: INV-00017/A',
      'Ship to: 18 Apple Road Albany NY 12201',
    ]);
    review(
      [p],
      [
        invoice(),
        invoice({
          id: 2,
          customerId: 20,
          invoiceNo: 'INV-222',
          customerName: 'Ocean Bakery',
        }),
      ],
    );
    review(
      [primary('INV-00017/A', 'Store')],
      [invoice({ customerName: 'Store' })],
    );
  });
  test('low confidence identity does not authorize linking', () => {
    review([
      page(
        ['PACKING SLIP', 'Invoice No: INV-00017/A', 'Customer: Orchard Market'],
        1,
        0.5,
      ),
    ]);
    const p = primary();
    p.lines[1].confidence = 0.5;
    review([p]);
  });
  test.each(['INVOICE', 'PURCHASE ORDER', 'DELIVERY RECEIPT'])(
    'does not attach unrelated %s documents',
    (title) => {
      review([
        page([title, 'Invoice No: INV-00017/A', 'Customer: Orchard Market']),
      ]);
    },
  );
  test('invoice title conflicts with packing slip title', () => {
    review([
      page([
        'PACKING SLIP',
        'INVOICE',
        'Invoice No: INV-00017/A',
        'Customer: Orchard Market',
      ]),
    ]);
  });
  test('bounds review candidates and keeps auditable exclusions', () => {
    const result = review(
      [page(['PACKING SLIP', 'Customer: Orchard Market'])],
      Array.from({ length: 14 }, (_, i) =>
        invoice({ id: i + 1, invoiceNo: `INV-${i}` }),
      ),
    );
    expect(result.candidates.length).toBeLessThanOrEqual(10);
    expect(result.candidates.every((c) => c.reasons.length > 0)).toBe(true);
  });
});

describe('fallback verification', () => {
  test('unique PO, customer, address and equivalent partial quantities establish reference route', () => {
    expect(matchSlip([fallback()], [invoice()])).toMatchObject({
      invoiceId: 1,
      verified: true,
      route: 'reference',
    });
  });
  test('unknown printed number may use independently verified reference route', () => {
    expect(
      matchSlip([fallback(['Invoice No: MISSING-98'])], [invoice()]).route,
    ).toBe('reference');
  });
  test('exact distinctive tracking reference also establishes reference route', () => {
    const p = fallback();
    p.lines[3].text = 'Tracking: TRACK-887712';
    expect(
      matchSlip([p], [invoice({ referenceNo: '', trackingNo: 'TRACK-887712' })])
        .route,
    ).toBe('reference');
  });
  test('reused PO cannot be rescued by quantities or delivery date', () => {
    review(
      [fallback(['Delivery date: 2026-11-12', 'PEAR-GRN 4 case'])],
      [
        invoice(),
        invoice({
          id: 2,
          invoiceNo: 'INV-222',
          entries: [
            {
              code: 'OTHER',
              name: 'Other',
              description: '',
              quantity: 5,
              unit: 'case',
            },
          ],
        }),
      ],
    );
  });
  test('requires identity, address, distinctive reference and line evidence', () => {
    for (const index of [1, 2, 3, 4]) {
      const p = fallback();
      p.lines.splice(index, 1);
      review([p]);
    }
    review([fallback()], [invoice({ referenceNo: 'PO' })]);
  });
  test.each([
    'APL-RED 13 case',
    'APL-RED 6 piece',
    'APL-RED 6',
    'APL-RED six case',
    'APL-RED 0 case',
    'Unknown item 6 case',
  ])('rejects unsafe partial delivery line: %s', (line) => {
    const p = fallback();
    p.lines[4].text = line;
    review([p]);
  });
  test('matches explicit item, quantity, unit table columns spatially', () => {
    const p = fallback();
    p.lines[4].text = 'Item';
    p.lines.push(
      { ...p.lines[4], text: 'Quantity', x: 0.6, width: 0.15 },
      { ...p.lines[4], text: 'Unit', x: 0.8, width: 0.1 },
      { ...p.lines[4], text: 'APL-RED', y: 0.32, width: 0.3 },
      { ...p.lines[4], text: '6', x: 0.6, y: 0.32, width: 0.1 },
      { ...p.lines[4], text: 'case', x: 0.8, y: 0.32, width: 0.1 },
    );
    expect(matchSlip([p], [invoice()]).route).toBe('reference');
  });
  test('low-confidence quantity cannot verify fallback', () => {
    const p = fallback();
    p.lines[4].confidence = 0.5;
    review([p]);
  });
  const contents = () =>
    page([
      'PACKING SLIP',
      'Customer: Orchard Market',
      'Ship to: 18 Apple Road Albany NY 12201',
      'Delivery date: 2026-11-12',
      'APL-RED 12 case',
      'PEAR-GRN 4 case',
    ]);
  test('complete distinct multi-item quantities plus explicit same delivery date establish contents route', () => {
    expect(matchSlip([contents()], [invoice()])).toMatchObject({
      invoiceId: 1,
      verified: true,
      route: 'contents',
    });
  });
  test('identical orders on same date require review', () => {
    review([contents()], [invoice(), invoice({ id: 2, invoiceNo: 'INV-222' })]);
  });
  test('contents route cannot accept partial, single-item or invoice-date proximity', () => {
    const partial = contents();
    partial.lines[4].text = 'APL-RED 6 case';
    review([partial]);
    const single = contents();
    single.lines.pop();
    review([single], [invoice({ entries: [invoice().entries[0]] })]);
    const wrongDate = contents();
    wrongDate.lines[3].text = 'Invoice date: 2026-11-12';
    review([wrongDate]);
  });
  test('conflicting date or address blocks fallback', () => {
    review([fallback(['Delivery date: 2026-11-13'])]);
    const p = fallback();
    p.lines[2].text = 'Ship to: 19 Apple Road Albany NY 12201';
    review([p]);
  });
  test('unknown or conflicting extra items prevent fallback', () => {
    review([fallback(['MYSTERY 4 case'])]);
    review([fallback(['MYSTERY 4 box'])]);
    review([fallback(['PEAR-GRN 99 case'])]);
  });
  test('changed stored line and reference evidence revokes fallback', () => {
    review(
      [fallback()],
      [invoice({ entries: [{ ...invoice().entries[0], quantity: 2 }] })],
    );
    review([fallback()], [invoice({ referenceNo: 'PO-NEW' })]);
  });
});

describe('accountable conservative page grouping', () => {
  test('groups verified numbered continuation and preserves source page order', () => {
    const one = primary();
    one.lines.push({ ...one.lines[0], y: 0.8, text: 'Page 1 of 2' });
    const two = primary('INV-00017/A', 'Orchard Market', 2);
    two.lines.push({ ...two.lines[0], y: 0.8, text: 'Page 2 of 2' });
    expect(analyzePages([two, one], [invoice()]).map((p) => p.pages)).toEqual([
      [1, 2],
    ]);
  });
  test('accepts explicit aligned continuation with matching number without repeated customer', () => {
    const one = primary();
    one.lines.push({ ...one.lines[0], y: 0.8, text: 'Page 1 of 2' });
    const two = page(
      ['PACKING SLIP - CONTINUED', 'Invoice No: INV-00017/A', 'Page 2 of 2'],
      2,
    );
    expect(analyzePages([one, two], [invoice()])).toMatchObject([
      { pages: [1, 2], result: { verified: true, invoiceId: 1 } },
    ]);
  });
  test('does not join repeated complete single page slips for same invoice', () => {
    expect(
      analyzePages(
        [primary(), primary('INV-00017/A', 'Orchard Market', 2)],
        [invoice()],
      ).map((p) => p.pages),
    ).toEqual([[1], [2]]);
  });
  test('page 1 restarts and mixed customers stay separate', () => {
    const first = primary();
    first.lines.push({ ...first.lines[0], y: 0.8, text: 'Page 1 of 1' });
    const repeat = primary('INV-00017/A', 'Orchard Market', 2);
    repeat.lines.push({ ...repeat.lines[0], y: 0.8, text: 'Page 1 of 1' });
    expect(
      analyzePages([first, repeat], [invoice()]).map((p) => p.pages),
    ).toEqual([[1], [2]]);
    const other = invoice({
      id: 2,
      invoiceNo: 'INV-222',
      customerId: 20,
      customerName: 'Ocean Bakery',
    });
    expect(
      analyzePages(
        [primary(), primary('INV-222', 'Ocean Bakery', 2)],
        [invoice(), other],
      ).map((p) => p.pages),
    ).toEqual([[1], [2]]);
  });
  test('unreadable, blank and ambiguous continuation pages remain review once each', () => {
    const result = analyzePages(
      [
        primary(),
        page([], 2),
        page(['Continued', 'Page 2 of 2'], 3),
        page(['???'], 4, 0.2),
      ],
      [invoice()],
    );
    expect(result.map((p) => p.pages)).toEqual([[1], [2], [3], [4]]);
    expect(result.slice(1).every((p) => !p.result.verified)).toBe(true);
  });
  test('unidentified continuation never chooses between two possible slips', () => {
    const one = primary();
    one.lines.push({ ...one.lines[0], y: 0.8, text: 'Page 1 of 2' });
    const other = primary('INV-00017/A', 'Orchard Market', 2);
    other.lines.push({ ...other.lines[0], y: 0.8, text: 'Page 1 of 2' });
    const tail = page(['PACKING SLIP CONTINUED', 'Page 2 of 2'], 3);
    const result = analyzePages([one, other, tail], [invoice()]);
    expect(result.map((p) => p.pages)).toEqual([[1], [2], [3]]);
    expect(result[2].result.verified).toBe(false);
  });
  test('conflicting continuation cannot join a verified head', () => {
    const one = primary();
    one.lines.push({ ...one.lines[0], y: 0.8, text: 'Page 1 of 2' });
    const two = primary('INV-00017/A', 'Ocean Bakery', 2);
    two.lines.push({ ...two.lines[0], y: 0.8, text: 'Page 2 of 2' });
    expect(analyzePages([one, two], [invoice()]).map((p) => p.pages)).toEqual([
      [1],
      [2],
    ]);
  });
});

describe('adversarial evidence and boundary conflicts', () => {
  test('uncertain explicit identity fields keep an otherwise strong match in review', () => {
    const p = primary();
    p.lines.push({
      ...p.lines[0],
      y: 0.5,
      text: 'Customer: Ocean Bakery',
      confidence: 0.5,
    });
    review([p]);
  });
  test('a different recipient on ship-to is a customer conflict', () => {
    review([
      page([
        'PACKING SLIP',
        'Invoice No: INV-00017/A',
        'Customer: Orchard Market',
        'Ship to: Ocean Bakery',
      ]),
    ]);
  });
  test('a conflicting billed recipient blocks linking even without a tenant candidate for that recipient', () => {
    const slip = page([
      'PACKING SLIP',
      'Invoice No: INV-00017/A',
      'Billed To',
      'Ocean Bakery',
      '10 Billing Lane',
      'Ship To: 18 Apple Road Albany NY 12201',
    ]);
    const result = review([slip]);
    expect(result.candidates[0].reasons).toContain('Customer conflicts.');
  });
  test('billing blocks with only a street address or PO box leave delivery corroboration available', () => {
    for (const billingAddress of ['10 Billing Lane', 'P.O. Box 827']) {
      const slip = page([
        'PACKING SLIP',
        'Invoice No: INV-00017/A',
        'Billed To',
        billingAddress,
        'Albany NY 12201',
        'Ship To: 18 Apple Road Albany NY 12201',
      ]);
      expect(matchSlip([slip], [invoice()])).toMatchObject({
        verified: true,
        invoiceId: 1,
        route: 'invoice-number',
      });
    }
  });
  test('confident contradictory products or quantities block even an exact number', () => {
    review([
      page([
        'PACKING SLIP',
        'Invoice No: INV-00017/A',
        'Customer: Orchard Market',
        'APL-RED 50 case',
      ]),
    ]);
    review([
      page([
        'PACKING SLIP',
        'Invoice No: INV-00017/A',
        'Customer: Orchard Market',
        'BANANA 4 case',
      ]),
    ]);
  });
  test('unrecognized item rows cannot disappear from fallback verification', () => {
    review([fallback(['MYSTERY unreadable case'])]);
    review([fallback(['PEAR-GRN ??? case'])]);
  });
  test('ambiguous invoice item identities cannot establish quantity verification', () => {
    review(
      [fallback()],
      [
        invoice({
          entries: [
            invoice().entries[0],
            { ...invoice().entries[0], quantity: 3 },
          ],
        }),
      ],
    );
  });
  test('a code is not repaired or matched by punctuation-insensitive fuzzy text', () => {
    const p = fallback();
    p.lines[4].text = 'APLRED 6 case';
    review([p]);
  });
  test('unmatched explicit continued page needs boundary review even with verified identity', () => {
    const tail = primary();
    tail.lines[0].text = 'PACKING SLIP CONTINUED';
    expect(analyzePages([tail], [invoice()])[0].result.verified).toBe(false);
  });
  test('duplicate or low-confidence page numbering never makes an apparently complete single page', () => {
    for (const confidence of [0.5, 0.99]) {
      const p = primary();
      p.lines.push({ ...p.lines[0], y: 0.7, text: 'Page 1 of 2', confidence });
      if (confidence === 0.99)
        p.lines.push({
          ...p.lines[0],
          y: 0.8,
          text: 'Page 2 of 3',
          confidence,
        });
      expect(analyzePages([p], [invoice()])[0].result.verified).toBe(false);
    }
  });
  test.each([
    'Page I of 2',
    'Page ? / 2',
    'Page 1 0f 2',
    'Page 1 of 1.5',
    'Page 2',
    'Page 1 of 1 Page I of 2',
  ])('keeps recognizable but malformed pagination in review: %s', (text) => {
    const slip = primary();
    slip.lines.push({ ...slip.lines[0], y: 0.8, text });
    expect(review([slip]).reasons.join(' ')).toContain('Page sequence');
    expect(analyzePages([slip], [invoice()])).toMatchObject([
      { pages: [1], result: { verified: false, route: 'review' } },
    ]);
  });
  test('two tails with the same printed page number cannot be arbitrarily assigned', () => {
    const one = primary();
    one.lines.push({ ...one.lines[0], y: 0.8, text: 'Page 1 of 2' });
    const two = primary('INV-00017/A', 'Orchard Market', 2);
    two.lines.push({ ...two.lines[0], y: 0.8, text: 'Page 2 of 2' });
    const three = primary('INV-00017/A', 'Orchard Market', 3);
    three.lines.push({ ...three.lines[0], y: 0.8, text: 'Page 2 of 2' });
    expect(
      analyzePages([one, two, three], [invoice()]).every(
        (p) => !p.result.verified,
      ),
    ).toBe(true);
  });
  test('each input page remains represented once in a shuffled mixed batch', () => {
    const pages = [
      page([], 8),
      primary('INV-00017/A', 'Orchard Market', 2),
      page(['Invoice'], 5),
      primary(),
      page(['???'], 4, 0.1),
    ];
    expect(
      analyzePages(pages, [invoice()]).flatMap((proposal) => proposal.pages),
    ).toEqual([1, 2, 4, 5, 8]);
  });
});

describe('Bigcapital template layouts', () => {
  const spatial = (fields: [string, number, number, number][]) => ({
    page: 1,
    lines: fields
      .map(([text, x, y, width]) => ({
        text,
        x,
        y,
        width,
        height: 0.014,
        confidence: 0.99,
      }))
      .reverse(),
  });

  test('reads the split invoice number and multi-line Ship To block among separate columns', () => {
    const slip = spatial([
      ['Packing Slip', 0.06, 0.04, 0.19],
      ['Billed To', 0.06, 0.16, 0.07],
      ['Ship To', 0.35, 0.16, 0.05],
      ['Invoice number', 0.67, 0.16, 0.1],
      ['INV-00017/A', 0.79, 0.16, 0.11],
      ['Accounts Payable', 0.06, 0.18, 0.14],
      ['Orchard Market', 0.35, 0.18, 0.1],
      ['Date', 0.73, 0.18, 0.04],
      ['11/10/2026', 0.79, 0.18, 0.08],
      ['10 Billing Lane', 0.06, 0.2, 0.13],
      ['18 Apple Road', 0.35, 0.2, 0.1],
      ['Albany, NY 12201', 0.35, 0.22, 0.11],
      ['Item', 0.06, 0.3, 0.04],
      ['Quantity', 0.76, 0.3, 0.09],
      ['Red apples', 0.06, 0.33, 0.08],
      ['6', 0.78, 0.33, 0.01],
    ]);
    expect(matchSlip([slip], [invoice()])).toMatchObject({
      verified: true,
      invoiceId: 1,
      route: 'invoice-number',
    });
  });

  test('does not use a different column to corroborate a customer or discard a wrong printed number', () => {
    const slip = spatial([
      ['Packing Slip', 0.06, 0.04, 0.19],
      ['Customer: Orchard Market', 0.06, 0.09, 0.21],
      ['Ship To: 18 Apple Road Albany NY 12201', 0.06, 0.13, 0.33],
      ['Customer PO: PO-82719', 0.06, 0.18, 0.17],
      ['Invoice number', 0.67, 0.2, 0.1],
      ['INV-222', 0.79, 0.2, 0.06],
      ['APL-RED', 0.06, 0.26, 0.08],
      ['6 case', 0.76, 0.26, 0.09],
    ]);
    expect(matchSlip([slip], [invoice()]).route).toBe('reference');
    const result = review(
      [slip],
      [
        invoice(),
        invoice({
          id: 2,
          invoiceNo: 'INV-222',
          customerId: 20,
          customerName: 'Ocean Bakery',
        }),
      ],
    );
    expect(result.reasons.join(' ')).toContain('fallback is blocked');
  });

  test('reads the template reference field and a US-formatted explicit delivery date', () => {
    const slip = fallback();
    slip.lines[3].text = 'Customer PO / reference: PO-82719';
    expect(matchSlip([slip], [invoice()]).route).toBe('reference');
    slip.lines[3].text = 'Ship date: 11/12/2026';
    slip.lines[4].text = 'APL-RED 12 case';
    slip.lines.push({ ...slip.lines[4], y: 0.36, text: 'PEAR-GRN 4 case' });
    expect(matchSlip([slip], [invoice()]).route).toBe('contents');
  });

  test('quantity-only template rows cannot prove fallback when no unit is printed', () => {
    const slip = fallback();
    slip.lines[4].text = 'APL-RED 6';
    review([slip]);
    slip.lines.push({
      ...slip.lines[4],
      y: 0.36,
      text: 'Invoice number INV-00017/A',
    });
    expect(matchSlip([slip], [invoice()]).route).toBe('invoice-number');
  });

  test('a repeated packing slip title in footer prose cannot classify an invoice', () => {
    review([
      page([
        'INVOICE # INV-00017/A',
        'Customer: Orchard Market',
        'Please include this packing slip with your return.',
      ]),
    ]);
  });

  test('direct verification requires complete pagination and rejects multiple complete slips', () => {
    review([
      page([
        'PACKING SLIP CONTINUED',
        'Invoice No: INV-00017/A',
        'Customer: Orchard Market',
      ]),
    ]);
    review([
      page([
        'PACKING SLIP',
        'Invoice No: INV-00017/A',
        'Customer: Orchard Market',
        'Page 1 of 2',
      ]),
    ]);
    review([primary(), primary('INV-00017/A', 'Orchard Market', 2)]);
  });

  test('recognizes the standard template with a billing name, invoice-specific shipping snapshot and printed month', () => {
    const slip = spatial([
      ['Packing Slip', 0.04, 0.032, 0.198],
      ['Customer PO / reference', 0.037, 0.116, 0.162],
      ['PO-82719', 0.216, 0.116, 0.113],
      ['Shipping date 12 Nov 2026', 0.037, 0.157, 0.24],
      ['Tracking no.', 0.037, 0.178, 0.079],
      ['TRACK-887712', 0.199, 0.178, 0.142],
      ['Invoice number', 0.038, 0.199, 0.099],
      ['INV-00017/A', 0.2, 0.199, 0.067],
      ['Date of Issue 11 Nov 2026', 0.038, 0.22, 0.24],
      ['Billed To', 0.511, 0.273, 0.059],
      ['Orchard Market', 0.51, 0.293, 0.153],
      ['Ship To', 0.668, 0.356, 0.052],
      ['RECEIVING DESK', 0.668, 0.377, 0.16],
      ['18 Apple Road Albany NY 12201', 0.668, 0.397, 0.19],
      ['Item', 0.038, 0.425, 0.026],
      ['Qty', 0.941, 0.424, 0.022],
      ['Red apples', 0.038, 0.456, 0.173],
      ['0.50', 0.935, 0.457, 0.027],
    ]);
    const candidate = invoice({
      shippingAddress: 'RECEIVING DESK\n18 Apple Road Albany NY 12201',
      trackingNo: 'TRACK-887712',
    });
    const result = matchSlip([slip], [candidate]);
    expect(result).toMatchObject({
      verified: true,
      invoiceId: 1,
      route: 'invoice-number',
    });
    expect(result.reasons).toContain('Explicit delivery date matched.');
  });

  test('rejects an explicitly labeled different customer in split OCR cells', () => {
    const slip = spatial([
      ['Packing Slip', 0.04, 0.032, 0.198],
      ['Invoice number', 0.038, 0.199, 0.099],
      ['INV-00017/A', 0.2, 0.199, 0.067],
      ['Customer name', 0.038, 0.24, 0.1],
      ['Ocean Bakery', 0.2, 0.24, 0.09],
      ['Ship To: 18 Apple Road Albany NY 12201', 0.04, 0.3, 0.3],
    ]);
    review([slip]);
  });

  test('direct verification requires the same confident labeled invoice number on every continuation', () => {
    const one = page([
      'PACKING SLIP',
      'Invoice No: INV-00017/A',
      'Customer: Orchard Market',
      'Page 1 of 2',
    ]);
    review([one, page(['PACKING SLIP CONTINUED', 'Page 2 of 2'], 2)]);
    const tail = page(
      ['PACKING SLIP CONTINUED', 'Invoice No: INV-00017/A', 'Page 2 of 2'],
      2,
    );
    tail.lines[1].confidence = 0.5;
    review([one, tail]);
  });
});
