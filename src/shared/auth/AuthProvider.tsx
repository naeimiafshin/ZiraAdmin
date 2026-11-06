import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { branchStore, onSessionExpired, refreshAccessToken, tokenStore } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';
import {
  fetchMe, revokeSession, staffChangeExpiredPassword, staffLogin, staffVerifyTwoFactor,
  type AdminProfile, type StaffLoginResponse,
} from './api';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

/** نتیجه‌ی هر مرحله‌ی ورود: یا کاربر وارد شد، یا مرحله‌ی بعد (کد پیامکی / رمز جدید) لازم است. */
export type LoginOutcome =
  | { step: 'TOKENS'; user: AdminProfile }
  | { step: 'TWO_FACTOR' | 'PASSWORD_CHANGE'; response: StaffLoginResponse };

export type AuthContextValue = {
  status: AuthStatus;
  user: AdminProfile | null;
  /** دلیل خروج اجباری (نشست منقضی) برای نمایش در صفحه‌ی ورود. */
  notice: string | null;
  /** خروج دستی بود ⇐ صفحه‌ی قبلی بعد از ورود بعدی بازگردانده نمی‌شود (ممکن است کاربر دیگری وارد شود). */
  explicitLogout: boolean;
  login: (username: string, password: string) => Promise<LoginOutcome>;
  /** مرحله‌ی کد پیامکی (ورود دو مرحله‌ای نقش). */
  verifyTwoFactor: (challengeId: string, code: string) => Promise<LoginOutcome>;
  /** مرحله‌ی رمز منقضی. */
  changeExpiredPassword: (changeToken: string, newPassword: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  /** /auth/me را دوباره می‌خواند (مثلاً بعد از تغییر شعبه‌ی فعال). */
  refreshUser: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

/** شعبه‌ی ذخیره‌شده اگر دیگر جزو شعب کاربر نیست کنار گذاشته می‌شود. */
function reconcileBranch(user: AdminProfile): void {
  const current = branchStore.get();
  if (current && !user.is_superuser && !user.branch_ids?.includes(current)) branchStore.set(null);
}

async function loadMe(): Promise<AdminProfile> {
  try {
    const me = await fetchMe();
    reconcileBranch(me);
    return me;
  } catch (e) {
    // شعبه‌ی ذخیره‌شده‌ی نامعتبر ⇒ 403 از guard؛ بدون هدر دوباره امتحان کن.
    if (e instanceof ApiError && e.status === 403 && branchStore.get()) {
      branchStore.set(null);
      return fetchMe();
    }
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<AdminProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [explicitLogout, setExplicitLogout] = useState(false);
  const booted = useRef(false);

  const clear = useCallback(
    (reason: string | null) => {
      tokenStore.set(null);
      queryClient.clear();
      setUser(null);
      setNotice(reason);
      setStatus('anonymous');
    },
    [queryClient],
  );

  // بازیابی نشست با کوکی refresh هنگام باز شدن/تازه‌سازی صفحه.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const ok = await refreshAccessToken();
      if (!ok) return clear(null);
      try {
        setUser(await loadMe());
        setStatus('authenticated');
      } catch {
        clear(null);
      }
    })();
  }, [clear]);

  useEffect(() => {
    onSessionExpired(() => clear('نشست شما به پایان رسید. لطفاً دوباره وارد شوید.'));
    return () => onSessionExpired(null);
  }, [clear]);

  /** پاسخ یک مرحله‌ی ورود: TOKENS ⇐ /auth/me و ورود؛ دو مرحله‌ی دیگر ⇐ به صفحه‌ی ورود برمی‌گردد. */
  const finish = useCallback(async (r: StaffLoginResponse): Promise<LoginOutcome> => {
    if (r.step !== 'TOKENS') return { step: r.step, response: r };
    try {
      const me = await loadMe();
      setUser(me);
      setNotice(null);
      setExplicitLogout(false);
      setStatus('authenticated');
      return { step: 'TOKENS', user: me };
    } catch (e) {
      // توکن صادر شد ولی پنل ادمین را نمی‌پذیرد (مثلاً حساب مشتری) ⇒ نشست را باطل کن.
      await revokeSession().catch(() => undefined);
      throw e;
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => finish(await staffLogin({ username, password })), [finish]);
  const verifyTwoFactor = useCallback(async (challengeId: string, code: string) => finish(await staffVerifyTwoFactor(challengeId, code)), [finish]);
  const changeExpiredPassword = useCallback(
    async (changeToken: string, newPassword: string) => finish(await staffChangeExpiredPassword(changeToken, newPassword)),
    [finish],
  );

  const logout = useCallback(async () => {
    await revokeSession().catch(() => undefined);
    setExplicitLogout(true);
    clear(null);
  }, [clear]);

  const refreshUser = useCallback(async () => {
    setUser(await loadMe());
  }, []);

  const value = useMemo(
    () => ({ status, user, notice, explicitLogout, login, verifyTwoFactor, changeExpiredPassword, logout, refreshUser }),
    [status, user, notice, explicitLogout, login, verifyTwoFactor, changeExpiredPassword, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
