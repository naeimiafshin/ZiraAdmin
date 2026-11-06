import type { AdminSchemas } from '@/shared/api/types';
import type { Tone } from '@/shared/ui/kit';

/**
 * برچسب و رنگ enumهای دامنه‌ی فروش (بک‌اند domains/sales/schemas/sales_common.py).
 * کلید هر نقشه از نوع تولیدی OpenAPI است تا اگر بک‌اند مقدار تازه‌ای اضافه کند، کامپایلر جاافتادن را بگیرد.
 * متن‌ها همان متن‌های html «Sales Management» و راهنمای API است؛ متن `*_display` بک‌اند هم در اولویت نمایش است.
 */
type Label = { label: string; tone: Tone };

export type InvoiceStatus = AdminSchemas['SalesInvoiceStatusEnum'];
export type SettlementStatus = AdminSchemas['SalesSettlementStatusEnum'];
export type DeliveryType = AdminSchemas['SalesDeliveryTypeEnum'];
export type SettlementMethod = AdminSchemas['SalesSettlementMethodEnum'];
export type SettlementRowMethod = AdminSchemas['SalesSettlementRowMethodEnum'];
export type SettlementRowStatus = AdminSchemas['SalesSettlementRowStatusEnum'];
export type SourceType = AdminSchemas['SalesSourceTypeEnum'];
export type InvoiceTab = AdminSchemas['SalesInvoiceTabEnum'];
export type ReturnStatus = AdminSchemas['SalesReturnStatusEnum'];

export const INVOICE_STATUS: Record<InvoiceStatus, Label> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  ISSUED: { label: 'صادر شده', tone: 'info' },
  VOIDED: { label: 'ابطال شده', tone: 'danger' },
};

export const SETTLEMENT_STATUS: Record<SettlementStatus, Label> = {
  UNSETTLED: { label: 'در انتظار تسویه', tone: 'warning' },
  PARTIAL: { label: 'تسویه جزئی', tone: 'info' },
  SETTLED: { label: 'تسویه شد', tone: 'success' },
};

export const DELIVERY_TYPE: Record<DeliveryType, string> = {
  WAREHOUSE_PICKUP: 'تحویل درب انبار',
  COMPANY_FLEET: 'ارسال با ناوگان شرکت',
  FREIGHT: 'باربری',
  POST_COURIER: 'پست / پیک',
  PRIOR_DELIVERY_CONSIGNMENT: 'تحویل قبلی – امانی',
};

/** نحوه‌ی تسویه‌ی پیش‌بینی‌شده‌ی سرآیند فاکتور */
export const SETTLEMENT_METHOD: Record<SettlementMethod, string> = {
  CASH: 'نقدی',
  POS: 'کارتخوان',
  BANK_TRANSFER: 'حواله',
  CHEQUE: 'چکی',
  CREDIT: 'اعتباری',
  MIXED: 'ترکیبی',
};

/** روش هر ردیف تسویه (مودال «ثبت تسویه») */
export const SETTLEMENT_ROW_METHOD: Record<SettlementRowMethod, string> = {
  CASH: 'نقدی',
  POS: 'کارتخوان',
  BANK_TRANSFER: 'حواله',
  CHEQUE: 'چک',
  CREDIT: 'اعتباری',
  PREPAYMENT: 'بیعانه‌ی پیش‌فروش',
};

export const SETTLEMENT_ROW_STATUS: Record<SettlementRowStatus, Label> = {
  RECORDED: { label: 'ثبت شده', tone: 'info' },
  CLEARED: { label: 'وصول شده', tone: 'success' },
  CANCELLED: { label: 'لغو شده', tone: 'neutral' },
};

export const SOURCE_TYPE: Record<SourceType, string> = {
  MANUAL: 'ثبت مستقیم',
  PROFORMA: 'پیش‌فاکتور',
  ORDER: 'سفارش',
  PREORDER: 'پیش‌سفارش',
  PRESALE: 'پیش‌فروش',
  CONSIGNMENT: 'فروش امانی',
};

export const RETURN_STATUS: Record<ReturnStatus, Label> = {
  PENDING_APPROVAL: { label: 'در انتظار تایید', tone: 'warning' },
  APPROVED: { label: 'تایید ادمین فروش', tone: 'warning' },
  AWAITING_RECEIPT: { label: 'در انتظار دریافت کالا', tone: 'warning' },
  AWAITING_FINANCE: { label: 'در انتظار ثبت مالی', tone: 'warning' },
  FINANCE_POSTED: { label: 'سند مالی ثبت شده', tone: 'success' },
  REJECTED: { label: 'رد شده', tone: 'danger' },
  CANCELLED: { label: 'لغو شده', tone: 'neutral' },
};

/** تب‌های فهرست فاکتورها (ترتیب html + تب‌های اضافه‌ی بک‌اند) */
export const INVOICE_TABS: { value: InvoiceTab; label: string }[] = [
  { value: 'ALL', label: 'همه' },
  { value: 'DRAFT', label: 'پیش‌نویس‌ها' },
  { value: 'OPEN', label: 'در انتظار تسویه' },
  { value: 'SETTLED', label: 'تسویه شده' },
  { value: 'VOIDED', label: 'ابطال شده' },
  { value: 'ARCHIVED', label: 'بایگانی' },
];

export const keysOf = <K extends string>(m: Record<K, unknown>): K[] => Object.keys(m) as K[];
export const toneOf = <K extends string>(m: Record<K, Label>, code: string): Tone => (m as Record<string, Label | undefined>)[code]?.tone ?? 'neutral';
export const labelOf = <K extends string>(m: Record<K, { label: string } | string>, code: string, display?: string | null): string => {
  if (display) return display;
  const v = (m as Record<string, { label: string } | string | undefined>)[code];
  return typeof v === 'string' ? v : v?.label ?? code;
};
