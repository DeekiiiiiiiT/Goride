import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AdminAuthProvider } from '@/app/auth/AdminAuthProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const EnterpriseAdminPage = lazy(() =>
  import('@/app/admin/EnterpriseAdminPage').then((m) => ({ default: m.EnterpriseAdminPage })),
);

/** Product-ops /admin — uses supabaseEnterpriseAdmin (isolated from tenant /app). */
export default function AdminEntry() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <Toaster richColors position="top-right" />
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
              Loading…
            </div>
          }
        >
          <EnterpriseAdminPage />
        </Suspense>
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}
