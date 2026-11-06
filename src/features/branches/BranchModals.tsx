import { useMemo, useState, type ReactNode } from 'react';
import { IconBan, IconLinkOff, IconPencil, IconPlus, IconStar, IconUserMinus } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dropdown } from '@/shared/ui/Dropdown';
import { FormGrid, Input, PickerField, Select, Toggle } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Empty, Modal, Pagination, UnitHead } from '@/shared/ui/kit';
import { TableFilters, searchKey } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal, IconButton } from '@/features/catalog/components';
import { useStockCounts,
  useBranchCashBoxes, useBranchEmployees, useBranchPos, useBranchStaff, useBranchWarehouses, useBranchWrite, useCashBoxPool,
  useEmployeeCandidates, useManagerCandidates, usePosPool, useWarehousePool,
  type BranchCashBox, type BranchDetail, type BranchEmployee, type BranchPos, type BranchWarehouse, type Candidate,
  type CashBoxRow, type PosRow, type Shift, type StaffUser, type WarehouseRow,
} from './api';
import { PERMITS, SHIFT, SHIFT_OPTIONS } from './labels';
import { SoonTag } from './SoonTag';
import s from './branches.module.css';

export type ResourceKey = 'warehouses' | 'assortment' | 'bank' | 'pos' | 'cash' | 'people' | 'permits';

const staffName = (u: StaffUser) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.username || u.phone_number;
const FOOT_NOTE = 'تعریف موارد جدید در ماژول مربوط به خود انجام می‌شود؛ در این صفحه فقط تخصیص به شعبه انجام می‌شود.';

/** پوسته‌ی مشترک مودال‌های منابع شعبه (مثل html: عنوان + زیرعنوان، شمارنده‌ها، جست‌وجو، جدول، یادداشت پایین و اقدام) */
function ResourceShell({ title, sub, stats, search, onSearch, placeholder, children, action, onClose, note = FOOT_NOTE, width = 1080 }: {
  title: string; sub: string; stats?: { label: string; value: ReactNode; tip?: string }[]; search?: string; onSearch?: (v: string) => void; placeholder?: string;
  children: ReactNode; action?: ReactNode; onClose: () => void; note?: string | null; width?: number;
}) {
  return (
    <Modal open onClose={onClose} width={width}
      title={<span className={s.mTitle}><span>{title}</span><small>{sub}</small></span>}
      footer={<div className={s.mFoot}><span className={s.mNote}>{note}</span><span className={s.mActs}><Button variant="secondary" onClick={onClose}>بستن</Button>{action}</span></div>}>
      {stats?.length || onSearch ? (
        <div className={s.mBar}>
          <div className={s.mStats}>{stats?.map((x) => <span key={x.label} className={s.mStat} data-tip={x.tip}><b>{x.value}</b>{x.label}</span>)}</div>
          {onSearch ? <div className={s.mSearch}><TableFilters search={search ?? ''} onSearch={onSearch} placeholder={placeholder ?? 'جست‌وجو'} /></div> : null}
        </div>
      ) : null}
      {children}
    </Modal>
  );
}

const useLocalSearch = <T,>(rows: T[] | undefined, key: (r: T) => string) => {
  const [q, setQ] = useState('');
  const k = searchKey(q);
  const filtered = useMemo(() => (rows ?? []).filter((r) => !k || searchKey(key(r)).includes(k)), [rows, k]); // eslint-disable-line react-hooks/exhaustive-deps
  return { q, setQ, filtered, active: !!k };
};

// ── انبارهای مربوطه ─────────────────────────────────────────────
/** انتخاب و قطع اتصال انبار تا ساخت ماژول «مدیریت انبار» به‌زودی است (افشین 2026-10-25): هر شعبه فعلاً فقط انبار اصلی خودش را دارد. */
const WH_SOON = 'به‌زودی — اتصال انبار دیگر به شعبه بعد از توسعه‌ی ماژول «مدیریت انبار»';

