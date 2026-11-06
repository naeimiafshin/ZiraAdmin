import { useState, type ReactNode } from 'react';
import { IconArrowDownLeft, IconArrowUpRight, IconChartLine, IconChevronLeft, IconFileSpreadsheet, IconFileText, IconListDetails, IconPrinter } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, faTime, gregorianToJalaliText } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, Modal, PageHead, Pagination, SkeletonRows, type Tone } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { fetchAll } from '@/features/users/api';
import { downloadXlsx, useUnits } from '@/features/catalog/api';
import { useBranch } from './api';
import { useAllWarehouses } from './transfers';
import { DateFilter } from './DateFilter';
import { SoonTag } from './SoonTag';
import s from './branches.module.css';

type Movement = AdminSchemas['MovementOut'];
type SummaryRow = AdminSchemas['SummaryRowOut'];
type MType = AdminSchemas['MovementTypeEnum'];

/** برچسب‌ها همان TextChoices مدل `wms.StockMovement.Type` (در این صفحه «نوع سند»، افشین 2026-10-25) */
const MOVE: Record<MType, { label: string; tone: Tone }> = {
  OPENING: { label: 'موجودی اول دوره', tone: 'neutral' },
  RECEIPT: { label: 'رسید انبار', tone: 'success' },
  ISSUE: { label: 'خروج کالا', tone: 'danger' },
  TRANSFER_OUT: { label: 'ارسال انتقال', tone: 'info' },
  TRANSFER_IN: { label: 'دریافت انتقال', tone: 'info' },
  CUSTOMER_RETURN: { label: 'مرجوعی مشتری', tone: 'brand' },
  RETURN_OUT: { label: 'برگشت به تأمین‌کننده', tone: 'brand' },
  SCRAP: { label: 'ضایعات', tone: 'warning' },
  COUNT_ADJUSTMENT: { label: 'اصلاح انبارگردانی', tone: 'neutral' },
  ITEM_BREAK_OUT: { label: 'شکستن آیتم (خروج)', tone: 'neutral' },
  ITEM_BREAK_IN: { label: 'شکستن آیتم (ورود اجزا)', tone: 'neutral' },
  ITEM_ASSEMBLE_OUT: { label: 'ساخت آیتم (خروج اجزا)', tone: 'neutral' },
  ITEM_ASSEMBLE_IN: { label: 'ساخت آیتم (ورود)', tone: 'neutral' },
  GRADE_OUT: { label: 'تغییر گرید (خروج)', tone: 'neutral' },
  GRADE_IN: { label: 'تغییر گرید (ورود)', tone: 'neutral' },
};

type Q = Record<string, string | number | boolean | undefined>;
const n = (v: unknown) => Number(v ?? 0);
const net = (i: number, o: number) => `${i - o >= 0 ? 'افزایش' : 'کاهش'} ${faNum(Math.abs(i - o))} واحد`;

/**
 * گردش کالا — html Fixed «Branch Management» (کاردکس ورود و خروج کالا) روی wms فعلی (افشین 2026-10-25):
 * ۴ شاخص (تعداد اسناد گردش، مجموع ورود، مجموع خروج، خالص گردش دوره)، فیلترها (شعبه، انبار بر اساس شعبه، نوع سند، از/تا تاریخ، جست‌وجو)،
 * جدول (ردیف، شماره سند، تاریخ، نوع سند، کد کالا، نام کالا، واحد، تعداد، ورود، خروج، طرف حساب، شعبه، انبار، موجودی پس از سند)،
 * کلیک ردیف ⇐ جزئیات سند انبار (`doc` در URL) و خلاصه‌ی وضعیت زیر جدول. داده: GET /wms/reports/lines و /wms/reports/summary.
 */
