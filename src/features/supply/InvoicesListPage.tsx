import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconDownload, IconEye, IconFileInvoice, IconPackage, IconPaperclip, IconPlus, IconX } from '@tabler/icons-react';
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
import { IconButton } from './components';
import { InvoiceDetailModal } from './InvoiceDetail';
import { InvoiceDrawer } from './InvoiceDrawer';
import { DELIVERY_KEYS, exportInvoices, SETTLEMENT_KEYS, useInvoiceCounts, useInvoices, type Invoice, type InvoiceCounts } from './invoicesApi';
import { ItemPickerModal } from './ItemPicker';
import { DELIVERY_TYPE, INVOICE_STATUS, INVOICE_TABS, labelOf, SETTLEMENT_METHOD, toneOf, type InvoiceTab } from './labels';
import { int } from './requestsApi';
import s from './supply.module.css';

/**
 * فاکتور خرید — GET /supply/invoices (+ export). html «فاکتور خرید»؛ ستون‌ها و فیلترها: تأیید افشین 2026-10-31 (فیلترهای html و «پیشنهاد اضافه»).
 * - تب‌ها: همه، پیش‌نویس و ویرایش‌شده (`status=DRAFT&status=EDITED`، S-17 ✅)، تأیید و صادرشده، ابطالی (`voided=true`، شامل بایگانی‌شده‌ها).
 * - شمارنده‌ی تب‌ها از /invoices/status-counts با همان فیلترها (S-18 ✅): «همه» = ALL، «ابطالی» = VOIDED_ANY؛ بک‌اند برای «پیش‌نویس و
 *   ویرایش‌شده» کلید جدا ندارد ⇐ DRAFT + EDITED.
 * - فیلترها (سرور): جست‌وجو، تأمین‌کننده، نوع تحویل، نحوه تسویه، انبار، کالا، از تاریخ و تا تاریخ، شعبه.
 * - ثبت مستقیم در کشوی چپ (زیرصفحه‌ی «ثبت فاکتور خرید»)؛ جزئیات در مودال (`?open=`). فاکتور از اعلامیه در صفحه‌ی اعلامیه ساخته می‌شود.
 */
const PAGE_SIZE = 10;
const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'no', label: 'شماره', fixed: true },
  { key: 'date', label: 'تاریخ' },
  { key: 'supno', label: 'شماره فاکتور تأمین‌کننده' },
  { key: 'supplier', label: 'تأمین‌کننده', fixed: true },
  { key: 'delivery', label: 'نوع تحویل' },
  { key: 'settle', label: 'نحوه تسویه' },
  { key: 'ref', label: 'سند مرجع' },
  { key: 'lines', label: 'تعداد اقلام' },
  { key: 'total', label: 'مبلغ کل' },
  { key: 'status', label: 'وضعیت' },
  { key: 'file', label: 'فایل' },
  { key: 'acts', label: 'عملیات', fixed: true },
];
/** عدد هر تب از کلیدهای status-counts بک‌اند */
const TAB_COUNT: Record<InvoiceTab, (c: InvoiceCounts) => number> = {
  ALL: (c) => c.ALL, PENDING: (c) => c.DRAFT + c.EDITED, APPROVED_ISSUED: (c) => c.APPROVED_ISSUED, VOIDED: (c) => c.VOIDED_ANY,
};
const isTab = (v: string): v is InvoiceTab => INVOICE_TABS.some((t) => t.value === v);
const TAB_PARAMS: Record<InvoiceTab, ListParams> = {
  ALL: {}, PENDING: { status: ['DRAFT', 'EDITED'] }, APPROVED_ISSUED: { status: 'APPROVED_ISSUED' }, VOIDED: { voided: true },
};

