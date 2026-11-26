import { Injectable } from '@nestjs/common';
import { ChromiumlyHtmlConvert } from '../ChromiumlyTenancy/ChromiumlyHtmlConvert.service';
import { StatementSnapshot } from './CustomerStatements.types';
import { statementPdfHtml } from './statementPdfHtml';

@Injectable()
export class CustomerStatementPdf {
  constructor(private readonly htmlConvert: ChromiumlyHtmlConvert) {}

  public pdf(snapshots: StatementSnapshot[]): Promise<Buffer> {
    return this.htmlConvert.convert(statementPdfHtml(snapshots), {
      size: { width: 8.5, height: 11 },
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      landscape: false,
      preferCssPageSize: true,
      printBackground: true,
    });
  }
}
