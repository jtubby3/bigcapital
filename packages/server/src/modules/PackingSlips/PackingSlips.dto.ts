import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Min,
  IsString,
  Length,
} from 'class-validator';
export class ConfirmPackingSlipDto {
  @ApiProperty() @IsString() @Length(64, 64) invoiceFingerprint: string;
  @ApiProperty() @IsInt() @Min(1) invoiceId: number;
  @ApiProperty() @IsInt() @Min(1) version: number;
}
export class PackingSlipVersionDto {
  @ApiProperty() @IsInt() @Min(1) version: number;
}
export class RegroupPackingSlipsDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'integer' } },
  })
  @IsArray()
  @ArrayMaxSize(200)
  groups: number[][];
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(200) versions: {
    id: number;
    version: number;
  }[];
}
