import type { Tone } from '@/shared/ui/kit';
import type { BranchStatus } from './api';

/** وضعیت شعبه (BranchStatus بک‌اند). «بسته» نهایی است (DELETE /branches/{id}). */
export const BRANCH_STATUS: Record<BranchStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'فعال', tone: 'success' },
  INACTIVE: { label: 'غیرفعال', tone: 'neutral' },
  CLOSED: { label: 'بسته', tone: 'danger' },
};

/** رنگ ثابت نشان کارت هر شعبه (مثل html Fixed؛ از روی کد شعبه، فقط برای تمایز بصری) */
const MARK = ['#D98AA3', '#8FB3D9', '#C9A06E', '#9CC4A0', '#B79BD2', '#E2A27C', '#7FBFBF', '#C98C95'];
export const branchMarkColor = (seed: string) => MARK[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % MARK.length]!;

/** شیفت کاری (BranchEmployeeShift) */
export const SHIFT: Record<string, string> = { FULL_DAY: 'تمام‌وقت', MORNING: 'شیفت صبح', EVENING: 'شیفت عصر' };
export const SHIFT_OPTIONS = Object.entries(SHIFT).map(([value, label]) => ({ value, label }));

/** روزهای هفته‌ی working_hours (ترتیب ایرانی) */
export const WEEKDAYS: { key: string; label: string }[] = [
  { key: 'saturday', label: 'شنبه' }, { key: 'sunday', label: 'یکشنبه' }, { key: 'monday', label: 'دوشنبه' }, { key: 'tuesday', label: 'سه‌شنبه' },
  { key: 'wednesday', label: 'چهارشنبه' }, { key: 'thursday', label: 'پنجشنبه' }, { key: 'friday', label: 'جمعه' },
];

/** مجوزهای فروش شعبه (BranchPermitSchema). «قیمت‌گذاری مجدد» html با تصمیم 2026-09-29 حذف است. */
export const PERMITS: { key: 'allow_credit_sale' | 'allow_cheque_sale' | 'allow_consignment_sale' | 'allow_scrap_entry'; label: string; hint: string }[] = [
  { key: 'allow_credit_sale', label: 'فروش اعتباری', hint: 'فروش با اعتبار طلایی مشتری در این شعبه' },
  { key: 'allow_cheque_sale', label: 'فروش چکی', hint: 'دریافت چک به‌عنوان روش پرداخت در این شعبه' },
  { key: 'allow_consignment_sale', label: 'فروش امانی', hint: 'تحویل کالا به‌صورت امانی' },
  { key: 'allow_scrap_entry', label: 'ثبت ضایعات', hint: 'ثبت سند ضایعات در انبارهای این شعبه' },
];