export function WarehousesModal({ branch, onClose }: { branch: BranchDetail; onClose: () => void }) {
  const can = usePerm();
  const list = useBranchWarehouses(branch.id);
  const edit = can('organization.branches.warehouses.update');
  const { q, setQ, filtered, active } = useLocalSearch(list.data?.results, (r) => `${r.warehouse_name} ${r.warehouse_code} ${r.keeper_name ?? ''} ${r.address}`);
  const counts = useStockCounts({ warehouse_ids: (list.data?.results ?? []).map((r) => r.warehouse_id) }, can('wms.stock.list'));
  const itemsOf = (id: string) => counts.data?.warehouses.find((c) => c.warehouse_id === id)?.items_in_stock;
  const totalArea = (list.data?.results ?? []).reduce((a, r) => a + Number(r.area_sqm ?? 0), 0);
  const totalItems = counts.data ? counts.data.warehouses.reduce((a, c) => a + c.items_in_stock, 0) : null;
  const cols: Column<BranchWarehouse>[] = [
    { key: 'i', header: 'ردیف', render: (_r, i) => faNum(i + 1) },
    { key: 'name', header: 'نام انبار', render: (r) => <span className={s.twoLine}><b>{r.warehouse_name}</b><small data-latin>{r.warehouse_code}</small></span> },
    { key: 'kind', header: 'نقش برای شعبه', render: (r) => (r.is_primary ? <Badge tone="brand">انبار اصلی</Badge> : <Badge>انبار متصل</Badge>) },
    { key: 'area', header: <UnitHead unit="m²">متراژ</UnitHead>, render: (r) => (r.area_sqm ? faNum(Number(r.area_sqm)) : '—') },
    { key: 'keeper', header: 'مسئول انبار', render: (r) => r.keeper_name || '—' },
    { key: 'phone', header: 'تلفن', render: (r) => (r.phone ? <span className="ltr">{r.phone}</span> : '—') },
    { key: 'items', header: 'قلم کالا', render: (r) => { const c = itemsOf(r.warehouse_id); return c === undefined ? '—' : faNum(c); } },
    { key: 'addr', header: 'نشانی', render: (r) => r.address || '—' },
    { key: 'st', header: 'وضعیت', render: (r) => (r.is_active ? <Badge tone="success">فعال</Badge> : <Badge tone="neutral">غیرفعال</Badge>) },
    ...(edit ? [{
      key: 'acts', header: 'عملیات', render: () => (
        <span className={s.rowActs} data-tip={WH_SOON}>
          <IconButton label="انبار اصلی شعبه شود (به‌زودی)" onClick={() => undefined} disabled><IconStar size={16} /></IconButton>
          <IconButton label="قطع اتصال انبار (به‌زودی)" onClick={() => undefined} danger disabled><IconLinkOff size={16} /></IconButton>
        </span>
      ),
    }] : []),
  ];
  return (
    <ResourceShell title="انبارهای مربوطه" sub={`انبارهای متصل به ${branch.name} — کد شعبه ${branch.code}`} onClose={onClose}
      note="هر شعبه فعلاً فقط انبار اصلی خودش را دارد؛ اتصال انبار دیگر بعد از توسعه‌ی ماژول «مدیریت انبار» فعال می‌شود."
      stats={[{ label: 'انبار', value: faNum(list.data?.total ?? 0) }, { label: 'مجموع متراژ (m²)', value: totalArea ? faNum(totalArea) : '—' }, { label: 'قلم کالا', value: totalItems === null ? '—' : faNum(totalItems), tip: 'جمع اقلام دارای موجودی در هر انبار' }]}
      search={q} onSearch={setQ} placeholder="جست‌وجوی انبار با نام یا کد"
      action={edit ? <span data-tip={WH_SOON}><Button icon={<IconPlus size={16} />} disabled>انتخاب انبار <SoonTag tip={WH_SOON} /></Button></span> : null}>
      <DataTable columns={cols} rows={filtered} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={active ? 'انباری با این جست‌وجو پیدا نشد' : 'هنوز انباری به این شعبه وصل نیست'} />} />
    </ResourceShell>
  );
}

