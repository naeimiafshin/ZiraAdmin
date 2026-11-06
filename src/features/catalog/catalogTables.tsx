import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { IconFilterOff } from '@tabler/icons-react';
import { faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { type Column } from '@/shared/ui/DataTable';
import { Field, Select } from '@/shared/ui/form';
import { Badge, UnitHead } from '@/shared/ui/kit';
import { useAllBrands, useAllColors, useAllSizes, useAttributesByRole, useAttributeSuggestionsAll, type CategoryNode, type ItemRow } from './api';
import { Swatch, thumbColor } from './components';
import { ITEM_PATTERN, itemDisplay } from './labels';
import s from './catalog.module.css';

/**
 * ستون‌ها و فیلترهای مشترک «لیست کالاها» (منوی کالاها) و «آیتم‌ها»؛ همین‌ها در «انتخاب اقلام باندل» هم به کار می‌روند
 * (افشین 2026-10-23: جدول انتخاب اقلام باندل = همان جدول کالاها/آیتم‌ها با همان فیلترها و انتخاب ستون‌ها).
 * حالت فیلترها از راه FP: در صفحه‌ی لیست = URL (useListParams)، در انتخاب‌گر باندل = حالت محلی (useLocalFilters).
 */
export type FP = { get: (k: string) => string; set: (p: Record<string, string | null>) => void };
export function useLocalFilters(): FP {
  const [st, setSt] = useState<Record<string, string>>({});
  return useMemo(() => ({
    get: (k: string) => st[k] ?? '',
    set: (p: Record<string, string | null>) => setSt((o) => { const n = { ...o }; for (const [k, v] of Object.entries(p)) { if (v == null || v === '') delete n[k]; else n[k] = v; } return n; }),
  }), [st]);
}

/** دکمه‌ی آیکونی «حذف فیلترها» (همان شکل TableFilters) */
export function ClearFilters({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return <button type="button" className={s.clearIcon} onClick={onClick} disabled={disabled} aria-label="حذف فیلترها" data-tip="حذف فیلترها"><IconFilterOff size={16} /></button>;
}

/* ───────── کالاها (kind=GOOD) ───────── */
export const GOODS_COLUMNS: ColumnOption[] = [
  { key: 'code', label: 'کد کالا', fixed: true }, { key: 'sku', label: 'شناسه کالا' }, { key: 'barcode', label: 'بارکد' }, { key: 'name', label: 'نام کالا (ترکیبی)', fixed: true },
  { key: 'brand', label: 'برند' }, { key: 'model', label: 'طرح' }, { key: 'material', label: 'جنس' }, { key: 'size', label: 'سایز' }, { key: 'color', label: 'رنگ' },
  { key: 'buy', label: 'قیمت خرید' }, { key: 'sale', label: 'قیمت فروش' }, { key: 'margin', label: 'حاشیه' }, { key: 'acts', label: 'عملیات', fixed: true },
];
export const GOODS_FILTER_KEYS = ['gmain', 'gmid', 'gsub', 'brand', 'gmodel', 'gmat', 'size', 'color', 'gpmin', 'gpmax'] as const;
/** پارامترهای فیلتر کالاها برای GET /catalog/items (C-25/C-26: طرح ⇐ model_line، جنس ⇐ attribute_value_ids، بازه ⇐ min/max_sale_price) */
export function goodsFilterParams(fp: FP) {
  return {
    category_id: fp.get('gsub') || fp.get('gmid') || fp.get('gmain') || undefined, brand_id: fp.get('brand') || undefined, size_id: fp.get('size') || undefined, color_id: fp.get('color') || undefined,
    model_line: fp.get('gmodel') || undefined, attribute_value_ids: fp.get('gmat') || undefined, min_sale_price: fp.get('gpmin') || undefined, max_sale_price: fp.get('gpmax') || undefined,
  };
}
export const goodsFiltersActive = (fp: FP) => GOODS_FILTER_KEYS.some((k) => !!fp.get(k));
export const clearGoodsFilters = (fp: FP, extra: Record<string, null> = {}) => fp.set({ ...Object.fromEntries(GOODS_FILTER_KEYS.map((k) => [k, null])), ...extra });

/** گزینه‌های فیلتر «مدل/طرح» = مقدارهای پیشنهادی ویژگی MODEL_LINE (فیلتر `model_line` در GET /catalog/items — C-25 ✅، هم کالا هم آیتم) */
export function useModelLineOptions() {
  const common = useAttributesByRole('COMMON');
  const modelAttr = (common.data ?? []).find((a) => a.system_key === 'MODEL_LINE');
  const models = useAttributeSuggestionsAll(modelAttr?.id);
  return useMemo(() => (models.data ?? []).map((m) => ({ value: m.value, label: m.value })), [models.data]);
}

/** فیلترهای کالاها به ترتیب فرم «تعریف ماتریسی کالا»: دسته اصلی/میانی/فرعی، برند، طرح، جنس، سایز، رنگ، بازه قیمت فروش */
export function GoodsFilters({ fp, mains, byId }: { fp: FP; mains: CategoryNode[]; byId: Map<string, CategoryNode> }) {
  const brands = useAllBrands(); const sizes = useAllSizes(); const colors = useAllColors();
  const common = useAttributesByRole('COMMON');
  const modelOpts = useModelLineOptions();
  const materialAttr = (common.data ?? []).find((a) => a.system_key === 'MATERIAL');
  const gmain = fp.get('gmain'), gmid = fp.get('gmid');
  const gmids = byId.get(gmain)?.children ?? []; const gsubs = byId.get(gmid)?.children ?? [];
  return (
    <div className={s.filterRow} style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
      <Select label="دسته اصلی" value={gmain} onChange={(e) => fp.set({ gmain: e.target.value, gmid: null, gsub: null })} placeholder="همه" options={mains.map((n) => ({ value: n.id, label: n.name }))} />
      <Select label="دسته میانی" value={gmid} disabled={!gmain} onChange={(e) => fp.set({ gmid: e.target.value, gsub: null })} placeholder="همه" options={gmids.map((n) => ({ value: n.id, label: n.name }))} />
      <Select label="دسته فرعی" value={fp.get('gsub')} disabled={!gmid} onChange={(e) => fp.set({ gsub: e.target.value })} placeholder="همه" options={gsubs.map((n) => ({ value: n.id, label: n.name }))} />
      <Select label="برند" value={fp.get('brand')} onChange={(e) => fp.set({ brand: e.target.value })} placeholder="همه" options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
      <Select label="طرح" value={fp.get('gmodel')} onChange={(e) => fp.set({ gmodel: e.target.value })} placeholder="همه" options={modelOpts} />
      <Select label="جنس" value={fp.get('gmat')} onChange={(e) => fp.set({ gmat: e.target.value })} placeholder="همه" options={(materialAttr?.values ?? []).map((v) => ({ value: v.id, label: v.value }))} />
      <Select label="سایز" value={fp.get('size')} onChange={(e) => fp.set({ size: e.target.value })} placeholder="همه" options={(sizes.data ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }))} />
      <Select label="رنگ" value={fp.get('color')} onChange={(e) => fp.set({ color: e.target.value })} placeholder="همه" options={(colors.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
      {/* بازه قیمت فروش: با Enter یا خروج از فیلد اعمال می‌شود */}
      <div style={{ gridColumn: 'span 2' }}><Field label="بازه قیمت فروش (ریال)"><div className={s.rangeRow}>
        <PriceBound value={fp.get('gpmin')} onApply={(v) => fp.set({ gpmin: v || null })} label="حداقل قیمت فروش" placeholder="از" /><span className={s.muted}>تا</span>
        <PriceBound value={fp.get('gpmax')} onApply={(v) => fp.set({ gpmax: v || null })} label="حداکثر قیمت فروش" placeholder="تا (بدون سقف)" />
      </div></Field></div>
    </div>
  );
}

/** ورودی یک سر بازه‌ی قیمت (ارقام فارسی با جداکننده)؛ با Enter یا خروج از فیلد ثبت می‌شود */
export function PriceBound({ value, onApply, label, placeholder }: { value: string; onApply: (v: string) => void; label: string; placeholder: string }) {
  const [v, setV] = useState(value); useEffect(() => setV(value), [value]);
  const num = (x: string) => toLatinDigits(x).replace(/[^0-9]/g, '');
  const show = v ? toFaDigits(Number(v).toLocaleString('en')).replace(/,/g, '٬') : '';
  return <input className={s.rangeInput} inputMode="numeric" dir="ltr" value={show} onChange={(e) => setV(num(e.target.value))} onBlur={() => { if (v !== value) onApply(v); }} onKeyDown={(e) => { if (e.key === 'Enter') onApply(v); }} placeholder={placeholder} aria-label={label} />;
}

function SalePrice({ price, loading }: { price?: string | null; loading: boolean }) {
  if (loading) return <span className={s.priceMuted}>…</span>;
  if (!price) return <span className={s.priceMuted} data-tip="قیمت ثبت نشده">—</span>;
  return <span className={`${s.price} tnum`}>{faNum(Number(price))}</span>;
}

type PriceMap = { data?: Map<string, { sale_price?: string | null }>; isLoading: boolean };
/** ستون‌های داده‌ی جدول کالاها (بدون «عملیات») */
export function goodsDataColumns(prices: PriceMap, canPrice: boolean): Column<ItemRow>[] {
  return [
    { key: 'code', header: 'کد کالا', code: true, render: (g) => <span className="ltr" data-latin>{g.code}</span> },
    { key: 'sku', header: 'شناسه کالا', render: (g) => <span className={`${s.sku} ${s.famName} ltr`} style={{ maxWidth: 85 }} data-latin data-tip={g.sku}>{g.sku}</span> },
    { key: 'barcode', header: 'بارکد', code: true, render: (g) => (g.barcode ? <span className={`${s.famName} ltr`} style={{ maxWidth: 80 }} data-latin data-tip={g.barcode}>{g.barcode}</span> : <span className={s.muted}>—</span>) },
    { key: 'name', header: 'نام کالا (ترکیبی)', render: (g) => <span className={`${s.strong} ${s.famName}`} style={{ maxWidth: 120 }} data-tip={g.display_name}>{g.display_name}</span> },
    { key: 'brand', header: 'برند', render: (g) => g.brand_name },
    { key: 'model', header: 'طرح', render: (g) => (g.model_line_name ? <span className={s.famName} style={{ maxWidth: 80 }} data-tip={g.model_line_name}>{g.model_line_name}</span> : <span className={s.muted}>—</span>) },
    { key: 'material', header: 'جنس', render: (g) => g.material_name || <span className={s.muted}>—</span> },
    { key: 'size', header: 'سایز', render: (g) => <span className={s.sizeChip} data-latin>{g.sizes[0]?.code ?? '—'}</span> },
    { key: 'color', header: 'رنگ', render: (g) => (g.colors[0] ? <span className={s.swRow} data-tip={g.colors[0].name} aria-label={g.colors[0].name}><Swatch hex={g.colors[0].hex_code} big /></span> : <span className={s.muted}>—</span>) },
    { key: 'buy', header: <UnitHead>قیمت خرید</UnitHead>, render: () => <span className={s.priceMuted} data-tip="از ماژول خرید (به‌زودی)">—</span> },
    ...(canPrice ? [{ key: 'sale', header: <UnitHead>قیمت فروش</UnitHead>, render: (g: ItemRow) => <SalePrice price={prices.data?.get(g.id)?.sale_price} loading={prices.isLoading} /> }] : []),
    { key: 'margin', header: 'حاشیه', render: () => <span className={s.priceMuted} data-tip="نیازمند قیمت خرید">—</span> },
  ];
}

/* ───────── آیتم‌ها (kind=ITEM) ───────── */
export const ITEM_COLUMNS: ColumnOption[] = [
  { key: 'item', label: 'آیتم', fixed: true }, { key: 'brand', label: 'برند / مدل' }, { key: 'pattern', label: 'الگوی تنوع' }, { key: 'goods', label: 'کالا در پک' },
  { key: 'price', label: 'قیمت آیتم' }, { key: 'stock', label: 'قابل عرضه' }, { key: 'display', label: 'وضعیت نمایش' }, { key: 'acts', label: 'عملیات', fixed: true },
];
/** ستون‌های داده‌ی جدول آیتم‌ها (بدون «عملیات») */
export function itemDataColumns(prices: PriceMap, canPrice: boolean, narrow = false): Column<ItemRow>[] {
  const nw = narrow ? 150 : 260; const bw = narrow ? 90 : 140;
  return [
    {
      key: 'item', header: 'آیتم', render: (r) => (
        <span className={s.itemCell}>
          {r.primary_image_url ? <img className={s.thumb} src={r.primary_image_url} alt="" /> : <span className={s.thumb} style={{ background: thumbColor(r.code) }} aria-hidden>{r.display_name.slice(0, 1)}</span>}
          <span className={s.itemText}>
            <span className={`${s.strong} ${s.famName}`} style={{ maxWidth: nw }} data-tip={r.display_name}>{r.display_name}</span>
            <span className={s.itemSub}>{r.category_name} · <span data-latin>{r.code}</span></span>
          </span>
        </span>
      ),
    },
    { key: 'brand', header: 'برند / مدل', render: (r) => <span className={s.famName} style={{ maxWidth: bw }} data-tip={[r.brand_name, r.model_line_name].filter(Boolean).join(' · ')}>{[r.brand_name, r.model_line_name].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'pattern', header: 'الگوی تنوع', render: (r) => ITEM_PATTERN[r.variation_pattern] ?? '—' },
    { key: 'goods', header: 'کالا در پک', render: (r) => <span className="tnum"><b>{faNum(Number(r.goods_count))}</b> <span className={s.muted}>عدد</span></span> },
    ...(canPrice ? [{ key: 'price', header: <UnitHead>قیمت آیتم</UnitHead>, render: (r: ItemRow) => { const p = prices.data?.get(r.id)?.sale_price; return p ? <span className={`${s.price} tnum`}>{faNum(Number(p))}</span> : <span className={s.priceMuted} data-tip={prices.isLoading ? '' : 'قیمت ثبت نشده'}>{prices.isLoading ? '…' : '—'}</span>; } }] : []),
    { key: 'stock', header: 'قابل عرضه', render: () => <span className={s.priceMuted} data-tip="از ماژول انبار (به‌زودی)">—</span> },
    { key: 'display', header: 'وضعیت نمایش', render: (r) => { const d = itemDisplay(r.status, r.audience); return <Badge tone={d.tone}>{d.label}</Badge>; } },
  ];
}
export const ITEM_PATTERN_OPTIONS = (['FIXED_COLOR', 'FIXED_SIZE', 'FREE'] as const).map((k) => ({ value: k, label: ITEM_PATTERN[k] ?? k }));
export const GRADE_OPTIONS = ['1', '2', '3'].map((g) => ({ value: g, label: `گرید ${faNum(Number(g))}` }));

/** ستون انتخاب (مربع تیک) برای جدول‌های انتخاب‌گر */
export function selectColumn<T>(opts: { isOn: (r: T) => boolean; toggle: (r: T) => void; allOn: boolean; toggleAll: () => void; label: (r: T) => string; disabled?: (r: T) => boolean }): Column<T> {
  return {
    key: 'sel',
    header: <button type="button" role="checkbox" aria-checked={opts.allOn} aria-label="انتخاب همه‌ی ردیف‌های این صفحه" className={`${s.cb} ${opts.allOn ? s.cbOn : ''}`} onClick={(e) => { e.stopPropagation(); opts.toggleAll(); }}>{opts.allOn ? <Tick /> : null}</button>,
    render: (r) => { const on = opts.isOn(r); return <button type="button" role="checkbox" aria-checked={on} aria-label={opts.label(r)} disabled={opts.disabled?.(r)} className={`${s.cb} ${on ? s.cbOn : ''}`} onClick={(e) => { e.stopPropagation(); opts.toggle(r); }}>{on ? <Tick /> : null}</button>; },
  };
}
const Tick = (): ReactNode => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7" /></svg>;
