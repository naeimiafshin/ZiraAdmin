import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IconAward, IconCategory, IconPackage, IconPackages, IconUser, IconUsersGroup, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { useColumnPrefs } from '@/shared/lib/useColumnPrefs';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { PickerField } from '@/shared/ui/form';
import { Badge, Empty, Modal, Pagination, UnderlineTabs } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useActiveCustomerGroups, useAllBrands, useBundlePolicies, useBundles, useCategoryTree, useItems, usePricesFor, type BundleRow, type CategoryNode, type ItemRow } from '@/features/catalog/api';
import { GRADE_OPTIONS, ITEM_COLUMNS, itemDataColumns, ITEM_PATTERN_OPTIONS, selectColumn, useLocalFilters, useModelLineOptions } from '@/features/catalog/catalogTables';
import { bundleStatus } from '@/features/catalog/labels';
import { useCustomers, type CustomerRow } from '@/features/customers/api';
import { fetchAll } from '@/features/users/api';
import type { AdminSchemas } from '@/shared/api/types';
import { COOP_LEVEL } from './marketingLabels';
import type { AudienceIn, TargetIn } from './marketingApi';
import m from './marketing.module.css';
import c from '@/features/catalog/catalog.module.css';

type GroupRow = AdminSchemas['GroupListOut'];
const useCustomerGroupsFull = () => useQuery({ queryKey: ['customers', 'groups', 'full-active'], queryFn: () => fetchAll<GroupRow>('/customers/groups', { is_active: true }), staleTime: 60_000 });

/**
 * انتخاب «دامنه» تخفیف/کمپین: هدف‌ها (آیتم، باندل، دسته‌بندی ⇐ TargetIn) یا مخاطب‌ها (مشتری، گروه، سطح همکاری ⇐ AudienceIn).
 * فهرست خالی = «همه» (همه محصولات / همه مشتریان). فقط آیتم، باندل، دسته، مشتری و گروه فعال قابل انتخاب است.
 */
export type PickType = 'ITEM' | 'BUNDLE' | 'CATEGORY' | 'CUSTOMER' | 'GROUP' | 'COOPERATION_LEVEL';
export type Pick = { type: PickType; id: string; label: string };
export const TARGET_TYPES: PickType[] = ['ITEM', 'BUNDLE', 'CATEGORY'];
export const AUDIENCE_TYPES: PickType[] = ['CUSTOMER', 'GROUP', 'COOPERATION_LEVEL'];
/** تخفیف‌ساز و کد تخفیف: فقط آیتم و باندل (افشین 2026-10-24) */
export const ITEM_TARGETS: PickType[] = ['ITEM', 'BUNDLE'];
const TAB: Record<PickType, { label: string; icon: typeof IconUser }> = {
  ITEM: { label: 'آیتم', icon: IconPackage }, BUNDLE: { label: 'باندل', icon: IconPackages }, CATEGORY: { label: 'دسته‌بندی', icon: IconCategory },
  CUSTOMER: { label: 'مشتری', icon: IconUser }, GROUP: { label: 'گروه مشتریان', icon: IconUsersGroup }, COOPERATION_LEVEL: { label: 'سطح همکاری', icon: IconAward },
};

export const toTargets = (p: Pick[]): TargetIn[] => p.filter((x) => TARGET_TYPES.includes(x.type)).map((x) => ({ target_type: x.type as TargetIn['target_type'], target_id: x.id }));
export const toAudiences = (p: Pick[]): AudienceIn[] => p.filter((x) => AUDIENCE_TYPES.includes(x.type)).map((x) =>
  x.type === 'CUSTOMER' ? { audience_type: 'CUSTOMER', customer_id: x.id } : x.type === 'GROUP' ? { audience_type: 'GROUP', customer_group_id: x.id } : { audience_type: 'COOPERATION_LEVEL', cooperation_level: x.id as AudienceIn['cooperation_level'] });
