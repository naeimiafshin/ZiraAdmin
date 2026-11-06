import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconChevronDown, IconChevronUp, IconDownload, IconPencil, IconPlus } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { useColumnPrefs } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { TableFilters } from '@/shared/ui/TableFilters';
import { Card, Empty, PageHead, Pagination, Segmented, UnitHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { downloadXlsx, useAllBrands, useCategoryTree, useItem, useItems, usePriceDetail, usePricesFor, type CategoryNode, type ItemRow } from './api';
import { IconButton, Kv, Swatch } from './components';
import { ITEM_PATTERN } from './labels';
import { GRADE_OPTIONS, ITEM_COLUMNS, itemDataColumns, ITEM_PATTERN_OPTIONS, useModelLineOptions } from './catalogTables';
import s from './catalog.module.css';

/**
 * «آیتم‌ها (واحد فروش)» — مطابق html Fixed V2: فیلترهای دسته اصلی/میانی/فرعی (به‌جای تب‌ها، 2026-10-24)، Segmented وضعیت نمایش، جست‌وجو + فیلترها، جدول آیتم‌ها (kind=ITEM)
 * با پنل بازشونده‌ی جزئیات (کالاهای پک) و دکمه‌ی «پرونده آیتم». قیمت آیتم از pricing با یک درخواست برای صفحه (C-12)؛
 * «قابل عرضه» (موجودی) تا ماژول انبار «—». «نمایش عمومی»/«گروه مشتریان» = ACTIVE + audience (C-15)؛ «همه» آرشیوها را ندارد (C-17)؛ تصویر کاور از primary_image_url (C-16). حالت در URL.
 * اصلاحات افشین 2026-10-23: فیلتر سایز و رنگ حذف؛ «الگوی تنوع» (`pattern` ⇐ variation_pattern) و «بازه قیمت» (`price` = «min-max» ⇐ min/max_sale_price، ریال) — C-26 رفع شد؛
 * دکمه‌ی آیکونی «حذف فیلترها» (TableFilters) و «انتخاب ستون‌ها» (useColumnPrefs: catalog.items)؛ سلول آیتم: تصویر و نام در همه‌ی ردیف‌ها هم‌راستا؛
 * پنل بازشونده: کالاهای پک در کادر کم‌رنگ با نام، رنگ، سایز و قیمت.
 */
const VIS: Record<string, string | undefined> = { '': undefined, public: 'ACTIVE', groups: 'ACTIVE', hidden: 'HIDDEN', draft: 'DRAFT', archived: 'ARCHIVED' };
const AUD: Record<string, string | undefined> = { public: 'ALL', groups: 'GROUPS' };

export default function ItemsListPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const tree = useCategoryTree(true);
  const brands = useAllBrands(); const modelOpts = useModelLineOptions();
  const main = lp.get('main'); const mid = lp.get('mid'); const sub = lp.get('sub'); const vis = lp.get('vis');
  const byId = useMemo(() => { const m = new Map<string, CategoryNode>(); const walk = (ns: CategoryNode[]) => ns.forEach((n) => { m.set(n.id, n); walk(n.children ?? []); }); walk(tree.data ?? []); return m; }, [tree.data]);
  const [priceLo, priceHi] = (lp.get('price') || '-').split('-');
  const params = {
    page: lp.page, page_size: lp.pageSize, kind: 'ITEM', query: dq || undefined, category_id: sub || mid || main || undefined, status: VIS[vis], audience: AUD[vis],
    brand_id: lp.get('brand') || undefined, model_line: lp.get('model') || undefined, grade: lp.get('grade') || undefined, variation_pattern: lp.get('pattern') || undefined,
    min_sale_price: priceLo || undefined, max_sale_price: priceHi || undefined,
  };
  const list = useItems(params);
  const canPrice = can('pricing.prices.list');
  const ids = useMemo(() => (list.data?.results ?? []).map((r) => r.id), [list.data]);
  const prices = usePricesFor(ids, canPrice);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportXlsx = async () => {
    setExporting(true);
    try { const { page: _p, page_size: _s, query, ...f } = params; await downloadXlsx('/catalog/items/export', { ...f, q: query }, 'items.xlsx'); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };

  const cols: Column<ItemRow>[] = [
    ...itemDataColumns(prices, canPrice),
    {
      key: 'acts', header: '', render: (r) => (
        <span className={s.rowActions}>
          {can('catalog.items.update') && r.status !== 'ARCHIVED' ? <IconButton label="ویرایش آیتم" onClick={() => navigate(`/catalog/items/${r.id}/edit`)}><IconPencil size={15} /></IconButton> : null}
          <IconButton label={open === r.id ? 'بستن جزئیات' : 'نمایش جزئیات'} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}</IconButton>
        </span>
      ),
    },
  ];
  const active = !!dq || !!main || !!lp.get('brand') || !!lp.get('grade') || !!lp.get('pattern') || !!lp.get('price');
  const prefs = useColumnPrefs('catalog.items', ITEM_COLUMNS);
  const shown = cols.filter((c) => prefs.isVisible(c.key));
  return (
    <>
      <PageHead title="آیتم‌ها (واحد فروش)" sub="آیتم واحد فروش است و از ادغام چند کالا ساخته می‌شود؛ قیمت هر آیتم جمع قیمت کالاهای آن است."
        actions={<>
          {can('catalog.items.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} onClick={exportXlsx} loading={exporting}>خروجی اکسل</Button> : null}
          {can('catalog.items.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/catalog/items/new')}>ساخت آیتم</Button> : null}
        </>} />
      <Card>
        <div className={s.itemsBar}>
          <Segmented value={vis} onChange={(v) => lp.set({ vis: v || null })} options={[
            { value: '', label: 'همه آیتم‌ها' }, { value: 'public', label: 'نمایش عمومی' },
            { value: 'groups', label: 'گروه مشتریان' },
            { value: 'hidden', label: 'عدم نمایش' }, { value: 'draft', label: 'پیش‌نویس' }, { value: 'archived', label: 'آرشیو' },
          ]} />
          {list.data ? <span className={s.famCount}>{faNum(list.data.results.length)} از {faNum(list.data.total)} آیتم</span> : null}
        </div>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جستجوی نام یا کد آیتم…" filters={[
          // دسته‌ها به‌جای تب‌های بالای صفحه (افشین 2026-10-24): اصلی ⇐ میانی ⇐ فرعی، هر کدام فرزندان قبلی
          { key: 'main', label: 'دسته اصلی', value: main, onChange: (v) => lp.set({ main: v, mid: null, sub: null }), options: (tree.data ?? []).map((n) => ({ value: n.id, label: n.name })) },
          { key: 'mid', label: 'دسته میانی', value: mid, onChange: (v) => lp.set({ mid: v, sub: null }), options: (byId.get(main)?.children ?? []).map((n) => ({ value: n.id, label: n.name })) },
          { key: 'sub', label: 'دسته فرعی', value: sub, onChange: (v) => lp.set({ sub: v }), options: (byId.get(mid)?.children ?? []).map((n) => ({ value: n.id, label: n.name })) },
          { key: 'brand', label: 'برند', value: lp.get('brand'), onChange: (v) => lp.set({ brand: v }), options: (brands.data ?? []).map((b) => ({ value: b.id, label: b.name })) },
          { key: 'model', label: 'مدل', value: lp.get('model'), onChange: (v) => lp.set({ model: v }), options: modelOpts },
          { key: 'pattern', label: 'الگوی تنوع', value: lp.get('pattern'), onChange: (v) => lp.set({ pattern: v }), options: ITEM_PATTERN_OPTIONS },
          { key: 'grade', label: 'گرید', value: lp.get('grade'), onChange: (v) => lp.set({ grade: v }), options: GRADE_OPTIONS },
          { key: 'price', label: 'بازه قیمت', value: lp.get('price'), onChange: (v) => lp.set({ price: v }), options: [], range: { unit: 'ریال' } },
        ]} extra={<ColumnPicker {...prefs} />} />
        <div className={s.compact}>
          <DataTable columns={shown} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
            onRowClick={(r) => setOpen(open === r.id ? null : r.id)} isSelected={(r) => r.id === open}
            expanded={(r) => (r.id === open ? <ItemExpand row={r} price={prices.data?.get(r.id)?.sale_price} canPrice={can('pricing.prices.read')} onOpen={() => navigate(`/catalog/items/${r.id}`)} /> : null)}
            empty={<Empty title={active || vis ? 'آیتمی با این فیلترها پیدا نشد' : 'هنوز آیتمی ساخته نشده است'} text={active || vis ? undefined : 'با «ساخت آیتم» چند کالای یک خانواده را در یک واحد فروش ادغام کنید.'} />} />
        </div>
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      </Card>
    </>
  );
}

