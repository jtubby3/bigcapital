import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthOrganizationId, useAuthToken } from '@/hooks/state';

export function useCustomerTypes(enabled = true) {
  const token = useAuthToken();
  const organization = useAuthOrganizationId();
  return useQuery<string[]>({
    queryKey: ['customer-types', organization],
    enabled,
    queryFn: async () => {
      const response = await fetch('/api/customer-types', {
        headers: {
          Authorization: `Bearer ${token}`,
          'organization-id': organization || '',
        },
      });
      if (!response.ok)
        throw new Error('Unable to load customer types. Please try again.');
      return response.json();
    },
  });
}

export function useCreateCustomerType() {
  const token = useAuthToken();
  const organization = useAuthOrganizationId();
  const queryClient = useQueryClient();
  return useMutation<string[], Error, string>({
    mutationFn: async (name) => {
      const response = await fetch('/api/customer-types', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'organization-id': organization || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? 'This customer type already exists.'
            : 'Unable to save the customer type. Please try again.',
        );
      }
      return response.json();
    },
    onSuccess: (types) => {
      queryClient.setQueryData(['customer-types', organization], types);
    },
  });
}
