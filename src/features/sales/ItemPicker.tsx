import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconAdjustmentsHorizontal, IconCheck, IconSearch, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { Dropdown } from '@/shared/ui/Dropdown';
import { ErrorBox, SkeletonRows, useEscapeLayer } from '@/shared/ui/kit';
import { SoonTag } from '@/features/branches/SoonTag';
import { useAllBrands, useAllColors, useAllSizes, useAttributesByRole, useCategoryTree, useItems, usePricesFor, useUnits, type CategoryNode, type ItemRow } from '@/features/catalog/api';
import { useModelLineOptions } from '@/features/catalog/catalogTables';
import { useStockLookup } from './api/common';
import h from './h.module.css';
import { MiniPager } from './ui';

/**
 * «کاتالوگ کالا — انتخاب برای فاکتور» (html INVOICE PRODUCT PICKER MODAL، ظاهر دقیقاً همان): پوشش تمام‌صفحه با ستون فیلترها در کنار
 * (دسته‌ی اصلی/میانی/فرعی، برند، جنس، طرح، رنگ، سایزبندی…)، جدول کالاها با فی واحد، موجودی انبار انتخابی و موجودی کل، و انتخاب
 * چندتایی با تعداد. کالایی که در سند هست «در فاکتور» نشان داده می‌شود و دوباره انتخاب نمی‌شود (بک‌اند هر کالا را یک بار در سند می‌پذیرد).
 * فیلترهای «واحد فروش»، «وضعیت موجودی» و «مرتب‌سازی» html را فهرست کالاهای بک‌اند ندارد ⇐ «به‌زودی». «تخفیف واحد» و «مالیات» هر مشتری
 * را فقط قیمت‌گذاری سند تعیین می‌کند ⇐ پس از ثبت فاکتور. قیمت فقط راهنمای انتخاب است و «مبلغ تقریبی» html ساخته نمی‌شود (فرانت مبلغ حساب نمی‌کند).
 * حالت `single`: انتخاب یک ردیف با کلیک (فیلتر «کالا» در فهرست‌ها).
 */
export type PickedItem = { item: ItemRow; quantity: number; unitName: string };
type Kind = 'ITEM' | 'GOOD';
const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;
const LOW_STOCK = 15;
const GRID = '48px 92px minmax(220px,1.6fr) 150px 80px 108px 130px 84px 70px 84px 110px 92px 64px 104px 84px 124px';
const GRID_SINGLE = '92px minmax(220px,1.6fr) 150px 80px 108px 130px 84px 70px 84px 110px';
const MIN_WIDTH = 1710;
const MIN_WIDTH_SINGLE = 1200;
const NO_PRICE_TIP = 'پس از ثبت فاکتور با قیمت‌گذاری و مشتری محاسبه می‌شود';
const STOCK_PILL: { test: (n: number) => boolean; cls: string }[] = [
  { test: (n) => n <= 0, cls: h.p_danger! },
  { test: (n) => n < LOW_STOCK, cls: h.p_warn! },
  { test: () => true, cls: h.p_ok! },
];

export function ItemPickerModal({ open, onClose, onAdd, docLabel = 'فاکتور', docNo = '', title, existing = [], warehouses = [], warehouseId, single = false, addLabel }: {
  open: boolean; onClose: () => void; onAdd: (rows: PickedItem[]) => void; docLabel?: string; docNo?: string; title?: string;
  existing?: string[]; warehouses?: { value: string; label: string }[]; warehouseId?: string | null; single?: boolean; addLabel?: string;
}) {
  useEscapeLayer(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className={h.pkOv} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <PickerBox onClose={onClose} onAdd={onAdd} docLabel={docLabel} docNo={docNo} title={title} existing={existing} warehouses={warehouses}
        warehouseId={warehouseId ?? ''} single={single} addLabel={addLabel ?? `افزودن به ${docLabel}`} />
    </div>,
    document.body,
  );
}

