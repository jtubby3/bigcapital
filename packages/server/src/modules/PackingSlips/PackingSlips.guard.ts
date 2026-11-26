import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AbilitySubject } from '../Roles/Roles.types';
import { SaleInvoiceAction } from '../SaleInvoices/SaleInvoice.types';
import { AttachmentAction } from '../Attachments/Attachments.types';
export function requirePackingAccess(
  ability: { can(action: string, subject: string): boolean },
  write = false,
  remove = false,
) {
  const needed: [string, string][] = [
    [SaleInvoiceAction.View, AbilitySubject.SaleInvoice],
    [AttachmentAction.View, AbilitySubject.Attachment],
  ];
  if (write)
    needed.push(
      [SaleInvoiceAction.Edit, AbilitySubject.SaleInvoice],
      [AttachmentAction.Create, AbilitySubject.Attachment],
    );
  if (remove) needed.push([AttachmentAction.Delete, AbilitySubject.Attachment]);
  if (
    !ability ||
    needed.some(([action, subject]) => !ability.can(action, subject))
  )
    throw new ForbiddenException(
      'Packing slips require invoice and attachment permissions.',
    );
}
@Injectable()
export class PackingSlipsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (context.getHandler().name === 'mailJob') {
      if (!req.ability?.can(SaleInvoiceAction.Edit, AbilitySubject.SaleInvoice))
        throw new ForbiddenException(
          'Invoice email status requires invoice edit permission.',
        );
      return true;
    }
    requirePackingAccess(
      req.ability,
      req.method !== 'GET',
      /\/(detach|regroup|ignore)(?:\?|$)/.test(req.originalUrl || req.url),
    );
    return true;
  }
}
