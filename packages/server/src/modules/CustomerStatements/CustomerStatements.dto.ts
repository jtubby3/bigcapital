import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { StatementType } from './CustomerStatements.types';

export class StatementRecipientDto {
  @ApiProperty() @Allow() customerId: number;
  @ApiPropertyOptional() @Allow() email?: string;
}

// The domain validator enforces real calendar dates, period order and deduplicated recipients.
export class StatementDraftDto {
  @ApiProperty({ enum: ['balance-forward', 'open-item', 'transaction'] })
  @Allow()
  statementType: StatementType;
  @ApiProperty({ example: '2026-01-31' }) @Allow() statementDate: string;
  @ApiProperty({ example: '2026-01-01' }) @Allow() fromDate: string;
  @ApiProperty({ example: '2026-01-31' }) @Allow() toDate: string;
  @ApiProperty() @Allow() includePaymentLinks: boolean;
  @ApiProperty({ type: [StatementRecipientDto] })
  @Allow()
  recipients: StatementRecipientDto[];
}

export class SavedStatementPdfDto {
  @ApiProperty({ type: [Number], minItems: 1, maxItems: 100 })
  @Allow()
  ids: number[];
}
