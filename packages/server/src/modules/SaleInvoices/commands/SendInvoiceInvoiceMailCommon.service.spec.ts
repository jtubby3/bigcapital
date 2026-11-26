import { SendSaleInvoiceMailCommon } from './SendInvoiceInvoiceMailCommon.service';
import {
  DEFAULT_INVOICE_MAIL_SUBJECT,
  DEFAULT_INVOICE_MAIL_CONTENT,
} from '../constants';

describe('invoice template mail defaults', () => {
  const setup = (attributes: Record<string, unknown>) => {
    const invoice = {
      id: 1,
      customerId: 2,
      pdfTemplateId: 3,
      recipientEmail: 'invoice@example.test',
    };
    const query = {
      findById: () => ({ throwIfNotFound: async () => invoice }),
    };
    const service = new SendSaleInvoiceMailCommon(
      {} as never,
      { getPdfTemplate: async () => ({ attributes }) } as never,
      {
        getDefaultMailOptions: async () => ({
          to: ['customer@example.test'],
          from: ['company@example.test'],
        }),
      } as never,
      {} as never,
      {} as never,
      (() => ({ query: () => query })) as never,
    );
    jest.spyOn(service, 'getInvoiceFormatterArgs').mockResolvedValue({});
    return service;
  };
  it('uses saved defaults and the invoice-specific recipient for review without sending', async () => {
    const value = await setup({
      emailSubject: 'Invoice {Invoice Number}',
      emailMessage: 'Dear {Customer Name}',
      attachInvoicePdf: false,
    }).getInvoiceMailOptions(1);
    expect(value).toMatchObject({
      subject: 'Invoice {Invoice Number}',
      message: 'Dear {Customer Name}',
      attachInvoice: false,
      to: ['invoice@example.test'],
    });
  });
  it('keeps normal defaults for old templates and keeps reminder messages separate', async () => {
    const old = await setup({}).getInvoiceMailOptions(1);
    expect(old).toMatchObject({
      subject: DEFAULT_INVOICE_MAIL_SUBJECT,
      message: DEFAULT_INVOICE_MAIL_CONTENT,
      attachInvoice: true,
    });
    const reminder = await setup({
      emailSubject: 'Wrong subject',
      emailMessage: 'Wrong body',
    }).getInvoiceMailOptions(1, 'Reminder subject', 'Reminder body');
    expect(reminder).toMatchObject({
      subject: 'Reminder subject',
      message: 'Reminder body',
    });
  });
});
