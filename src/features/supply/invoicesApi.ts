import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import type { ListParams } from './api';
import { saveBlob } from '@/shared/lib/download';

/**
 * فاکتور خرید (supply.purchase_invoices) — /api/v1/admin/supply/invoices. متدها از OpenAPI.
 * چرخه‌ی بک‌اند: پیش‌نویس ⇐ ویرایش‌شده ⇐ «تأیید و صدور» (ردیف‌ها قفل و قیمت خرید در قیمت‌گذاری ثبت می‌شود) ⇐ ابطال ⇐ بایگانی ابطالی.
 * فاکتور یا از اعلامیه ساخته می‌شود (صفحه‌ی اعلامیه) یا مستقیم ثبت می‌شود (هر ردیف انبار خودش را دارد؛ رسید انبار ثبت‌نهایی‌شده اختیاری).
 */
const P = '/supply';
const IK = ['supply', 'invoices'] as const;
const PICKER_STALE_MS = 30_000;

export type Invoice = AdminSchemas['InvoiceOut'];
export type InvoiceCounts = AdminSchemas['InvoiceStatusCountsOut'];
export type InvoiceLine = AdminSchemas['InvoiceLineOut'];
export type InvoiceIn = AdminSchemas['InvoiceIn'];
export type InvoiceUpdateIn = AdminSchemas['InvoiceUpdateIn'];
export type InvoiceLineIn = AdminSchemas['InvoiceLineIn'];
export type WmsReceipt = AdminSchemas['ReceiptOut'];
export type DeliveryType = AdminSchemas['DeliveryTypeEnum'];
export type SettlementMethod = AdminSchemas['SettlementMethodEnum'];
export const DELIVERY_KEYS: DeliveryType[] = ['WAREHOUSE', 'FACTORY_GATE'];
export const SETTLEMENT_KEYS: SettlementMethod[] = ['CASH', 'CHEQUE', 'TRANSFER'];
/** فاکتور فقط در این وضعیت‌ها ویرایش یا «تأیید و صدور» می‌شود (بک‌اند PurchaseInvoice.EDITABLE) */
export const INVOICE_EDITABLE = ['DRAFT', 'EDITED'];

export const useInvoices = (p: ListParams) =>
  useQuery({ queryKey: [...IK, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<Invoice>>(`${P}/invoices`, { query: p, signal }), placeholderData: keepPreviousData });

/** شمارنده‌ی تب‌ها با همان فیلترهای فهرست؛ status و voided را بک‌اند نادیده می‌گیرد (S-18 ✅) */
export const useInvoiceCounts = (p: ListParams) =>
  useQuery({ queryKey: [...IK, 'counts', p], queryFn: ({ signal }) => adminApi<InvoiceCounts>(`${P}/invoices/status-counts`, { query: p, signal }), placeholderData: keepPreviousData });

export const useInvoice = (id: string | null | undefined) =>
  useQuery({ queryKey: [...IK, 'one', id], queryFn: ({ signal }) => adminApi<Invoice>(`${P}/invoices/${id}`, { signal }), enabled: !!id });

/** رسیدهای انبار ثبت‌نهایی‌شده برای اتصال اختیاری فاکتور مستقیم (مجوز فهرست ورود کالای انبار) */
export const usePostedReceipts = (p: ListParams, enabled = true) =>
  useQuery({
    queryKey: ['wms', 'receipts', 'posted', p], enabled, staleTime: PICKER_STALE_MS, placeholderData: keepPreviousData,
    queryFn: ({ signal }) => adminApi<Paginated<WmsReceipt>>('/wms/receipts', { query: { ...p, status: 'POSTED' }, signal }),
  });

export function useInvoiceWrite() {
  const qc = useQueryClient();
  const done = (x?: Invoice) => {
    if (x) qc.setQueryData([...IK, 'one', x.id], x);
    // فاکتور ستون «فاکتور» اعلامیه را هم عوض می‌کند
    void qc.invalidateQueries({ queryKey: ['supply', 'advices'] });
    return qc.invalidateQueries({ queryKey: IK });
  };
  const id = (i: string) => `${P}/invoices/${i}`;
  return {
    create: useMutation({ mutationFn: (body: InvoiceIn) => adminApi<Invoice>(`${P}/invoices`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ iid, body }: { iid: string; body: InvoiceUpdateIn }) => adminApi<Invoice>(id(iid), { method: 'PATCH', body }), onSuccess: done }),
    approve: useMutation({ mutationFn: (iid: string) => adminApi<Invoice>(`${id(iid)}/approve`, { method: 'POST' }), onSuccess: done }),
    void: useMutation({ mutationFn: ({ iid, reason }: { iid: string; reason: string }) => adminApi<Invoice>(`${id(iid)}/void`, { method: 'POST', body: { reason } }), onSuccess: done }),
    archive: useMutation({ mutationFn: ({ iid, archived }: { iid: string; archived: boolean }) => adminApi<Invoice>(`${id(iid)}/archive`, { method: 'PATCH', body: { archived } }), onSuccess: done }),
    upload: useMutation({
      mutationFn: ({ iid, file }: { iid: string; file: File }) => {
        const fd = new FormData(); fd.append('file', file);
        return adminApi<Invoice>(`${id(iid)}/file`, { method: 'PUT', body: fd });
      }, onSuccess: done,
    }),
  };
}

/** خروجی اکسل با همان فیلترها (بدون صفحه‌بندی) */
export async function exportInvoices(p: ListParams) {
  const { page: _p, page_size: _s, ...q } = p;
  const blob = await adminApi<Blob>(`${P}/invoices/export`, { query: q, raw: true });
  saveBlob(blob, 'purchase-invoices.xlsx');
}
