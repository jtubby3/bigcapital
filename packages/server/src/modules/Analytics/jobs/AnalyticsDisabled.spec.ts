import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { ClsService } from 'nestjs-cls';
import { LedgerSyncProcessor } from './LedgerSync.processor';
import { LedgerReconcileProcessor } from './LedgerReconcile.processor';
import { LedgerClickHouseSink } from '../services/LedgerClickHouseSink.service';
import { LedgerAnalyticsSyncService } from '../services/LedgerAnalyticsSync.service';
import { LedgerAnalyticsDirtySet } from '../services/LedgerAnalyticsDirtySet.service';
import { TenantConnectionFactory } from '../services/TenantConnectionFactory';
import { LedgerAnalyticsSyncQueue } from '../Analytics.constants';
import { Ledger } from '@/modules/Ledger/Ledger';

describe('Analytics enable setting', () => {
  let moduleRef: TestingModule;
  let analyticsEnabled: boolean | undefined;
  const dirtyOrganizations = new Set<string>();
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const sync = {
    syncAccountsDim: jest.fn().mockResolvedValue(undefined),
    insertLedgerDeltas: jest.fn().mockResolvedValue(undefined),
    rebuildOrganization: jest.fn().mockResolvedValue(undefined),
  };
  const dirty = {
    mark: jest.fn(async (org: string) => {
      dirtyOrganizations.add(org);
    }),
    unmark: jest.fn(async (org: string) => {
      dirtyOrganizations.delete(org);
    }),
    list: jest.fn(async () => Array.from(dirtyOrganizations)),
  };
  const tenants = { getTenantKnex: jest.fn().mockReturnValue({}) };
  const job = {
    data: {
      organizationId: 'org-1',
      accountIds: [11],
      deltas: [{ accountId: 11, credit: 0, debit: 100 }],
    },
  } as any;

  async function configure(enabled: boolean | undefined) {
    jest.clearAllMocks();
    dirtyOrganizations.clear();
    analyticsEnabled = enabled;
    moduleRef = await Test.createTestingModule({
      providers: [
        LedgerClickHouseSink,
        LedgerSyncProcessor,
        LedgerReconcileProcessor,
        { provide: ConfigService, useValue: { get: () => analyticsEnabled } },
        { provide: ClsService, useValue: { get: () => 'org-1' } },
        { provide: getQueueToken(LedgerAnalyticsSyncQueue), useValue: queue },
        { provide: LedgerAnalyticsSyncService, useValue: sync },
        { provide: LedgerAnalyticsDirtySet, useValue: dirty },
        { provide: TenantConnectionFactory, useValue: tenants },
      ],
    }).compile();
  }

  afterEach(async () => moduleRef?.close());

  it.each([false, undefined])(
    'does not queue writes when enabled=%p',
    async (enabled) => {
      await configure(enabled);
      const sink = moduleRef.get(LedgerClickHouseSink);
      sink.onLedgerCommitted(
        new Ledger([{ accountId: 11, credit: 0, debit: 100 } as any]),
      );
      sink.onLedgerDeleted([{ accountId: 11, credit: 0, debit: 100 }]);
      expect(queue.add).not.toHaveBeenCalled();
      expect(dirty.mark).toHaveBeenCalledWith('org-1');
    },
  );

  it.each([false, undefined])(
    'does not process queued sync jobs when enabled=%p',
    async (enabled) => {
      await configure(enabled);
      await moduleRef.get(LedgerSyncProcessor).process(job);
      expect(tenants.getTenantKnex).not.toHaveBeenCalled();
      expect(sync.syncAccountsDim).not.toHaveBeenCalled();
      expect(sync.insertLedgerDeltas).not.toHaveBeenCalled();
      expect(dirty.unmark).not.toHaveBeenCalled();
      expect(dirty.mark).toHaveBeenCalledWith('org-1');
    },
  );

  it.each([false, undefined])(
    'does not process queued reconcile jobs when enabled=%p',
    async (enabled) => {
      await configure(enabled);
      await moduleRef.get(LedgerReconcileProcessor).process(job);
      expect(sync.rebuildOrganization).not.toHaveBeenCalled();
      expect(dirty.list).not.toHaveBeenCalled();
    },
  );

  it('keeps missed writes marked through an incremental sync until a full repair succeeds', async () => {
    await configure(false);
    moduleRef
      .get(LedgerClickHouseSink)
      .onLedgerCommitted(
        new Ledger([{ accountId: 11, credit: 0, debit: 100 } as any]),
      );
    analyticsEnabled = true;
    await moduleRef.get(LedgerSyncProcessor).process(job);
    await expect(dirty.list()).resolves.toEqual(['org-1']);
    await moduleRef.get(LedgerReconcileProcessor).process({ data: {} } as any);
    expect(sync.rebuildOrganization).toHaveBeenCalledWith('org-1');
    await expect(dirty.list()).resolves.toEqual([]);
  });

  it('keeps the repair marker after a failed rebuild', async () => {
    await configure(true);
    await dirty.mark('org-1');
    sync.rebuildOrganization.mockRejectedValueOnce(
      new Error('ClickHouse unavailable'),
    );
    await moduleRef.get(LedgerReconcileProcessor).process({ data: {} } as any);
    await expect(dirty.list()).resolves.toEqual(['org-1']);
  });

  it('continues syncing and reconciling when enabled', async () => {
    await configure(true);
    await moduleRef.get(LedgerSyncProcessor).process(job);
    expect(sync.insertLedgerDeltas).toHaveBeenCalledWith(
      'org-1',
      job.data.deltas,
    );
    expect(dirty.unmark).not.toHaveBeenCalled();
    await moduleRef.get(LedgerReconcileProcessor).process(job);
    expect(sync.rebuildOrganization).toHaveBeenCalledWith('org-1');
  });
});
