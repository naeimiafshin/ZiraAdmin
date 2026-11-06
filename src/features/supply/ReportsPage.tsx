import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconArrowBackUp, IconBan, IconBuildingStore, IconDownload, IconFileInvoice, IconReceipt } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Card, Empty, PageHead, Pagination, Rial, UnderlineTabs, UnitHead } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useAllBrands, useCategoryTree } from '@/features/catalog/api';
import { useSupplierOptions, type ListParams } from './api';
import {
  exportReport, useReport, useReportSummary, type ReportItemRow, type ReportKind, type ReportSupplierRow, type ReportVoidedRow, type ReportWarehouseRow,
} from './reportsApi';
import { int, personName } from './requestsApi';
import { SaleUnits } from './SaleUnits';
import s from './supply.module.css';

/**
 * مرور خرید — /supply/reports (html «مرور خرید»: «خرید به تفکیک کالا، تأمین‌کننده، عملیات انبار و فاکتورهای ابطالی»).
 * ستون‌ها و فیلترها: تأیید افشین 2026-10-31 (بخش «مرور خرید» SUPPLY_FRONT_PLAN).
 * - کارت‌های بالا (پیشنهاد تأییدشده، html ندارد): مبلغ خرید، تعداد فاکتور، تعداد تأمین‌کننده، برگشتی و ابطالی.
 * - چهار تب صفحه‌بندی‌شده در سرور (S-05 ✅)؛ خروجی اکسل همان تب با همان فیلترها.
 * - فیلترها: جست‌وجو، از تاریخ و تا تاریخ، تأمین‌کننده، دسته اصلی، انبار (html) + برند و شعبه.
 * - «واحد اصلی» و «واحد فروش» جدا می‌مانند (افشین 2026-10-31): خرید بر اساس «کالا» و فروش بر اساس «آیتم» (بسته‌ای از کالا) است؛ واحد اصلی =
 *   `unit_name` کالا، واحد فروش = آیتم‌های فعالی که کالا را دارند (`sale_units`؛ S-20 رفع شد ۱۴ آبان ۱۴۰۵) با نشان عدد و مودال `SaleUnits`.
 * - «فی متوسط برگشتی» = مبلغ برگشتی ÷ تعداد برگشتی و «خالص» = مبلغ خرید − مبلغ برگشتی (از داده‌ی خود بک‌اند).
 */
const PAGE_SIZE = 10;
const TABS = [
  { value: 'ITEM', label: 'کالا' },
  { value: 'SUPPLIER', label: 'تأمین‌کننده' },
  { value: 'WAREHOUSE', label: 'عملیات انبار' },
  { value: 'VOIDED', label: 'فاکتورهای ابطالی' },
] as const satisfies readonly { value: ReportKind; label: string }[];
const isKind = (v: string): v is ReportKind => TABS.some((t) => t.value === v);

type TabProps = { params: ListParams; page: number; pageSize: number; onPage: (p: number) => void; onPageSize: (n: number) => void; active: boolean };