/** برای زمان ماژول «مدیریت انبار» نگه داشته شده (فعلاً استفاده نمی‌شود) */
export function WarehousePicker({ exclude, onPick, onClose }: { exclude: string[]; onPick: (w: WarehouseRow, primary: boolean) => Promise<unknown>; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300);
  const [sel, setSel] = useState<WarehouseRow | null>(null);
  const [primary, setPrimary] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useWarehousePool({ page, page_size: 8, query: dq || undefined, is_active: true });
  const cols: Column<WarehouseRow>[] = [
    { key: 'code', header: 'کد', code: true, render: (r) => <span data-latin>{r.code}</span> },
    { key: 'name', header: 'نام انبار', render: (r) => <b>{r.name}</b> },
    { key: 'area', header: <UnitHead unit="m²">متراژ</UnitHead>, render: (r) => (r.area_sqm ? faNum(Number(r.area_sqm)) : '—') },
    { key: 'st', header: 'وضعیت', render: (r) => (exclude.includes(r.id) ? <Badge tone="info">متصل است</Badge> : <Badge tone="success">قابل اتصال</Badge>) },
  ];
  const go = async () => {
    if (!sel) return;
    setBusy(true); setErr(null);
    try { await onPick(sel, primary); onClose(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="انتخاب انبار" width={720}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={go} loading={busy} disabled={!sel}>اتصال به شعبه</Button></>}>
      {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام یا کد انبار" count={list.data ? `${faNum(list.data.total)} انبار` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(r) => { if (!exclude.includes(r.id)) setSel(r); }} isSelected={(r) => r.id === sel?.id}
        empty={<Empty title="انباری پیدا نشد" text="تعریف انبار در ماژول «مدیریت انبار» انجام می‌شود." />} />
      {list.data && list.data.total > 8 ? <Pagination page={page} pageSize={8} total={list.data.total} onPage={setPage} /> : null}
      <div className={s.mOpt}><Toggle checked={primary} onChange={setPrimary} label="انبار اصلی این شعبه باشد" /></div>
    </Modal>
  );
}

// ── محصولات مجاز: BranchProducts.tsx (AllowedProductsModal) ─────────────────────

// ── حساب‌های بانکی (استندبای فاز ۱: بک‌اند 501) ──────────────────────
export function BankAccountsModal({ branch, onClose }: { branch: BranchDetail; onClose: () => void }) {
  return (
    <ResourceShell title="حساب‌های بانکی" sub={`حساب‌های متصل به ${branch.name}`} onClose={onClose} width={720}
      note="تعریف و اتصال حساب بانکی با ماژول خزانه‌داری ساخته می‌شود.">
      <Empty title="حساب‌های بانکی به‌زودی" text="اتصال حساب بانکی به شعبه در بک‌اند هنوز فعال نیست (فاز ۱). بعد از ساخت ماژول خزانه‌داری همین‌جا در دسترس می‌شود." />
    </ResourceShell>
  );
}

/** کارت‌های POS و صندوق (افشین 2026-10-25): مثل حساب‌های بانکی «به‌زودی» تا ماژول خزانه‌داری؛ مودال‌های قبلی (PosModal، CashBoxesModal) برای آن زمان نگه داشته شده‌اند. */
export function FinanceSoonModal({ branch, kind, onClose }: { branch: BranchDetail; kind: 'pos' | 'cash'; onClose: () => void }) {
  const t = kind === 'pos' ? { title: 'دستگاه‌های POS', item: 'دستگاه POS' } : { title: 'صندوق‌ها', item: 'صندوق' };
  return (
    <ResourceShell title={t.title} sub={`${t.title} متصل به ${branch.name}`} onClose={onClose} width={720}
      note={`تعریف و اتصال ${t.item} با ماژول خزانه‌داری ساخته می‌شود.`}>
      <Empty title={`${t.title} به‌زودی`} text={`اتصال ${t.item} به شعبه با ماژول خزانه‌داری فعال می‌شود؛ بعد از ساخت آن همین‌جا در دسترس است.`} />
    </ResourceShell>
  );
}

// ── دستگاه‌های POS ─────────────────────────────────────────────
export function PosModal({ branch, onClose }: { branch: BranchDetail; onClose: () => void }) {
  const can = usePerm();
  const list = useBranchPos(branch.id);
  const boxes = useBranchCashBoxes(branch.id);
  const w = useBranchWrite(branch.id);
  const toast = useToast();
  const edit = can('organization.branches.pos_devices.update');
  const [picking, setPicking] = useState(false);
  const [unassign, setUnassign] = useState<BranchPos | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rows = list.data?.results;
  const { q, setQ, filtered, active } = useLocalSearch(rows, (r) => `${r.title} ${r.terminal_no} ${r.device_model} ${r.serial_no}`);
  const patch = async (r: BranchPos, body: Parameters<typeof w.patchPos.mutateAsync>[0]['body'], msg: string) => {
    setErr(null);
    try { await w.patchPos.mutateAsync({ pid: r.id, body }); toast(msg); } catch (e) { setErr(userMessage(e)); }
  };
  const boxOpts = (boxes.data?.results ?? []).map((b) => ({ value: b.id, label: b.title }));
  const cols: Column<BranchPos>[] = [
    { key: 'i', header: 'ردیف', render: (_r, i) => faNum(i + 1) },
    { key: 'name', header: 'نام دستگاه', render: (r) => <span className={s.twoLine}><b>{r.title}</b><small data-latin>{r.serial_no || '—'}</small></span> },
    { key: 'model', header: 'مدل دستگاه', render: (r) => (r.device_model ? <span data-latin>{r.device_model}</span> : '—') },
    { key: 'bank', header: 'بانک متصل', render: (r) => r.bank_name ?? <SoonTag /> },
    { key: 'acc', header: 'حساب بانکی متصل', render: (r) => (r.bank_account_number ? <span data-latin>{r.bank_account_number}</span> : <SoonTag />) },
    { key: 'term', header: 'شماره پایانه', code: true, render: (r) => <span data-latin>{r.terminal_no}</span> },
    {
      key: 'box', header: 'صندوق متصل', render: (r) => (edit ? (
        <Dropdown buttonClassName={s.cellSelect} aria-label="صندوق متصل" value={r.cash_box_id ?? ''} placeholder="بدون صندوق" options={boxOpts}
          onChange={(e) => patch(r, { cash_box_id: e.target.value || null }, 'صندوق متصل دستگاه تغییر کرد.')} />
      ) : r.cash_box_title ?? '—'),
    },
    { key: 'today', header: 'تراکنش امروز', render: (r) => (r.today_transactions_amount !== null && r.today_transactions_amount !== undefined ? faNum(r.today_transactions_amount) : <SoonTag />) },
    { key: 'last', header: 'آخرین تراکنش', render: (r) => (r.last_transaction_at ? faDate(r.last_transaction_at) : <SoonTag />) },
    { key: 'st', header: 'وضعیت', render: (r) => <Badge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'فعال' : 'غیرفعال'}</Badge> },
    ...(edit ? [{
      key: 'acts', header: 'عملیات', render: (r: BranchPos) => (
        <span className={s.rowActs}>
          <IconButton label={r.is_active ? 'غیرفعال کردن دستگاه' : 'فعال کردن دستگاه'} onClick={() => patch(r, { is_active: !r.is_active }, r.is_active ? 'دستگاه غیرفعال شد.' : 'دستگاه فعال شد.')}><IconBan size={16} /></IconButton>
          <IconButton label="لغو تخصیص دستگاه" danger onClick={() => setUnassign(r)}><IconLinkOff size={16} /></IconButton>
        </span>
      ),
    }] : []),
  ];
  return (
    <ResourceShell title="دستگاه‌های POS" sub={`کارت‌خوان‌های متصل به ${branch.name}`} onClose={onClose}
      stats={[{ label: 'دستگاه', value: faNum(rows?.length ?? 0) }, { label: 'فعال', value: faNum((rows ?? []).filter((r) => r.is_active).length) }, { label: 'تراکنش امروز', value: <SoonTag /> }]}
      search={q} onSearch={setQ} placeholder="جست‌وجو: نام، پایانه، مدل یا سریال"
      action={edit ? <Button icon={<IconPlus size={16} />} onClick={() => setPicking(true)}>انتخاب دستگاه POS</Button> : null}>
      {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
      <DataTable columns={cols} rows={filtered} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={active ? 'دستگاهی با این جست‌وجو پیدا نشد' : 'هنوز دستگاهی به این شعبه تخصیص نیافته'} />} />
      {picking ? (
        <PoolPicker<PosRow> title="انتخاب دستگاه POS" usePool={usePosPool} rowKey={(r) => r.id} onClose={() => setPicking(false)}
          cols={[{ key: 'term', header: 'شماره پایانه', code: true, render: (r) => <span data-latin>{r.terminal_no}</span> }, { key: 'name', header: 'نام دستگاه', render: (r) => <b>{r.title}</b> }, { key: 'model', header: 'مدل', render: (r) => (r.device_model ? <span data-latin>{r.device_model}</span> : '—') }]}
          extra={(st, set) => <Select label="صندوق متصل (اختیاری)" value={(st.cash_box_id as string | null | undefined) ?? ''} onChange={(e) => set({ cash_box_id: e.target.value || null })} placeholder="بدون صندوق" options={boxOpts} />}
          onConfirm={async (ids, st) => { await w.assignPos.mutateAsync({ pos_device_ids: ids, cash_box_id: (st.cash_box_id as string | null) ?? null, is_active: true }); toast(`${faNum(ids.length)} دستگاه به شعبه تخصیص یافت.`); }} />
      ) : null}
      {unassign ? (
        <ConfirmModal title="لغو تخصیص دستگاه" confirmLabel="لغو تخصیص" danger onClose={() => setUnassign(null)}
          text={<>دستگاه <b>{unassign.title}</b> از شعبه جدا می‌شود و به فهرست دستگاه‌های بدون شعبه برمی‌گردد.</>}
          onConfirm={async () => { await w.unassignPos.mutateAsync(unassign.id); toast('تخصیص دستگاه لغو شد.'); }} />
      ) : null}
    </ResourceShell>
  );
}

/** جدول انتخابی چندتایی از استخر منابع بدون شعبه (صندوق/POS) */
function PoolPicker<T>({ title, usePool, cols, rowKey, extra, onConfirm, onClose }: {
  title: string; usePool: (q: Record<string, string | number | boolean | undefined>, enabled?: boolean) => { data?: { total: number; results: T[] }; isLoading: boolean; error: unknown; refetch: () => unknown };
  cols: Column<T>[]; rowKey: (r: T) => string; extra?: (st: Record<string, unknown>, set: (p: Record<string, unknown>) => void) => ReactNode;
  onConfirm: (ids: string[], st: Record<string, unknown>) => Promise<unknown>; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [st, setSt] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = usePool({ page, page_size: 8, query: dq || undefined });
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allCols: Column<T>[] = [{ key: 'pick', header: 'انتخاب', render: (r) => <input type="checkbox" className={s.cb} aria-label="انتخاب" checked={sel.has(rowKey(r))} onChange={() => toggle(rowKey(r))} onClick={(e) => e.stopPropagation()} /> }, ...cols];
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm([...sel], st); onClose(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={title} width={760}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={go} loading={busy} disabled={!sel.size}>تخصیص {sel.size ? faNum(sel.size) : ''} مورد</Button></>}>
      {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو" count={list.data ? `${faNum(list.data.total)} مورد بدون شعبه` : undefined} />
      <DataTable columns={allCols} rows={list.data?.results} rowKey={rowKey} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(r) => toggle(rowKey(r))} isSelected={(r) => sel.has(rowKey(r))}
        empty={<Empty title="موردی بدون شعبه پیدا نشد" text="تعریف صندوق و دستگاه POS با ماژول مالی انجام می‌شود؛ این‌جا فقط موارد بدون شعبه تخصیص می‌یابند." />} />
      {list.data && list.data.total > 8 ? <Pagination page={page} pageSize={8} total={list.data.total} onPage={setPage} /> : null}
      {extra ? <div className={s.mOptGrid}>{extra(st, (p) => setSt((x) => ({ ...x, ...p })))}</div> : null}
    </Modal>
  );
}

// ── صندوق‌ها ─────────────────────────────────────────────
export function CashBoxesModal({ branch, onClose }: { branch: BranchDetail; onClose: () => void }) {
  const can = usePerm();
  const list = useBranchCashBoxes(branch.id);
  const w = useBranchWrite(branch.id);
  const toast = useToast();
  const edit = can('organization.branches.cash_boxes.update');
  const [picking, setPicking] = useState(false);
  const [cashierFor, setCashierFor] = useState<BranchCashBox | 'assign' | null>(null);
  const [assignCashier, setAssignCashier] = useState<StaffUser | null>(null);
  const [unassign, setUnassign] = useState<BranchCashBox | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rows = list.data?.results;
  const { q, setQ, filtered, active } = useLocalSearch(rows, (r) => `${r.title} ${r.code} ${r.cashier_name ?? ''}`);
  const patch = async (r: BranchCashBox, body: Parameters<typeof w.patchCash.mutateAsync>[0]['body'], msg: string) => {
    setErr(null);
    try { await w.patchCash.mutateAsync({ cid: r.id, body }); toast(msg); } catch (e) { setErr(userMessage(e)); }
  };
  const cols: Column<BranchCashBox>[] = [
    { key: 'i', header: 'ردیف', render: (_r, i) => faNum(i + 1) },
    { key: 'name', header: 'نام صندوق', render: (r) => <span className={s.twoLine}><b>{r.title}</b><small data-latin>{r.code}</small></span> },
    {
      key: 'cashier', header: 'صندوق‌دار', render: (r) => (
        <span className={s.inlineEdit}>{r.cashier_name ?? <span className={s.soon}>تعیین نشده</span>}
          {edit ? <IconButton label="تغییر صندوق‌دار" onClick={() => setCashierFor(r)}><IconPencil size={15} /></IconButton> : null}</span>
      ),
    },
    {
      key: 'shift', header: 'شیفت کاری', render: (r) => (edit ? (
        <Dropdown buttonClassName={s.cellSelect} aria-label="شیفت کاری" value={r.shift ?? ''} placeholder="تعیین نشده" options={SHIFT_OPTIONS}
          onChange={(e) => patch(r, { shift: (e.target.value || null) as Shift | null }, 'شیفت صندوق تغییر کرد.')} />
      ) : (r.shift ? SHIFT[r.shift] : '—')),
    },
    { key: 'pos', header: 'دستگاه POS متصل', render: (r) => (r.pos_devices?.length ? r.pos_devices.map((p) => p.title).join('، ') : '—') },
    { key: 'open', header: 'موجودی اولیه', render: (r) => faNum(Number(r.opening_balance)) },
    { key: 'cash', header: 'موجودی نقد فعلی', render: (r) => (r.current_cash_balance !== null && r.current_cash_balance !== undefined ? faNum(Number(r.current_cash_balance)) : <SoonTag />) },
    { key: 'st', header: 'وضعیت', render: (r) => <Badge tone={r.is_open ? 'success' : 'neutral'}>{r.is_open ? 'باز' : 'بسته'}</Badge> },
    ...(edit ? [{
      key: 'acts', header: 'عملیات', render: (r: BranchCashBox) => (
        <span className={s.rowActs}>
          <Button size="sm" variant="secondary" onClick={() => patch(r, { is_open: !r.is_open }, r.is_open ? 'صندوق بسته شد.' : 'صندوق باز شد.')}>{r.is_open ? 'بستن صندوق' : 'باز کردن'}</Button>
          <IconButton label={r.is_open ? 'برای لغو تخصیص اول صندوق را ببندید' : 'لغو تخصیص صندوق'} danger disabled={r.is_open} onClick={() => setUnassign(r)}><IconLinkOff size={16} /></IconButton>
        </span>
      ),
    }] : []),
  ];
  return (
    <ResourceShell title="صندوق‌ها" sub={`صندوق‌های فروش ${branch.name}`} onClose={onClose}
      stats={[{ label: 'صندوق', value: faNum(rows?.length ?? 0) }, { label: 'باز', value: faNum((rows ?? []).filter((r) => r.is_open).length) }, { label: 'موجودی نقد', value: <SoonTag /> }]}
      search={q} onSearch={setQ} placeholder="جست‌وجو: نام، کد یا صندوق‌دار"
      action={edit ? <Button icon={<IconPlus size={16} />} onClick={() => setPicking(true)}>انتخاب صندوق</Button> : null}>
      {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
      <DataTable columns={cols} rows={filtered} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={active ? 'صندوقی با این جست‌وجو پیدا نشد' : 'هنوز صندوقی به این شعبه تخصیص نیافته'} />} />
      {picking ? (
        <PoolPicker<CashBoxRow> title="انتخاب صندوق" usePool={useCashBoxPool} rowKey={(r) => r.id} onClose={() => { setPicking(false); setAssignCashier(null); }}
          cols={[{ key: 'code', header: 'کد', code: true, render: (r) => <span data-latin>{r.code}</span> }, { key: 'name', header: 'نام صندوق', render: (r) => <b>{r.title}</b> }, { key: 'ob', header: 'موجودی اولیه', render: (r) => faNum(Number(r.opening_balance)) }]}
          extra={(st, set) => (
            <>
              <PickerField label="صندوق‌دار (اختیاری)" value={assignCashier ? staffName(assignCashier) : null} placeholder="از کارکنان همین شعبه" onOpen={() => setCashierFor('assign')} onClear={() => setAssignCashier(null)} />
              <Select label="شیفت کاری" value={(st.shift as string) ?? ''} onChange={(e) => set({ shift: e.target.value || null })} placeholder="تعیین نشده" options={SHIFT_OPTIONS} />
              <div className={s.toggleCell}><Toggle checked={!!st.is_open} onChange={(v) => set({ is_open: v })} label="صندوق باز باشد" /></div>
            </>
          )}
          onConfirm={async (ids, st) => {
            await w.assignCash.mutateAsync({ cash_box_ids: ids, cashier_user_id: assignCashier?.id ?? null, shift: (st.shift as Shift | null) ?? null, is_open: !!st.is_open });
            setAssignCashier(null); toast(`${faNum(ids.length)} صندوق به شعبه تخصیص یافت.`);
          }} />
      ) : null}
      {cashierFor ? (
        <StaffPicker branch={branch} title="انتخاب صندوق‌دار" hint="فقط کارکنانی که شعبه‌ی محل کارشان همین شعبه است" onClose={() => setCashierFor(null)}
          onPick={async (u) => {
            if (cashierFor === 'assign') { setAssignCashier(u); return; }
            await w.patchCash.mutateAsync({ cid: cashierFor.id, body: { cashier_user_id: u.id } }); toast('صندوق‌دار تغییر کرد.');
          }} />
      ) : null}
      {unassign ? (
        <ConfirmModal title="لغو تخصیص صندوق" confirmLabel="لغو تخصیص" danger onClose={() => setUnassign(null)}
          text={<>صندوق <b>{unassign.title}</b> از شعبه جدا می‌شود و صندوق‌دارش پاک می‌شود.</>}
          onConfirm={async () => { await w.unassignCash.mutateAsync(unassign.id); toast('تخصیص صندوق لغو شد.'); }} />
      ) : null}
    </ResourceShell>
  );
}

/** کارکنانی که شعبه‌ی محل کارشان همین شعبه است (GET /auth/staff?branch_id) */
function StaffPicker({ branch, title, hint, onPick, onClose }: { branch: BranchDetail; title: string; hint?: string; onPick: (u: StaffUser) => Promise<unknown> | void; onClose: () => void }) {
  const can = usePerm();
  const allowed = can('identity.users.list');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300);
  const [err, setErr] = useState<string | null>(null);
  const list = useBranchStaff(branch.id, { page, page_size: 8, query: dq || undefined }, allowed);
  const pick = async (u: StaffUser) => { setErr(null); try { await onPick(u); onClose(); } catch (e) { setErr(userMessage(e)); } };
  const cols: Column<StaffUser>[] = [
    { key: 'code', header: 'کد پرسنلی', code: true, render: (u) => <span data-latin>{u.personnel_code || '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (u) => <b>{staffName(u)}</b> },
    { key: 'mobile', header: 'موبایل', render: (u) => <span className="ltr">{u.phone_number || '—'}</span> },
  ];
  return (
    <Modal open onClose={onClose} title={title} width={640}>
      {!allowed ? <Empty title="فهرست کارکنان برای حساب شما در دسترس نیست" text="برای انتخاب به مجوز «فهرست کاربران» نیاز است." /> : (
        <>
          {hint ? <p className={s.hint}>{hint}</p> : null}
          {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
          <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام، موبایل یا کد پرسنلی" count={list.data ? `${faNum(list.data.total)} نفر` : undefined} />
          <DataTable columns={cols} rows={list.data?.results} rowKey={(u) => u.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} onRowClick={pick}
            empty={<Empty title="کسی پیدا نشد" text="ابتدا در «تخصیص شعب» شعبه‌ی محل کار افراد را این شعبه کنید." />} />
          {list.data && list.data.total > 8 ? <Pagination page={page} pageSize={8} total={list.data.total} onPage={setPage} /> : null}
        </>
      )}
    </Modal>
  );
}

// ── افراد شعبه ─────────────────────────────────────────────
export function PeopleModal({ branch, onClose }: { branch: BranchDetail; onClose: () => void }) {
  const can = usePerm();
  const list = useBranchEmployees(branch.id, { page_size: 100 });
  const w = useBranchWrite(branch.id);
  const toast = useToast();
  const edit = can('organization.branches.employees.update');
  const [form, setForm] = useState<BranchEmployee | 'new' | null>(null);
  const [unassign, setUnassign] = useState<BranchEmployee | null>(null);
  const rows = list.data?.results;
  const { q, setQ, filtered, active } = useLocalSearch(rows, (r) => `${r.full_name ?? ''} ${r.national_id ?? ''} ${r.personnel_code ?? ''} ${r.phone_number ?? ''} ${r.position}`);
  const cols: Column<BranchEmployee>[] = [
    { key: 'i', header: 'ردیف', render: (_r, i) => faNum(i + 1) },
    { key: 'name', header: 'نام و نام خانوادگی', render: (r) => <b>{r.full_name || <span className={s.soon}>نام در دسترس نیست</span>}</b> },
    { key: 'nid', header: 'کد ملی', code: true, render: (r) => <span data-latin>{r.national_id || '—'}</span> },
    { key: 'pc', header: 'کد پرسنلی', code: true, render: (r) => <span data-latin>{r.personnel_code || '—'}</span> },
    { key: 'mobile', header: 'شماره موبایل', render: (r) => <span className="ltr">{r.phone_number || '—'}</span> },
    { key: 'pos', header: 'سمت', render: (r) => r.position },
    { key: 'shift', header: 'شیفت کاری', render: (r) => SHIFT[r.shift] ?? r.shift },
    { key: 'start', header: 'تاریخ شروع', render: (r) => (r.start_date ? gregorianToJalaliText(r.start_date) : '—') },
    { key: 'st', header: 'وضعیت', render: (r) => <Badge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'فعال' : 'غیرفعال'}</Badge> },
    ...(edit ? [{
      key: 'acts', header: 'عملیات', render: (r: BranchEmployee) => (
        <span className={s.rowActs}>
          <IconButton label="ویرایش سمت و شیفت" onClick={() => setForm(r)}><IconPencil size={16} /></IconButton>
          <IconButton label="پایان اشتغال در شعبه" danger onClick={() => setUnassign(r)}><IconUserMinus size={16} /></IconButton>
        </span>
      ),
    }] : []),
  ];
  return (
    <ResourceShell title="افراد شعبه" sub={`کارمندان فعال در ${branch.name}`} onClose={onClose}
      note="فقط کسانی که شعبه‌ی محل کارشان (در «تخصیص شعب») همین شعبه است، کارمند این شعبه می‌شوند. مسئول شعبه جدا تعیین می‌شود و کارمند نیست."
      stats={[{ label: 'کارمند', value: faNum(rows?.length ?? 0) }, { label: 'فعال', value: faNum((rows ?? []).filter((r) => r.is_active).length) }]}
      search={q} onSearch={setQ} placeholder="جست‌وجو: نام، کد ملی، کد پرسنلی، موبایل یا سمت"
      action={edit ? <Button icon={<IconPlus size={16} />} onClick={() => setForm('new')}>انتخاب کارمند</Button> : null}>
      <DataTable columns={cols} rows={filtered} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={active ? 'کسی با این جست‌وجو پیدا نشد' : 'هنوز کارمندی برای این شعبه ثبت نشده'} />} />
      {form ? <EmployeeForm branch={branch} emp={form === 'new' ? null : form} onClose={() => setForm(null)} /> : null}
      {unassign ? (
        <ConfirmModal title="پایان اشتغال در شعبه" confirmLabel="پایان اشتغال" danger onClose={() => setUnassign(null)}
          text={<><b>{unassign.full_name ?? 'این کارمند'}</b> دیگر کارمند فعال این شعبه نیست. شعبه‌ی محل کار او در «تخصیص شعب» دست نمی‌خورد.</>}
          onConfirm={async () => { await w.unassignEmployee.mutateAsync(unassign.id); toast('اشتغال کارمند پایان یافت.'); }} />
      ) : null}
    </ResourceShell>
  );
}

function EmployeeForm({ branch, emp, onClose }: { branch: BranchDetail; emp: BranchEmployee | null; onClose: () => void }) {
  const w = useBranchWrite(branch.id);
  const toast = useToast();
  const [who, setWho] = useState<Candidate | null>(null);
  const [picking, setPicking] = useState(false);
  const [position, setPosition] = useState(emp?.position ?? '');
  const [shift, setShift] = useState<string>(emp?.shift ?? 'FULL_DAY');
  const [start, setStart] = useState(emp?.start_date ? gregorianToJalaliText(emp.start_date) : '');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!emp && !who) e.who = 'کارمند را انتخاب کنید.';
    if (!position.trim()) e.position = 'سمت را بنویسید.';
    const g = start ? jalaliTextToGregorian(start) : null;
    if (!start) e.start = 'تاریخ شروع را انتخاب کنید.'; else if (!g) e.start = 'تاریخ معتبر نیست.';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true); setErr(null);
    try {
      if (emp) await w.patchEmployee.mutateAsync({ eid: emp.id, body: { position: position.trim(), shift: shift as Shift, start_date: g } });
      else await w.assignEmployee.mutateAsync({ user_id: who!.user_id!, position: position.trim(), shift: shift as Shift, start_date: g! });
      toast(emp ? 'اطلاعات کارمند ذخیره شد.' : 'کارمند به شعبه اضافه شد.'); onClose();
    } catch (x) { setErr(userMessage(x)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={emp ? `ویرایش ${emp.full_name ?? 'کارمند'}` : 'افزودن کارمند به شعبه'} width={720}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={busy}>{emp ? 'ذخیره‌ی تغییرات' : 'افزودن کارمند'}</Button></>}>
      {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        {emp ? <Input label="کارمند" value={emp.full_name ?? ''} disabled /> : (
          <PickerField label="کارمند" required value={who ? who.full_name : null} placeholder="از کارکنان همین شعبه" error={errs.who} onOpen={() => setPicking(true)} onClear={() => setWho(null)} />
        )}
        <Input label="سمت" required value={position} onChange={(e) => setPosition(e.target.value)} error={errs.position} placeholder="مثلاً فروشنده ارشد" maxLength={100} />
        <Select label="شیفت کاری" required value={shift} onChange={(e) => setShift(e.target.value)} options={SHIFT_OPTIONS} />
        <JalaliDateInput label="تاریخ شروع" required value={start} onChange={(e) => setStart(e.target.value)} error={errs.start} placeholder="۱۴۰۵/۰۱/۰۱" dir="ltr" />
      </FormGrid>
      {picking ? <CandidatePicker branch={branch} kind="employee" onClose={() => setPicking(false)} onPick={(c) => { setWho(c); setPicking(false); }} /> : null}
    </Modal>
  );
}

