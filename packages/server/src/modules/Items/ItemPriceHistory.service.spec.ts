import { ItemPriceHistoryService } from './ItemPriceHistory.service';
import { GetItemPriceHistoryQueryDto } from './dtos/ItemPriceHistory.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function harness(rows: any[] = []) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const query: any = {};
  for (const method of ['where', 'orderBy', 'select'])
    query[method] = jest.fn().mockReturnValue(query);
  query.limit = jest.fn().mockResolvedValue(rows);
  const find = { throwIfNotFound: jest.fn().mockResolvedValue({ id: 9 }) };
  const items: any = () => ({ query: () => ({ findById: () => find }) });
  const logs: any = () => ({ query: () => query });
  return {
    service: new ItemPriceHistoryService(audit as any, logs, items),
    audit,
    query,
    find,
  };
}
const oldItem: any = { id: 9, costPrice: '10.000', sellPrice: '12.000' };
describe('item price history', () => {
  it('records both before/after prices in the same transaction', async () => {
    const h = harness(),
      trx: any = {};
    await h.service.record(
      oldItem,
      { ...oldItem, costPrice: 14, sellPrice: 16.8 },
      'item_edit',
      trx,
    );
    expect(h.audit.record).toHaveBeenCalledWith({
      action: 'prices_changed',
      subject: 'Item',
      subjectId: 9,
      trx,
      metadata: {
        oldCostPrice: 10,
        newCostPrice: 14,
        oldSellPrice: 12,
        newSellPrice: 16.8,
        source: 'item_edit',
      },
    });
  });
  it('does not record an unchanged price or numeric string formatting', async () => {
    const h = harness();
    await h.service.record(
      oldItem,
      { ...oldItem, costPrice: 10, sellPrice: 12 },
      'item_edit',
      {} as any,
    );
    expect(h.audit.record).not.toHaveBeenCalled();
  });
  it('records cost-only decreases and manual selling-only changes', async () => {
    const h = harness();
    await h.service.record(
      oldItem,
      { ...oldItem, costPrice: 8 },
      'purchase',
      {} as any,
    );
    expect(h.audit.record.mock.calls[0][0].metadata).toMatchObject({
      newCostPrice: 8,
      newSellPrice: 12,
      source: 'purchase',
    });
    await h.service.record(
      oldItem,
      { ...oldItem, sellPrice: 13.25 },
      'item_edit',
      {} as any,
    );
    expect(h.audit.record.mock.calls[1][0].metadata).toMatchObject({
      newCostPrice: 10,
      newSellPrice: 13.25,
    });
  });
  it('keeps null distinct from zero and preserves fractional cost precision', async () => {
    const h = harness();
    await h.service.record(
      { ...oldItem, costPrice: null },
      { ...oldItem, costPrice: 0 },
      'item_edit',
      {} as any,
    );
    expect(h.audit.record.mock.calls[0][0].metadata).toMatchObject({
      oldCostPrice: null,
      newCostPrice: 0,
    });
    await h.service.record(
      oldItem,
      { ...oldItem, costPrice: 10.125 },
      'purchase',
      {} as any,
    );
    expect(h.audit.record.mock.calls[1][0].metadata.newCostPrice).toBe(10.125);
  });
  it('propagates a history write failure to roll back the price change', async () => {
    const h = harness();
    h.audit.record.mockRejectedValue(new Error('audit insert failed'));
    await expect(
      h.service.record(
        oldItem,
        { ...oldItem, costPrice: 14 },
        'purchase',
        {} as any,
      ),
    ).rejects.toThrow('audit insert failed');
  });
  it('queries only this item price action, newest first, with default limit six', async () => {
    const h = harness([
      {
        id: 2,
        createdAt: '2026-11-16 10:00:00',
        metadata: {
          oldCostPrice: 10,
          newCostPrice: 14,
          oldSellPrice: 12,
          newSellPrice: 16.8,
          source: 'purchase',
        },
      },
    ]);
    const rows = await h.service.getHistory(9);
    expect(h.find.throwIfNotFound).toHaveBeenCalled();
    expect(h.query.where).toHaveBeenCalledWith({
      subject: 'Item',
      subjectId: 9,
      action: 'prices_changed',
    });
    expect(h.query.orderBy.mock.calls).toEqual([
      ['createdAt', 'desc'],
      ['id', 'desc'],
    ]);
    expect(h.query.limit).toHaveBeenCalledWith(6);
    expect(rows[0]).toMatchObject({
      id: 2,
      oldCostPrice: 10,
      newSellPrice: 16.8,
      source: 'purchase',
    });
    await h.service.getHistory(9, 8);
    expect(h.query.limit).toHaveBeenLastCalledWith(8);
  });
});
describe('price history count validation', () => {
  it('defaults to six', async () => {
    const dto = plainToInstance(GetItemPriceHistoryQueryDto, {});
    expect(dto.limit).toBe(6);
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each([0, -1, 1.5, 1001, 'bad'])(
    'rejects invalid limit %p',
    async (limit) => {
      expect(
        (
          await validate(
            plainToInstance(GetItemPriceHistoryQueryDto, { limit }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it.each([1, '5', '8', 1000])('accepts limit %p', async (limit) => {
    const dto = plainToInstance(GetItemPriceHistoryQueryDto, { limit });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(Number(limit));
  });
});

import { ItemPriceHistoryModule } from './ItemPriceHistory.module';
import { AuditLogsModule as ExistingAuditModule } from '../EE/AuditLogs/AuditLogs.module';
import { AuditLogService as ExistingAuditService } from '../EE/AuditLogs/AuditLog.service';
it('reuses the registered audit module and service instead of registering a second subscriber', () => {
  expect(Reflect.getMetadata('imports', ItemPriceHistoryModule)).toContain(
    ExistingAuditModule,
  );
  expect(
    Reflect.getMetadata('design:paramtypes', ItemPriceHistoryService)[0],
  ).toBe(ExistingAuditService);
});
