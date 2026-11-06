import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { K, type ListParams } from './api';
import { saveBlob } from '@/shared/lib/download';

/**
 * درخواست تأمین (supply.supply_requests) — /api/v1/admin/supply/requests؛ رأی شورا، دو مرحله‌ی تصمیم (تأمین، مالی)،
 * مستندات، تعیین تأمین‌کننده/انبار. متدها از OpenAPI.
 */
const P = '/supply';

export type SupplyRequest = AdminSchemas['RequestOut'];
export type RequestLine = AdminSchemas['RequestLineOut'];
export type RequestLineIn = AdminSchemas['RequestLineIn'];
export type RequestIn = AdminSchemas['RequestIn'];
export type RequestUpdateIn = AdminSchemas['RequestUpdateIn'];
export type RequestByItem = AdminSchemas['RequestByItemOut'];
export type RequestCounts = AdminSchemas['RequestStatusCountsOut'];
export type Vote = AdminSchemas['VoteOut'];
export type Approval = AdminSchemas['ApprovalOut'];
export type VoteSummary = AdminSchemas['VoteSummaryOut'];
export type SupplyItem = AdminSchemas['SupplyItemOut'];
export type SupplyPerson = AdminSchemas['SupplyPersonOut'];
export type PurchaseInfo = AdminSchemas['ItemPurchaseInfoOut'];

const RK = ['supply', 'requests'] as const;
/** سقف شمار کالا در هر درخواست purchase-info (بک‌اند) */
const PURCHASE_INFO_MAX = 100;
const STALE_MS = 30_000;
/** مهلت آزاد کردن نشانی blob پس از باز شدن/دانلود (ms) */
const BLOB_TTL_MS = 60_000;
/** دسته‌ی فرعی از سطح سوم به بعد مسیر */
const SUB_LEVEL = 2;

export const useRequests = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: [...RK, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<SupplyRequest>>(`${P}/requests`, { query: p, signal }), enabled, placeholderData: keepPreviousData });

export const useRequestCounts = (p: ListParams) =>
  useQuery({ queryKey: [...RK, 'counts', p], queryFn: ({ signal }) => adminApi<RequestCounts>(`${P}/requests/status-counts`, { query: p, signal }), placeholderData: keepPreviousData });

export const useRequestsByItem = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: [...RK, 'by-item', p], queryFn: ({ signal }) => adminApi<Paginated<RequestByItem>>(`${P}/requests/by-item`, { query: p, signal }), enabled, placeholderData: keepPreviousData });

export const useRequest = (id: string | null | undefined) =>
  useQuery({ queryKey: [...RK, 'one', id], queryFn: ({ signal }) => adminApi<SupplyRequest>(`${P}/requests/${id}`, { signal }), enabled: !!id });

/** آخرین فی خرید، آخرین تأمین‌کننده و موجودی کالاها (S-07 ✅)؛ مجوز فهرست تأمین‌کنندگان */
export const usePurchaseInfo = (ids: string[], enabled = true) =>
  useQuery({
    queryKey: [...RK, 'purchase-info', ids],
    queryFn: ({ signal }) => adminApi<PurchaseInfo[]>(`${P}/items/purchase-info`, { query: { item_ids: ids.slice(0, PURCHASE_INFO_MAX) }, signal }),
    enabled: enabled && ids.length > 0, staleTime: STALE_MS,
    select: (rows) => new Map(rows.map((r) => [r.item_id, r])),
  });

/** دانلود فایل خصوصی (مستند یا پیوست رأی) با توکن ⇐ باز شدن در پنجره‌ی تازه */
export async function openFile(path: string) {
  const blob = await adminApi<Blob>(path, { raw: true });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), BLOB_TTL_MS);
}

