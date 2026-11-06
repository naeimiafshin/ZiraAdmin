import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconArchive, IconEye, IconFileCheck, IconFilter, IconPencil, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { faDate, faNum } from '@/shared/lib/format';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { Dropdown } from '@/shared/ui/Dropdown';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import { SoonTag } from '@/features/branches/SoonTag';
import { useAllWarehouses } from '@/features/branches/transfers';
import { money, staffName, useStaffOptions, type SalesListParams } from '../api/common';
import { exportInvoices, useInvoiceCounts, useInvoices, type Invoice, type InvoiceCounts } from '../api/invoices';
import { ICON, MultiFilter, PickChip } from '../components';
import h from '../h.module.css';
import { ItemPickerModal } from '../ItemPicker';
import { DELIVERY_TYPE, INVOICE_TABS, keysOf, labelOf, SETTLEMENT_METHOD, SETTLEMENT_STATUS, SOURCE_TYPE, type InvoiceTab } from '../labels';
import { CustAvatar, CustomerSelect, HField, HTable, MiniPager, Pill, SearchBox, SegTabs, type HCol, type PillTone } from '../ui';
import { InvoiceDetailModal } from './InvoiceDetail';

/**
 * «لیست فاکتورهای فروش» — GET /sales/invoices (+ status-counts، export). ظاهر دقیقاً html «INVOICE LIST» (افشین ۱۴ آبان ۱۴۰۵):
 * سرصفحه با عنوان و توضیح، جست‌وجو و تب‌های قرصی با شمارنده، کارت جدول با ستون‌های html (آواتار مشتری، قرص وضعیت تسویه،
 * دکمه‌ی آبی «جزییات»، ویرایش و ابطال در «عملیات») و نوار پایین «نمایش … فاکتور» و «جمع مبالغ».
 * تفاوت‌ها با html به‌خاطر بک‌اند و تصمیم‌های افشین (۱۳ آبان ۱۴۰۵):
 * - تب‌های «پیش‌نویس‌ها» و «بایگانی» (بک‌اند پیش‌نویس و بایگانی دارد)؛ عدد هر تب از status-counts با همان فیلترها.
 * - همه‌ی فیلترهای بک‌اند (مشتری، کالا، وضعیت تسویه چندتایی، نحوه تسویه، نوع تحویل، فروشنده، انبار، منبع سند، شعبه، بازه‌ی تاریخ)
 *   در پنل جمع‌شونده‌ی «فیلترها» تا نوار html همان جست‌وجو و تب بماند؛ همه در آدرس صفحه.
 * - «جمع مبالغ»: بک‌اند جمع کل فیلترشده نمی‌دهد ⇐ «به‌زودی»، نه جمع صفحه (کمبود SL-02).
 * - «ابطال» در «عملیات» برگه‌ی فاکتور را با پنجره‌ی دلیل ابطال باز می‌کند؛ پیش‌نویس ابطال ندارد.
 */
