import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { IconCheck, IconSearch, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useBack } from '@/shared/lib/useBack';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea, Toggle } from '@/shared/ui/form';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useColumnPrefs } from '@/shared/lib/useColumnPrefs';
import { Stepper } from '@/shared/ui/Stepper';
import { Badge, Card, Empty, PageHead, Pagination, Segmented, SectionTitle, SkeletonRows, Rial, UnitHead, DiscountedPrice } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useAllBrands, useBundle, useBundleMutations, useBundlePolicies, useBundlePrice, useCategoryTree, useItems, usePricesFor, type BundlePriceIn, type CategoryNode, type ItemRow } from './api';
import { IconButton } from './components';
import { ClearFilters, clearGoodsFilters, GOODS_COLUMNS, goodsDataColumns, GoodsFilters, goodsFiltersActive, goodsFilterParams, GRADE_OPTIONS, ITEM_COLUMNS, itemDataColumns, ITEM_PATTERN_OPTIONS, selectColumn, useLocalFilters, useModelLineOptions, type FP } from './catalogTables';
import s from './catalog.module.css';
import { groupMoney } from '@/shared/lib/money';

/**
 * «تعریف باندل (پک کالا)» و ویرایش آن — مطابق html Fixed V2: مشخصات (نام، کد، سیاست، توضیحات)، انتخاب اقلام (فیلتر دسته/سایز/رنگ + جست‌وجو،
 * کارت کالا با «افزودن به پک»)، جدول اقلام و قیمت‌گذاری (تعداد، تخفیف درصدی/مبلغی هر قلم، قیمت در باندل) و ستون «قیمت‌گذاری باندل» با قیمت نهایی دستی.
 * ثبت: POST/PATCH /catalog/bundles (اقلام) سپس PUT /pricing/bundle-prices/{id} (قیمت دستی + تخفیف‌ها، جایگزینی کامل). باندل تازه غیرفعال ساخته می‌شود؛
 * «انتشار پس از ثبت» ⇐ PATCH publish. محاسبه‌ی پیش‌نمایش مثل بک‌اند: تخفیف روی جمع ردیف، قیمت محاسبه‌شده گرد به ۱۰۰۰ ریال، قیمت دستی ⇐ تخفیف اقلام نادیده.
 * «گردش کالا»، موجودی، آخرین فروش و رکود تا ماژول‌های انبار/فروش «به‌زودی». انتخاب اقلام (2026-10-23) = جدول کالاها/آیتم‌ها با همان فیلترها، انتخاب ستون‌ها و مربع انتخاب.
 */
type Line = { item: Pick<ItemRow, 'id' | 'code' | 'display_name' | 'category_name' | 'status'>; qty: number; dtype: 'PERCENT' | 'AMOUNT'; dval: string };
const digits = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');
const decimal = (v: string) => toLatinDigits(v).replace(/[^0-9.]/g, '');
const round1000 = (v: number) => Math.round(v / 1000) * 1000;
const flatten = (nodes: CategoryNode[], out = new Map<string, CategoryNode>()) => { for (const n of nodes) { out.set(n.id, n); flatten(n.children ?? [], out); } return out; };

