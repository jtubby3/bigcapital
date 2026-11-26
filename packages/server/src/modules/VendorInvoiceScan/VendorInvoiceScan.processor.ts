import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Scope } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService, UseCls } from 'nestjs-cls';
import { VENDOR_SCAN_QUEUE, VendorInvoiceScanService } from './VendorInvoiceScan.service';

@Processor(
  { name: VENDOR_SCAN_QUEUE, scope: Scope.REQUEST },
  { concurrency: 1, lockDuration: 1200000 },
)
export class VendorInvoiceScanProcessor extends WorkerHost {
  constructor(private readonly scans: VendorInvoiceScanService, private readonly cls: ClsService) {
    super();
  }

  @UseCls()
  async process(job: Job<{ id: number; version: number; userId: number; organizationId: string }>) {
    const { id, version, userId, organizationId } = job.data;
    this.cls.set('userId', userId);
    this.cls.set('organizationId', organizationId);
    await this.scans.process(id, version, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
  }
}
