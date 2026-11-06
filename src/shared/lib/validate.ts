import { toFaDigits, toLatinDigits } from './text';

/** همان الگوریتم domains/identity/validators.py */
export function isNationalId(v: string): boolean {
  const n = toLatinDigits(v.trim());
  if (!/^[0-9]{10}$/.test(n)) return false;
  const check = Number(n[9]);
  const sum = Array.from({ length: 9 }, (_, i) => Number(n[i]) * (10 - i)).reduce((a, b) => a + b, 0) % 11;
  return (sum < 2 && check === sum) || (sum >= 2 && check + sum === 11);
}
export function isIban(v: string): boolean {
  const c = toLatinDigits(v).trim().toUpperCase().replace(/\s/g, '');
  if (!c.startsWith('IR') || c.length !== 26) return false;
  const numeric = `${c.slice(4)}1827${c.slice(2, 4)}`;
  if (!/^[0-9]+$/.test(numeric)) return false;
  // mod 97 روی رشته‌ی بلند
  let r = 0;
  for (const ch of numeric) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}
export const isCard = (v: string) => /^[0-9]{16}$/.test(toLatinDigits(v).replace(/[\s-]/g, ''));
export const isPostal = (v: string) => /^[0-9]{10}$/.test(toLatinDigits(v).trim());
export const isMobile = (v: string) => /^09[0-9]{9}$/.test(toLatinDigits(v).trim().replace(/\s/g, '').replace(/^\+98/, '0').replace(/^98/, '0'));
export const clean = (v: string) => toLatinDigits(v).trim();

/**
 * اعتبارسنجی سخت‌گیر موبایل از نظر ارقام (افشین 2026-10-25): فقط رقم، دقیقاً ۱۱ رقم، شروع با ۰۹.
 * خالی ⇐ null (الزامی بودن جدا بررسی می‌شود). پیام فارسی دقیق برای هر خطا.
 */
export function mobileProblem(v: string): string | null {
  const s = toLatinDigits(v ?? '').trim();
  if (!s) return null;
  if (!/^[0-9]+$/.test(s)) return 'شماره موبایل فقط باید رقم باشد.';
  if (s.length !== 11) return `شماره موبایل باید ۱۱ رقم باشد (الان ${toFaDigits(String(s.length))} رقم است).`;
  if (!s.startsWith('09')) return 'شماره موبایل باید با ۰۹ شروع شود.';
  return null;
}

/** هنگام تایپ/چسباندن موبایل: فقط رقم، +۹۸/۰۰۹۸/۹۸ ⇐ ۰، حداکثر ۱۱ رقم، نمایش فارسی (برای `format` روی `Input`). */
export function formatMobileInput(v: string): string {
  let s = toLatinDigits(v ?? '').replace(/[^0-9]/g, '');
  if (s.startsWith('0098')) s = `0${s.slice(4)}`;
  else if (s.startsWith('98') && s.length >= 12) s = `0${s.slice(2)}`;
  return toFaDigits(s.slice(0, 11));
}
