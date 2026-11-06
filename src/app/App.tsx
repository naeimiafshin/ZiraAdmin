import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AuthProvider } from '@/shared/auth/AuthProvider';
import { TooltipLayer } from '@/shared/ui/TooltipLayer';
import { queryClient } from './queryClient';
import { router } from './router';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <TooltipLayer />
      </AuthProvider>
    </QueryClientProvider>
  );
}
