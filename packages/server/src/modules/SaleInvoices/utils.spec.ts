import { invoiceCustomizationDefaults } from '@bigcapital/pdf-templates';
import { SaleInvoiceResponseDto } from './dtos/SaleInvoiceResponse.dto';
import {
  mergePdfTemplateWithDefaultAttributes,
  transformInvoiceToPdfTemplate,
} from './utils';

describe('custom invoice PDF attributes', () => {
  it('keeps the new saved design attributes and ignores unsupported attributes', () => {
    const merged = mergePdfTemplateWithDefaultAttributes(
      {
        invoiceTitle: 'Paper Goods Invoice',
        layoutMode: 'designer',
        pageSize: 'letter',
        sectionLayout: [{ id: 'header', column: 1, row: 2, width: 12 }],
        lineColumns: ['total', 'item', 'quantity', 'rate', 'discount'],
        footerText: 'Thank you',
        showTotalQuantity: true,
        totalQuantityLabel: 'Total Packages',
        unsafeProperty: 'ignored',
      },
      invoiceCustomizationDefaults,
    );
    expect(merged).toMatchObject({
      invoiceTitle: 'Paper Goods Invoice',
      layoutMode: 'designer',
      pageSize: 'letter',
      sectionLayout: [{ id: 'header', column: 1, row: 2, width: 12 }],
      lineColumns: ['total', 'item', 'quantity', 'rate', 'discount'],
      footerText: 'Thank you',
      showTotalQuantity: true,
      totalQuantityLabel: 'Total Packages',
    });
    expect(merged).not.toHaveProperty('unsafeProperty');
  });

  it('keeps legacy defaults when a template omits new settings or supplies null', () => {
    const merged = mergePdfTemplateWithDefaultAttributes(
      { pageSize: null, invoiceTitle: 'Custom invoice' },
      invoiceCustomizationDefaults,
    );
    expect(merged.pageSize).toBe('a4');
    expect(merged.layoutMode).toBe('standard');
    expect(merged.showTotalQuantity).toBe(false);
    expect(merged.totalQuantityLabel).toBe('Total quantity');
    expect(merged.invoiceTitle).toBe('Custom invoice');
  });

  it('uses invoice values for amounts and discounts while keeping a custom discount label', () => {
    const invoice = {
      invoiceNo: 'INV-42',
      invoiceDateFormatted: '11/08/2026',
      dueDateFormatted: '12/08/2026',
      totalFormatted: '$90.00',
      subtotalFormatted: '$100.00',
      paymentAmountFormatted: '$20.00',
      dueAmountFormatted: '$70.00',
      discountAmountFormatted: '$10.00',
      discountPercentageFormatted: '10%',
      termsConditions: 'Net 30',
      invoiceMessage: 'Thank you',
      customer: { displayName: 'Maple Market' },
      entries: [
        {
          item: { name: 'Paper towels' },
          description: 'Case of 12',
          rateFormatted: '$25.00',
          quantityFormatted: '4',
          quantity: 4,
          totalFormatted: '$90.00',
          discountFormatted: '$10.00',
        },
      ],
      taxes: [],
    } as unknown as SaleInvoiceResponseDto;
    expect(
      transformInvoiceToPdfTemplate(invoice, 'Trade discount'),
    ).toMatchObject({
      invoiceNumber: 'INV-42',
      total: '$90.00',
      dueAmount: '$70.00',
      discountLabel: 'Trade discount [10%]',
      lines: [
        {
          item: 'Paper towels',
          quantity: '4',
          quantityValue: 4,
          rate: '$25.00',
          total: '$90.00',
          discount: '$10.00',
        },
      ],
    });
    expect(
      transformInvoiceToPdfTemplate(
        { ...invoice, discountPercentageFormatted: '' },
        'Rebate',
      ).discountLabel,
    ).toBe('Rebate');
  });
  it('maps distinct customer billing and shipping data and does not fall back to billing for shipping', () => {
    const invoice = {
      customer: {
        displayName: 'Maple Market',
        billingAddress1: '10 Billing Lane',
        billingAddressCity: 'New York',
        shippingAddress1: '20 Delivery Road',
        shippingAddressCity: 'Brooklyn',
        shippingAddressPostcode: '11201',
      },
      entries: [],
      taxes: [],
    } as unknown as SaleInvoiceResponseDto;
    const result = transformInvoiceToPdfTemplate(invoice);
    expect(result.billingAddress).toMatchObject({
      address1: '10 Billing Lane',
      city: 'New York',
    });
    expect(result.shippingAddress).toMatchObject({
      address1: '20 Delivery Road',
      city: 'Brooklyn',
      postalCode: '11201',
    });
    expect(
      transformInvoiceToPdfTemplate({
        ...invoice,
        customer: {
          ...invoice.customer,
          shippingAddress1: '',
          shippingAddressCity: '',
          shippingAddressPostcode: '',
        },
      }).shippingAddress,
    ).toBeNull();
  });
});