/** پنل جزئیات زیر ردیف (html): مشخصات آیتم + کالاهای پک با تعداد و قیمت هر کدام */
function ItemExpand({ row, price, canPrice, onOpen }: { row: ItemRow; price?: string | null; canPrice: boolean; onOpen: () => void }) {
  const det = useItem(row.id);
  const pd = usePriceDetail(row.id, canPrice);
  const comps = det.data?.components ?? [];
  const fixed = row.variation_pattern === 'FIXED_COLOR' ? row.colors[0]?.name : row.variation_pattern === 'FIXED_SIZE' ? row.sizes[0]?.code : '';
  const vary = row.variation_pattern === 'FIXED_SIZE' ? row.colors.map((c) => c.name).join(' / ') : row.sizes.map((x) => x.code).join(' / ');
  const priceOf = (id: string) => pd.data?.components?.find((c) => c.item_id === id)?.sale_price;
  return (
    <div className={s.expand} onClick={(e) => e.stopPropagation()}>
      <div className={s.expandGrid}>
        <Kv k="کد آیتم" v={<span data-latin>{row.code}</span>} />
        <Kv k="برند / مدل / جنس" v={[row.brand_name, row.model_line_name, row.material_name].filter(Boolean).join(' · ') || '—'} />
        <Kv k="الگوی تنوع" v={`${ITEM_PATTERN[row.variation_pattern] ?? '—'}${fixed ? ` (ثابت: ${fixed})` : ''}`} />
        <Kv k="متغیرهای پک" v={<span data-latin>{vary || '—'}</span>} />
        <Kv k="تعداد کالا در پک" v={`${faNum(Number(row.goods_count))} عدد`} />
        <Kv k="جمع قیمت خرید کالاها" v={<span className={s.muted} data-tip="از ماژول خرید (به‌زودی)">—</span>} />
        <Kv k="قیمت آیتم (جمع کالاها)" v={price ? <>{faNum(Number(price))}<span className={s.rial}>ریال</span></> : '—'} />
        <Kv k="حاشیه سود" v={<span className={s.muted} data-tip="نیازمند قیمت خرید">—</span>} />
      </div>
      <div className={s.compBox} data-pack>
        {det.isLoading ? <span className={s.muted}>در حال بارگذاری کالاها…</span> : (
          <table>
            <thead><tr><th>کالاهای داخل پک</th><th>رنگ</th><th>سایز</th><th><UnitHead>قیمت</UnitHead></th></tr></thead>
            <tbody>{comps.map((c) => { const cl = row.colors.find((x) => x.code === c.color_code); const pr = priceOf(c.component_id); const q = Number(c.quantity); return (
              <tr key={c.component_id}>
                <td><span className={s.famName} style={{ maxWidth: 320 }} data-tip={c.display_name}>{c.display_name}</span></td>
                <td><span className={s.swRow} style={{ gap: 6 }}>{cl ? <Swatch hex={cl.hex_code} big /> : null}{cl?.name ?? c.color_code ?? '—'}</span></td>
                <td><span className={s.sizeChip} data-latin>{c.size_code ?? '—'}</span></td>
                <td className="tnum">{pr ? <>{faNum(Number(pr))}{q > 1 ? <span className={s.muted}> × {faNum(q)}</span> : null}</> : '—'}</td>
              </tr>
            ); })}</tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: 14 }}><Button size="sm" onClick={onOpen}>پرونده آیتم</Button></div>
    </div>
  );
}
