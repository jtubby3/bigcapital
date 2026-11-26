import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AnyAbility } from '@casl/ability';
import { AbilitySubject } from '@/modules/Roles/Roles.types';
import { ReportsAction } from '@/modules/FinancialStatements/types/Report.types';
import { CustomerAction } from '@/modules/Customers/types/Customers.types';

@Injectable()
export class CustomerStatementsReadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { ability } = context
      .switchToHttp()
      .getRequest<{ ability?: AnyAbility }>();
    if (
      !ability?.can(CustomerAction.View, AbilitySubject.Customer) ||
      !ability.can(
        ReportsAction.READ_CUSTOMERS_TRANSACTIONS,
        AbilitySubject.Report,
      )
    ) {
      throw new ForbiddenException(
        'Customer statements require customer view and customer transactions report permissions',
      );
    }
    return true;
  }
}
