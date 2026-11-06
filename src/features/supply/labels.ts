import type { Tone } from '@/shared/ui/kit';

/**
 * برچسب و رنگ وضعیت‌های دامنه‌ی خرید و تأمین. متن نمایشی اول از فیلد `*_display` بک‌اند خوانده می‌شود؛
 * این نقشه‌ها برای فیلترها و رنگ نشان‌اند.
 */
type Label = { label: string; tone: Tone };

export const SUPPLIER_STATUS: Record<string, Label> = {
  ACTIVE: { label: 'فعال', tone: 'success' },
  BLOCKED: { label: 'مسدود', tone: 'danger' },
  INACTIVE: { label: 'غیرفعال', tone: 'neutral' },
};

export const INVOICE_STATUS: Record<string, Label> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  EDITED: { label: 'ویرایش‌شده', tone: 'warning' },
  APPROVED_ISSUED: { label: 'تأیید و صادرشده', tone: 'success' },
  VOIDED: { label: 'ابطال‌شده', tone: 'danger' },
  VOIDED_ARCHIVED: { label: 'ابطالی بایگانی‌شده', tone: 'neutral' },
};

export const toneOf = (map: Record<string, Label>, code: string): Tone => map[code]?.tone ?? 'neutral';
export const labelOf = (map: Record<string, Label>, code: string, display?: string | null): string => display || map[code]?.label || code;

/** مقدار کمیت بک‌اند ممکن است «10.000» باشد ⇐ عدد صحیح (همه‌ی مقدارها صحیح‌اند) */
export const qty = (v: string | number | null | undefined): number => Math.trunc(Number(v ?? 0));

export const TITLE_STATUS: Record<'active' | 'archived', Label> = {
  active: { label: 'فعال', tone: 'success' },
  archived: { label: 'آرشیوشده', tone: 'neutral' },
};

export const MEMBER_STATUS: Record<'active' | 'inactive', Label> = {
  active: { label: 'فعال', tone: 'success' },
  inactive: { label: 'کنار گذاشته', tone: 'neutral' },
};

export const VOTE: Record<string, Label> = {
  FOR: { label: 'موافق', tone: 'success' },
  AGAINST: { label: 'مخالف', tone: 'danger' },
};

export const REQUEST_FINAL: Record<string, Label> = {
  OPEN: { label: 'در انتظار', tone: 'warning' },
  APPROVED: { label: 'تأیید شده', tone: 'success' },
  REJECTED: { label: 'رد شده', tone: 'danger' },
  CANCELLED: { label: 'لغو شده', tone: 'neutral' },
  CLOSED: { label: 'بسته', tone: 'neutral' },
};

/** مرحله‌ی تأیید (تأمین / مالی) */
export const STAGE_STATUS: Record<string, Label> = {
  PENDING: { label: 'در انتظار', tone: 'warning' },
  APPROVED: { label: 'تأیید شده', tone: 'success' },
  REJECTED: { label: 'رد شده', tone: 'danger' },
  NOT_REQUIRED: { label: 'لازم نیست', tone: 'neutral' },
};

/**
 * مرحله‌ی چرخه‌ی درخواست تأمین (S-24، تصمیم افشین ۱۳ آبان ۱۴۰۵). متن هر مرحله از `lifecycle_display` بک‌اند می‌آید؛
 * این‌جا فقط رنگ و ترتیب فیلتر است: مرحله‌های مسیر به ترتیب، بعد وضعیت‌های پایانی.
 */
export const LIFECYCLE_TONE: Record<string, Tone> = {
  SUBMITTED: 'warning', VOTING: 'warning', AWAITING_ACCEPTANCE: 'warning', AWAITING_DEPOSIT_CHECK: 'warning',
  AWAITING_SUPPLIER: 'info', AWAITING_GOODS: 'info', RECEIVING: 'info', AWAITING_PARTIAL_DECISION: 'warning',
  AWAITING_RECONCILIATION: 'brand', AWAITING_INVOICE: 'brand', AWAITING_SALES_ORDER: 'brand', AWAITING_REFUND: 'warning',
  COMPLETED: 'success', CANCELLED: 'neutral', CUSTOMER_CANCELLED: 'neutral', CUSTOMER_WITHDREW: 'neutral',
  ORDERS_REJECTED: 'danger', SUPPLY_REJECTED: 'danger', EXPIRED: 'neutral', DEPOSIT_EXPIRED: 'neutral',
  SUPPLY_IMPOSSIBLE: 'danger', CLOSED_REFUNDED: 'neutral',
};

