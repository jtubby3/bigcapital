import { useMediaQuery } from './useMediaQuery';

// Keep the landscape rule limited to touch phones, leaving desktop windows alone.
export const PHONE_LAYOUT_QUERY =
  '(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (pointer: coarse)';

export function usePhoneLayout(): boolean {
  return !!useMediaQuery(PHONE_LAYOUT_QUERY, undefined, {
    getInitialValueInEffect: false,
  });
}
