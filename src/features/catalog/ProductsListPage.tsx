import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconArchive, IconDownload, IconPencil, IconPlus, IconSearch } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { Select } from '@/shared/ui/form';
import { Badge, Card, Empty, PageHead, Pagination, SectionTitle } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { downloadXlsx, useAllBrands, useCategoryTree, useItems, useItemWrite, usePricesFor, useProducts, useProductWrite, type CategoryNode, type ItemRow, type ProductRow } from './api';
import { ConfirmModal, IconButton } from './components';
import { FamilyModal } from './FamilyModal';
import { GoodEditModal } from './GoodEditModal';
import s from './catalog.module.css';
import { ClearFilters, clearGoodsFilters, GOODS_COLUMNS, goodsDataColumns, GoodsFilters, goodsFiltersActive, goodsFilterParams, type FP } from './catalogTables';

/**
 * «کالاها (کوچک‌ترین واحد قابل تعریف)» — مطابق html Fixed V2 (افشین 2026-10-22):
 * بالا کارت «خانواده‌های کالا (ماتریس‌های تعریف‌شده)» با سه فیلتر دسته + جست‌وجو و جدول خانواده‌ها (کلیک روی خانواده، لیست پایین را فیلتر می‌کند)؛
 * پایین «لیست کالاها» (کالای تکی = kind GOOD) با فیلتر برند/سایز/رنگ + جست‌وجو. داده: GET /catalog/products و GET /catalog/items؛
 * قیمت فروش از pricing (GET /pricing/prices/{item_id})، قیمت خرید و حاشیه تا ماژول خرید «—». ویرایش خانواده = مودال (html: editFam).
 * حالت (فیلترها، خانواده‌ی انتخاب‌شده، صفحه) در URL.
 * اصلاحات افشین 2026-10-23: فیلتر برند خانواده‌ها (brand_id)؛ سواچ رنگ ۷۰٪ و هم‌راستا با نقطه‌ی وضعیت؛ ابعاد ماتریس چپ‌به‌راست («۳ × ۴ = ۱۲»)؛
 * فیلترهای لیست کالاها به ترتیب فرم تعریف کالا (دسته اصلی/میانی/فرعی، برند، طرح، جنس، سایز، رنگ، بازه قیمت فروش) — طرح ⇐ model_line (گزینه‌ها از
 * suggestions ویژگی MODEL_LINE)، جنس ⇐ attribute_value_ids (مقدارهای ویژگی MATERIAL)، بازه‌ی قیمت ⇐ min/max_sale_price (C-25 ✅)؛ دسته‌های لیست کالاها مستقل از دسته‌های خانواده‌ها (gmain/gmid/gsub)؛
 * انتخاب ستون‌ها برای هر دو جدول (useColumnPrefs، برای هر کاربر)؛ دکمه‌ی آیکونی «حذف فیلترها» (IconFilterOff، مثل TableFilters).
 */
const flatten = (nodes: CategoryNode[], out = new Map<string, CategoryNode>()) => { for (const n of nodes) { out.set(n.id, n); flatten(n.children ?? [], out); } return out; };
type LP = ReturnType<typeof useListParams>;

export default function ProductsListPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const lp = useListParams({ page_size: 10 });
  const tree = useCategoryTree(true);
  const byId = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const main = lp.get('main'); const mid = lp.get('mid'); const sub = lp.get('sub');
  const catId = sub || mid || main || undefined;
  return (
    <>
      <PageHead title="کالاها (کوچک‌ترین واحد قابل تعریف)"
        sub="هر ترکیب سایز و رنگ یک کالای مستقل است — مثلاً شورت L قرمز و شورت XL آبی دو کالای متفاوت‌اند. کالاها به‌صورت ماتریسی تعریف می‌شوند و پس از آن با ادغام آن‌ها آیتم (واحد فروش) ساخته می‌شود."
        actions={<>
          {/* افشین 2026-10-25: خروجی خانواده‌ها کنار «تعریف ماتریسی کالا» و هم‌اندازه‌ی آن (فیلترهای کارت خانواده‌ها) */}
          {can('catalog.products.export') ? <XlsxButton label="خروجی اکسل خانواده‌ها" path="/catalog/products/export" file="products.xlsx" params={{ q: lp.get('fq') || undefined, category_id: catId, brand_id: lp.get('fbrand') || undefined }} /> : null}
          {can('catalog.products.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/catalog/products/new')}>تعریف ماتریسی کالا</Button> : null}
        </>} />
      <div className={s.stack}>
        <FamiliesCard lp={lp} byId={byId} mains={tree.data ?? []} main={main} mid={mid} sub={sub} catId={catId} />
        <GoodsCard lp={lp} byId={byId} mains={tree.data ?? []} />
      </div>
    </>
  );
}

