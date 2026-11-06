import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageLoader } from '@/shared/ui/FullPageLoader';
import { useAuth } from './useAuth';

/** مسیرهای پنل: فقط کاربر واردشده. */
export function RequireAuth() {
  const { status, explicitLogout } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <FullPageLoader />;
  if (status === 'anonymous') {
    // نشست منقضی یا لینک مستقیم ⇐ بعد از ورود به همین صفحه برمی‌گردد؛ خروج دستی ⇐ نه.
    const from = explicitLogout ? undefined : location.pathname + location.search;
    return <Navigate to="/login" replace state={from ? { from } : null} />;
  }
  return <Outlet />;
}

/** صفحه‌ی ورود: کاربر واردشده به پنل برمی‌گردد. */
export function RedirectIfAuthenticated() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <FullPageLoader />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
  return <Outlet />;
}
