import type { Tone } from '@/shared/ui/kit';

/**
 * نام فارسی دامنه‌ها = `DOMAIN_DECLARATION.name` در فایل permissions.py هر دامنه بک‌اند (2026-10-25).
 * بک‌اند نام دامنه را در خروجی لاگ و کاتالوگ رخدادها نمی‌دهد (کمبود E-05)؛ دامنه‌ی ناشناخته با کد خودش نمایش داده می‌شود.
 */
export const DOMAIN: Record<string, string> = {
  catalog: 'محصولات و کاتالوگ', chat: 'گفت‌وگوهای خصوصی', cms: 'مدیریت محتوا', customers: 'مدیریت مشتریان',
  events: 'رخدادها و امنیت', identity: 'مدیریت کاربران', organization: 'مدیریت شعب', pricing: 'قیمت‌گذاری',
  rbac: 'نقش‌ها و دسترسی‌ها', sales: 'سبدهای خرید', settings: 'تنظیمات', support: 'مدیریت تیکت‌ها', wms: 'مدیریت انبار',
};
export const domainName = (code?: string | null) => (code ? DOMAIN[code] ?? code : '—');

export const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  INFO: { label: 'اطلاعی', tone: 'info' }, WARNING: { label: 'هشدار', tone: 'warning' }, CRITICAL: { label: 'بحرانی', tone: 'danger' },
};
export const RESULT: Record<string, { label: string; tone: Tone }> = {
  SUCCESS: { label: 'موفق', tone: 'success' }, FAILURE: { label: 'ناموفق', tone: 'danger' }, DENIED: { label: 'رد شده', tone: 'warning' },
};
export const ACTOR_KIND: Record<string, string> = { USER: 'کاربر', SYSTEM: 'سیستم', ANONYMOUS: 'ناشناس' };
export const CATEGORY: Record<string, string> = { OPERATIONAL: 'عملیاتی', SECURITY: 'امنیتی', FINANCIAL: 'مالی', SYSTEM: 'سیستمی' };

const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
/** زمان نسبی فارسی («۵ دقیقه پیش») */
export function relTime(iso?: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - now) / 1000;
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(Math.round(diff), 'second');
  if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (a < 30 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
  if (a < 365 * 86400) return rtf.format(Math.round(diff / (30 * 86400)), 'month');
  return rtf.format(Math.round(diff / (365 * 86400)), 'year');
}
