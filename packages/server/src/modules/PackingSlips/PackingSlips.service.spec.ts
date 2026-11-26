import { PackingSlipsService } from './PackingSlips.service';
import { invoiceFingerprint } from './packingSlipValidation';
import { requirePackingAccess } from './PackingSlips.guard';
const invoice = {
  id: 1,
  invoiceNo: '0001',
  customerId: 2,
  customerName: 'Orchard Cafe',
  shippingAddress: '12 Main Street',
  referenceNo: 'PO-55',
  trackingNo: '',
  shippingDate: '2026-11-16',
  invoiceDate: '2026-11-15',
  eligible: true,
  entries: [],
};
function fixture() {
  const slip = {
    id: 7,
    invoiceId: 1,
    status: 'attached',
    version: 2,
    superseded: false,
    documentId: 9,
    invoiceFingerprint: invoiceFingerprint(invoice),
  };
  let hasLink = true;
  const service = Object.assign(Object.create(PackingSlipsService.prototype), {
    access: jest.fn().mockResolvedValue(undefined),
    loadInvoices: async () => [invoice],
    loadInvoice: async () => invoice,
    authorization: { getAbilityForUser: async () => ({ can: () => true }) },
    slip: async () => slip,
    read: jest
      .fn()
      .mockResolvedValue(Buffer.from('only the correct scanned pages')),
    db: () => (table: string) => ({
      where: () => ({
        first: async () =>
          table === 'documents'
            ? { id: 9, key: 'tenant/packing-slips/key' }
            : hasLink
              ? { id: 1 }
              : undefined,
      }),
    }),
  }) as PackingSlipsService;
  return {
    service,
    slip,
    noLink: () => {
      hasLink = false;
    },
  };
}
describe('packing slip email authority', () => {
  it('reads only a current selected invoice association', async () => {
    const s = fixture();
    const result = await s.service.mailAttachments(1, [{ id: 7, version: 2 }]);
    expect(result[0].content.toString()).toBe('only the correct scanned pages');
    expect(result[0].filename).toContain('0001');
  });
  it.each(['version', 'invoice', 'superseded', 'identity', 'link'])(
    'rejects changed %s before retrieving content',
    async (change) => {
      const s = fixture();
      if (change === 'version') s.slip.version = 3;
      if (change === 'invoice') s.slip.invoiceId = 8;
      if (change === 'superseded') s.slip.superseded = true;
      if (change === 'identity') s.slip.invoiceFingerprint = 'old';
      if (change === 'link') s.noLink();
      await expect(
        s.service.mailAttachments(1, [{ id: 7, version: 2 }]),
      ).rejects.toThrow();
      expect(s.service['read']).not.toHaveBeenCalled();
    },
  );
  it('rechecks current permissions in the worker before reading files', async () => {
    const s = fixture();
    s.service['authorization'].getAbilityForUser = async () => {
      throw new Error('permission revoked');
    };
    await expect(
      s.service.mailAttachments(1, [{ id: 7, version: 2 }]),
    ).rejects.toThrow('permission revoked');
    expect(s.service['read']).not.toHaveBeenCalled();
  });
  it('allows explicitly excluding all slips without reading any scan', async () => {
    const s = fixture();
    expect(await s.service.snapshotForMail(1, [])).toEqual([]);
    expect(s.service['read']).not.toHaveBeenCalled();
  });
  it('requires invoice and attachment permission at each write and removal boundary', () => {
    const ability = { can: jest.fn().mockReturnValue(true) };
    expect(() => requirePackingAccess(ability, true, true)).not.toThrow();
    expect(ability.can).toHaveBeenCalledWith('Delete', 'Attachment');
    expect(() => requirePackingAccess({ can: () => false })).toThrow();
  });
});

describe('queued invoice mail status', () => {
  function statusFixture() {
    const s = fixture().service;
    Object.assign(s, {
      authorization: { getAbilityForUser: async () => ({ can: () => true }) },
      cls: { get: (key: string) => (key === 'organizationId' ? 'tenant' : 3) },
      mailQueue: {
        getJob: async () => ({
          data: { organizationId: 'tenant', userId: 3 },
          getState: async () => 'failed',
        }),
      },
    });
    return s;
  }
  it('reports a send failure without exposing transport details', async () => {
    expect(await statusFixture().mailJobStatus('123')).toEqual({
      state: 'failed',
      error: expect.stringContaining('failed'),
    });
  });
  it('does not expose another tenant or user job', async () => {
    const s = statusFixture();
    s['mailQueue'].getJob = async () =>
      ({ data: { organizationId: 'other', userId: 3 } }) as never;
    await expect(s.mailJobStatus('123')).rejects.toThrow('not found');
  });
  it('requires current invoice edit permission to inspect a queued send', async () => {
    const s = statusFixture();
    s['authorization'].getAbilityForUser = async () =>
      ({ can: () => false }) as never;
    await expect(s.mailJobStatus('123')).rejects.toThrow('permission');
  });
});

