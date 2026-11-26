import { SaleInvoice } from './models/SaleInvoice';
import { InvoiceAccrualGL } from './ledger/InvoiceAccrualGL';
import { PaymentReceivedCashGL } from '../PaymentReceived/commands/PaymentReceivedCashGL';
import { PaymentReceived } from '../PaymentReceived/models/PaymentReceived';
import { transformInvoiceToPdfTemplate } from './utils';
import { SaleInvoiceResponseDto } from './dtos/SaleInvoiceResponse.dto';

describe('invoice workflow accounting and privacy', () => {
  const invoice = () =>
    Object.assign(new SaleInvoice(), {
      id: 1,
      customerId: 1,
      balance: 100,
      discount: 0,
      adjustment: 0,
      exchangeRate: 2,
      currencyCode: 'USD',
      shippingCharge: 2,
      taxAmountWithheld: 10,
      isInclusiveTax: false,
      entries: [
        {
          itemId: 1,
          sellAccountId: 10,
          total: 100,
          totalExcludingTax: 100,
          taxAmount: 10,
        },
      ],
    });
  it('includes shipping after tax and keeps accrual entries balanced in base currency', () => {
    const value = invoice();
    expect(value.total).toBe(112);
    expect(value.shippingChargeLocal).toBe(4);
    const gl = new InvoiceAccrualGL(value);
    gl.setARAccountId(20);
    gl.setOtherChargesAccountId(30);
    gl.setShippingIncomeAccountId(70);
    gl.setTaxPayableAccountId(40);
    gl.setDiscountAccountId(50);
    const entries = gl.getInvoiceGLEntries();
    expect(entries.find((entry) => entry.note === 'Shipping')).toMatchObject({
      accountId: 70,
      credit: 4,
    });
    expect(
      entries.reduce(
        (sum, entry) => sum + (entry.debit || 0) - (entry.credit || 0),
        0,
      ),
    ).toBe(0);
  });
  it('recognizes half the shipping charge for a half-paid invoice on cash basis', () => {
    const value = invoice();
    const payment = {
      id: 1,
      exchangeRate: 2,
      currencyCode: 'USD',
      depositAccountId: 60,
      entries: [{ invoice: value, invoiceId: 1, paymentAmount: 56 }],
    } as unknown as PaymentReceived;
    const entries = new PaymentReceivedCashGL(payment)
      .setOtherChargesAccountId(30)
      .setShippingIncomeAccountId(70)
      .setTaxPayableAccountId(40)
      .setDiscountAccountId(50)
      .GLEntries();
    expect(entries.find((entry) => entry.note === 'Shipping')).toMatchObject({
      accountId: 70,
      credit: 2,
    });
    expect(
      entries.reduce(
        (sum, entry) => sum + (entry.debit || 0) - (entry.credit || 0),
        0,
      ),
    ).toBe(0);
  });
  it.each([3, -3])(
    'keeps a %s adjustment separate from shipping on both accounting bases',
    (adjustment) => {
      const value = invoice();
      value.adjustment = adjustment;
      const accrual = new InvoiceAccrualGL(value);
      accrual.setARAccountId(20);
      accrual.setOtherChargesAccountId(30);
      accrual.setShippingIncomeAccountId(70);
      accrual.setTaxPayableAccountId(40);
      accrual.setDiscountAccountId(50);
      const accrualEntries = accrual.getInvoiceGLEntries();
      expect(
        accrualEntries.find((entry) => entry.note === 'Shipping'),
      ).toMatchObject({ accountId: 70, credit: 4, debit: 0 });
      expect(accrualEntries.filter((entry) => entry.accountId === 30)).toEqual([
        expect.objectContaining({
          credit: adjustment > 0 ? 6 : 0,
          debit: adjustment < 0 ? 6 : 0,
        }),
      ]);
      const payment = {
        id: 1,
        exchangeRate: 2,
        currencyCode: 'USD',
        depositAccountId: 60,
        entries: [
          { invoice: value, invoiceId: 1, paymentAmount: value.total / 2 },
        ],
      } as unknown as PaymentReceived;
      const cashEntries = new PaymentReceivedCashGL(payment)
        .setOtherChargesAccountId(30)
        .setShippingIncomeAccountId(70)
        .setTaxPayableAccountId(40)
        .setDiscountAccountId(50)
        .GLEntries();
      expect(
        cashEntries.find((entry) => entry.note === 'Shipping'),
      ).toMatchObject({ accountId: 70, credit: 2 });
      expect(cashEntries.filter((entry) => entry.accountId === 30)).toEqual([
        expect.objectContaining({
          credit: adjustment > 0 ? 3 : 0,
          debit: adjustment < 0 ? 3 : 0,
        }),
      ]);
      for (const entries of [accrualEntries, cashEntries]) {
        expect(
          entries.reduce(
            (sum, entry) => sum + (entry.debit || 0) - (entry.credit || 0),
            0,
          ),
        ).toBeCloseTo(0, 8);
      }
    },
  );
  it('exports snapshots and payment instructions without internal notes or statement memo', () => {
    const value = {
      customer: {
        displayName: 'Customer',
        billingAddress1: 'Customer master address',
      },
      entries: [],
      taxes: [],
      billingAddressText: 'Invoice billing snapshot',
      shippingAddressText: 'Invoice shipping snapshot',
      internalNotes: 'PRIVATE',
      statementMemo: 'PRIVATE MEMO',
      paymentInstructions: 'Pay by check',
      shippingCharge: 2,
      shippingChargeFormatted: '$2.00',
    } as unknown as SaleInvoiceResponseDto;
    const result = transformInvoiceToPdfTemplate(value);
    expect(result).toMatchObject({
      billingAddressText: 'Invoice billing snapshot',
      shippingAddressText: 'Invoice shipping snapshot',
      paymentInstructions: 'Pay by check',
      shippingCharge: '$2.00',
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
});
