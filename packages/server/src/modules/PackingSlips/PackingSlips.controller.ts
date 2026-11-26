import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ApiCommonHeaders } from '@/common/decorators/ApiCommonHeaders';
import { AuthorizationGuard } from '../Roles/Authorization.guard';
import { PackingSlipsGuard } from './PackingSlips.guard';
import { PackingSlipsService } from './PackingSlips.service';
import {
  ConfirmPackingSlipDto,
  PackingSlipVersionDto,
  RegroupPackingSlipsDto,
} from './PackingSlips.dto';
import { MAX_SCAN_BYTES } from './packingSlipValidation';
@Controller('packing-slips')
@ApiTags('Packing Slips')
@ApiCommonHeaders()
@UseGuards(AuthorizationGuard, PackingSlipsGuard)
export class PackingSlipsController {
  constructor(private readonly slips: PackingSlipsService) {}
  @Get('health')
  @ApiOperation({ summary: 'Check local scan recognition availability' })
  health() {
    return this.slips.health();
  }
  @Get('mail-jobs/:id') mailJob(@Param('id') id: string) {
    return this.slips.mailJobStatus(id);
  }
  @Get('batches')
  @ApiOperation({ summary: 'List recent packing scan batches' })
  list() {
    return this.slips.listBatches();
  }
  @Post('batches')
  @ApiOperation({ summary: 'Create packing scan batch' })
  create() {
    return this.slips.createBatch();
  }
  @Get('batches/:id')
  @ApiOperation({ summary: 'Get packing scan batch progress and matches' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.slips.getBatch(id);
  }
  @Post('batches/:id/files')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SCAN_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.slips.addFile(id, file);
  }
  @Post('batches/:id/cancel') @HttpCode(200) cancel(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.slips.cancel(id);
  }
  @Post('files/:id/retry') @HttpCode(200) retry(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.slips.retry(id);
  }
  @Post('files/:id/regroup') @HttpCode(200) regroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RegroupPackingSlipsDto,
  ) {
    return this.slips.regroup(id, body.groups, body.versions);
  }
  @Get('files/:id/pages/:page') async page(
    @Param('id', ParseIntPipe) id: number,
    @Param('page', ParseIntPipe) page: number,
    @Res() res: Response,
  ) {
    const bytes = await this.slips.preview(id, page);
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(bytes);
  }
  @Get('candidates') candidates(@Query('search') search?: string) {
    return this.slips.candidates(
      typeof search === 'string' ? search.slice(0, 200) : '',
    );
  }
  @Post('slips/:id/confirm') @HttpCode(200) confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ConfirmPackingSlipDto,
  ) {
    return this.slips.confirm(
      id,
      body.invoiceId,
      body.version,
      true,
      body.invoiceFingerprint,
    );
  }
  @Post('slips/:id/detach') @HttpCode(200) detach(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PackingSlipVersionDto,
  ) {
    return this.slips.detach(id, body.version);
  }
  @Post('slips/:id/ignore') @HttpCode(200) ignore(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PackingSlipVersionDto,
  ) {
    return this.slips.detach(id, body.version, true);
  }
  @Get('slips/:id/pdf') async pdf(
    @Param('id', ParseIntPipe) id: number,
    @Query('version') version: string | undefined,
    @Res() res: Response,
  ) {
    const bytes = await this.slips.pdf(
      id,
      version === undefined ? undefined : Number(version),
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="packing-slip-${id}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(bytes);
  }
  @Get('invoices/:id') invoice(@Param('id', ParseIntPipe) id: number) {
    return this.slips.listInvoice(id);
  }
}
