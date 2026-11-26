import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
export class CustomerSavedAddressDto {
  @ApiProperty() @IsString() @MaxLength(100) label: string;
  @ApiProperty() @IsString() @MaxLength(2000) address: string;
}
export class CustomerCustomFieldDto {
  @ApiProperty() @IsString() @MaxLength(100) label: string;
  @ApiProperty() @IsString() @MaxLength(2000) value: string;
}
export class CustomerProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentMethod?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  shippingSameAsBilling?: boolean;
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  categories?: string[];
  @ApiProperty({ required: false, type: [CustomerSavedAddressDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CustomerSavedAddressDto)
  addresses?: CustomerSavedAddressDto[];
  @ApiProperty({ required: false, type: [CustomerCustomFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CustomerCustomFieldDto)
  customFields?: CustomerCustomFieldDto[];
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  attachmentKeys?: string[];
}
