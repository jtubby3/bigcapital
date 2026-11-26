import { ItemPriceHistoryService } from '@/modules/Items/ItemPriceHistory.service';
import { Test } from '@nestjs/testing';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { BillItemPricingSubscriber } from './BillItemPricingSubscriber';
import { Item } from '@/modules/Items/models/Item';
import { Bill } from '../models/Bill';
import { SETTINGS_PROVIDER } from '@/modules/Settings/Settings.types';
import { events } from '@/common/events/events';

describe('registered bill pricing failure propagation', () => {
  it.each([events.bill.onCreated, events.bill.onOpened, events.bill.onEdited])(
    'rejects the transaction caller for %s when an item pricing write fails',
    async (event) => {
      const fixture = {
        id: 1,
        type: 'inventory',
        costPrice: 10,
        sellPrice: 12,
        markupPercentage: 20,
        purchasable: true,
        sellable: true,
      };
      const query: any = {
        findById: () => query,
        forUpdate: () => query,
        throwIfNotFound: async () => fixture,
        patchAndFetchById: async () => {
          throw new Error('Pricing write failed');
        },
      };
      const module = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          BillItemPricingSubscriber,
          {
            provide: ItemPriceHistoryService,
            useValue: { record: async () => {} },
          },
          { provide: Item.name, useValue: () => ({ query: () => query }) },
          { provide: Bill.name, useValue: () => ({}) },
          {
            provide: SETTINGS_PROVIDER,
            useValue: async () => ({ get: () => true }),
          },
        ],
      }).compile();
      await module.init();
      try {
        const emitter = module.get(EventEmitter2);
        await expect(
          emitter.emitAsync(event, {
            bill: {
              id: 3,
              billDate: '2026-11-16',
              openedAt: '2026-11-16',
              exchangeRate: 1,
              entries: [{ itemId: 1, quantity: 1, rate: 14 }],
            },
            trx: {},
          }),
        ).rejects.toThrow('Pricing write failed');
      } finally {
        await module.close();
      }
    },
  );
});
