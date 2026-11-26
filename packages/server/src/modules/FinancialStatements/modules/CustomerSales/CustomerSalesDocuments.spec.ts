import { customerSalesDocuments } from './CustomerSalesDocuments';

describe('customer sales source documents', () => {
  const item = {
    itemId: 4,
    description: 'Original line',
    quantity: 2,
    rate: 50,
    item: { name: 'Widget' },
  };
  const invoice = {
    id: 1,
    customerId: 7,
    exchangeRate: 2,
    totalLocal: 220,
    deliveredAt: '2026-02-01',
    entries: [item],
  };
  it('preserves original quantities and converts unit prices using historical exchange rate', () => {
    const result = customerSalesDocuments([invoice], [], [], [], []);
    expect(result[0]).toMatchObject({
      referenceType: 'SaleInvoice',
      referenceId: 1,
      customerId: 7,
      posted: true,
      lines: [
        {
          index: 2,
          itemId: 4,
          quantity: 2,
          rate: 100,
          description: 'Original line',
          product: 'Widget',
        },
      ],
    });
  });
  it('marks draft invoice, receipt, and credit note documents unpublished', () => {
    expect(
      customerSalesDocuments(
        [{ ...invoice, deliveredAt: null }],
        [{ ...invoice, closedAt: null }],
        [{ ...invoice, openedAt: null }],
        [],
        [],
      ).map((d) => d.posted),
    ).toEqual([false, false, false]);
  });
  it('prorates cash quantities by the same historical payment ratio without recomputing posted revenue', () => {
    const payment = {
      id: 10,
      customerId: 7,
      exchangeRate: 2,
      entries: [{ paymentAmount: 55, invoice }],
    };
    const result = customerSalesDocuments([], [], [], [payment], []);
    expect(result[0]).toMatchObject({
      referenceType: 'PaymentReceive',
      referenceId: 10,
      lines: [{ index: 2, quantity: 1, rate: 100 }],
    });
  });
  it('keeps the posted refund customer and amount after its credit note customer and lines change', () => {
    const result = customerSalesDocuments(
      [],
      [],
      [],
      [],
      [
        {
          id: 12,
          amount: 55,
          creditNote: {
            ...invoice,
            customerId: 8,
            openedAt: '2026-02-02',
            entries: [{ ...item, quantity: 99, rate: 999 }],
          },
        },
      ],
      [{ referenceId: 12, contactId: 7 }],
    );
    expect(result[0]).toMatchObject({
      referenceType: 'RefundCreditNote',
      customerId: 7,
      posted: true,
      lines: [],
    });
  });
});
