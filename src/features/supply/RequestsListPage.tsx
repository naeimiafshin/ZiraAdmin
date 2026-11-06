import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  IconCircleCheck, IconCircleX, IconClipboardList, IconDownload, IconEye, IconHourglass, IconPackage, IconPlus, IconTruckDelivery, IconUserSearch, IconX,
} from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { faDate, faNum } from '@/shared/lib/format';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, Modal, PageHead, Pagination, Segmented, UnitHead } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import { useSupplierOptions, type ListParams } from './api';
import { IconButton } from './components';
import { labelOf, LIFECYCLE_TONE, REQUEST_TABS, STAGE_STATUS, toneOf, type RequestTab } from './labels';
import { AssignSupplierModal, RequestDetailModal } from './RequestDetail';
import { RequestDrawer } from './RequestDrawer';
import { RequestItemFilterModal } from './RequestItemFilter';
import { DepositModal, FinanceModal, VotesModal } from './RequestModals';
import { StageModal } from './RequestStage';
import { SaleUnits } from './SaleUnits';
import {
  exportRequests, int, isCustomerRequest, personName, personRoles, splitPath, useRequestCounts, useRequests, useRequestsByItem, useRequestWrite,
  type RequestByItem, type SupplyRequest,
} from './requestsApi';
import { StaffPicker } from './StaffPicker';
import s from './supply.module.css';

/**
 * درخواست‌های تأمین — GET /supply/requests (+ status-counts، by-item، export). html «درخواست‌های تأمین»؛ ستون‌ها و فیلترها: تأیید افشین 2026-10-31.
 * - چهار کارت بالا از شمارنده‌ی بک‌اند با همان فیلترها (بدون وضعیت).
 * - دو نما: «بر اساس سفارش» و «بر اساس کالا» (`view` در آدرس).
 * - وضعیت (افشین ۱۲ آبان ۱۴۰۵: تب‌ها به فیلتر کشویی تبدیل شدند، `status` در آدرس، خالی = همه): در انتظار، تأیید شده، رد شده و
 *   «لغو و بسته» = `final_status=CANCELLED&final_status=CLOSED` (بک‌اند چند مقدار می‌گیرد؛ S-13 ✅). عدد هر گزینه از شمارنده‌ی بک‌اند.
 * - فیلتر «مرحله» فقط وقتی وضعیت «در انتظار» است (هر دو نما): «منتظر رأی و تصمیم تأمین» = `approval_status=PENDING` و «منتظر تأیید مالی» =
 *   `approval_status=APPROVED&finance_approval_status=PENDING` (S-14 ✅). درخواست تأمینی که تأمین تأیید کرده تا تصمیم مالی «در انتظار» می‌ماند.
 * همه‌ی فیلترها، صفحه‌بندی و خروجی اکسل سمت سرورند.
 * - ستون‌های «آرا»، «بیعانه» و «وضعیت مالی» دکمه‌اند و مودال خودشان را باز می‌کنند (افشین ۱۴ آبان ۱۴۰۵؛ html «لیست پیش‌سفارشات»)؛
 *   رأی، تصمیم مدیر تأمین و تأیید مالی همان‌جا هم ثبت می‌شود. درخواست کارمند بیعانه و تأیید مالی ندارد. ستون کد پرسنلی حذف شد.
 * - تارگت فروش فقط در فرم ثبت کارمند تعیین می‌شود؛ درخواست مشتری موعد تحویل دارد و تارگتش خالی است.
 */
const PAGE_SIZE = 10;
const BY_ITEM_WIDTH = 1080;
const DETAIL_PAGE_SIZE = 8;
const CLOSED_STATUSES = ['CANCELLED', 'CLOSED'];
const STAGES = [
  { value: 'SUPPLY', label: 'منتظر رأی و تصمیم تأمین' },
  { value: 'FINANCE', label: 'منتظر تأیید مالی' },
];
type View = 'order' | 'item';

