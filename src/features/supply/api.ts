import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';

/**
 * API ماژول «خرید و تأمین» — همه زیر /api/v1/admin/supply (بک‌اند domains/supply، فاز ۱).
 * نوع‌ها فقط از OpenAPI (AdminSchemas)؛ متدها از OpenAPI خوانده شده‌اند، نه از یادداشت.
 */
const P = '/supply';

export type Supplier = AdminSchemas['SupplierOut'];
export type SupplierIn = AdminSchemas['SupplierIn'];
export type SupplierUpdateIn = AdminSchemas['SupplierUpdateIn'];
export type SupplierOption = AdminSchemas['SupplierOptionOut'];
export type SupplierStatus = AdminSchemas['SupplierStatusEnum'];
export type Invoice = AdminSchemas['InvoiceOut'];
export type CouncilMember = AdminSchemas['CouncilMemberOut'];
export type CouncilMemberUpdateIn = AdminSchemas['CouncilMemberUpdateIn'];
export type VoteHistory = AdminSchemas['VoteHistoryOut'];

/** پارامترهای فهرست؛ آرایه ⇐ پارامتر تکراری (مثل `final_status=CANCELLED&final_status=CLOSED`) */
export type ListParams = { page?: number; page_size?: number; query?: string; [k: string]: string | string[] | number | boolean | undefined };

/** تازگی فهرست‌های انتخاب‌گر (ms) — مثل pickerهای مدیریت کاربران */
const PICKER_STALE_MS = 60_000;

export const K = {
  suppliers: ['supply', 'suppliers'] as const,
  invoices: ['supply', 'invoices'] as const,
  council: ['supply', 'council'] as const,
};

// ── تأمین‌کنندگان ──
export const useSuppliers = (p: ListParams) =>
  useQuery({ queryKey: [...K.suppliers, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<Supplier>>(`${P}/suppliers`, { query: p, signal }), placeholderData: keepPreviousData });

export const useSupplier = (id: string | undefined) =>
  useQuery({ queryKey: [...K.suppliers, 'one', id], queryFn: ({ signal }) => adminApi<Supplier>(`${P}/suppliers/${id}`, { signal }), enabled: !!id });

/** سوابق خرید یک تأمین‌کننده (فاکتورها، صفحه‌بندی سرور) */
export const useSupplierPurchases = (id: string | undefined, p: ListParams, enabled = true) =>
  useQuery({
    queryKey: [...K.suppliers, 'one', id, 'purchases', p],
    queryFn: ({ signal }) => adminApi<Paginated<Invoice>>(`${P}/suppliers/${id}/purchases`, { query: p, signal }),
    enabled: !!id && enabled, placeholderData: keepPreviousData,
  });

/** فهرست کوتاه فقط تأمین‌کنندگان فعال برای انتخاب‌گرهای اسناد */
export const useSupplierOptions = (query: string, enabled = true) =>
  useQuery({ queryKey: [...K.suppliers, 'options', query], queryFn: ({ signal }) => adminApi<SupplierOption[]>(`${P}/suppliers/options`, { query: { query: query || undefined }, signal }), enabled, staleTime: PICKER_STALE_MS });

export function useSupplierWrite() {
  const qc = useQueryClient();
  const done = (x?: Supplier) => {
    if (x) qc.setQueryData([...K.suppliers, 'one', x.id], x);
    return qc.invalidateQueries({ queryKey: K.suppliers });
  };
  return {
    create: useMutation({ mutationFn: (body: SupplierIn) => adminApi<Supplier>(`${P}/suppliers`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: SupplierUpdateIn }) => adminApi<Supplier>(`${P}/suppliers/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    block: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi<Supplier>(`${P}/suppliers/${id}/block`, { method: 'PATCH', body: { reason } }), onSuccess: done }),
    unblock: useMutation({ mutationFn: (id: string) => adminApi<Supplier>(`${P}/suppliers/${id}/unblock`, { method: 'PATCH' }), onSuccess: done }),
    setActive: useMutation({ mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => adminApi<Supplier>(`${P}/suppliers/${id}/active`, { method: 'PATCH', body: { is_active } }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/suppliers/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: K.suppliers }) }),
  };
}

// ── شورای تأمین (مدیریت اعضا در تنظیمات؛ افشین 2026-10-31) ──
export const useCouncilMembers = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: [...K.council, 'members', p], queryFn: ({ signal }) => adminApi<Paginated<CouncilMember>>(`${P}/council/members`, { query: p, signal }), enabled, placeholderData: keepPreviousData });

/** سوابق رأی یک عضو (صفحه‌بندی سرور) */
export const useMemberVotes = (id: string | undefined, p: ListParams) =>
  useQuery({ queryKey: [...K.council, 'votes', id, p], queryFn: ({ signal }) => adminApi<Paginated<VoteHistory>>(`${P}/council/members/${id}/votes`, { query: p, signal }), enabled: !!id, placeholderData: keepPreviousData });

export function useCouncilWrite() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: K.council });
  return {
    /** افزودن؛ عضو غیرفعال قبلی همان کاربر دوباره فعال می‌شود (بک‌اند) */
    add: useMutation({ mutationFn: (body: AdminSchemas['CouncilMemberIn']) => adminApi<CouncilMember>(`${P}/council/members`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: CouncilMemberUpdateIn }) => adminApi<CouncilMember>(`${P}/council/members/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    /** کنار گذاشتن = غیرفعال؛ سوابق رأی می‌ماند */
    remove: useMutation({ mutationFn: (id: string) => adminApi<CouncilMember>(`${P}/council/members/${id}/remove`, { method: 'PATCH' }), onSuccess: done }),
  };
}

// ── عنوان‌های شورای تأمین (بک‌اند 2026-10-31، کمبود S-10 رفع شد) ──
export type CouncilTitle = AdminSchemas['CouncilTitleOut'];
export type CouncilTitleOption = AdminSchemas['CouncilTitleOptionOut'];

/** گزینه‌های فرم عضو: فقط عنوان‌های فعال؛ با مجوز فهرست اعضای شورا (نه مجوز تنظیمات) */
export const useCouncilTitleOptions = (enabled = true) =>
  useQuery({ queryKey: [...K.council, 'title-options'], queryFn: ({ signal }) => adminApi<CouncilTitleOption[]>(`${P}/council/titles`, { signal }), enabled, staleTime: PICKER_STALE_MS });

/** فهرست مدیریتی عنوان‌ها در تنظیمات — /settings/council-titles (مجوزهای settings.council_titles.*) */
export const useCouncilTitles = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: [...K.council, 'titles', p], queryFn: ({ signal }) => adminApi<Paginated<CouncilTitle>>('/settings/council-titles', { query: p, signal }), enabled, placeholderData: keepPreviousData });

export function useCouncilTitleWrite() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: K.council });
  return {
    create: useMutation({ mutationFn: (body: AdminSchemas['CouncilTitleIn']) => adminApi<CouncilTitle>('/settings/council-titles', { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: AdminSchemas['CouncilTitleUpdateIn'] }) => adminApi<CouncilTitle>(`/settings/council-titles/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    /** حذف واقعی ندارد: DELETE …/archive آرشیو می‌کند */
    archive: useMutation({ mutationFn: (id: string) => adminApi<CouncilTitle>(`/settings/council-titles/${id}/archive`, { method: 'DELETE' }), onSuccess: done }),
    restore: useMutation({ mutationFn: (id: string) => adminApi<CouncilTitle>(`/settings/council-titles/${id}/restore`, { method: 'PATCH' }), onSuccess: done }),
  };
}