export default function ReportsPage() {
  const can = usePerm();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);
  const kind: ReportKind = isKind(lp.tab) ? lp.tab : 'ITEM';
  const [supplierId, warehouseId, categoryId, brandId, branchId] = [lp.get('supplier'), lp.get('warehouse'), lp.get('category'), lp.get('brand'), lp.get('branch')];
  const [df, dt] = [lp.get('df'), lp.get('dt')];
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const tree = useCategoryTree(false);
  const brands = useAllBrands();
  const branches = useBranchOptions();
  const [exporting, setExporting] = useState(false);

  const params: ListParams = {
    query: dq || undefined, date_from: df || undefined, date_to: dt || undefined, supplier_id: supplierId || undefined, warehouse_id: warehouseId || undefined,
    category_id: categoryId || undefined, brand_id: brandId || undefined, branch_id: branchId || undefined,
  };
  const summary = useReportSummary(params);
  const sm = summary.data;
  const filters: FilterDef[] = [
    { key: 'supplier', label: 'تأمین‌کننده', value: supplierId, onChange: lp.setFilter('supplier'), options: (sups.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    { key: 'category', label: 'دسته اصلی', value: categoryId, onChange: lp.setFilter('category'), options: (tree.data ?? []).map((n) => ({ value: n.id, label: n.name })) },
    { key: 'warehouse', label: 'انبار', value: warehouseId, onChange: lp.setFilter('warehouse'), options: (whs.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    { key: 'brand', label: 'برند', value: brandId, onChange: lp.setFilter('brand'), options: (brands.data ?? []).map((b) => ({ value: b.id, label: b.name })) },
    ...((branches.data?.length ?? 0) > 1 ? [{ key: 'branch', label: 'شعبه', value: branchId, onChange: lp.setFilter('branch'), options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) }] : []),
  ];
  const extraActive = !!(df || dt);
  const active = !!dq || filters.some((f) => f.value) || extraActive;
  const doExport = async () => {
    setExporting(true);
    try { await exportReport(kind, params); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };
  const tab: TabProps = { params, page: lp.page, pageSize: lp.pageSize, onPage: lp.setPage, onPageSize: lp.setPageSize, active };
  const money = (v: string | undefined) => (v === undefined ? null : <>{faNum(int(v))} <Rial /></>);

  return (
    <>
      <PageHead actions={can('supply.reports.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} loading={exporting} onClick={doExport}>خروجی اکسل این تب</Button> : null} />
      <div className={s.kpis5}>
        <Kpi icon={<IconReceipt size={20} />} tone={s.tBlue} label="مبلغ خرید" value={money(sm?.purchase_amount)} />
        <Kpi icon={<IconFileInvoice size={20} />} tone={s.tGreen} label="تعداد فاکتور" value={sm ? faNum(sm.invoice_count) : null} />
        <Kpi icon={<IconBuildingStore size={20} />} tone={s.tAmber} label="تعداد تأمین‌کننده" value={sm ? faNum(sm.supplier_count) : null} />
        <Kpi icon={<IconArrowBackUp size={20} />} tone={s.tRose} label={`برگشتی${sm ? ` (${faNum(sm.return_count)} سند)` : ''}`} value={money(sm?.returned_amount)} />
        <Kpi icon={<IconBan size={20} />} tone={s.tRose} label={`ابطالی${sm ? ` (${faNum(sm.voided_count)} فاکتور)` : ''}`} value={money(sm?.voided_amount)} />
      </div>
      <Card>
        <div className={s.listHead}>
          <UnderlineTabs value={kind} onChange={(t) => lp.set({ tab: t === 'ITEM' ? null : t })} options={TABS.map((t) => ({ value: t.value, label: t.label }))} />
        </div>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: کالا، تأمین‌کننده یا شماره فاکتور" filters={filters}
          extra={<>
            <DateFilter label="از تاریخ" value={df} onChange={(v) => lp.set({ df: v || null })} />
            <DateFilter label="تا تاریخ" value={dt} onChange={(v) => lp.set({ dt: v || null })} />
          </>}
          extraActive={extraActive} onReset={() => lp.set({ df: null, dt: null })} />
        {kind === 'ITEM' ? <ItemTab {...tab} /> : null}
        {kind === 'SUPPLIER' ? <SupplierTab {...tab} /> : null}
        {kind === 'WAREHOUSE' ? <WarehouseTab {...tab} /> : null}
        {kind === 'VOIDED' ? <VoidedTab {...tab} /> : null}
      </Card>
    </>
  );
}

function Kpi({ icon, tone, label, value }: { icon: ReactNode; tone: string | undefined; label: string; value: ReactNode | null }) {
  return (
    <Card className={s.kpi}>
      <span className={`${s.kpiIcon} ${tone ?? ''}`}>{icon}</span>
      <span className={s.kpiText}><small>{label}</small><b>{value ?? '…'}</b></span>
    </Card>
  );
}

const dash = <span className={s.muted}>—</span>;
const rowNo = (page: number, size: number, i: number) => <span className={s.muted}>{faNum((page - 1) * size + i + 1)}</span>;
const num = (v: string | number) => <span className="tnum">{faNum(int(v))}</span>;
const emptyOf = (active: boolean, text: string) => <Empty title={active ? 'با این جست‌وجو و فیلترها چیزی پیدا نشد' : text} />;

function Table<T>({ kind, cols, rowKey, empty, ...p }: TabProps & { kind: ReportKind; cols: Column<T>[]; rowKey: (r: T) => string; empty: string }) {
  const q = useReport<T>(kind, { ...p.params, page: p.page, page_size: p.pageSize });
  return (
    <>
      <DataTable columns={cols} rows={q.data?.results} rowKey={rowKey} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} empty={emptyOf(p.active, empty)} />
      {q.data && q.data.total > 0 ? <Pagination page={p.page} pageSize={p.pageSize} total={q.data.total} onPage={p.onPage} onPageSize={p.onPageSize} /> : null}
    </>
  );
}

function ItemTab(p: TabProps) {
  const cols: Column<ReportItemRow>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => rowNo(p.page, p.pageSize, i) },
    { key: 'code', header: 'کد کالا', code: true, render: (r) => (r.item ? <span data-latin>{r.item.code}</span> : dash) },
    { key: 'name', header: 'نام کالا', render: (r) => <span className={s.strong}>{r.item?.display_name ?? '—'}</span> },
    { key: 'unit', header: 'واحد اصلی', render: (r) => r.item?.unit_name || dash },
    { key: 'sale', header: 'واحد فروش', render: (r) => <SaleUnits item={r.item} /> },
    { key: 'qty', header: 'تعداد خرید', render: (r) => num(r.quantity) },
    { key: 'avg', header: <UnitHead>فی متوسط خرید</UnitHead>, render: (r) => num(r.avg_price) },
    { key: 'gross', header: <UnitHead>مبلغ ناخالص</UnitHead>, render: (r) => num(r.gross) },
    { key: 'disc', header: <UnitHead>تخفیف</UnitHead>, render: (r) => num(r.discount) },
    { key: 'amount', header: <UnitHead>مبلغ خرید کل</UnitHead>, render: (r) => <span className={`tnum ${s.strong}`}>{faNum(int(r.amount))}</span> },
    { key: 'inv', header: 'تعداد فاکتور', render: (r) => faNum(r.invoice_count) },
    { key: 'rqty', header: 'تعداد برگشتی', render: (r) => num(r.returned_quantity) },
    { key: 'ravg', header: <UnitHead>فی متوسط برگشتی</UnitHead>, render: (r) => (int(r.returned_quantity) ? num(Math.round(int(r.returned_amount) / int(r.returned_quantity))) : dash) },
    { key: 'ramt', header: <UnitHead>مبلغ برگشتی</UnitHead>, render: (r) => num(r.returned_amount) },
    { key: 'net', header: <UnitHead>خالص</UnitHead>, render: (r) => <span className={`tnum ${s.strong}`}>{faNum(int(r.amount) - int(r.returned_amount))}</span> },
  ];
  return <Table {...p} kind="ITEM" cols={cols} rowKey={(r) => r.item?.id ?? 'temp'} empty="در این بازه خریدی ثبت نشده است" />;
}

function SupplierTab(p: TabProps) {
  const cols: Column<ReportSupplierRow>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => rowNo(p.page, p.pageSize, i) },
    { key: 'code', header: 'کد', code: true, render: (r) => (r.supplier ? <span data-latin>{r.supplier.code}</span> : dash) },
    { key: 'name', header: 'نام', render: (r) => <span className={s.strong}>{r.supplier?.name ?? '—'}</span> },
    { key: 'gross', header: <UnitHead>مبلغ ناخالص</UnitHead>, render: (r) => num(r.gross) },
    { key: 'disc', header: <UnitHead>تخفیف</UnitHead>, render: (r) => num(r.discount) },
    { key: 'amount', header: <UnitHead>مبلغ خرید</UnitHead>, render: (r) => num(r.amount) },
    { key: 'ret', header: <UnitHead>برگشتی</UnitHead>, render: (r) => num(r.returned_amount) },
    { key: 'net', header: <UnitHead>خالص</UnitHead>, render: (r) => <span className={`tnum ${s.strong}`}>{faNum(int(r.net))}</span> },
    { key: 'inv', header: 'تعداد فاکتور', render: (r) => faNum(r.invoice_count) },
  ];
  return <Table {...p} kind="SUPPLIER" cols={cols} rowKey={(r) => r.supplier?.id ?? 'none'} empty="در این بازه خریدی ثبت نشده است" />;
}

