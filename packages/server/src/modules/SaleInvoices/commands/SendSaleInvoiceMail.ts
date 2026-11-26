import { PackingSlipsService } from '@/modules/PackingSlips/PackingSlips.service';
import { assertMailSize } from '@/modules/PackingSlips/packingSlipValidation';
import { Injectable } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { SaleInvoicePdf } from '../queries/SaleInvoicePdf.service';
import { SendSaleInvoiceMailCommon } from './SendInvoiceInvoiceMailCommon.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { mergeAndValidateMailOptions } from '@/modules/MailNotification/utils';
import {
  SaleInvoiceMailOptions,
  SendInvoiceMailDTO,
  SendSaleInvoiceMailJobPayload,
} from '../SaleInvoice.types';
import { ISaleInvoiceMailSend } from '../SaleInvoice.types';
import { Mail } from '@/modules/Mail/Mail';
import { MailTransporter } from '@/modules/Mail/MailTransporter.service';
import { SendSaleInvoiceMailJob, SendSaleInvoiceQueue } from '../constants';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';

@Injectable()
export class SendSaleInvoiceMail {
  /**
   * @param {SaleInvoicePdf} invoicePdf - Sale invoice pdf service.
   * @param {SendSaleInvoiceMailCommon} invoiceMail - Sale invoice mail service.
   * @param {EventEmitter2} eventEmitter - Event emitter.
   * @param {MailTransporter} mailTransporter - Mail transporter service.
   */
  constructor(
    private readonly invoicePdf: SaleInvoicePdf,
    private readonly invoiceMail: SendSaleInvoiceMailCommon,
    private readonly eventEmitter: EventEmitter2,
    private readonly mailTransporter: MailTransporter,
    private readonly tenancyContect: TenancyContext,

    @InjectQueue(SendSaleInvoiceQueue) private readonly sendInvoiceQueue: Queue,
    private readonly packingSlips: PackingSlipsService,
  ) {}

  /**
   * Sends the invoice mail of the given sale invoice.
   * @param {number} saleInvoiceId - Sale invoice id.
   * @param {SendInvoiceMailDTO} messageDTO - Message DTO.
   */
  public async triggerMail(
    saleInvoiceId: number,
    messageOptions: SendInvoiceMailDTO,
    jobOptions?: JobsOptions,
  ) {
    const selected = await this.packingSlips.snapshotForMail(
      saleInvoiceId,
      messageOptions.packingSlips,
    );
    const fixedOptions = {
      ...messageOptions,
      packingSlips: selected.map((s) => ({ ...s })),
    };
    const attachments = await this.packingSlips.mailAttachments(
      saleInvoiceId,
      selected,
    );
    const defaults =
      await this.invoiceMail.getInvoiceMailOptions(saleInvoiceId);
    if (fixedOptions.attachInvoice ?? defaults.attachInvoice) {
      const [invoice] = await this.invoicePdf.getSaleInvoicePdf(saleInvoiceId);
      assertMailSize([invoice, ...attachments.map((a) => a.content)]);
    } else assertMailSize(attachments.map((a) => a.content));
    const tenant = await this.tenancyContect.getTenant();
    const user = await this.tenancyContect.getSystemUser();

    const organizationId = tenant.organizationId;
    const userId = user.id;

    const payload = {
      saleInvoiceId,
      messageOptions: fixedOptions,
      userId,
      organizationId,
    } as SendSaleInvoiceMailJobPayload;

    const job = await this.sendInvoiceQueue.add(
      SendSaleInvoiceMailJob,
      payload,
      jobOptions,
    );

    // Triggers the event `onSaleInvoicePreMailSend`.
    await this.eventEmitter.emitAsync(events.saleInvoice.onPreMailSend, {
      saleInvoiceId,
      messageOptions,
    } as ISaleInvoiceMailSend);
    return { status: 'queued', jobId: String(job.id) };
  }

  /**
   * Retrieves the formatted mail options.
   * @param {number} saleInvoiceId
   * @param {SendInvoiceMailDTO} messageOptions
   * @returns {Promise<SaleInvoiceMailOptions>}
   */
  async getFormattedMailOptions(
    saleInvoiceId: number,
    messageOptions: SendInvoiceMailDTO,
  ): Promise<SaleInvoiceMailOptions> {
    const defaultMessageOptions =
      await this.invoiceMail.getInvoiceMailOptions(saleInvoiceId);

    // Merges message options with default options and parses the options values.
    const parsedMessageOptions = mergeAndValidateMailOptions(
      defaultMessageOptions,
      messageOptions,
    );
    return this.invoiceMail.formatInvoiceMailOptions(
      saleInvoiceId,
      parsedMessageOptions,
    );
  }

  /**
   * Triggers the mail invoice.
   * @param {number} saleInvoiceId - Sale invoice id.
   * @param {SendInvoiceMailDTO} messageDTO - Message options.
   * @returns {Promise<void>}
   */
  public async sendMail(
    saleInvoiceId: number,
    messageOptions: SendInvoiceMailDTO,
  ) {
    const selected = messageOptions.packingSlips ?? [];
    const formattedMessageOptions = await this.getFormattedMailOptions(
      saleInvoiceId,
      messageOptions,
    );
    const mail = new Mail()
      .setSubject(formattedMessageOptions.subject)
      .setTo(formattedMessageOptions.to)
      .setCC(formattedMessageOptions.cc)
      .setBCC(formattedMessageOptions.bcc)
      .setContent(formattedMessageOptions.message);
    const attachments = await this.packingSlips.mailAttachments(
      saleInvoiceId,
      selected,
    );
    if (formattedMessageOptions.attachInvoice) {
      const [content, filename] =
        await this.invoicePdf.getSaleInvoicePdf(saleInvoiceId);
      attachments.unshift({ filename: `${filename}.pdf`, content });
    }
    assertMailSize(attachments.map((a) => a.content));
    mail.setAttachments(attachments);
    const eventPayload = {
      saleInvoiceId,
      messageOptions,
      formattedMessageOptions,
    } as ISaleInvoiceMailSend;
    await this.eventEmitter.emitAsync(
      events.saleInvoice.onMailSend,
      eventPayload,
    );
    // Rendering and storage reads finish before taking the send locks.
    await this.packingSlips.withMailLock(saleInvoiceId, selected, async () => {
      await this.mailTransporter.send(mail);
    });
    // Status subscribers acquire their own invoice lock after transport has finished.
    await this.eventEmitter.emitAsync(
      events.saleInvoice.onMailSent,
      eventPayload,
    );
  }
}