describe('final review regressions', () => {
  it('keeps tenant-local file numbers distinct on the shared Redis queue', async () => {
    const service = fixture().service;
    let organizationId = 'tenant-a';
    const jobs = new Map();
    Object.assign(service, {
      file: async () => ({ id: 1, attempt: 0, userId: 3, status: 'queued' }),
      batch: async () => ({ cancelled: false, userId: 3 }),
      cls: { get: () => organizationId },
      tenancy: {
        getTenantJobPayload: async () => ({ organizationId, userId: 3 }),
      },
      queue: {
        add: async (_name, data, options) => {
          if (!jobs.has(options.jobId)) jobs.set(options.jobId, data);
          return { id: options.jobId };
        },
      },
    });
    await service['enqueue'](1);
    organizationId = 'tenant-b';
    await service['enqueue'](1);
    expect(jobs.size).toBe(2);
  });
  it('rejects an automatic match that is no longer unique at mail preflight', async () => {
    const s = fixture();
    Object.assign(s.slip, { confirmedBy: 'automatic', pages: [1], fileId: 1 });
    s.service['file'] = async () =>
      ({
        pageData: [
          {
            page: 1,
            lines: [
              'PACKING SLIP',
              'Invoice No: 0001',
              'Customer: Orchard Cafe',
            ].map((text, i) => ({
              text,
              confidence: 1,
              x: 0.05,
              y: 0.05 + i * 0.05,
              width: 0.8,
              height: 0.025,
            })),
          },
        ],
      }) as never;
    s.service['loadInvoices'] = async () => [invoice, { ...invoice, id: 2 }];
    await expect(
      s.service.mailAttachments(1, [{ id: 7, version: 2 }]),
    ).rejects.toThrow();
    expect(s.service['read']).not.toHaveBeenCalled();
  });
  it('preserves ordinary invoice-only callers when no scan exists and attachment access is denied', async () => {
    const s = fixture().service;
    s['access'] = jest
      .fn()
      .mockRejectedValue(new Error('no attachment permission'));
    (s as any).db = (() => () => ({
      where: () => ({ then: (resolve) => Promise.resolve([]).then(resolve) }),
    })) as never;
    expect(await s.snapshotForMail(1)).toEqual([]);
  });
  it('does not invoke the bulk matcher for a slip-free invoice', async () => {
    const s = fixture().service;
    s['loadInvoices'] = jest.fn().mockRejectedValue(new Error('5001 invoices'));
    (s as any).db = (() => () => ({
      where: () => ({ orderBy: async () => [] }),
    })) as never;
    expect(await s.listInvoice(1)).toEqual([]);
    expect(s['loadInvoices']).not.toHaveBeenCalled();
  });
  it('rejects send after invoice edit permission is revoked', async () => {
    const s = fixture();
    s.service['authorization'].getAbilityForUser = async () =>
      ({ can: (action: string) => action !== 'Edit' }) as never;
    await expect(
      s.service.mailAttachments(1, [{ id: 7, version: 2 }]),
    ).rejects.toThrow('permission');
    expect(s.service['read']).not.toHaveBeenCalled();
  });
  it('downloads a confirmed immutable PDF without rereading its source or invoking OCR', async () => {
    const s = fixture();
    (s.service as any).native = {
      extract: jest.fn().mockRejectedValue(new Error('compiler removed')),
    } as never;
    s.service['file'] = jest
      .fn()
      .mockRejectedValue(new Error('source removed'));
    expect((await s.service.pdf(7, 2)).toString()).toBe(
      'only the correct scanned pages',
    );
    expect(s.service['native'].extract).not.toHaveBeenCalled();
  });
});

describe('saved scan recovery', () => {
  function recover(state?: string) {
    const service = fixture().service;
    const row = { id: 4, batchId: 2, userId: 9, attempt: 0, status: 'queued' };
    const sql: any = () => ({
      where: () => ({
        update: async (value) => {
          Object.assign(row, value);
        },
      }),
    });
    sql.transaction = async (fn) => fn(sql);
    Object.assign(service, {
      file: async () => ({ ...row }),
      batch: async () => ({ cancelled: false, userId: 1 }),
      cls: { get: () => 'tenant' },
      db: () => sql,
      queue: {
        getJob: async () =>
          state ? { getState: async () => state } : undefined,
      },
      enqueue: jest.fn(),
    });
    return { service, row };
  }
  it('recovers a committed queued file whose Redis job was never created', async () => {
    const s = recover();
    await s.service.retry(4);
    expect(s.row.status).toBe('queued');
    expect(s.row.userId).toBe(9);
    expect(s.service['enqueue']).toHaveBeenCalledWith(4);
  });
  it('does not duplicate an active or waiting worker when resuming a batch', async () => {
    for (const state of ['active', 'waiting', 'delayed']) {
      const s = recover(state);
      await s.service.retry(4);
      expect(s.service['enqueue']).not.toHaveBeenCalled();
    }
  });
  it('rejects work from an outdated saved attempt before invoking recognition', async () => {
    const s = recover();
    s.row.attempt = 2;
    (s.service as any).native = { scan: jest.fn() } as never;
    await s.service.processFile(4, 1);
    expect(s.service['native'].scan).not.toHaveBeenCalled();
  });
});