export function useRequestWrite() {
  const qc = useQueryClient();
  const done = (x?: SupplyRequest | SupplyRequest[]) => {
    if (x && !Array.isArray(x)) qc.setQueryData([...RK, 'one', x.id], x);
    return qc.invalidateQueries({ queryKey: RK });
  };
  const id = (r: string) => `${P}/requests/${r}`;
  return {
    create: useMutation({ mutationFn: (body: RequestIn) => adminApi<SupplyRequest>(`${P}/requests`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ rid, body }: { rid: string; body: RequestUpdateIn }) => adminApi<SupplyRequest>(id(rid), { method: 'PATCH', body }), onSuccess: done }),
    cancel: useMutation({ mutationFn: ({ rid, reason }: { rid: string; reason: string }) => adminApi<SupplyRequest>(`${id(rid)}/cancel`, { method: 'PATCH', body: { reason } }), onSuccess: done }),
    upload: useMutation({
      mutationFn: ({ rid, file, title }: { rid: string; file: File; title: string }) => {
        const fd = new FormData(); fd.append('file', file); fd.append('title', title);
        return adminApi<SupplyRequest>(`${id(rid)}/documents`, { method: 'PUT', body: fd });
      }, onSuccess: done,
    }),
    removeDoc: useMutation({ mutationFn: ({ rid, docId }: { rid: string; docId: string }) => adminApi<SupplyRequest>(`${id(rid)}/documents/${docId}/remove`, { method: 'PATCH' }), onSuccess: done }),
    vote: useMutation({
      mutationFn: ({ rid, vote, reason, document, deposit }: { rid: string; vote: 'FOR' | 'AGAINST'; reason: string; document?: File | null; deposit?: number | null }) => {
        const fd = new FormData(); fd.append('vote', vote); fd.append('reason', reason); if (document) fd.append('document', document);
        // مبلغ پیشنهادی بیعانه فقط در رأی موافقِ درخواست مشتری (بک‌اند در بقیه‌ی حالت‌ها رد می‌کند)
        if (deposit != null) fd.append('deposit_amount', String(deposit));
        return adminApi<SupplyRequest>(`${id(rid)}/votes`, { method: 'POST', body: fd });
      }, onSuccess: (x) => { void qc.invalidateQueries({ queryKey: K.council }); return done(x); },
    }),
    decide: useMutation({ mutationFn: ({ rid, ...body }: { rid: string } & AdminSchemas['SupplyDecisionIn']) => adminApi<SupplyRequest>(`${id(rid)}/decision`, { method: 'POST', body }), onSuccess: done }),
    orders: useMutation({ mutationFn: ({ rid, approved, reason }: { rid: string; approved: boolean; reason: string }) => adminApi<SupplyRequest>(`${id(rid)}/orders-decision`, { method: 'POST', body: { approved, reason } }), onSuccess: done }),
    unsuppliable: useMutation({ mutationFn: ({ rid, reason }: { rid: string; reason: string }) => adminApi<SupplyRequest>(`${id(rid)}/unsuppliable`, { method: 'POST', body: { reason } }), onSuccess: done }),
    reconcile: useMutation({ mutationFn: ({ rid, approved, note }: { rid: string; approved: boolean; note: string }) => adminApi<SupplyRequest>(`${id(rid)}/reconcile`, { method: 'POST', body: { approved, note } }), onSuccess: done }),
    refund: useMutation({ mutationFn: ({ rid, note }: { rid: string; note: string }) => adminApi<SupplyRequest>(`${id(rid)}/refund`, { method: 'POST', body: { note } }), onSuccess: done }),
    finance: useMutation({ mutationFn: ({ rid, approved, reason }: { rid: string; approved: boolean; reason: string }) => adminApi<SupplyRequest>(`${id(rid)}/finance-decision`, { method: 'POST', body: { approved, reason } }), onSuccess: done }),
    assign: useMutation({ mutationFn: ({ rid, supplier_id, warehouse_id }: { rid: string; supplier_id: string; warehouse_id: string }) => adminApi<SupplyRequest>(`${id(rid)}/assign-supplier`, { method: 'PATCH', body: { supplier_id, warehouse_id } }), onSuccess: done }),
    assignByItem: useMutation({ mutationFn: (body: AdminSchemas['AssignSupplierForItemIn']) => adminApi<SupplyRequest[]>(`${P}/requests/assign-supplier-by-item`, { method: 'PATCH', body }), onSuccess: done }),
  };
}

/** خروجی اکسل با همان فیلترها (بدون صفحه‌بندی) */
export async function exportRequests(p: ListParams) {
  const { page: _p, page_size: _s, ...q } = p;
  const blob = await adminApi<Blob>(`${P}/requests/export`, { query: q, raw: true });
  saveBlob(blob, 'supply-requests.xlsx');
}

/** مقدار عددی بک‌اند («10.000» یا "250000.00») ⇐ عدد صحیح */
export const int = (v: string | number | null | undefined): number => Math.trunc(Number(v ?? 0)) || 0;
/** مسیر دسته‌ی کالا («اصلی > میانی > فرعی») ⇐ سه سطح */
export const splitPath = (p: string | null | undefined): [string, string, string] => {
  const parts = (p ?? '').split('>').map((x) => x.trim()).filter(Boolean);
  return [parts[0] ?? '', parts[1] ?? '', parts.slice(SUB_LEVEL).join(' › ')];
};
/** نام و نقش‌های شخص */
export const personName = (x: SupplyPerson | null | undefined) => x?.full_name || '—';
export const personRoles = (x: SupplyPerson | null | undefined) => (x?.role_names?.length ? x.role_names.join('، ') : '');

/** درخواست مشتری (S-24): منبع «پیش‌سفارش مشتری»؛ بیعانه و تأیید مالی فقط برای همین درخواست‌هاست */
export const isCustomerRequest = (r: Pick<SupplyRequest, 'source'>): boolean => r.source === 'CUSTOMER_PREORDER';
