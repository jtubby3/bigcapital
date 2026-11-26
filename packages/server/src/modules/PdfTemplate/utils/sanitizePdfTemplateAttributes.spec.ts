import { sanitizePdfTemplateAttributes } from './sanitizePdfTemplateAttributes';

describe('sanitizePdfTemplateAttributes', () => {
  it('preserves plain invoice text and labels without double encoding special characters', () => {
    const attributes = {
      invoiceTitle: 'Paper & Packaging',
      billToAddressFormat: 'Accounts & Billing\n{ADDRESS_1}',
      shipToAddressFormat: 'Delivery <office>\n{CITY}',
      headerText: 'Orders < 10 cases',
      footerText: 'Thank you & see you soon',
      lineItemLabel: 'Products & supplies',
    };
    expect(sanitizePdfTemplateAttributes(attributes)).toEqual(attributes);
    expect(
      sanitizePdfTemplateAttributes(sanitizePdfTemplateAttributes(attributes)),
    ).toEqual(attributes);
  });

  it('continues sanitizing fields that can be rendered as HTML', () => {
    const result = sanitizePdfTemplateAttributes({
      companyAddress:
        '<strong>Paper & Packaging</strong><script>alert(1)</script><img src=x onerror=alert(1)>',
    });
    expect(result.companyAddress).toContain('<strong>');
    expect(result.companyAddress).not.toMatch(/script|onerror|<img/);
  });

  it('keeps structured layout and column configuration intact', () => {
    const attributes = {
      sectionLayout: [{ id: 'items', column: 1, row: 3, width: 12 }],
      lineColumns: ['quantity', 'item', 'total'],
      documentFontSize: 14,
    };
    expect(sanitizePdfTemplateAttributes(attributes)).toEqual(attributes);
  });
});
