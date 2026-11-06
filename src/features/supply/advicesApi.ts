import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import type { ListParams } from './api';
import { saveBlob } from '@/shared/lib/download';

/**
 * اعلامیه‌ی رسید انبار (supply.receipt_advices) — /api/v1/admin/supply/advices. متدها از OpenAPI.
 * صدور اعلامیه همان لحظه یک رسید انبار (wms) می‌سازد؛ وضعیت اعلامیه را فقط انبار با شمارش و ثبت نهایی رسید عوض می‌کند.
 * فاکتور خرید از اعلامیه‌ی «تأیید انبار» یا «دریافت ناقص» ساخته می‌شود (پیش‌نویس، با تعداد شمارش انبار).
 */
const P = '/supply';
const AK = ['supply', 'advices'] as const;

export type Advice = AdminSchemas['AdviceOut'];
export type AdviceLine = AdminSchemas['AdviceLineOut'];
export type AdviceIn = AdminSchemas['AdviceIn'];
export type AdviceUpdateIn = AdminSchemas['AdviceUpdateIn'];
export type PricedLineIn = AdminSchemas['AdviceLineIn'];
export type AdviceCounts = AdminSchemas['AdviceStatusCountsOut'];
export type InvoiceFromAdviceIn = AdminSchemas['InvoiceFromAdviceIn'];
export type PurchaseInvoice = AdminSchemas['InvoiceOut'];

export const useAdvices = (p: ListParams) =>
  useQuery({ queryKey: [...AK, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<Advice>>(`${P}/advices`, { query: p, signal }), placeholderData: keepPreviousData });

export const useAdviceCounts = (p: ListParams) =>
  useQuery({ queryKey: [...AK, 'counts', p], queryFn: ({ signal }) => adminApi<AdviceCounts>(`${P}/advices/status-counts`, { query: p, signal }), placeholderData: keepPreviousData });

export const useAdvice = (id: string | null | undefined) =>
  useQuery({ queryKey: [...AK, 'one', id], queryFn: ({ signal }) => adminApi<Advice>(`${P}/advices/${id}`, { signal }), enabled: !!id });

export function useAdviceWrite() {
  const qc = useQueryClient();
  const done = (x?: Advice) => {
    if (x) qc.setQueryData([...AK, 'one', x.id], x);
    // اعلامیه وضعیت درخواست تأمین (شماره‌ی اعلامیه، بسته شدن با ابطال) را هم عوض می‌کند
    void qc.invalidateQueries({ queryKey: ['supply', 'requests'] });
    return qc.invalidateQueries({ queryKey: AK });
  };
  const id = (a: string) => `${P}/advices/${a}`;
  return {
    create: useMutation({ mutationFn: (body: AdviceIn) => adminApi<Advice>(`${P}/advices`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ aid, body }: { aid: string; body: AdviceUpdateIn }) => adminApi<Advice>(id(aid), { method: 'PATCH', body }), onSuccess: done }),
    void: useMutation({ mutationFn: ({ aid, reason }: { aid: string; reason: string }) => adminApi<Advice>(`${id(aid)}/void`, { method: 'POST', body: { reason } }), onSuccess: done }),
    archive: useMutation({ mutationFn: ({ aid, archived }: { aid: string; archived: boolean }) => adminApi<Advice>(`${id(aid)}/archive`, { method: 'PATCH', body: { archived } }), onSuccess: done }),
    invoice: useMutation({
      mutationFn: ({ aid, body }: { aid: string; body: InvoiceFromAdviceIn }) => adminApi<PurchaseInvoice>(`${id(aid)}/invoice`, { method: 'POST', body }),
      onSuccess: () => { void qc.invalidateQueries({ queryKey: ['supply', 'invoices'] }); return qc.invalidateQueries({ queryKey: AK }); },
    }),
  };
}

/** خروجی اکسل با همان فیلترها (بدون صفحه‌بندی) */
export async function exportAdvices(p: ListParams) {
  const { page: _p, page_size: _s, ...q } = p;
  const blob = await adminApi<Blob>(`${P}/advices/export`, { query: q, raw: true });
  saveBlob(blob, 'receipt-advices.xlsx');
}

/** رسید انبار هنوز شمارش نشده ⇐ ردیف‌های اعلامیه قابل تغییرند (بک‌اند ReceiptAdviceService.update_advice) */
export const RECEIPT_EDITABLE = ['AWAITING_MANAGER', 'AWAITING_RECEIPT'];
