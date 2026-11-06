import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IconChecks, IconPackage, IconSquareX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useDebounced } from '@/shared/lib/useDebounced';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Field, Select } from '@/shared/ui/form';
import { Badge, Empty, Modal, Pagination, Segmented } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { fetchAll } from '@/features/users/api';
import { useAllBrands, useCategoryTree, useItems, usePricesFor, type CategoryNode, type ItemRow } from '@/features/catalog/api';
import {
  GOODS_COLUMNS, GOODS_FILTER_KEYS, goodsDataColumns, GoodsFilters, goodsFilterParams, GRADE_OPTIONS, ITEM_COLUMNS, itemDataColumns, ITEM_PATTERN_OPTIONS,
  PriceBound, selectColumn, useLocalFilters, useModelLineOptions, type FP,
} from '@/features/catalog/catalogTables';
import cs from '@/features/catalog/catalog.module.css';
import { useAssortmentAll, useBranchStockAll, useBranchWrite, type AllowedItemIn, type BranchDetail } from './api';
import s from './branches.module.css';

/**
 * «محصولات مجاز» و «لیست محصولات» شعبه (افشین 2026-10-25):
 * - دو تب کالا (kind=GOOD) و آیتم (kind=ITEM) با همان ستون‌ها و فیلترهای ماژول «محصولات و کاتالوگ»؛
 * - دسته‌بندی سه فیلد آبشاری (اصلی، میانی، فرعی)؛ انتخاب سطح بالاتر به‌تنهایی مجاز است (category_id در catalog زیردرخت را هم می‌گیرد)؛
 * - فهرست مجاز فقط ردیف کالا/آیتم ذخیره می‌کند؛ خالی = همه مجاز (سیاست باز)؛ ردیف‌های دسته‌بندی قدیمی با ذخیره‌ی بعدی حذف می‌شوند.
 */
export type Kind = 'GOOD' | 'ITEM';
type Q = Record<string, string | number | boolean | undefined>;

const flatten = (nodes: CategoryNode[], out = new Map<string, CategoryNode>()) => { for (const n of nodes) { out.set(n.id, n); flatten(n.children ?? [], out); } return out; };
function useCatTree() {
  const tree = useCategoryTree(true);
  const byId = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  return { mains: tree.data ?? [], byId };
}

/* ───────── فیلترهای آیتم (مثل «آیتم‌ها» + دسته‌ی سه‌سطحی) ───────── */
const ITEM_FILTER_KEYS = ['imain', 'imid', 'isub', 'ibrand', 'imodel', 'ipattern', 'igrade', 'ipmin', 'ipmax'] as const;
function itemFilterParams(fp: FP) {
  return {
    category_id: fp.get('isub') || fp.get('imid') || fp.get('imain') || undefined, brand_id: fp.get('ibrand') || undefined, model_line: fp.get('imodel') || undefined,
    variation_pattern: fp.get('ipattern') || undefined, grade: fp.get('igrade') || undefined, min_sale_price: fp.get('ipmin') || undefined, max_sale_price: fp.get('ipmax') || undefined,
  };
}
function ItemFilters({ fp, mains, byId }: { fp: FP; mains: CategoryNode[]; byId: Map<string, CategoryNode> }) {
  const brands = useAllBrands(); const modelOpts = useModelLineOptions();
  const imain = fp.get('imain'), imid = fp.get('imid');
  const mids = byId.get(imain)?.children ?? []; const subs = byId.get(imid)?.children ?? [];
  return (
    <div className={cs.filterRow} style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
      <Select label="دسته اصلی" value={imain} onChange={(e) => fp.set({ imain: e.target.value, imid: null, isub: null })} placeholder="همه" options={mains.map((n) => ({ value: n.id, label: n.name }))} />
      <Select label="دسته میانی" value={imid} disabled={!imain} onChange={(e) => fp.set({ imid: e.target.value, isub: null })} placeholder="همه" options={mids.map((n) => ({ value: n.id, label: n.name }))} />
      <Select label="دسته فرعی" value={fp.get('isub')} disabled={!imid} onChange={(e) => fp.set({ isub: e.target.value })} placeholder="همه" options={subs.map((n) => ({ value: n.id, label: n.name }))} />
      <Select label="برند" value={fp.get('ibrand')} onChange={(e) => fp.set({ ibrand: e.target.value })} placeholder="همه" options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
      <Select label="مدل" value={fp.get('imodel')} onChange={(e) => fp.set({ imodel: e.target.value })} placeholder="همه" options={modelOpts} />
      <Select label="الگوی تنوع" value={fp.get('ipattern')} onChange={(e) => fp.set({ ipattern: e.target.value })} placeholder="همه" options={ITEM_PATTERN_OPTIONS} />
      <Select label="گرید" value={fp.get('igrade')} onChange={(e) => fp.set({ igrade: e.target.value })} placeholder="همه" options={GRADE_OPTIONS} />
      <div style={{ gridColumn: 'span 2' }}><Field label="بازه قیمت آیتم (ریال)"><div className={cs.rangeRow}>
        <PriceBound value={fp.get('ipmin')} onApply={(v) => fp.set({ ipmin: v || null })} label="حداقل قیمت آیتم" placeholder="از" /><span className={cs.muted}>تا</span>
        <PriceBound value={fp.get('ipmax')} onApply={(v) => fp.set({ ipmax: v || null })} label="حداکثر قیمت آیتم" placeholder="تا (بدون سقف)" />
      </div></Field></div>
    </div>
  );
}
const filterParams = (kind: Kind, fp: FP) => (kind === 'GOOD' ? goodsFilterParams(fp) : itemFilterParams(fp));
const filterKeys = (kind: Kind): readonly string[] => (kind === 'GOOD' ? GOODS_FILTER_KEYS : ITEM_FILTER_KEYS);
const filtersActive = (kind: Kind, fp: FP) => filterKeys(kind).some((k) => !!fp.get(k));
const clearFilters = (kind: Kind, fp: FP) => fp.set(Object.fromEntries(filterKeys(kind).map((k) => [k, null])));
function FilterGrid({ kind, fp }: { kind: Kind; fp: FP }) {
  const { mains, byId } = useCatTree();
  return kind === 'GOOD' ? <GoodsFilters fp={fp} mains={mains} byId={byId} /> : <ItemFilters fp={fp} mains={mains} byId={byId} />;
}