export const fromTargets = (t: { target_type: string; target_id: string; label: string }[]): Pick[] => t.map((x) => ({ type: x.target_type as PickType, id: x.target_id, label: x.label }));
/** مخاطب‌های ذخیره‌شده ⇐ Pick؛ برچسب از بک‌اند (AudienceOut.label: مشتری = «نام و نام خانوادگی» (P-12 ✅، دیگر درخواست جدا برای هر مشتری نیست) / نام گروه) — نبودش ⇐ نام گروه از فهرست گروه‌ها */
export const fromAudiences = (a: { audience_type: string; customer_id?: string | null; customer_group_id?: string | null; cooperation_level?: string | null; label?: string }[], groups?: { id: string; name: string }[]): Pick[] =>
  a.map((x): Pick => x.audience_type === 'CUSTOMER' ? { type: 'CUSTOMER', id: x.customer_id ?? '', label: x.label || 'مشتری' }
    : x.audience_type === 'GROUP' ? { type: 'GROUP', id: x.customer_group_id ?? '', label: x.label || groups?.find((g) => g.id === x.customer_group_id)?.name || 'گروه مشتریان' }
      : { type: 'COOPERATION_LEVEL', id: x.cooperation_level ?? '', label: `سطح ${COOP_LEVEL[x.cooperation_level ?? ''] ?? x.cooperation_level}` });
export const summarize = (p: Pick[], all: string) => (p.length === 0 ? all : p.length <= 2 ? p.map((x) => x.label).join('، ') : `${p.slice(0, 2).map((x) => x.label).join('، ')} و ${faNum(p.length - 2)} مورد دیگر`);

/** فیلد انتخاب دامنه + تراشه‌های انتخاب‌شده */
export function ScopeField({ label, all, types, value, onChange, required, hint, disabled }: {
  label: string; all: string; types: PickType[]; value: Pick[]; onChange: (p: Pick[]) => void; required?: boolean; hint?: ReactNode; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={m.scope}>
      <PickerField label={label} required={required} hint={hint} disabled={disabled} value={value.length ? summarize(value, all) : null} placeholder={all}
        icon={types[0] === 'CUSTOMER' || types[0] === 'GROUP' ? <IconUsersGroup size={17} /> : <IconPackage size={17} />} onOpen={() => setOpen(true)} onClear={() => onChange([])} />
      {value.length ? (
        <div className={m.chips}>
          {value.map((x) => (
            <span key={`${x.type}:${x.id}`} className={m.chip}><small>{TAB[x.type].label}</small>{x.label}
              {disabled ? null : <button type="button" aria-label={`حذف ${x.label}`} onClick={() => onChange(value.filter((y) => !(y.type === x.type && y.id === x.id)))}><IconX size={12} /></button>}
            </span>
          ))}
        </div>
      ) : null}
      {open ? <ScopeModal title={label} types={types} value={value} onClose={() => setOpen(false)} onDone={(p) => { onChange(p); setOpen(false); }} /> : null}
    </div>
  );
}

/**
 * مودال انتخاب دامنه (افشین 2026-10-24): هر تب یک جدول کامل با جست‌وجو، فیلترها، «انتخاب ستون‌ها» و مربع انتخاب (سرستون = همه‌ی ردیف‌های صفحه)؛
 * انتخاب‌ها بین تب‌ها و صفحه‌ها می‌ماند. آیتم = همان جدول و فیلترهای منوی «آیتم‌ها» (kind=ITEM)؛ باندل، دسته‌بندی، مشتری (نام و نام خانوادگی، فروشگاه، گروه، سطح)،
 * گروه مشتریان (سطح، اعضا، بازاریاب) و سطح همکاری. آرشیو/غیرفعال قابل انتخاب نیست.
 */
