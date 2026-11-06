import { useEffect, useRef, useState } from 'react';
import { IconPhotoPlus, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Field, FormGrid, Input, Textarea } from '@/shared/ui/form';
import { Modal, Segmented } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useBrandWrite, type Brand, type BrandIn } from './api';
import { BRAND_ORIGIN } from './labels';
import s from './catalog.module.css';

/** بدون فایل ⇐ JSON؛ با فایل ⇐ multipart با `payload` (JSON) + `logo` (قرارداد _BrandBody بک‌اند) */
function withLogo<T extends object>(body: T, logo: File | null): T | FormData {
  if (!logo) return body;
  const fd = new FormData(); fd.append('payload', JSON.stringify(body)); fd.append('logo', logo); return fd;
}

const ORIGINS = Object.entries(BRAND_ORIGIN).map(([value, label]) => ({ value, label }));
const STATUSES = [{ value: 'ACTIVE', label: 'فعال' }, { value: 'DRAFT', label: 'پیش‌نویس' }];

/**
 * فرم برند (مثل html Fixed): نام، نام لاتین، حوزه‌ی فعالیت (الزامی، BR-CAT-037)، کشور، مبدا، وضعیت، وب‌سایت، توضیحات. غیرفعال‌سازی فقط از جدول.
 * `quick` (افشین 2026-11-04، از تعریف ماتریسی): برند تازه همیشه «فعال» (فقط برند فعال در فرم کالا انتخاب می‌شود) و `onSaved` برند ساخته‌شده را برمی‌گرداند
 * تا فرم صدازننده انتخابش کند؛ بستن، انصراف یا ذخیره فقط مودال را می‌بندد و داده‌های فرم زیرین دست نمی‌خورد.
 */