/** ستون‌های داده‌ی هر تب (بدون «عملیات» و «قابل عرضه»؛ موجودی در ستون «انبار» کارت شعبه) */
const dataCols = (kind: Kind, prices: Parameters<typeof goodsDataColumns>[0], canPrice: boolean) =>
  (kind === 'GOOD' ? goodsDataColumns(prices, canPrice) : itemDataColumns(prices, canPrice)).filter((c) => c.key !== 'stock');
const GOOD_OPTS: ColumnOption[] = GOODS_COLUMNS.filter((c) => c.key !== 'acts');
const ITEM_OPTS: ColumnOption[] = ITEM_COLUMNS.filter((c) => c.key !== 'acts' && c.key !== 'stock');
const KIND_WORD: Record<Kind, string> = { GOOD: 'کالا', ITEM: 'آیتم' };

function useSaved(branchId: string, enabled = true) {
  const q = useAssortmentAll(branchId, enabled);
  const ids = useMemo(() => new Set((q.data ?? []).map((r) => r.item_id).filter((x): x is string => !!x)), [q.data]);
  const legacy = (q.data ?? []).filter((r) => !r.item_id && r.category_id).length;
  return { q, ids, legacy };
}

// ───────────────────────── مودال «محصولات مجاز» ─────────────────────────
export function AllowedProductsModal({ branch, onClose }: { branch: BranchDetail; onClose: () => void }) {
  const can = usePerm();
  const edit = can('organization.branches.assortment.update');
  const canPrice = can('pricing.prices.list');
  const { q: saved, ids: savedIds, legacy } = useSaved(branch.id);
  const w = useBranchWrite(branch.id);
  const toast = useToast();
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const sel = draft ?? savedIds;
  const [kind, setKind] = useState<Kind>('GOOD');
  const gf = useLocalFilters(); const itf = useLocalFilters();
  const raw = kind === 'GOOD' ? gf : itf;
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [text, setText] = useState(''); const dq = useDebounced(text.trim(), 300);
  const fp: FP = useMemo(() => ({ get: raw.get, set: (x) => { raw.set(x); setPage(1); } }), [raw]);
  const params: Q = { kind, query: dq || undefined, ...filterParams(kind, raw) };
  const list = useItems({ ...params, page, page_size: pageSize });
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const prices = usePricesFor(useMemo(() => rows.map((r) => r.id), [rows]), canPrice);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState<'add' | 'remove' | null>(null);
  const update = (fn: (n: Set<string>) => void) => setDraft((prev) => { const n = new Set(prev ?? savedIds); fn(n); return n; });
  const off = (r: ItemRow) => !edit || r.status === 'ARCHIVED';
  const pickable = rows.filter((r) => !off(r));
  const allOn = pickable.length > 0 && pickable.every((r) => sel.has(r.id));
  const toggle = (r: ItemRow) => { if (!off(r)) update((n) => { if (n.has(r.id)) n.delete(r.id); else n.add(r.id); }); };
  const selCol = selectColumn<ItemRow>({
    isOn: (r) => sel.has(r.id), toggle, label: (r) => `انتخاب ${r.code} به‌عنوان محصول مجاز`, disabled: off,
    allOn, toggleAll: () => update((n) => pickable.forEach((r) => (allOn ? n.delete(r.id) : n.add(r.id)))),
  });
  const prefs = useColumnPrefs(`branches.allowed.${kind}`, kind === 'GOOD' ? GOOD_OPTS : ITEM_OPTS, kind === 'GOOD' ? ['sku', 'barcode', 'buy', 'margin'] : []);
  const cols: Column<ItemRow>[] = [...(edit ? [selCol] : []), ...dataCols(kind, prices, canPrice).filter((c) => prefs.isVisible(c.key))];
  /** «انتخاب همه‌ی نتایج» / «برداشتن همه‌ی نتایج»: همه‌ی صفحه‌های همین جست‌وجو و فیلترها */
  const allResults = async (mode: 'add' | 'remove') => {
    setBulk(mode); setErr(null);
    try {
      const all = (await fetchAll<ItemRow>('/catalog/items', params)).filter((r) => r.status !== 'ARCHIVED');
      update((n) => all.forEach((r) => (mode === 'add' ? n.add(r.id) : n.delete(r.id))));
      toast(mode === 'add' ? `${faNum(all.length)} ${KIND_WORD[kind]} به محصولات مجاز اضافه شد (ذخیره نشده).` : `${faNum(all.length)} ${KIND_WORD[kind]} از محصولات مجاز برداشته شد (ذخیره نشده).`);
    } catch (e) { setErr(userMessage(e)); } finally { setBulk(null); }
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const items = [...sel].map((item_id) => ({ item_id, category_id: null } as AllowedItemIn));
      await w.assortment.mutateAsync(items); setDraft(null);
      toast(items.length ? `محصولات مجاز شعبه ذخیره شد (${faNum(items.length)} مورد).` : 'فهرست خالی ذخیره شد: همه‌ی محصولات در این شعبه مجازند.');
    } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  const total = list.data?.total ?? 0;
  const active = !!dq || filtersActive(kind, raw);
  return (
    <Modal open onClose={onClose} width={1240}
      title={<span className={s.mTitle}><span>محصولات مجاز</span><small>کالاها و آیتم‌هایی که {branch.name} مجاز به فروش آن‌هاست</small></span>}
      footer={<div className={s.mFoot}>
        <span className={s.mNote}>{sel.size ? `${faNum(sel.size)} محصول انتخاب شده${draft ? ' — ذخیره نشده' : ''}.` : 'فهرست خالی است: همه‌ی کالاها و آیتم‌ها در این شعبه مجازند (سیاست باز).'}</span>
        <span className={s.mActs}><Button variant="secondary" onClick={onClose}>بستن</Button>{edit ? <Button onClick={save} loading={busy} disabled={!draft && !legacy}>ذخیره‌ی تغییرات</Button> : null}</span>
      </div>}>
      {legacy ? <div className={s.mErr}><Alert tone="info">{faNum(legacy)} ردیف «دسته‌بندی» از فهرست قبلی مانده؛ فهرست تازه فقط کالا و آیتم نگه می‌دارد و این ردیف‌ها با ذخیره‌ی بعدی حذف می‌شوند.</Alert></div> : null}
      {err ? <div className={s.mErr}><Alert>{err}</Alert></div> : null}
      <div className={cs.famHead} style={{ marginBottom: 6 }}>
        <Segmented value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={[{ value: 'GOOD', label: 'انتخاب کالا' }, { value: 'ITEM', label: 'انتخاب آیتم' }]} />
        <span className={s.mStats}>
          <span className={s.mStat}><b>{faNum(sel.size)}</b>انتخاب‌شده (کالا و آیتم)</span>
          <span className={s.mStat}><b>{faNum(rows.filter((r) => sel.has(r.id)).length)}</b>انتخاب‌شده در این صفحه</span>
        </span>
      </div>
      <TableFilters search={text} onSearch={(v) => { setText(v); setPage(1); }} placeholder={kind === 'GOOD' ? 'جست‌وجو: نام، کد یا بارکد کالا' : 'جست‌وجو: نام یا کد آیتم'}
        count={list.data ? `${faNum(total)} ${KIND_WORD[kind]}` : undefined} extra={<ColumnPicker {...prefs} />}
        onReset={() => { setText(''); clearFilters(kind, fp); }} extraActive={active} />
      <FilterGrid kind={kind} fp={fp} />
      {edit ? (
        <div className={s.bulkBar}>
          <Button size="sm" variant="secondary" icon={<IconChecks size={15} />} loading={bulk === 'add'} disabled={!total || !!bulk} onClick={() => allResults('add')}
            data-tip="همه‌ی نتایج همین جست‌وجو و فیلترها (همه‌ی صفحه‌ها)">انتخاب همه‌ی {faNum(total)} نتیجه</Button>
          <Button size="sm" variant="secondary" icon={<IconSquareX size={15} />} loading={bulk === 'remove'} disabled={!total || !!bulk || !sel.size} onClick={() => allResults('remove')}>برداشتن همه‌ی نتایج</Button>
          <Button size="sm" variant="ghost" disabled={!sel.size} onClick={() => setDraft(new Set())} data-tip="پاک کردن کل فهرست (کالا و آیتم)؛ فهرست خالی یعنی همه مجاز">پاک کردن همه‌ی انتخاب‌ها</Button>
        </div>
      ) : null}
      <div className={cs.compact}>
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading || saved.isLoading} error={list.error ?? saved.error} onRetry={() => { list.refetch(); saved.refetch(); }}
          onRowClick={edit ? toggle : undefined} isSelected={(r) => sel.has(r.id)}
          empty={<Empty icon={<IconPackage size={26} stroke={1.5} />} title={active ? `${KIND_WORD[kind]}ی با این جست‌وجو و فیلترها پیدا نشد` : `هنوز ${KIND_WORD[kind]}ی تعریف نشده`} />} />
      </div>
      {total > 0 ? <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} sizes={[10, 25, 50]} /> : null}
    </Modal>
  );
}

