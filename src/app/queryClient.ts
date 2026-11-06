import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // خطای 4xx تکرار نمی‌شود؛ فقط خطای شبکه/5xx یک بار.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
    },
    mutations: { retry: false },
  },
});
