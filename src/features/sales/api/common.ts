import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { saveBlob } from '@/shared/lib/download';
import { groupMoney } from '@/shared/lib/money';

/**
 * پایه‌ی API ماژول «فروش» — همه زیر /api/v1/admin/sales (بک‌اند domains/sales، فاز یک).
 * نوع‌ها فقط از OpenAPI (پیشوند Sales)؛ متدها از OpenAPI خوانده شده‌اند، نه از یادداشت.
 * انتخاب‌گرها (مشتری، کالا، انبار، فروشنده، بانک) از ماژول‌های دیگر خوانده می‌شوند؛ این دامنه انتخاب‌گر جدا ندارد.
 */
export const SP = '/sales';
/** همه‌ی کلیدهای React Query این ماژول با این پیشوند شروع می‌شوند؛ هر نوشتن کل آن را تازه می‌کند (اثرهای زنجیره‌ای) */
export const SK = ['sales'] as const;

/** پارامترهای فهرست؛ آرایه ⇐ پارامتر تکراری (`status=DRAFT&status=ISSUED`) */
export type SalesListParams = { page?: number; page_size?: number; query?: string; [k: string]: string | string[] | number | boolean | undefined };

export type SalesCustomer = AdminSchemas['SalesCustomerOut'];
export type SalesItem = AdminSchemas['SalesItemOut'];
export type SalesPerson = AdminSchemas['SalesPersonOut'];
export type SalesWarehouse = AdminSchemas['SalesWarehouseOut'];
export type SalesBranch = AdminSchemas['SalesBranchOut'];
export type SalesCompany = AdminSchemas['SalesCompanyOut'];
export type Bank = AdminSchemas['BankOut'];
export type StaffUser = AdminSchemas['StaffUserOut'];
export type StockRow = AdminSchemas['StockOut'];

/** تازگی فهرست‌های انتخاب‌گر (ms) */
const PICKER_STALE_MS = 60_000;
/** تازگی فهرست بانک‌ها (ms) — تقریباً ثابت است */
const BANKS_STALE_MS = 600_000;
/** تازگی موجودی انبار در انتخاب‌گر (ms) */
const STOCK_STALE_MS = 30_000;
/** بیشینه‌ی page_size بک‌اند (R-API-01) */
const MAX_PAGE_SIZE = 100;

// ── عدد و مبلغ ──
/** تعداد بک‌اند «3.000» است ⇐ عدد صحیح (هیچ مقداری اعشار ندارد) */
export const qty = (v: string | number | null | undefined): number => Math.trunc(Number(v ?? 0)) || 0;
/** نمایش مبلغ ریالی با جداکننده‌ی «٬» و ارقام فارسی، روی رشته (بدون Number تا مبلغ بزرگ دقت از دست ندهد) */
export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const raw = String(v).trim();
  const neg = raw.startsWith('-');
  const g = groupMoney(neg ? raw.slice(1) : raw) || '۰';
  return neg && g !== '۰' ? `${g}−` : g;
}
/** مبلغ صفر است؟ (رشته‌ی «0» یا «0.00») */
export const isZero = (v: string | null | undefined) => !v || Number(v) === 0;

// ── اشخاص ──
export const personName = (p?: SalesPerson | null) => p?.full_name || '—';
export const personRoles = (p?: SalesPerson | null) => (p?.role_names ?? []).join('، ');
export const staffName = (u: Pick<StaffUser, 'first_name' | 'last_name' | 'username'>) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '—';

// ── فایل ──
/** خروجی اکسل با همان فیلترهای فهرست، بدون صفحه‌بندی (نام فایل با مهر زمان در saveBlob) */
export async function exportXlsx(path: string, p: SalesListParams, name: string) {
  const { page: _p, page_size: _s, ...q } = p;
  const blob = await adminApi<Blob>(path, { query: q, raw: true });
  saveBlob(blob, name);
}
const BLOB_TTL_MS = 60_000;
/** فایل خصوصی (مثل تصویر چک امضاشده) با توکن ⇐ پنجره‌ی تازه */
export async function openPrivateFile(path: string) {
  const blob = await adminApi<Blob>(path, { raw: true });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), BLOB_TTL_MS);
}

