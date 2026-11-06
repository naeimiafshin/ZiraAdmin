import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { IconCheck, IconDeviceFloppy, IconFolder, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { useBack } from '@/shared/lib/useBack';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Field, FormGrid, Input, Select } from '@/shared/ui/form';
import { Card, Empty, Modal, PageHead, SectionTitle, SkeletonRows, Rial } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { fetchAll } from '@/features/users/api';
import {
  previewProductNames, setPricesBulk, useAllBrands, useAllColors, useAllSizes, useAttributesByRole, useCategoryTree, useColorSets, useColorWrite, useDraft, useDrafts, useDraftWrite, useProductWrite, useSizeSets, useSizeWrite, useUnits,
  type CategoryNode, type ItemRow, type ProductNamePreviewOut,
} from './api';
import { AttributeFields, listToRows, rowsToList, type AttrRows } from './attributeFields';
import { BrandModal } from './BrandModal';
import { CategoryCreateModal } from './CategoryCreateModal';
import { IconButton, Swatch } from './components';
import { NAME_PART_LABELS, NAME_PART_ORDER } from './labels';
import s from './catalog.module.css';
import { groupMoney } from '@/shared/lib/money';

/**
 * «تعریف ماتریسی کالا» — مطابق html Fixed V2 (افشین 2026-10-22): ۱) مشخصات مشترک (دسته‌ی ۳ سطحی، برند، طرح/مدل، جنس پارچه)
 * ۲) ابعاد ماتریس (چیپ سایز/رنگ + افزودن سایز/رنگ تازه) ۳) ماتریس قیمت کالاها (قیمت پایه + اعمال روی همه + قیمت هر سلول)؛ ستون کناری: خروجی ماتریس،
 * نمونه نام، پیش‌نویس‌ها. تفاوت با html به حکم بک‌اند/تصمیم‌ها: بدون تصاویر مشترک (تصویر فقط روی آیتم)، واحد اصلی الزامی، نام‌گذاری با اجزای نام (جمع‌شده)،
 * قیمت خرید «به‌زودی» (procurement)، قیمت فروش بعد از ساخت با PUT /pricing/prices/bulk. پیش‌نویس سمت سرور (`?draft=`)؛ پیش‌نویس تبدیل‌شده دیگر فهرست نمی‌شود (C-09).
 */
type CellState = { on: boolean; base_code: string; display_name: string; sale: string };
type DraftData = {
  category_id?: string; brand_id?: string; unit_id?: string; base_code?: string; name?: string; name_parts?: string[];
  attributes?: ReturnType<typeof rowsToList>; size_ids?: string[]; color_ids?: string[]; cells?: Record<string, CellState>; base_sale?: string;
};
const DEFAULT_PARTS = NAME_PART_ORDER.filter((p) => p !== 'BASE_CODE');
const key = (sz: string, cl: string) => `${sz}|${cl}`;
const digits = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');
const EMPTY_CELL: CellState = { on: true, base_code: '', display_name: '', sale: '' };