// ───────────────────────── کارت «لیست محصولات» ─────────────────────────
/**
 * محصولات مجاز شعبه (خالی = همه) با موجودی هر انبار شعبه در ستون «انبار» و فیلتر انبار (= دارای موجودی در آن انبار).
 * موقت تا endpoint سمت سرور (B-18): وقتی فهرست مجاز محدود است یا فیلتر انبار فعال است، فهرست کاتالوگ با همان فیلترها کامل خوانده
 * و در مرورگر با فهرست مجاز و موجودی شعبه تطبیق و صفحه‌بندی می‌شود؛ در حالت باز بدون فیلتر انبار صفحه‌بندی سمت سرور است.
 */
export function ProductsTable({ b, kind, lp }: { b: BranchDetail; kind: Kind; lp: ReturnType<typeof useListParams> }) {
  const can = usePerm();
  const canPrice = can('pricing.prices.list');
  const canStock = can('wms.stock.list');
  const { q: saved, ids, legacy } = useSaved(b.id);
  const stock = useBranchStockAll(b.id, canStock);
  const { text, setText, dq } = useSearchState(lp);
  const whF = lp.get('pwh');
  const fp: FP = useMemo(() => ({ get: lp.get, set: (x) => lp.set(x) }), [lp]);
  const params: Q = { kind, query: dq || undefined, ...filterParams(kind, fp) };
  const restricted = ids.size > 0;
  const client = restricted || !!whF;
  const ready = saved.isSuccess;
  const server = useItems({ ...params, page: lp.page, page_size: lp.pageSize }, ready && !client);
  const all = useQuery({ queryKey: ['catalog', 'items', 'all', params], queryFn: () => fetchAll<ItemRow>('/catalog/items', params), enabled: ready && client });
  const qty = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of stock.data ?? []) { if (!r.item?.id || !r.warehouse?.id) continue; const x = m.get(r.item.id) ?? new Map<string, number>(); x.set(r.warehouse.id, Number(r.quantity)); m.set(r.item.id, x); }
    return m;
  }, [stock.data]);
  const filtered = useMemo(() => (all.data ?? []).filter((r) => (!restricted || ids.has(r.id)) && (!whF || (qty.get(r.id)?.get(whF) ?? 0) > 0)), [all.data, restricted, ids, whF, qty]);
  const rows = client ? filtered.slice((lp.page - 1) * lp.pageSize, lp.page * lp.pageSize) : server.data?.results;
  const total = client ? filtered.length : server.data?.total ?? 0;
  const prices = usePricesFor(useMemo(() => (rows ?? []).map((r) => r.id), [rows]), canPrice);
  const whs = b.warehouses;
  const whCol: Column<ItemRow> = {
    key: 'wh', header: 'انبار', render: (r) => {
      if (!canStock) return <span className={s.soon} data-tip="برای دیدن موجودی به مجوز «موجودی انبار» نیاز است">—</span>;
      if (stock.isLoading) return <span className={s.soon}>…</span>;
      return (
        <span className={s.whQty}>
          {whs.map((w) => { const n = qty.get(r.id)?.get(w.warehouse_id) ?? 0; return (
            <span key={w.warehouse_id} data-tip={`${w.name}${w.is_primary ? ' (اصلی)' : ''}: ${faNum(n)}`}>
              {whs.length > 1 ? <small>{w.name}</small> : null}<b className={n > 0 ? s.okText : s.dangerText}>{faNum(n)}</b>
            </span>); })}
        </span>
      );
    },
  };
  const opts = useMemo(() => [...(kind === 'GOOD' ? GOOD_OPTS : ITEM_OPTS), { key: 'wh', label: 'انبار' }], [kind]);
  const prefs = useColumnPrefs(`branches.products.${kind}`, opts, kind === 'GOOD' ? ['sku', 'buy', 'margin'] : []);
  const cols: Column<ItemRow>[] = [...dataCols(kind, prices, canPrice), whCol].filter((c) => prefs.isVisible(c.key));
  const active = !!dq || !!whF || filtersActive(kind, fp);
  const loading = saved.isLoading || (client ? all.isLoading : server.isLoading);
  const error = saved.error ?? (client ? all.error : server.error);
  return (
    <>
      <p className={s.hint}>
        {restricted ? <><Badge tone="info">فهرست محدود</Badge> فقط {faNum(ids.size)} محصولِ انتخاب‌شده در «محصولات مجاز» در این شعبه فروخته می‌شوند.</>
          : <><Badge tone="success">سیاست باز</Badge> «محصولات مجاز» خالی است؛ همه‌ی کالاها و آیتم‌ها در این شعبه مجازند.</>}
        {legacy ? ` ${faNum(legacy)} ردیف دسته‌بندی قدیمی هم در فهرست هست که با ذخیره‌ی بعدی «محصولات مجاز» حذف می‌شود.` : ''}
      </p>
      <TableFilters search={text} onSearch={setText} placeholder={kind === 'GOOD' ? 'جست‌وجو: نام، کد یا بارکد کالا' : 'جست‌وجو: نام یا کد آیتم'}
        filters={canStock ? [{ key: 'pwh', label: 'انبار', value: whF, onChange: lp.setFilter('pwh'), options: whs.map((w) => ({ value: w.warehouse_id, label: w.is_primary ? `${w.name} (اصلی)` : w.name })) }] : []}
        count={rows ? `${faNum(total)} ${KIND_WORD[kind]}` : undefined} extra={<ColumnPicker {...prefs} />}
        onReset={() => clearFilters(kind, fp)} extraActive={filtersActive(kind, fp)} />
      <FilterGrid kind={kind} fp={fp} />
      <div className={cs.compact}>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={loading} error={error} onRetry={() => { saved.refetch(); if (client) all.refetch(); else server.refetch(); }}
          empty={<Empty icon={<IconPackage size={26} stroke={1.5} />} title={active ? `${KIND_WORD[kind]}ی با این جست‌وجو و فیلترها پیدا نشد` : restricted ? `در «محصولات مجاز» ${KIND_WORD[kind]}ی انتخاب نشده` : `هنوز ${KIND_WORD[kind]}ی تعریف نشده`} />} />
      </div>
      {total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
    </>
  );
}