export function BrandModal({ brand, onClose, onSaved, quick }: { brand: Brand | null; onClose: () => void; onSaved?: (b: Brand) => void; quick?: boolean }) {
  const w = useBrandWrite();
  const toast = useToast();
  const [f, setF] = useState<BrandIn>({
    name: brand?.name ?? '', latin_name: brand?.latin_name ?? '', scope: brand?.scope ?? '', country: brand?.country ?? '',
    origin: (brand?.origin ?? 'DOMESTIC') as BrandIn['origin'], status: (brand?.status ?? 'ACTIVE') as BrandIn['status'],
    website: brand?.website ?? '', description: brand?.description ?? '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [preview, setPreview] = useState<string | null>(brand?.logo ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!logo) return; const u = URL.createObjectURL(logo); setPreview(u); return () => URL.revokeObjectURL(u); }, [logo]);
  const pickLogo = (file: File | null) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setErrs((x) => ({ ...x, logo: 'فقط JPEG، PNG یا WebP.' })); return; }
    if (file.size > 5 * 1024 * 1024) { setErrs((x) => ({ ...x, logo: 'حجم لوگو حداکثر ۵ مگابایت.' })); return; }
    setErrs((x) => ({ ...x, logo: '' })); setLogo(file); setRemoveLogo(false);
  };
  const upd = (k: keyof BrandIn) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrs((x) => (x[k] ? { ...x, [k]: '' } : x)); };
  const busy = w.create.isPending || w.update.isPending;
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'نام برند را وارد کنید.';
    if (!f.scope.trim()) e.scope = 'حوزه‌ی فعالیت برند الزامی است.';
    if (f.website && !/^https?:\/\/\S+$/i.test(f.website.trim())) e.website = 'نشانی وب‌سایت با http:// یا https:// شروع شود.';
    setErrs(e); setErr(null);
    if (Object.keys(e).length) return;
    try {
      if (brand) {
        const body: Record<string, unknown> = {};
        (['name', 'latin_name', 'scope', 'country', 'origin', 'website', 'description'] as const).forEach((k) => { if ((f[k] ?? '') !== (brand[k] ?? '')) body[k] = f[k]; });
        if (f.status !== brand.status) body.status = f.status; // فعال‌سازی دوباره‌ی برند غیرفعال با انتخاب «فعال»؛ غیرفعال‌سازی فقط از جدول
        if (removeLogo && !logo) body.remove_logo = true;
        if (!Object.keys(body).length && !logo) { onClose(); return; }
        await w.update.mutateAsync({ id: brand.id, body: withLogo(body, logo) });
        toast(`برند «${f.name}» ویرایش شد.`);
      } else {
        const made = await w.create.mutateAsync(withLogo(quick ? { ...f, status: 'ACTIVE' as BrandIn['status'] } : f, logo));
        toast(`برند «${f.name}» تعریف شد.`); onSaved?.(made);
      }
      onClose();
    } catch (ex) { setErr(userMessage(ex)); }
  };
  return (
    <Modal open onClose={onClose} title={brand ? 'ویرایش برند' : 'تعریف برند جدید'} width={640}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={busy}>{brand ? 'ذخیره‌ی تغییرات' : 'ثبت برند'}</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <Input label="نام برند" required value={f.name} onChange={upd('name')} error={errs.name} placeholder="مثال: لمیس" maxLength={100} />
        <Input label="نام لاتین" latin value={f.latin_name ?? ''} onChange={upd('latin_name')} placeholder="Lamis" dir="ltr" maxLength={100} />
        <Input label="حوزه‌ی فعالیت" required value={f.scope} onChange={upd('scope')} error={errs.scope} placeholder="مثال: لباس زیر و راحتی" maxLength={50} hint="در فیلتر و کارت برند نمایش داده می‌شود" />
        <Input label="کشور سازنده" value={f.country ?? ''} onChange={upd('country')} placeholder="مثال: ایران" maxLength={50} />
        <div className={s.segRow}><span className={s.segLabel}>مبدا</span><Segmented value={f.origin as string} onChange={(v) => setF((x) => ({ ...x, origin: v as BrandIn['origin'] }))} options={ORIGINS} /></div>
        {quick ? <div className={s.segRow}><span className={s.segLabel}>وضعیت</span><span className={s.sub}>فعال (برند تازه همین حالا در فرم کالا قابل انتخاب است)</span></div> : <div className={s.segRow}>
          <span className={s.segLabel}>وضعیت</span>
          <Segmented value={f.status as string} onChange={(v) => setF((x) => ({ ...x, status: v as BrandIn['status'] }))}
            options={brand?.status === 'INACTIVE' ? [...STATUSES, { value: 'INACTIVE', label: 'غیرفعال (فعلی)' }] : STATUSES} />
          {brand?.status === 'INACTIVE' ? <span className={s.sub}>برای فعال‌سازی دوباره «فعال» یا «پیش‌نویس» را انتخاب و ذخیره کنید.</span> : null}
        </div>}
        <Input label="وب‌سایت" latin value={f.website ?? ''} onChange={upd('website')} error={errs.website} placeholder="https://" dir="ltr" maxLength={200} />
        <div />
        <Textarea label="توضیحات" span={2} rows={3} value={f.description ?? ''} onChange={upd('description')} />
        <Field label="لوگو (اختیاری)" span={2} error={errs.logo} hint="JPEG، PNG یا WebP تا ۵ مگابایت؛ روی زمینه‌ی روشن نمایش داده می‌شود. لوگوی ثبت‌شده با انتخاب فایل تازه جایگزین یا با «حذف لوگو» پاک می‌شود.">
          <div className={s.logoRow}>
            {preview ? <img className={s.logoPreview} src={preview} alt="" /> : <span className={s.logoEmpty} aria-hidden><IconPhotoPlus size={20} /></span>}
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>{preview ? 'تغییر لوگو' : 'انتخاب لوگو'}</Button>
            {logo ? <Button type="button" variant="ghost" size="sm" icon={<IconX size={14} />} onClick={() => { setLogo(null); setPreview(brand?.logo ?? null); if (fileRef.current) fileRef.current.value = ''; }}>لغو انتخاب</Button> : null}
            {brand?.logo && !logo && !removeLogo ? <Button type="button" variant="ghost" size="sm" icon={<IconX size={14} />} onClick={() => { setRemoveLogo(true); setPreview(null); }}>حذف لوگو</Button> : null}
            {removeLogo ? <Button type="button" variant="ghost" size="sm" onClick={() => { setRemoveLogo(false); setPreview(brand?.logo ?? null); }}>بازگرداندن لوگو</Button> : null}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickLogo(e.target.files?.[0] ?? null)} aria-label="فایل لوگو" />
          </div>
        </Field>
      </FormGrid>
    </Modal>
  );
}