function WarehouseTab(p: TabProps) {
  const cols: Column<ReportWarehouseRow>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => rowNo(p.page, p.pageSize, i) },
    { key: 'date', header: 'تاریخ', render: (r) => faDate(r.invoice_date) },
    { key: 'inv', header: 'شماره فاکتور', code: true, render: (r) => <Link className={s.linkBtn} to={`/supply/purchase-invoices?open=${r.invoice_id}`} data-latin>{r.invoice_no}</Link> },
    { key: 'wh', header: 'انبار', render: (r) => (r.warehouse ? <span className={s.nameStack}><b>{r.warehouse.name}</b><small data-latin>{r.warehouse.code}</small></span> : dash) },
    { key: 'sup', header: 'تأمین‌کننده', render: (r) => (r.supplier ? <span className={s.nameStack}><b>{r.supplier.name}</b><small data-latin>{r.supplier.code}</small></span> : dash) },
    { key: 'item', header: 'کالا', render: (r) => (r.item ? <span className={s.nameStack}><b>{r.item.display_name}</b><small data-latin>{r.item.code}</small></span> : dash) },
    { key: 'unit', header: 'واحد اصلی', render: (r) => r.item?.unit_name || dash },
    { key: 'sale', header: 'واحد فروش', render: (r) => <SaleUnits item={r.item} /> },
    { key: 'qty', header: 'تعداد', render: (r) => num(r.quantity) },
    { key: 'price', header: <UnitHead>فی خرید</UnitHead>, render: (r) => num(r.unit_price) },
    { key: 'total', header: <UnitHead>مبلغ</UnitHead>, render: (r) => <span className={`tnum ${s.strong}`}>{faNum(int(r.line_total))}</span> },
    { key: 'req', header: 'نام سفارش‌دهنده', render: (r) => (r.requester ? personName(r.requester) : dash) },
  ];
  return <Table {...p} kind="WAREHOUSE" cols={cols} rowKey={(r) => `${r.invoice_id}-${r.item?.id ?? ''}-${r.warehouse?.id ?? ''}`} empty="در این بازه ردیف فاکتوری برای انبارها نیست" />;
}