type TabProps = { isOn: (id: string) => boolean; toggle: (id: string, label: string) => void; setMany: (rows: { id: string; label: string }[], on: boolean) => void };
export function ScopeModal({ title, types, value, onClose, onDone }: { title: string; types: PickType[]; value: Pick[]; onClose: () => void; onDone: (p: Pick[]) => void }) {
  const [tab, setTab] = useState<PickType>(types[0] ?? 'ITEM');
  const [sel, setSel] = useState<Pick[]>(value);
  const count = (t: PickType) => sel.filter((x) => x.type === t).length;
  const tp: TabProps = {
    isOn: (id) => sel.some((x) => x.type === tab && x.id === id),
    toggle: (id, label) => setSel((s0) => (s0.some((x) => x.type === tab && x.id === id) ? s0.filter((x) => !(x.type === tab && x.id === id)) : [...s0, { type: tab, id, label }])),
    setMany: (rows, on) => setSel((s0) => (on ? [...s0, ...rows.filter((r) => !s0.some((x) => x.type === tab && x.id === r.id)).map((r) => ({ type: tab, id: r.id, label: r.label }))] : s0.filter((x) => !(x.type === tab && rows.some((r) => r.id === x.id))))),
  };
  return (
    <Modal open onClose={onClose} title={title} width={1120}
      footer={<><span className={m.pickFootCount} data-scope-count>{sel.length ? summarize(sel, '') : 'چیزی انتخاب نشده (= همه)'}</span><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={() => onDone(sel)} data-scope-done>تأیید ({faNum(sel.length)})</Button></>}>
      {types.length > 1 ? <UnderlineTabs value={tab} onChange={setTab} options={types.map((t) => ({ value: t, label: <>{TAB[t].label}{count(t) ? ` (${faNum(count(t))})` : ''}</> }))} /> : null}
      <div style={{ marginTop: types.length > 1 ? 12 : 0 }} data-scope-tab={tab}>
        {tab === 'ITEM' ? <ItemTab {...tp} /> : tab === 'BUNDLE' ? <BundleTab {...tp} /> : tab === 'CATEGORY' ? <CategoryTab {...tp} /> : tab === 'CUSTOMER' ? <CustomerTab {...tp} /> : tab === 'GROUP' ? <GroupTab {...tp} /> : <LevelTab {...tp} />}
      </div>
    </Modal>
  );
}

function sel<T extends { id: string }>(p: TabProps, rows: T[], label: (r: T) => string, disabled?: (r: T) => boolean): Column<T> {
  const ok = rows.filter((r) => !disabled?.(r));
  const allOn = ok.length > 0 && ok.every((r) => p.isOn(r.id));
  return selectColumn<T>({ isOn: (r) => p.isOn(r.id), toggle: (r) => { if (!disabled?.(r)) p.toggle(r.id, label(r)); }, label: (r) => `انتخاب ${label(r)}`, disabled, allOn, toggleAll: () => p.setMany(ok.map((r) => ({ id: r.id, label: label(r) })), !allOn) });
}
const usePage = () => { const [page, setPage] = useState(1); const [ps, setPs] = useState(10); return { page, ps, setPage, setPs: (n: number) => { setPs(n); setPage(1); } }; };
const Pager = ({ total, pg }: { total?: number; pg: ReturnType<typeof usePage> }) => (total ? <Pagination page={pg.page} pageSize={pg.ps} total={total} onPage={pg.setPage} onPageSize={pg.setPs} sizes={[10, 25, 50]} /> : null);

