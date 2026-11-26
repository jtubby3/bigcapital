import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../EE/AuditLogs/AuditLogs.module';
import { ItemPriceHistoryService } from './ItemPriceHistory.service';

@Module({
  imports: [AuditLogsModule],
  providers: [ItemPriceHistoryService],
  exports: [ItemPriceHistoryService],
})
export class ItemPriceHistoryModule {}
