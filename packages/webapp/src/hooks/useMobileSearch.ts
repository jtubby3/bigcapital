import { useHistory, useLocation } from 'react-router-dom';
import { usePhoneLayout } from './usePhoneLayout';

/** Mobile search stays in the URL and is ignored by the desktop data providers. */
export function useMobileSearch() {
  const location = useLocation();
  const history = useHistory();
  const isPhone = usePhoneLayout();
  const query = isPhone
    ? new URLSearchParams(location.search).get('mobile_search') || ''
    : '';

  const submit = (value: string) => {
    const params = new URLSearchParams(location.search);
    if (value.trim()) params.set('mobile_search', value.trim());
    else params.delete('mobile_search');
    history.replace({ ...location, search: params.toString() });
  };
  return { query, submit, isPhone };
}