/** آیتم‌ها: همان ستون‌ها و فیلترهای منوی «آیتم‌ها» (دسته اصلی/میانی/فرعی، برند، مدل، الگوی تنوع، گرید، بازه قیمت) */
function ItemTab(p: TabProps) {
  const can = usePerm(); const pg = usePage();
  const [q, setQ] = useState(''); const dq = useDebounced(q, 300); const f = useLocalFilters();
  const tree = useCategoryTree(true); const brands = useAllBrands(); const modelOpts = useModelLineOptions();
  const byId = useMemo(() => { const mp = new Map<string, CategoryNode>(); const walk = (ns: CategoryNode[]) => ns.forEach((n) => { mp.set(n.id, n); walk(n.children ?? []); }); walk(tree.data ?? []); return mp; }, [tree.data]);
  const set = (x: Record<string, string | null>) => { f.set(x); pg.setPage(1); };
  const [lo, hi] = (f.get('price') || '-').split('-');
  const list = useItems({ kind: 'ITEM', page: pg.page, page_size: pg.ps, query: dq || undefined, category_id: f.get('sub') || f.get('mid') || f.get('main') || undefined, brand_id: f.get('brand') || undefined, model_line: f.get('model') || undefined, variation_pattern: f.get('pattern') || undefined, grade: f.get('grade') || undefined, min_sale_price: lo || undefined, max_sale_price: hi || undefined });
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const canPrice = can('pricing.prices.list');
  const prices = usePricesFor(rows.map((r) => r.id), canPrice);
  const prefs = useColumnPrefs('pricing.scope.items', ITEM_COLUMNS.filter((c) => c.key !== 'acts'), ['stock']);
  const off = (r: ItemRow) => r.status === 'ARCHIVED';
  const cols: Column<ItemRow>[] = [sel(p, rows, (r) => r.display_name, off), ...itemDataColumns(prices, canPrice, true).filter((c) => prefs.isVisible(c.key))];
  return (
    <>
      <TableFilters stacked search={q} onSearch={(v) => { setQ(v); pg.setPage(1); }} placeholder="جستجوی نام یا کد آیتم…" filters={[
        { key: 'main', label: 'دسته اصلی', value: f.get('main'), onChange: (v) => set({ main: v, mid: null, sub: null }), options: (tree.data ?? []).map((n) => ({ value: n.id, label: n.name })) },
        { key: 'mid', label: 'دسته میانی', value: f.get('mid'), onChange: (v) => set({ mid: v, sub: null }), options: (byId.get(f.get('main'))?.children ?? []).map((n) => ({ value: n.id, label: n.name })) },
        { key: 'sub', label: 'دسته فرعی', value: f.get('sub'), onChange: (v) => set({ sub: v }), options: (byId.get(f.get('mid'))?.children ?? []).map((n) => ({ value: n.id, label: n.name })) },
        { key: 'brand', label: 'برند', value: f.get('brand'), onChange: (v) => set({ brand: v }), options: (brands.data ?? []).map((b) => ({ value: b.id, label: b.name })) },
        { key: 'model', label: 'مدل', value: f.get('model'), onChange: (v) => set({ model: v }), options: modelOpts },
        { key: 'pattern', label: 'الگوی تنوع', value: f.get('pattern'), onChange: (v) => set({ pattern: v }), options: ITEM_PATTERN_OPTIONS },
        { key: 'grade', label: 'گرید', value: f.get('grade'), onChange: (v) => set({ grade: v }), options: GRADE_OPTIONS },
        { key: 'price', label: 'بازه قیمت', value: f.get('price'), onChange: (v) => set({ price: v }), options: [], range: { unit: 'ریال' } },
      ]} extra={<ColumnPicker {...prefs} />} count={list.data ? `${faNum(list.data.total)} آیتم` : undefined} />
      <div className={c.compact} data-scope-table><DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(r) => { if (!off(r)) p.toggle(r.id, r.display_name); }} isSelected={(r) => p.isOn(r.id)} empty={<Empty title="آیتمی با این فیلترها پیدا نشد" />} /></div>
      <Pager total={list.data?.total} pg={pg} />
    </>
  );
}

function BundleTab(p: TabProps) {
  const pg = usePage(); const [q, setQ] = useState(''); const dq = useDebounced(q, 300); const [policy, setPolicy] = useState(''); const [act, setAct] = useState('');
  const policies = useBundlePolicies();
  const list = useBundles({ page: pg.page, page_size: pg.ps, query: dq || undefined, policy: policy || undefined, is_active: act === '' ? undefined : act === 'on' });
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const cols: Column<BundleRow>[] = [sel(p, rows, (b) => b.name),
    { key: 'code', header: 'کد باندل', render: (b) => <span className={c.codeChip} data-latin>{b.code}</span> },
    { key: 'name', header: 'نام باندل', render: (b) => <span className={`${c.strong} ${c.famName}`} style={{ maxWidth: 280 }} data-tip={b.name}>{b.name}</span> },
    { key: 'policy', header: 'سیاست', render: (b) => b.policy_name || b.policy },
    { key: 'lines', header: 'اقلام', render: (b) => <span className="tnum">{faNum(b.line_count)}</span> },
    { key: 'qty', header: 'تعداد کل کالا', render: (b) => <span className="tnum">{faNum(Number(b.total_qty))}</span> },
    { key: 'st', header: 'وضعیت', render: (b) => <Badge tone={bundleStatus(b).tone}>{bundleStatus(b).label}</Badge> },
    { key: 'created', header: 'تاریخ ایجاد', render: (b) => faDate(b.created_at) },
  ];
  return (
    <>
      <TableFilters stacked search={q} onSearch={(v) => { setQ(v); pg.setPage(1); }} placeholder="جستجوی نام یا کد باندل…" filters={[
        { key: 'policy', label: 'سیاست باندل', value: policy, onChange: (v) => { setPolicy(v); pg.setPage(1); }, options: (policies.data ?? []).map((x) => ({ value: x.code, label: x.name })) },
        { key: 'act', label: 'وضعیت', value: act, onChange: (v) => { setAct(v); pg.setPage(1); }, options: [{ value: 'on', label: 'فعال' }, { value: 'off', label: 'غیرفعال' }] },
      ]} count={list.data ? `${faNum(list.data.total)} باندل` : undefined} />
      <div className={c.compact} data-scope-table><DataTable columns={cols} rows={list.data?.results} rowKey={(b) => b.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(b) => p.toggle(b.id, b.name)} isSelected={(b) => p.isOn(b.id)} empty={<Empty title="باندلی پیدا نشد" />} /></div>
      <Pager total={list.data?.total} pg={pg} />
    </>
  );
}

