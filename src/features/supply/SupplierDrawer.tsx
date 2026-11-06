import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { applyServerErrors } from '@/shared/api/formErrors';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Drawer } from '@/shared/ui/Drawer';
import { FormGrid, Input, Textarea } from '@/shared/ui/form';
import { InfoBanner } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { isPhoneNo, normPhone, PHONE_MSG } from '@/features/customers/phone';
import { useSupplierWrite, type Supplier, type SupplierUpdateIn } from './api';
import s from './supply.module.css';

/**
 * کشوی ثبت/ویرایش تأمین‌کننده (فرم‌ها در کشوی چپ — افشین 2026-10-31). html طرح ندارد؛ فیلدها = SupplierIn بک‌اند.
 * قیدها همان schema و سرویس بک‌اند (LIMITS). کد SP-… را سیستم می‌سازد.
 * در ویرایش فقط فیلدهای تغییرکرده فرستاده می‌شوند (PATCH جزئی).
 */
const FIELDS = ['name', 'national_id', 'economic_code', 'phone', 'contact_name', 'address', 'notes'] as const;
type FieldKey = (typeof FIELDS)[number];

/** قیدهای SupplierIn و SupplierService._validate بک‌اند */
const NAME_MAX = 150;
const PHONE_MAX = 20;
const CONTACT_MAX = 100;
const ADDRESS_MAX = 1000;
const NOTES_MAX = 2000;
const NATIONAL_ID_MIN = 10;
const NATIONAL_ID_MAX = 11;
const ECONOMIC_CODE_MIN = 10;
const ECONOMIC_CODE_MAX = 16;
const LIMITS = {
  name: NAME_MAX, phone: PHONE_MAX, contact: CONTACT_MAX, address: ADDRESS_MAX, notes: NOTES_MAX,
  nationalId: { min: NATIONAL_ID_MIN, max: NATIONAL_ID_MAX }, economicCode: { min: ECONOMIC_CODE_MIN, max: ECONOMIC_CODE_MAX },
} as const;
const DRAWER_WIDTH = 600;

const digits = (v: string) => toLatinDigits(v).trim();
/**
 * فقط رقم لاتین، بدون حرف و نشانه. matches: "0123456789" — rejects: "12a4", "12-34".
 * tester: https://regex101.com/?regex=%5E%5B0-9%5D%2B%24&testString=0123456789
 */
const ONLY_DIGITS = /^[0-9]+$/;
const optDigits = ({ min, max }: { min: number; max: number }, label: string) =>
  z.string().refine((v) => { const d = digits(v); return !d || (ONLY_DIGITS.test(d) && d.length >= min && d.length <= max); },
    `${label} باید فقط رقم و بین ${toFaDigits(min)} تا ${toFaDigits(max)} رقم باشد.`);

const schema = z.object({
  name: z.string().trim().min(1, 'نام تأمین‌کننده الزامی است.').max(LIMITS.name, `نام حداکثر ${toFaDigits(LIMITS.name)} نویسه است.`),
  national_id: optDigits(LIMITS.nationalId, 'شناسه‌ی ملی'),
  economic_code: optDigits(LIMITS.economicCode, 'کد اقتصادی'),
  phone: z.string().refine((v) => !v.trim() || isPhoneNo(v), PHONE_MSG),
  contact_name: z.string().max(LIMITS.contact, `نام رابط حداکثر ${toFaDigits(LIMITS.contact)} نویسه است.`),
  address: z.string().max(LIMITS.address, `نشانی حداکثر ${toFaDigits(LIMITS.address)} نویسه است.`),
  notes: z.string().max(LIMITS.notes, `یادداشت حداکثر ${toFaDigits(LIMITS.notes)} نویسه است.`),
});
type Form = z.infer<typeof schema>;

const toBody = (f: Form): Record<FieldKey, string> => ({
  name: f.name.trim(),
  national_id: digits(f.national_id),
  economic_code: digits(f.economic_code),
  phone: f.phone.trim() ? normPhone(f.phone) : '',
  contact_name: f.contact_name.trim(),
  address: f.address.trim(),
  notes: f.notes.trim(),
});

