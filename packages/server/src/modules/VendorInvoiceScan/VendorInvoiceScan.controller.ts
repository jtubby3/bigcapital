import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query,
  Res, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiCommonHeaders } from '@/common/decorators/ApiCommonHeaders';
import { MAX_SCAN_BYTES } from '../PackingSlips/packingSlipValidation';
import { VENDOR_SCAN_MAX_FILES, VendorInvoiceScanService } from './VendorInvoiceScan.service';
import { VendorInvoiceTelegram } from './VendorInvoiceTelegram.service';
import type { OptionKind, Review } from './vendorScanTypes';

@Controller('vendor-invoice-scans')
@ApiTags('Vendor Invoice Scans')
@ApiCommonHeaders()
export class VendorInvoiceScanController {
  constructor(private readonly scans: VendorInvoiceScanService, private readonly telegram: VendorInvoiceTelegram) {}

  @Get()
  list() {
    return this.scans.list();
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', VENDOR_SCAN_MAX_FILES, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_SCAN_BYTES, files: VENDOR_SCAN_MAX_FILES, fields: 0 },
  }))
  upload(@UploadedFiles() files: Express.Multer.File[]) {
    return this.scans.upload(files);
  }

  @Get('options')
  options(@Query('kind') kind: OptionKind, @Query('search') search: string) {
    return this.scans.options(kind, search);
  }

  @Get('telegram/connection')
  connection() {
    return this.telegram.connection();
  }

  @Post('telegram/pair')
  pair() {
    return this.telegram.pair();
  }

  @Delete('telegram/connection')
  disconnect() {
    return this.telegram.disconnect();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.scans.get(id);
  }

  @Get(':id/files/:fileId/pages/:page')
  async page(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Param('page', ParseIntPipe) page: number,
    @Res() res: Response,
  ) {
    const image = await this.scans.page(id, fileId, page);
    res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff').type('png').send(image);
  }

  @Put(':id')
  save(@Param('id', ParseIntPipe) id: number, @Body() body: { version: number; review: Review }) {
    return this.scans.save(id, body?.version, body?.review);
  }

  @Get(':id/preview')
  preview(@Param('id', ParseIntPipe) id: number) {
    return this.scans.preview(id);
  }

  @Post(':id/post')
  post(@Param('id', ParseIntPipe) id: number, @Body() body: { version: number; previewToken: string }) {
    return this.scans.post(id, body?.version, body?.previewToken);
  }

  @Post(':id/retry')
  retry(@Param('id', ParseIntPipe) id: number, @Body() body: { version: number }) {
    return this.scans.retry(id, body?.version);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() body: { version: number }) {
    return this.scans.cancel(id, body?.version);
  }
}
