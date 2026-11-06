import type { Tone } from '@/shared/ui/kit';

export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'فعال', tone: 'success' },
  PENDING: { label: 'در انتظار', tone: 'info' },
  SUSPENDED: { label: 'غیرفعال', tone: 'neutral' },
  BLOCKED: { label: 'قفل', tone: 'warning' },
};
export const USER_TYPE: Record<string, { label: string; tone: Tone }> = {
  SUPERADMIN: { label: 'سوپرادمین', tone: 'info' },
  STAFF: { label: 'کارمند', tone: 'neutral' },
  CUSTOMER: { label: 'مشتری', tone: 'neutral' },
};
export const GENDER = [
  { value: 'MALE', label: 'مرد' },
  { value: 'FEMALE', label: 'زن' },
  { value: 'OTHER', label: 'سایر' },
];
export const MARITAL = [
  { value: 'SINGLE', label: 'مجرد' },
  { value: 'MARRIED', label: 'متأهل' },
  { value: 'DIVORCED', label: 'مطلقه' },
  { value: 'WIDOWED', label: 'همسر فوت‌شده' },
];
/** آخرین مدرک تحصیلی: بک‌اند متن آزاد می‌گیرد؛ این‌ها گزینه‌های فرم html Fixed است. */
export const EDUCATION = ['زیر دیپلم', 'دیپلم', 'کاردانی', 'کارشناسی', 'کارشناسی ارشد', 'دکتری'].map((v) => ({ value: v, label: v }));
export const labelOf = (list: { value: string; label: string }[], v?: string | null) => list.find((x) => x.value === v)?.label ?? v ?? '—';

/** شیارهای مدارک کارمند (domains/identity/schemas/staff.py) */
export const DOC_SLOTS: { slot: string; label: string; required: boolean }[] = [
  { slot: 'BIRTH_CERTIFICATE_PAGE_1', label: 'شناسنامه — صفحه ۱', required: true },
  { slot: 'BIRTH_CERTIFICATE_PAGE_2', label: 'شناسنامه — صفحه ۲', required: true },
  { slot: 'BIRTH_CERTIFICATE_PAGE_3', label: 'شناسنامه — صفحه ۳', required: true },
  { slot: 'BIRTH_CERTIFICATE_PAGE_4', label: 'شناسنامه — صفحه ۴', required: true },
  { slot: 'GUARANTEE', label: 'ضمانت‌نامه', required: true },
  { slot: 'CONTRACT', label: 'قرارداد', required: true },
  { slot: 'NATIONAL_CARD', label: 'کارت ملی', required: false },
  { slot: 'EDUCATIONAL_DEGREE', label: 'مدرک تحصیلی', required: false },
  { slot: 'POSTAL_CODE_CONFIRMATION', label: 'تأییدیه‌ی کد پستی', required: false },
  { slot: 'PERSONNEL_PHOTO', label: 'عکس پرسنلی', required: false },
  { slot: 'TRAINING_CERTIFICATE', label: 'گواهی آموزشی', required: false },
  { slot: 'OTHER', label: 'سایر', required: false },
];
export const docLabel = (slot?: string | null) => DOC_SLOTS.find((d) => d.slot === slot)?.label ?? slot ?? '—';

export const SESSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'فعال', tone: 'success' },
  EXPIRED: { label: 'منقضی', tone: 'neutral' },
  REVOKED: { label: 'لغوشده', tone: 'danger' },
};
export const DEVICE: Record<string, string> = { DESKTOP: 'دسکتاپ', MOBILE: 'موبایل', TABLET: 'تبلت', OTHER: 'سایر' };

export const TOPIC: Record<string, string> = {
  SYSTEM: 'سیستمی', ORDER: 'سفارش', PAYMENT: 'پرداخت', CHEQUE: 'چک', REQUEST: 'درخواست', TICKET: 'تیکت', DISCOUNT: 'تخفیف',
  FINANCIAL: 'مالی', PROMOTION: 'تبلیغاتی', SECURITY: 'امنیتی', MARKETING: 'بازاریابی', SUPPORT: 'پشتیبانی',
};
export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  LOW: { label: 'کم', tone: 'neutral' },
  NORMAL: { label: 'عادی', tone: 'info' },
  HIGH: { label: 'زیاد', tone: 'warning' },
  URGENT: { label: 'فوری', tone: 'danger' },
};
export const RECIPIENT_MODE: Record<string, string> = { ALL: 'همه کاربران', ROLE: 'بر اساس نقش', ROLE_BASED: 'بر اساس نقش', SPECIFIC: 'کاربران منتخب' };