export default function KardexPage() {
  const can = usePerm();
  const lp = useListParams({ page_size: 20 });
  const { text, setText, dq } = useSearchState(lp);
  const branch = lp.get('branch'); const wh = lp.get('wh'); const df = lp.get('df'); const dt = lp.get('dt'); const mt = lp.get('type');
  const docId = lp.get('doc');
  const branches = useBranchOptions();
  const bd = useBranch(branch || undefined);
  const whs = useAllWarehouses(can('organization.warehouses.list') && !branch);
  const bWhs = bd.data?.warehouses ?? [];
  // «همه‌ی انبارهای یک شعبه» با هم به فیلتر شعبه در wms نیاز دارد (B-20) ⇐ بدون انتخاب انبار، انبار اصلی شعبه
  const effWh = wh || (branch ? (bWhs.find((w) => w.is_primary) ?? bWhs[0])?.warehouse_id ?? '' : '');
  const waiting = !!branch && !bd.data;
  const base: Q = { query: dq || undefined, warehouse_id: effWh || undefined, date_from: df || undefined, date_to: dt || undefined, movement_type: mt || undefined };
  const list = useQuery({ queryKey: ['wms', 'lines', base, lp.page, lp.pageSize], placeholderData: keepPreviousData, enabled: !waiting,
    queryFn: ({ signal }) => adminApi<Paginated<Movement>>('/wms/reports/lines', { query: { ...base, page: lp.page, page_size: lp.pageSize }, signal }) });
  const sum = useQuery({ queryKey: ['wms', 'summary', base], enabled: !waiting, queryFn: () => fetchAll<SummaryRow>('/wms/reports/summary', { ...(base as Record<string, string | undefined>), group_by: 'WAREHOUSE' }) });
  const docs = useQuery({ queryKey: ['wms', 'summary', 'docs', base], enabled: !waiting,
    queryFn: ({ signal }) => adminApi<Paginated<SummaryRow>>('/wms/reports/summary', { query: { ...base, group_by: 'DOCUMENT', page_size: 1 }, signal }) });
  const tin = sum.data?.reduce((a, r) => a + n(r.incoming), 0) ?? null;
  const tout = sum.data?.reduce((a, r) => a + n(r.outgoing), 0) ?? null;
  const units = useUnits(can('catalog.products.list'));
  const unitName = (id?: string | null) => (id ? units.data?.find((u) => u.id === id)?.name : undefined) ?? '—';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const exportXlsx = async () => {
    setBusy(true); setErr(null);
    try { await downloadXlsx('/wms/reports/lines/export', base as Record<string, string | number | boolean | undefined>, 'wms-movements.xlsx'); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  const range = df && dt ? `از ${gregorianToJalaliText(df)} تا ${gregorianToJalaliText(dt)}` : df ? `از ${gregorianToJalaliText(df)}` : dt ? `تا ${gregorianToJalaliText(dt)}` : 'همه‌ی تاریخ‌ها';
  const whOpts = branch
    ? bWhs.map((w) => ({ value: w.warehouse_id, label: w.is_primary ? `${bd.data?.name ?? ''} (فروشگاه)` : `${w.name} (${w.code})` }))
    : (whs.data ?? []).map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }));
  const filters: FilterDef[] = [
    { key: 'branch', label: 'شعبه', value: branch, onChange: (v) => lp.set({ branch: v || null, wh: null, doc: null }), options: (branches.data ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })) },
    { key: 'wh', label: 'انبار', value: wh, onChange: (v) => lp.set({ wh: v || null, doc: null }), options: whOpts },
    { key: 'type', label: 'نوع سند', value: mt, onChange: (v) => lp.set({ type: v || null, doc: null }), options: (Object.keys(MOVE) as MType[]).map((k) => ({ value: k, label: MOVE[k].label })) },
  ];
  const cols: Column<Movement>[] = [
    { key: 'i', header: 'ردیف', render: (_r, i) => faNum((lp.page - 1) * lp.pageSize + i + 1) },
    { key: 'doc', header: 'شماره سند', code: true, render: (r) => <span data-latin>{r.source_doc_no || '—'}</span> },
    { key: 'at', header: 'تاریخ', render: (r) => <span data-tip={faTime(r.occurred_at)}>{faDate(r.occurred_at)}</span> },
    { key: 'type', header: 'نوع سند', render: (r) => <Badge tone={MOVE[r.movement_type]?.tone ?? 'neutral'}>{MOVE[r.movement_type]?.label ?? r.movement_type}</Badge> },
    { key: 'code', header: 'کد کالا', code: true, render: (r) => <span data-latin>{r.item?.code ?? '—'}</span> },
    { key: 'item', header: 'نام کالا', render: (r) => <b className={s.trunc} style={{ maxWidth: 140 }} data-tip={r.item?.display_name}>{r.item?.display_name ?? '—'}</b> },
    { key: 'unit', header: 'واحد', render: (r) => unitName(r.item?.unit_id) },
    { key: 'qty', header: 'تعداد', render: (r) => faNum(n(r.quantity_in) || n(r.quantity_out)) },
    { key: 'in', header: 'ورود', render: (r) => (n(r.quantity_in) ? <b className={s.okText}>{faNum(n(r.quantity_in))}</b> : '—') },
    { key: 'out', header: 'خروج', render: (r) => (n(r.quantity_out) ? <b className={s.dangerText}>{faNum(n(r.quantity_out))}</b> : '—') },
    { key: 'party', header: 'طرف حساب', render: (r) => <span className={s.trunc} style={{ maxWidth: 110 }} data-tip={r.party_name || undefined}>{r.party_name || '—'}</span> },
    { key: 'branch', header: 'شعبه', render: (r) => { const t = r.warehouse?.branches?.map((b) => b.name).join('، '); return t ? <span className={s.trunc} style={{ maxWidth: 110 }} data-tip={t}>{t}</span> : '—'; } },
    { key: 'wh', header: 'انبار', render: (r) => <span className={s.trunc} style={{ maxWidth: 120 }} data-tip={r.warehouse?.name}>{r.warehouse?.name ?? '—'}</span> },
    { key: 'bal', header: 'موجودی پس از سند', render: (r) => (r.balance !== null && r.balance !== undefined ? <b>{faNum(n(r.balance))}</b> : '—') },
    { key: 'go', header: '', render: () => <IconChevronLeft size={16} className={s.flowArrow} aria-hidden /> },
  ];
  const active = !!(dq || branch || wh || df || dt || mt);
  const rows = list.data?.results;
  const open = rows?.find((r) => r.id === docId);
  return (
    <>
      <PageHead title="گردش کالا" sub={`کاردکس ورود و خروج کالا در شعب و انبارها — ${range}`}
        actions={can('wms.stock_reports.export') ? <Button variant="secondary" icon={<IconFileSpreadsheet size={16} />} loading={busy} onClick={exportXlsx} data-tip="خروجی اکسل حرکت‌ها با همین فیلترها (حداکثر ۵۰٬۰۰۰ ردیف)">خروجی اکسل</Button> : null} />
      <div className={s.kpiCards}>
        <Kpi tone={s.tRose} icon={<IconFileText size={20} />} label="تعداد اسناد گردش" value={docs.data ? `${faNum(docs.data.total)} سند` : null} />
        <Kpi tone={s.tGreen} icon={<IconArrowDownLeft size={20} />} label="مجموع ورود کالا" value={tin === null ? null : `${faNum(tin)} واحد`} />
        <Kpi tone={s.tRose} icon={<IconArrowUpRight size={20} />} label="مجموع خروج کالا" value={tout === null ? null : `${faNum(tout)} واحد`} />
        <Kpi tone={s.tBlue} icon={<IconChartLine size={20} />} label="خالص گردش دوره" value={tin === null || tout === null ? null : net(tin, tout)} />
      </div>
      <Card className={s.stockCard}>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: کد یا نام کالا، شماره سند یا طرف حساب" filters={filters}
          extra={<>
            <DateFilter label="از تاریخ" value={df} onChange={(v) => lp.set({ df: v || null })} />
            <DateFilter label="تا تاریخ" value={dt} onChange={(v) => lp.set({ dt: v || null })} />
          </>}
          onReset={() => lp.set({ df: null, dt: null, doc: null })} extraActive={!!(df || dt)}
          count={list.data ? `${faNum(list.data.total)} ردیف` : undefined} />
        {branch && !wh && bWhs.length > 1 ? <p className={s.hint}>نمای همه‌ی انبارهای یک شعبه با هم <SoonTag tip="به‌زودی — بعد از توسعه‌ی ماژول انبار (wms)" />؛ اکنون انبار اصلی شعبه نشان داده می‌شود. انبار دیگر را از فیلتر «انبار» انتخاب کنید.</p> : null}
        {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={list.isLoading || waiting} error={list.error} onRetry={() => list.refetch()}
          onRowClick={(r) => lp.set({ doc: r.id }, { keepPage: true })}
          empty={<Empty icon={<IconListDetails size={26} stroke={1.5} />} title={active ? 'سندی با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز سندی در انبارها ثبت نشده'} />} />
        <div className={s.kxFoot}>
          <span>{list.data ? `نمایش ${faNum(list.data.total)} ردیف از ${docs.data ? faNum(docs.data.total) : '…'} سند گردش کالا — ${range}` : '…'}</span>
          <span>
            <span><b className={s.okText}>{tin === null ? '…' : `${faNum(tin)} واحد`}</b><small>مجموع ورود</small></span>
            <span><b className={s.dangerText}>{tout === null ? '…' : `${faNum(tout)} واحد`}</b><small>مجموع خروج</small></span>
            <span><b>{tin === null || tout === null ? '…' : net(tin, tout)}</b><small>خالص گردش</small></span>
          </span>
        </div>
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[20, 50, 100]} /> : null}
      </Card>
      {open ? <DocModal m={open} unitName={unitName} onClose={() => lp.set({ doc: null }, { keepPage: true })} /> : null}
    </>
  );
}

