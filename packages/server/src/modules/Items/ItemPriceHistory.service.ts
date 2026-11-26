import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { AuditLogService } from '../EE/AuditLogs/AuditLog.service';
import { AuditLog } from '../EE/AuditLogs/models/AuditLog.model';
import { TenantModelProxy } from '../System/models/TenantBaseModel';
import { Item } from './models/Item';
import { ItemPriceChangeDto } from './dtos/ItemPriceHistory.dto';

type Prices = Pick<Item, 'id' | 'costPrice' | 'sellPrice'>;

@Injectable()
export class ItemPriceHistoryService {
  constructor(
    private readonly auditLog: AuditLogService,
    @Inject(AuditLog.name)
    private readonly logs: TenantModelProxy<typeof AuditLog>,
    @Inject(Item.name) private readonly items: TenantModelProxy<typeof Item>,
  ) {}

  private price(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  async record(
    before: Prices,
    after: Prices,
    source: 'item_edit' | 'purchase',
    trx: Knex.Transaction,
  ) {
    const metadata = {
      oldCostPrice: this.price(before.costPrice),
      newCostPrice: this.price(after.costPrice),
      oldSellPrice: this.price(before.sellPrice),
      newSellPrice: this.price(after.sellPrice),
      source,
    };
    if (
      metadata.oldCostPrice === metadata.newCostPrice &&
      metadata.oldSellPrice === metadata.newSellPrice
    )
      return;
    await this.auditLog.record({
      trx,
      subject: 'Item',
      subjectId: before.id,
      action: 'prices_changed',
      metadata,
    });
  }

  async getHistory(itemId: number, limit = 6): Promise<ItemPriceChangeDto[]> {
    await this.items().query().findById(itemId).throwIfNotFound();
    const rows = await this.logs()
      .query()
      .where({ subject: 'Item', subjectId: itemId, action: 'prices_changed' })
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .select('id', 'createdAt', 'metadata')
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      changedAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(row.createdAt).toISOString(),
      oldCostPrice: this.price(row.metadata?.oldCostPrice),
      newCostPrice: this.price(row.metadata?.newCostPrice),
      oldSellPrice: this.price(row.metadata?.oldSellPrice),
      newSellPrice: this.price(row.metadata?.newSellPrice),
      source: row.metadata?.source === 'purchase' ? 'purchase' : 'item_edit',
    }));
  }
}
