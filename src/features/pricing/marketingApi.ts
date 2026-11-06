import { gregorianToJalaliText } from '@/shared/lib/format';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import type { ListParams } from './api';

/**
 * API ادمین «بازاریابی» (تخفیف‌ساز، کدهای تخفیف، کمپین‌ها) — پیشوند /api/v1/admin/pricing
 * مرجع: domains/pricing/api/admin_discounts.py و admin_campaigns.py، قواعد نوع تخفیف: services/discount.py (_normalize_by_kind، _replace_children).
 * هر تخفیف/کمپین با وضعیت پیش‌نویس ساخته می‌شود؛ فعال شدن = approve (تخفیف) یا publish (کمپین). مبلغ‌ها ریالی‌اند.
 */
const P = '/pricing';
export type Discount = AdminSchemas['DiscountOut'];
export type DiscountDetail = AdminSchemas['DiscountDetailOut'];
export type DiscountIn = AdminSchemas['DiscountCreateIn'];
export type Coupon = AdminSchemas['CouponOut'];
export type CouponIssueIn = AdminSchemas['CouponIssueIn'];
export type Campaign = AdminSchemas['CampaignOut'];
export type CampaignDetail = AdminSchemas['CampaignDetailOut'];
export type CampaignIn = AdminSchemas['CampaignCreateIn'];
export type TargetIn = AdminSchemas['TargetIn'];
export type AudienceIn = AdminSchemas['AudienceIn'];

const K = { d: ['pricing', 'discounts'] as const, c: ['pricing', 'coupons'] as const, cp: ['pricing', 'campaigns'] as const };

// ── تخفیف‌ها ──
export const useDiscounts = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: [...K.d, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<Discount>>(`${P}/discounts`, { query: p, signal }), placeholderData: keepPreviousData, enabled });
export const useDiscount = (id: string | undefined) =>
  useQuery({ queryKey: [...K.d, 'one', id], queryFn: ({ signal }) => adminApi<DiscountDetail>(`${P}/discounts/${id}`, { signal }), enabled: !!id });
/** جزئیات چند تخفیف (برای ستون‌های مشتری/محصول جدول؛ DiscountOut این‌ها را ندارد — P-07) */
export const useDiscountDetails = (ids: string[], enabled: boolean) =>
  useQueries({ queries: ids.map((id) => ({ queryKey: [...K.d, 'one', id], queryFn: ({ signal }: { signal: AbortSignal }) => adminApi<DiscountDetail>(`${P}/discounts/${id}`, { signal }), enabled, staleTime: 30_000 })) });
export function useDiscountWrite() {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: K.d }); qc.invalidateQueries({ queryKey: K.c }); };
  return {
    create: useMutation({ mutationFn: (body: DiscountIn) => adminApi<DiscountDetail>(`${P}/discounts`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<DiscountIn> }) => adminApi<DiscountDetail>(`${P}/discounts/${id}`, { method: 'PUT', body }), onSuccess: done }),
    approve: useMutation({ mutationFn: (id: string) => adminApi<DiscountDetail>(`${P}/discounts/${id}/approve`, { method: 'POST' }), onSuccess: done }),
    deactivate: useMutation({ mutationFn: (id: string) => adminApi<DiscountDetail>(`${P}/discounts/${id}/deactivate`, { method: 'PATCH' }), onSuccess: done }),
    archive: useMutation({ mutationFn: (id: string) => adminApi<DiscountDetail>(`${P}/discounts/${id}/archive`, { method: 'DELETE' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/discounts/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}

// ── کدهای تخفیف ──
export const useCoupons = (p: ListParams) =>
  useQuery({ queryKey: [...K.c, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<Coupon>>(`${P}/coupons`, { query: p, signal }), placeholderData: keepPreviousData });
export const useCoupon = (id: string | undefined) =>
  useQuery({ queryKey: [...K.c, 'one', id], queryFn: ({ signal }) => adminApi<Coupon>(`${P}/coupons/${id}`, { signal }), enabled: !!id });
export function useCouponWrite() {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: K.c }); qc.invalidateQueries({ queryKey: K.d }); };
  return {
    create: useMutation({ mutationFn: (body: { discount: DiscountIn; coupon: CouponIssueIn }) => adminApi<Coupon>(`${P}/coupons`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: { usage_limit?: number | null; per_customer_limit?: number | null; customer_id?: string | null; expires_at?: string | null } }) => adminApi<Coupon>(`${P}/coupons/${id}`, { method: 'PUT', body }), onSuccess: done }),
    enable: useMutation({ mutationFn: (id: string) => adminApi<Coupon>(`${P}/coupons/${id}/enable`, { method: 'PATCH' }), onSuccess: done }),
    disable: useMutation({ mutationFn: (id: string) => adminApi<Coupon>(`${P}/coupons/${id}/disable`, { method: 'PATCH' }), onSuccess: done }),
    /** ابطال دائمی و برگشت‌ناپذیر (P-11 ✅): PATCH /coupons/{id}/archive با دلیل اختیاری */
    archive: useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => adminApi<Coupon>(`${P}/coupons/${id}/archive`, { method: 'PATCH', body: { reason: reason || null } }), onSuccess: done }),
    /** صدور کد بیشتر برای همان تخفیف کددار: POST /discounts/{id}/coupons (count ۱ تا ۵۰۰، کد خالی ⇐ تولید خودکار) */
    issue: useMutation({ mutationFn: ({ discountId, body }: { discountId: string; body: CouponIssueIn }) => adminApi<{ count: number; results: Coupon[] }>(`${P}/discounts/${discountId}/coupons`, { method: 'POST', body }), onSuccess: done }),
  };
}

