import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsArray, IsOptional } from 'class-validator';
import * as moment from 'moment';
import { CustomerSalesQuery } from './CustomerSales.types';

export class CustomerSalesQueryDto implements CustomerSalesQuery {
  @ApiProperty({ enum: ['summary', 'detail', 'income'] })
  @IsIn(['summary', 'detail', 'income'])
  reportType: CustomerSalesQuery['reportType'];

  @ApiProperty({ example: '2026-01-01' })
  @IsString()
  fromDate: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsString()
  toDate: string;

  @ApiProperty({ enum: ['cash', 'accrual'] })
  @IsIn(['cash', 'accrual'])
  basis: CustomerSalesQuery['basis'];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  customerIds?: number[];
}

// Validate again at the service boundary so exports and direct callers share it.
export function validateCustomerSalesQuery(input: any): CustomerSalesQuery {
  if (!['summary', 'detail', 'income'].includes(input.reportType)) {
    throw new BadRequestException(
      'report_type must be summary, detail, or income.',
    );
  }
  if (!['cash', 'accrual'].includes(input.basis)) {
    throw new BadRequestException('basis must be cash or accrual.');
  }
  for (const key of ['fromDate', 'toDate']) {
    if (
      typeof input[key] !== 'string' ||
      !moment(input[key], 'YYYY-MM-DD', true).isValid()
    ) {
      throw new BadRequestException(
        'from_date and to_date must be valid YYYY-MM-DD dates.',
      );
    }
  }
  if (input.fromDate > input.toDate) {
    throw new BadRequestException('from_date must be on or before to_date.');
  }
  let customerIds: number[] | undefined;
  if (input.customerIds !== undefined) {
    if (
      !Array.isArray(input.customerIds) ||
      input.customerIds.some(
        (id) =>
          !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)),
      )
    ) {
      throw new BadRequestException(
        'customer_ids must be an array of positive integer IDs.',
      );
    }
    customerIds = [...new Set<number>(input.customerIds.map(Number))];
  }
  return {
    reportType: input.reportType,
    fromDate: input.fromDate,
    toDate: input.toDate,
    basis: input.basis,
    customerIds,
  };
}