const PAGE_SIZE = 20;
const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'no', label: 'شماره', fixed: true },
  { key: 'date', label: 'تاریخ' },
  { key: 'ccode', label: 'کد مشتری' },
  { key: 'cname', label: 'نام مشتری', fixed: true },
  { key: 'delivery', label: 'نوع تحویل' },
  { key: 'issuer', label: 'صادرکننده' },
  { key: 'method', label: 'نحوه تسویه' },
  { key: 'seller', label: 'فروشنده' },
  { key: 'wh', label: 'انبار تحویل' },
  { key: 'source', label: 'منبع سند' },
  { key: 'outstanding', label: 'مانده' },
  { key: 'total', label: 'مبلغ کل' },
  { key: 'status', label: 'وضعیت تسویه' },
  { key: 'detail', label: 'جزییات', fixed: true },
  { key: 'acts', label: 'عملیات', fixed: true },
];
const DEFAULT_HIDDEN = ['method', 'seller', 'wh', 'source', 'outstanding'];
/** پهنای ستون‌های html (grid-template-columns) و ستون‌های اضافه */
const WIDTH: Record<string, string> = {
  row: '40px', no: '116px', date: '84px', ccode: '92px', cname: 'minmax(120px,1.4fr)', delivery: '116px', issuer: '92px', method: '96px',
  seller: '110px', wh: '130px', source: '130px', outstanding: '120px', total: '118px', status: '106px', detail: '78px', acts: '74px',
};
const w = (k: string) => WIDTH[k] ?? '120px';
// First pixel number of a track: matches "190" in "minmax(190px,1.4fr)" and "56" in "56px"; "1.4fr" alone has no px. https://regex101.com/?regex=(%5Cd%2B)px&testString=minmax(190px%2C1.4fr)
const PX_RE = /(\d+)px/;
const minPx = (k: string) => Number(PX_RE.exec(w(k))?.[1] ?? 0);
/** جدول در عرض محتوای پنل (۱۴۴۰ با سایدبار) بدون اسکرول جا شود؛ ستون‌های اضافه‌ی انتخابی اسکرول افقی می‌دهند */
const HTML_MIN_WIDTH = 1040;
const isTab = (v: string): v is InvoiceTab => INVOICE_TABS.some((t) => t.value === v);
const TAB_COUNT: Record<InvoiceTab, (c: InvoiceCounts) => number> = {
  ALL: (c) => c.ALL, DRAFT: (c) => c.DRAFT, OPEN: (c) => c.OPEN, SETTLED: (c) => c.SETTLED, VOIDED: (c) => c.VOIDED, ARCHIVED: (c) => c.ARCHIVED,
};
const SEP = ',';
const FILTER_KEYS = ['customer', 'item', 'sst', 'method', 'delivery', 'seller', 'wh', 'source', 'branch', 'df', 'dt'] as const;
const opts = <K extends string>(m: Record<K, string | { label: string }>) => keysOf(m).map((v) => ({ value: v, label: labelOf(m, v) }));
const ALL_OPT = { value: '', label: 'همه' };

/** قرص وضعیت ردیف (رنگ‌های html: پیش‌نویس و در انتظار کهربایی، تسویه شد سبز، جزئی آبی، ابطال قرمز) */
const SETTLE_PILL: Record<Invoice['settlement_status'], { label: string; tone: PillTone }> = {
  UNSETTLED: { label: 'در انتظار', tone: 'warn' },
  PARTIAL: { label: 'تسویه جزئی', tone: 'info' },
  SETTLED: { label: 'تسویه شد', tone: 'ok' },
};
export function invoicePill(x: Pick<Invoice, 'status' | 'settlement_status'>): { label: string; tone: PillTone } {
  if (x.status === 'DRAFT') return { label: 'پیش‌نویس', tone: 'warn' };
  if (x.status === 'VOIDED') return { label: 'ابطال شده', tone: 'danger' };
  return SETTLE_PILL[x.settlement_status];
}

