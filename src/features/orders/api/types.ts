/**
 * تایپ‌های قرارداد API ماژول «مدیریت سفارشات» (domains/orders/schemas)
 * مطابق با اسکیمای واقعی بک‌اند.
 */

export type OrdersStatus =
  | 'AWAITING_CONFIRMATION'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

export type OrdersForwardStatus = 'PREPARING' | 'SHIPPED' | 'DELIVERED';

export type OrdersChannel = 'ONLINE' | 'APP' | 'ADMIN' | 'SUPPLY_REQUEST';

export type OrdersSettlementType = 'CASH' | 'CHEQUE' | 'CREDIT' | 'MIXED';

export type OrdersPartMethod = 'CASH' | 'CHEQUE' | 'CREDIT';

export type OrdersDeliveryType =
  | 'WAREHOUSE_PICKUP'
  | 'COMPANY_FLEET'
  | 'FREIGHT'
  | 'POST_COURIER';

export type OrdersApprovalDecision = 'APPROVED' | 'REJECTED';

export type OrdersCancelReason =
  | 'CUSTOMER_REQUEST'
  | 'WRONG_ITEMS'
  | 'NEED_CHANGED'
  | 'REORDER_OTHER_METHOD'
  | 'OTHER';

export type OrdersCancelStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED';

export type OrdersInvoiceStatus = 'ISSUED' | 'VOIDED';

export type OrdersInvoiceSettlementStatus = 'UNSETTLED' | 'PARTIAL' | 'SETTLED';

export type OrdersCooperationLevel = 'BRONZE' | 'SILVER' | 'GOLD';

export type OrdersCustomerPaymentMethod = 'CASH' | 'CHEQUE' | 'GOLDEN';

export type OrdersSort =
  | 'newest'
  | 'oldest'
  | 'amount_desc'
  | 'amount_asc'
  | 'items_desc';

export interface OrdersRef {
  id?: string | null;
  code?: string | null;
  name?: string | null;
}

export interface OrdersCustomer {
  id: string;
  code?: string | null;
  store_name?: string | null;
  full_name?: string | null;
  mobile?: string | null;
}

export interface OrdersLineIn {
  item_id: string;
  quantity: number;
}

export interface OrdersSettlementPartIn {
  method: OrdersPartMethod;
  amount: number;
  due_date?: string | null;
  bank_id?: string | null;
  bank_branch?: string | null;
  cheque_serial?: string | null;
  sayad_no?: string | null;
  owner_name?: string | null;
  owner_national_id?: string | null;
  sayad_registered?: boolean;
}

export interface OrdersOrderIn {
  customer_id: string;
  branch_id?: string | null;
  warehouse_id?: string | null;
  salesperson_id?: string | null;
  settlement_type?: OrdersSettlementType | null;
  delivery_type?: OrdersDeliveryType | null;
  coupon_codes?: string[] | null;
  address_id?: string | null;
  delivery_province?: string | null;
  delivery_city?: string | null;
  delivery_address?: string | null;
  delivery_postal_code?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  note?: string | null;
  lines: OrdersLineIn[];
  settlement_parts?: OrdersSettlementPartIn[];
}

export interface OrdersOrderUpdateIn {
  warehouse_id?: string | null;
  salesperson_id?: string | null;
  settlement_type?: OrdersSettlementType | null;
  delivery_type?: OrdersDeliveryType | null;
  coupon_codes?: string[] | null;
  address_id?: string | null;
  delivery_province?: string | null;
  delivery_city?: string | null;
  delivery_address?: string | null;
  delivery_postal_code?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  note?: string | null;
  expected_version?: number | null;
  lines?: OrdersLineIn[] | null;
  settlement_parts?: OrdersSettlementPartIn[] | null;
}

export interface OrdersCodeIn {
  code: string;
}

export interface OrdersNoteIn {
  note?: string;
}

export interface OrdersReasonIn {
  note: string;
}

export interface OrdersStatusChangeIn {
  to_status: OrdersForwardStatus;
  note?: string;
}

export interface OrdersCancelIn {
  reason: OrdersCancelReason;
  note?: string;
}

export interface OrdersCancelDecisionIn {
  approved: boolean;
  note?: string;
}

export interface OrdersArchiveIn {
  archived: boolean;
}

export interface OrdersFilterParams {
  page?: number;
  page_size?: number;
  query?: string;
  status?: OrdersStatus[];
  channel?: OrdersChannel[];
  settlement_type?: OrdersSettlementType[];
  customer_id?: string;
  branch_id?: string;
  salesperson_id?: string;
  date_from?: string;
  date_to?: string;
  cancellation_requested?: boolean;
  invoiced?: boolean;
  archived?: boolean;
  sort?: OrdersSort;
}