const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'date', label: 'تاریخ' },
  { key: 'no', label: 'شماره', fixed: true },
  { key: 'due', label: 'موعد تحویل' },
  { key: 'valid', label: 'تاریخ اعتبار' },
  { key: 'requester', label: 'سفارش‌دهنده', fixed: true },
  { key: 'role', label: 'نقش سفارش‌دهنده' },
  { key: 'lines', label: 'تعداد اقلام' },
  { key: 'votes', label: 'آرا' },
  { key: 'deposit', label: 'بیعانه' },
  { key: 'target', label: 'تارگت فروش' },
  { key: 'total', label: 'مبلغ کل' },
  { key: 'stage', label: 'مرحله' },
  { key: 'finance', label: 'وضعیت مالی' },
  { key: 'supplier', label: 'تأمین‌کننده و انبار' },
  { key: 'advice', label: 'شماره اعلامیه' },
  { key: 'acts', label: 'عملیات', fixed: true },
];

const isStatus = (v: string): v is RequestTab => REQUEST_TABS.some((t) => t.value === v);
/** پارامترهای بک‌اند هر گزینه‌ی فیلتر «مرحله» */
const STAGE_PARAMS: Record<string, ListParams> = {
  SUPPLY: { approval_status: 'PENDING' },
  FINANCE: { approval_status: 'APPROVED', finance_approval_status: 'PENDING' },
};