/** نام هر مرحله (همان متن بک‌اند `SupplyRequest.Lifecycle`) برای نمودار مسیر؛ مرحله‌ی فعلی متن خودش را از `lifecycle_display` دارد */
export const LIFECYCLE_LABEL: Record<string, string> = {
  SUBMITTED: 'ثبت شد؛ در انتظار بررسی مدیر سفارشات', VOTING: 'رأی‌گیری شورا و تصمیم مدیر تأمین',
  AWAITING_ACCEPTANCE: 'در انتظار پذیرش و واریز بیعانه', AWAITING_DEPOSIT_CHECK: 'در انتظار تأیید مالی واریز بیعانه',
  AWAITING_SUPPLIER: 'در انتظار تعیین تأمین‌کننده و اعلامیه', AWAITING_GOODS: 'اعلامیه صادر شد؛ در انتظار دریافت کالا',
  RECEIVING: 'در حال دریافت توسط انبار', AWAITING_PARTIAL_DECISION: 'در انتظار تصمیم مشتری درباره‌ی دریافت ناقص',
  AWAITING_RECONCILIATION: 'در انتظار تطبیق و تأیید مدیر تأمین', AWAITING_INVOICE: 'در انتظار ثبت فاکتور خرید',
  AWAITING_SALES_ORDER: 'رزرو و تبدیل به سفارش فروش', AWAITING_REFUND: 'در انتظار استرداد بیعانه', COMPLETED: 'اتمام فرآیند',
};

/** مسیر اصلی هر نوع درخواست (تصمیم افشین ۱۳ آبان ۱۴۰۵؛ بک‌اند FrontGuidance «چرخه‌ی وضعیت درخواست») */
export const STAFF_PATH = ['VOTING', 'AWAITING_SUPPLIER', 'AWAITING_GOODS', 'RECEIVING', 'AWAITING_RECONCILIATION', 'AWAITING_INVOICE', 'COMPLETED'];
export const CUSTOMER_PATH = ['SUBMITTED', 'VOTING', 'AWAITING_ACCEPTANCE', 'AWAITING_DEPOSIT_CHECK', 'AWAITING_SUPPLIER', 'AWAITING_GOODS', 'RECEIVING',
  'AWAITING_RECONCILIATION', 'AWAITING_INVOICE', 'AWAITING_SALES_ORDER', 'COMPLETED'];
/** وضعیت پایانی بیرون از مسیر ⇐ مرحله‌ای که مسیر در آن متوقف شد */
export const STOPPED_AT: Record<string, string> = {
  ORDERS_REJECTED: 'SUBMITTED', SUPPLY_REJECTED: 'VOTING', EXPIRED: 'VOTING', CANCELLED: 'VOTING',
  CUSTOMER_WITHDREW: 'AWAITING_ACCEPTANCE', DEPOSIT_EXPIRED: 'AWAITING_ACCEPTANCE', SUPPLY_IMPOSSIBLE: 'AWAITING_SUPPLIER',
  AWAITING_REFUND: 'AWAITING_SUPPLIER', CLOSED_REFUNDED: 'AWAITING_SUPPLIER',
};

/** تب‌های فهرست درخواست تأمین (افشین 2026-10-31): سه تب html + «لغو و بسته» */
export const REQUEST_TABS = [
  { value: 'OPEN', label: 'در انتظار' },
  { value: 'APPROVED', label: 'تأیید شده' },
  { value: 'REJECTED', label: 'رد شده' },
  { value: 'CLOSED_GROUP', label: 'لغو و بسته' },
] as const;
export type RequestTab = (typeof REQUEST_TABS)[number]['value'];