// ── کمپین‌ها ──
export const useCampaigns = (p: ListParams) =>
  useQuery({ queryKey: [...K.cp, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<Campaign>>(`${P}/campaigns`, { query: p, signal }), placeholderData: keepPreviousData });
export const useCampaign = (id: string | undefined) =>
  useQuery({ queryKey: [...K.cp, 'one', id], queryFn: ({ signal }) => adminApi<CampaignDetail>(`${P}/campaigns/${id}`, { signal }), enabled: !!id });
/** ماهیت‌های کمپین (تعریف در تنظیمات ⇐ ماهیت‌های کمپین، 2026-10-24): فقط آرشیونشده‌ها، به ترتیب نمایش؛ مجوز pricing.campaigns.list */
export type CampaignNatureOption = AdminSchemas['CampaignNatureOptionOut'];
export const useCampaignNatures = () =>
  useQuery({ queryKey: ['pricing', 'campaign-natures'], staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => (await adminApi<Paginated<CampaignNatureOption>>(`${P}/campaign-natures`, { query: { page: 1, page_size: 100 }, signal })).results });
export function useCampaignWrite() {
  const qc = useQueryClient();
  const done = (c?: CampaignDetail) => { qc.invalidateQueries({ queryKey: [...K.cp, 'list'] }); if (c) qc.setQueryData([...K.cp, 'one', c.id], c); };
  return {
    create: useMutation({ mutationFn: (body: CampaignIn) => adminApi<CampaignDetail>(`${P}/campaigns`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<CampaignIn> }) => adminApi<CampaignDetail>(`${P}/campaigns/${id}`, { method: 'PUT', body }), onSuccess: done }),
    banner: useMutation({ mutationFn: ({ id, file }: { id: string; file: File }) => { const fd = new FormData(); fd.append('banner', file); return adminApi<CampaignDetail>(`${P}/campaigns/${id}/banner`, { method: 'PUT', body: fd }); }, onSuccess: done }),
    publish: useMutation({ mutationFn: (id: string) => adminApi<CampaignDetail>(`${P}/campaigns/${id}/publish`, { method: 'POST' }), onSuccess: done }),
    disable: useMutation({ mutationFn: (id: string) => adminApi<CampaignDetail>(`${P}/campaigns/${id}/disable`, { method: 'PATCH' }), onSuccess: done }),
    archive: useMutation({ mutationFn: (id: string) => adminApi<CampaignDetail>(`${P}/campaigns/${id}/archive`, { method: 'PATCH' }), onSuccess: done }),
  };
}

/** تاریخ فرم (YYYY-MM-DD میلادی) ⇐ datetime به وقت تهران؛ پایان = آخر همان روز */
export const dayStart = (g: string) => `${g}T00:00:00+03:30`;
export const dayEnd = (g: string) => `${g}T23:59:59+03:30`;
/** ISO ⇐ YYYY-MM-DD تقویم تهران (برای پر کردن فرم ویرایش) */
export const isoToTehranYmd = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

/** مقدار ورودی تاریخ شمسی از ISO (خالی ⇐ ''؛ نه «—» که ورودی را نامعتبر می‌کرد) */
export const isoToJalaliInput = (iso?: string | null): string => { const y = isoToTehranYmd(iso); return y ? gregorianToJalaliText(y) : ''; };
