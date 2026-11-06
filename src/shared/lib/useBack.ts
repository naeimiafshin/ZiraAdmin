import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/**
 * «بازگشت» = صفحه‌ای که کاربر از آن آمده (افشین 2026-10-21، قانون سراسری؛ RULES ۵).
 * اگر تاریخچه‌ی داخل پنل دارد ⇐ navigate(-1). اگر صفحه مستقیم باز شده (لینک، تب تازه، رفرش اولین صفحه) ⇐ fallback
 * (صفحه‌ی فهرست والد) با replace. تغییر تب/فیلتر درون صفحه با replace انجام می‌شود تا در تاریخچه نیاید.
 */
export function useBack(fallback: string) {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
