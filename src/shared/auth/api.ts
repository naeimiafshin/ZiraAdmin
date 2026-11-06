import { adminApi, publicApi, tokenStore } from '@/shared/api/client';
import type { AdminSchemas, PublicSchemas } from '@/shared/api/types';

export type StaffLoginInput = PublicSchemas['StaffLoginInput'];
/** پاسخ هر مرحله‌ی ورود کارکنان (2026-10-25): `step` = TOKENS | TWO_FACTOR | PASSWORD_CHANGE. */
export type StaffLoginResponse = PublicSchemas['StaffLoginResponse'];
export type StaffLoginStep = StaffLoginResponse['step'];
export type TwoFactorChallenge = PublicSchemas['StaffTwoFactorChallengeOut'];
export type AdminProfile = AdminSchemas['AdminProfileResponse'];

/**
 * یک مرحله‌ی ورود. فقط وقتی `step = TOKENS` است توکن در حافظه گذاشته می‌شود
 * (در دو مرحله‌ی دیگر `access_token` خالی است و هنوز کوکی refresh صادر نشده).
 */
async function loginStep(path: string, body: unknown): Promise<StaffLoginResponse> {
  const r = await publicApi<StaffLoginResponse>(path, { method: 'POST', body, auth: false });
  if (r.step === 'TOKENS' && r.access_token) tokenStore.set(r.access_token);
  return r;
}

/** POST /public/auth/staff/login — مرحله‌ی اول: نام کاربری و رمز. */
export const staffLogin = (input: StaffLoginInput) => loginStep('/auth/staff/login', input);

/** POST /public/auth/staff/login/verify — کد پیامکی ورود دو مرحله‌ای. */
export const staffVerifyTwoFactor = (challengeId: string, code: string) =>
  loginStep('/auth/staff/login/verify', { challenge_id: challengeId, code });

/** POST /public/auth/staff/login/resend — کد تازه برای همان چالش (هر شماره در ۱۰ دقیقه حداکثر ۳ پیامک). */
export const staffResendTwoFactor = (challengeId: string) =>
  publicApi<TwoFactorChallenge>('/auth/staff/login/resend', { method: 'POST', body: { challenge_id: challengeId }, auth: false });

/** POST /public/auth/staff/password/expired-change — رمز منقضی کارکنان. */
export const staffChangeExpiredPassword = (changeToken: string, newPassword: string) =>
  loginStep('/auth/staff/password/expired-change', { change_token: changeToken, new_password: newPassword });

/* ── بازیابی رمز کارکنان (2026-10-27؛ domains/identity/api/public.py) ──
 * سه گام: درخواست کد با نام کاربری ⇐ تأیید کد ۶ رقمی ⇐ رمز تازه با reset_token یک‌بارمصرف.
 * پاسخ گام اول برای هر نام کاربری یکسان است (وجود حساب افشا نمی‌شود). سرویس خاموش ⇐ ۵۰۳؛ سقف درخواست ⇐ ۴۲۹ با Retry-After. */
export type PasswordResetRequestOut = PublicSchemas['PasswordResetRequestOut'];
export type PasswordResetVerifyOut = PublicSchemas['PasswordResetVerifyOut'];

/** POST /public/auth/staff/password/forgot/request */
export const staffRequestPasswordReset = (username: string) =>
  publicApi<PasswordResetRequestOut>('/auth/staff/password/forgot/request', { method: 'POST', body: { username }, auth: false });

/** POST /public/auth/staff/password/forgot/verify */
export const staffVerifyPasswordReset = (challengeId: string, code: string) =>
  publicApi<PasswordResetVerifyOut>('/auth/staff/password/forgot/verify', { method: 'POST', body: { challenge_id: challengeId, code }, auth: false });

/** POST /public/auth/staff/password/reset — همه‌ی نشست‌های کاربر بسته می‌شوند؛ بعد از آن ورود دوباره. */
export const staffConfirmPasswordReset = (challengeId: string, resetToken: string, newPassword: string, confirmPassword: string) =>
  publicApi<{ message: string }>('/auth/staff/password/reset', {
    method: 'POST',
    body: { challenge_id: challengeId, reset_token: resetToken, new_password: newPassword, confirm_password: confirmPassword },
    auth: false,
  });

/** GET /admin/auth/me — هویت، شعب، مجوزها. فقط STAFF / SUPERADMIN. */
export function fetchMe(signal?: AbortSignal): Promise<AdminProfile> {
  return adminApi<AdminProfile>('/auth/me', { signal });
}

/** POST /public/auth/token/revoke — خروج از همین دستگاه و پاک شدن کوکی. */
export async function revokeSession(): Promise<void> {
  try {
    await publicApi('/auth/token/revoke', { method: 'POST', auth: false });
  } finally {
    tokenStore.set(null);
  }
}