export default function BundleFormPage() {
  const { id: editId } = useParams();
  const isEdit = !!editId;
  const can = usePerm();
  const navigate = useNavigate();
  const back = useBack('/catalog/bundles');
  const toast = useToast();
  const m = useBundleMutations();
  const edit = useBundle(editId);
  const editPrice = useBundlePrice(editId, isEdit && can('pricing.prices.bundles.read'));
  const policies = useBundlePolicies();
  const [name, setName] = useState(''); const [policy, setPolicy] = useState(''); const [desc, setDesc] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [override, setOverride] = useState('');
  const [publish, setPublish] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const loaded = useRef(false);
  useEffect(() => { setErr(null); }, [name, lines.length]);

  useEffect(() => {
    const d = edit.data; if (!d || loaded.current || (can('pricing.prices.bundles.read') && editPrice.isLoading)) return; loaded.current = true;
    const pl = editPrice.data;
    setName(d.name); setPolicy(d.policy); setDesc(d.description); setPublish(d.is_active);
    setLines(d.lines.map((l) => { const x = pl?.lines.find((y) => y.item_id === l.item_id); return { item: { id: l.item_id, code: l.item_code, display_name: l.item_name, category_name: '', status: l.item_status }, qty: Number(l.quantity), dtype: (x?.discount_type ?? 'PERCENT') as Line['dtype'], dval: x?.discount_value ? String(Number(x.discount_value)) : '' }; }));
    setOverride(pl?.final_price_override ? String(Number(pl.final_price_override)) : '');
  }, [edit.data, editPrice.data, editPrice.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const canPrice = can('pricing.prices.list');
  const lineIds = useMemo(() => lines.map((l) => l.item.id), [lines]);
  const policyOpts = useMemo(() => {
    const act = (policies.data ?? []).map((p) => ({ code: p.code, name: p.name, description: p.description, inactive: false }));
    const d = edit.data;
    return d && d.policy && !act.some((o) => o.code === d.policy) ? [...act, { code: d.policy, name: d.policy_name || d.policy, description: '', inactive: true }] : act;
  }, [policies.data, edit.data]);
  useEffect(() => { if (!isEdit && !policy && policies.data?.length) setPolicy(policies.data[0]!.code); }, [isEdit, policy, policies.data]);
  const prices = usePricesFor(lineIds, canPrice);
  const unit = (id: string) => { const v = prices.data?.get(id)?.sale_price; return v ? Number(v) : null; };
  const calc = lines.map((l) => {
    const u = unit(l.item.id); const gross = u == null ? null : u * l.qty; const v = Number(decimal(l.dval)) || 0;
    const disc = gross == null || !v ? 0 : l.dtype === 'PERCENT' ? Math.round((gross * v) / 100) : v;
    return { ...l, u, gross, disc, net: gross == null ? null : gross - disc };
  });
  const priced = calc.every((c) => c.gross != null);
  const grossTotal = calc.reduce((a, c) => a + (c.gross ?? 0), 0);
  const discTotal = calc.reduce((a, c) => a + c.disc, 0);
  const computed = priced && calc.length ? round1000(grossTotal - discTotal) : null;
  const ov = Number(digits(override)) || 0;
  const effective = ov || computed;
  const pieces = lines.reduce((a, l) => a + l.qty, 0);
  const saving = effective != null && grossTotal ? grossTotal - effective : 0;
  const add = (it: ItemRow) => setLines((x) => (x.some((l) => l.item.id === it.id) ? x : [...x, { item: it, qty: 1, dtype: 'PERCENT', dval: '' }]));
  const patch = (id: string, p: Partial<Line>) => setLines((x) => x.map((l) => (l.item.id === id ? { ...l, ...p } : l)));

  const validate = (): string | null => {
    if (!name.trim()) return 'نام باندل را وارد کنید.';
    if (!policy) return 'سیاست باندل را انتخاب کنید.';
    if (!lines.length) return 'دست‌کم یک قلم به پک اضافه کنید.';
    for (const c of calc) {
      const v = Number(decimal(c.dval)) || 0; if (!c.dval) continue;
      if (c.dtype === 'PERCENT' && (v <= 0 || v > 100)) return `تخفیف «${c.item.code}» باید بیشتر از ۰ و حداکثر ۱۰۰ درصد باشد.`;
      if (c.dtype === 'AMOUNT' && c.gross != null && v > c.gross) return `مبلغ تخفیف «${c.item.code}» از جمع آن ردیف بیشتر است.`;
    }
    return null;
  };
  const submit = async () => {
    setErr(null); const v = validate(); if (v) { setErr(v); return; }
    setBusy(true);
    try {
      const body = { name: name.trim(), description: desc, policy: policy as never, lines: lines.map((l) => ({ item_id: l.item.id, quantity: l.qty })) };
      const b = isEdit ? await m.update.mutateAsync({ id: editId!, body }) : await m.create.mutateAsync(body);
      const priceBody: BundlePriceIn = { final_price_override: ov ? String(ov) : null, lines: calc.filter((c) => Number(decimal(c.dval)) > 0).map((c) => ({ item_id: c.item.id, discount_type: c.dtype, discount_value: decimal(c.dval) })) } as never;
      const hasPrice = !!priceBody.final_price_override || (priceBody.lines?.length ?? 0) > 0;
      if (can('pricing.prices.bundles.update') && (hasPrice || isEdit)) {
        try { await m.price.mutateAsync({ id: b.id, body: priceBody }); } catch (e) { toast(`باندل ذخیره شد ولی ثبت قیمت ناموفق بود: ${userMessage(e)}`, 'error'); }
      }
      if (publish && !b.is_active) await m.publish.mutateAsync(b.id);
      if (!publish && b.is_active) await m.archive.mutateAsync(b.id);
      toast(isEdit ? 'تغییرات باندل ذخیره شد.' : `باندل «${b.name}» با ${faNum(lines.length)} قلم ثبت شد${publish ? ' و منتشر شد' : ''}.`);
      navigate(`/catalog/bundles?query=${encodeURIComponent(b.code)}`, { replace: true });
    } catch (e) { setErr(userMessage(e)); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };

  if (isEdit && edit.isLoading) return <Card><SkeletonRows rows={6} height={60} /></Card>;
  if (isEdit && edit.error) return <Card><Empty title="باندل پیدا نشد" text={userMessage(edit.error)} /></Card>;
  return (
    <>
      <PageHead title={isEdit ? 'ویرایش باندل (پک کالا)' : 'تعریف باندل (پک کالا)'} back={back}
        sub="چند قلم کالا را در یک پک بگذارید و برای پک قیمت تعیین کنید — قیمت هر قلم قابل ویرایش است و می‌توانید روی هر قلم تخفیف درصدی یا مبلغی بگذارید."
        actions={<><Button variant="secondary" onClick={back}>انصراف</Button><Button icon={<IconCheck size={17} />} onClick={submit} loading={busy}>{isEdit ? 'ذخیره تغییرات' : 'ثبت باندل'}</Button></>} />
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={s.wizard}>
        <div className={s.stack}>
          <Card>
            <SectionTitle>مشخصات باندل</SectionTitle>
            <div className={s.filterRow} style={{ gridTemplateColumns: '2fr 1fr' }}>
              <Input label="نام باندل" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="مثال: پک راحتی زمستانه" />
              <Input label="کد باندل" value={isEdit ? edit.data?.code ?? '' : ''} readOnly disabled placeholder="خودکار پس از ثبت" dir="ltr" />
            </div>
            <div className={s.segLabel} style={{ margin: '12px 0 8px' }}>سیاست باندل</div>
            {/* سیاست‌ها از تنظیمات (C-28)؛ سیاست غیرفعالِ باندلِ در حال ویرایش با برچسب «غیرفعال» نگه داشته می‌شود */}
            <div className={s.pickGrid} data-policy>
              {policyOpts.map((o) => <button key={o.code} type="button" className={`${s.pick} ${policy === o.code ? s.pickOn : ''}`} aria-pressed={policy === o.code} data-tip={o.description || ''} onClick={() => setPolicy(o.code)}>{o.name}{o.inactive ? <small className={s.muted}> (غیرفعال)</small> : null}</button>)}
              {policies.isLoading ? <span className={s.muted}>در حال بارگذاری سیاست‌ها…</span> : !policyOpts.length ? <span className={s.warnText}>سیاست فعالی تعریف نشده است؛ از «تنظیمات ⇐ سیاست‌های باندل» تعریف کنید.</span> : null}
            </div>
            {policyOpts.find((o) => o.code === policy)?.description ? <p className={s.sub} style={{ margin: '6px 0 0' }}>{policyOpts.find((o) => o.code === policy)!.description}</p> : null}
            <div style={{ marginTop: 12 }}><Textarea label="توضیحات" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="توضیح کوتاه درباره این پک و منطق قیمت‌گذاری آن" rows={3} /></div>
          </Card>
          <ItemsPicker inPack={lineIds} onAdd={add} onRemove={(id) => setLines((x) => x.filter((l) => l.item.id !== id))} />
          <Card>
            <SectionTitle extra={<span className={s.famCount}>{faNum(lines.length)} قلم · {faNum(pieces)} عدد کالا</span>}>اقلام و قیمت‌گذاری باندل</SectionTitle>
            {!lines.length ? <div className={s.colEmpty}>هنوز قلمی به پک اضافه نشده است؛ در جدول بالا مربع کنار کالا یا آیتم را بزنید.</div> : (
              <div className={s.goodsPick} data-lines>
                <table>
                  <thead><tr><th>کد کالا</th><th>نام کالا</th><th>گردش</th><th>تعداد</th><th><UnitHead>قیمت پایه</UnitHead></th><th>تخفیف</th><th><UnitHead>قیمت در باندل</UnitHead></th><th /></tr></thead>
                  <tbody>{calc.map((c) => (
                    <tr key={c.item.id}>
                      <td className={s.muted} data-latin>{c.item.code}</td>
                      <td><span className={s.famName} style={{ maxWidth: 86 }} data-tip={c.item.display_name}>{c.item.display_name}</span>{c.item.status !== 'ACTIVE' ? <> <Badge tone="warning">غیرفعال</Badge></> : null}</td>
                      <td><span className={s.muted} data-tip="از ماژول فروش (به‌زودی)">—</span></td>
                      <td><Stepper label={`تعداد ${c.item.code}`} value={c.qty} min={1} max={100000} onChange={(v) => patch(c.item.id, { qty: v })} /></td>
                      <td className="tnum">{c.u != null ? faNum(c.u) : <span className={s.muted} data-tip="قیمت ثبت نشده">—</span>}</td>
                      <td><span className={s.discBox}>
                        <input aria-label={`تخفیف ${c.item.code}`} inputMode="decimal" value={c.dtype === 'PERCENT' ? toFaDigits(c.dval) : groupMoney(c.dval)} onChange={(e) => patch(c.item.id, { dval: c.dtype === 'PERCENT' ? decimal(e.target.value) : digits(e.target.value) })} placeholder="۰" />
                        <button type="button" className={s.discType} aria-label={`نوع تخفیف ${c.item.code}`} data-tip={c.dtype === 'PERCENT' ? 'درصد — کلیک: مبلغ' : 'مبلغ (ریال) — کلیک: درصد'} onClick={() => patch(c.item.id, { dtype: c.dtype === 'PERCENT' ? 'AMOUNT' : 'PERCENT', dval: '' })}>{c.dtype === 'PERCENT' ? '٪' : 'ریال'}</button>
                      </span></td>
                      <td style={{ textAlign: 'center' }}><DiscountedPrice original={c.gross} discount={c.disc} final={c.net} fmt={faNum} /></td>
                      <td><IconButton label={`حذف ${c.item.code} از پک`} danger onClick={() => setLines((x) => x.filter((l) => l.item.id !== c.item.id))}><IconTrash size={15} /></IconButton></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <aside className={s.wizardSide}>
          <Card>
            <SectionTitle>قیمت‌گذاری باندل</SectionTitle>
            <div className={s.sumRow}><span>تعداد اقلام</span><b className="tnum">{faNum(lines.length)}</b></div>
            <div className={s.sumRow}><span>تعداد کل کالا</span><b className="tnum">{faNum(pieces)} عدد</b></div>
            <div className={s.sumRow}><span>جمع قیمت پایه</span><b className="tnum" data-gross>{faNum(grossTotal)}<Rial /></b></div>
            <div className={s.sumRow}><span>جمع تخفیف اقلام{grossTotal && discTotal ? ` (${faNum(Math.round((discTotal / grossTotal) * 100))}٪)` : ''}</span><b className="tnum" style={{ color: 'var(--success)' }}>{discTotal ? <>−{faNum(discTotal)}<Rial /></> : '۰'}</b></div>
            <div className={s.sumRow}><span>قیمت محاسبه‌شده</span><b className="tnum" data-computed>{computed != null ? <>{faNum(computed)}<Rial /></> : '—'}</b></div>
            <div style={{ margin: '12px 0' }}><Input label="قیمت نهایی پک (اختیاری، ریال)" inputMode="numeric" value={groupMoney(override)} onChange={(e) => setOverride(digits(e.target.value))} placeholder={computed != null ? faNum(computed) : '۰'} disabled={!can('pricing.prices.bundles.update')}
              hint={ov && discTotal ? 'با قیمت نهایی دستی، تخفیف اقلام نادیده گرفته می‌شود.' : 'اگر خالی بماند، قیمت محاسبه‌شده از اقلام به‌عنوان قیمت پک ثبت می‌شود.'} /></div>
            <div className={s.sumRow} style={{ borderBottom: 0 }}><span>قیمت باندل</span><b className={`${s.price} tnum`} style={{ fontSize: 22, color: 'var(--brand)' }} data-effective>{effective != null ? <>{faNum(effective)}<Rial /></> : '—'}</b></div>
            {saving > 0 ? <div className={s.saveBox}><span>صرفه‌جویی مشتری</span><b>{faNum(saving)}<Rial /> ({faNum(Math.round((saving / grossTotal) * 100))}٪)</b></div> : null}
            {effective && pieces ? <p className={s.sub} style={{ margin: '8px 0' }}>میانگین قیمت هر عدد در پک: {faNum(Math.round(effective / pieces))} ریال</p> : null}
            {!priced && lines.length ? <p className={s.warnText}>برخی اقلام قیمت فروش ندارند؛ قیمت محاسبه‌شده کامل نیست.</p> : null}
            {can('catalog.bundles.update') || !isEdit ? <div className={s.switchBox} style={{ marginTop: 10 }}><div><b>انتشار باندل</b><div className={s.sub}>{isEdit ? (edit.data?.published_at && !publish ? 'خاموش ⇐ با ذخیره باندل آرشیو می‌شود (باندل منتشرشده حذف نمی‌شود)' : 'باندل در فروشگاه فعال باشد') : 'باندل پس از ثبت فعال شود (اقلام باید فعال باشند)'}</div></div><Toggle checked={publish} onChange={setPublish} label="" /></div> : null}
            <div style={{ marginTop: 12 }}><Button block icon={<IconCheck size={17} />} onClick={submit} loading={busy}>{isEdit ? 'ذخیره تغییرات' : 'ثبت باندل'}</Button></div>
          </Card>
          <Card>
            <SectionTitle>ترکیب گردش کالا در پک</SectionTitle>
            <p className={s.sub} style={{ margin: 0 }}>شمار اقلام کم‌گردش/راکد و پرفروش پک پس از راه‌اندازی ماژول فروش نمایش داده می‌شود (به‌زودی). برای اثرگذاری بیشتر، اقلام کم‌گردش را همراه اقلام پرفروش در باندل قرار دهید.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}

/**
 * انتخاب اقلام باندل (افشین 2026-10-23): در هر دو تب، جدول همان جدول منوی کالاها است — «کالاهای تکی» = ستون‌ها و فیلترهای «لیست کالاها»،
 * «آیتم‌ها» = ستون‌ها و فیلترهای «آیتم‌ها (واحد فروش)» — با انتخاب ستون‌ها (useColumnPrefs جدا برای این انتخاب‌گر) و ستون مربع انتخاب:
 * تیک = افزودن به پک، برداشتن تیک = حذف از پک؛ کلیک روی ردیف هم همین کار را می‌کند؛ تیک سرستون = همه‌ی ردیف‌های همین صفحه.
 * آرشیوشده‌ها قابل انتخاب نیستند. «گردش کالا»، موجودی و آخرین فروش تا ماژول‌های انبار/فروش ندارند.
 */
const PICK_GOODS_COLUMNS = GOODS_COLUMNS.filter((c) => c.key !== 'acts');
const PICK_ITEM_COLUMNS = ITEM_COLUMNS.filter((c) => c.key !== 'acts');
function ItemsPicker({ inPack, onAdd, onRemove }: { inPack: string[]; onAdd: (it: ItemRow) => void; onRemove: (id: string) => void }) {
  const can = usePerm();
  const tree = useCategoryTree(true);
  const byId = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const mains = tree.data ?? [];
  const brands = useAllBrands(); const modelOpts = useModelLineOptions();
  const [kind, setKind] = useState<'ITEM' | 'GOOD'>('ITEM');
  const gf = useLocalFilters(); const itf = useLocalFilters();
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const gfp: FP = useMemo(() => ({ get: gf.get, set: (x) => { gf.set(x); setPage(1); } }), [gf]);
  const [plo, phi] = (itf.get('price') || '-').split('-');
  const params = kind === 'GOOD'
    ? { kind, page, page_size: pageSize, query: dq || undefined, ...goodsFilterParams(gf) }
    : { kind, page, page_size: pageSize, query: dq || undefined, category_id: itf.get('main') || undefined, brand_id: itf.get('brand') || undefined, model_line: itf.get('model') || undefined, variation_pattern: itf.get('pattern') || undefined, grade: itf.get('grade') || undefined, min_sale_price: plo || undefined, max_sale_price: phi || undefined };
  const list = useItems(params);
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const canPrice = can('pricing.prices.list');
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const prices = usePricesFor(ids, canPrice);
  const pickable = rows.filter((r) => r.status !== 'ARCHIVED');
  const allOn = pickable.length > 0 && pickable.every((r) => inPack.includes(r.id));
  const toggle = (r: ItemRow) => { if (r.status === 'ARCHIVED') return; if (inPack.includes(r.id)) onRemove(r.id); else onAdd(r); };
  const sel = selectColumn<ItemRow>({
    isOn: (r) => inPack.includes(r.id), toggle, label: (r) => `انتخاب ${r.code} برای پک`, disabled: (r) => r.status === 'ARCHIVED',
    allOn, toggleAll: () => (allOn ? pickable.forEach((r) => onRemove(r.id)) : pickable.filter((r) => !inPack.includes(r.id)).forEach(onAdd)),
  });
  // کارت باریک‌تر از صفحه‌ی کالاها ⇐ پیش‌فرض چند ستون کم‌کاربرد پنهان (کاربر از «انتخاب ستون‌ها» برمی‌گرداند)
  const gprefs = useColumnPrefs('catalog.bundlePick.goods', PICK_GOODS_COLUMNS, ['sku', 'barcode', 'buy', 'margin']);
  const iprefs = useColumnPrefs('catalog.bundlePick.items', PICK_ITEM_COLUMNS, ['stock', 'pattern']);
  const prefs = kind === 'GOOD' ? gprefs : iprefs;
  const cols: Column<ItemRow>[] = [sel, ...(kind === 'GOOD' ? goodsDataColumns(prices, canPrice) : itemDataColumns(prices, canPrice, true)).filter((c) => prefs.isVisible(c.key))];
  const gActive = !!dq || goodsFiltersActive(gf);
  const count = list.data ? <span className={s.famCount}>{faNum(rows.length)} از {faNum(list.data.total)} {kind === 'ITEM' ? 'آیتم' : 'کالا'} · {faNum(inPack.length)} در پک</span> : null;
  return (
    <Card>
      <SectionTitle extra={count}>انتخاب اقلام باندل</SectionTitle>
      <p className={s.intro}>با فیلترها اقلام موردنظر را پیدا کنید و مربع کنار هر ردیف را بزنید تا به پک اضافه (یا از آن حذف) شود؛ برای اثرگذاری بیشتر، اقلام کم‌گردش را همراه اقلام پرفروش در یک پک بگذارید.</p>
      <div className={s.famHead} style={{ marginBottom: 6 }}>
        <Segmented value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={[{ value: 'ITEM', label: 'آیتم‌ها (واحد فروش)' }, { value: 'GOOD', label: 'کالاهای تکی' }]} />
        {kind === 'GOOD' ? (
          <div className={s.famTools}>
            <label className={s.famSearch}><IconSearch size={16} className={s.muted} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، کد یا بارکد کالا…" aria-label="جست‌وجوی اقلام" /></label>
            <ColumnPicker {...gprefs} />
            <ClearFilters onClick={() => { setQ(''); clearGoodsFilters(gfp); }} disabled={!gActive} />
          </div>
        ) : null}
      </div>
      {kind === 'GOOD' ? <GoodsFilters fp={gfp} mains={mains} byId={byId} /> : (
        <TableFilters stacked search={q} onSearch={setQ} placeholder="جستجوی نام یا کد آیتم…" filters={[
          { key: 'main', label: 'دسته اصلی', value: itf.get('main'), onChange: (v) => { itf.set({ main: v }); setPage(1); }, options: mains.map((n) => ({ value: n.id, label: n.name })) },
          { key: 'brand', label: 'برند', value: itf.get('brand'), onChange: (v) => { itf.set({ brand: v }); setPage(1); }, options: (brands.data ?? []).map((b) => ({ value: b.id, label: b.name })) },
          { key: 'model', label: 'مدل', value: itf.get('model'), onChange: (v) => { itf.set({ model: v }); setPage(1); }, options: modelOpts },
          { key: 'pattern', label: 'الگوی تنوع', value: itf.get('pattern'), onChange: (v) => { itf.set({ pattern: v }); setPage(1); }, options: ITEM_PATTERN_OPTIONS },
          { key: 'grade', label: 'گرید', value: itf.get('grade'), onChange: (v) => { itf.set({ grade: v }); setPage(1); }, options: GRADE_OPTIONS },
          { key: 'price', label: 'بازه قیمت', value: itf.get('price'), onChange: (v) => { itf.set({ price: v }); setPage(1); }, options: [], range: { unit: 'ریال' } },
        ]} extra={<ColumnPicker {...iprefs} />} />
      )}
      <div className={s.compact} data-pick-items>
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={toggle} isSelected={(r) => inPack.includes(r.id)}
          empty={<Empty title="موردی با این فیلترها پیدا نشد" />} />
      </div>
      {list.data && list.data.total > 0 ? <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} sizes={[10, 25, 50]} /> : null}
    </Card>
  );
}