export default function RequestsListPage({ creating = false }: { creating?: boolean }) {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);
  const rawStatus = lp.get('status');
  const status: RequestTab | '' = isStatus(rawStatus) ? rawStatus : '';
  const view: View = lp.get('view') === 'item' ? 'item' : 'order';
  const stage = status === 'OPEN' ? lp.get('stage') : '';
  const [supplierId, branchId, itemId, requesterId] = [lp.get('supplier'), lp.get('branch'), lp.get('item'), lp.get('requester')];
  const [df, dt] = [lp.get('df'), lp.get('dt')];
  // درخواست تأمین باز در مودال جزئیات هم در آدرس است تا بعد از ثبت (تغییر مسیر از /new) و «بازگشت» باز بماند
  const openId = lp.get('open') || null;
  const setOpenId = (id: string | null) => lp.set({ open: id }, { keepPage: true });
  const branches = useBranchOptions();
  const sups = useSupplierOptions('');
  const prefs = useColumnPrefs('supply.requests', COLS);
  const [assigning, setAssigning] = useState<SupplyRequest | null>(null);
  const [itemGroup, setItemGroup] = useState<RequestByItem | null>(null);
  const [itemAssign, setItemAssign] = useState<RequestByItem | null>(null);
  const [picker, setPicker] = useState<'requester' | 'item' | null>(null);
  const [cellModal, setCellModal] = useState<{ kind: 'votes' | 'deposit' | 'finance' | 'stage'; id: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const w = useRequestWrite();

  const base: ListParams = {
    query: dq || undefined, supplier_id: supplierId || undefined, branch_id: branchId || undefined, item_id: itemId || undefined,
    requester_id: requesterId || undefined, date_from: df || undefined, date_to: dt || undefined,
  };
  const finalStatus = status === 'CLOSED_GROUP' ? CLOSED_STATUSES : status || undefined;
  const filtered: ListParams = { ...base, final_status: finalStatus, ...(STAGE_PARAMS[stage] ?? {}) };
  const paged: ListParams = { ...filtered, page: lp.page, page_size: lp.pageSize };
  // شمارنده‌ی وضعیت‌ها وضعیت نهایی را نادیده می‌گیرد (بک‌اند)
  const counts = useRequestCounts(base);

  const orders = useRequests(paged, view === 'order');
  const byItem = useRequestsByItem(paged, view === 'item');
  const orderTotal = orders.data?.total;
  const itemTotal = byItem.data?.total;

  const c = counts.data;
  const countOf = (t: RequestTab) => {
    if (!c) return undefined;
    return t === 'CLOSED_GROUP' ? c.CANCELLED + c.CLOSED : c[t];
  };
  const shownTotal = view === 'order' ? orderTotal : itemTotal;
  const countText = shownTotal === undefined ? undefined : `${faNum(shownTotal)} ${view === 'order' ? 'درخواست تأمین' : 'کالا'}`;
  const allCount = c ? c.OPEN + c.APPROVED + c.REJECTED + c.CANCELLED + c.CLOSED : undefined;

  const statusOptions = REQUEST_TABS.map((t) => {
    const n = countOf(t.value);
    return { value: t.value, label: n === undefined ? t.label : `${t.label} (${faNum(n)})` };
  });
  const setStatus = (v: string) => lp.set({ status: v || null, stage: null });
  const filters: FilterDef[] = [
    { key: 'status', label: 'وضعیت', value: status, onChange: setStatus, options: statusOptions },
    { key: 'supplier', label: 'تأمین‌کننده', value: supplierId, onChange: lp.setFilter('supplier'), options: (sups.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    ...(status === 'OPEN' ? [{ key: 'stage', label: 'مرحله', value: stage, onChange: lp.setFilter('stage'), options: STAGES }] : []),
    ...((branches.data?.length ?? 0) > 1 ? [{ key: 'branch', label: 'شعبه', value: branchId, onChange: lp.setFilter('branch'), options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) }] : []),
  ];
  const extraActive = !!(requesterId || itemId || df || dt);
  const active = !!dq || filters.some((f) => f.value) || extraActive;

  const doExport = async () => {
    setExporting(true);
    try { await exportRequests(filtered); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };
  const canAssignRow = (r: SupplyRequest) => r.lifecycle === 'AWAITING_SUPPLIER' && can('supply.supply_requests.update');
  const dash = <span className={s.muted}>—</span>;

  const orderAll: Column<SupplyRequest>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'date', header: 'تاریخ', render: (r) => faDate(r.request_date) },
    { key: 'no', header: 'شماره', code: true, render: (r) => <span data-latin>{r.request_no}</span> },
    { key: 'due', header: 'موعد تحویل', render: (r) => (r.delivery_due ? <span className={s.nowrap}>{faDate(r.delivery_due)}{r.is_late ? <span className={s.lateTag}>تأخیر</span> : null}</span> : dash) },
    { key: 'valid', header: 'تاریخ اعتبار', render: (r) => (r.valid_until ? faDate(r.valid_until) : dash) },
    { key: 'requester', header: 'سفارش‌دهنده', render: (r) => <span className={s.strong}>{personName(r.requester)}</span> },
    { key: 'role', header: 'نقش سفارش‌دهنده', render: (r) => personRoles(r.requester) || dash },
    { key: 'lines', header: 'تعداد اقلام', render: (r) => faNum(r.line_count) },
    { key: 'votes', header: 'آرا', render: (r) => <button type="button" className={s.cellBtn} aria-haspopup="dialog" aria-label={`آرای ${r.request_no}`} onClick={(e) => { e.stopPropagation(); setCellModal({ kind: 'votes', id: r.id }); }}>{faNum(r.vote_count)} رأی</button> },
    { key: 'deposit', header: 'بیعانه', render: (r) => (isCustomerRequest(r)
      ? <button type="button" className={s.cellBtn} aria-haspopup="dialog" aria-label={`بیعانه‌ی ${r.request_no}`} onClick={(e) => { e.stopPropagation(); setCellModal({ kind: 'deposit', id: r.id }); }}>{r.deposit_amount == null ? 'تعیین نشده' : <span className="tnum">{faNum(int(r.deposit_amount))}</span>}</button>
      : <span className={s.muted}>بدون بیعانه</span>) },
    { key: 'target', header: 'تارگت فروش', render: (r) => (r.target_days ? `${faNum(r.target_days)} روز` : dash) },
    { key: 'total', header: <UnitHead>مبلغ کل</UnitHead>, render: (r) => <span className={s.nowrap}><span className={`tnum ${s.strong}`}>{faNum(int(r.total))}</span>{r.has_unpriced_lines ? <span className={s.unpriced} data-tip="دست‌کم یک ردیف فی ندارد و در جمع حساب نشده است">فی ناقص</span> : null}</span> },
    { key: 'stage', header: 'مرحله', render: (r) => <button type="button" className={s.stageBtn} aria-haspopup="dialog" aria-label={`مسیر ${r.request_no}`} data-tip="دیدن همه‌ی مرحله‌ها" onClick={(e) => { e.stopPropagation(); setCellModal({ kind: 'stage', id: r.id }); }}><Badge tone={LIFECYCLE_TONE[r.lifecycle] ?? 'neutral'}>{r.lifecycle_display}</Badge>{r.is_late ? <span className={s.lateTag}>تأخیر</span> : null}</button> },
    { key: 'finance', header: 'وضعیت مالی', render: (r) => (isCustomerRequest(r)
      ? <button type="button" className={s.cellBtn} aria-haspopup="dialog" aria-label={`وضعیت مالی ${r.request_no}`} onClick={(e) => { e.stopPropagation(); setCellModal({ kind: 'finance', id: r.id }); }}><Badge tone={toneOf(STAGE_STATUS, r.finance_approval_status)}>{labelOf(STAGE_STATUS, r.finance_approval_status)}</Badge></button>
      : <span className={s.muted}>لازم نیست</span>) },
    { key: 'supplier', header: 'تأمین‌کننده و انبار', render: (r) => (r.supplier ? <span className={s.nameStack}><b>{r.supplier.name}</b><small>{r.destination_warehouse?.name ?? ''}</small></span> : dash) },
    { key: 'advice', header: 'شماره اعلامیه', code: true, render: (r) => (r.advice_no ? <span data-latin>{r.advice_no}</span> : dash) },
    {
      key: 'acts', header: 'عملیات',
      render: (r) => (
        <span className={s.rowActions}>
          <IconButton label={`جزئیات ${r.request_no}`} onClick={() => setOpenId(r.id)}><IconEye size={16} /></IconButton>
          {canAssignRow(r) ? <IconButton label={`تعیین تأمین‌کننده ${r.request_no}`} onClick={() => setAssigning(r)}><IconTruckDelivery size={16} /></IconButton> : null}
        </span>
      ),
    },
  ];
  const onlyApproved = new Set(['supplier', 'advice']);
  const orderCols = orderAll.filter((col) => prefs.isVisible(col.key) && (!onlyApproved.has(col.key) || (status !== 'OPEN' && status !== 'REJECTED')));

  const itemCols: Column<RequestByItem>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'code', header: 'کد کالا', code: true, render: (x) => (x.item ? <span data-latin>{x.item.code}</span> : dash) },
    { key: 'main', header: 'دسته اصلی', render: (x) => splitPath(x.item?.category_path)[0] || dash },
    { key: 'mid', header: 'دسته میانی', render: (x) => splitPath(x.item?.category_path)[1] || dash },
    { key: 'sub', header: 'دسته فرعی', render: (x) => splitPath(x.item?.category_path)[2] || dash },
    { key: 'name', header: 'نام کالا', render: (x) => <span className={s.strong}>{x.item?.display_name ?? 'کالای موقت'}</span> },
    { key: 'unit', header: 'واحد اصلی', render: (x) => x.item?.unit_name || dash },
    { key: 'sale', header: 'واحد فروش', render: (x) => <SaleUnits item={x.item} /> },
    { key: 'qty', header: 'تعداد تجمیعی', render: (x) => <span className="tnum">{faNum(int(x.quantity))}</span> },
    { key: 'count', header: 'تعداد درخواست تأمین', render: (x) => faNum(x.request_count) },
    { key: 'total', header: <UnitHead>مبلغ کل</UnitHead>, render: (x) => <span className={`tnum ${s.strong}`}>{faNum(int(x.total))}</span> },
    {
      key: 'acts', header: 'عملیات',
      render: (x) => (
        <span className={s.rowActions}>
          {x.item ? <IconButton label={`درخواست‌های تأمین ${x.item.display_name}`} onClick={() => setItemGroup(x)}><IconEye size={16} /></IconButton> : null}
          {x.item && status === 'APPROVED' && can('supply.supply_requests.update')
            ? <IconButton label={`تعیین تأمین‌کننده برای همه‌ی درخواست‌های تأمین ${x.item.display_name}`} onClick={() => setItemAssign(x)}><IconTruckDelivery size={16} /></IconButton> : null}
        </span>
      ),
    },
  ];

  const emptyOrder = (
    <Empty icon={<IconClipboardList size={26} stroke={1.5} />} title={active ? 'درخواست تأمینی با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز درخواست تأمینی ثبت نشده است'}
      text={active ? undefined : 'درخواست‌های تأمین بعد از ثبت، برای رأی شورای تأمین و تصمیم در این فهرست می‌آیند.'} />
  );
  const pickerChip = (key: 'requester' | 'item', label: string, value: string, name: string, icon: ReactNode) => (
    <span className={s.pickChip}>
      <button type="button" className={`${s.pickChipBtn} ${value ? s.pickChipOn : ''}`} onClick={() => setPicker(key)} aria-haspopup="dialog">
        {icon}<span className={s.pickChipLabel}>{label}</span><b>{value ? name || 'انتخاب‌شده' : 'همه'}</b>
      </button>
      {value ? <button type="button" className={s.pickChipClear} aria-label={`برداشتن فیلتر ${label}`} onClick={() => lp.set({ [key]: null, [`${key}_name`]: null })}><IconX size={14} /></button> : null}
    </span>
  );
  const closeCreate = (createdId?: string) => navigate(createdId ? `/supply/supply-requests?open=${createdId}` : '/supply/supply-requests', { replace: true });

  return (
    <>
      <PageHead actions={<>
        {can('supply.supply_requests.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} loading={exporting} onClick={doExport}>خروجی اکسل</Button> : null}
        {can('supply.supply_requests.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/supply/supply-requests/new')}>درخواست تأمین جدید</Button> : null}
      </>} />
      <div className={s.kpis}>
        <Kpi icon={<IconClipboardList size={20} />} tone={s.tBlue} label="کل درخواست‌های تأمین" value={allCount} />
        <Kpi icon={<IconHourglass size={20} />} tone={s.tAmber} label="در انتظار" value={c?.OPEN} />
        <Kpi icon={<IconCircleCheck size={20} />} tone={s.tGreen} label="تأیید شده" value={c?.APPROVED} />
        <Kpi icon={<IconCircleX size={20} />} tone={s.tRose} label="رد شده" value={c?.REJECTED} />
      </div>
      <Card>
        <div className={s.listHead}>
          <Segmented value={view} onChange={(v) => lp.set({ view: v === 'order' ? null : v })}
            options={[{ value: 'order', label: 'بر اساس سفارش' }, { value: 'item', label: 'بر اساس کالا' }]} />
        </div>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: شماره، دلایل، تأمین‌کننده، کد یا نام کالا" filters={filters}
          extra={<>
            {can('identity.users.list') ? pickerChip('requester', 'سفارش‌دهنده', requesterId, lp.get('requester_name'), <IconUserSearch size={16} />) : null}
            {pickerChip('item', 'کالا', itemId, lp.get('item_name'), <IconPackage size={16} />)}
            <DateFilter label="از تاریخ" value={df} onChange={(v) => lp.set({ df: v || null })} />
            <DateFilter label="تا تاریخ" value={dt} onChange={(v) => lp.set({ dt: v || null })} />
            {view === 'order' ? <ColumnPicker {...prefs} /> : null}
          </>}
          extraActive={extraActive} onReset={() => lp.set({ requester: null, requester_name: null, item: null, item_name: null, df: null, dt: null })}
          count={countText} />
        {view === 'order' ? (
          <>
            <DataTable columns={orderCols} rows={orders.data?.results} rowKey={(r) => r.id} loading={orders.isLoading} error={orders.error}
              onRetry={() => orders.refetch()} onRowClick={can('supply.supply_requests.read') ? (r) => setOpenId(r.id) : undefined} empty={emptyOrder} />
            {orderTotal ? <Pagination page={lp.page} pageSize={lp.pageSize} total={orderTotal} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
          </>
        ) : (
          <>
            <DataTable columns={itemCols} rows={byItem.data?.results} rowKey={(x) => x.item?.id ?? 'temp'} loading={byItem.isLoading} error={byItem.error}
              onRetry={() => byItem.refetch()} empty={emptyOrder} />
            {itemTotal ? <Pagination page={lp.page} pageSize={lp.pageSize} total={itemTotal} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
          </>
        )}
      </Card>

      <RequestDetailModal id={openId} onClose={() => setOpenId(null)} />
      {creating ? <RequestDrawer request={null} onClose={() => closeCreate()} onSaved={(r) => closeCreate(r.id)} /> : null}
      {assigning ? <AssignSupplierModal title={`تعیین تأمین‌کننده — ${assigning.request_no}`} onClose={() => setAssigning(null)}
        defaults={{ supplier: assigning.supplier?.id ?? '', warehouse: assigning.destination_warehouse?.id ?? '' }}
        onSubmit={async (supplier_id, warehouse_id) => { await w.assign.mutateAsync({ rid: assigning.id, supplier_id, warehouse_id }); toast(`تأمین‌کننده‌ی درخواست تأمین ${assigning.request_no} تعیین شد.`); }} /> : null}
      {itemAssign?.item ? <AssignSupplierModal title={`تعیین تأمین‌کننده برای همه — ${itemAssign.item.display_name}`} onClose={() => setItemAssign(null)}
        onSubmit={async (supplier_id, warehouse_id) => {
          const rows = await w.assignByItem.mutateAsync({ item_id: itemAssign.item!.id, supplier_id, warehouse_id });
          toast(`تأمین‌کننده و انبار ${faNum(rows.length)} درخواست تأمین تعیین شد.`);
        }} /> : null}
      {itemGroup?.item ? <ItemRequestsModal row={itemGroup} base={filtered} onClose={() => setItemGroup(null)} onOpen={(id) => { setItemGroup(null); setOpenId(id); }} /> : null}
      {picker === 'requester' ? <StaffPicker title="انتخاب سفارش‌دهنده" onClose={() => setPicker(null)} onPick={(id, name) => { lp.set({ requester: id, requester_name: name }); setPicker(null); }} /> : null}
      {cellModal?.kind === 'stage' ? <StageModal id={cellModal.id} onClose={() => setCellModal(null)} /> : null}
      {cellModal?.kind === 'votes' ? <VotesModal id={cellModal.id} onClose={() => setCellModal(null)} /> : null}
      {cellModal?.kind === 'deposit' ? <DepositModal id={cellModal.id} onClose={() => setCellModal(null)} /> : null}
      {cellModal?.kind === 'finance' ? <FinanceModal id={cellModal.id} onClose={() => setCellModal(null)} /> : null}
      {picker === 'item' ? <RequestItemFilterModal base={filtered} onClose={() => setPicker(null)}
        onPick={(id, name) => { lp.set({ item: id, item_name: name }); setPicker(null); }} /> : null}
    </>
  );
}

function Kpi({ icon, tone, label, value }: { icon: ReactNode; tone: string | undefined; label: string; value: number | undefined }) {
  return (
    <Card className={s.kpi}>
      <span className={`${s.kpiIcon} ${tone ?? ''}`}>{icon}</span>
      <span className={s.kpiText}><small>{label}</small><b>{value === undefined ? '…' : faNum(value)}</b></span>
    </Card>
  );
}

/** درخواست‌های تأمین یک کالا در نمای «بر اساس کالا» (html «جزئیات سفارش‌ها»): همان فیلترها + item_id */
function ItemRequestsModal({ row, base, onClose, onOpen }: { row: RequestByItem; base: ListParams; onClose: () => void; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const p = { ...base, item_id: row.item?.id };
  const server = useRequests({ ...p, page, page_size: DETAIL_PAGE_SIZE });
  const total = server.data?.total ?? 0;
  const lineOf = (r: SupplyRequest) => r.lines?.find((l) => l.item?.id === row.item?.id);
  const cols: Column<SupplyRequest>[] = [
    { key: 'no', header: 'شماره', code: true, render: (r) => <span data-latin>{r.request_no}</span> },
    { key: 'date', header: 'تاریخ', render: (r) => faDate(r.request_date) },
    { key: 'by', header: 'سفارش‌دهنده', render: (r) => personName(r.requester) },
    { key: 'qty', header: 'تعداد این کالا', render: (r) => { const l = lineOf(r); return l ? faNum(int(l.quantity)) : <span className={s.muted}>—</span>; } },
    { key: 'total', header: <UnitHead>مبلغ کل درخواست تأمین</UnitHead>, render: (r) => <span className="tnum">{faNum(int(r.total))}</span> },
    { key: 'supply', header: 'وضعیت تأمین', render: (r) => <Badge tone={toneOf(STAGE_STATUS, r.approval_status)}>{labelOf(STAGE_STATUS, r.approval_status)}</Badge> },
    { key: 'supplier', header: 'تأمین‌کننده', render: (r) => r.supplier?.name ?? <span className={s.muted}>—</span> },
  ];
  return (
    <Modal open onClose={onClose} width={BY_ITEM_WIDTH} title={`درخواست‌های تأمین ${row.item?.display_name ?? ''}`}>
      <p className={s.modalIntro}><span data-latin>{row.item?.code}</span> · تعداد تجمیعی {faNum(int(row.quantity))} · {faNum(row.request_count)} درخواست تأمین</p>
      <DataTable columns={cols} rows={server.data?.results} rowKey={(r) => r.id} loading={server.isLoading} error={server.error}
        onRetry={() => { void server.refetch(); }} onRowClick={(r) => onOpen(r.id)} empty={<Empty title="درخواست تأمینی پیدا نشد" />} />
      {total > DETAIL_PAGE_SIZE ? <Pagination page={page} pageSize={DETAIL_PAGE_SIZE} total={total} onPage={setPage} /> : null}
    </Modal>
  );
}
