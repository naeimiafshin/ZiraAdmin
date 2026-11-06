import { useEffect, useState } from 'react';
import { IconArchive, IconPencil, IconRestore } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Field, FormGrid, Input, Select } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { usePriceWrite } from '@/features/pricing/api';
import { useItem, useItemMutations, usePriceDetail } from './api';
import { ConfirmModal, Swatch } from './components';
import { FamilyModal } from './FamilyModal';
import s from './catalog.module.css';
import { groupMoney } from '@/shared/lib/money';

/**
 * «ویرایش کالا» (کالای تکی، kind=GOOD) — تصمیم افشین 2026-10-23: فقط فیلدهایی که بک‌اند واقعاً تغییر می‌دهد.
 *  - قابل ویرایش: کد برند (PATCH /catalog/items/{id})، بارکد فقط در وضعیت پیش‌نویس (PATCH …/barcode؛ خالی = تولید خودکار)،
 *    وضعیت (activate / hide)، قیمت فروش (PUT /pricing/prices/{id}، مجوز pricing.prices.update).
 *  - قفل (خاموش): کد کالا، شناسه (SKU)، سایز و رنگ (هویت کالا در ماتریس؛ بک‌اند تغییرشان را ندارد)، نام (از قاعده‌ی نام‌گذاری خانواده)،
 *    برند/دسته/طرح/جنس (مال خانواده ⇐ «ویرایش خانواده»)، انبار، قیمت خرید، موجودی و حاشیه (ماژول‌های انبار و خرید — به‌زودی).
 *  - «آرشیو کالا» / «بازگردانی» در پایین مودال (مثل html).
 */
type St = 'ACTIVE' | 'HIDDEN' | 'DRAFT';
const digits = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');