/** وضعیت اعلامیه‌ی رسید انبار (بک‌اند GoodsReceiptAdvice.Status) — وضعیت را فقط انبار عوض می‌کند */
export const ADVICE_STATUS: Record<string, Label> = {
  SENT: { label: 'در انتظار', tone: 'warning' },
  RECEIVING: { label: 'دریافت توسط انبار', tone: 'info' },
  RECEIVED: { label: 'تأیید انبار', tone: 'success' },
  PARTIAL: { label: 'دریافت ناقص', tone: 'brand' },
  RETURNED: { label: 'عدم تأیید انبار', tone: 'danger' },
  VOIDED: { label: 'ابطال شده', tone: 'neutral' },
};

/** تب‌های فهرست اعلامیه (html + افشین 2026-10-31: «ابطال‌شده» و «بایگانی‌شده» دو تب جدا). مقدار = پارامتر status بک‌اند */
export const ADVICE_TABS = [
  { value: 'ALL', label: 'همه' },
  { value: 'SENT', label: 'در انتظار' },
  { value: 'RECEIVING', label: 'دریافت توسط انبار' },
  { value: 'PARTIAL', label: 'دریافت ناقص' },
  { value: 'RECEIVED', label: 'تأیید انبار' },
  { value: 'RETURNED', label: 'عدم تأیید انبار' },
  { value: 'VOIDED', label: 'ابطال‌شده' },
  { value: 'ARCHIVED', label: 'بایگانی‌شده' },
] as const;
export type AdviceTab = (typeof ADVICE_TABS)[number]['value'];

/** وضعیت رسید انبار (wms GoodsReceipt.Status) برای نشان کنار شماره‌ی رسید */
export const RECEIPT_STATUS: Record<string, Label> = {
  AWAITING_MANAGER: { label: 'در انتظار مدیر', tone: 'warning' },
  AWAITING_RECEIPT: { label: 'در انتظار دریافت', tone: 'warning' },
  AWAITING_FINAL: { label: 'تعیین وضعیت نهایی', tone: 'info' },
  POSTED: { label: 'ثبت نهایی', tone: 'success' },
  RETURNED: { label: 'رد و عودت', tone: 'danger' },
  CANCELLED: { label: 'لغو (ابطال اعلامیه)', tone: 'neutral' },
};

/** نوع تحویل و نحوه‌ی تسویه‌ی فاکتور خرید (بک‌اند PurchaseInvoice) */
export const DELIVERY_TYPE: Record<string, string> = { WAREHOUSE: 'تحویل انبار', FACTORY_GATE: 'درب کارخانه' };
export const SETTLEMENT_METHOD: Record<string, string> = { CASH: 'نقدی', CHEQUE: 'چک', TRANSFER: 'حواله' };

/** تب‌های فهرست فاکتور خرید (طرح تأییدشده: همه، پیش‌نویس و ویرایش‌شده، صادرشده، ابطالی). «پیش‌نویس و ویرایش‌شده» =
 * `status=DRAFT&status=EDITED` (S-17 ✅)؛ «ابطالی» = `voided=true` (ابطال‌شده و ابطالی بایگانی‌شده) */
export const INVOICE_TABS = [
  { value: 'ALL', label: 'همه' },
  { value: 'PENDING', label: 'پیش‌نویس و ویرایش‌شده' },
  { value: 'APPROVED_ISSUED', label: 'تأیید و صادرشده' },
  { value: 'VOIDED', label: 'ابطالی' },
] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number]['value'];

/** وضعیت برگشت از خرید (بک‌اند PurchaseReturn.Status) */
export const RETURN_STATUS: Record<string, Label> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'warning' },
  APPROVED: { label: 'تأیید شده', tone: 'success' },
  CANCELLED: { label: 'لغو شده', tone: 'neutral' },
};

/** وضعیت خرید امانی (بک‌اند ConsignmentPurchase.Status) */
export const CONSIGNMENT_STATUS: Record<string, Label> = {
  IN_WAREHOUSE: { label: 'امانی در انبار', tone: 'warning' },
  RETURNED: { label: 'عودت‌شده', tone: 'neutral' },
  CONVERTED: { label: 'تبدیل به فاکتور', tone: 'success' },
};
