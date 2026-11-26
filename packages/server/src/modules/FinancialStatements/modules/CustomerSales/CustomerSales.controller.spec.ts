import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Ability } from '@casl/ability';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { ValidationPipe } from '@/common/pipes/ClassValidation.pipe';
import { CustomerSalesController } from './CustomerSales.controller';
import {
  CustomerSalesQueryDto,
  validateCustomerSalesQuery,
} from './CustomerSalesQuery.dto';
import { ReportsAction } from '@/modules/FinancialStatements/types/Report.types';
import { AbilitySubject } from '@/modules/Roles/Roles.types';

const query = {
  reportType: 'summary',
  fromDate: '2026-01-01',
  toDate: '2026-12-31',
  basis: 'accrual',
};
describe('customer sales controller', () => {
  const context = (ability: Ability) =>
    ({
      getHandler: () => CustomerSalesController.prototype.report,
      getClass: () => CustomerSalesController,
      switchToHttp: () => ({ getRequest: () => ({ ability }) }),
    }) as any;
  it('denies every representation without the customer transaction report permission', () => {
    expect(() =>
      new PermissionGuard(new Reflector()).canActivate(
        context(new Ability([])),
      ),
    ).toThrow(ForbiddenException);
  });
  it('allows the existing customer transaction report permission', () => {
    expect(
      new PermissionGuard(new Reflector()).canActivate(
        context(
          new Ability([
            {
              action: ReportsAction.READ_CUSTOMERS_TRANSACTIONS,
              subject: AbilitySubject.Report,
            },
          ] as any),
        ),
      ),
    ).toBe(true);
  });
  it('preserves validated query fields through the global whitelist pipe', async () => {
    const result = await new ValidationPipe().transform(
      { ...query, customerIds: ['7'] },
      { type: 'query', metatype: CustomerSalesQueryDto },
    );
    expect(validateCustomerSalesQuery(result)).toEqual({
      ...query,
      customerIds: [7],
    });
  });
  it.each([
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ])('rejects invalid dates before fetching %s', async (accept) => {
    const service = {
      sheet: async () => {
        throw new Error('unexpected database access');
      },
    };
    const controller = new CustomerSalesController(service as any, {} as any);
    await expect(
      controller.report({ ...query, toDate: 'bad' } as any, {} as any, accept),
    ).rejects.toThrow(BadRequestException);
  });
});
