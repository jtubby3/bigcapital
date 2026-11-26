import {
  Controller,
  Get,
  Headers,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiCommonHeaders } from '@/common/decorators/ApiCommonHeaders';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { RequirePermission } from '@/modules/Roles/RequirePermission.decorator';
import { AbilitySubject } from '@/modules/Roles/Roles.types';
import { ReportsAction } from '@/modules/FinancialStatements/types/Report.types';
import { CustomerSalesService } from './CustomerSalesService';
import { CustomerSalesExport } from './CustomerSalesExport';
import {
  CustomerSalesQueryDto,
  validateCustomerSalesQuery,
} from './CustomerSalesQuery.dto';

@Controller('/reports/customer-sales')
@ApiTags('Reports')
@ApiCommonHeaders()
@UseGuards(AuthorizationGuard, PermissionGuard)
export class CustomerSalesController {
  constructor(
    private readonly service: CustomerSalesService,
    private readonly exports: CustomerSalesExport,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get sales or income by customer, using posted ledger amounts',
  })
  @RequirePermission(
    ReportsAction.READ_CUSTOMERS_TRANSACTIONS,
    AbilitySubject.Report,
  )
  async report(
    @Query() input: CustomerSalesQueryDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('accept') accept = '',
  ) {
    const query = validateCustomerSalesQuery(input);
    const report = await this.service.sheet(query);
    const filename = `customer-sales-${query.reportType}`;
    if (accept.includes('application/pdf')) {
      const pdf = await this.exports.pdf(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${filename}.pdf`,
      );
      res.send(pdf);
    } else if (
      accept.includes('text/csv') ||
      accept.includes('application/csv')
    ) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${filename}.csv`,
      );
      res.send(this.exports.csv(report));
    } else if (
      accept.includes('application/xlsx') ||
      accept.includes(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
    ) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${filename}.xlsx`,
      );
      res.send(this.exports.xlsx(report));
    } else return report;
  }
}
