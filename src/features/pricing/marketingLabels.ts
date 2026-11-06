import type { Tone } from '@/shared/ui/kit';

/** برچسب‌های بازاریابی — مرجع enumها: domains/pricing/schemas/enums.py؛ نام‌ها از html V2 */
export const DISCOUNT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' }, ACTIVE: { label: 'معتبر', tone: 'success' }, INACTIVE: { label: 'غیرفعال', tone: 'warning' }, ARCHIVED: { label: 'آرشیوشده', tone: 'neutral' },
};
/** وضعیت نمایشی تخفیف: منقضی (validity=EXPIRED) بر فعال/غیرفعال مقدم است (مثل html) */
export const discountBadge = (d: { status: string; validity: string }): { label: string; tone: Tone } =>
  d.status !== 'DRAFT' && d.status !== 'ARCHIVED' && d.validity === 'EXPIRED' ? { label: 'منقضی شده', tone: 'danger' }
    : d.status === 'ACTIVE' && d.validity === 'SCHEDULED' ? { label: 'زمان‌بندی‌شده', tone: 'info' } : DISCOUNT_STATUS[d.status] ?? { label: d.status, tone: 'neutral' };
export const VALUE_TYPE: Record<string, string> = { PERCENT: 'درصدی', AMOUNT: 'مبلغی', FREE_SHIPPING: 'ارسال رایگان' };
export const COOP_LEVEL: Record<string, string> = { BRONZE: 'برنزی', SILVER: 'نقره‌ای', GOLD: 'طلایی' };
export const PHASE: Record<string, { label: string; tone: Tone }> = {
  SCHEDULED: { label: 'زمان‌بندی‌شده', tone: 'info' }, RUNNING: { label: 'در حال اجرا', tone: 'success' }, ENDED: { label: 'پایان‌یافته', tone: 'neutral' },
};
export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' }, PUBLISHED: { label: 'منتشرشده', tone: 'success' }, DISABLED: { label: 'غیرفعال', tone: 'warning' }, ARCHIVED: { label: 'آرشیوشده', tone: 'neutral' },
};
/** ماهیت کمپین (نام، توضیح، رنگ) از بک‌اند می‌آید: useCampaignNatures در marketingApi.ts؛ گرادیان کارت با natureGradient (features/settings/natureColor.ts) — 2026-10-24 */
