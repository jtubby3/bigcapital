import { LocationDescriptorObject } from 'history';
import { useLocation } from 'react-router-dom';

/** Only customer-originated transaction screens override the normal list destination. */
export function useCustomerReturnTo(): LocationDescriptorObject | undefined {
  const { state } = useLocation<{
    customerReturnTo?: LocationDescriptorObject;
  }>();
  const target = state?.customerReturnTo;
  return target &&
    typeof target.pathname === 'string' &&
    /^\/customers\/\d+$/.test(target.pathname)
    ? target
    : undefined;
}
