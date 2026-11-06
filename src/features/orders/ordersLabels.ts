import type { Tone } from '@/shared/ui/kit';
import type {
  OrdersCancelReason,
  OrdersCancelStatus,
  OrdersChannel,
  OrdersCooperationLevel,
  OrdersDeliveryType,
  OrdersInvoiceSettlementStatus,
  OrdersInvoiceStatus,
  OrdersPartMethod,
  OrdersSettlementType,
  OrdersStatus,
  OrdersSupplyApprovalStage,
  OrdersSupplyLifecycle,
  OrdersSupplyTab,
} from './api/types';

export interface LabelInfo {
  label: string;
  tone: Tone;
}

export const ORDER_STATUS: Record<OrdersStatus, LabelInfo> = {
  AWAITING_CONFIRMATION: { label: 'در انتظار تأیید مشتری', tone: 'warning' },
  PENDING_APPROVAL: { label: 'در انتظار تأیید حسابدار', tone: 'info' },
  APPROVED: { label: 'تأیید شده (فاکتور صادر شد)', tone: 'brand' },
  PREPARING: { label: 'آماده‌سازی', tone: 'info' },
  SHIPPED: { label: 'ارسال شده', tone: 'brand' },
  DELIVERED: { label: 'تحویل مشتری شد', tone: 'success' },
  REJECTED: { label: 'رد شده', tone: 'danger' },
  CANCELLED: { label: 'لغو شده', tone: 'danger' },
};

export const ORDER_CHANNEL: Record<OrdersChannel, string> = {
  ONLINE: 'سایت',
  APP: 'اپلیکیشن',
  ADMIN: 'کارمند (پنل ادمین)',
  SUPPLY_REQUEST: 'درخواست تأمین',
};

export const SETTLEMENT_TYPE: Record<OrdersSettlementType, LabelInfo> = {
  CASH: { label: 'نقدی', tone: 'success' },
  CHEQUE: { label: 'چکی', tone: 'brand' },
  CREDIT: { label: 'اعتباری', tone: 'info' },
  MIXED: { label: 'ترکیبی', tone: 'warning' },
};

export const PART_METHOD: Record<OrdersPartMethod, LabelInfo> = {
  CASH: { label: 'نقدی', tone: 'success' },
  CHEQUE: { label: 'چکی', tone: 'brand' },
  CREDIT: { label: 'اعتباری', tone: 'info' },
};

export const DELIVERY_TYPE: Record<OrdersDeliveryType, string> = {
  WAREHOUSE_PICKUP: 'تحویل درب انبار',
  COMPANY_FLEET: 'ناوگان شرکت',
  FREIGHT: 'باربری',
  POST_COURIER: 'پست / پیک',
};

export const CANCEL_REASON: Record<OrdersCancelReason, string> = {
  CUSTOMER_REQUEST: 'درخواست مشتری',
  WRONG_ITEMS: 'ثبت اشتباه کالا یا تعداد',
  NEED_CHANGED: 'تغییر نیاز مشتری',
  REORDER_OTHER_METHOD: 'ثبت مجدد با روش پرداخت دیگر',
  OTHER: 'سایر دلایل',
};

export const CANCEL_STATUS: Record<OrdersCancelStatus, LabelInfo> = {
  REQUESTED: { label: 'در انتظار بررسی لغو', tone: 'warning' },
  APPROVED: { label: 'لغو تأیید شد', tone: 'danger' },
  REJECTED: { label: 'درخواست لغو رد شد', tone: 'neutral' },
};

export const INVOICE_STATUS: Record<OrdersInvoiceStatus, LabelInfo> = {
  ISSUED: { label: 'صادر شده', tone: 'info' },
  VOIDED: { label: 'ابطال شده', tone: 'danger' },
};

export const INVOICE_SETTLEMENT_STATUS: Record<OrdersInvoiceSettlementStatus, LabelInfo> = {
  UNSETTLED: { label: 'در انتظار تسویه', tone: 'warning' },
  PARTIAL: { label: 'تسویه جزئی', tone: 'info' },
  SETTLED: { label: 'تسویه شده', tone: 'success' },
};

export const COOPERATION_LEVEL: Record<OrdersCooperationLevel, { label: string; tone: Tone }> = {
  BRONZE: { label: 'برنزی', tone: 'neutral' },
  SILVER: { label: 'نقره‌ای', tone: 'info' },
  GOLD: { label: 'طلایی', tone: 'warning' },
};

export const SUPPLY_TAB: Record<OrdersSupplyTab, string> = {
  NEW: 'در انتظار بررسی',
  IN_SUPPLY: 'در جریان تأمین',
  READY: 'آماده تبدیل به سفارش',
  DONE: 'تبدیل شده',
  CLOSED: 'لغو و بسته',
};

export const SUPPLY_LIFECYCLE: Record<OrdersSupplyLifecycle, LabelInfo> = {
  SUBMITTED: { label: 'در انتظار بررسی', tone: 'warning' },
  VOTING: { label: 'در حال رأی‌گیری شورا', tone: 'info' },
  AWAITING_ACCEPTANCE: { label: 'در انتظار پذیرش مشتری', tone: 'warning' },
  AWAITING_DEPOSIT_CHECK: { label: 'بررسی بیعانه', tone: 'info' },
  AWAITING_SUPPLIER: { label: 'تعیین تأمین‌کننده', tone: 'info' },
  AWAITING_GOODS: { label: 'در انتظار ورود کالا', tone: 'info' },
  RECEIVING: { label: 'شمارش انبار', tone: 'brand' },
  AWAITING_PARTIAL_DECISION: { label: 'تصمیم کسری انبار', tone: 'warning' },
  AWAITING_RECONCILIATION: { label: 'تطبیق فاکتور و ورود', tone: 'brand' },
  AWAITING_INVOICE: { label: 'صدور فاکتور خرید', tone: 'brand' },
  AWAITING_SALES_ORDER: { label: 'آماده صدور سفارش مشتری', tone: 'success' },
  AWAITING_REFUND: { label: 'در انتظار استرداد بیعانه', tone: 'warning' },
  COMPLETED: { label: 'تکمیل و سفارش صادر شد', tone: 'success' },
  CANCELLED: { label: 'لغو شده', tone: 'danger' },
  CUSTOMER_CANCELLED: { label: 'لغو توسط مشتری', tone: 'danger' },
  CUSTOMER_WITHDREW: { label: 'انصراف مشتری', tone: 'danger' },
  ORDERS_REJECTED: { label: 'رد توسط سفارشات', tone: 'danger' },
  SUPPLY_REJECTED: { label: 'رد توسط شورا', tone: 'danger' },
  EXPIRED: { label: 'منقضی شده', tone: 'neutral' },
  DEPOSIT_EXPIRED: { label: 'انقضای واریز بیعانه', tone: 'neutral' },
  SUPPLY_IMPOSSIBLE: { label: 'عدم امکان تأمین', tone: 'danger' },
  CLOSED_REFUNDED: { label: 'بسته و بیعانه مسترد شد', tone: 'neutral' },
};

export const SUPPLY_APPROVAL_STAGE: Record<OrdersSupplyApprovalStage, string> = {
  ORDERS: 'مدیریت سفارشات',
  SUPPLY: 'مدیریت تأمین',
  FINANCE: 'امور مالی',
  RECONCILIATION: 'تطبیق انبار و فاکتور',
};
