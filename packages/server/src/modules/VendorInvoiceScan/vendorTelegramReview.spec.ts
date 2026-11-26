import { VendorInvoiceTelegram } from './VendorInvoiceTelegram.service';
import type { Scan } from './vendorScanTypes';

jest.mock('./VendorInvoiceScan.service', () => ({
  VendorInvoiceScanService: class {},
}));
jest.mock('@/modules/Tenancy/TenantModelsInitialize.module', () => ({
  TENANT_MODELS_INIT: 'TENANT_MODELS_INIT',
}));

const sample: Scan = {
  id: 123,
  status: 'review',
  name: 'test.pdf',
  version: 8,
  billId: null,
  error: null,
  files: [],
  review: {
    vendorId: 4,
    vendorName: 'Sample vendor',
    invoiceNumber: '0007',
    billDate: '2026-11-22',
    dueDate: '',
    currency: 'USD',
    exchangeRate: '1',
    total: '28',
    shipping: '0',
    tax: '0',
    discount: '0',
    receiptChecked: true,
    warnings: [],
    lines: [
      {
        code: '0123',
        description: 'Sample',
        billingUnit: 'CS',
        pack: '24',
        shipped: '2',
        unitPrice: '14',
        amount: '28',
        page: 0,
        fileId: 0,
        itemId: 11,
        itemName: 'Item',
        confirmed: false,
        remember: false,
        casesPerUnit: '1',
      },
    ],
  },
};

function setup() {
  const scans = {
    get: jest.fn().mockImplementation(async () => structuredClone(sample)),
    access: jest.fn(),
    save: jest.fn().mockImplementation(async (_id, _version, review) => ({
      ...sample,
      version: 9,
      review,
    })),
    preview: jest.fn().mockResolvedValue({
      ready: true,
      issues: [],
      prices: [],
      token: 'preview',
    }),
    post: jest.fn().mockResolvedValue({
      ...sample,
      status: 'posted',
      billId: 32,
      version: 9,
    }),
    upload: jest
      .fn()
      .mockResolvedValue({ ...sample, status: 'queued', version: 1 }),
  };
  const bot = new VendorInvoiceTelegram(
    undefined,
    undefined,
    scans as any,
    { get: () => undefined } as any,
    undefined,
  ) as any;
  bot.send = jest.fn().mockResolvedValue(undefined);
  bot.api = {
    download: jest.fn().mockResolvedValue({
      originalname: 'Photo 10.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.of(1),
    }),
  };
  bot.botId = '123456';
  return { bot, scans, state: { pending: [], actions: {} } };
}

describe('Telegram vendor invoice review', () => {
  it('confirms a product identity without saving a mapping or posting a purchase', async () => {
    const { bot, scans, state } = setup();
    await bot.handleAction('98', state, {
      kind: 'confirm',
      scan: 123,
      version: 8,
      line: 0,
    });
    expect(scans.save).toHaveBeenCalledWith(
      123,
      8,
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            code: '0123',
            itemId: 11,
            confirmed: true,
            remember: false,
            shipped: '2',
          }),
        ],
      }),
    );
    expect(scans.post).not.toHaveBeenCalled();
  });

  it('ignores a stale record action and refreshes without posting', async () => {
    const { bot, scans, state } = setup();
    await bot.handleAction('98', state, {
      kind: 'record',
      scan: 123,
      version: 7,
      previewToken: 'stale',
    });
    expect(bot.send).toHaveBeenCalledWith(
      '98',
      expect.stringContaining('review changed'),
    );
    expect(scans.post).not.toHaveBeenCalled();
  });

  it('binds explicit record confirmation to a scan version and the server preview', async () => {
    const { bot, scans, state } = setup();
    await bot.handleAction('98', state, {
      kind: 'summary',
      scan: 123,
      version: 8,
    });
    const buttons = bot.send.mock.calls.at(-1)[2].flat();
    const record = buttons.find(
      ({ text }) => text === 'Confirm and record purchase',
    );
    expect(record.callback_data).not.toContain('preview');
    expect(scans.post).not.toHaveBeenCalled();
    await bot.handleAction(
      '98',
      state,
      state.actions[record.callback_data].action,
    );
    expect(scans.post).toHaveBeenCalledWith(123, 8, 'preview');
    expect(bot.send).toHaveBeenLastCalledWith(
      '98',
      expect.stringContaining('bill #32'),
      [],
    );
  });

  it('collects separate pages explicitly and maintains the same durable key for retries', async () => {
    const { bot, scans, state } = setup();
    await bot.handleMessage('98', state, { message_id: 9, text: '/pages' });
    const photo = {
      message_id: 10,
      photo: [{ file_id: 'a', width: 80, height: 200 }],
    };
    await bot.handleMessage('98', state, photo);
    await bot.handleMessage('98', state, photo);
    expect(scans.upload).not.toHaveBeenCalled();
    expect(state['batch'].files).toHaveLength(1);
    await bot.handleMessage('98', state, { message_id: 11, text: '/done' });
    expect(scans.upload).toHaveBeenCalledWith(
      [expect.objectContaining({ buffer: Buffer.of(1) })],
      'telegram:123456:98:message:9',
    );
    expect(state['batch']).toBeUndefined();
    expect(state.pending).toEqual([123]);
  });
  it('queues an album as one ordered request and flags pages delivered later', async () => {
    const { bot, scans, state } = setup();
    const album = (id: number, group = 'group1') => ({
      message_id: id,
      media_group_id: group,
      photo: [{ file_id: 'file' + id, width: 80, height: 200 }],
    });
    await bot.handleMessage('98', state, album(11));
    await bot.handleMessage('98', state, album(10));
    await expect(
      bot.handleMessage('98', state, album(12, 'group2')),
    ).rejects.toThrow('current page collection');
    expect(scans.upload).not.toHaveBeenCalled();
    await bot.flushAlbum('98', state);
    expect(bot.api.download.mock.calls.map(([file]) => file.messageId)).toEqual(
      [10, 11],
    );
    expect(scans.upload).toHaveBeenCalledWith(
      expect.any(Array),
      'telegram:123456:98:album:group1',
    );
    await expect(bot.handleMessage('98', state, album(13))).rejects.toThrow(
      'arrived after this album',
    );
  });
});
