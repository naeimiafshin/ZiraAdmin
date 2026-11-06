import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { fetchAll } from '@/features/users/api';

/**
 * API ادمین «قیمت‌گذاری» — پیشوند /api/v1/admin/pricing (مرجع: domains/pricing/api/*.py).
 * قیمت کالاها (prices)، لیست قیمت = سند بازنگری قیمت سراسری (تصمیم 2026-10-11)، قرارداد = قاعده‌ی تعدیل درصدی که لیست قیمت پیش‌نویس می‌سازد،
 * قواعد مالیات، استعلام قیمت (quote). قیمت‌ها ریالی‌اند.
 */
const P = '/pricing';
export type ListParams = { page?: number; page_size?: number; query?: string; [k: string]: string | number | boolean | undefined };
export type PriceRow = AdminSchemas['PriceRowOut'];
export type PriceDetail = AdminSchemas['PriceDetailOut'];
export type PriceList = AdminSchemas['PriceListOut'];
export type PriceListLine = AdminSchemas['PriceListLineOut'];
export type Contract = AdminSchemas['ContractOut'];
export type ContractDetail = AdminSchemas['ContractDetailOut'];
export type ContractPreview = AdminSchemas['ContractPreviewOut'];
export type TaxRule = AdminSchemas['TaxRuleOut'];
export type TaxRuleIn = AdminSchemas['TaxRuleIn'];
export type Quote = AdminSchemas['QuoteOut'];
export type Selection = { item_ids?: string[]; query?: string; brand_id?: string; category_id?: string; all?: boolean };

const K = {
  prices: ['pricing', 'prices'] as const, lists: ['pricing', 'price-lists'] as const, list: (id: string) => ['pricing', 'price-list', id] as const,
  contracts: ['pricing', 'contracts'] as const, contract: (id: string) => ['pricing', 'contract', id] as const, tax: ['pricing', 'tax-rules'] as const,
};
// ── قیمت کالاها ──
export const usePrices = (p: ListParams) =>
  useQuery({ queryKey: [...K.prices, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<PriceRow>>(`${P}/prices`, { query: p, signal }), placeholderData: keepPreviousData });
export function usePriceWrite() {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: ['pricing'] }); };
  return {
    bulk: useMutation({ mutationFn: (rows: { item_id: string; sale_price: string }[]) => adminApi<{ count: number }>(`${P}/prices/bulk`, { method: 'PUT', body: { rows } }), onSuccess: done }),
    one: useMutation({ mutationFn: ({ id, body }: { id: string; body: { sale_price?: string; adjustment_pct?: string } }) => adminApi<PriceDetail>(`${P}/prices/${id}`, { method: 'PUT', body }), onSuccess: done }),
  };
}
export const previewItemPrice = (id: string, adjustment_pct: string, signal?: AbortSignal) =>
  adminApi<AdminSchemas['PricePreviewOut']>(`${P}/prices/${id}/preview`, { query: { adjustment_pct }, signal });
// ── لیست‌های قیمت ──
export const usePriceLists = (p: ListParams) =>
  useQuery({ queryKey: [...K.lists, p], queryFn: ({ signal }) => adminApi<Paginated<PriceList>>(`${P}/price-lists`, { query: p, signal }), placeholderData: keepPreviousData });
export const usePriceList = (id: string | undefined) =>
  useQuery({ queryKey: K.list(id ?? ''), queryFn: ({ signal }) => adminApi<PriceList>(`${P}/price-lists/${id}`, { signal }), enabled: !!id });
export const usePriceListLines = (id: string | undefined, p: ListParams) =>
  useQuery({ queryKey: [...K.list(id ?? ''), 'lines', p], queryFn: ({ signal }) => adminApi<Paginated<PriceListLine>>(`${P}/price-lists/${id}/lines`, { query: p, signal }), enabled: !!id, placeholderData: keepPreviousData });
