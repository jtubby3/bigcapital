import { BaseModel } from '@/models/Model';
import { StatementSnapshot, StatementType } from './CustomerStatements.types';

export class CustomerStatement extends BaseModel {
  customerId: number;
  statementType: StatementType;
  statementDate: string;
  fromDate: string;
  toDate: string;
  email: string;
  status: 'saved' | 'sent';
  snapshot: StatementSnapshot;
  createdAt: Date | string;
  sentAt?: Date | string;

  static get tableName() {
    return 'customer_statements';
  }
  static get jsonAttributes() {
    return ['snapshot'];
  }
  get timestamps() {
    return ['createdAt'];
  }
}
