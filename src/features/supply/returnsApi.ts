import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import type { ListParams } from './api';
import { saveBlob } from '@/shared/lib/download';

/**
 * برگشت از خرید (supply.purchase_returns) — /api/v1/admin/supply/returns. متدها از OpenAPI.
 * بر اساس فاکتور «تأیید و صادرشده»: ردیف‌ها فقط از کالاهای همان فاکتور و حداکثر به اندازه‌ی باقی‌مانده‌ی قابل برگشت؛ فی پیش‌فرض = فی خالص فاکتور.
 * پیش‌نویس ⇐ «تأیید» (خروج کالا از انبار به تأمین‌کننده) یا «لغو پیش‌نویس» (DELETE؛ سند با وضعیت «لغو شده» می‌ماند).
 */
const P = '/supply';
const RK = ['supply', 'returns'] as const;

export type PurchaseReturn = AdminSchemas['ReturnOut'];
export type ReturnLine = AdminSchemas['ReturnLineOut'];
export type ReturnIn = AdminSchemas['ReturnIn'];
export type ReturnUpdateIn = AdminSchemas['ReturnUpdateIn'];
export type ReturnLineIn = AdminSchemas['ReturnLineIn'];

export const useReturns = (p: ListParams) =>
  useQuery({ queryKey: [...RK, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<PurchaseReturn>>(`${P}/returns`, { query: p, signal }), placeholderData: keepPreviousData });

export const useReturn = (id: string | null | undefined) =>
  useQuery({ queryKey: [...RK, 'one', id], queryFn: ({ signal }) => adminApi<PurchaseReturn>(`${P}/returns/${id}`, { signal }), enabled: !!id });

export function useReturnWrite() {
  const qc = useQueryClient();
  const done = (x?: PurchaseReturn) => {
    if (x) qc.setQueryData([...RK, 'one', x.id], x);
    // برگشتی فعال جلوی ابطال فاکتور را می‌گیرد
    void qc.invalidateQueries({ queryKey: ['supply', 'invoices'] });
    return qc.invalidateQueries({ queryKey: RK });
  };
  const id = (r: string) => `${P}/returns/${r}`;
  return {
    create: useMutation({ mutationFn: (body: ReturnIn) => adminApi<PurchaseReturn>(`${P}/returns`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ rid, body }: { rid: string; body: ReturnUpdateIn }) => adminApi<PurchaseReturn>(id(rid), { method: 'PATCH', body }), onSuccess: done }),
    approve: useMutation({ mutationFn: (rid: string) => adminApi<PurchaseReturn>(`${id(rid)}/approve`, { method: 'POST' }), onSuccess: done }),
    cancel: useMutation({ mutationFn: ({ rid, reason }: { rid: string; reason: string }) => adminApi<PurchaseReturn>(id(rid), { method: 'DELETE', body: { reason } }), onSuccess: done }),
  };
}

/** خروجی اکسل با همان فیلترها (بدون صفحه‌بندی) */
export async function exportReturns(p: ListParams) {
  const { page: _p, page_size: _s, ...q } = p;
  const blob = await adminApi<Blob>(`${P}/returns/export`, { query: q, raw: true });
  saveBlob(blob, 'purchase-returns.xlsx');
}
