import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { Paginated } from '@/shared/api/types';
import { saveBlob } from '@/shared/lib/download';
import type {
  OrdersAddressOptionOut,
  OrdersCancelDecisionIn,
  OrdersCancelIn,
  OrdersCancellationOut,
  OrdersConfirmationOut,
  OrdersCustomerOptionOut,
  OrdersFilterParams,
  OrdersInvoiceCountsOut,
  OrdersInvoiceFilterParams,
  OrdersInvoiceRowOut,
  OrdersItemOptionOut,
  OrdersOrderDetailOut,
  OrdersOrderIn,
  OrdersOrderOut,
  OrdersOrderUpdateIn,
  OrdersPreviewOut,
  OrdersPrintOut,
  OrdersStatusChangeIn,
  OrdersStatusCountsOut,
  OrdersSupplyConvertIn,
  OrdersSupplyCountsOut,
  OrdersSupplyDecisionIn,
  OrdersSupplyFilterParams,
  OrdersSupplyRequestDetailOut,
  OrdersSupplyRequestOut,
} from './types';

export const OK = ['orders'] as const;
const OP = '/orders';

/** خروجی اکسل با همان فیلترهای فهرست، بدون صفحه‌بندی */
export async function exportXlsx(path: string, p: Record<string, unknown>, defaultName: string) {
  const { page: _p, page_size: _s, ...q } = p;
  const blob = await adminApi<Blob>(path, { query: q as Record<string, string | number | boolean | null | undefined>, raw: true });
  saveBlob(blob, defaultName);
}