// ── انتخاب‌گرها از ماژول‌های دیگر ──
/** کارکنان (فروشنده)؛ مجوز فهرست کاربران لازم است */
export const useStaffOptions = (query: string, enabled = true) =>
  useQuery({
    queryKey: ['identity', 'staff', 'sales-picker', query], enabled, staleTime: PICKER_STALE_MS, placeholderData: keepPreviousData,
    queryFn: ({ signal }) => adminApi<Paginated<StaffUser>>('/auth/staff', { query: { page_size: MAX_PAGE_SIZE, query: query || undefined }, signal }),
  });

/** بانک‌های فعال برای ردیف چکی تسویه (GET /customers/banks) */
export const useBanks = (enabled = true) =>
  useQuery({ queryKey: ['customers', 'banks'], queryFn: ({ signal }) => adminApi<Bank[]>('/customers/banks', { signal }), enabled, staleTime: BANKS_STALE_MS });

export type StockLookup = AdminSchemas['LookupOut'];
/** موجودی یک کالا: قابل استفاده‌ی کل انبارهای در دسترس + هر انبار */
export type ItemStock = { total: number; byWarehouse: Map<string, number> };

/**
 * موجودی کالاها از «استعلام موجودی» انبار (GET /wms/stock-lookup/{item_id}؛ مخصوص فروش و صندوق، مجوز wms.stock_lookup.read):
 * برای هر کالا یک پاسخ با موجودی قابل استفاده‌ی هر انبار در دسترس و جمع آن (`total_available` از بک‌اند).
 * ستون‌های «موجودی انبار» و «موجودی کل» انتخاب کالا و برچسب «موجودی» زیر تعداد ردیف فاکتور (html) از همین می‌آیند.
 * بک‌اند استعلام چندکالایی ندارد ⇐ یک درخواست کوچک برای هر کالای صفحه (کمبود SL-05).
 */
export function useStockLookup(itemIds: string[], enabled: boolean) {
  const qs = useQueries({
    queries: itemIds.map((id) => ({
      queryKey: ['wms', 'stock-lookup', id],
      enabled,
      staleTime: STOCK_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) => adminApi<StockLookup>(`/wms/stock-lookup/${id}`, { signal }),
    })),
  });
  const map = new Map<string, ItemStock | null>();
  itemIds.forEach((id, i) => {
    const d = qs[i]?.data;
    map.set(id, d ? { total: qty(d.total_available), byWarehouse: new Map(d.warehouses.map((w) => [w.warehouse?.id ?? '', qty(w.available)])) } : null);
  });
  return map;
}

/** ویژگی‌های نمایشی کالا زیر نامش: برند، رنگ‌ها و سایزها (نام، نه کد) */
export type ItemTraits = { brand: string; sizes: string[]; colors: string[] };
const TRAITS_STALE_MS = 60_000;
type CatalogItemTraits = Pick<AdminSchemas['ItemDetailOut'], 'brand_name' | 'sizes' | 'colors'>;
/**
 * رنگ‌ها و سایزهای کامل هر کالا از کاتالوگ (GET /catalog/items/{id}، مجوز خواندن آیتم). بک‌اند فروش برای آیتم چندکالایی
 * فقط یک رنگ و یک سایز (یا هیچ) در ردیف سند می‌دهد؛ این استعلام همه‌ی رنگ‌ها و سایزهای اجزا را می‌آورد. بدون مجوز ⇐ نقشه‌ی خالی.
 */
export function useItemTraits(itemIds: string[], enabled: boolean): Map<string, ItemTraits> {
  const qs = useQueries({
    queries: itemIds.map((id) => ({
      queryKey: ['catalog', 'item', id], enabled: enabled && !!id, staleTime: TRAITS_STALE_MS, retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => adminApi<CatalogItemTraits>(`/catalog/items/${id}`, { signal }),
    })),
  });
  const out = new Map<string, ItemTraits>();
  qs.forEach((q, i) => {
    const id = itemIds[i];
    if (!q.data || !id) return;
    out.set(id, { brand: q.data.brand_name ?? '', sizes: q.data.sizes.map((x) => x.name), colors: q.data.colors.map((x) => x.name) });
  });
  return out;
}