export interface OrdersOrderOut {
  id: string;
  order_number: string;
  order_date: string;
  valid_until: string;
  is_expired: boolean;
  status: OrdersStatus;
  status_display: string;
  channel: OrdersChannel;
  channel_display: string;
  settlement_type: OrdersSettlementType;
  settlement_type_display: string;
  delivery_type: OrdersDeliveryType;
  delivery_type_display: string;
  customer?: OrdersCustomer | null;
  branch?: OrdersRef | null;
  salesperson?: OrdersRef | null;
  line_count: number;
  subtotal: number | string;
  total_discount: number | string;
  cash_discount_amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  prepaid_amount: number | string;
  remaining_amount: number | string;
  invoice_id?: string | null;
  invoice_number: string;
  supply_request_id?: string | null;
  supply_request_no: string;
  has_open_cancellation: boolean;
  archived_at?: string | null;
  version: number;
  created_at: string;
}

export interface OrdersLineOut {
  id?: string | null;
  row_no: number;
  item_id: string;
  item_code?: string | null;
  item_name?: string | null;
  unit_id?: string | null;
  unit_name?: string | null;
  quantity: number | string;
  unit_price: number | string;
  unit_discount: number | string;
  line_discount: number | string;
  tax_amount: number | string;
  line_total: number | string;
}

export interface OrdersSettlementPartOut {
  method: OrdersPartMethod;
  method_display: string;
  amount: number | string;
  due_date?: string | null;
  max_allowed_days?: number | null;
  max_due_date?: string | null;
  bank_id?: string | null;
  bank_name: string;
  bank_branch: string;
  cheque_serial: string;
  sayad_no: string;
  owner_name: string;
  owner_national_id: string;
  sayad_registered: boolean;
}

export interface OrdersStatusChangeOut {
  from_status?: OrdersStatus | null;
  from_status_display: string;
  to_status: OrdersStatus;
  to_status_display: string;
  changed_by?: OrdersRef | null;
  changed_at: string;
  note: string;
}

export interface OrdersApprovalOut {
  decision: OrdersApprovalDecision;
  decision_display: string;
  approver?: OrdersRef | null;
  decided_at: string;
  note: string;
}

export interface OrdersCancellationOut {
  id: string;
  status: OrdersCancelStatus;
  status_display: string;
  reason: OrdersCancelReason;
  reason_display: string;
  note: string;
  requested_by?: OrdersRef | null;
  requested_at: string;
  decided_by?: OrdersRef | null;
  decided_at?: string | null;
  decision_note: string;
}

export interface OrdersConfirmationOut {
  order_id: string;
  order_number: string;
  status: OrdersStatus;
  mobile_masked: string;
  expires_at?: string | null;
  attempt_count: number;
  resend_count: number;
  resend_after_seconds: number;
  confirmed_at?: string | null;
}

export interface OrdersInvoiceOut {
  id: string;
  invoice_number?: string | null;
  status: OrdersInvoiceStatus;
  status_display: string;
  settlement_status: OrdersInvoiceSettlementStatus;
  settlement_status_display: string;
  total_amount: number | string;
}

export interface OrdersOrderDetailOut extends OrdersOrderOut {
  warehouse?: OrdersRef | null;
  registered_by?: OrdersRef | null;
  coupon_codes: string[];
  address_id?: string | null;
  delivery_province: string;
  delivery_city: string;
  delivery_address: string;
  delivery_postal_code: string;
  recipient_name: string;
  recipient_phone: string;
  note: string;
  confirmed_at?: string | null;
  approved_at?: string | null;
  approved_by?: OrdersRef | null;
  confirmation?: OrdersConfirmationOut | null;
  invoice?: OrdersInvoiceOut | null;
  lines: OrdersLineOut[];
  settlement_parts: OrdersSettlementPartOut[];
  status_history: OrdersStatusChangeOut[];
  approvals: OrdersApprovalOut[];
  cancellations: OrdersCancellationOut[];
  can_edit: boolean;
  next_status?: OrdersForwardStatus | null;
}

export interface OrdersStatusCountsOut {
  ALL: number;
  AWAITING_CONFIRMATION: number;
  PENDING_APPROVAL: number;
  APPROVED: number;
  PREPARING: number;
  SHIPPED: number;
  DELIVERED: number;
  REJECTED: number;
  CANCELLED: number;
  CANCELLATION_REQUESTED: number;
  ARCHIVED: number;
}

