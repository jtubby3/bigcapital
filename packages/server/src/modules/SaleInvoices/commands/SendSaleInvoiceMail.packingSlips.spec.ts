import { events as invoiceEvents } from '@/common/events/events';
import { SendSaleInvoiceMail } from './SendSaleInvoiceMail';
const selection = [{ id: 7, version: 2 }];
function setup() {
  const pdf = {
    getSaleInvoicePdf: jest
      .fn()
      .mockResolvedValue([Buffer.from('invoice'), 'INV-1']),
  };
  const common = {
    getInvoiceMailOptions: jest.fn().mockResolvedValue({ attachInvoice: true }),
  };
  const events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
  const transporter = { send: jest.fn().mockResolvedValue(undefined) };
  const tenancy = {
    getTenant: async () => ({ organizationId: 'tenant' }),
    getSystemUser: async () => ({ id: 3 }),
  };
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
  const slips = {
    withMailLock: jest.fn(async (_id, _value, send) => send()),
    snapshotForMail: jest
      .fn()
      .mockResolvedValue(selection.map((s) => ({ ...s }))),
    mailAttachments: jest.fn().mockResolvedValue([
      {
        filename: 'packing-slip-INV-1.pdf',
        content: Buffer.from('signed pages'),
      },
    ]),
  };
  const service = new SendSaleInvoiceMail(
    pdf as never,
    common as never,
    events as never,
    transporter as never,
    tenancy as never,
    queue as never,
    slips as never,
  );
  jest.spyOn(service, 'getFormattedMailOptions').mockResolvedValue({
    subject: 'Invoice',
    message: 'Message',
    to: ['recipient@example.test'],
    attachInvoice: true,
  } as never);
  return { service, pdf, transporter, queue, slips, events };
}
describe('invoice mail selected packing slips', () => {
  it('keeps invoice PDF and only selected scan PDFs together', async () => {
    const s = setup();
    await s.service.sendMail(1, { packingSlips: selection } as never);
    const mail = s.transporter.send.mock.calls[0][0];
    expect(mail.attachments.map((a) => a.filename)).toEqual([
      'INV-1.pdf',
      'packing-slip-INV-1.pdf',
    ]);
    expect(s.slips.mailAttachments).toHaveBeenCalledWith(1, selection);
  });
  it('snapshots fixed versions before queueing, even if the caller later mutates its request', async () => {
    const s = setup();
    const input = { packingSlips: [{ id: 7, version: 2 }] };
    const result = await s.service.triggerMail(1, input as never);
    input.packingSlips[0].version = 99;
    expect(s.queue.add.mock.calls[0][1].messageOptions.packingSlips).toEqual(
      selection,
    );
    expect(result).toMatchObject({ status: 'queued', jobId: 'job-1' });
  });
  it('honors explicit exclusion and does not add new slips to old queued mail', async () => {
    const s = setup();
    s.slips.mailAttachments.mockResolvedValue([]);
    await s.service.sendMail(1, {});
    expect(s.slips.mailAttachments).toHaveBeenCalledWith(1, []);
    expect(s.transporter.send.mock.calls[0][0].attachments).toHaveLength(1);
  });
  it('aborts before sending if a selected slip has been detached or cannot be read', async () => {
    const s = setup();
    s.slips.mailAttachments.mockRejectedValue(new Error('changed'));
    await expect(
      s.service.sendMail(1, { packingSlips: selection } as never),
    ).rejects.toThrow('changed');
    expect(s.transporter.send).not.toHaveBeenCalled();
  });
  it('holds the selection guard until the transporter finishes', async () => {
    const s = setup();
    let inside = false;
    s.slips.withMailLock.mockImplementation(async (_id, _value, send) => {
      inside = true;
      try {
        return await send();
      } finally {
        inside = false;
      }
    });
    s.transporter.send.mockImplementation(async () => {
      expect(inside).toBe(true);
    });
    await s.service.sendMail(1, { packingSlips: selection } as never);
    expect(inside).toBe(false);
  });
  it('releases invoice locks before status-change subscribers acquire their own row lock', async () => {
    const s = setup();
    let inside = false;
    s.slips.withMailLock.mockImplementation(async (_id, _value, send) => {
      inside = true;
      try {
        return await send();
      } finally {
        inside = false;
      }
    });
    s.events.emitAsync.mockImplementation(async (event) => {
      if (event === invoiceEvents.saleInvoice.onMailSent)
        expect(inside).toBe(false);
    });
    await s.service.sendMail(1, { packingSlips: selection } as never);
  });
  it('rejects an oversized invoice-only email before queueing it', async () => {
    const s = setup();
    s.slips.snapshotForMail.mockResolvedValue([]);
    s.slips.mailAttachments.mockResolvedValue([]);
    s.pdf.getSaleInvoicePdf.mockResolvedValue([
      Buffer.alloc(19 * 1024 * 1024),
      'large',
    ]);
    await expect(
      s.service.triggerMail(1, { packingSlips: [] } as never),
    ).rejects.toThrow('18 MiB');
    expect(s.queue.add).not.toHaveBeenCalled();
  });
  it('applies the combined byte limit before sending or enqueueing', async () => {
    const s = setup();
    s.pdf.getSaleInvoicePdf.mockResolvedValue([
      Buffer.alloc(10 * 1024 * 1024),
      'big',
    ]);
    s.slips.mailAttachments.mockResolvedValue([
      { filename: 'slip.pdf', content: Buffer.alloc(9 * 1024 * 1024) },
    ]);
    await expect(
      s.service.sendMail(1, { packingSlips: selection } as never),
    ).rejects.toThrow('18 MiB');
    expect(s.transporter.send).not.toHaveBeenCalled();
    await expect(
      s.service.triggerMail(1, { packingSlips: selection } as never),
    ).rejects.toThrow('18 MiB');
    expect(s.queue.add).not.toHaveBeenCalled();
  });
});
