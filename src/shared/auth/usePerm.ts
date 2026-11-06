import { useCallback } from 'react';
import { useAuth } from './useAuth';

/** آیا کاربر این مجوز را دارد؟ (فقط برای نمایش؛ تصمیم نهایی با guard بک‌اند است) */
export function usePerm() {
  const { user } = useAuth();
  return useCallback(
    (code: string) => !!user && (user.is_superuser || (user.permission_codes ?? []).includes(code)),
    [user],
  );
}
