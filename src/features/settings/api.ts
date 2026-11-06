import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';
import type { AdminSchemas, Paginated } from '@/shared/api/types';

/** دامنه‌ی settings (پیشوند /settings) + اطلاعات شرکت (organization). همه‌ی داده‌ها بی‌شعبه‌اند. */
export type Unit = AdminSchemas['UnitOut'];
export type Sequence = AdminSchemas['SequenceOut'];
export type CommercePolicy = AdminSchemas['CommercePolicyOut'];
export type CatalogDisplay = AdminSchemas['CatalogDisplayPolicyOut'];
export type CatalogConfig = AdminSchemas['CatalogConfigOut'];
export type ScoreFactor = AdminSchemas['ScoreFactorOut'];
export type NamingPart = AdminSchemas['NamingPartOut'];
export type GradePolicy = AdminSchemas['GradePricePolicyOut'];
export type BundlePolicy = AdminSchemas['BundlePolicyOut'];
export type Company = AdminSchemas['CompanyOut'];

/**
 * تنظیمات ایمیل — بک‌اند هنوز API ندارد (`docs/SETTINGS_BACKEND_GAPS.md`)؛ نام فیلدها = schema موجود EmailSettingOut
 * و مسیر پیشنهادی GET/PATCH /settings/email تا وقتی آمد بدون تغییر فرانت کار کند.
 */
export type EmailSetting = {
  smtp_host: string; smtp_port: number; smtp_username: string; use_tls: boolean; use_ssl: boolean;
  default_from_email: string; contact_recipient_email: string; timeout_seconds: number; is_active: boolean;
  has_password: boolean; updated_at?: string;
};

const KEY = ['settings'] as const;

/** فهرست‌های کوچک ثابت (فرمول امتیاز، نام‌گذاری، گریدها) پاکت صفحه‌بندی برمی‌گردانند؛ همه را یک‌جا بگیر. */
const all = <T,>(path: string) => async ({ signal }: { signal: AbortSignal }) =>
  (await adminApi<Paginated<T>>(path, { query: { page: 1, page_size: 100 }, signal })).results;

export const useSetting = <T,>(name: string, path: string, enabled = true) =>
  useQuery({ queryKey: [...KEY, name], queryFn: ({ signal }) => adminApi<T>(path, { signal }), enabled });

export const useCommercePolicy = (enabled = true) => useSetting<CommercePolicy>('commerce', '/settings/commerce-policy', enabled);
export const useCatalogDisplay = (enabled = true) => useSetting<CatalogDisplay>('display', '/settings/catalog-display', enabled);
export const useCatalogConfig = (enabled = true) => useSetting<CatalogConfig>('catalog-config', '/settings/catalog-config', enabled);
export const useScoreFactors = (enabled = true) => useQuery({ queryKey: [...KEY, 'score'], queryFn: all<ScoreFactor>('/settings/score-formula'), enabled });
export const useNamingRule = (enabled = true) => useQuery({ queryKey: [...KEY, 'naming'], queryFn: all<NamingPart>('/settings/naming-rules/ITEM'), enabled });
export const useGradePolicies = (enabled = true) => useQuery({ queryKey: [...KEY, 'grades'], queryFn: all<GradePolicy>('/settings/grade-policies'), enabled });
export const useSequences = (enabled = true) => useQuery({ queryKey: [...KEY, 'sequences'], queryFn: all<Sequence>('/settings/sequences'), enabled });

/** اطلاعات شرکت: پیش از ثبت اولیه ⇐ 404 ⇐ null */
export const useCompany = (enabled = true) => useQuery({
  queryKey: ['organization', 'company'], enabled, retry: false,
  queryFn: async ({ signal }) => {
    try { return await adminApi<Company>('/organization/company', { signal }); } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
  },
});

/** تنظیمات ایمیل: تا وقتی بک‌اند endpoint ندارد ⇐ 404 ⇐ { missing: true } (صفحه «به‌زودی» و فقط‌نمایش) */
export const useEmailSetting = () => useQuery({
  queryKey: [...KEY, 'email'], retry: false,
  queryFn: async ({ signal }): Promise<{ missing: boolean; data: EmailSetting | null }> => {
    try { return { missing: false, data: await adminApi<EmailSetting>('/settings/email', { signal }) }; } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return { missing: true, data: null };
      throw e;
    }
  },
});

/** ذخیره‌ی جزئی (PATCH) یک تنظیم تک‌ردیفی؛ بعد از ذخیره کش همان تنظیم با پاسخ بک‌اند به‌روز می‌شود. */
export function useSaveSetting<T>(name: string, path: string, method: 'PATCH' | 'PUT' = 'PATCH') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => adminApi<T>(path, { method, body }),
    onSuccess: (data) => qc.setQueryData([...KEY, name], data),
  });
}

export const invalidateSettings = (qc: ReturnType<typeof useQueryClient>, name: string) => qc.invalidateQueries({ queryKey: [...KEY, name] });

/* ───── واحدها ───── */
export type UnitParams = { kind: 'MAIN' | 'SUB'; page: number; page_size: number; query?: string; is_active?: boolean; base_unit_id?: string; factor?: number };
export const useUnits = (p: UnitParams) => useQuery({
  queryKey: [...KEY, 'units', p], placeholderData: keepPreviousData,
  queryFn: ({ signal }) => adminApi<Paginated<Unit>>('/settings/units', { query: p, signal }),
});
/** همه‌ی واحدهای یک نوع (شمارنده‌ی تب، فهرست واحد اصلی فرم واحد فرعی، گزینه‌های فیلتر ضریب) */
export const useAllUnits = (kind: 'MAIN' | 'SUB') => useQuery({
  queryKey: [...KEY, 'units', 'all', kind],
  queryFn: async ({ signal }) => {
    const out: Unit[] = [];
    for (let page = 1; page < 50; page++) {
      const r = await adminApi<Paginated<Unit>>('/settings/units', { query: { kind, page, page_size: 100 }, signal });
      out.push(...r.results);
      if (out.length >= r.total || r.results.length === 0) break;
    }
    return out;
  },
});
export const invalidateUnits = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: [...KEY, 'units'] });

/* ───── سیاست‌های باندل ───── */
export type BundlePolicyParams = { page: number; page_size: number; query?: string; is_active?: boolean };
export const useBundlePolicies = (p: BundlePolicyParams) => useQuery({
  queryKey: [...KEY, 'bundle-policies', p], placeholderData: keepPreviousData,
  queryFn: ({ signal }) => adminApi<Paginated<BundlePolicy>>('/settings/bundle-policies', { query: p, signal }),
});
export const invalidateBundlePolicies = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([qc.invalidateQueries({ queryKey: [...KEY, 'bundle-policies'] }), qc.invalidateQueries({ queryKey: ['catalog', 'bundle-policies'] })]);
