import * as FF from 'fp-ts/function';
import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { withDrawers } from '@/containers/Drawer/withDrawers';
import { closeDrawer } from '@/store/dashboard/dashboard.actions';
import { useAppDispatch } from '@/store/hooks';

interface CustomerDetailsDrawerProps {
  name: string;
  isOpen: boolean;
  payload: { customerId?: number };
}

/** Route legacy customer links and search results to the full customer view. */
function CustomerDetailsDrawer({
  name,
  isOpen,
  payload: { customerId },
}: CustomerDetailsDrawerProps) {
  const history = useHistory();
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!isOpen) return;
    dispatch(closeDrawer(name));
    if (Number.isInteger(Number(customerId)) && Number(customerId) > 0) {
      history.push(`/customers/${customerId}`);
    }
  }, [isOpen, customerId, name, history, dispatch]);
  return null;
}
export const index = FF.pipe(CustomerDetailsDrawer, withDrawers());
