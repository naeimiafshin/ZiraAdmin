import type { Tone } from '@/shared/ui/kit';

/** برچسب‌های فارسی enumهای دامنه‌ی customers (domains/customers/schemas/enums.py) */
export const CUSTOMER_STATUS: Record<string, { label: string; tone: Tone; hint: string }> = {
  PENDING: { label: 'در انتظار تأیید', tone: 'info', hint: 'تا تأیید درخواست ثبت‌نام، سفارش ثبت نمی‌کند.' },
  ACTIVE: { label: 'فعال', tone: 'success', hint: 'دسترسی کامل به ثبت سفارش.' },
  INACTIVE: { label: 'غیرفعال', tone: 'neutral', hint: 'موقتاً غیرفعال (مثلاً به درخواست خود مشتری).' },
  REJECTED: { label: 'ردشده', tone: 'danger', hint: 'درخواست ثبت‌نام رد شده است؛ می‌تواند دوباره درخواست بدهد.' },
  BLOCKED: { label: 'مسدود', tone: 'danger', hint: 'وضعیت قدیمی؛ مسدودی مالی حالا قفل اعتباری است.' },
};
export const COOPERATION: Record<string, { label: string; tone: Tone; desc: string }> = {
  BRONZE: { label: 'برنزی', tone: 'warning', desc: 'فقط پرداخت نقدی/بانکی' },
  SILVER: { label: 'نقره‌ای', tone: 'neutral', desc: 'نقدی + چک صیادی' },
  GOLD: { label: 'طلایی', tone: 'brand', desc: 'نقدی + چک + اعتبار طلایی' },
};
export const IMAGE_LEVEL: Record<string, { label: string; desc: string; n: number }> = {
  NORMAL: { label: 'سطح ۱ — عادی', desc: 'فقط تصاویر آتلیه‌ای (دیجی‌کالایی)', n: 1 },
  PROFESSIONAL: { label: 'سطح ۲ — حرفه‌ای', desc: 'تصاویر آتلیه‌ای و مانکن', n: 2 },
  SPECIAL: { label: 'سطح ۳ — ویژه', desc: 'همه‌ی تصاویر، از جمله مدل انسانی', n: 3 },
};
export const CUSTOMER_TYPE: Record<string, string> = { WHOLESALE: 'عمده‌فروش', RETAIL: 'خرده‌فروش' };
export const LICENSE_INQUIRY: Record<string, { label: string; tone: Tone }> = {
  NOT_CHECKED: { label: 'استعلام نشده', tone: 'neutral' },
  VALID: { label: 'معتبر', tone: 'success' },
  INVALID: { label: 'نامعتبر', tone: 'danger' },
};
export const GENDER: Record<string, string> = { MALE: 'مرد', FEMALE: 'زن', OTHER: 'سایر', مرد: 'مرد', زن: 'زن' };

export const REG_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'در انتظار بررسی', tone: 'warning' },
  APPROVED: { label: 'تأییدشده', tone: 'success' },
  REJECTED: { label: 'ردشده', tone: 'danger' },
};
export const REG_SOURCE: Record<string, string> = { SELF: 'خود مشتری', ADMIN: 'ادمین' };

export const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'NATIONAL_CARD', label: 'کارت ملی' },
  { value: 'BIRTH_CERTIFICATE', label: 'صفحه‌ی اول شناسنامه' },
  { value: 'BUSINESS_LICENSE', label: 'جواز کسب' },
  { value: 'POSTAL_CODE_CERT', label: 'تأییدیه‌ی کد پستی' },
  { value: 'EDUCATION_CERT', label: 'آخرین مدرک تحصیلی' },
  { value: 'PREMISES_LEASE_OR_DEED', label: 'اجاره‌نامه یا سند مالکیت محل کسب' },
  { value: 'TAX_DOCUMENT', label: 'مدرک مالیات' },
  { value: 'BANK_CREDIT_RATING', label: 'رتبه‌ی اعتباری بانکی' },
  { value: 'ECONOMIC_CODE_CERT', label: 'گواهی کد اقتصادی' },
  { value: 'OTHER', label: 'سایر' },
];
export const DOC_REVIEW: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'در انتظار بررسی', tone: 'warning' },
  VERIFIED: { label: 'تأییدشده', tone: 'success' },
  REJECTED: { label: 'ردشده', tone: 'danger' },
};

export const CREDIT_TYPE: Record<string, { label: string; short: string }> = {
  CHEQUE: { label: 'اعتبار چکی', short: 'چکی' },
  GOLDEN: { label: 'اعتبار طلایی', short: 'طلایی' },
};
export const ACCOUNT_STATUS: Record<string, { label: string; tone: Tone; hint: string }> = {
  ACTIVE: { label: 'فعال', tone: 'success', hint: 'خرید اعتباری تا سقف مجاز است.' },
  SUSPENDED: { label: 'معلق', tone: 'warning', hint: 'تعلیق دستی؛ برگشت‌پذیر.' },
  FROZEN: { label: 'منجمد', tone: 'info', hint: 'محاسبه‌ای: سطح همکاری مؤثر (از پرونده یا گروه) این نوع اعتبار را اجازه نمی‌دهد؛ با تغییر سطح خودش برطرف می‌شود.' },
  CLOSED: { label: 'بسته', tone: 'neutral', hint: 'بسته‌شده؛ نهایی و بدون برگشت.' },
};
export const CHANGE_DIRECTION: Record<string, { label: string; tone: Tone }> = {
  INCREASE: { label: 'افزایش', tone: 'success' },
  DECREASE: { label: 'کاهش', tone: 'danger' },
};
export const CHANGE_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'در انتظار (سابقه)', tone: 'warning' },
  APPROVED: { label: 'اعمال‌شده', tone: 'success' },
  REJECTED: { label: 'ردشده', tone: 'danger' },
};
export const GUARANTEE_TYPE: Record<string, string> = { PERSONAL_CHEQUE: 'چک شخصی', PROMISSORY_NOTE: 'سفته' };
export const GUARANTEE_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: 'در انتظار تأیید', tone: 'warning' },
  ACTIVE: { label: 'فعال', tone: 'success' },
  RELEASED: { label: 'آزادشده', tone: 'neutral' },
};
export const LOCK_REASON: Record<string, string> = {
  SELF_CHEQUE_BOUNCED: 'برگشت چک خود مشتری',
  BOUNCED_TOTAL_THRESHOLD: 'عبور جمع چک‌های برگشتی از حد نصاب',
  GOLDEN_DEADLINE: 'گذشتن مهلت تسویه‌ی اعتبار طلایی',
  OVERDUE_DEBT: 'بدهی معوق',
  MANUAL: 'قفل دستی ادمین',
};
export const LOCK_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'فعال', tone: 'danger' },
  SUSPENDED: { label: 'تعلیق موقت', tone: 'warning' },
  RELEASED: { label: 'رفع‌شده', tone: 'neutral' },
};
export const PAYMENT_METHOD: Record<string, string> = { CASH: 'نقدی / بانکی', CHEQUE: 'چک صیادی', GOLDEN: 'اعتبار طلایی', BANK_TRANSFER: 'واریز بانکی', ONLINE: 'درگاه آنلاین' };

export const labelOf = (map: Record<string, { label: string }> | Record<string, string>, v?: string | null): string => {
  if (!v) return '—';
  const x = (map as Record<string, unknown>)[v];
  if (!x) return v;
  return typeof x === 'string' ? x : (x as { label: string }).label;
};