export default function InvoiceListPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);
  const tab: InvoiceTab = isTab(lp.tab) ? lp.tab : 'ALL';
  const g = lp.get;
  const settleSt = g('sst') ? g('sst').split(SEP) : [];
  const openId = g('open') || null;
  const branches = useBranchOptions();
  const whs = useAllWarehouses(can('organization.warehouses.list'));
  const staff = useStaffOptions('', can('identity.users.list'));
  const prefs = useColumnPrefs('sales.invoices', COLS, DEFAULT_HIDDEN);
  const activeFilters = FILTER_KEYS.filter((k) => !!g(k)).length;
  const [showFilters, setShowFilters] = useState(activeFilters > 0);
  const [pickingItem, setPickingItem] = useState(false);
  const [exporting, setExporting] = useState(false);

  const base: SalesListParams = {
    query: dq || undefined, customer_id: g('customer') || undefined, settlement_method: g('method') || undefined, delivery_type: g('delivery') || undefined,
    date_from: g('df') || undefined, date_to: g('dt') || undefined, salesperson_id: g('seller') || undefined, warehouse_id: g('wh') || undefined,
    item_id: g('item') || undefined, source_type: g('source') || undefined, settlement_status: settleSt.length ? settleSt : undefined, branch_id: g('branch') || undefined,
  };
  const filtered: SalesListParams = { ...base, tab };
  const list = useInvoices({ ...filtered, page: lp.page, page_size: lp.pageSize });
  const counts = useInvoiceCounts(base);
  const c = counts.data;
  const setOpen = (id: string | null) => lp.set({ open: id }, { keepPage: true });

  const doExport = async () => {
    setExporting(true);
    try { await exportInvoices(filtered); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };
  const voided = (x: Invoice) => x.status === 'VOIDED';
  const custName = (x: Invoice) => x.customer?.store_name || x.customer?.full_name || '—';
  const dash = <span className={h.dim}>—</span>;
  const editWhy = (x: Invoice) => (x.status === 'DRAFT' ? null : 'فقط پیش‌نویس ویرایش می‌شود؛ فاکتور صادرشده با «اصلاحیه» در برگه‌ی فاکتور.');
  const voidWhy = (x: Invoice): string | null => {
    if (x.status === 'VOIDED') return 'این فاکتور قبلاً ابطال شده است';
    if (x.status === 'DRAFT') return 'پیش‌نویس صادر نشده و ابطال ندارد؛ کافی است صادرش نکنید.';
    return x.can_void ? null : 'فاکتوری که تسویه‌ی ثبت‌شده، برگشتی در جریان یا خروج کالا دارد ابطال نمی‌شود.';
  };
  const act = (label: string, why: string | null, icon: ReactNode, onClick: () => void, danger?: boolean) => (
    <span data-tip={why ?? label}>
      <button type="button" className={`${h.actBtn} ${danger ? h.actDanger : ''}`} aria-label={label} disabled={!!why} onClick={(e) => { e.stopPropagation(); onClick(); }}>{icon}</button>
    </span>
  );
  const statusCell = (x: Invoice) => {
    const p = invoicePill(x);
    return (
      <span className={h.pills}>
        <Pill tone={p.tone}>{p.label}</Pill>
        {x.is_overdue && x.status === 'ISSUED' ? <Pill tone="danger">سررسید گذشته</Pill> : null}
        {x.archived_at ? <Pill tone="neutral">بایگانی</Pill> : null}
      </span>
    );
  };

  const all: HCol<Invoice>[] = [
    { key: 'row', header: 'ردیف', width: w('row'), align: 'c', render: (_, i) => <span className={h.idx}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'no', header: 'شماره', width: w('no'), render: (x) => (x.invoice_number
      ? <span dir="ltr" data-latin className={`${h.no} ${voided(x) ? h.strike : ''}`}>{x.invoice_number}</span>
      : <span className={h.draftNo}>پیش‌نویس</span>) },
    { key: 'date', header: 'تاریخ', width: w('date'), render: (x) => <span className={h.muted}>{faDate(x.date)}</span> },
    { key: 'ccode', header: 'کد مشتری', width: w('ccode'), render: (x) => (x.customer?.code ? <span dir="ltr" data-latin className={h.faint}>{x.customer.code}</span> : dash) },
    { key: 'cname', header: 'نام مشتری', width: w('cname'), render: (x) => (
      <span className={h.nameCell}><CustAvatar seed={x.customer?.code ?? x.id} name={custName(x)} /><span className={h.nameTxt}>{custName(x)}</span></span>
    ) },
    { key: 'delivery', header: 'نوع تحویل', width: w('delivery'), render: (x) => <span className={`${h.muted} ${h.nowrap}`}>{x.delivery_type_display || DELIVERY_TYPE[x.delivery_type]}</span> },
    { key: 'issuer', header: 'صادرکننده', width: w('issuer'), render: (x) => <span className={`${h.muted} ${h.nowrap}`}>{x.issuer?.full_name || '—'}</span> },
    { key: 'method', header: 'نحوه تسویه', width: w('method'), render: (x) => <span className={h.muted}>{x.settlement_method_display || SETTLEMENT_METHOD[x.settlement_method]}</span> },
    { key: 'seller', header: 'فروشنده', width: w('seller'), render: (x) => <span className={`${h.muted} ${h.nowrap}`}>{x.salesperson?.full_name || '—'}</span> },
    { key: 'wh', header: 'انبار تحویل', width: w('wh'), render: (x) => <span className={h.muted}>{x.delivery_warehouse?.name || '—'}</span> },
    { key: 'source', header: 'منبع سند', width: w('source'), render: (x) => <span className={h.muted}>{SOURCE_TYPE[x.source_type]}{x.source_no ? <> <span data-latin>{x.source_no}</span></> : null}</span> },
    { key: 'outstanding', header: 'مانده (ریال)', width: w('outstanding'), align: 'l', render: (x) => (x.status === 'ISSUED' ? <span className="tnum">{money(x.outstanding)}</span> : dash) },
    { key: 'total', header: 'مبلغ کل (ریال)', width: w('total'), align: 'l', render: (x) => <span className={`tnum ${h.amount}`}>{money(x.total_amount)}</span> },
    { key: 'status', header: 'وضعیت تسویه', width: w('status'), align: 'c', render: statusCell },
    { key: 'detail', header: 'جزییات', width: w('detail'), align: 'c', tight: true, render: (x) => (can('sales.invoices.read')
      ? <button type="button" className={h.detailBtn} title="مشاهده فاکتور" onClick={(e) => { e.stopPropagation(); setOpen(x.id); }}><IconEye size={15} stroke={1.9} />جزییات</button>
      : dash) },
    { key: 'acts', header: 'عملیات', width: w('acts'), align: 'c', tight: true, render: (x) => (
      <>
        {can('sales.invoices.update') ? act(`ویرایش ${x.invoice_number ?? 'پیش‌نویس'}`, editWhy(x), <IconPencil size={16} stroke={1.9} />, () => navigate(`/sales/invoices/${x.id}/edit`)) : null}
        {can('sales.invoices.void.approve') ? act(`ابطال (آرشیو) ${x.invoice_number ?? ''}`, voidWhy(x), <IconArchive size={16} stroke={1.9} />, () => lp.set({ open: x.id, act: 'void' }, { keepPage: true }), true) : null}
      </>
    ) },
  ];
  const cols = all.filter((col) => prefs.isVisible(col.key));
  const minWidth = Math.max(HTML_MIN_WIDTH, cols.reduce((a, col) => a + minPx(col.key), 0));
  const searching = !!dq || activeFilters > 0;
  const emptyText = searching ? 'فاکتوری یافت نشد' : 'فاکتوری در این وضعیت نیست';
  const clearFilters = () => lp.set(Object.fromEntries([...FILTER_KEYS, 'customer_name', 'customer_code', 'item_name'].map((k) => [k, null])));
  const dd = (key: string, label: string, options: { value: string; label: string }[]) => (
    <HField label={label}>
      <Dropdown aria-label={label} buttonClassName={h.dd} value={g(key)} placeholder="همه" options={[ALL_OPT, ...options]} onChange={(e) => lp.set({ [key]: e.target.value || null })} />
    </HField>
  );
  let shownInfo = '';
  if (list.data) shownInfo = list.data.total > list.data.results.length ? `نمایش ${faNum(list.data.results.length)} از ${faNum(list.data.total)} فاکتور` : `نمایش ${faNum(list.data.total)} فاکتور`;

  return (
    <>
      <div className={h.top}>
        <div>
          <h1 className={h.h1}>لیست فاکتورهای فروش</h1>
          <p className={h.sub}>فاکتورهای قطعی صادرشده برای مشتریان عمده، وضعیت تسویه و ابطال</p>
        </div>
        <div className={h.actions}>
          {can('sales.invoices.export') ? <button type="button" className={h.btnGhost} onClick={doExport} disabled={exporting}><IconFileCheck size={16} stroke={1.8} />{exporting ? 'در حال آماده‌سازی…' : 'خروجی اکسل'}</button> : null}
          {can('sales.invoices.create') ? <button type="button" className={h.btnPrimary} onClick={() => navigate('/sales/invoices/new')}><span className={h.plus}>+</span>فاکتور فروش جدید</button> : null}
        </div>
      </div>

      <div className={h.toolbar}>
        <SearchBox value={text} onChange={setText} placeholder="جستجو بر اساس شماره، کد یا نام مشتری…" />
        <SegTabs value={tab} onChange={(t) => lp.set({ tab: t === 'ALL' ? null : t })} options={INVOICE_TABS.map((t) => ({ value: t.value, label: t.label, count: c ? TAB_COUNT[t.value](c) : null }))} />
        <div className={h.toolEnd}>
          <button type="button" className={`${h.toolBtn} ${showFilters || activeFilters ? h.toolBtnOn : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            <IconFilter size={ICON} stroke={1.8} />فیلترها{activeFilters ? <span className={h.toolBadge}>{faNum(activeFilters)}</span> : null}
          </button>
          <ColumnPicker {...prefs} />
        </div>
      </div>

      {showFilters ? (
        <div className={h.filters}>
          <HField label="مشتری">
            <CustomerSelect forFilter allowed={can('customers.profiles.list')} show="name" label="فیلتر مشتری" placeholder="همه مشتریان"
              value={g('customer') ? { id: g('customer'), code: g('customer_code'), name: g('customer_name') || 'انتخاب‌شده' } : null}
              onPick={(x) => lp.set({ customer: x.id, customer_name: x.store_name || x.full_name, customer_code: x.code })} />
          </HField>
          <HField label="کالا">
            <PickChip label="کالا" icon={null} value={g('item') ? g('item_name') || 'انتخاب‌شده' : ''} onOpen={() => setPickingItem(true)} onClear={() => lp.set({ item: null, item_name: null })} />
          </HField>
          <HField label="وضعیت تسویه">
            <MultiFilter label="وضعیت تسویه" value={settleSt} options={opts(SETTLEMENT_STATUS)} onChange={(v) => lp.set({ sst: v.join(SEP) || null })} />
          </HField>
          {dd('method', 'نحوه تسویه', opts(SETTLEMENT_METHOD))}
          {dd('delivery', 'نوع تحویل', opts(DELIVERY_TYPE))}
          {staff.data ? dd('seller', 'فروشنده', staff.data.results.map((u) => ({ value: u.id, label: staffName(u) }))) : null}
          {whs.data ? dd('wh', 'انبار', whs.data.map((x) => ({ value: x.id, label: x.name }))) : null}
          {dd('source', 'منبع سند', opts(SOURCE_TYPE))}
          {(branches.data?.length ?? 0) > 1 ? dd('branch', 'شعبه', (branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))) : null}
          <HField label="از تاریخ"><DateFilter label="از تاریخ" value={g('df')} onChange={(v) => lp.set({ df: v || null })} /></HField>
          <HField label="تا تاریخ"><DateFilter label="تا تاریخ" value={g('dt')} onChange={(v) => lp.set({ dt: v || null })} /></HField>
          <div className={h.filtersFoot}>
            <button type="button" className={h.linkBtn} disabled={!activeFilters} onClick={clearFilters}><IconX size={13} /> پاک کردن فیلترها{activeFilters ? ` (${faNum(activeFilters)})` : ''}</button>
          </div>
        </div>
      ) : null}

      <HTable cols={cols} rows={list.data?.results} rowKey={(x) => x.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} empty={emptyText}
        minWidth={minWidth} rowClass={(x) => (voided(x) ? h.dim : undefined)}
        foot={<>
          <span>{shownInfo}</span>
          <MiniPager page={lp.page} pageSize={lp.pageSize} total={list.data?.total ?? 0} onPage={lp.setPage} />
          <span data-tip="بک‌اند جمع مبالغ همه‌ی فاکتورهای فیلترشده را نمی‌دهد؛ جمع صفحه‌ی جاری گمراه‌کننده است.">جمع مبالغ (بدون ابطالی): <b>—</b> ریال <SoonTag tip="به‌زودی — بعد از افزودن جمع کل به فهرست در بک‌اند" /></span>
        </>} />

      <InvoiceDetailModal id={openId} initialAct={g('act') === 'void' ? 'void' : null} onClose={() => lp.set({ open: null, act: null }, { keepPage: true })} />
      <ItemPickerModal open={pickingItem} single title="فیلتر بر اساس کالا" onClose={() => setPickingItem(false)}
        onAdd={(rows) => { const first = rows[0]; if (first) lp.set({ item: first.item.id, item_name: first.item.display_name }); setPickingItem(false); }} />
    </>
  );
}
