import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconArrowBackUp, IconDownload, IconEye, IconPackage, IconPlus, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { faDate, faNum } from '@/shared/lib/format';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, PageHead, Pagination, UnitHead } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useSupplierOptions, type ListParams } from './api';
import { IconButton } from './components';
import { ItemPickerModal } from './ItemPicker';
import { labelOf, RETURN_STATUS, toneOf } from './labels';
import { int, personName } from './requestsApi';
import { ReturnDetailModal } from './ReturnDetail';
import { ReturnDrawer } from './ReturnDrawer';
import { exportReturns, useReturns, type PurchaseReturn } from './returnsApi';
import s from './supply.module.css';

/**
 * برگشت از خرید — GET /supply/returns (+ export). html «برگشت از خرید»؛ ستون‌ها و فیلترها: تأیید افشین 2026-10-31.
 * - ستون‌ها: ردیف، شماره، تاریخ، شماره فاکتور، کد و نام تأمین‌کننده، مبلغ کل، نام انبار، نام صادرکننده، وضعیت، عملیات.
 * - فیلترها (سرور): جست‌وجو و انبار (html) + وضعیت، تأمین‌کننده، کالا، از تاریخ و تا تاریخ، شعبه (پیشنهاد اضافه).
 * - ثبت در کشوی چپ (زیرصفحه‌ی «ثبت برگشت از خرید»)؛ جزئیات در مودال (`?open=`).
 */
const PAGE_SIZE = 10;
const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'no', label: 'شماره', fixed: true },
  { key: 'date', label: 'تاریخ' },
  { key: 'invoice', label: 'شماره فاکتور' },
  { key: 'supplier', label: 'تأمین‌کننده', fixed: true },
  { key: 'total', label: 'مبلغ کل' },
  { key: 'warehouse', label: 'نام انبار' },
  { key: 'issuer', label: 'نام صادرکننده' },
  { key: 'status', label: 'وضعیت' },
  { key: 'acts', label: 'عملیات', fixed: true },
];

export default function ReturnsListPage({ creating = false }: { creating?: boolean }) {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);
  const [status, supplierId, warehouseId, branchId, itemId] = [lp.get('status'), lp.get('supplier'), lp.get('warehouse'), lp.get('branch'), lp.get('item')];
  const [df, dt] = [lp.get('df'), lp.get('dt')];
  const openId = lp.get('open') || null;
  const setOpenId = (id: string | null) => lp.set({ open: id }, { keepPage: true });
  const branches = useBranchOptions();
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const prefs = useColumnPrefs('supply.returns', COLS);
  const [pickingItem, setPickingItem] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filtered: ListParams = {
    query: dq || undefined, status: status || undefined, supplier_id: supplierId || undefined, warehouse_id: warehouseId || undefined,
    branch_id: branchId || undefined, item_id: itemId || undefined, date_from: df || undefined, date_to: dt || undefined,
  };
  const list = useReturns({ ...filtered, page: lp.page, page_size: lp.pageSize });
  const filters: FilterDef[] = [
    { key: 'warehouse', label: 'انبار', value: warehouseId, onChange: lp.setFilter('warehouse'), options: (whs.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    { key: 'status', label: 'وضعیت', value: status, onChange: lp.setFilter('status'), options: Object.entries(RETURN_STATUS).map(([value, v]) => ({ value, label: v.label })) },
    { key: 'supplier', label: 'تأمین‌کننده', value: supplierId, onChange: lp.setFilter('supplier'), options: (sups.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    ...((branches.data?.length ?? 0) > 1 ? [{ key: 'branch', label: 'شعبه', value: branchId, onChange: lp.setFilter('branch'), options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) }] : []),
  ];
  const extraActive = !!(itemId || df || dt);
  const active = !!dq || filters.some((f) => f.value) || extraActive;
  const doExport = async () => {
    setExporting(true);
    try { await exportReturns(filtered); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };
  const dash = <span className={s.muted}>—</span>;
  const all: Column<PurchaseReturn>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'no', header: 'شماره', code: true, render: (r) => <span data-latin>{r.return_no}</span> },
    { key: 'date', header: 'تاریخ', render: (r) => faDate(r.return_date) },
    { key: 'invoice', header: 'شماره فاکتور', code: true, render: (r) => <span data-latin>{r.invoice_no}</span> },
    { key: 'supplier', header: 'تأمین‌کننده', render: (r) => (r.supplier ? <span className={s.nameStack}><b>{r.supplier.name}</b><small data-latin>{r.supplier.code}</small></span> : dash) },
    { key: 'total', header: <UnitHead>مبلغ کل</UnitHead>, render: (r) => <span className={`tnum ${s.strong}`}>{faNum(int(r.total_amount))}</span> },
    { key: 'warehouse', header: 'نام انبار', render: (r) => r.warehouse?.name ?? dash },
    { key: 'issuer', header: 'نام صادرکننده', render: (r) => personName(r.issuer) },
    { key: 'status', header: 'وضعیت', render: (r) => <Badge tone={toneOf(RETURN_STATUS, r.status)}>{labelOf(RETURN_STATUS, r.status, r.status_display)}</Badge> },
    { key: 'acts', header: 'عملیات', render: (r) => <span className={s.rowActions}><IconButton label={`جزئیات ${r.return_no}`} onClick={() => setOpenId(r.id)}><IconEye size={16} /></IconButton></span> },
  ];
  const cols = all.filter((c) => prefs.isVisible(c.key));
  const closeCreate = (createdId?: string) => navigate(createdId ? `/supply/purchase-returns?open=${createdId}` : '/supply/purchase-returns', { replace: true });

  return (
    <>
      <PageHead actions={<>
        {can('supply.purchase_returns.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} loading={exporting} onClick={doExport}>خروجی اکسل</Button> : null}
        {can('supply.purchase_returns.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/supply/purchase-returns/new')}>برگشتی جدید</Button> : null}
      </>} />
      <Card>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: شماره برگشتی، شماره فاکتور، تأمین‌کننده یا کالا" filters={filters}
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
          count={list.data ? `${faNum(list.data.total)} برگشتی` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('supply.purchase_returns.read') ? (r) => setOpenId(r.id) : undefined}
          empty={<Empty icon={<IconArrowBackUp size={26} stroke={1.5} />} title={active ? 'برگشتی‌ای با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز برگشت از خریدی ثبت نشده است'}
            text={active ? undefined : 'کالای معیوب یا اضافی را بر اساس فاکتور خرید صادرشده با «برگشتی جدید» به تأمین‌کننده عودت دهید.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      <ReturnDetailModal id={openId} onClose={() => setOpenId(null)} />
      {creating ? <ReturnDrawer ret={null} onClose={() => closeCreate()} onSaved={(r) => closeCreate(r.id)} /> : null}
      <ItemPickerModal open={pickingItem} onClose={() => setPickingItem(false)} title="فیلتر بر اساس کالا" existing={[]}
        onPick={(rows) => { const first = rows[0]; if (first) lp.set({ item: first.item_id, item_name: first.name }); setPickingItem(false); }} />
    </>
  );
}
