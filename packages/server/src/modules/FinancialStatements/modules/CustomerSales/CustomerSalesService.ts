import { Injectable } from '@nestjs/common';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { CustomerSalesRepository } from './CustomerSalesRepository';
import {
  CustomerSalesQueryDto,
  validateCustomerSalesQuery,
} from './CustomerSalesQuery.dto';
import { buildCustomerSalesReport } from './CustomerSales';
import { CustomerSalesReport } from './CustomerSales.types';

@Injectable()
export class CustomerSalesService {
  constructor(
    private readonly repository: CustomerSalesRepository,
    private readonly tenancyContext: TenancyContext,
  ) {}

  async sheet(input: CustomerSalesQueryDto): Promise<CustomerSalesReport> {
    const query = validateCustomerSalesQuery(input);
    const [data, metadata] = await Promise.all([
      this.repository.get(query),
      this.tenancyContext.getTenantMetadata(),
    ]);
    return buildCustomerSalesReport(
      query,
      data.entries,
      data.documents,
      data.customers,
      metadata,
    );
  }
}
