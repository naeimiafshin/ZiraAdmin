import type { Tone } from '@/shared/ui/kit';

/** برچسب‌های فارسی enumهای قیمت‌گذاری — مرجع: domains/pricing/models و schemas (نام‌ها از html V2) */
export const PL_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' }, SCHEDULED: { label: 'زمان‌بندی‌شده', tone: 'info' }, PUBLISHED: { label: 'منتشرشده', tone: 'success' }, CANCELLED: { label: 'لغوشده', tone: 'danger' },
};
export const PL_SOURCE: Record<string, string> = { MANUAL: 'دستی', CONTRACT: 'از قرارداد', IMPORT: 'ورود از اکسل' };
export const ROUNDING: Record<string, string> = { NONE: 'بدون گرد کردن', R1000: 'گرد به ۱٬۰۰۰ ریال', R10000: 'گرد به ۱۰٬۰۰۰ ریال', R100000: 'گرد به ۱۰۰٬۰۰۰ ریال' };
export const CHANNEL: Record<string, string> = { ALL: 'همه کانال‌ها', ONLINE: 'فروشگاه آنلاین', APP: 'اپلیکیشن', IN_STORE: 'شعب حضوری' };
export const COOP: Record<string, string> = { BRONZE: 'برنزی', SILVER: 'نقره‌ای', GOLD: 'طلایی' };