function VoidedTab(p: TabProps) {
  const cols: Column<ReportVoidedRow>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => rowNo(p.page, p.pageSize, i) },
    { key: 'no', header: 'شماره', code: true, render: (r) => <span data-latin>{r.invoice_no}</span> },
    { key: 'date', header: 'تاریخ', render: (r) => faDate(r.invoice_date) },
    { key: 'sup', header: 'تأمین‌کننده', render: (r) => (r.supplier ? <span className={s.nameStack}><b>{r.supplier.name}</b><small data-latin>{r.supplier.code}</small></span> : dash) },
    { key: 'req', header: 'سفارش‌دهنده', render: (r) => (r.requester ? personName(r.requester) : dash) },
    { key: 'by', header: 'باطل‌کننده', render: (r) => personName(r.voided_by) },
    { key: 'at', header: 'تاریخ ابطال', render: (r) => (r.voided_at ? faDateTime(r.voided_at) : dash) },
    { key: 'reason', header: 'دلیل', render: (r) => r.void_reason || dash },
    { key: 'amount', header: <UnitHead>مبلغ</UnitHead>, render: (r) => <span className={`tnum ${s.strong}`}>{faNum(int(r.total_amount))}</span> },
    { key: 'settle', header: 'نحوه تسویه', render: (r) => r.settlement_method_display || r.settlement_method },
    { key: 'open', header: 'جزئیات', render: (r) => <Link className={s.linkBtn} to={`/supply/purchase-invoices?tab=VOIDED&open=${r.id}`}>جزئیات فاکتور</Link> },
  ];
  return <Table {...p} kind="VOIDED" cols={cols} rowKey={(r) => r.id} empty="در این بازه فاکتور ابطالی‌ای نیست" />;
}