function catPath(byId: Map<string, CategoryNode>, id: string): string {
  const parts: string[] = [];
  for (let n = byId.get(id); n; n = n.parent_id ? byId.get(n.parent_id) : undefined) parts.unshift(n.name);
  return parts.join(' › ') || '—';
}

function FamiliesCard({ lp, byId, mains, main, mid, sub, catId }: { lp: LP; byId: Map<string, CategoryNode>; mains: CategoryNode[]; main: string; mid: string; sub: string; catId?: string }) {
  const can = usePerm();
  const toast = useToast();
  const w = useProductWrite();
  const fam = lp.get('fam');
  const [fq, setFq] = useState(lp.get('fq'));
  const fpage = Math.max(1, Number(lp.get('fpage')) || 1);
  const brands = useAllBrands();
  const fsize = [10, 25, 50].includes(Number(lp.get('fsize'))) ? Number(lp.get('fsize')) : 10;
  const list = useProducts({ page: fpage, page_size: fsize, query: lp.get('fq') || undefined, category_id: catId, brand_id: lp.get('fbrand') || undefined });
  const factive = !!(lp.get('fq') || catId || lp.get('fbrand'));
  const [edit, setEdit] = useState<ProductRow | null>(null);
  const [arch, setArch] = useState<ProductRow | null>(null);
  const mids = byId.get(main)?.children ?? []; const subs = byId.get(mid)?.children ?? [];
  const status = (p: ProductRow) => (p.status === 'ARCHIVED' ? <Badge tone="neutral">آرشیو</Badge> : p.status === 'DRAFT' ? <Badge tone="info">پیش‌نویس</Badge> : p.is_complete ? <Badge tone="success">کامل</Badge> : <Badge tone="warning">ناقص</Badge>);
  const cols: Column<ProductRow>[] = [
    { key: 'code', header: 'کد خانواده', code: true, render: (p) => <span className="ltr" data-latin>{p.code}</span> },
    { key: 'path', header: 'دسته اصلی › میانی › فرعی', render: (p) => <span className={`${s.strong} ${s.famName}`} style={{ maxWidth: 200 }} data-tip={catPath(byId, p.category_id)}>{catPath(byId, p.category_id)}</span> },
    { key: 'brand', header: 'برند', render: (p) => p.brand_name },
    { key: 'model', header: 'طرح', render: (p) => (p.model_line_name ? <span className={s.famName} style={{ maxWidth: 140 }} data-tip={p.model_line_name}>{p.model_line_name}</span> : <span className={s.muted}>—</span>) },
    { key: 'material', header: 'جنس', render: (p) => p.material_name || <span className={s.muted}>—</span> },
    // ابعاد به ترتیب ریاضی (چپ‌به‌راست): «سایز × رنگ = کالا»
    { key: 'dims', header: 'ابعاد ماتریس', render: (p) => <bdi dir="ltr" className={`${s.dimsText} tnum`} data-tip={`${faNum(p.good_count)} کالا · ${faNum(p.item_count)} آیتم`}>{faNum(p.size_count)} × {faNum(p.color_count)} = {faNum(p.size_count * p.color_count)}</bdi> },
    { key: 'colors', header: 'رنگ‌ها', render: (p) => <FamilyColors colors={p.colors ?? []} /> },
    { key: 'status', header: 'وضعیت', render: (p) => status(p) },
    {
      key: 'acts', header: 'عملیات', render: (p) => (
        <span className={s.rowActions}>
          {can('catalog.products.read') ? <IconButton label="ویرایش خانواده" onClick={() => setEdit(p)}><IconPencil size={15} /></IconButton> : null}
          {can('catalog.products.delete') && p.status !== 'ARCHIVED' ? <IconButton label="آرشیو خانواده" danger onClick={() => setArch(p)}><IconArchive size={15} /></IconButton> : null}
        </span>
      ),
    },
  ];
  const prefs = useColumnPrefs('catalog.families', FAMILY_COLUMNS);
  const shown = cols.filter((c) => prefs.isVisible(c.key));
  const clear = () => { setFq(''); lp.set({ fq: null, main: null, mid: null, sub: null, fbrand: null, fam: null, fpage: null }); };
  const selected = fam ? list.data?.results.find((p) => p.id === fam) : undefined;
  return (
    <Card>
      <div className={s.famHead}>
        <SectionTitle extra={list.data ? <span className={s.famCount}>{faNum(list.data.results.length)} از {faNum(list.data.total)}</span> : null}>خانواده‌های کالا (ماتریس‌های تعریف‌شده)</SectionTitle>
        <div className={s.famTools}>
          <label className={s.famSearch}><IconSearch size={16} className={s.muted} /><input value={fq} onChange={(e) => { setFq(e.target.value); lp.set({ fq: e.target.value, fpage: null }); }} placeholder="جستجوی خانواده، طرح یا برند…" aria-label="جستجوی خانواده" /></label>
          <ColumnPicker {...prefs} />
        </div>
      </div>
      <p className={s.intro} style={{ marginTop: 4 }}>دسته‌بندی سه‌سطحی پیش از تعریف ماتریس روی کالاها اعمال می‌شود؛ فیلترها به ترتیب دسته اصلی › دسته میانی › دسته فرعی فعال می‌شوند.</p>
      <div className={s.filterRow} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) auto' }}>
        <Select label="دسته اصلی" value={main} onChange={(e) => lp.set({ main: e.target.value, mid: null, sub: null, fam: null, fpage: null })} placeholder="همه" options={mains.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="دسته میانی" value={mid} disabled={!main} onChange={(e) => lp.set({ mid: e.target.value, sub: null, fam: null, fpage: null })} placeholder="همه" options={mids.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="دسته فرعی" value={sub} disabled={!mid} onChange={(e) => lp.set({ sub: e.target.value, fam: null, fpage: null })} placeholder="همه" options={subs.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="برند" value={lp.get('fbrand')} onChange={(e) => lp.set({ fbrand: e.target.value, fam: null, fpage: null })} placeholder="همه" options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
        <ClearFilters onClick={clear} disabled={!factive} />
      </div>
      <div className={s.compact}><DataTable columns={shown} rows={list.data?.results} rowKey={(p) => p.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(p) => lp.set({ fam: fam === p.id ? null : p.id })} isSelected={(p) => p.id === fam}
        empty={<Empty title={factive ? 'خانواده‌ای با این شرایط نیست' : 'هنوز خانواده‌ای تعریف نشده است'} text={factive ? undefined : 'با «تعریف ماتریسی کالا» اولین خانواده را با سایزها و رنگ‌هایش بسازید.'} />} /></div>
      {/* انتخاب تعداد ردیف مثل جدول کالاها (افشین 2026-10-24؛ URL fsize) */}
      {list.data && list.data.total > 0 ? <Pagination page={fpage} pageSize={fsize} total={list.data.total} onPage={(p) => lp.set({ fpage: p > 1 ? p : null }, { keepPage: true })} onPageSize={(n) => lp.set({ fsize: n === 10 ? null : n, fpage: null }, { keepPage: true })} sizes={[10, 25, 50]} /> : null}
      {selected ? <p className={s.sub} style={{ marginTop: 8 }}>لیست کالاهای پایین به خانواده‌ی <b>{selected.name}</b> محدود شده است؛ برای برداشتن، دوباره روی همان ردیف کلیک کنید.</p> : null}
      {edit ? <FamilyModal productId={edit.id} onClose={() => setEdit(null)} /> : null}
      {arch ? <ConfirmModal title="آرشیو خانواده" confirmLabel="آرشیو کن" danger onClose={() => setArch(null)}
        text={<>خانواده‌ی <b>{arch.name}</b> و همه‌ی کالاهایش آرشیو می‌شوند. اگر کالایی موجودی داشته باشد، آرشیو رد می‌شود.</>}
        onConfirm={async () => { await w.archive.mutateAsync(arch.id); toast('خانواده آرشیو شد.'); }} /> : null}
    </Card>
  );
}

/** سواچ رنگ‌های ماتریس خانواده (از خود ردیف لیست؛ C-11) — ۷۰٪ اندازه‌ی سواچ بزرگ، ردیف هم‌قد نشان وضعیت تا مرکزها هم‌راستا شوند */
function FamilyColors({ colors }: { colors: { id: string; name: string; hex_code?: string | null }[] }) {
  if (!colors.length) return <span className={s.muted}>—</span>;
  return <span className={s.famSwRow} data-tip={colors.map((c) => c.name).join('، ')}>{colors.slice(0, 3).map((c) => <span key={c.id} className={s.famSw} style={{ background: c.hex_code ?? undefined }} aria-hidden />)}{colors.length > 3 ? <span className={s.muted}>+{faNum(colors.length - 3)}</span> : null}</span>;
}

const FAMILY_COLUMNS: ColumnOption[] = [
  { key: 'code', label: 'کد خانواده', fixed: true }, { key: 'path', label: 'دسته اصلی › میانی › فرعی' }, { key: 'brand', label: 'برند' }, { key: 'model', label: 'طرح' },
  { key: 'material', label: 'جنس' }, { key: 'dims', label: 'ابعاد ماتریس' }, { key: 'colors', label: 'رنگ‌ها' }, { key: 'status', label: 'وضعیت' }, { key: 'acts', label: 'عملیات', fixed: true },
];
function GoodsCard({ lp, byId, mains }: { lp: LP; byId: Map<string, CategoryNode>; mains: CategoryNode[] }) {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const w = useItemWrite();
  const fam = lp.get('fam');
  const { text, setText, dq } = useSearchState(lp);
  const fp = lp as unknown as FP;
  const fparams = goodsFilterParams(fp);
  const params = { page: lp.page, page_size: lp.pageSize, kind: 'GOOD', query: dq || undefined, product_id: fam || undefined, ...fparams, category_id: fam ? undefined : fparams.category_id };
  const list = useItems(params);
  const [arch, setArch] = useState<ItemRow | null>(null);
  const [editGood, setEditGood] = useState<string | null>(null);
  const active = !!dq || !!fam || goodsFiltersActive(fp);
  const canPrice = can('pricing.prices.list');
  const ids = useMemo(() => (list.data?.results ?? []).map((g) => g.id), [list.data]);
  const prices = usePricesFor(ids, canPrice);
  const cols: Column<ItemRow>[] = [
    ...goodsDataColumns(prices, canPrice),
    {
      key: 'acts', header: 'عملیات', render: (g) => (
        <span className={s.rowActions}>
          {can('catalog.items.update') && g.status !== 'ARCHIVED' ? <IconButton label="ویرایش کالا" onClick={() => setEditGood(g.id)}><IconPencil size={15} /></IconButton> : null}
          {can('catalog.items.delete') && g.status !== 'ARCHIVED' ? <IconButton label="آرشیو کالا" danger onClick={() => setArch(g)}><IconArchive size={15} /></IconButton> : null}
        </span>
      ),
    },
  ];
  const prefs = useColumnPrefs('catalog.goods', GOODS_COLUMNS);
  const shown = cols.filter((c) => prefs.isVisible(c.key));
  const clear = () => { setText(''); clearGoodsFilters(fp, { query: null, fam: null }); };
  return (
    <Card>
      <div className={s.famHead}>
        <SectionTitle extra={list.data ? <span className={s.famCount}>{faNum(list.data.results.length)} از {faNum(list.data.total)} کالا</span> : null}>لیست کالاها</SectionTitle>
        <div className={s.famTools}>
          {can('catalog.items.export') ? <XlsxButton label="خروجی اکسل کالاها" path="/catalog/items/export" file="goods.xlsx" params={(() => { const { page: _p, page_size: _s, query, ...f } = params; return { ...f, q: query }; })()} /> : null}
          <label className={s.famSearch}><IconSearch size={16} className={s.muted} /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="نام، کد یا بارکد کالا…" aria-label="جست‌وجو" /></label>
          <ColumnPicker {...prefs} />
          <ClearFilters onClick={clear} disabled={!active} />
        </div>
      </div>
      {/* ترتیب فیلترها = ترتیب فرم «تعریف ماتریسی کالا» (catalogTables.GoodsFilters؛ همین در «انتخاب اقلام باندل») */}
      <GoodsFilters fp={fp} mains={mains} byId={byId} />
      <div className={s.compact}><DataTable columns={shown} rows={list.data?.results} rowKey={(g) => g.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={can('catalog.items.read') ? (g) => navigate(`/catalog/products/goods/${g.id}`) : undefined}
        empty={<Empty title={active ? 'کالایی با این فیلترها پیدا نشد' : 'هنوز کالایی تعریف نشده است'} text={active ? undefined : 'کالاها از «تعریف ماتریسی کالا» ساخته می‌شوند.'} />} /></div>
      {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      {editGood ? <GoodEditModal id={editGood} onClose={() => setEditGood(null)} /> : null}
      {arch ? <ConfirmModal title="آرشیو کالا" confirmLabel="آرشیو کن" danger onClose={() => setArch(null)} text={<>کالای <b>{arch.display_name}</b> آرشیو می‌شود. اگر موجودی یا سفارش باز داشته باشد، آرشیو رد می‌شود.</>}
        onConfirm={async () => { await w.archive.mutateAsync(arch.id); toast('کالا آرشیو شد.'); }} /> : null}
    </Card>
  );
}

/** خروجی اکسل با همان فیلترهای جدول (افشین 2026-10-25): خانواده‌ها ⇐ GET /catalog/products/export (catalog.products.export)، کالاها ⇐ GET /catalog/items/export?kind=GOOD (catalog.items.export)؛ جست‌وجو در خروجی‌ها `q` است نه `query` */
function XlsxButton({ label, path, file, params }: { label: string; path: string; file: string; params: Parameters<typeof downloadXlsx>[1] }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await downloadXlsx(path, params, file); } catch (e) { toast(userMessage(e), 'error'); } finally { setBusy(false); } };
  return <Button variant="secondary" icon={<IconDownload size={17} />} onClick={go} loading={busy} data-tip="با همین فیلترها">{label}</Button>;
}