function CategoryTab(p: TabProps) {
  const [q, setQ] = useState(''); const [lvl, setLvl] = useState('');
  const cats = useCategoryTree(false);
  const rows = useMemo(() => { const out: { id: string; name: string; level: number; path: string }[] = []; const walk = (ns: CategoryNode[] | undefined, path: string[]) => (ns ?? []).forEach((n) => { if (n.is_active) out.push({ id: n.id, name: n.name, level: n.level, path: [...path, n.name].join(' › ') }); walk(n.children, [...path, n.name]); }); walk(cats.data, []); return out; }, [cats.data]);
  const shown = rows.filter((r) => (!q.trim() || r.path.includes(q.trim())) && (!lvl || String(r.level) === lvl));
  const cols: Column<(typeof rows)[number]>[] = [sel(p, shown, (r) => r.name),
    { key: 'name', header: 'دسته‌بندی', render: (r) => <span className={c.strong}>{r.name}</span> },
    { key: 'path', header: 'مسیر', render: (r) => <span className={c.muted}>{r.path}</span> },
    { key: 'lvl', header: 'سطح', render: (r) => ['', 'اصلی', 'میانی', 'فرعی'][r.level] ?? faNum(r.level) },
  ];
  return (
    <>
      <TableFilters stacked search={q} onSearch={setQ} placeholder="جستجوی نام دسته…" filters={[{ key: 'lvl', label: 'سطح', value: lvl, onChange: setLvl, options: [{ value: '1', label: 'اصلی' }, { value: '2', label: 'میانی' }, { value: '3', label: 'فرعی' }] }]} count={`${faNum(shown.length)} دسته`} />
      <div className={c.compact} data-scope-table style={{ maxHeight: 460, overflow: 'auto' }}><DataTable columns={cols} rows={cats.isLoading ? undefined : shown} rowKey={(r) => r.id} loading={cats.isLoading} onRowClick={(r) => p.toggle(r.id, r.name)} isSelected={(r) => p.isOn(r.id)} empty={<Empty title="دسته‌ای پیدا نشد" />} /></div>
    </>
  );
}

