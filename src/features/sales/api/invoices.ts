import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { exportXlsx, SK, SP, type SalesListParams } from './common';

/**
 * فاکتورهای فروش و تسویه — /api/v1/admin/sales/invoices و /settlements (مسیر و متد از OpenAPI).
 * چرخه: پیش‌نویس (بی‌شماره) ⇐ «تأیید و صدور» (شماره‌ی INV و قفل ردیف‌ها) ⇐ تسویه ⇐ (ابطال سخت‌گیرانه | اصلاحیه‌ی فقط سوپر ادمین).
 * هیچ مبلغی از فرانت فرستاده نمی‌شود؛ فرم فقط کالا، تعداد و انبار می‌فرستد و سند قیمت‌گذاری‌شده از پاسخ نمایش داده می‌شود.
 */
const IK = [...SK, 'invoices'] as const;
const ONE = [...SK, 'invoice'] as const;

export type Invoice = AdminSchemas['SalesInvoiceOut'];
export type InvoiceLine = AdminSchemas['SalesPricedLineOut'];
export type InvoiceIn = AdminSchemas['SalesInvoiceIn'];
export type InvoiceUpdateIn = AdminSchemas['SalesInvoiceUpdateIn'];
export type InvoiceAmendIn = AdminSchemas['SalesInvoiceAmendIn'];
export type LineIn = AdminSchemas['SalesLineIn'];
export type InvoiceCounts = AdminSchemas['SalesInvoiceStatusCountsOut'];
export type InvoicePrint = AdminSchemas['SalesInvoicePrintOut'];
export type Settlement = AdminSchemas['SalesSettlementOut'];
export type SettlementIn = AdminSchemas['SalesSettlementIn'];
export type Revision = AdminSchemas['SalesRevisionOut'];
export type InvoiceReturnBrief = AdminSchemas['SalesInvoiceReturnBriefOut'];
export type EChequeStep = AdminSchemas['SalesEChequeStepEnum'];

export const useInvoices = (p: SalesListParams) =>
  useQuery({ queryKey: [...IK, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<Invoice>>(`${SP}/invoices`, { query: p, signal }), placeholderData: keepPreviousData });

/** شمارنده‌ی تب‌ها با همان فیلترهای فهرست، بدون `tab` و `status` (راهنمای API) */
export const useInvoiceCounts = (p: SalesListParams) =>
  useQuery({ queryKey: [...IK, 'counts', p], queryFn: ({ signal }) => adminApi<InvoiceCounts>(`${SP}/invoices/status-counts`, { query: p, signal }), placeholderData: keepPreviousData });

export const useInvoice = (id: string | null | undefined) =>
  useQuery({ queryKey: [...ONE, id], queryFn: ({ signal }) => adminApi<Invoice>(`${SP}/invoices/${id}`, { signal }), enabled: !!id });

/** داده‌ی چاپ؛ هر بار صدا زدن یک رخداد «چاپ» در بک‌اند ثبت می‌کند ⇐ فقط با دکمه‌ی «چاپ» */
export const fetchInvoicePrint = (id: string) => adminApi<InvoicePrint>(`${SP}/invoices/${id}/print`);

export const exportInvoices = (p: SalesListParams) => exportXlsx(`${SP}/invoices/export`, p, 'sales-invoices.xlsx');

export function useInvoiceWrite() {
  const qc = useQueryClient();
  /** پاسخ روی کلید همان سند و کل ماژول فروش تازه می‌شود (فهرست، شمارنده، مرور فروش و طرف حساب) */
  const done = (x?: Invoice) => {
    if (x) qc.setQueryData([...ONE, x.id], x);
    return qc.invalidateQueries({ queryKey: SK });
  };
  const at = (id: string) => `${SP}/invoices/${id}`;
  return {
    create: useMutation({ mutationFn: (body: InvoiceIn) => adminApi<Invoice>(`${SP}/invoices`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: InvoiceUpdateIn }) => adminApi<Invoice>(at(id), { method: 'PATCH', body }), onSuccess: done }),
    amend: useMutation({ mutationFn: ({ id, body }: { id: string; body: InvoiceAmendIn }) => adminApi<Invoice>(`${at(id)}/amend`, { method: 'PUT', body }), onSuccess: done }),
    issue: useMutation({ mutationFn: (id: string) => adminApi<Invoice>(`${at(id)}/issue`, { method: 'POST' }), onSuccess: done }),
    void: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi<Invoice>(`${at(id)}/void`, { method: 'POST', body: { reason } }), onSuccess: done }),
    archive: useMutation({ mutationFn: ({ id, archived }: { id: string; archived: boolean }) => adminApi<Invoice>(`${at(id)}/archive`, { method: 'PATCH', body: { archived } }), onSuccess: done }),
  };
}

/** تسویه: هر ثبت یا لغو، مانده و وضعیت تسویه‌ی فاکتور را عوض می‌کند ⇐ کل ماژول فروش تازه می‌شود */
export function useSettlementWrite() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: SK });
  return {
    record: useMutation({ mutationFn: ({ invoiceId, body }: { invoiceId: string; body: SettlementIn }) => adminApi<Settlement>(`${SP}/invoices/${invoiceId}/settlements`, { method: 'POST', body }), onSuccess: done }),
    cancel: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi<Settlement>(`${SP}/settlements/${id}/cancel`, { method: 'DELETE', body: { reason } }), onSuccess: done }),
    /** سه مرحله‌ی ترتیبی چک الکترونیکی؛ مرحله‌ی «signed» فایل چک امضاشده را می‌گیرد (multipart، فیلد file) */
    eCheque: useMutation({
      mutationFn: ({ id, step, file }: { id: string; step: EChequeStep; file?: File }) => {
        const fd = new FormData();
        if (file) fd.append('file', file);
        return adminApi<Settlement>(`${SP}/settlements/${id}/e-cheque/${step}`, { method: 'POST', body: fd });
      },
      onSuccess: done,
    }),
  };
}
