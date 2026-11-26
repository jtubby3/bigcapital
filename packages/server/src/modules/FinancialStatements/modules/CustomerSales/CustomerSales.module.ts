import { Module } from '@nestjs/common';
import { TenancyModule } from '@/modules/Tenancy/Tenancy.module';
import { FinancialSheetCommonModule } from '@/modules/FinancialStatements/common/FinancialSheetCommon.module';
import { CustomerSalesController } from './CustomerSales.controller';
import { CustomerSalesRepository } from './CustomerSalesRepository';
import { CustomerSalesService } from './CustomerSalesService';
import { CustomerSalesExport } from './CustomerSalesExport';

@Module({
  imports: [TenancyModule, FinancialSheetCommonModule],
  controllers: [CustomerSalesController],
  providers: [
    CustomerSalesRepository,
    CustomerSalesService,
    CustomerSalesExport,
  ],
})
export class CustomerSalesModule {}
