import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { ToNumber } from '@/common/decorators/Validators';

export class GetItemPriceHistoryQueryDto {
  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 1000 })
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 6;
}

export class ItemPriceChangeDto {
  @ApiProperty() id: number;
  @ApiProperty({ format: 'date-time' }) changedAt: string;
  @ApiProperty({ type: Number, nullable: true }) oldCostPrice: number | null;
  @ApiProperty({ type: Number, nullable: true }) newCostPrice: number | null;
  @ApiProperty({ type: Number, nullable: true }) oldSellPrice: number | null;
  @ApiProperty({ type: Number, nullable: true }) newSellPrice: number | null;
  @ApiProperty({ enum: ['item_edit', 'purchase'] }) source:
    | 'item_edit'
    | 'purchase';
}