/** مشتریان: نام و نام خانوادگی، فروشگاه، موبایل، گروه‌ها، سطح همکاری، وضعیت؛ فیلتر گروه، سطح، نوع و وضعیت */
function CustomerTab(p: TabProps) {
  const pg = usePage(); const [q, setQ] = useState(''); const dq = useDebounced(q, 300);
  const [grp, setGrp] = useState(''); const [lvl, setLvl] = useState(''); const [st, setSt] = useState('');
  const groups = useActiveCustomerGroups(true);
  const list = useCustomers({ page: pg.page, page_size: pg.ps, query: dq || undefined, group_id: grp || undefined, cooperation_level: lvl || undefined, status: st || undefined });
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const name = (r: CustomerRow) => r.full_name || r.store_name || r.code;
  const off = (r: CustomerRow) => r.is_blacklisted;
  const cols: Column<CustomerRow>[] = [sel(p, rows, name, off),
    { key: 'code', header: 'کد مشتری', render: (r) => <span className="ltr" data-latin>{r.code}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (r) => <span className={c.strong}>{r.full_name || '—'}</span> },
    { key: 'store', header: 'نام فروشگاه', render: (r) => r.store_name || <span className={c.muted}>—</span> },
    { key: 'mobile', header: 'موبایل', render: (r) => <span className="ltr" data-latin>{r.mobile || '—'}</span> },
    { key: 'groups', header: 'گروه', render: (r) => (r.group_names?.length ? <span className={c.famName} style={{ maxWidth: 150 }} data-tip={r.group_names.join('، ')}>{r.group_names.join('، ')}</span> : <span className={c.muted}>—</span>) },
    { key: 'level', header: 'سطح همکاری', render: (r) => r.cooperation_level_display || COOP_LEVEL[r.cooperation_level ?? ''] || '—' },
    { key: 'status', header: 'وضعیت', render: (r) => (r.is_blacklisted ? <Badge tone="danger">لیست سیاه</Badge> : <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{r.status_display}</Badge>) },
  ];
  return (
    <>
      <TableFilters stacked search={q} onSearch={(v) => { setQ(v); pg.setPage(1); }} placeholder="جستجوی نام، کد، موبایل یا فروشگاه…" filters={[
        { key: 'grp', label: 'گروه مشتریان', value: grp, onChange: (v) => { setGrp(v); pg.setPage(1); }, options: (groups.data ?? []).map((g) => ({ value: g.id, label: g.name })) },
        { key: 'lvl', label: 'سطح همکاری', value: lvl, onChange: (v) => { setLvl(v); pg.setPage(1); }, options: Object.entries(COOP_LEVEL).map(([value, label]) => ({ value, label })) },
        { key: 'st', label: 'وضعیت', value: st, onChange: (v) => { setSt(v); pg.setPage(1); }, options: [{ value: 'ACTIVE', label: 'فعال' }, { value: 'PENDING', label: 'در انتظار تأیید' }, { value: 'INACTIVE', label: 'غیرفعال' }] },
      ]} count={list.data ? `${faNum(list.data.total)} مشتری` : undefined} />
      <div className={c.compact} data-scope-table><DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(r) => { if (!off(r)) p.toggle(r.id, name(r)); }} isSelected={(r) => p.isOn(r.id)} empty={<Empty title="مشتری‌ای پیدا نشد" />} /></div>
      <Pager total={list.data?.total} pg={pg} />
    </>
  );
}

function GroupTab(p: TabProps) {
  const [q, setQ] = useState(''); const [lvl, setLvl] = useState('');
  const groups = useCustomerGroupsFull();
  const shown = (groups.data ?? []).filter((g) => (!q.trim() || g.name.includes(q.trim()) || (g.code ?? '').includes(q.trim())) && (!lvl || g.cooperation_level === lvl));
  const cols: Column<GroupRow>[] = [sel(p, shown, (g) => g.name),
    { key: 'code', header: 'کد گروه', render: (g) => <span className="ltr" data-latin>{g.code}</span> },
    { key: 'name', header: 'نام گروه', render: (g) => <span className={c.strong}>{g.name}</span> },
    { key: 'level', header: 'سطح همکاری', render: (g) => COOP_LEVEL[g.cooperation_level ?? ''] ?? '—' },
    { key: 'members', header: 'تعداد اعضا', render: (g) => <span className="tnum">{faNum(g.member_count ?? 0)}</span> },
    { key: 'marketer', header: 'بازاریاب', render: (g) => g.current_marketer?.full_name || <span className={c.muted}>—</span> },
  ];
  return (
    <>
      <TableFilters stacked search={q} onSearch={setQ} placeholder="جستجوی نام یا کد گروه…" filters={[{ key: 'lvl', label: 'سطح همکاری', value: lvl, onChange: setLvl, options: Object.entries(COOP_LEVEL).map(([value, label]) => ({ value, label })) }]} count={`${faNum(shown.length)} گروه`} />
      <div className={c.compact} data-scope-table style={{ maxHeight: 460, overflow: 'auto' }}><DataTable columns={cols} rows={groups.isLoading ? undefined : shown} rowKey={(g) => g.id} loading={groups.isLoading} onRowClick={(g) => p.toggle(g.id, g.name)} isSelected={(g) => p.isOn(g.id)} empty={<Empty title="گروهی پیدا نشد" />} /></div>
    </>
  );
}

function LevelTab(p: TabProps) {
  const rows = Object.entries(COOP_LEVEL).map(([id, l]) => ({ id, name: `سطح ${l}` }));
  const cols: Column<(typeof rows)[number]>[] = [sel(p, rows, (r) => r.name), { key: 'name', header: 'سطح همکاری', render: (r) => <span className={c.strong}>{r.name}</span> }];
  return <div className={c.compact} data-scope-table><DataTable columns={cols} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => p.toggle(r.id, r.name)} isSelected={(r) => p.isOn(r.id)} /></div>;
}
