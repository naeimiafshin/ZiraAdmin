import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconDownload, IconEye, IconFileInvoice, IconFileText, IconPackage, IconPlus, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { faDate, faNum } from '@/shared/lib/format';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, PageHead, Pagination, UnderlineTabs, UnitHead } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useSupplierOptions, type ListParams } from './api';
import { AdviceDetailModal, InvoiceFromAdviceModal } from './AdviceDetail';
import { AdviceDrawer } from './AdviceDrawer';
import { exportAdvices, useAdviceCounts, useAdvices, type Advice } from './advicesApi';
import { IconButton } from './components';
import { ItemPickerModal } from './ItemPicker';
import { ADVICE_STATUS, ADVICE_TABS, labelOf, RECEIPT_STATUS, toneOf, type AdviceTab } from './labels';
import { int, personName } from './requestsApi';
import s from './supply.module.css';

/**
 * اعلامیه رسید انبار — GET /supply/advices (+ status-counts، export). html «اعلامیه رسید انبار»؛ ستون‌ها و فیلترها: تأیید افشین 2026-10-31.
 * - تب‌ها: «همه» (بدون بایگانی‌شده‌ها) و شش وضعیت بک‌اند، «ابطال‌شده» و «بایگانی‌شده» جدا (افشین). مقدار تب = پارامتر `status` (ARCHIVED = بایگانی‌شده‌ها).
 * - شمارنده‌ی تب‌ها از status-counts با همان فیلترهای جدول؛ عدد «همه» کلید ALL بک‌اند است.
 * - فیلترها (سرور): جست‌وجو، تأمین‌کننده، انبار مقصد، کالا، از تاریخ و تا تاریخ (تاریخ ثبت)، شعبه (وقتی کاربر بیش از یک شعبه می‌بیند).
 * - ثبت در کشوی چپ (زیرصفحه‌ی «ثبت اعلامیه» یا دکمه‌ی «صدور اعلامیه» در جزئیات درخواست تأمین با `?request=`)؛ جزئیات در مودال (`?open=`).
 * - «صدور فاکتور» در ستون فاکتور وقتی `can_invoice` برقرار است؛ شماره‌ی فاکتور وقتی صادر شده.
 */
const PAGE_SIZE = 10;
const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'no', label: 'شماره', fixed: true },
  { key: 'created', label: 'تاریخ ثبت' },
  { key: 'sent', label: 'تاریخ ارسال به انبار' },
  { key: 'issuer', label: 'صادرکننده' },
  { key: 'supplier', label: 'تأمین‌کننده', fixed: true },
  { key: 'warehouse', label: 'انبار مقصد' },
  { key: 'receipt', label: 'رسید انبار' },
  { key: 'lines', label: 'تعداد اقلام' },
  { key: 'total', label: 'مبلغ کل' },
  { key: 'status', label: 'وضعیت' },
  { key: 'invoice', label: 'فاکتور' },
  { key: 'acts', label: 'عملیات', fixed: true },
];
const isTab = (v: string): v is AdviceTab => ADVICE_TABS.some((t) => t.value === v);

