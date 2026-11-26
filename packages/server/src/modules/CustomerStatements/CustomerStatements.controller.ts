import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiCommonHeaders } from '@/common/decorators/ApiCommonHeaders';
import { RequirePermission } from '@/modules/Roles/RequirePermission.decorator';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { AbilitySubject } from '@/modules/Roles/Roles.types';
import { CustomerAction } from '@/modules/Customers/types/Customers.types';
import { ReportsAction } from '@/modules/FinancialStatements/types/Report.types';
import { CustomerStatementsService } from './CustomerStatements.service';
import {
  SavedStatementPdfDto,
  StatementDraftDto,
} from './CustomerStatements.dto';
import { CustomerStatementsReadGuard } from './CustomerStatementsPermission.guard';

export function statementCustomerIds(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+(,\d+)*$/.test(value))
    throw new BadRequestException('Expected comma-separated customer ids');
  const values = value.split(',').map(Number);
  if (
    values.length > 100 ||
    values.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new BadRequestException('Select between 1 and 100 customers');
  return [...new Set(values)];
}

@Controller('customer-statements')
@ApiTags('Customer Statements')
@ApiCommonHeaders()
@UseGuards(AuthorizationGuard, CustomerStatementsReadGuard, PermissionGuard)
@RequirePermission(
  ReportsAction.READ_CUSTOMERS_TRANSACTIONS,
  AbilitySubject.Report,
)
export class CustomerStatementsController {
  constructor(private readonly statements: CustomerStatementsService) {}

  @Get('recipients')
  @ApiOperation({ summary: 'Retrieve customer statement recipients' })
  @ApiQuery({
    name: 'customerIds',
    required: false,
    type: String,
    description: 'Comma-separated customer ids; omit for active customers',
  })
  recipients(@Query() query: { customerIds?: string }) {
    return this.statements.recipients(statementCustomerIds(query.customerIds));
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview customer statements without saving' })
  preview(@Body() draft: StatementDraftDto) {
    return this.statements.preview(draft);
  }

  @Post('preview/pdf')
  @HttpCode(200)
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Generate customer statement preview PDF without saving',
  })
  async previewPdf(
    @Body() draft: StatementDraftDto,
    @Res() response: Response,
  ) {
    this.sendPdf(
      response,
      await this.statements.previewPdf(draft),
      'customer-statements.pdf',
    );
  }

  @Post('saved/pdf')
  @HttpCode(200)
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Generate combined PDF from immutable saved statement snapshots',
  })
  async savedPdf(
    @Body() input: SavedStatementPdfDto,
    @Res() response: Response,
  ) {
    this.sendPdf(
      response,
      await this.statements.savedPdf(input),
      'customer-statements.pdf',
    );
  }

  @Post()
  @RequirePermission(CustomerAction.Edit, AbilitySubject.Customer)
  @ApiOperation({ summary: 'Save immutable customer statement snapshots' })
  save(@Body() draft: StatementDraftDto) {
    return this.statements.save(draft);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve saved customer statements' })
  @ApiQuery({ name: 'customerId', required: false, type: String })
  list(@Query() query: { customerId?: string }) {
    const ids = statementCustomerIds(query.customerId);
    if (ids?.length > 1)
      throw new BadRequestException('Expected one customer id');
    return this.statements.list(ids?.[0]);
  }

  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Generate PDF from a saved statement snapshot' })
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() response: Response) {
    if (id <= 0)
      throw new BadRequestException('Expected a positive statement id');
    this.sendPdf(
      response,
      await this.statements.pdf(id),
      `statement-${id}.pdf`,
    );
  }

  @Post(':id/send')
  @HttpCode(200)
  @RequirePermission(CustomerAction.Edit, AbilitySubject.Customer)
  @ApiOperation({
    summary: 'Send the saved statement PDF to its saved email recipient',
  })
  send(@Param('id', ParseIntPipe) id: number) {
    if (id <= 0)
      throw new BadRequestException('Expected a positive statement id');
    return this.statements.send(id);
  }

  private sendPdf(response: Response, pdf: Buffer, filename: string): void {
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': pdf.length,
    });
    response.send(pdf);
  }
}
