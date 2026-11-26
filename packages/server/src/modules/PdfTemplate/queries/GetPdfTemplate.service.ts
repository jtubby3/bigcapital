import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { GetPdfTemplateTransformer } from './GetPdfTemplate.transformer';
import { PdfTemplateModel } from '../models/PdfTemplate';
import { TransformerInjectable } from '../../Transformer/TransformerInjectable.service';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { GetAttachment } from '@/modules/Attachments/GetAttachment';
import { GetAttachmentPresignedUrl } from '@/modules/Attachments/GetAttachmentPresignedUrl';

@Injectable()
export class GetPdfTemplateService {
  constructor(
    @Inject(PdfTemplateModel.name)
    private readonly pdfTemplateModel: TenantModelProxy<
      typeof PdfTemplateModel
    >,
    private readonly transformer: TransformerInjectable,
    private readonly getPresignedUrlService: GetAttachmentPresignedUrl,
    private readonly getAttachment: GetAttachment,
  ) {}

  /**
   * Retrieves a pdf template by its ID.
   * @param {number} templateId - The ID of the pdf template to retrieve.
   * @return {Promise<any>} - The retrieved pdf template.
   */
  async getPdfTemplate(
    templateId: number,
    trx?: Knex.Transaction,
    embedImages = false,
  ): Promise<any> {
    const template = await this.pdfTemplateModel()
      .query(trx)
      .findById(templateId)
      .throwIfNotFound();

    const companyLogoKey = template.attributes?.companyLogoKey;
    let companyLogoUri: string | null = null;

    if (companyLogoKey) {
      try {
        companyLogoUri =
          await this.getPresignedUrlService.getPresignedUrl(companyLogoKey);
      } catch {
        companyLogoUri = null;
      }
    }
    let footerImageUri = '';
    if (template.attributes?.footerImageKey) {
      try {
        footerImageUri = await this.getPresignedUrlService.getPresignedUrl(
          template.attributes.footerImageKey,
        );
      } catch {
        footerImageUri = '';
      }
    }
    if (embedImages) {
      if (companyLogoKey) companyLogoUri = await this.imageDataUri(companyLogoKey);
      if (template.attributes?.footerImageKey) footerImageUri = await this.imageDataUri(template.attributes.footerImageKey);
    }
    return this.transformer.transform(
      {
        ...template,
        attributes: { ...template.attributes, footerImageUri },
        companyLogoUri,
      },
      new GetPdfTemplateTransformer(),
    );
  }
  /** Embed tenant-owned uploaded images so PDF rendering does not depend on private storage URLs. */
  private async imageDataUri(key: string): Promise<string> {
    const attachment = await this.getAttachment.getAttachment(key);
    const mime = attachment.ContentType;
    if (!mime || !['image/png', 'image/jpeg'].includes(mime) || !attachment.Body) return '';
    const bytes = await attachment.Body.transformToByteArray();
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  }

}
