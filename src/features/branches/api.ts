import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { fetchAll } from '@/features/users/api';

/**
 * API ادمین «مدیریت شعب» — پیشوند /api/v1/admin/organization
 * مرجع: domains/organization/api/admin.py (کد بک‌اند مرجع است). دسترسی شعبه‌ای (ADR 0009) در بک‌اند اعمال می‌شود:
 * کاربر بدون «دیدن داده‌ی همه‌ی شعب» فقط شعبه‌ی محل کار خودش را می‌بیند.
 */
const P = '/organization';

export type Branch = AdminSchemas['BranchListOut'];
export type BranchStatus = AdminSchemas['BranchStatus'];

export type BranchListParams = { page?: number; page_size?: number; query?: string; status?: string; province?: string };

const K = { branches: ['organization', 'branches'] as const };

/** GET /branches — جست‌وجو (`query`: نام، کد، تلفن، آدرس) و فیلتر وضعیت/استان در سرور. */
export const useBranches = (p: BranchListParams) =>
  useQuery({
    queryKey: [...K.branches, 'list', p],
    queryFn: ({ signal }) => adminApi<Paginated<Branch>>(`${P}/branches`, { query: p, signal }),
    placeholderData: keepPreviousData,
  });

/**
 * گزینه‌های فیلتر «استان»: بک‌اند فهرست استان ندارد (B-03) ⇐ استان‌های شعبه‌های موجود (فهرست شعب کوچک است؛ یک درخواست ۱۰۰تایی).
 * فقط استان‌هایی که کاربر شعبه‌ای در آن‌ها می‌بیند.
 */
