import { ItemPriceHistoryService } from '@/modules/Items/ItemPriceHistory.service';
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { getItemPricingUpdate, isAutoPricingEnabled } from '@bigcapital/utils';
import * as moment from 'moment';
import { events } from '@/common/events/events';
import { Item } from '@/modules/Items/models/Item';
import { ItemEntry } from '@/modules/TransactionItemEntry/models/ItemEntry';
import { SettingsStore } from '@/modules/Settings/SettingsStore';
import { SETTINGS_PROVIDER } from '@/modules/Settings/Settings.types';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { Bill } from '../models/Bill';
import {
  IBillCreatedPayload,
  IBillEditedPayload,
  IBillOpenedPayload,
} from '../Bills.types';

/** Net cost in base currency per existing inventory unit; never convert pack sizes. */
export function getBillItemCosts(bill: Bill): Map<number, number> {
  const costs = new Map<number, number>();
  const entries = bill.entries ?? [];
  const exchangeRate = Number(bill.exchangeRate ?? 1);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return costs;
  const subtotal = entries.reduce(
    (sum, entry) => sum + ItemEntry.calcAmount(entry),
    0,
  );
  const discount = Number(bill.discount ?? 0);
  const discountFactor =
    bill.discountType === 'amount'
      ? subtotal > 0
        ? 1 - discount / subtotal
        : 1
      : 1 - discount / 100;
  if (
    !Number.isFinite(discountFactor) ||
    discountFactor < 0 ||
    discountFactor > 1
  )
    return costs;
  const groups = new Map<number, { quantity: number; amount: number }>();
  const invalid = new Set<number>();
  for (const entry of entries) {
    if (!entry.itemId || entry.landedCost) continue;
    const quantity = Number(entry.quantity);
    const amount = ItemEntry.calcAmount(entry);
    const inclusive = entry.isInclusiveTax ?? bill.isInclusiveTax;
    const taxFactor = inclusive ? 1 + Number(entry.taxRate ?? 0) / 100 : 1;
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      !Number.isFinite(taxFactor) ||
      taxFactor <= 0
    ) {
      invalid.add(entry.itemId);
      continue;
    }
    const group = groups.get(entry.itemId) ?? { quantity: 0, amount: 0 };
    group.quantity += quantity;
    group.amount += amount / taxFactor;
    groups.set(entry.itemId, group);
  }
  for (const [id, group] of groups) {
    if (invalid.has(id)) continue;
    const cost =
      Math.round(
        ((group.amount * discountFactor * exchangeRate) / group.quantity) *
          1000,
      ) / 1000;
    if (Number.isFinite(cost) && cost >= 0) costs.set(id, cost);
  }
  return costs;
}

@Injectable()
export class BillItemPricingSubscriber {
  constructor(
    @Inject(Item.name)
    private readonly itemModel: TenantModelProxy<typeof Item>,
    @Inject(Bill.name)
    private readonly billModel: TenantModelProxy<typeof Bill>,
    @Inject(SETTINGS_PROVIDER)
    private readonly settingsStore: () => Promise<SettingsStore>,
    private readonly priceHistory: ItemPriceHistoryService,
  ) {}

  @OnEvent(events.bill.onCreated, { suppressErrors: false })
  @OnEvent(events.bill.onOpened, { suppressErrors: false })
  @OnEvent(events.bill.onEdited, { suppressErrors: false })
  public async handle(
    payload: IBillCreatedPayload | IBillOpenedPayload | IBillEditedPayload,
  ) {
    const { bill, trx } = payload;
    if (!bill.openedAt) return;
    const loaded = bill.entries
      ? bill
      : await this.billModel()
          .query(trx)
          .findById(bill.id)
          .withGraphFetched('entries');
    const costs = getBillItemCosts(loaded);
    const oldBill = 'oldBill' in payload ? payload.oldBill : undefined;
    const oldCosts = oldBill?.openedAt ? getBillItemCosts(oldBill) : undefined;
    const date = moment(bill.billDate).format('YYYY-MM-DD');
    if (!moment(bill.billDate).isValid()) return;
    const settings = await this.settingsStore();
    const enabled = isAutoPricingEnabled(
      settings.get({ group: 'items', key: 'auto_increase_sell_price' }, true),
    );
    // Stable row-lock order also covers invoices containing the same item repeatedly.
    for (const [id, costPrice] of [...costs].sort(([a], [b]) => a - b)) {
      if (
        oldCosts?.get(id) === costPrice &&
        moment(oldBill.billDate).format('YYYY-MM-DD') === date
      )
        continue;
      const item = await this.itemModel()
        .query(trx)
        .findById(id)
        .forUpdate()
        .throwIfNotFound();
      if (item.type !== 'inventory' || !item.purchasable) continue;
      const priorDate = item.purchaseCostDate
        ? moment(item.purchaseCostDate).format('YYYY-MM-DD')
        : null;
      if (
        priorDate &&
        (priorDate > date ||
          (priorDate === date && Number(item.purchaseCostBillId) > bill.id))
      )
        continue;
      const updatedItem = await this.itemModel()
        .query(trx)
        .patchAndFetchById(id, {
          costPrice,
          ...getItemPricingUpdate(item, { costPrice }, enabled),
          purchaseCostDate: date,
          purchaseCostBillId: bill.id,
        });
      await this.priceHistory.record(item, updatedItem, 'purchase', trx);
    }
  }
}