// ── ۱. فهرست سفارش‌ها و فیلترها ──────────────────────────────────────────
export const useOrders = (params: OrdersFilterParams) =>
  useQuery({
    queryKey: [...OK, 'list', params],
    queryFn: ({ signal }) =>
      adminApi<Paginated<OrdersOrderOut>>(`${OP}/orders`, {
        query: params as Record<string, string | number | boolean | null | undefined>,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export const useOrderStatusCounts = (params: OrdersFilterParams) =>
  useQuery({
    queryKey: [...OK, 'status-counts', params],
    queryFn: ({ signal }) =>
      adminApi<OrdersStatusCountsOut>(`${OP}/orders/status-counts`, {
        query: params as Record<string, string | number | boolean | null | undefined>,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export const exportOrders = (params: OrdersFilterParams) =>
  exportXlsx(`${OP}/orders/export`, params as Record<string, unknown>, 'orders.xlsx');

// ── ۲. تب فاکتورهای سفارش ──────────────────────────────────────────────────
export const useOrderInvoices = (params: OrdersInvoiceFilterParams) =>
  useQuery({
    queryKey: [...OK, 'invoices', params],
    queryFn: ({ signal }) =>
      adminApi<Paginated<OrdersInvoiceRowOut>>(`${OP}/orders/invoices`, {
        query: params as Record<string, string | number | boolean | null | undefined>,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export const useOrderInvoiceCounts = (params: OrdersInvoiceFilterParams) =>
  useQuery({
    queryKey: [...OK, 'invoices-counts', params],
    queryFn: ({ signal }) =>
      adminApi<OrdersInvoiceCountsOut>(`${OP}/orders/invoices/counts`, {
        query: params as Record<string, string | number | boolean | null | undefined>,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export const exportOrderInvoices = (params: OrdersInvoiceFilterParams) =>
  exportXlsx(`${OP}/orders/invoices/export`, params as Record<string, unknown>, 'order-invoices.xlsx');

// ── ۳. جزئیات یک سفارش ─────────────────────────────────────────────────────
export const useOrderDetail = (orderId: string | null | undefined) =>
  useQuery({
    queryKey: [...OK, 'detail', orderId],
    queryFn: ({ signal }) => adminApi<OrdersOrderDetailOut>(`${OP}/orders/${orderId}`, { signal }),
    enabled: !!orderId,
  });

export const fetchOrderPrint = (orderId: string) =>
  adminApi<OrdersPrintOut>(`${OP}/orders/${orderId}/print`);

// ── ۴. ویزارد ثبت سفارش و پیش‌نمایش ─────────────────────────────────────────
export const useCustomerOptions = (query: string, page = 1, pageSize = 20) =>
  useQuery({
    queryKey: [...OK, 'customer-options', query, page, pageSize],
    queryFn: ({ signal }) =>
      adminApi<Paginated<OrdersCustomerOptionOut>>(`${OP}/orders/customer-options`, {
        query: { query, page, page_size: pageSize },
        signal,
      }),
    enabled: query.trim().length >= 1,
    placeholderData: keepPreviousData,
  });

export const useCustomerAddresses = (customerId: string | null | undefined) =>
  useQuery({
    queryKey: [...OK, 'customer-addresses', customerId],
    queryFn: ({ signal }) =>
      adminApi<OrdersAddressOptionOut[]>(`${OP}/orders/customers/${customerId}/addresses`, { signal }),
    enabled: !!customerId,
  });

export const useItemOptions = (query: string, warehouseId?: string | null, page = 1, pageSize = 20) =>
  useQuery({
    queryKey: [...OK, 'item-options', query, warehouseId, page, pageSize],
    queryFn: ({ signal }) =>
      adminApi<Paginated<OrdersItemOptionOut>>(`${OP}/orders/item-options`, {
        query: { query, warehouse_id: warehouseId || undefined, page, page_size: pageSize },
        signal,
      }),
    enabled: query.trim().length >= 1,
    placeholderData: keepPreviousData,
  });

export const previewOrder = (payload: OrdersOrderIn) =>
  adminApi<OrdersPreviewOut>(`${OP}/orders/preview`, {
    method: 'POST',
    body: payload,
  });

export const createOrder = (payload: OrdersOrderIn) =>
  adminApi<OrdersOrderDetailOut>(`${OP}/orders`, {
    method: 'POST',
    body: payload,
  });

// ── ۵. تغییرات و عملیات سفارش (Mutations) ──────────────────────────────────
export function useOrderMutations() {
  const qc = useQueryClient();

  const invalidate = (id?: string) => {
    if (id) qc.invalidateQueries({ queryKey: [...OK, 'detail', id] });
    return qc.invalidateQueries({ queryKey: OK });
  };

  const create = useMutation({
    mutationFn: (payload: OrdersOrderIn) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/orders`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OrdersOrderUpdateIn }) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/orders/${id}`, {
        method: 'PATCH',
        body: payload,
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  const confirmCode = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/orders/${id}/confirm`, {
        method: 'POST',
        body: { code },
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  const resendCode = useMutation({
    mutationFn: (id: string) =>
      adminApi<OrdersConfirmationOut>(`${OP}/orders/${id}/resend-code`, {
        method: 'POST',
      }),
    onSuccess: (_, id) => invalidate(id),
  });

  const approveAccounting = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/orders/${id}/approve`, {
        method: 'POST',
        body: { note },
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  const rejectAccounting = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/orders/${id}/reject`, {
        method: 'POST',
        body: { note },
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OrdersStatusChangeIn }) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/orders/${id}/status`, {
        method: 'PATCH',
        body: payload,
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  const requestCancellation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OrdersCancelIn }) =>
      adminApi<OrdersCancellationOut>(`${OP}/orders/${id}/cancellation`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: (_, { id }) => invalidate(id),
  });

  const decideCancellation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OrdersCancelDecisionIn }) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/orders/${id}/cancellation/decision`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  const setArchived = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/orders/${id}/archive`, {
        method: 'PATCH',
        body: { archived },
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  return {
    create,
    update,
    confirmCode,
    resendCode,
    approveAccounting,
    rejectAccounting,
    changeStatus,
    requestCancellation,
    decideCancellation,
    setArchived,
  };
}

// ── ۶. درخواست‌های تأمین مشتریان ──────────────────────────────────────────
export const useCustomerSupplyRequests = (params: OrdersSupplyFilterParams) =>
  useQuery({
    queryKey: [...OK, 'supply-requests', params],
    queryFn: ({ signal }) =>
      adminApi<Paginated<OrdersSupplyRequestOut>>(`${OP}/supply-requests`, {
        query: params as Record<string, string | number | boolean | null | undefined>,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export const useSupplyCounts = (params: OrdersSupplyFilterParams) =>
  useQuery({
    queryKey: [...OK, 'supply-counts', params],
    queryFn: ({ signal }) =>
      adminApi<OrdersSupplyCountsOut>(`${OP}/supply-requests/counts`, {
        query: params as Record<string, string | number | boolean | null | undefined>,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export const exportSupplyRequests = (params: OrdersSupplyFilterParams) =>
  exportXlsx(`${OP}/supply-requests/export`, params as Record<string, unknown>, 'customer-supply-requests.xlsx');

export const useSupplyRequestDetail = (requestId: string | null | undefined) =>
  useQuery({
    queryKey: [...OK, 'supply-detail', requestId],
    queryFn: ({ signal }) =>
      adminApi<OrdersSupplyRequestDetailOut>(`${OP}/supply-requests/${requestId}`, { signal }),
    enabled: !!requestId,
  });

export function useSupplyRequestMutations() {
  const qc = useQueryClient();

  const invalidate = (id?: string) => {
    if (id) qc.invalidateQueries({ queryKey: [...OK, 'supply-detail', id] });
    return qc.invalidateQueries({ queryKey: OK });
  };

  const decide = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OrdersSupplyDecisionIn }) =>
      adminApi<OrdersSupplyRequestDetailOut>(`${OP}/supply-requests/${id}/decision`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: (data) => invalidate(data.id),
  });

  const convert = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OrdersSupplyConvertIn }) =>
      adminApi<OrdersOrderDetailOut>(`${OP}/supply-requests/${id}/convert`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => invalidate(),
  });

  return { decide, convert };
}
