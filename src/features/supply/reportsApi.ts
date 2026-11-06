import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import type { ListParams } from './api';
import { saveBlob } from '@/shared/lib/download';

/**
 * مرور خرید (supply.reports) — /api/v1/admin/supply/reports. خلاصه‌ی کارت‌ها و چهار تفکیک صفحه‌بندی‌شده (S-05 ✅)، خروجی اکسل هر تفکیک با `kind`.
 * فیلترهای مشترک: query، date_from، date_to، supplier_id، warehouse_id، category_id، brand_id، branch_id.
 */
const P = '/supply/reports';
const RK = ['supply', 'reports'] as const;

export type ReportSummary = AdminSchemas['ReportSummaryOut'];
export type ReportItemRow = AdminSchemas['ReportItemRowOut'];
export type ReportSupplierRow = AdminSchemas['ReportSupplierRowOut'];
export type ReportWarehouseRow = AdminSchemas['ReportWarehouseRowOut'];
export type ReportVoidedRow = AdminSchemas['ReportVoidedRowOut'];
export type ReportKind = 'ITEM' | 'SUPPLIER' | 'WAREHOUSE' | 'VOIDED';

/** مسیر هر تفکیک */
export const REPORT_PATH: Record<ReportKind, string> = { ITEM: 'by-item', SUPPLIER: 'by-supplier', WAREHOUSE: 'by-warehouse', VOIDED: 'voided-invoices' };

export const useReportSummary = (p: ListParams) =>
  useQuery({ queryKey: [...RK, 'summary', p], queryFn: ({ signal }) => adminApi<ReportSummary>(`${P}/summary`, { query: p, signal }), placeholderData: keepPreviousData });

export const useReport = <T,>(kind: ReportKind, p: ListParams) =>
  useQuery({ queryKey: [...RK, kind, p], queryFn: ({ signal }) => adminApi<Paginated<T>>(`${P}/${REPORT_PATH[kind]}`, { query: p, signal }), placeholderData: keepPreviousData });

/** خروجی اکسل تفکیک فعلی با همان فیلترها */
export async function exportReport(kind: ReportKind, p: ListParams) {
  const { page: _p, page_size: _s, ...q } = p;
  const blob = await adminApi<Blob>(`${P}/export`, { query: { ...q, kind }, raw: true });
  saveBlob(blob, `purchase-review-${kind.toLowerCase()}.xlsx`);
}
