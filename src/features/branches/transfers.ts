import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, apiRequest } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { fetchAll } from '@/features/users/api';
import type { Tone } from '@/shared/ui/kit';
import type { WarehouseRow } from './api';

/**
 * انتقال بین انبار — wms فعلی (`domains/wms/api/admin_docs.py`، `services/transfer.py`).
 * چرخه: PENDING ⇐ تأیید (approve، انبار مبدأ) ⇐ APPROVED ⇐ خروج از مبدأ (update، رزرو در مبدأ) ⇐ IN_TRANSIT
 * ⇐ دریافت در مقصد (update، کسر کل ارسالی از مبدأ و افزودن دریافتی به مقصد) ⇐ RECEIVED.
 * لغو: PENDING/APPROVED (انبار مبدأ)؛ رد با دلیل: PENDING/APPROVED/IN_TRANSIT (انبار مقصد).
 */
export type Transfer = AdminSchemas['TransferOut'];
export type TransferLine = AdminSchemas['TransferLineOut'];
export type TransferStatus = AdminSchemas['TransferStatusEnum'];
export type TransferCreateIn = AdminSchemas['TransferCreateIn'];
export type TransferReceiveIn = AdminSchemas['TransferReceiveIn'];

export const TRANSFER_STATUS: Record<TransferStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'در انتظار تأیید', tone: 'info' },
  APPROVED: { label: 'تأییدشده، آماده‌ی خروج', tone: 'brand' },
  IN_TRANSIT: { label: 'در حال جابه‌جایی', tone: 'warning' },
  RECEIVED: { label: 'دریافت و ثبت شد', tone: 'success' },
  REJECTED: { label: 'ردشده', tone: 'danger' },
  CANCELLED: { label: 'لغوشده', tone: 'neutral' },
};
export const TRANSFER_STATUS_OPTIONS = (Object.keys(TRANSFER_STATUS) as TransferStatus[]).map((k) => ({ value: k, label: TRANSFER_STATUS[k].label }));
export const INSURANCE: Record<string, string> = { VALID: 'معتبر', PENDING: 'در انتظار', NONE: 'ندارد' };
export const INSURANCE_OPTIONS = Object.entries(INSURANCE).map(([value, label]) => ({ value, label }));

type Q = Record<string, string | number | boolean | undefined>;
const T = ['wms', 'transfers'] as const;

export const useTransfers = (q: Q, enabled = true) =>
  useQuery({ queryKey: [...T, 'list', q], queryFn: ({ signal }) => adminApi<Paginated<Transfer>>('/wms/transfers', { query: q, signal }), enabled, placeholderData: keepPreviousData });

export type TransferSummary = AdminSchemas['TransferSummaryOut'];
/** شمار وضعیت‌ها و «واحد در مسیر» با همان فیلترهای لیست (بدون status و صفحه‌بندی) — GET /wms/transfers/summary (B-14) */
export const useTransferSummary = (q: Q, enabled = true) =>
  useQuery({ queryKey: [...T, 'summary', q], queryFn: ({ signal }) => adminApi<TransferSummary>('/wms/transfers/summary', { query: q, signal }), enabled, placeholderData: keepPreviousData });

export const useTransfer = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: [...T, 'detail', id], queryFn: ({ signal }) => adminApi<Transfer>(`/wms/transfers/${id}`, { signal }), enabled: !!id && enabled });

/**
 * همه‌ی انتقال‌های در دسترس (همه‌ی صفحه‌ها). موقت تا فیلتر `scope`/`branch_id` سمت سرور (B-19): صفحه‌های «انتقال بین شعبه و انبار» و
 * «انتقال بین شعب» انتقال‌ها را از روی شعبه‌های دو انبار در مرورگر دسته‌بندی، شمارش و صفحه‌بندی می‌کنند.
 */
export const useAllTransfers = (enabled = true) =>
  useQuery({ queryKey: [...T, 'all'], queryFn: () => fetchAll<Transfer>('/wms/transfers'), enabled });

type Wh = Transfer['source_warehouse'];
const brIds = (w: Wh) => new Set((w?.branches ?? []).map((b) => b.id));
/** شعبه‌ی مشترک دو سر انتقال (انتقال داخلی یک شعبه) یا null */
export function commonBranch(t: Transfer) {
  const d = brIds(t.destination_warehouse);
  return (t.source_warehouse?.branches ?? []).find((b) => d.has(b.id)) ?? null;
}
/** انتقال داخلی: مبدأ و مقصد هر دو متعلق به یک شعبه (خود شعبه = انبار اصلی، یا انبارهای اختصاصی آن) */
export const isInternal = (t: Transfer) => !!commonBranch(t);
/** انتقال بین شعب: هر دو سر شعبه دارند و شعبه‌ی مشترک ندارند */
export const isInterBranch = (t: Transfer) => brIds(t.source_warehouse).size > 0 && brIds(t.destination_warehouse).size > 0 && !commonBranch(t);

/** همه‌ی انبارهای در دسترس کاربر (برای فیلتر و فرم انتقال) */
export const useAllWarehouses = (enabled = true) =>
  useQuery({ queryKey: ['organization', 'warehouses', 'all'], queryFn: () => fetchAll<WarehouseRow>('/organization/warehouses'), enabled, staleTime: 5 * 60_000 });

export function useTransferWrite() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['wms'] });
  const m = <V,>(fn: (v: V) => Promise<Transfer>) => useMutation({ mutationFn: fn, onSuccess: done }); // eslint-disable-line react-hooks/rules-of-hooks
  return {
    create: m((b: TransferCreateIn) => adminApi<Transfer>('/wms/transfers', { method: 'POST', body: b })),
    approve: m((id: string) => adminApi<Transfer>(`/wms/transfers/${id}/approve`, { method: 'POST' })),
    dispatch: m((id: string) => adminApi<Transfer>(`/wms/transfers/${id}/dispatch`, { method: 'PATCH' })),
    receive: m(({ id, body }: { id: string; body: TransferReceiveIn }) => adminApi<Transfer>(`/wms/transfers/${id}/receive`, { method: 'PUT', body })),
    reject: m(({ id, reason }: { id: string; reason: string }) => adminApi<Transfer>(`/wms/transfers/${id}/reject`, { method: 'PATCH', body: { reason } })),
    cancel: m((id: string) => adminApi<Transfer>(`/wms/transfers/${id}/cancel`, { method: 'PATCH' })),
    image: m(({ id, file }: { id: string; file: File }) => { const fd = new FormData(); fd.append('file', file); return adminApi<Transfer>(`/wms/transfers/${id}/receipt-image`, { method: 'PUT', body: fd }); }),
  };
}

/** رسید امضاشده‌ی انتقال با توکن (فایل خصوصی است) */
export async function openTransferReceipt(id: string) {
  const blob = await apiRequest<Blob>('admin', `/wms/transfers/${id}/receipt-image`, { raw: true });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