export function GoodEditModal({ id, onClose }: { id: string; onClose: () => void }) {
  const can = usePerm(); const toast = useToast();
  const q = useItem(id); const g = q.data;
  const canPrice = can('pricing.prices.read'); const canPriceEdit = can('pricing.prices.update');
  const price = usePriceDetail(id, canPrice);
  const m = useItemMutations(); const pw = usePriceWrite();
  const [baseCode, setBaseCode] = useState(''); const [barcode, setBarcode] = useState(''); const [status, setStatus] = useState<St>('ACTIVE'); const [sale, setSale] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [fam, setFam] = useState(false); const [arch, setArch] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!g || ready || (canPrice && price.isLoading)) return;
    setBaseCode(g.base_code ?? ''); setBarcode(g.barcode ?? ''); setStatus((g.status === 'ARCHIVED' ? 'HIDDEN' : g.status) as St);
    setSale(price.data?.sale_price ? String(Math.round(Number(price.data.sale_price))) : ''); setReady(true);
  }, [g, price.data, price.isLoading, canPrice, ready]);
  if (!g || !ready) return <Modal open onClose={onClose} title="ویرایش کالا" width={880}><span className={s.muted}>{q.error ? userMessage(q.error) : 'در حال بارگذاری…'}</span></Modal>;
  const archived = g.status === 'ARCHIVED'; const canEdit = can('catalog.items.update') && !archived;
  const isDraft = g.status === 'DRAFT';
  const oldSale = price.data?.sale_price ? String(Math.round(Number(price.data.sale_price))) : '';
  const size = g.sizes[0]; const color = g.colors[0];
  const save = async () => {
    setErr(null);
    if (sale && Number(sale) <= 0) { setErr('قیمت فروش باید بیشتر از صفر باشد.'); return; }
    if (isDraft && barcode.trim() && !/^\d{8,14}$/.test(toLatinDigits(barcode.trim()))) { setErr('بارکد باید ۸ تا ۱۴ رقم باشد (خالی = تولید خودکار).'); return; }
    setBusy(true);
    try {
      let changed = 0;
      if (baseCode.trim() !== (g.base_code ?? '')) { await m.update.mutateAsync({ id, body: { base_code: baseCode.trim() } as never }); changed++; }
      if (isDraft && toLatinDigits(barcode.trim()) !== (g.barcode ?? '')) { await adminApi(`/catalog/items/${id}/barcode`, { method: 'PATCH', body: { value: toLatinDigits(barcode.trim()) || null } }); changed++; }
      if (canPriceEdit && sale && sale !== oldSale) { await pw.one.mutateAsync({ id, body: { sale_price: sale } }); changed++; }
      if (status !== g.status) {
        const ensureBarcode = async () => { if (!g.barcode && !(isDraft && barcode.trim())) await adminApi(`/catalog/items/${id}/barcode`, { method: 'PATCH', body: { value: null } }); };
        if (status === 'ACTIVE') { if (isDraft) await ensureBarcode(); await m.activate.mutateAsync(id); }
        else if (status === 'HIDDEN') { if (isDraft) { await ensureBarcode(); await m.activate.mutateAsync(id); } await m.hide.mutateAsync(id); }
        changed++;
      }
      await q.refetch();
      toast(changed ? 'تغییرات کالا ذخیره شد.' : 'تغییری برای ذخیره نبود.');
      onClose();
    } catch (e) { setErr(userMessage(e)); await q.refetch(); } finally { setBusy(false); }
  };
  const statusOpts = [{ value: 'ACTIVE', label: 'فعال' }, { value: 'HIDDEN', label: 'عدم نمایش' }, ...(isDraft ? [{ value: 'DRAFT', label: 'پیش‌نویس' }] : [])];
  const RO = ({ label, children, soon }: { label: string; children: React.ReactNode; soon?: boolean }) => (
    <Field label={`${label} (غیرقابل ویرایش)`}><div className={`${s.readBox} ${s.locked}`} data-tip={soon ? 'به‌زودی (ماژول انبار/خرید)' : ''}>{children}</div></Field>
  );
  return (
    <>
      <Modal open onClose={onClose} title={<span>ویرایش کالا<span className={s.sub} style={{ display: 'block', fontWeight: 500 }}>{g.display_name}</span></span>} width={880}
        footer={<div className={s.modalFootSplit}>
          {archived ? (can('catalog.items.update') ? <Button variant="secondary" icon={<IconRestore size={16} />} onClick={async () => { try { await m.restore.mutateAsync(id); await q.refetch(); toast('کالا بازگردانی شد.'); } catch (e) { setErr(userMessage(e)); } }}>بازگردانی کالا</Button> : <span />)
            : can('catalog.items.delete') ? <Button variant="secondary" className={s.dangerOutline} icon={<IconArchive size={16} />} onClick={() => setArch(true)}>آرشیو کالا</Button> : <span />}
          <span className={s.rowActions}><Button variant="secondary" onClick={onClose}>انصراف</Button>{canEdit ? <Button onClick={save} loading={busy}>ذخیره تغییرات</Button> : null}</span>
        </div>}>
        {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
        {archived ? <p className={s.warnText} style={{ marginTop: 0 }}>این کالا آرشیو شده است؛ برای ویرایش ابتدا آن را بازگردانی کنید.</p> : null}
        <div className={s.boxRow} style={{ marginBottom: 16 }}>
          <div className={s.box}><span>کد کالا</span><b data-latin>{g.code}</b></div>
          <div className={`${s.box} ${s.boxBrand}`}><span>شناسه کالا (منحصر به فرد)</span><b data-latin>{g.sku}</b></div>
          <div className={s.box}><span>بارکد (منحصر به فرد){isDraft ? '' : ' — فقط در پیش‌نویس قابل تغییر'}</span><b data-latin>{g.barcode || '—'}</b></div>
        </div>
        <FormGrid cols={2}>
          <Field label="سایز (غیرقابل ویرایش)"><div className={`${s.readBox} ${s.locked}`}><span className={s.sizeChip} data-latin>{size?.code ?? '—'}</span>{size?.name && size.name !== size.code ? <span className={s.muted} style={{ marginInlineStart: 8 }}>{size.name}</span> : null}</div></Field>
          <Field label="رنگ (غیرقابل ویرایش)"><div className={`${s.readBox} ${s.locked}`}><span className={s.swRow} style={{ gap: 6 }}>{color ? <Swatch hex={color.hex_code} big /> : null}{color?.name ?? '—'}</span></div></Field>
          <Input label="کد برند" latin dir="ltr" value={baseCode} onChange={(e) => setBaseCode(e.target.value)} maxLength={50} disabled={!canEdit} hint="کد کالا نزد برند (کارخانه)" />
          {isDraft ? <Input label="بارکد" latin dir="ltr" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(toLatinDigits(e.target.value).replace(/[^0-9]/g, ''))} maxLength={14} disabled={!canEdit} hint="خالی = تولید خودکار هنگام فعال‌سازی" /> : null}
          <Input label="قیمت فروش (ریال)" dir="ltr" inputMode="numeric" value={groupMoney(sale)} onChange={(e) => setSale(digits(e.target.value))} placeholder="۰" disabled={!canEdit || !canPriceEdit}
            hint={!canPriceEdit ? 'مجوز ویرایش قیمت را ندارید' : sale ? `${faNum(sale)} ریال${oldSale && sale !== oldSale ? ` (قبلی ${faNum(oldSale)})` : ''}` : 'قیمت ثبت نشده'} />
          <Select label="وضعیت" value={status} onChange={(e) => setStatus(e.target.value as St)} disabled={!canEdit} options={statusOpts} hint={status === 'ACTIVE' && isDraft ? 'برای فعال‌سازی، بارکد (در صورت نبود) خودکار ساخته می‌شود' : status === 'HIDDEN' ? 'در ساخت آیتم تازه نمایش داده نمی‌شود و در هیچ آیتم تازه‌ای به کار نمی‌رود (C-30)' : undefined} />
        </FormGrid>
        <div className={s.sampleName} style={{ margin: '16px 0' }}><div className={s.segLabel}>نام کالا (از قاعده‌ی نام‌گذاری خانواده)</div>{g.display_name}</div>
        <FormGrid cols={4}>
          <RO label="انبار" soon>—</RO>
          <RO label="قیمت خرید" soon>—</RO>
          <RO label="موجودی" soon>—</RO>
          <RO label="حاشیه سود" soon>—</RO>
        </FormGrid>
        <div className={s.famStrip}>
          <span>خانواده: <b>{g.product_name}</b> <span className={s.muted} data-latin>{g.product_code}</span> · {g.brand_name}{g.model_line_name ? ` · ${g.model_line_name}` : ''}{g.material_name ? ` · ${g.material_name}` : ''}</span>
          {can('catalog.products.read') ? <Button size="sm" variant="secondary" icon={<IconPencil size={15} />} onClick={() => setFam(true)}>ویرایش خانواده</Button> : null}
        </div>
        <p className={s.sub} style={{ marginTop: 8 }}>سایز و رنگ هویت کالا در ماتریس خانواده‌اند و تغییر نمی‌کنند؛ برند، دسته، طرح و جنس از «ویرایش خانواده» تغییر می‌کنند. انبار، قیمت خرید و موجودی از ماژول‌های انبار و خرید می‌آیند.</p>
      </Modal>
      {fam ? <FamilyModal productId={g.product_id} onClose={() => { setFam(false); void q.refetch(); }} /> : null}
      {arch ? <ConfirmModal title="آرشیو کالا" confirmLabel="آرشیو کن" danger onClose={() => setArch(false)} text={<>کالای <b>{g.display_name}</b> آرشیو می‌شود. اگر موجودی یا سفارش باز داشته باشد، آرشیو رد می‌شود.</>}
        onConfirm={async () => { await m.archive.mutateAsync(id); await q.refetch(); toast('کالا آرشیو شد.'); onClose(); }} /> : null}
    </>
  );
}
