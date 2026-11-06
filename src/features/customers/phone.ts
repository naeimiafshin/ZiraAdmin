import { toLatinDigits } from '@/shared/lib/text';

/**
 * اعتبارسنجی شماره‌ها در مدیریت مشتریان (افشین 2026-10-25): هر جا موبایل یا تلفن وارد می‌شود، قبل از ثبت یا رفتن به مرحله‌ی بعد.
 * ارقام فارسی/عربی، فاصله، خط تیره و پرانتز پذیرفته و حذف می‌شوند؛ +98 / 0098 / 98 به ۰ تبدیل می‌شود.
 */
export const normPhone = (v: string | null | undefined) =>
  toLatinDigits(v ?? '').replace(/[\s\-()]/g, '').replace(/^(\+98|0098)/, '0').replace(/^98(?=9\d{9}$)/, '0');
/** موبایل: دقیقاً ۱۱ رقم و با ۰۹ */
export const isMobileNo = (v: string | null | undefined) => /^09\d{9}$/.test(normPhone(v));
/** تلفن (ثابت با پیش‌شماره یا موبایل): دقیقاً ۱۱ رقم و با ۰ */
export const isPhoneNo = (v: string | null | undefined) => /^0\d{10}$/.test(normPhone(v));
export const MOBILE_MSG = 'موبایل باید ۱۱ رقم و با ۰۹ شروع شود (مثل ۰۹۱۲۱۲۳۴۵۶۷).';
export const PHONE_MSG = 'شماره باید ۱۱ رقم و با ۰ شروع شود (با پیش‌شماره، مثل ۰۲۱۸۸۸۸۸۸۸۸).';
/** قاعده‌ی RHF برای فیلد اختیاری */
export const optMobile = (v: string) => !v.trim() || isMobileNo(v) || MOBILE_MSG;
export const optPhone = (v: string) => !v.trim() || isPhoneNo(v) || PHONE_MSG;