function PickerBox({ onClose, onAdd, docLabel, docNo, title, existing, warehouses, warehouseId, single, addLabel }: {
  onClose: () => void; onAdd: (rows: PickedItem[]) => void; docLabel: string; docNo: string; title?: string; existing: string[];
  warehouses: { value: string; label: string }[]; warehouseId: string; single: boolean; addLabel: string;
}) {
  const can = usePerm();
  const tree = useCategoryTree(false);
  const brands = useAllBrands(); const sizes = useAllSizes(); const colors = useAllColors();
  const common = useAttributesByRole('COMMON');
  const modelOpts = useModelLineOptions();
  const units = useUnits();
  const materialAttr = (common.data ?? []).find((a) => a.system_key === 'MATERIAL');
  const [kind, setKind] = useState<Kind>('ITEM');
  const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const [f, setF] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [wh, setWh] = useState(warehouseId);
  const [sel, setSel] = useState<Map<string, PickedItem>>(new Map());
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, SEARCH_DEBOUNCE_MS); return () => clearTimeout(t); }, [q]);
  const set = (k: string, v: string, reset: string[] = []) => { setF((o) => ({ ...o, [k]: v, ...Object.fromEntries(reset.map((r) => [r, ''])) })); setPage(1); };
  const byId = useMemo(() => {
    const m = new Map<string, CategoryNode>();
    const walk = (ns: CategoryNode[]) => ns.forEach((n) => { m.set(n.id, n); walk(n.children ?? []); });
    walk(tree.data ?? []);
    return m;
  }, [tree.data]);
  const list = useItems({
    kind, status: 'ACTIVE', page, page_size: PAGE_SIZE, query: dq || undefined, category_id: f.sub || f.mid || f.main || undefined, brand_id: f.brand || undefined,
    size_id: f.size || undefined, color_id: f.color || undefined, model_line: f.model || undefined, attribute_value_ids: f.mat || undefined,
  });
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const canPrice = can('pricing.prices.list');
  const prices = usePricesFor(ids, canPrice);
  const canStock = can('wms.stock_lookup.read') && !single;
  const stock = useStockLookup(ids, canStock);
  const unitName = (r: ItemRow) => (units.data ?? []).find((u) => u.id === r.unit_id)?.name ?? '';
  const taken = (r: ItemRow) => existing.includes(r.id);
  const pick = (r: ItemRow, n: number) => setSel((m) => { const x = new Map(m); if (n > 0) x.set(r.id, { item: r, quantity: n, unitName: unitName(r) }); else x.delete(r.id); return x; });
  const toggle = (r: ItemRow) => {
    if (taken(r)) return;
    if (single) { onAdd([{ item: r, quantity: 1, unitName: unitName(r) }]); return; }
    pick(r, sel.has(r.id) ? 0 : 1);
  };
  const pickable = rows.filter((r) => !taken(r));
  const allOn = pickable.length > 0 && pickable.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((m) => {
    const n = new Map(m);
    if (allOn) pickable.forEach((r) => n.delete(r.id));
    else pickable.forEach((r) => { if (!n.has(r.id)) n.set(r.id, { item: r, quantity: 1, unitName: unitName(r) }); });
    return n;
  });
  const filterCount = ['main', 'mid', 'sub', 'brand', 'mat', 'model', 'color', 'size'].filter((k) => !!f[k]).length + (dq ? 1 : 0);
  const mids = byId.get(f.main ?? '')?.children ?? [];
  const subs = byId.get(f.mid ?? '')?.children ?? [];

  const fld = (label: string, key: string, all: string, opts: { value: string; label: string }[], reset: string[] = [], disabledText?: string) => {
    const on = !!f[key];
    const dis = !!disabledText;
    return (
      <div key={key}>
        <div className={h.pkLbl}>{label}</div>
        <Dropdown aria-label={label} buttonClassName={`${h.dd} ${h.ddPk} ${on ? h.pkSelOn : ''}`} value={f[key] ?? ''} disabled={dis}
          placeholder={disabledText ?? all} options={[{ value: '', label: all }, ...opts]} onChange={(e) => set(key, e.target.value, reset)} />
      </div>
    );
  };
  const soonFld = (label: string, tip: string) => (
    <div key={label}>
      <div className={h.pkLbl}>{label} <SoonTag tip={tip} /></div>
      <Dropdown aria-label={label} buttonClassName={`${h.dd} ${h.ddPk}`} value="" disabled placeholder="به‌زودی" options={[]} onChange={() => undefined} />
    </div>
  );

  const stockCell = (r: ItemRow): ReactNode => {
    const s = stock.get(r.id);
    if (!canStock) return <span className={h.dim} data-tip="دیدن موجودی مجوز «استعلام موجودی» انبار می‌خواهد">—</span>;
    if (!s) return <span className={h.dim}>…</span>;
    const n = wh ? s.byWarehouse.get(wh) ?? 0 : s.total;
    const cls = STOCK_PILL.find((x) => x.test(n))?.cls ?? '';
    return <span className={`${h.stockPill} ${cls}`}>{n > 0 ? `${faNum(n)} ${unitName(r)}`.trim() : 'ناموجود'}</span>;
  };
  const total = (r: ItemRow) => { const s = stock.get(r.id); if (!canStock || !s) return '—'; return s.total > 0 ? faNum(s.total) : 'ناموجود'; };
  const price = (r: ItemRow) => {
    if (!canPrice) return <span className={h.dim} data-tip="دیدن قیمت مجوز فهرست قیمت‌ها می‌خواهد">—</span>;
    if (prices.isLoading) return <span className={h.dim}>…</span>;
    const p = prices.data?.get(r.id)?.sale_price;
    return p ? faNum(Math.trunc(Number(p))) : <span className={h.dim} data-tip="قیمت ثبت نشده؛ کالای بی‌قیمت در سند پذیرفته نمی‌شود">بی‌قیمت</span>;
  };
  const picked = [...sel.values()];
  const whName = warehouses.find((x) => x.value === wh)?.label ?? '';
  const allLabel = (list.data?.total ?? 0) > rows.length ? 'انتخاب همه‌ی این صفحه' : 'انتخاب همه موارد فیلترشده';
  const grid = { gridTemplateColumns: single ? GRID_SINGLE : GRID };
  let body: ReactNode;
  if (list.isLoading) body = <div className={h.loading}><SkeletonRows rows={6} height={44} /></div>;
  else if (list.error) body = <div className={h.loading}><ErrorBox error={list.error} onRetry={() => list.refetch()} /></div>;
  else if (!rows.length) body = <div className={h.pkEmpty}>کالایی با این فیلترها یافت نشد</div>;
  else body = rows.map((r) => {
    const on = sel.get(r.id);
    const isTaken = taken(r);
    return (
      <div key={r.id} className={`${h.pkRow} ${on ? h.pkRowOn : ''} ${isTaken ? h.pkRowTaken : ''}`} style={grid} onClick={() => toggle(r)} role="row" aria-selected={!!on}>
        {single ? null : (
          <div className={h.pkcC}>
            <span className={`${h.box} ${on || isTaken ? h.boxOn : ''}`} role="checkbox" aria-checked={!!on || isTaken} aria-label={`انتخاب ${r.code}`}>{on || isTaken ? <IconCheck size={12} stroke={3} /> : null}</span>
          </div>
        )}
        <div className={h.pkc}><span dir="ltr" data-latin className={h.faint}>{r.code}</span></div>
        <div className={h.pkc}>
          <div className={h.pkName}><span className={h.lname}>{r.display_name}</span>{isTaken ? <span className={h.inTag}>در {docLabel}</span> : null}</div>
        </div>
        <div className={`${h.pkc} ${h.muted} ${h.small}`}>{r.category_name || '—'}</div>
        <div className={`${h.pkc} ${h.muted}`}>{r.brand_name || '—'}</div>
        <div className={`${h.pkc} ${h.muted} ${h.small}`}>{r.material_name || '—'}</div>
        <div className={`${h.pkc} ${h.muted} ${h.small}`}>{[r.colors.map((c) => c.name).join('، '), r.model_line_name].filter(Boolean).join(' · ') || '—'}</div>
        <div className={h.pkc}><span dir="ltr" data-latin className={h.muted}>{r.sizes.map((x) => x.code).join('، ') || '—'}</span></div>
        <div className={`${h.pkc} ${h.muted}`}>{unitName(r) || '—'}</div>
        <div className={`${h.pkc} ${h.muted}`}>{faNum(Math.trunc(Number(r.goods_count)) || 1)}</div>
        <div className={`${h.pkc} ${h.l} ${h.amount} tnum`}>{price(r)}</div>
        {single ? null : (
          <>
            <div className={`${h.pkc} ${h.l}`}><span className={h.dim} data-tip={NO_PRICE_TIP}>—</span></div>
            <div className={`${h.pkc} ${h.c}`}><span className={h.dim} data-tip={NO_PRICE_TIP}>—</span></div>
            <div className={`${h.pkc} ${h.c}`}>{stockCell(r)}</div>
            <div className={`${h.pkc} ${h.c} ${h.muted}`}>{total(r)}</div>
            <div className={h.pkcC} onClick={(e) => e.stopPropagation()}>
              {on ? (
                <div className={h.qtyStep}>
                  <button type="button" aria-label={`کم کردن تعداد ${r.code}`} onClick={() => pick(r, on.quantity - 1)}>−</button>
                  <span aria-label={`تعداد ${r.code}`}>{faNum(on.quantity)}</span>
                  <button type="button" aria-label={`افزودن تعداد ${r.code}`} onClick={() => pick(r, on.quantity + 1)}>+</button>
                </div>
              ) : <button type="button" className={h.pickBtn} disabled={isTaken} onClick={() => toggle(r)}>{isTaken ? `در ${docLabel}` : 'انتخاب'}</button>}
            </div>
          </>
        )}
      </div>
    );
  });

  return (
    <div className={h.pkBox} role="dialog" aria-modal="true" aria-label={title ?? `انتخاب کالا برای ${docLabel}`}>
      <div className={h.pkHead}>
        <div className={h.pkHeadStart}>
          <button type="button" className={h.pkX} title="بستن" aria-label="بستن" onClick={onClose}><IconX size={20} /></button>
          <div>
            <div className={h.pkTitle}>{title ?? <>کاتالوگ کالا — انتخاب برای {docLabel} {docNo ? <span dir="ltr" data-latin className={h.no}>{docNo}</span> : null}</>}</div>
            <div className={h.pkSub}>{single ? 'یک کالا را برای فیلتر فهرست انتخاب کنید.' : 'مشخصات کامل هر کالا، موجودی انبار و قیمت عمده را ببینید و کالاها را انتخاب کنید.'}</div>
          </div>
        </div>
        {single ? null : (
          <div className={h.pkWh}>موجودی بر اساس:
            <div className={h.pkWhSel}><Dropdown aria-label="موجودی بر اساس انبار" buttonClassName={`${h.dd} ${h.ddPk}`} value={wh} options={[{ value: '', label: 'همه انبارها' }, ...warehouses]} onChange={(e) => setWh(e.target.value)} /></div>
          </div>
        )}
      </div>
      <div className={h.pkBody}>
        <aside className={h.pkAside}>
          <div className={h.pkAsideHead}>
            <span className={h.pkAsideTitle}><IconAdjustmentsHorizontal size={17} />فیلتر کالاها</span>
            {filterCount ? <button type="button" className={h.linkBtn} onClick={() => { setF({}); setQ(''); setPage(1); }}>پاک کردن ({faNum(filterCount)})</button> : null}
          </div>
          <div className={h.pkSearch}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، کد یا بارکد…" aria-label="جست‌وجوی کالا" />
            <IconSearch size={16} />
          </div>
          <div className={h.pkGroup}>
            <div className={h.pkGroupTitle}>نوع کالا</div>
            <div>
              <div className={h.pkLbl}>نوع</div>
              <Dropdown aria-label="نوع کالا" buttonClassName={`${h.dd} ${h.ddPk}`} value={kind} options={[{ value: 'ITEM', label: 'آیتم‌ها (واحد فروش)' }, { value: 'GOOD', label: 'کالاهای تکی' }]} onChange={(e) => { setKind(e.target.value as Kind); setPage(1); }} />
            </div>
          </div>
          <div className={h.pkGroup}>
            <div className={h.pkGroupTitle}>دسته‌بندی کالا</div>
            {fld('دسته اصلی', 'main', 'همه دسته‌های اصلی', (tree.data ?? []).map((n) => ({ value: n.id, label: n.name })), ['mid', 'sub'])}
            {fld('دسته میانی', 'mid', 'همه دسته‌های میانی', mids.map((n) => ({ value: n.id, label: n.name })), ['sub'], f.main ? undefined : 'ابتدا دسته اصلی را انتخاب کنید')}
            {fld('دسته فرعی', 'sub', 'همه دسته‌های فرعی', subs.map((n) => ({ value: n.id, label: n.name })), [], f.mid ? undefined : 'ابتدا دسته میانی را انتخاب کنید')}
          </div>
          <div className={h.pkGroup}>
            <div className={h.pkGroupTitle}>مشخصات کالا</div>
            {fld('برند', 'brand', 'همه برندها', (brands.data ?? []).map((b) => ({ value: b.id, label: b.name })))}
            {fld('جنس', 'mat', 'همه جنس‌ها', (materialAttr?.values ?? []).map((v) => ({ value: v.id, label: v.value })))}
            {fld('طرح', 'model', 'همه طرح‌ها', modelOpts)}
            {fld('رنگ', 'color', 'همه رنگ‌ها', (colors.data ?? []).map((x) => ({ value: x.id, label: x.name })))}
            {fld('سایزبندی', 'size', 'همه سایزها', (sizes.data ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.code})` })))}
            {soonFld('واحد فروش', 'فهرست کالاهای بک‌اند فیلتر واحد ندارد')}
          </div>
          <div className={h.pkGroup}>
            <div className={h.pkGroupTitle}>موجودی و مرتب‌سازی</div>
            {soonFld('وضعیت موجودی', 'فهرست کالاها فیلتر موجودی ندارد؛ موجودی از ماژول انبار جدا خوانده می‌شود')}
            {soonFld('مرتب‌سازی', 'فهرست کالاهای بک‌اند مرتب‌سازی انتخابی ندارد')}
          </div>
        </aside>
        <div className={h.pkMain}>
          <div className={h.pkMeta}>
            <div className={h.pkMetaStart}>
              <span>{list.data ? `${faNum(list.data.total)} ${kind === 'ITEM' ? 'آیتم' : 'کالا'}` : ''}{single ? '' : ` · موجودی ${whName || 'همه انبارها'}`}</span>
              <MiniPager page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={setPage} />
            </div>
            {single ? null : <button type="button" className={h.linkBtn} disabled={!pickable.length} onClick={toggleAll}>{allOn ? 'لغو انتخاب همه' : allLabel}</button>}
          </div>
          <div className={h.pkTable}>
            <div style={{ minWidth: single ? MIN_WIDTH_SINGLE : MIN_WIDTH }}>
              <div className={h.pkThead} style={grid}>
                {single ? null : <div className={`${h.pkc} ${h.c}`}>انتخاب</div>}
                <div className={h.pkc}>کد محصول</div><div className={h.pkc}>نام محصول</div><div className={h.pkc}>دسته‌بندی</div><div className={h.pkc}>برند</div>
                <div className={h.pkc}>جنس</div><div className={h.pkc}>رنگ‌بندی</div><div className={h.pkc}>سایزبندی</div><div className={h.pkc}>واحد</div><div className={h.pkc}>تعداد در واحد</div>
                <div className={`${h.pkc} ${h.l}`}>فی واحد (ریال)</div>
                {single ? null : <><div className={`${h.pkc} ${h.l}`}>تخفیف واحد</div><div className={`${h.pkc} ${h.c}`}>مالیات</div><div className={`${h.pkc} ${h.c}`}>موجودی انبار</div><div className={`${h.pkc} ${h.c}`}>موجودی کل</div><div className={`${h.pkc} ${h.c}`}>تعداد</div></>}
              </div>
              {body}
            </div>
          </div>
        </div>
      </div>
      <div className={h.pkFoot}>
        <div className={h.pkFootInfo}>{single ? '' : <b>{picked.length ? `${faNum(picked.length)} کالا انتخاب شده · ${faNum(picked.reduce((a, x) => a + x.quantity, 0))} واحد` : 'کالایی انتخاب نشده'}</b>}</div>
        <div className={h.pkFootActs}>
          <button type="button" className={h.btnCancel} onClick={onClose}>انصراف</button>
          {single ? null : <button type="button" className={h.btnPrimary} disabled={!picked.length} onClick={() => onAdd(picked)}><span className={h.plus}>+</span>{addLabel}</button>}
        </div>
      </div>
    </div>
  );
}
