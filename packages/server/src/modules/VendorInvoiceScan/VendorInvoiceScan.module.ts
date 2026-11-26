import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TenancyModule } from '../Tenancy/Tenancy.module';
import { TenancyDatabaseModule } from '../Tenancy/TenancyDB/TenancyDB.module';
import { RolesModule } from '../Roles/Roles.module';
import { S3Module } from '../S3/S3.module';
import { PackingSlipsModule } from '../PackingSlips/PackingSlips.module';
import { BillsModule } from '../Bills/Bills.module';
import { VendorInvoiceScanController } from './VendorInvoiceScan.controller';
import { VENDOR_SCAN_QUEUE, VendorInvoiceScanService } from './VendorInvoiceScan.service';
import { VendorInvoiceScanProcessor } from './VendorInvoiceScan.processor';
import { VendorInvoiceTelegram } from './VendorInvoiceTelegram.service';

@Module({
  imports: [
    TenancyModule, TenancyDatabaseModule, RolesModule, S3Module, PackingSlipsModule, BillsModule,
    BullModule.registerQueue({ name: VENDOR_SCAN_QUEUE }),
  ],
  providers: [VendorInvoiceScanService, VendorInvoiceScanProcessor, VendorInvoiceTelegram],
  controllers: [VendorInvoiceScanController],
})
export class VendorInvoiceScanModule {}