/** کاندیدای کارمند یا مسئول (employee-candidates / manager-candidates) */
export function CandidatePicker({ branch, kind, onPick, onClose }: { branch: BranchDetail; kind: 'employee' | 'manager'; onPick: (c: Candidate) => void | Promise<unknown>; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300);
  const [err, setErr] = useState<string | null>(null);
  const qq = { page, page_size: 8, query: dq || undefined };
  const emp = useEmployeeCandidates(branch.id, qq, kind === 'employee');
  const mgr = useManagerCandidates(branch.id, qq, kind === 'manager');
  const list = kind === 'employee' ? emp : mgr;
  const pick = async (c: Candidate) => { setErr(null); try { await onPick(c); } catch (e) { setErr(userMessage(e)); } };
  const cols: Column<Candidate>[] = [
    { key: 'pc', header: 'کد پرسنلی', code: true, render: (c) => <span data-latin>{c.personnel_code || '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (c) => <b>{c.full_name || '—'}</b> },
    { key: 'nid', header: 'کد ملی', code: true, render: (c) => <span data-latin>{c.national_id || '—'}</span> },
    { key: 'mobile', header: 'موبایل', render: (c) => <span className="ltr">{c.phone_number || '—'}</span> },
  ];
  return (
    <Modal open onClose={onClose} title={kind === 'employee' ? 'انتخاب کارمند' : 'انتخاب مسئول شعبه'} width={720}>
      <p className={s.hint}>فقط کسانی که شعبه‌ی محل کارشان «{branch.name}» است نمایش داده می‌شوند {kind === 'employee' ? 'مسئول شعبه و کارمندان فعلی در فهرست نیستند.' : 'کارمندان فعلی شعبه نمی‌توانند مسئول شوند.'}</p>
      {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام، موبایل، کد ملی یا کد پرسنلی" count={list.data ? `${faNum(list.data.total)} نفر` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(c) => c.user_id ?? ''} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} onRowClick={pick}
        empty={<Empty title="کسی پیدا نشد" text="ابتدا در «مدیریت کاربران ⇐ تخصیص شعب» شعبه‌ی محل کار فرد را همین شعبه کنید." />} />
      {list.data && list.data.total > 8 ? <Pagination page={page} pageSize={8} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}

// ── مجوزها ─────────────────────────────────────────────
export function PermitsModal({ branch, onClose }: { branch: BranchDetail; onClose: () => void }) {
  const can = usePerm();
  const w = useBranchWrite(branch.id);
  const toast = useToast();
  const edit = can('organization.branches.permits.update');
  const init = branch.permit ?? { allow_credit_sale: false, allow_cheque_sale: false, allow_consignment_sale: false, allow_scrap_entry: false };
  const [p, setP] = useState({ ...init });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = PERMITS.some((x) => !!p[x.key] !== !!init[x.key]);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await w.permits.mutateAsync(p); toast('مجوزهای شعبه ذخیره شد.'); onClose(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <ResourceShell title="مجوزها" sub={`مجوزهای فروش ${branch.name}`} onClose={onClose} width={620}
      note="تغییرات پس از ذخیره روی فاکتورهای جدید اعمال می‌شود."
      action={edit ? <Button onClick={save} loading={busy} disabled={!dirty}>ذخیره مجوزها</Button> : null}>
      {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
      <div className={s.permits}>
        {PERMITS.map((x) => (
          <div key={x.key} className={s.permit}>
            <div><b>{x.label}</b><small>{x.hint}</small></div>
            <Toggle checked={!!p[x.key]} onChange={(v) => setP((o) => ({ ...o, [x.key]: v }))} disabled={!edit} label={<span className="sr-only">{x.label}</span>} />
          </div>
        ))}
      </div>
    </ResourceShell>
  );
}

