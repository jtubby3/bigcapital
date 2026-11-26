import { parseVendorInvoice, pjpMatches } from './vendorInvoiceParser';

const cell = (text: string, x: number, y: number, width = .035) =>
  ({ text, x, y, width, height: .01, confidence: 1 });

function invoice(number = '00001234') {
  return {
    page: 1,
    lines: [
      cell('Penn Jersey Paper Co.', .2, .08, .179),
      cell('DATE', .05, .2, .04),
      cell('INVOICE NO. ROUTE STOP', .75, .2, .2),
      cell('11-4-2026', .04, .23, .07),
      cell('SO-123 ' + number, .65, .23, .16),
      cell('PAYMENT DUE', .03, .32, .10),
      cell('12-4-2026', .04, .35, .07),
      cell('ITEM NO.', .025, .416), cell('DESCRIPTION', .23, .416),
      cell('UM DESC', .384, .416), cell('UM', .468, .416),
      cell('ORDERED', .529, .416), cell('SHIPPED', .616, .416),
      cell('UNIT PRICE', .78, .416), cell('EXTENDED', .883, .416),
      cell('035540', .031, .48), cell('Cups', .20, .48),
      cell('25/100', .39, .48), cell('CS', .468, .48),
      cell('8', .554, .48), cell('2', .632, .48),
      cell('$63.40', .777, .48), cell('$126.80', .877, .48),
      cell('Other product', .20, .52),
      cell('INP', .468, .52), cell('7', .554, .52),
      cell('$11.20', .777, .52), cell('$33.60', .877, .52),
      cell('MERCHANDISE TOTAL', .588, .73), cell('$160.40', .872, .73),
      cell('DELIVERY FEE', .649, .78), cell('$10.75', .897, .78),
      cell('TAXES', .712, .81), cell('$0.00', .903, .81),
      cell('INVOICE TOTAL', .641, .85), cell('$171.15', .872, .85),
    ],
  };
}

describe('vendor invoice extraction', () => {
  it('keeps leading zeroes, reads shipped rather than ordered, and identifies freight separately', () => {
    const scan = parseVendorInvoice([invoice()]);
    expect(scan).toMatchObject({
      vendorName: 'Penn Jersey Paper Co.',
      invoiceNumber: '00001234',
      billDate: '2026-11-04',
      dueDate: '2026-12-04',
      total: '171.15',
      shipping: '10.75',
      tax: '0.00',
    });
    expect(scan.lines).toHaveLength(2);
    expect(scan.lines[0]).toMatchObject({
      code: '035540', shipped: '2', unitPrice: '63.40', amount: '126.80',
      billingUnit: 'CS', pack: '25/100',
    });
    expect(scan.lines[1]).toMatchObject({
      code: '', shipped: '3', billingUnit: 'INP', attention: expect.stringMatching(/shipped.*calculated/i),
    });
  });

  it('preserves a conflicting shipped quantity for review rather than correcting it silently', () => {
    const page = invoice();
    page.lines.find((line) => line.text === '2')!.text = '4';
    expect(parseVendorInvoice([page]).lines[0]).toMatchObject({
      shipped: '4', attention: expect.stringContaining('does not match'),
    });
  });

  it('flags a page group carrying conflicting invoice numbers', () => {
    const scan = parseVendorInvoice([invoice(), { ...invoice('00005678'), page: 2 }]);
    expect(scan.invoiceNumber).toBe('');
    expect(scan.blocked).toBe(true);
    expect(scan.warnings.some((warning) => /multiple invoice numbers/i.test(warning))).toBe(true);
  });

  it('does not read the invoice number below continuation headers as a product price', () => {
    const page = invoice();
    page.lines.push(cell('2 of 3', .50, .446), cell('00001234', .864, .446));
    expect(parseVendorInvoice([page]).lines).toHaveLength(2);
  });

  it('recovers a wrapped vendor code and a missing shipped cell from the PDF text layer', () => {
    const page = invoice();
    const scan = parseVendorInvoice([{
      ...page,
      textLines: [
        cell('ABCD5', .035, .522), cell('678EFG', .035, .532), cell('H', .035, .542),
        cell('3', .634, .522),
      ],
    }]);
    expect(scan.lines[1]).toMatchObject({ code: 'ABCD5678EFGH', shipped: '3' });
    expect(scan.lines[1].attention).toMatch(/check.*original/i);
  });

  it('leaves unknown input editable without guessing ordered or item values', () => {
    const scan = parseVendorInvoice([{ page: 1, lines: [cell('Ordered: 8', .1, .2)] }]);
    expect(scan.lines).toEqual([]);
    expect(scan.warnings).not.toEqual([]);
    expect(scan.total).toBe('');
  });

  it('seeds only the confirmed identities and requires review of all deferred conversions', () => {
    expect(Object.keys(pjpMatches)).toHaveLength(23);
    expect(pjpMatches['112407']).toBeUndefined();
    expect(pjpMatches['013803']).toMatchObject({ name: 'PF18"x2000FT', needsConversion: true });
    expect(pjpMatches['VBUB6704BINP']).toMatchObject({ name: 'Urinal Screen', needsConversion: true });
    expect(pjpMatches['173219']).toMatchObject({ name: 'Coffee Stirrer', needsConversion: true });
  });
});
