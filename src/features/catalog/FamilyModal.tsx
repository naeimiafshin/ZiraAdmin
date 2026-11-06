import { useEffect, useMemo, useState } from 'react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Field, FormGrid, Input, Select } from '@/shared/ui/form';
import { Badge, Modal, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { fetchAll } from '@/features/users/api';
import { setPricesBulk, useAllBrands, useAllColors, useAllSizes, useAttributesByRole, useCategoryTree, useProduct, useProductWrite, type CategoryNode, type ItemRow } from './api';
import { AttributeFields, listToRows, rowsToList, type AttrRows } from './attributeFields';
import { ConfirmModal, Swatch } from './components';
import { NAME_PART_LABELS, NAME_PART_ORDER, PRODUCT_STATUS } from './labels';
import s from './catalog.module.css';
import { groupMoney } from '@/shared/lib/money';

/**
 * مودال «ویرایش خانواده» مطابق html Fixed V2 (editFam): دسته‌ی اصلی/میانی/فرعی، برند، جنس پارچه، طرح/مدل، چیپ سایزها و رنگ‌ها
 * (افزودن سایز/رنگ = ساخت سلول‌های تازه با PATCH /cells؛ سایز/رنگ موجود حذف‌شدنی نیست)، «N سایز × M رنگ = K کالا»، قیمت خرید (به‌زودی)،
 * قیمت فروش همه‌ی کالاها (PUT /pricing/prices/bulk)، آرشیو. قواعد بک‌اند: دسته/برند/جنس/مدل فقط تا وقتی همه‌چیز پیش‌نویس است (۴۰۹).
 * افزوده بر html (الزام بک‌اند/تصمیم‌ها): کد برند، نام دستی، اجزای نام؛ فعال‌سازی/بازگردانی/حذف.
 */
export function FamilyModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const can = usePerm();
  const toast = useToast();
  const q = useProduct(productId);
  const w = useProductWrite();
  const tree = useCategoryTree(false);
  const brands = useAllBrands();
  const sizes = useAllSizes(); const colors = useAllColors();
  const attrs = useAttributesByRole('COMMON');
  const byId = useMemo(() => { const m = new Map<string, CategoryNode>(); const walk = (ns: CategoryNode[]) => ns.forEach((n) => { m.set(n.id, n); walk(n.children ?? []); }); walk(tree.data ?? []); return m; }, [tree.data]);
  const p = q.data;
  const [main, setMain] = useState(''); const [mid, setMid] = useState(''); const [sub, setSub] = useState('');
  const [brandId, setBrandId] = useState('');
  const [rows, setRows] = useState<AttrRows>({});
  const [sizeIds, setSizeIds] = useState<string[]>([]); const [colorIds, setColorIds] = useState<string[]>([]);
  const [sale, setSale] = useState('');
  const [name, setName] = useState(''); const [parts, setParts] = useState<string[]>([]); const [baseCode, setBaseCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'activate' | 'restore' | 'delete' | null>(null);
  const [loadedFor, setLoadedFor] = useState('');
  useEffect(() => {
    if (!p || !tree.data || loadedFor === p.id) return;
    setLoadedFor(p.id);
    const c = byId.get(p.category_id); const m2 = c?.parent_id ? byId.get(c.parent_id) : undefined;
    setSub(p.category_id); setMid(m2?.id ?? ''); setMain(m2?.parent_id ?? '');
    setBrandId(p.brand_id); setRows(listToRows(p.attribute_values)); setSizeIds(p.sizes.map((x) => x.id)); setColorIds(p.colors.map((x) => x.id));
    setName(p.name); setParts(p.name_parts as string[]); setBaseCode(p.base_code);
  }, [p, tree.data, byId, loadedFor]);
  if (!p) return <Modal open onClose={onClose} title="ویرایش خانواده کالا" width={820}>{q.error ? <Alert>{userMessage(q.error)}</Alert> : <SkeletonRows rows={4} height={50} />}</Modal>;
  const canEdit = can('catalog.products.update') && p.status !== 'ARCHIVED';
  // C-29 (افشین 2026-10-25): دسته، برند، جنس و مدل در هر وضعیت قابل تغییرند تا وقتی خانواده «استفاده نشده»؛ وگرنه بک‌اند ۴۰۹ با دلیل‌ها
  const locked = false;
  const existingS = new Set(p.sizes.map((x) => x.id)); const existingC = new Set(p.colors.map((x) => x.id));
  const mains = tree.data ?? []; const mids = byId.get(main)?.children ?? []; const subs = byId.get(mid)?.children ?? [];
  const newS = sizeIds.filter((x) => !existingS.has(x)); const newC = colorIds.filter((x) => !existingC.has(x));
  const newCells = [...newS.flatMap((sz) => colorIds.map((cl) => ({ size_id: sz, color_id: cl }))), ...newC.flatMap((cl) => sizeIds.filter((sz) => !newS.includes(sz)).map((sz) => ({ size_id: sz, color_id: cl })))];
  const toggle = (list: string[], set: (v: string[]) => void, id: string, fixed: boolean) => { if (fixed) return; set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]); };
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (sub && sub !== p.category_id) body.category_id = sub;
      if (brandId && brandId !== p.brand_id) body.brand_id = brandId;
      if (name.trim() && name.trim() !== p.name) body.name = name.trim();
      if (baseCode.trim() !== p.base_code) body.base_code = baseCode.trim();
      if (parts.join() !== p.name_parts.join()) body.name_parts = parts;
      if (Object.keys(body).length) await w.update.mutateAsync({ id: p.id, body });
      const list = rowsToList(rows);
      if (JSON.stringify(list) !== JSON.stringify(rowsToList(listToRows(p.attribute_values)))) await w.setAttributes.mutateAsync({ id: p.id, values: list });
      if (newCells.length) await w.addCells.mutateAsync({ id: p.id, cells: newCells.map((c) => ({ ...c, base_code: '', display_name: null })) });
      const price = toLatinDigits(sale).replace(/[^0-9]/g, '');
      if (price) {
        const goods = await fetchAll<ItemRow>('/catalog/items', { product_id: p.id, kind: 'GOOD' });
        for (let i = 0; i < goods.length; i += 200) await setPricesBulk(goods.slice(i, i + 200).map((g) => ({ item_id: g.id, sale_price: price })));
      }
      toast(`خانواده کالا «${name.trim() || p.name}» ویرایش شد.${newCells.length ? ` ${faNum(newCells.length)} کالای تازه ساخته شد.` : ''}`);
      onClose();
    } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  const act = async (kind: NonNullable<typeof confirm>) => {
    const m = { archive: w.archive, activate: w.activate, restore: w.restore, delete: w.remove }[kind];
    await m.mutateAsync(p.id);
    toast({ archive: 'خانواده آرشیو شد.', activate: 'خانواده فعال شد.', restore: 'خانواده بازگردانده شد.', delete: 'خانواده حذف شد.' }[kind]);
    onClose();
  };
  const st = PRODUCT_STATUS[p.status];
  return (
    <Modal open onClose={onClose} title={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>ویرایش خانواده کالا <span className={s.muted} data-latin>{p.code}</span><Badge tone={st?.tone ?? 'neutral'}>{st?.label}</Badge></span>} width={820}
      footer={<div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {can('catalog.products.delete') && p.status !== 'ARCHIVED' ? <Button variant="danger" onClick={() => setConfirm('archive')}>آرشیو</Button> : null}
          {can('catalog.products.delete') ? <Button variant="ghost" onClick={() => setConfirm('delete')}>حذف</Button> : null}
          {can('catalog.products.update') && p.status === 'DRAFT' ? <Button variant="secondary" onClick={() => setConfirm('activate')}>فعال‌سازی خانواده</Button> : null}
          {can('catalog.products.update') && p.status === 'ARCHIVED' ? <Button variant="secondary" onClick={() => setConfirm('restore')}>بازگردانی</Button> : null}
        </span>
        <span style={{ display: 'inline-flex', gap: 8 }}><Button variant="secondary" onClick={onClose}>انصراف</Button>{canEdit ? <Button onClick={save} loading={busy}>ذخیره تغییرات</Button> : null}</span>
      </div>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      {p.status !== 'ARCHIVED' ? <p className={s.intro}>دسته، برند، جنس و مدل تا وقتی خانواده استفاده نشده (موجودی، رزرو، سند باز انبار، سبد فعال یا باندل) قابل تغییرند؛ در غیر این صورت هنگام ذخیره دلیلش نمایش داده می‌شود.</p> : null}
      <FormGrid cols={4}>
        <Select label="دسته اصلی" value={main} disabled={locked} onChange={(e) => { setMain(e.target.value); setMid(''); setSub(''); }} placeholder="انتخاب کنید" options={mains.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="دسته میانی" value={mid} disabled={locked || !main} onChange={(e) => { setMid(e.target.value); setSub(''); }} placeholder="انتخاب کنید" options={mids.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="دسته فرعی" value={sub} disabled={locked || !mid} onChange={(e) => setSub(e.target.value)} placeholder="انتخاب کنید" options={subs.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="برند" value={brandId} disabled={locked} onChange={(e) => setBrandId(e.target.value)} placeholder="انتخاب کنید" options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
      </FormGrid>
      <div style={{ marginTop: 12 }}>{attrs.data ? <AttributeFields attrs={attrs.data} rows={rows} onChange={setRows} cols={4} isLocked={(a) => !canEdit || (locked && !!a.system_key)} /> : <SkeletonRows rows={1} height={42} />}</div>
      <div className={s.stack} style={{ marginTop: 16 }}>
        <div>
          <div className={s.dimHead}><span>سایزها</span></div>
          <div className={s.pickGrid}>{(sizes.data ?? []).map((sz) => { const on = sizeIds.includes(sz.id); const fixed = existingS.has(sz.id); return <button key={sz.id} type="button" className={`${s.pick} ${on ? s.pickOn : ''}`} aria-pressed={on} disabled={fixed || !canEdit} data-tip={fixed ? 'در ماتریس هست (حذف‌شدنی نیست)' : sz.name} onClick={() => toggle(sizeIds, setSizeIds, sz.id, fixed)}><span data-latin>{sz.code}</span></button>; })}</div>
        </div>
        <div>
          <div className={s.dimHead}><span>رنگ‌ها</span></div>
          <div className={s.pickGrid}>{(colors.data ?? []).map((cl) => { const on = colorIds.includes(cl.id); const fixed = existingC.has(cl.id); return <button key={cl.id} type="button" className={`${s.pick} ${on ? s.pickOn : ''}`} aria-pressed={on} disabled={fixed || !canEdit} data-tip={fixed ? 'در ماتریس هست (حذف‌شدنی نیست)' : ''} onClick={() => toggle(colorIds, setColorIds, cl.id, fixed)}><Swatch hex={cl.hex_code} />{cl.name}</button>; })}</div>
        </div>
      </div>
      <div className={s.catPath} style={{ margin: '12px 0' }}>
        <b className="tnum">{faNum(sizeIds.length)} سایز × {faNum(colorIds.length)} رنگ = {faNum(sizeIds.length * colorIds.length)} کالا</b>
        <span className={s.muted}> — فعلاً {faNum(p.good_count)} کالا و {faNum(p.item_count)} آیتم</span>
        {newCells.length ? <span className={s.muted}>؛ با ذخیره {faNum(newCells.length)} کالای تازه (پیش‌نویس، گرید ۱) ساخته می‌شود.</span> : null}
      </div>
      <FormGrid cols={4}>
        <Input label="قیمت خرید (ریال)" value="" readOnly placeholder="به‌زودی (ماژول خرید)" />
        {can('pricing.prices.update') ? <Input label="قیمت فروش همه‌ی کالاها (ریال)" inputMode="numeric" value={groupMoney(sale)} onChange={(e) => setSale(toLatinDigits(e.target.value).replace(/[^0-9]/g, ''))} placeholder="خالی ⇐ بدون تغییر" hint="روی همه‌ی کالاهای تکی این خانواده ثبت می‌شود" /> : <Input label="قیمت فروش (ریال)" value="" readOnly placeholder="—" hint="مجوز ثبت قیمت ندارید" />}
        <Input label="کد برند" latin value={baseCode} onChange={(e) => setBaseCode(e.target.value)} dir="ltr" maxLength={50} />
        <Input label="نام خانواده" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} hint="با تغییر دسته/برند/جنس/مدل بازنویسی می‌شود" />
        <Field label="اجزای نام (ترتیب ثابت)" span={4}>
          <div className={s.nameParts}>{NAME_PART_ORDER.map((pp) => { const on = parts.includes(pp); return <button key={pp} type="button" className={`${s.pick} ${on ? s.pickOn : ''}`} aria-pressed={on} data-tip="" onClick={() => setParts(NAME_PART_ORDER.filter((q2) => (q2 === pp ? !on : parts.includes(q2))))}>{NAME_PART_LABELS[pp]}</button>; })}</div>
        </Field>
      </FormGrid>
      {confirm === 'archive' ? <ConfirmModal title="آرشیو خانواده" confirmLabel="آرشیو کن" danger onClose={() => setConfirm(null)} onConfirm={() => act('archive')} text={<>خانواده‌ی <b>{p.name}</b> و همه‌ی کالاهایش آرشیو می‌شوند. اگر کالایی موجودی داشته باشد، آرشیو رد می‌شود.</>} /> : null}
      {confirm === 'activate' ? <ConfirmModal title="فعال‌سازی خانواده" confirmLabel="فعال کن" onClose={() => setConfirm(null)} onConfirm={() => act('activate')} text={<>خانواده‌ی <b>{p.name}</b> فعال می‌شود. شرط بک‌اند: دست‌کم یک کالای فعال (کالا با بارکد فعال می‌شود).</>} /> : null}
      {confirm === 'restore' ? <ConfirmModal title="بازگردانی خانواده" confirmLabel="بازگردان" onClose={() => setConfirm(null)} onConfirm={() => act('restore')} text={<>خانواده‌ی <b>{p.name}</b> از آرشیو خارج می‌شود.</>} /> : null}
      {confirm === 'delete' ? <ConfirmModal title="حذف خانواده" confirmLabel="حذف کن" danger onClose={() => setConfirm(null)} onConfirm={() => act('delete')} text={<>خانواده‌ی <b>{p.name}</b> با همه‌ی کالاها و آیتم‌هایش برای همیشه حذف می‌شود. اگر چیزی از آن استفاده شده باشد (موجودی، رزرو، سند باز انبار، سبد فعال یا باندل)، حذف رد می‌شود و باید آرشیوش کنید.</>} /> : null}
    </Modal>
  );
}
