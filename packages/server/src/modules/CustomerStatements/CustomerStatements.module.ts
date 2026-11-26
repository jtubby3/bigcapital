import { Module } from '@nestjs/common';
import { ChromiumlyTenancyModule } from '@/modules/ChromiumlyTenancy/ChromiumlyTenancy.module';
import { MailModule } from '@/modules/Mail/Mail.module';
import { TenancyModule } from '@/modules/Tenancy/Tenancy.module';
import { TenancyDatabaseModule } from '@/modules/Tenancy/TenancyDB/TenancyDB.module';
import { InjectSystemModel } from '@/modules/System/SystemModels/SystemModels.module';
import { PaymentLink } from '@/modules/PaymentLinks/models/PaymentLink';
import { CustomerStatementPdf } from './CustomerStatementPdf.service';
import { CustomerStatementsController } from './CustomerStatements.controller';
import { CustomerStatementsService } from './CustomerStatements.service';
import { CustomerStatementsReadGuard } from './CustomerStatementsPermission.guard';

@Module({
  imports: [
    TenancyModule,
    TenancyDatabaseModule,
    ChromiumlyTenancyModule,
    MailModule,
  ],
  controllers: [CustomerStatementsController],
  providers: [
    InjectSystemModel(PaymentLink),
    CustomerStatementsService,
    CustomerStatementPdf,
    CustomerStatementsReadGuard,
  ],
})
export class CustomerStatementsModule {}
