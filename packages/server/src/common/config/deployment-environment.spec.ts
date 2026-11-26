import {
  isStagingEnvironment,
  watermarkStagingPdf,
} from './deployment-environment';
import { MailTransporter } from '@/modules/Mail/MailTransporter.service';
import { SmsService } from '@/modules/SMS/SmsService';
import { RecurringInvoicesBootstrap } from '@/modules/RecurringInvoices/services/RecurringInvoicesBootstrap.service';

describe('deployment environment safety', () => {
  const original = process.env.APP_ENVIRONMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_ENVIRONMENT;
    else process.env.APP_ENVIRONMENT = original;
  });
  it('leaves production PDF content unchanged', () => {
    process.env.APP_ENVIRONMENT = 'production';
    const html = '<html><body><p>Invoice</p></body></html>';
    expect(isStagingEnvironment()).toBe(false);
    expect(watermarkStagingPdf(html)).toBe(html);
  });
  it('marks staging PDF content with a printable fixed watermark', () => {
    process.env.APP_ENVIRONMENT = ' staging ';
    const html = watermarkStagingPdf('<html><body>Invoice</body></html>');
    expect(isStagingEnvironment()).toBe(true);
    expect(html).toContain('TEST — STAGING');
    expect(html).toContain('position:fixed');
    expect(html).toContain('<body><div');
  });
  it('blocks email before reaching the transport', async () => {
    process.env.APP_ENVIRONMENT = 'staging';
    const sendMail = jest.fn();
    await expect(
      new MailTransporter({ sendMail } as any).send({} as any),
    ).rejects.toThrow('disabled in staging');
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('blocks SMS before reading copied credentials', async () => {
    process.env.APP_ENVIRONMENT = 'staging';
    const getCredentials = jest.fn();
    await expect(
      new SmsService({ getCredentials } as any).send('+12025550123', 'Test'),
    ).rejects.toThrow('disabled in staging');
    expect(getCredentials).not.toHaveBeenCalled();
  });
  it('does not schedule recurring financial writes in staging', async () => {
    process.env.APP_ENVIRONMENT = 'staging';
    const registerScan = jest.fn();
    await new RecurringInvoicesBootstrap({
      registerScan,
    } as any).onApplicationBootstrap();
    expect(registerScan).not.toHaveBeenCalled();
  });
});
