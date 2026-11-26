import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TenancyModule } from '../Tenancy/Tenancy.module';
import { TenancyDatabaseModule } from '../Tenancy/TenancyDB/TenancyDB.module';
import { RolesModule } from '../Roles/Roles.module';
import { S3Module } from '../S3/S3.module';
import { PackingSlipsService } from './PackingSlips.service';
import { PackingSlipsController } from './PackingSlips.controller';
import { PackingSlipsGuard } from './PackingSlips.guard';
import { LocalPackingScan } from './LocalPackingScan';
import { PackingSlipsProcessor } from './PackingSlips.processor';
@Module({
  imports: [
    TenancyModule,
    TenancyDatabaseModule,
    RolesModule,
    S3Module,
    BullModule.registerQueue(
      { name: 'packing-slip-scan' },
      { name: 'SendSaleInvoiceQueue' },
    ),
  ],
  providers: [
    PackingSlipsService,
    PackingSlipsGuard,
    LocalPackingScan,
    PackingSlipsProcessor,
  ],
  controllers: [PackingSlipsController],
  exports: [PackingSlipsService, LocalPackingScan],
})
export class PackingSlipsModule {}
