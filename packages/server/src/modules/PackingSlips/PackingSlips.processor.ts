import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Scope } from '@nestjs/common';
import { ClsService, UseCls } from 'nestjs-cls';
import { Job } from 'bullmq';
import { PackingSlipsService } from './PackingSlips.service';
export const PACKING_SCAN_QUEUE = 'packing-slip-scan';
@Processor(
  { name: PACKING_SCAN_QUEUE, scope: Scope.REQUEST },
  { concurrency: 1, lockDuration: 1200000 },
)
export class PackingSlipsProcessor extends WorkerHost {
  constructor(
    private readonly slips: PackingSlipsService,
    private readonly cls: ClsService,
  ) {
    super();
  }
  @UseCls()
  async process(
    job: Job<{
      fileId: number;
      organizationId: string;
      userId: number;
      attempt: number;
    }>,
  ) {
    this.cls.set('organizationId', job.data.organizationId);
    this.cls.set('userId', job.data.userId);
    await this.slips.processFile(job.data.fileId, job.data.attempt);
  }
}