export const useBranchProvinces = () =>
  useQuery({
    queryKey: [...K.branches, 'provinces'],
    queryFn: async ({ signal }) => {
      const r = await adminApi<Paginated<Branch>>(`${P}/branches`, { query: { page: 1, page_size: 100 }, signal });
      return [...new Set(r.results.map((b) => b.province.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa'));
    },
    staleTime: 60_000,
  });

// ── نمای شعبه (GET /branches/{id}) و منابع آن ──────────────────────────────────────
export type BranchDetail = AdminSchemas['BranchDetailOut'];
export type BranchEmployee = AdminSchemas['BranchEmployeeOut'];
export type BranchWarehouse = AdminSchemas['BranchWarehouseOut'];
export type AllowedItem = AdminSchemas['BranchAllowedItemOut'];
export type AllowedItemIn = AdminSchemas['BranchAllowedItemIn'];
export type BranchCashBox = AdminSchemas['BranchCashBoxOut'];
export type BranchPos = AdminSchemas['BranchPosDeviceOut'];
export type BranchPermits = AdminSchemas['BranchPermitSchema'];
export type Candidate = AdminSchemas['EmployeeCandidateOut'];
export type WarehouseRow = AdminSchemas['WarehouseListOut'];
export type CashBoxRow = AdminSchemas['CashBoxListOut'];
export type PosRow = AdminSchemas['PosDeviceListOut'];
export type Shift = AdminSchemas['BranchEmployeeShift'];
export type StaffUser = AdminSchemas['StaffUserOut'];
export type StockRow = AdminSchemas['StockOut'];
export type StockKpi = AdminSchemas['KpiOut'];
export type Zone = AdminSchemas['ZoneOut'];
export type Bin = AdminSchemas['BinOut'];

export type Q = Record<string, string | number | boolean | string[] | undefined>;
const bk = (id: string) => [...K.branches, 'detail', id] as const;

export const useBranch = (id: string | undefined) =>
  useQuery({ queryKey: bk(id ?? ''), queryFn: ({ signal }) => adminApi<BranchDetail>(`${P}/branches/${id}`, { signal }), enabled: !!id });

const sub = <T,>(id: string, path: string, q: Q, enabled = true) =>
  ({ queryKey: [...bk(id), path, q], queryFn: ({ signal }: { signal: AbortSignal }) => adminApi<Paginated<T>>(`${P}/branches/${id}/${path}`, { query: q, signal }), enabled: !!id && enabled, placeholderData: keepPreviousData });

export const useBranchEmployees = (id: string, q: Q, enabled = true) => useQuery(sub<BranchEmployee>(id, 'employees', q, enabled));
export const useBranchWarehouses = (id: string, enabled = true) => useQuery(sub<BranchWarehouse>(id, 'warehouses', { page_size: 100 }, enabled));
export const useAssortment = (id: string, enabled = true) => useQuery(sub<AllowedItem>(id, 'assortment', { page_size: 100 }, enabled));
/** همه‌ی ردیف‌های «محصولات مجاز» (بیش از ۱۰۰ ردیف هم) — برای انتخاب‌گر و کارت «لیست محصولات» */
export const useAssortmentAll = (id: string, enabled = true) =>
  useQuery({ queryKey: [...bk(id), 'assortment', 'all'], queryFn: () => fetchAll<AllowedItem>(`${P}/branches/${id}/assortment`), enabled: !!id && enabled });
/** همه‌ی ردیف‌های موجودی انبارهای شعبه (شامل صفر) — ستون و فیلتر «انبار» در «لیست محصولات» */
export const useBranchStockAll = (branchId: string, enabled = true) =>
  useQuery({ queryKey: ['wms', 'stock', 'branch-all', branchId], queryFn: () => fetchAll<StockRow>('/wms/stock', { branch_id: branchId, in_stock_only: false }), enabled: !!branchId && enabled });
export const useBranchCashBoxes = (id: string, enabled = true) => useQuery(sub<BranchCashBox>(id, 'cash-boxes', { page_size: 100 }, enabled));
export const useBranchPos = (id: string, enabled = true) => useQuery(sub<BranchPos>(id, 'pos-devices', { page_size: 100 }, enabled));
/** کاندیدای کارمند: کارکنانی که شعبه‌ی محل کارشان همین شعبه است، بدون مسئول و کارمندان فعلی (ADR 0009) */
export const useEmployeeCandidates = (id: string, q: Q, enabled = true) => useQuery(sub<Candidate>(id, 'employee-candidates', q, enabled));
/** کاندیدای مسئول: کارکنان همین شعبه‌ی محل کار، بدون مسئول فعلی و کارمندان فعال (ADR 0009) */
export const useManagerCandidates = (id: string, q: Q, enabled = true) => useQuery(sub<Candidate>(id, 'manager-candidates', q, enabled));

// استخرها (منابع بدون شعبه)
export const useWarehousePool = (q: Q, enabled = true) =>
  useQuery({ queryKey: ['organization', 'warehouses', q], queryFn: ({ signal }) => adminApi<Paginated<WarehouseRow>>(`${P}/warehouses`, { query: q, signal }), enabled, placeholderData: keepPreviousData });
export const useCashBoxPool = (q: Q, enabled = true) =>
  useQuery({ queryKey: ['organization', 'cash-boxes', q], queryFn: ({ signal }) => adminApi<Paginated<CashBoxRow>>(`${P}/cash-boxes`, { query: { unassigned: true, is_active: true, ...q }, signal }), enabled, placeholderData: keepPreviousData });
export const usePosPool = (q: Q, enabled = true) =>
  useQuery({ queryKey: ['organization', 'pos-devices', q], queryFn: ({ signal }) => adminApi<Paginated<PosRow>>(`${P}/pos-devices`, { query: { unassigned: true, is_active: true, ...q }, signal }), enabled, placeholderData: keepPreviousData });
/** کارکنانی که شعبه‌ی محل کارشان این شعبه است (برای صندوق‌دار) — GET /auth/staff?branch_id */
export const useBranchStaff = (branchId: string, q: Q, enabled = true) =>
  useQuery({ queryKey: ['identity', 'staff', 'branch', branchId, q], queryFn: ({ signal }) => adminApi<Paginated<StaffUser>>('/auth/staff', { query: { branch_id: branchId, ...q }, signal }), enabled: !!branchId && enabled, placeholderData: keepPreviousData });

export function useBranchWrite(id: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: K.branches });
  const m = <B,>(method: 'PUT' | 'PATCH', path: (b: B) => string, body?: (b: B) => unknown) =>
    useMutation({ mutationFn: (b: B) => adminApi<unknown>(`${P}/branches/${id}${path(b)}`, { method, body: body ? body(b) : undefined }), onSuccess: done });
  return {
    update: m<AdminSchemas['BranchUpdateIn']>('PATCH', () => '', (b) => b),
    permits: m<BranchPermits>('PUT', () => '/permits', (b) => b),
    linkWarehouse: m<AdminSchemas['BranchWarehouseLinkIn']>('PUT', () => '/warehouses/link', (b) => b),
    unlinkWarehouse: m<string>('PUT', (linkId) => `/warehouses/${linkId}/unlink`),
    assortment: m<AllowedItemIn[]>('PUT', () => '/assortment', (items) => ({ items })),
    assignCash: m<AdminSchemas['BranchCashBoxAssignIn']>('PUT', () => '/cash-boxes/assign', (b) => b),
    patchCash: m<{ cid: string; body: AdminSchemas['BranchCashBoxUpdateIn'] }>('PATCH', (b) => `/cash-boxes/${b.cid}`, (b) => b.body),
    unassignCash: m<string>('PUT', (cid) => `/cash-boxes/${cid}/unassign`),
    assignPos: m<AdminSchemas['BranchPosDeviceAssignIn']>('PUT', () => '/pos-devices/assign', (b) => b),
    patchPos: m<{ pid: string; body: AdminSchemas['BranchPosDeviceUpdateIn'] }>('PATCH', (b) => `/pos-devices/${b.pid}`, (b) => b.body),
    unassignPos: m<string>('PUT', (pid) => `/pos-devices/${pid}/unassign`),
    assignEmployee: m<AdminSchemas['BranchEmployeeAssignIn']>('PUT', () => '/employees', (b) => b),
    patchEmployee: m<{ eid: string; body: AdminSchemas['BranchEmployeeUpdateIn'] }>('PATCH', (b) => `/employees/${b.eid}`, (b) => b.body),
    unassignEmployee: m<string>('PUT', (eid) => `/employees/${eid}/unassign`),
  };
}

// ── موجودی شعبه از wms (انبارهای وصل به شعبه) ──
export const useStock = (q: Q, enabled = true) =>
  useQuery({ queryKey: ['wms', 'stock', q], queryFn: ({ signal }) => adminApi<Paginated<StockRow>>('/wms/stock', { query: q, signal }), enabled, placeholderData: keepPreviousData });
export type StockCounts = AdminSchemas['StockCountsOut'];
/** تعداد قلم کالا و جمع موجودی برای چند شعبه/انبار در یک درخواست (B-02/B-07) */
export const useStockCounts = (q: { branch_ids?: string[]; warehouse_ids?: string[] }, enabled = true) =>
  useQuery({ queryKey: ['wms', 'stock', 'counts', q], queryFn: ({ signal }) => adminApi<StockCounts>('/wms/stock/counts', { query: q, signal }), enabled: enabled && !!((q.branch_ids?.length ?? 0) + (q.warehouse_ids?.length ?? 0)), staleTime: 30_000 });
/** شاخص‌های موجودی یک دامنه (`branch_id`|`warehouse_id`، برند، دسته) در یک درخواست (B-10) */
export const useStockDashboard = (q: Q, enabled = true) =>
  useQuery({ queryKey: ['wms', 'kpi', 'scope', q], queryFn: ({ signal }) => adminApi<StockKpi>('/wms/stock/dashboard', { query: q, signal }), enabled, placeholderData: keepPreviousData });
export const useZones = (warehouseId: string, enabled = true) =>
  useQuery({ queryKey: ['wms', 'zones', warehouseId], queryFn: ({ signal }) => adminApi<Paginated<Zone>>('/wms/zones', { query: { warehouse_id: warehouseId, page_size: 100 }, signal }), enabled: !!warehouseId && enabled });
export const useBins = (warehouseId: string, zoneId: string, enabled = true) =>
  useQuery({ queryKey: ['wms', 'bins', warehouseId, zoneId], queryFn: ({ signal }) => adminApi<Paginated<Bin>>('/wms/bins', { query: { warehouse_id: warehouseId, zone_id: zoneId, page_size: 100 }, signal }), enabled: !!warehouseId && !!zoneId && enabled });
