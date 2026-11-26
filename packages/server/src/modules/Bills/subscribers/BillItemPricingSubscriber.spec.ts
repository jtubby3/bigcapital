import {
  BillItemPricingSubscriber,
  getBillItemCosts,
} from './BillItemPricingSubscriber';
const original = {
  id: 1,
  type: 'inventory',
  costPrice: 10,
  sellPrice: 12,
  markupPercentage: 20,
  autoIncreaseSellPrice: true,
  purchasable: true,
  sellable: true,
};
const bill = (extra: any = {}) => ({
  id: 3,
  billDate: '2026-11-16',
  openedAt: '2026-11-16',
  exchangeRate: 1,
  entries: [{ itemId: 1, quantity: 2, rate: 14 }],
  ...extra,
});
function harness(item: any = {}, master = true) {
  let saved: any = { ...original, ...item };
  const query: any = {
    findById: () => query,
    forUpdate: () => query,
    throwIfNotFound: async () => ({ ...saved }),
    patchAndFetchById: async (_id: any, patch: any) =>
      (saved = { ...saved, ...patch }),
  };
  const instance = new BillItemPricingSubscriber(
    (() => ({ query: () => query })) as any,
    (() => ({})) as any,
    (async () => ({ get: () => master })) as any,
    { record: async () => {} } as any,
  );
  return { instance, saved: () => saved };
}
describe('purchase-cost pricing', () => {
  it('does nothing for draft bills', async () => {
    const h = harness();
    await h.instance.handle({ bill: bill({ openedAt: null }), trx: {} } as any);
    expect(h.saved()).toMatchObject({ costPrice: 10, sellPrice: 12 });
  });
  it('updates cost and preserves markup on an opened bill', async () => {
    const h = harness();
    await h.instance.handle({ bill: bill(), trx: {} } as any);
    expect(h.saved()).toMatchObject({
      costPrice: 14,
      sellPrice: 16.8,
      markupPercentage: 20,
    });
  });
  it.each([
    { master: false, item: true },
    { master: true, item: false },
  ])(
    'still updates purchase cost with a switch off: %p',
    async ({ master, item }) => {
      const h = harness({ autoIncreaseSellPrice: item }, master);
      await h.instance.handle({ bill: bill(), trx: {} } as any);
      expect(h.saved()).toMatchObject({
        costPrice: 14,
        sellPrice: 12,
        autoIncreaseSellPrice: item,
      });
    },
  );
  it('decreases cost while holding selling price and target', async () => {
    const h = harness();
    await h.instance.handle({
      bill: bill({ entries: [{ itemId: 1, quantity: 2, rate: 8 }] }),
      trx: {},
    } as any);
    expect(h.saved()).toMatchObject({
      costPrice: 8,
      sellPrice: 12,
      markupPercentage: 20,
    });
  });
  it('does not overwrite a newer purchase from an older invoice', async () => {
    const h = harness({
      purchaseCostDate: '2026-11-17',
      purchaseCostBillId: 4,
    });
    await h.instance.handle({ bill: bill(), trx: {} } as any);
    expect(h.saved().costPrice).toBe(10);
  });
  it('does not reapply an old rate for an unrelated edit', async () => {
    const h = harness({ costPrice: 17 });
    await h.instance.handle({
      bill: bill({ note: 'changed' }),
      oldBill: bill(),
      trx: {},
    } as any);
    expect(h.saved().costPrice).toBe(17);
  });
  it('applies a corrected cost on a pricing edit to the latest bill', async () => {
    const h = harness();
    await h.instance.handle({
      bill: bill(),
      oldBill: bill({ entries: [{ itemId: 1, quantity: 2, rate: 10 }] }),
      trx: {},
    } as any);
    expect(h.saved().sellPrice).toBe(16.8);
  });
});
describe('net case purchase cost', () => {
  it('weights repeated item lines by quantity', () => {
    expect(
      getBillItemCosts(
        bill({
          entries: [
            { itemId: 1, quantity: 1, rate: 10 },
            { itemId: 1, quantity: 3, rate: 14 },
          ],
        }) as any,
      ).get(1),
    ).toBe(13);
  });
  it('removes inclusive tax and line discounts, then converts currency', () => {
    const costs = getBillItemCosts(
      bill({
        isInclusiveTax: true,
        exchangeRate: 2,
        entries: [
          {
            itemId: 1,
            quantity: 2,
            rate: 16.5,
            taxRate: 10,
            discountType: 'percentage',
            discount: 10,
          },
        ],
      }) as any,
    );
    expect(costs.get(1)).toBe(27);
  });
  it('allocates a document discount across purchase quantities', () => {
    expect(
      getBillItemCosts(
        bill({
          discountType: 'amount',
          discount: 8,
          entries: [{ itemId: 1, quantity: 2, rate: 20 }],
        }) as any,
      ).get(1),
    ).toBe(16);
  });
  it('does not apply partial costs for an item with invalid quantities', () => {
    expect(
      getBillItemCosts(
        bill({
          entries: [
            { itemId: 1, quantity: 1, rate: 10 },
            { itemId: 1, quantity: 0, rate: 14 },
          ],
        }) as any,
      ).has(1),
    ).toBe(false);
  });
});