export default function InvoicesListPage({ creating = false }: { creating?: boolean }) {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);
  const tab: InvoiceTab = isTab(lp.tab) ? lp.tab : 'ALL';
  const [supplierId, warehouseId, branchId, itemId] = [lp.get('supplier'), lp.get('warehouse'), lp.get('branch'), lp.get('item')];
  const [delivery, settle, df, dt] = [lp.get('delivery'), lp.get('settle'), lp.get('df'), lp.get('dt')];
  const openId = lp.get('open') || null;
  const setOpenId = (id: string | null) => lp.set({ open: id }, { keepPage: true });
  const branches = useBranchOptions();
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const prefs = useColumnPrefs('supply.invoices', COLS);
  const [pickingItem, setPickingItem] = useState(false);
  const [exporting, setExporting] = useState(false);

  const base: ListParams = {
    query: dq || undefined, supplier_id: supplierId || undefined, warehouse_id: warehouseId || undefined, branch_id: branchId || undefined,
    item_id: itemId || undefined, date_from: df || undefined, date_to: dt || undefined, delivery_type: delivery || undefined, settlement_method: settle || undefined,
  };
  const filtered: ListParams = { ...base, ...TAB_PARAMS[tab] };
  const list = useInvoices({ ...filtered, page: lp.page, page_size: lp.pageSize });
  const counts = useInvoiceCounts(base);
  const c = counts.data;

  const filters: FilterDef[] = [
    { key: 'supplier', label: 'تأمین‌کننده', value: supplierId, onChange: lp.setFilter('supplier'), options: (sups.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    { key: 'delivery', label: 'نوع تحویل', value: delivery, onChange: lp.setFilter('delivery'), options: DELIVERY_KEYS.map((v) => ({ value: v, label: DELIVERY_TYPE[v] ?? v })) },
    { key: 'settle', label: 'نحوه تسویه', value: settle, onChange: lp.setFilter('settle'), options: SETTLEMENT_KEYS.map((v) => ({ value: v, label: SETTLEMENT_METHOD[v] ?? v })) },
    { key: 'warehouse', label: 'انبار', value: warehouseId, onChange: lp.setFilter('warehouse'), options: (whs.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    ...((branches.data?.length ?? 0) > 1 ? [{ key: 'branch', label: 'شعبه', value: branchId, onChange: lp.setFilter('branch'), options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) }] : []),
  ];
  const extraActive = !!(itemId || df || dt);
  const active = !!dq || filters.some((f) => f.value) || extraActive;
  const doExport = async () => {
    setExporting(true);
    try { await exportInvoices(filtered); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };
  const dash = <span className={s.muted}>—</span>;

  const all: Column<Invoice>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'no', header: 'شماره', code: true, render: (x) => <span data-latin>{x.invoice_no}</span> },
    { key: 'date', header: 'تاریخ', render: (x) => faDate(x.invoice_date) },
    { key: 'supno', header: 'شماره فاکتور تأمین‌کننده', code: true, render: (x) => (x.supplier_invoice_no ? <span data-latin>{x.supplier_invoice_no}</span> : dash) },
    { key: 'supplier', header: 'تأمین‌کننده', render: (x) => (x.supplier ? <span className={s.nameStack}><b>{x.supplier.name}</b><small data-latin>{x.supplier.code}</small></span> : dash) },
    { key: 'delivery', header: 'نوع تحویل', render: (x) => x.delivery_type_display || DELIVERY_TYPE[x.delivery_type] || x.delivery_type },
    { key: 'settle', header: 'نحوه تسویه', render: (x) => x.settlement_method_display || SETTLEMENT_METHOD[x.settlement_method] || x.settlement_method },
    { key: 'ref', header: 'سند مرجع', render: (x) => {
      if (x.advice_no) return <span className={s.nameStack}><small>اعلامیه</small><b data-latin>{x.advice_no}</b></span>;
      if (x.consignment_no) return <span className={s.nameStack}><small>امانی</small><b data-latin>{x.consignment_no}</b></span>;
      return <span className={s.muted}>مستقیم</span>;
    } },
    { key: 'lines', header: 'تعداد اقلام', render: (x) => faNum(x.line_count) },
    { key: 'total', header: <UnitHead>مبلغ کل</UnitHead>, render: (x) => <span className={`tnum ${s.strong}`}>{faNum(int(x.total_amount))}</span> },
    { key: 'status', header: 'وضعیت', render: (x) => <Badge tone={toneOf(INVOICE_STATUS, x.status)}>{labelOf(INVOICE_STATUS, x.status, x.status_display)}</Badge> },
    { key: 'file', header: 'فایل', render: (x) => (x.has_file ? <span className={s.fileMark} data-tip="فایل فاکتور پیوست شده" aria-label="فایل پیوست دارد"><IconPaperclip size={16} /></span> : dash) },
    { key: 'acts', header: 'عملیات', render: (x) => <span className={s.rowActions}><IconButton label={`جزئیات ${x.invoice_no}`} onClick={() => setOpenId(x.id)}><IconEye size={16} /></IconButton></span> },
  ];
  const cols = all.filter((col) => prefs.isVisible(col.key));
  const closeCreate = (createdId?: string) => navigate(createdId ? `/supply/purchase-invoices?open=${createdId}` : '/supply/purchase-invoices', { replace: true });

  return (
    <>
      <PageHead actions={<>
        {can('supply.purchase_invoices.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} loading={exporting} onClick={doExport}>خروجی اکسل</Button> : null}
        {can('supply.purchase_invoices.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/supply/purchase-invoices/new')}>فاکتور خرید جدید</Button> : null}
      </>} />
      <Card>
        <div className={s.listHead}>
          <UnderlineTabs value={tab} onChange={(t) => lp.set({ tab: t === 'ALL' ? null : t })} options={INVOICE_TABS.map((t) => ({ value: t.value, label: <>{t.label} <span className={s.tabCount}>{c ? faNum(TAB_COUNT[t.value](c)) : ''}</span></> }))} />
        </div>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: شماره فاکتور، شماره فاکتور تأمین‌کننده، تأمین‌کننده یا کالا" filters={filters}
          extra={<>
            <span className={s.pickChip}>
              <button type="button" className={`${s.pickChipBtn} ${itemId ? s.pickChipOn : ''}`} onClick={() => setPickingItem(true)} aria-haspopup="dialog">
                <IconPackage size={16} /><span className={s.pickChipLabel}>کالا</span><b>{itemId ? lp.get('item_name') || 'انتخاب‌شده' : 'همه'}</b>
              </button>
              {itemId ? <button type="button" className={s.pickChipClear} aria-label="برداشتن فیلتر کالا" onClick={() => lp.set({ item: null, item_name: null })}><IconX size={14} /></button> : null}
            </span>
            <DateFilter label="از تاریخ" value={df} onChange={(v) => lp.set({ df: v || null })} />
            <DateFilter label="تا تاریخ" value={dt} onChange={(v) => lp.set({ dt: v || null })} />
            <ColumnPicker {...prefs} />
          </>}
          extraActive={extraActive} onReset={() => lp.set({ item: null, item_name: null, df: null, dt: null })}
          count={list.data ? `${faNum(list.data.total)} فاکتور` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(x) => x.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('supply.purchase_invoices.read') ? (x) => setOpenId(x.id) : undefined}
          empty={<Empty icon={<IconFileInvoice size={26} stroke={1.5} />} title={active ? 'فاکتوری با این جست‌وجو و فیلترها پیدا نشد' : 'فاکتوری در این وضعیت نیست'}
            text={active || tab !== 'ALL' ? undefined : 'فاکتور خرید از اعلامیه‌ی «تأیید انبار» یا «دریافت ناقص» ساخته می‌شود، یا با «فاکتور خرید جدید» مستقیم ثبت می‌شود.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>

      <InvoiceDetailModal id={openId} onClose={() => setOpenId(null)} />
      {creating ? <InvoiceDrawer invoice={null} onClose={() => closeCreate()} onSaved={(x) => closeCreate(x.id)} /> : null}
      <ItemPickerModal open={pickingItem} onClose={() => setPickingItem(false)} title="فیلتر بر اساس کالا" existing={[]}
        onPick={(rows) => { const first = rows[0]; if (first) lp.set({ item: first.item_id, item_name: first.name }); setPickingItem(false); }} />
    </>
  );
}