export function SupplierDrawer({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved?: (x: Supplier) => void }) {
  const w = useSupplierWrite();
  const toast = useToast();
  const [topErr, setTopErr] = useState<string[]>([]);
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema), mode: 'onTouched',
    defaultValues: {
      name: supplier?.name ?? '', national_id: supplier?.national_id ?? '', economic_code: supplier?.economic_code ?? '',
      phone: supplier?.phone ?? '', contact_name: supplier?.contact_name ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '',
    },
  });
  const busy = w.create.isPending || w.update.isPending;

  const submit = handleSubmit(async (f) => {
    setTopErr([]);
    const body = toBody(f);
    try {
      let saved: Supplier;
      if (supplier) {
        const patch: SupplierUpdateIn = {};
        FIELDS.forEach((k) => { if (body[k] !== (supplier[k] ?? '')) patch[k] = body[k]; });
        if (!Object.keys(patch).length) { onClose(); return; }
        saved = await w.update.mutateAsync({ id: supplier.id, body: patch });
        toast(`تأمین‌کننده‌ی «${saved.name}» ویرایش شد.`);
      } else {
        saved = await w.create.mutateAsync(body);
        toast(`تأمین‌کننده‌ی «${saved.name}» با کد ${saved.code} ثبت شد.`);
      }
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setTopErr(applyServerErrors(e, setError, [...FIELDS]));
    }
  });

  return (
    <Drawer open onClose={onClose} busy={busy} width={DRAWER_WIDTH}
      title={supplier ? 'ویرایش تأمین‌کننده' : 'تأمین‌کننده‌ی جدید'}
      sub={supplier ? <>کد <span data-latin>{supplier.code}</span> را سیستم ساخته است و تغییر نمی‌کند.</> : 'کد تأمین‌کننده پس از ثبت خودکار ساخته می‌شود.'}
      footer={<>
        <Button onClick={submit} loading={busy} loadingText="در حال ذخیره…">{supplier ? 'ذخیره‌ی تغییرات' : 'ثبت تأمین‌کننده'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>انصراف</Button>
      </>}>
      <form onSubmit={submit} noValidate>
        {topErr.length ? <div className={s.formErr}><Alert>{topErr.join(' ')}</Alert></div> : null}
        <FormGrid cols={2}>
          <Input label="نام تأمین‌کننده" required span={2} maxLength={LIMITS.name} placeholder="مثال: بازرگانی نوین پوشاک" error={errors.name?.message} {...register('name')} />
          <Input label="شناسه‌ی ملی" latin dir="ltr" inputMode="numeric" maxLength={LIMITS.nationalId.max} hint="۱۰ یا ۱۱ رقم؛ اختیاری" error={errors.national_id?.message} {...register('national_id')} />
          <Input label="کد اقتصادی" latin dir="ltr" inputMode="numeric" maxLength={LIMITS.economicCode.max} hint="۱۰ تا ۱۶ رقم؛ اختیاری" error={errors.economic_code?.message} {...register('economic_code')} />
          <Input label="تلفن" dir="ltr" inputMode="tel" maxLength={LIMITS.phone} placeholder="۰۲۱۸۸۸۸۸۸۸۸" error={errors.phone?.message} {...register('phone')} />
          <Input label="نام رابط" maxLength={LIMITS.contact} placeholder="نام فرد تماس" error={errors.contact_name?.message} {...register('contact_name')} />
          <Textarea label="نشانی" span={2} rows={2} maxLength={LIMITS.address} error={errors.address?.message} {...register('address')} />
          <Textarea label="یادداشت" span={2} rows={3} maxLength={LIMITS.notes} error={errors.notes?.message} {...register('notes')} />
        </FormGrid>
        {!supplier ? <div className={s.formNote}><InfoBanner>شناسه‌ی ملی و کد اقتصادی میان تأمین‌کنندگان تکراری نمی‌شوند. تأمین‌کننده‌ی مسدود یا غیرفعال در سند تازه انتخاب نمی‌شود.</InfoBanner></div> : null}
      </form>
    </Drawer>
  );
}