function Kpi({ icon, tone, label, value }: { icon: ReactNode; tone?: string; label: string; value: string | null }) {
  return (
    <Card className={s.kpiCard}>
      <span className={`${s.resIcon} ${tone ?? ''}`}>{icon}</span>
      <span className={s.kpiText}><small>{label}</small><b>{value ?? '…'}</b></span>
    </Card>
  );
}

const DOC: Record<string, string> = {
  OPENING: 'موجودی اول دوره', GOODS_RECEIPT: 'رسید انبار', GOODS_ISSUE: 'خروج کالا', TRANSFER: 'انتقال', SCRAP: 'ضایعات', STOCK_COUNT: 'انبارگردانی',
  ITEM_BREAK: 'شکستن آیتم', ITEM_ASSEMBLY: 'ساخت آیتم', GRADE_CHANGE: 'تغییر گرید', CUSTOMER_RETURN: 'مرجوعی مشتری',
};

/** جزئیات سند انبار (html «سند انبار»): مشخصات، اقلام همین سند در همین انبار، یادداشت و جمع‌ها */
function DocModal({ m, unitName, onClose }: { m: Movement; unitName: (id?: string | null) => string; onClose: () => void }) {
  const can = usePerm();
  const showPrice = can('wms.stock_reports.value.read');
  const lines = useQuery({
    queryKey: ['wms', 'lines', 'doc', m.source_doc_id, m.warehouse?.id],
    queryFn: async () => (await fetchAll<Movement>('/wms/reports/lines', { query: m.source_doc_no || undefined, warehouse_id: m.warehouse?.id })).filter((x) => x.source_doc_id === m.source_doc_id),
  });
  const ls = lines.data ?? [];
  const sumQty = ls.reduce((a, x) => a + n(x.quantity_in) + n(x.quantity_out), 0);
  const priced = showPrice && ls.every((x) => x.unit_price !== null && x.unit_price !== undefined);
  const sumAmt = ls.reduce((a, x) => a + (n(x.quantity_in) + n(x.quantity_out)) * n(x.unit_price), 0);
  const meta: { label: string; value: ReactNode; latin?: boolean }[] = [
    { label: 'شماره سند', value: m.source_doc_no || '—', latin: true },
    { label: 'تاریخ ثبت', value: `${faDate(m.occurred_at)} — ${faTime(m.occurred_at)}` },
    { label: 'نوع سند', value: `${DOC[m.source_doc_type] ?? m.source_doc_type} (${MOVE[m.movement_type]?.label ?? m.movement_type})` },
    { label: 'شعبه', value: m.warehouse?.branches?.length ? m.warehouse.branches.map((b) => b.name).join('، ') : '—' },
    { label: 'انبار', value: m.warehouse ? <>{m.warehouse.name} (<span data-latin>{m.warehouse.code}</span>)</> : '—' },
    { label: 'طرف حساب', value: m.party_name || '—' },
    { label: 'ثبت‌کننده', value: <SoonTag tip="به‌زودی — بعد از توسعه‌ی ماژول انبار (wms)" /> },
    { label: 'وضعیت', value: 'قطعی شده' },
  ];
  return (
    <Modal open onClose={onClose} width={900}
      title={<span className={s.docTitle}><span className={`${s.resIcon} ${s.tBlue}`}><IconFileText size={20} /></span><span>سند انبار <span data-latin className={s.docNo}>{m.source_doc_no}</span> <Badge tone={MOVE[m.movement_type]?.tone ?? 'neutral'}>{MOVE[m.movement_type]?.label ?? m.movement_type}</Badge><small>{faDate(m.occurred_at)}</small></span></span>}
      footer={<><Button variant="secondary" onClick={onClose}>بستن</Button><Button variant="secondary" icon={<IconPrinter size={16} />} onClick={() => window.print()}>چاپ سند</Button></>}>
      <div className={s.docMeta}>
        {meta.map((x) => <div key={x.label}><small>{x.label}</small><b data-latin={x.latin ? true : undefined}>{x.value}</b></div>)}
      </div>
      <h4 className={s.subTitle}>اقلام سند</h4>
      {lines.isLoading ? <SkeletonRows rows={2} /> : lines.error ? <Alert>{userMessage(lines.error)}</Alert> : (
        <DataTable variant="flat" rows={ls} rowKey={(r) => r.id} empty={<Empty title="ردیفی پیدا نشد" />} columns={[
          { key: 'i', header: '#', render: (_r, i) => faNum(i + 1) },
          { key: 'code', header: 'کد کالا', code: true, render: (r) => <span data-latin>{r.item?.code ?? '—'}</span> },
          { key: 'name', header: 'نام کالا', render: (r) => <b className={s.trunc} style={{ maxWidth: 200 }} data-tip={r.item?.display_name}>{r.item?.display_name ?? '—'}</b> },
          { key: 'unit', header: 'واحد', render: (r) => unitName(r.item?.unit_id) },
          { key: 'qty', header: 'تعداد', render: (r) => <b>{faNum(n(r.quantity_in) || n(r.quantity_out))}</b> },
          { key: 'dir', header: 'نوع', render: (r) => (n(r.quantity_in) ? <Badge tone="success">ورود</Badge> : <Badge tone="danger">خروج</Badge>) },
          { key: 'price', header: 'مبلغ واحد (ریال)', render: (r) => (showPrice && r.unit_price != null ? faNum(n(r.unit_price)) : <span className={s.soon} data-tip="فقط با مجوز «ارزش ریالی موجودی»">—</span>) },
          { key: 'total', header: 'مبلغ کل (ریال)', render: (r) => (showPrice && r.unit_price != null ? <b>{faNum((n(r.quantity_in) + n(r.quantity_out)) * n(r.unit_price))}</b> : <span className={s.soon}>—</span>) },
          { key: 'bal', header: 'مانده', render: (r) => (r.balance != null ? faNum(n(r.balance)) : '—') },
        ] as Column<Movement>[]} />
      )}
      <div className={s.docBottom}>
        <p>این سند قطعی شده و در گردش کالای انبار اعمال شده است. هر اصلاح نیاز به سند برگشتی دارد.</p>
        <div className={s.docSums}>
          <div><span>جمع تعداد</span><b>{faNum(sumQty)}</b></div>
          <div><span>جمع مبلغ</span><b>{priced ? `${faNum(sumAmt)} ریال` : '—'}</b></div>
          <div><span>مالیات ارزش افزوده</span><b><SoonTag tip="به‌زودی — مالیات با ماژول حسابداری" /></b></div>
          <div className={s.docFinal}><span>مبلغ نهایی</span><b><SoonTag tip="به‌زودی — با مالیات، بعد از ماژول حسابداری" /></b></div>
        </div>
      </div>
    </Modal>
  );
}