export default function AdvicesListPage({ creating = false }: { creating?: boolean }) {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);
  const tab: AdviceTab = isTab(lp.tab) ? lp.tab : 'ALL';
  const [supplierId, warehouseId, branchId, itemId] = [lp.get('supplier'), lp.get('warehouse'), lp.get('branch'), lp.get('item')];
  const [df, dt] = [lp.get('df'), lp.get('dt')];
  const openId = lp.get('open') || null;
  const setOpenId = (id: string | null) => lp.set({ open: id }, { keepPage: true });
  const branches = useBranchOptions();
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const prefs = useColumnPrefs('supply.advices', COLS);
  const [invoicing, setInvoicing] = useState<Advice | null>(null);
  const [pickingItem, setPickingItem] = useState(false);
  const [exporting, setExporting] = useState(false);

  const base: ListParams = {
    query: dq || undefined, supplier_id: supplierId || undefined, warehouse_id: warehouseId || undefined, branch_id: branchId || undefined,
    item_id: itemId || undefined, date_from: df || undefined, date_to: dt || undefined,
  };
  const filtered: ListParams = { ...base, status: tab === 'ALL' ? undefined : tab };
  const list = useAdvices({ ...filtered, page: lp.page, page_size: lp.pageSize });
  const counts = useAdviceCounts(base);
  const c = counts.data;
  // شمارنده‌ها همان فیلترهای جدول را دارند؛ «همه» = کلید ALL بک‌اند (= total فهرست بدون status، بدون بایگانی‌شده‌ها — S-15، S-16 ✅)
  const countOf = (t: AdviceTab) => (c ? c[t] ?? 0 : undefined);

  const filters: FilterDef[] = [
    { key: 'supplier', label: 'تأمین‌کننده', value: supplierId, onChange: lp.setFilter('supplier'), options: (sups.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    { key: 'warehouse', label: 'انبار مقصد', value: warehouseId, onChange: lp.setFilter('warehouse'), options: (whs.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    ...((branches.data?.length ?? 0) > 1 ? [{ key: 'branch', label: 'شعبه', value: branchId, onChange: lp.setFilter('branch'), options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) }] : []),
  ];
  const extraActive = !!(itemId || df || dt);
  const active = !!dq || filters.some((f) => f.value) || extraActive;
  const doExport = async () => {
    setExporting(true);
    try { await exportAdvices(filtered); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };
  const dash = <span className={s.muted}>—</span>;
  const canInvoice = can('supply.purchase_invoices.create');

  const invoiceCell = (a: Advice): ReactNode => {
    if (a.invoice_no) return <span className={s.code} data-latin>{a.invoice_no}</span>;
    if (a.can_invoice && canInvoice) {
      return <Button size="sm" variant="secondary" icon={<IconFileInvoice size={15} />} onClick={(e) => { e.stopPropagation(); setInvoicing(a); }}>صدور فاکتور</Button>;
    }
    return dash;
  };
  const all: Column<Advice>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'no', header: 'شماره', code: true, render: (a) => (
      <span className={s.nameStack}><b data-latin>{a.advice_no}</b>{a.request_no ? <small>درخواست تأمین <span data-latin>{a.request_no}</span></small> : null}{a.consignment_no ? <small>امانی <span data-latin>{a.consignment_no}</span></small> : null}</span>
    ) },
    { key: 'created', header: 'تاریخ ثبت', render: (a) => faDate(a.created_at) },
    { key: 'sent', header: 'تاریخ ارسال به انبار', render: (a) => (a.sent_to_warehouse_at ? faDate(a.sent_to_warehouse_at) : dash) },
    { key: 'issuer', header: 'صادرکننده', render: (a) => personName(a.issuer) },
    { key: 'supplier', header: 'تأمین‌کننده', render: (a) => (a.supplier ? <span className={s.nameStack}><b>{a.supplier.name}</b><small data-latin>{a.supplier.code}</small></span> : dash) },
    { key: 'warehouse', header: 'انبار مقصد', render: (a) => a.destination_warehouse?.name ?? dash },
    { key: 'receipt', header: 'رسید انبار', render: (a) => (a.receipt
      ? <span className={s.nameStack}><b data-latin>{a.receipt.receipt_no}</b><small>{labelOf(RECEIPT_STATUS, a.receipt.status, a.receipt.status_display)}</small></span> : dash) },
    { key: 'lines', header: 'تعداد اقلام', render: (a) => faNum(a.line_count) },
    { key: 'total', header: <UnitHead>مبلغ کل</UnitHead>, render: (a) => <span className={`tnum ${s.strong}`}>{faNum(int(a.total))}</span> },
    { key: 'status', header: 'وضعیت', render: (a) => <Badge tone={toneOf(ADVICE_STATUS, a.status)}>{labelOf(ADVICE_STATUS, a.status, a.status_display)}</Badge> },
    { key: 'invoice', header: 'فاکتور', render: invoiceCell },
    { key: 'acts', header: 'عملیات', render: (a) => <span className={s.rowActions}><IconButton label={`جزئیات ${a.advice_no}`} onClick={() => setOpenId(a.id)}><IconEye size={16} /></IconButton></span> },
  ];
  const cols = all.filter((col) => prefs.isVisible(col.key));
  const closeCreate = (createdId?: string) => navigate(createdId ? `/supply/receipt-advices?open=${createdId}` : '/supply/receipt-advices', { replace: true });
  const itemChip = (
    <span className={s.pickChip}>
      <button type="button" className={`${s.pickChipBtn} ${itemId ? s.pickChipOn : ''}`} onClick={() => setPickingItem(true)} aria-haspopup="dialog">
        <IconPackage size={16} /><span className={s.pickChipLabel}>کالا</span><b>{itemId ? lp.get('item_name') || 'انتخاب‌شده' : 'همه'}</b>
      </button>
      {itemId ? <button type="button" className={s.pickChipClear} aria-label="برداشتن فیلتر کالا" onClick={() => lp.set({ item: null, item_name: null })}><IconX size={14} /></button> : null}
    </span>
  );

  return (
    <>
      <PageHead actions={<>
        {can('supply.receipt_advices.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} loading={exporting} onClick={doExport}>خروجی اکسل</Button> : null}
        {can('supply.receipt_advices.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/supply/receipt-advices/new')}>اعلامیه جدید</Button> : null}
      </>} />
      <Card>
        <div className={s.listHead}>
          <UnderlineTabs value={tab} onChange={(t) => lp.set({ tab: t === 'ALL' ? null : t })}
            options={ADVICE_TABS.map((t) => ({ value: t.value, label: <>{t.label} <span className={s.tabCount}>{countOf(t.value) === undefined ? '' : faNum(countOf(t.value))}</span></> }))} />
        </div>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: شماره اعلامیه، شماره درخواست تأمین، تأمین‌کننده یا کالا" filters={filters}
          extra={<>
            {itemChip}
            <DateFilter label="از تاریخ" value={df} onChange={(v) => lp.set({ df: v || null })} />
            <DateFilter label="تا تاریخ" value={dt} onChange={(v) => lp.set({ dt: v || null })} />
            <ColumnPicker {...prefs} />
          </>}
          extraActive={extraActive} onReset={() => lp.set({ item: null, item_name: null, df: null, dt: null })}
          count={list.data ? `${faNum(list.data.total)} اعلامیه` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(a) => a.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('supply.receipt_advices.read') ? (a) => setOpenId(a.id) : undefined}
          empty={<Empty icon={<IconFileText size={26} stroke={1.5} />} title={active ? 'اعلامیه‌ای با این جست‌وجو و فیلترها پیدا نشد' : 'اعلامیه‌ای در این وضعیت وجود ندارد'}
            text={active || tab !== 'ALL' ? undefined : 'برای درخواست تأمین تأییدشده یا خرید مستقیم، با «اعلامیه جدید» کالا را برای انبار و مالی بفرستید.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>

      <AdviceDetailModal id={openId} onClose={() => setOpenId(null)} />
      {creating ? <AdviceDrawer advice={null} requestId={lp.get('request') || null} onClose={() => closeCreate()} onSaved={(a) => closeCreate(a.id)} /> : null}
      {invoicing ? <InvoiceFromAdviceModal a={invoicing} onClose={() => setInvoicing(null)} /> : null}
      <ItemPickerModal open={pickingItem} onClose={() => setPickingItem(false)} title="فیلتر بر اساس کالا" existing={[]}
        onPick={(rows) => { const first = rows[0]; if (first) lp.set({ item: first.item_id, item_name: first.name }); setPickingItem(false); }} />
    </>
  );
}
