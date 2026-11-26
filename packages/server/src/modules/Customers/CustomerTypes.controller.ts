import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiCommonHeaders } from '@/common/decorators/ApiCommonHeaders';
import {
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { AuthorizationGuard } from '../Roles/Authorization.guard';
import { PermissionGuard } from '../Roles/Permission.guard';
import { RequirePermission } from '../Roles/RequirePermission.decorator';
import { AbilitySubject } from '../Roles/Roles.types';
import { CustomerAction } from './types/Customers.types';
import { CustomerTypesService } from './CustomerTypes.service';

export class CreateCustomerTypeDto {
  @ApiProperty({ maxLength: 100, example: 'Restaurants' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

@Controller('customer-types')
@ApiTags('Customers')
@ApiCommonHeaders()
@UseGuards(AuthorizationGuard, PermissionGuard)
export class CustomerTypesController {
  constructor(private readonly service: CustomerTypesService) {}

  @Get()
  @RequirePermission(CustomerAction.View, AbilitySubject.Customer)
  @ApiOperation({
    summary:
      'Lists customer types, including types already assigned to customers.',
  })
  @ApiResponse({ status: 200, type: [String] })
  list(): Promise<string[]> {
    return this.service.list();
  }

  @Post()
  @RequirePermission(CustomerAction.Edit, AbilitySubject.Customer)
  @ApiOperation({ summary: 'Adds a reusable customer type for this company.' })
  @ApiResponse({ status: 201, type: [String] })
  @ApiResponse({
    status: 409,
    description: 'The customer type already exists.',
  })
  create(@Body() body: CreateCustomerTypeDto): Promise<string[]> {
    return this.service.create(body.name);
  }
}