export default function ProductWizardPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const back = useBack('/catalog/products');
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const draftId = sp.get('draft');
  const draftQ = useDraft(draftId);
  const drafts = useDrafts({ page: 1, page_size: 50 }, can('catalog.products.create'));
  const tree = useCategoryTree(false);
  const brands = useAllBrands();
  const units = useUnits();
  const commonAttrs = useAttributesByRole('COMMON');
  const sizes = useAllSizes(); const colors = useAllColors();
  const sizeSets = useSizeSets({ page: 1, page_size: 100 }); const colorSets = useColorSets({ page: 1, page_size: 100 });
  const pw = useProductWrite(); const dw = useDraftWrite();

  const [main, setMain] = useState(''); const [mid, setMid] = useState(''); const [sub, setSub] = useState('');
  const [brandId, setBrandId] = useState(''); const [unitId, setUnitId] = useState('');
  const [baseCode, setBaseCode] = useState(''); const [nameOverride, setNameOverride] = useState('');
  const [parts, setParts] = useState<string[]>(DEFAULT_PARTS);
  const [attrRows, setAttrRows] = useState<AttrRows>({});
  const [sizeIds, setSizeIds] = useState<string[]>([]); const [colorIds, setColorIds] = useState<string[]>([]);
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [baseSale, setBaseSale] = useState('');
  const [preview, setPreview] = useState<ProductNamePreviewOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [newDim, setNewDim] = useState<'size' | 'color' | null>(null);
  /** افشین 2026-11-04: «دسته‌بندی جدید» و «برند جدید» در همین فرم؛ مودال روی فرم باز می‌شود و داده‌های واردشده نمی‌ماند پاک شود */
  const [quickNew, setQuickNew] = useState<'category' | 'brand' | null>(null);
  const loaded = useRef<string | null>(null);

  const byId = useMemo(() => { const m = new Map<string, CategoryNode>(); const walk = (ns: CategoryNode[]) => ns.forEach((n) => { m.set(n.id, n); walk(n.children ?? []); }); walk(tree.data ?? []); return m; }, [tree.data]);
  const mains = tree.data ?? []; const mids = byId.get(main)?.children ?? []; const subs = byId.get(mid)?.children ?? [];
  const modelAttr = (commonAttrs.data ?? []).find((a) => a.system_key === 'MODEL_LINE');
  const materialAttr = (commonAttrs.data ?? []).find((a) => a.system_key === 'MATERIAL');
  const otherAttrs = (commonAttrs.data ?? []).filter((a) => !a.system_key);
  const modelText = modelAttr ? attrRows[modelAttr.id]?.[0]?.value_text ?? '' : '';

  useEffect(() => {
    const d = draftQ.data; if (!d || loaded.current === d.id || !tree.data) return;
    loaded.current = d.id;
    const x = (d.data ?? {}) as DraftData;
    if (x.category_id) { const c = byId.get(x.category_id); if (c) { setSub(c.id); const m2 = c.parent_id ? byId.get(c.parent_id) : undefined; if (m2) { setMid(m2.id); setMain(m2.parent_id ?? ''); } } }
    setBrandId(x.brand_id ?? ''); setUnitId(x.unit_id ?? ''); setBaseCode(x.base_code ?? ''); setNameOverride(x.name ?? '');
    setParts(x.name_parts ?? DEFAULT_PARTS); setAttrRows(listToRows(x.attributes ?? [])); setSizeIds(x.size_ids ?? []); setColorIds(x.color_ids ?? []); setCells(x.cells ?? {}); setBaseSale(x.base_sale ?? '');
  }, [draftQ.data, tree.data, byId]);

  const combos = useMemo(() => sizeIds.flatMap((sz) => colorIds.map((cl) => ({ sz, cl, k: key(sz, cl) }))), [sizeIds, colorIds]);
  const cellOf = (k: string): CellState => ({ ...EMPTY_CELL, ...cells[k] });
  const activeCombos = combos.filter((c) => cellOf(c.k).on);
  const attrList = rowsToList(attrRows);
  const cellsIn = activeCombos.map((c) => ({ size_id: c.sz, color_id: c.cl, base_code: cellOf(c.k).base_code, display_name: cellOf(c.k).display_name.trim() || null }));
  const sumSale = activeCombos.reduce((a, c) => a + (Number(digits(cellOf(c.k).sale)) || 0), 0);

  const previewKey = JSON.stringify({ sub, brandId, baseCode, parts, attrList, c: cellsIn.map((c) => [c.size_id, c.color_id, c.base_code]) });
  useEffect(() => { setErr(null); }, [previewKey, unitId]);
  useEffect(() => {
    if (!sub || !brandId) { setPreview(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      previewProductNames({ category_id: sub, brand_id: brandId, attributes: attrList, name_parts: parts as never, base_code: baseCode, cells: cellsIn.map((c) => ({ ...c, display_name: null })) }, ctl.signal)
        .then(setPreview).catch(() => undefined);
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [previewKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const setCell = (k: string, patch: Partial<CellState>) => setCells((x) => ({ ...x, [k]: { ...EMPTY_CELL, ...x[k], ...patch } }));
  const applyBase = () => {
    if (!digits(baseSale)) { toast('ابتدا قیمت فروش پایه را وارد کنید.', 'error'); return; }
    setCells((x) => { const n = { ...x }; combos.forEach((c) => { n[c.k] = { ...EMPTY_CELL, ...n[c.k], sale: digits(baseSale) }; }); return n; });
    toast('قیمت پایه روی همه سلول‌های ماتریس اعمال شد.');
  };
  const catPath = [byId.get(main)?.name, byId.get(mid)?.name, byId.get(sub)?.name];
  const draftLabel = () => `${byId.get(sub)?.name ?? 'ماتریس بدون عنوان'}${modelText ? ` مدل ${modelText}` : ''}`;
  const draftData = (): DraftData => ({ category_id: sub || undefined, brand_id: brandId || undefined, unit_id: unitId || undefined, base_code: baseCode, name: nameOverride, name_parts: parts, attributes: attrList, size_ids: sizeIds, color_ids: colorIds, cells, base_sale: baseSale });
  const saveDraft = async () => {
    try {
      const d = draftId && draftQ.data ? await dw.update.mutateAsync({ id: draftId, body: { label: draftLabel(), data: draftData() } }) : await dw.create.mutateAsync({ label: draftLabel(), data: draftData() });
      loaded.current = d.id; setSp({ draft: d.id }, { replace: true }); toast(`پیش‌نویس «${d.label}» ذخیره شد.`);
    } catch (e) { setErr(userMessage(e)); }
  };
  const loadDraft = (id: string) => { loaded.current = null; setSp({ draft: id }, { replace: true }); setDraftsOpen(false); };
  const discardDraft = async (id: string) => { try { await dw.discard.mutateAsync(id); if (id === draftId) setSp({}, { replace: true }); toast('پیش‌نویس حذف شد.'); } catch (e) { setErr(userMessage(e)); } };
  const submit = async () => {
    setErr(null);
    if (!sub) { setErr('دسته فرعی را انتخاب کنید.'); return; }
    if (!brandId) { setErr('برند را انتخاب کنید.'); return; }
    if (!unitId) { setErr('واحد اصلی کالا را انتخاب کنید.'); return; }
    if (!cellsIn.length) { setErr('حداقل یک سلول ماتریس باید فعال باشد.'); return; }
    try {
      const p = await pw.create.mutateAsync({
        category_id: sub, brand_id: brandId, unit_id: unitId, size_ids: sizeIds, color_ids: colorIds, cells: cellsIn, attributes: attrList,
        name_parts: parts as never, name: nameOverride.trim() || null, draft_id: draftId || null, base_code: baseCode.trim(),
      });
      let priced = 0;
      const priceRows = activeCombos.filter((c) => digits(cellOf(c.k).sale));
      if (priceRows.length && can('pricing.prices.update')) {
        try {
          const goods = await fetchAll<ItemRow>('/catalog/items', { product_id: p.id, kind: 'GOOD' });
          const rows = priceRows.map((c) => { const g = goods.find((x) => x.sizes[0]?.id === c.sz && x.colors[0]?.id === c.cl); return g ? { item_id: g.id, sale_price: digits(cellOf(c.k).sale) } : null; }).filter((r): r is { item_id: string; sale_price: string } => !!r);
          for (let i = 0; i < rows.length; i += 200) await setPricesBulk(rows.slice(i, i + 200));
          priced = rows.length;
        } catch (e) { toast(`کالاها ساخته شد ولی ثبت قیمت‌ها ناموفق بود: ${userMessage(e)}`, 'error'); }
      }
      // C-29 ✅ (افشین 2026-10-25): همه‌ی کالاهای ماتریس در همان ساخت بارکد داخلی می‌گیرند و فعال می‌شوند؛ خانواده هم فعال
      toast(`${faNum(p.good_count)} کالا ساخته شد${p.activated_count ? ` و ${faNum(p.activated_count)} کالا با بارکد فعال شد` : ''}${priced ? `؛ قیمت ${faNum(priced)} کالا ثبت شد` : ''}.`);
      navigate(`/catalog/products?fam=${p.id}`, { replace: true });
    } catch (e) { setErr(userMessage(e)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };
  const loading = tree.isLoading || brands.isLoading || units.isLoading || commonAttrs.isLoading || sizes.isLoading || colors.isLoading || (!!draftId && draftQ.isLoading);
  const unitOpts = (units.data ?? []).filter((u) => u.kind === 'MAIN');
  const openDrafts = drafts.data?.results ?? [];

  return (
    <>
      <PageHead title="تعریف ماتریسی کالا" back={back}
        sub="مرحله اول از دو مرحله — ابتدا مشخصات مشترک را تعیین کنید، سپس سایزها و رنگ‌ها را انتخاب کنید. از تلاقی هر سایز و رنگ یک کالای مستقل با قیمت فروش خودش ساخته می‌شود." />
      {/* افشین 2026-10-23: سطر اول بازگشت + عنوان + متن (راست‌چین)، سطر دوم دکمه‌ها */}
      <div className={s.wizActions}>
        <Button variant="secondary" onClick={back}>انصراف</Button>
        <Button variant="secondary" icon={<IconFolder size={17} />} onClick={() => setDraftsOpen(true)}>پیش‌نویس‌ها ({faNum(openDrafts.length)})</Button>
        <Button variant="secondary" icon={<IconDeviceFloppy size={17} />} onClick={saveDraft} loading={dw.create.isPending || dw.update.isPending}>ذخیره پیش‌نویس</Button>
        <Button icon={<IconCheck size={17} />} onClick={submit} loading={pw.create.isPending} loadingText="در حال ساخت…">ثبت کالاهای ماتریس</Button>
      </div>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      {draftId && draftQ.error ? <div className={s.formErr}><Alert>پیش‌نویس پیدا نشد یا قبلاً به خانواده تبدیل شده است.</Alert></div> : null}
      {loading ? <Card><SkeletonRows rows={5} height={60} /></Card> : (
        <div className={s.wizard}>
          <div className={s.stack}>
            <Card>
              <SectionTitle>۱. مشخصات مشترک همه کالاهای ماتریس</SectionTitle>
              <p className={s.intro}>این مقادیر برای همه سلول‌های ماتریس یکسان است و بعداً شرط همگنی آیتم را تأمین می‌کند.</p>
              <FormGrid cols={4}>
                <Select label="دسته اصلی" required value={main} onChange={(e) => { setMain(e.target.value); setMid(''); setSub(''); }} placeholder="انتخاب کنید" options={mains.map((n) => ({ value: n.id, label: n.name }))} />
                <Select label="دسته میانی" required value={mid} disabled={!main} onChange={(e) => { setMid(e.target.value); setSub(''); }} placeholder={main ? 'انتخاب کنید' : 'ابتدا دسته اصلی'} options={mids.map((n) => ({ value: n.id, label: n.name }))} />
                <Select label="دسته فرعی" required value={sub} disabled={!mid} onChange={(e) => setSub(e.target.value)} placeholder={mid ? 'انتخاب کنید' : 'ابتدا دسته میانی'} options={subs.map((n) => ({ value: n.id, label: n.name }))} />
                <Select label="برند" required value={brandId} onChange={(e) => setBrandId(e.target.value)} placeholder="انتخاب کنید" options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
              </FormGrid>
              {can('catalog.categories.create') || can('catalog.brands.create') ? (
                <div className={s.quickAddRow} data-quick-add>
                  <span>{can('catalog.categories.create') ? <Button size="sm" variant="ghost" icon={<IconPlus size={15} />} onClick={() => setQuickNew('category')}>دسته‌بندی جدید</Button> : null}</span>
                  <span>{can('catalog.brands.create') ? <Button size="sm" variant="ghost" icon={<IconPlus size={15} />} onClick={() => setQuickNew('brand')}>برند جدید</Button> : null}</span>
                </div>
              ) : null}
              <div style={{ marginTop: 12 }}>
                <FormGrid cols={4}>
                  {modelAttr ? <AttributeFields attrs={[modelAttr]} rows={attrRows} onChange={setAttrRows} cols={1} /> : null}
                  {materialAttr ? <AttributeFields attrs={[materialAttr]} rows={attrRows} onChange={setAttrRows} cols={1} /> : null}
                  <Select label="واحد اصلی کالا" required value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="انتخاب کنید" options={unitOpts.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))} hint="کوچک‌ترین واحد فروش (عدد، جفت…)" />
                  <Input label="کد برند" latin value={baseCode} onChange={(e) => setBaseCode(e.target.value)} dir="ltr" maxLength={50} hint="کد کالا نزد برند (کارخانه)" />
                </FormGrid>
              </div>
              {otherAttrs.length ? <div style={{ marginTop: 12 }}><AttributeFields attrs={otherAttrs} rows={attrRows} onChange={setAttrRows} cols={4} /></div> : null}
              <div className={s.catPath} style={{ marginTop: 12 }}>مسیر دسته‌بندی اعمال‌شده روی کالاها: <b>{catPath.map((x) => x ?? '—').join(' › ')}</b></div>
              {/* افشین 2026-10-25: نام‌گذاری خودکار همیشه باز (بدون باز/بسته شدن) */}
              <div className={s.details}>
                <div className={s.detailsHead}>نام‌گذاری خودکار (اجزای نام)</div>
                <div className={s.nameParts} style={{ marginTop: 8 }}>
                  {NAME_PART_ORDER.map((p) => { const on = parts.includes(p); return <button key={p} type="button" className={`${s.pick} ${on ? s.pickOn : ''}`} aria-pressed={on} data-tip="" onClick={() => setParts(NAME_PART_ORDER.filter((q) => (q === p ? !on : parts.includes(q))))}>{NAME_PART_LABELS[p]}</button>; })}
                </div>
                <FormGrid cols={2}>
                  <Input label="نام دستی خانواده (اختیاری)" value={nameOverride} onChange={(e) => setNameOverride(e.target.value)} maxLength={200} hint="خالی ⇐ نام خودکار از اجزای بالا" />
                  <Field label="نام خودکار خانواده"><div className={s.sampleName} style={{ minHeight: 42 }}>{preview?.name || '—'}</div></Field>
                </FormGrid>
              </div>
            </Card>

            <Card>
              <SectionTitle>۲. ابعاد ماتریس</SectionTitle>
              <p className={s.intro}>سایزها و رنگ‌های این مدل را انتخاب کنید — ماتریس {faNum(sizeIds.length)} × {faNum(colorIds.length)} یعنی {faNum(combos.length)} کالای مستقل.</p>
              <div className={s.stack}>
                <div data-dim="sizes">
                  <div className={s.dimHead}><span>سایزها</span><span className={s.setPicks}>{(sizeSets.data?.results ?? []).map((st) => <button key={st.id} type="button" className={s.setPick} data-tip={st.sizes.map((x) => x.name).join('، ')} onClick={() => setSizeIds(Array.from(new Set([...sizeIds, ...st.sizes.map((x) => x.id)])))}>+ {st.name}</button>)}</span></div>
                  <div className={s.pickGrid}>
                    {(sizes.data ?? []).map((sz) => <button key={sz.id} type="button" className={`${s.pick} ${sizeIds.includes(sz.id) ? s.pickOn : ''}`} aria-pressed={sizeIds.includes(sz.id)} data-tip={sz.name} onClick={() => toggle(sizeIds, setSizeIds, sz.id)}><span data-latin>{sz.code}</span></button>)}
                    {can('catalog.attributes.create') ? <button type="button" className={`${s.pick} ${s.pickAdd}`} onClick={() => setNewDim('size')} data-tip=""><IconPlus size={14} /> افزودن سایز</button> : null}
                  </div>
                </div>
                <div data-dim="colors">
                  <div className={s.dimHead}><span>رنگ‌ها</span><span className={s.setPicks}>{(colorSets.data?.results ?? []).map((st) => <button key={st.id} type="button" className={s.setPick} data-tip={st.colors.map((x) => x.name).join('، ')} onClick={() => setColorIds(Array.from(new Set([...colorIds, ...st.colors.map((x) => x.id)])))}>+ {st.name}</button>)}</span></div>
                  <div className={s.pickGrid}>
                    {(colors.data ?? []).map((cl) => <button key={cl.id} type="button" className={`${s.pick} ${colorIds.includes(cl.id) ? s.pickOn : ''}`} aria-pressed={colorIds.includes(cl.id)} data-tip="" onClick={() => toggle(colorIds, setColorIds, cl.id)}><Swatch hex={cl.hex_code} />{cl.name}</button>)}
                    {can('catalog.attributes.create') ? <button type="button" className={`${s.pick} ${s.pickAdd}`} onClick={() => setNewDim('color')} data-tip=""><IconPlus size={14} /> افزودن رنگ</button> : null}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <SectionTitle>۳. ماتریس قیمت کالاها</SectionTitle>
              <div className={s.filterRow} style={{ gridTemplateColumns: '1fr 1fr auto', maxWidth: 600, margin: '0 0 10px' }}>
                <Input label="قیمت خرید پایه" value="" readOnly placeholder="به‌زودی (ماژول خرید)" />
                <Input label="قیمت فروش پایه (ریال)" inputMode="numeric" value={groupMoney(baseSale)} onChange={(e) => setBaseSale(digits(e.target.value))} placeholder="۰" />
                <Button variant="secondary" onClick={applyBase}>اعمال روی همه سلول‌ها</Button>
              </div>
              <p className={s.intro}>قیمت هر سلول را می‌توانید جداگانه ویرایش کنید؛ سلول غیرفعال به کالا تبدیل نمی‌شود.{can('pricing.prices.update') ? '' : ' (مجوز ثبت قیمت ندارید؛ قیمت‌ها فقط در پیش‌نویس می‌مانند.)'}</p>
              {!combos.length ? <div className={s.colEmpty}>برای ساخت ماتریس، حداقل یک سایز و یک رنگ انتخاب کنید.</div> : (
                <div className={s.matrix}>
                  <table>
                    <thead><tr><th>سایز ╲ رنگ</th>{colorIds.map((cl) => { const c = colors.data?.find((x) => x.id === cl); return <th key={cl}><Swatch hex={c?.hex_code} /> {c?.name}</th>; })}</tr></thead>
                    <tbody>
                      {sizeIds.map((sz) => (
                        <tr key={sz}>
                          <th data-latin>{sizes.data?.find((x) => x.id === sz)?.code}</th>
                          {colorIds.map((cl) => { const k = key(sz, cl); const c = cellOf(k); return (
                            <td key={cl}>
                              <div className={`${s.cell} ${c.on ? '' : s.cellOff}`}>
                                <div className={s.cellHead}>
                                  <button type="button" className={`${s.cb} ${c.on ? s.cbOn : ''}`} role="checkbox" aria-checked={c.on} aria-label={c.on ? 'سلول فعال' : 'سلول غیرفعال'} onClick={() => setCell(k, { on: !c.on })}>{c.on ? <IconCheck size={13} /> : null}</button>
                                  <span className={s.cellCode}>{colors.data?.find((x) => x.id === cl)?.name}</span>
                                </div>
                                {c.on ? <>
                                  <input value="" readOnly placeholder="قیمت خرید (ریال، به‌زودی)" aria-label="قیمت خرید" />
                                  <input value={groupMoney(c.sale)} onChange={(e) => setCell(k, { sale: digits(e.target.value) })} placeholder="قیمت فروش (ریال)" aria-label="قیمت فروش" inputMode="numeric" />
                                </> : <div className={s.cellName}>ساخته نمی‌شود</div>}
                              </div>
                            </td>
                          ); })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <aside className={s.wizardSide}>
            <Card>
              <SectionTitle>خروجی ماتریس</SectionTitle>
              <div className={s.sumRow}><span>کالای ساخته‌شده</span><b className="tnum">{faNum(cellsIn.length)}</b></div>
              <div className={s.sumRow}><span>ابعاد ماتریس</span><b className="tnum">{faNum(sizeIds.length)} × {faNum(colorIds.length)}</b></div>
              <div className={s.sumRow}><span>جمع قیمت خرید</span><b className={s.muted}>—</b></div>
              <div className={s.sumRow}><span>جمع قیمت فروش</span><b className="tnum">{faNum(sumSale)}<Rial /></b></div>
              <div className={s.sumRow} style={{ borderBottom: 0 }}><span>میانگین حاشیه سود</span><b className={s.muted} data-tip="نیازمند قیمت خرید">—</b></div>
              <div className={s.segLabel} style={{ margin: '10px 0 6px' }}>نمونه نام کالا (ترکیبی)</div>
              <div className={s.sampleName}>{preview?.cells[0]?.display_name || 'برای دیدن نمونه نام، دسته‌بندی و ابعاد ماتریس را کامل کنید.'}</div>
              <div style={{ marginTop: 12 }}><Button block icon={<IconCheck size={17} />} onClick={submit} loading={pw.create.isPending}>ثبت کالاهای ماتریس</Button></div>
              <p className={s.sub} style={{ marginTop: 8 }}>مرحله بعد: از منوی «ساخت آیتم» چند کالا از این ماتریس را ادغام کنید تا آیتم فروش ساخته شود.</p>
            </Card>
            <Card>
              <SectionTitle extra={<span className={s.famCount}>{faNum(openDrafts.length)} مورد</span>}>پیش‌نویس‌ها</SectionTitle>
              {openDrafts.length === 0 ? <p className={s.sub} style={{ margin: 0 }}>با «ذخیره پیش‌نویس» وضعیت فعلی فرم — همراه ماتریس و قیمت‌ها — نگه داشته می‌شود و بعداً از همین‌جا بارگذاری می‌شود.</p>
                : <div className={s.stack} style={{ gap: 6 }}>{openDrafts.slice(0, 5).map((d) => <DraftRowView key={d.id} d={d} current={d.id === draftId} onLoad={() => loadDraft(d.id)} onDiscard={() => discardDraft(d.id)} />)}{openDrafts.length > 5 ? <Button variant="ghost" size="sm" onClick={() => setDraftsOpen(true)}>همه‌ی پیش‌نویس‌ها</Button> : null}</div>}
            </Card>
          </aside>
        </div>
      )}
      {draftsOpen ? (
        <Modal open onClose={() => setDraftsOpen(false)} title="پیش‌نویس‌های ماتریس" width={560} footer={<Button variant="secondary" onClick={() => setDraftsOpen(false)}>بستن</Button>}>
          {openDrafts.length === 0 ? <Empty title="پیش‌نویسی ندارید" /> : <div className={s.stack} style={{ gap: 6 }}>{openDrafts.map((d) => <DraftRowView key={d.id} d={d} current={d.id === draftId} onLoad={() => loadDraft(d.id)} onDiscard={() => discardDraft(d.id)} />)}</div>}
        </Modal>
      ) : null}
      {quickNew === 'category' ? <CategoryCreateModal mains={mains} preMain={main} preMid={mid} onClose={() => setQuickNew(null)}
        onCreated={(c) => { if (c.level === 1) { setMain(c.id); setMid(''); setSub(''); } else if (c.level === 2) { setMain(c.mainId); setMid(c.id); setSub(''); } else { setMain(c.mainId); setMid(c.midId); setSub(c.id); } setQuickNew(null); }} /> : null}
      {quickNew === 'brand' ? <BrandModal brand={null} quick onClose={() => setQuickNew(null)} onSaved={(b) => { setBrandId(b.id); setQuickNew(null); }} /> : null}
      {newDim ? <NewDimModal kind={newDim} onClose={() => setNewDim(null)} onCreated={(id) => { if (newDim === 'size') setSizeIds((x) => [...x, id]); else setColorIds((x) => [...x, id]); setNewDim(null); }} /> : null}
    </>
  );
}

function DraftRowView({ d, current, onLoad, onDiscard }: { d: { id: string; label: string; updated_at: string }; current: boolean; onLoad: () => void; onDiscard: () => void }) {
  return (
    <div className={`${s.draftRow} ${current ? s.draftRowOn : ''}`}>
      <div><div className={s.draftLabel}>{d.label}</div><div className={s.sub}>{faDate(d.updated_at)}{current ? ' · در حال ویرایش' : ''}</div></div>
      <span className={s.rowActions}>
        {!current ? <Button size="sm" variant="secondary" onClick={onLoad}>بارگذاری</Button> : null}
        <IconButton label="حذف پیش‌نویس" danger onClick={onDiscard}><IconTrash size={15} /></IconButton>
      </span>
    </div>
  );
}

/** افزودن سایز/رنگ تازه از داخل ویزارد (html: «سایز جدید / افزودن سایز»)؛ بک‌اند کد لاتین + نام (+ رنگ) می‌خواهد */
function NewDimModal({ kind, onClose, onCreated }: { kind: 'size' | 'color'; onClose: () => void; onCreated: (id: string) => void }) {
  const sw = useSizeWrite(); const cw = useColorWrite();
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [hex, setHex] = useState('#c0454b');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    const c = code.trim().toUpperCase();
    if (!c || !/^[A-Z0-9-]+$/.test(c)) { setErr('کد الزامی است: فقط حروف بزرگ لاتین، رقم و خط تیره.'); return; }
    if (!name.trim()) { setErr('نام را وارد کنید.'); return; }
    try {
      const r = kind === 'size' ? await sw.create.mutateAsync({ code: c, name: name.trim(), sort_order: 0, is_active: true }) : await cw.create.mutateAsync({ code: c, name: name.trim(), hex_code: hex, is_active: true });
      onCreated(r.id);
    } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={kind === 'size' ? 'سایز جدید' : 'رنگ جدید'} width={460}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={sw.create.isPending || cw.create.isPending}>{kind === 'size' ? 'افزودن سایز' : 'افزودن رنگ'}</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <Input label="کد" required latin value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} dir="ltr" placeholder={kind === 'size' ? '3XL' : 'NAVY'} maxLength={10} hint="در SKU می‌آید؛ بعداً تغییر نمی‌کند" />
        <Input label="نام" required value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'size' ? 'مثال: ۳ ایکس لارج' : 'مثال: سرمه‌ای'} maxLength={30} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        {kind === 'color' ? <Field label="رنگ" required><span className={s.hexRow}><input type="color" value={hex} onChange={(e) => setHex(e.target.value)} aria-label="انتخاب رنگ" /><span data-latin className={s.muted}>{hex}</span></span></Field> : null}
      </FormGrid>
    </Modal>
  );
}