export interface OrdersInvoiceFilterParams {
  page?: number;
  page_size?: number;
  query?: string;
  settlement_type?: OrdersSettlementType[];
  invoice_status?: OrdersInvoiceStatus[];
  settlement_status?: OrdersInvoiceSettlementStatus[];
  customer_id?: string;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface OrdersInvoiceRowOut {
  invoice_id: string;
  invoice_number?: string | null;
  invoice_status: OrdersInvoiceStatus;
  invoice_status_display: string;
  settlement_status: OrdersInvoiceSettlementStatus;
  settlement_status_display: string;
  invoice_date?: string | null;
  total_amount: number | string;
  order_id: string;
  order_number: string;
  customer?: OrdersCustomer | null;
  branch?: OrdersRef | null;
  line_count: number;
  settlement_type: OrdersSettlementType;
  settlement_type_display: string;
  settlement_date?: string | null;
}

export interface OrdersInvoiceCountsOut {
  ALL: number;
  CASH: number;
  CHEQUE: number;
  CREDIT: number;
  MIXED: number;
}

export interface OrdersPreviewOut {
  subtotal: number | string;
  total_discount: number | string;
  cash_discount_amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  prepaid_amount: number | string;
  remaining_amount: number | string;
  lines: OrdersLineOut[];
  settlement_parts: OrdersSettlementPartOut[];
  raas_max_days: Record<string, number>;
}

export interface OrdersCustomerOptionOut {
  id: string;
  code?: string | null;
  store_name?: string | null;
  full_name?: string | null;
  mobile?: string | null;
  cooperation_level?: OrdersCooperationLevel | null;
  payment_methods: OrdersCustomerPaymentMethod[];
  can_order: boolean;
}

export interface OrdersItemOptionOut {
  id: string;
  code?: string | null;
  name?: string | null;
  barcode?: string | null;
  unit_id?: string | null;
  unit_name: string;
  available: number | string;
}

export interface OrdersAddressOptionOut {
  id: string;
  title: string;
  province: string;
  city: string;
  address: string;
  postal_code: string;
  recipient_name: string;
  recipient_phone: string;
  is_default: boolean;
}

export interface OrdersPrintOut {
  order: OrdersOrderDetailOut;
  company?: Record<string, unknown> | null;
  customer_card?: Record<string, unknown> | null;
  printed_at: string;
}

// ------------------------------------------------ «درخواست‌های تامین مشتریان»
export type OrdersSupplyLifecycle =
  | 'SUBMITTED'
  | 'VOTING'
  | 'AWAITING_ACCEPTANCE'
  | 'AWAITING_DEPOSIT_CHECK'
  | 'AWAITING_SUPPLIER'
  | 'AWAITING_GOODS'
  | 'RECEIVING'
  | 'AWAITING_PARTIAL_DECISION'
  | 'AWAITING_RECONCILIATION'
  | 'AWAITING_INVOICE'
  | 'AWAITING_SALES_ORDER'
  | 'AWAITING_REFUND'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'CUSTOMER_CANCELLED'
  | 'CUSTOMER_WITHDREW'
  | 'ORDERS_REJECTED'
  | 'SUPPLY_REJECTED'
  | 'EXPIRED'
  | 'DEPOSIT_EXPIRED'
  | 'SUPPLY_IMPOSSIBLE'
  | 'CLOSED_REFUNDED';

export type OrdersSupplyTab = 'NEW' | 'IN_SUPPLY' | 'READY' | 'DONE' | 'CLOSED';

export type OrdersSupplyApprovalStage =
  | 'ORDERS'
  | 'SUPPLY'
  | 'FINANCE'
  | 'RECONCILIATION';

export type OrdersSupplyApprovalDecision = 'APPROVED' | 'REJECTED';

export interface OrdersSupplyFilterParams {
  page?: number;
  page_size?: number;
  query?: string;
  tab?: OrdersSupplyTab;
  lifecycle?: OrdersSupplyLifecycle[];
  customer_id?: string;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface OrdersSupplyDecisionIn {
  approved: boolean;
  reason?: string;
}

export interface OrdersSupplyConvertIn {
  warehouse_id?: string | null;
  salesperson_id?: string | null;
  settlement_type?: OrdersSettlementType | null;
  delivery_type?: OrdersDeliveryType | null;
  coupon_codes?: string[] | null;
  address_id?: string | null;
  delivery_province?: string | null;
  delivery_city?: string | null;
  delivery_address?: string | null;
  delivery_postal_code?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  note?: string | null;
  settlement_parts?: OrdersSettlementPartIn[];
}

export interface OrdersSupplyRequestOut {
  id: string;
  request_no: string;
  request_date: string;
  customer?: OrdersCustomer | null;
  branch?: OrdersRef | null;
  lifecycle: OrdersSupplyLifecycle;
  lifecycle_display: string;
  valid_until?: string | null;
  delivery_due?: string | null;
  deposit_amount?: number | string | null;
  deposit_paid_amount?: number | string | null;
  deposit_due_date?: string | null;
  line_count?: number | null;
  total_quantity?: number | string | null;
  close_reason: string;
  can_decide: boolean;
  can_convert: boolean;
  order?: OrdersRef | null;
  created_at: string;
}

export interface OrdersSupplyLineOut {
  id: string;
  item_id?: string | null;
  item_code?: string | null;
  item_name?: string | null;
  temp_name: string;
  quantity: number | string;
  received_quantity: number | string;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  target_days?: number | null;
}

export interface OrdersSupplyApprovalOut {
  stage: OrdersSupplyApprovalStage;
  stage_display: string;
  decision: OrdersSupplyApprovalDecision;
  decision_display: string;
  reason: string;
  decided_at: string;
  approver?: OrdersRef | null;
}

export interface OrdersSupplyRequestDetailOut extends OrdersSupplyRequestOut {
  reasons: string;
  lines: OrdersSupplyLineOut[];
  approvals: OrdersSupplyApprovalOut[];
}

export interface OrdersSupplyCountsOut {
  ALL: number;
  NEW: number;
  IN_SUPPLY: number;
  READY: number;
  DONE: number;
  CLOSED: number;
}