export const allPriceListLines = (id: string) => fetchAll<PriceListLine>(`${P}/price-lists/${id}/lines`);
export function usePriceListWrite() {
  const qc = useQueryClient();
  const done = (pl?: PriceList) => { qc.invalidateQueries({ queryKey: K.lists }); qc.invalidateQueries({ queryKey: K.prices }); if (pl) { qc.setQueryData(K.list(pl.id), pl); qc.invalidateQueries({ queryKey: [...K.list(pl.id), 'lines'] }); } qc.invalidateQueries({ queryKey: K.contracts }); };
  return {
    create: useMutation({ mutationFn: (body: { name: string; effective_from?: string | null; lines?: { item_id: string; new_price: string }[] }) => adminApi<PriceList>(`${P}/price-lists`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: { name?: string; effective_from?: string | null; lines?: { item_id: string; new_price: string }[] } }) => adminApi<PriceList>(`${P}/price-lists/${id}`, { method: 'PUT', body }), onSuccess: done }),
    import: useMutation({ mutationFn: ({ id, file }: { id: string; file: File }) => { const fd = new FormData(); fd.append('file', file); return adminApi<PriceList>(`${P}/price-lists/${id}/import`, { method: 'PUT', body: fd }); }, onSuccess: done }),
    publish: useMutation({ mutationFn: (id: string) => adminApi<PriceList>(`${P}/price-lists/${id}/publish`, { method: 'POST' }), onSuccess: done }),
    cancel: useMutation({ mutationFn: (id: string) => adminApi<PriceList>(`${P}/price-lists/${id}/cancel`, { method: 'PATCH' }), onSuccess: done }),
  };
}
// ── قراردادها ──
export const useContracts = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: [...K.contracts, p], queryFn: ({ signal }) => adminApi<Paginated<Contract>>(`${P}/contracts`, { query: p, signal }), placeholderData: keepPreviousData, enabled });
export const useContract = (id: string | undefined) =>
  useQuery({ queryKey: K.contract(id ?? ''), queryFn: ({ signal }) => adminApi<ContractDetail>(`${P}/contracts/${id}`, { signal }), enabled: !!id });
export type ContractIn = { name: string; adjustment_pct: string; rounding: string; valid_from: string; valid_to: string; description: string };
export function useContractWrite() {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: K.contracts }); qc.invalidateQueries({ queryKey: ['pricing', 'contract'] }); qc.invalidateQueries({ queryKey: K.lists }); };
  return {
    create: useMutation({ mutationFn: (body: ContractIn) => adminApi<ContractDetail>(`${P}/contracts`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<ContractIn> }) => adminApi<ContractDetail>(`${P}/contracts/${id}`, { method: 'PUT', body }), onSuccess: done }),
    cancel: useMutation({ mutationFn: (id: string) => adminApi<ContractDetail>(`${P}/contracts/${id}/cancel`, { method: 'PATCH' }), onSuccess: done }),
    apply: useMutation({ mutationFn: ({ id, sel }: { id: string; sel: Selection }) => adminApi<PriceList>(`${P}/contracts/${id}/apply`, { method: 'PUT', body: sel }), onSuccess: done }),
  };
}
export const previewContract = (id: string, sel: Selection) => adminApi<ContractPreview>(`${P}/contracts/${id}/preview`, { method: 'PUT', body: sel });
// ── مالیات و استعلام ──
export const useTaxRules = (p: ListParams) =>
  useQuery({ queryKey: [...K.tax, p], queryFn: ({ signal }) => adminApi<Paginated<TaxRule>>(`${P}/tax-rules`, { query: p, signal }), placeholderData: keepPreviousData });
export const useTaxRule = (id: string | undefined) =>
  useQuery({ queryKey: [...K.tax, 'one', id], queryFn: ({ signal }) => adminApi<TaxRule>(`${P}/tax-rules/${id}`, { signal }), enabled: !!id });
export function useTaxWrite() {
  const qc = useQueryClient(); const done = () => qc.invalidateQueries({ queryKey: K.tax });
  return {
    create: useMutation({ mutationFn: (body: TaxRuleIn) => adminApi<TaxRule>(`${P}/tax-rules`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<TaxRuleIn> }) => adminApi<TaxRule>(`${P}/tax-rules/${id}`, { method: 'PUT', body }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/tax-rules/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}
export const quote = (q: Record<string, string | number | boolean | string[] | undefined>, signal?: AbortSignal) => adminApi<Quote>(`${P}/quote`, { query: q as never, signal });
