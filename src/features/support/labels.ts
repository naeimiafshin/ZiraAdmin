import type { Tone } from '@/shared/ui/kit';

/** برچسب‌های فارسی مقدارهای بک‌اند پشتیبانی (domains/support/schemas/enums.py؛ متن‌ها از راهنمای FrontGuidance/SUPPORT_API_NOTES_FOR_ARIAN.md) */
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  WAITING: { label: 'در انتظار پاسخ', tone: 'warning' },
  ANSWERED: { label: 'پاسخ داده‌شده', tone: 'success' },
  CLOSED: { label: 'بسته‌شده', tone: 'neutral' },
};
/** اولویت + بودجه‌ی SLA (ساعت اداری) */
export const PRIORITY: Record<string, { label: string; tone: Tone; sla: string }> = {
  URGENT: { label: 'فوری', tone: 'danger', sla: '۱ ساعت اداری' },
  IMPORTANT: { label: 'مهم', tone: 'warning', sla: '۳ ساعت اداری' },
  NORMAL: { label: 'عادی', tone: 'info', sla: '۱۲ ساعت اداری' },
};
export const PRIORITY_ORDER = ['URGENT', 'IMPORTANT', 'NORMAL'] as const;
export const CONTACT_ROLE: Record<string, string> = { CUSTOMER: 'مشتری', VISITOR: 'مهمان' };
export const CHANNEL: Record<string, string> = { PANEL: 'پنل مشتری', ADMIN: 'ثبت توسط پشتیبانی', WEB_FORM: 'فرم سایت (سابقه)' };
export const DIRECTION: Record<string, string> = { INBOUND: 'دریافتی', OUTBOUND: 'ارسالی' };
export const SENDER: Record<string, string> = { CUSTOMER: 'مشتری', STAFF: 'کارشناس', VISITOR: 'مهمان' };

/** پیام فارسی برای کدهای خطای پشتیبانی (متن بک‌اند انگلیسی است) */
export const ERROR_TEXT: Record<string, string> = {
  SUPPORT_TICKET_CLOSED: 'این تیکت بسته است؛ برای ادامه اول آن را بازگشایی کنید.',
  SUPPORT_ASSIGNEE_INELIGIBLE: 'این کارشناس شرایط رسیدگی ندارد: باید فعال، عضو دپارتمان تیکت، دارای مجوز پاسخ و دسترسی به شعبه‌ی تیکت باشد. برای پاسخ دادن، خود شما هم باید عضو دپارتمان تیکت باشید.',
  SUPPORT_EXPORT_LIMIT: 'خروجی بیش از ۱۰٬۰۰۰ ردیف است؛ بازه‌ی تاریخ یا فیلترها را محدودتر کنید.',
  SUPPORT_CALENDAR_CONFLICT: 'این تغییر تقویم با تیکت‌های باز تداخل دارد و ذخیره نشد.',
  SUPPORT_CALENDAR_INCOMPLETE: 'تقویم پشتیبانی تنظیم نشده یا بازه‌ی پوشش آن تمام شده است؛ مهلت پاسخ محاسبه نمی‌شود. از «تقویم پشتیبانی» بازه‌ی پوشش را تعیین کنید.',
  SUPPORT_ATTACHMENT_TOO_LARGE: 'حجم هر فایل باید حداکثر ۳ مگابایت باشد.',
  SUPPORT_UNSUPPORTED_MEDIA_TYPE: 'نوع فایل مجاز نیست یا فایل خراب است (فقط jpg، png، pdf، xlsx).',
  SUPPORT_TARGET_UNAVAILABLE: 'اتصال تیکت به این مورد هنوز در دسترس نیست.',
  SUPPORT_FILE_TRANSACTION_NESTED: 'ارسال فایل با خطای داخلی روبه‌رو شد؛ دوباره تلاش کنید.',
};
