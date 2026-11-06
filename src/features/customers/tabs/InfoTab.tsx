import { useEffect, useState } from 'react';
import type { IranProvince } from '@/shared/data/iranDivisions';
import { useForm } from 'react-hook-form';
import { IconArchive, IconEdit, IconLockOpen, IconLock, IconMapPin, IconPlus, IconTrash } from '@tabler/icons-react';
import { applyServerErrors } from '@/shared/api/formErrors';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { clean, isNationalId } from '@/shared/lib/validate';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select, Textarea, Toggle } from '@/shared/ui/form';
import { Badge, Card, ErrorBox, InfoBanner, KeyValue, Modal, Pagination, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import {
  useAddressWrite, useArchiveCustomer, useBlacklist, useChangeStatus, useCustomerImageAccess, useCustomerTier, useLicenseGate, useSetImageAccess, useSetTier, useCustomerAddresses, useUpdateCustomer, useUpdateCustomerIdentity,
  type CustomerAddress, type CustomerAddressIn, type CustomerDetail, type CustomerUpdate,
} from '../api';
import { ReasonModal, SourceTag, TierText } from '../components';
import { isMobileNo, MOBILE_MSG, normPhone, optMobile, optPhone } from '../phone';
import { COOPERATION, CUSTOMER_STATUS, CUSTOMER_TYPE, GENDER, IMAGE_LEVEL, LICENSE_INQUIRY, PAYMENT_METHOD } from '../labels';
import s from '../customers.module.css';

const GENDER_OPTIONS = [{ value: 'MALE', label: 'مرد' }, { value: 'FEMALE', label: 'زن' }, { value: 'OTHER', label: 'سایر' }];
const kv = (label: string, v: React.ReactNode, ltr = false) => <KeyValue label={label} ltr={ltr}>{v}</KeyValue>;

export function InfoTab({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  return (
    <div className={s.grid2}>
      <div className={s.stack}>
        <IdentityCard c={c} />
        <StoreCard c={c} />
        {can('customers.profiles.addresses.read') ? <AddressesCard c={c} /> : null}
        {can('customers.profiles.documents.update') ? <LicenseGateCard c={c} /> : null}
      </div>
      <div className={s.stack}>
        {can('customers.profiles.status.update') || can('customers.profiles.delete') ? <StatusCard c={c} /> : <StatusReadonly c={c} />}
        {can('customers.profiles.tier.read') ? <TierCard c={c} /> : null}
        {can('customers.profiles.images.read') ? <ImageLevelCard c={c} /> : null}
      </div>
    </div>
  );
}

/**
 * اطلاعات هویتی (identity) + ویرایش در پنل ادمین (افشین 2026-10-21: «همه‌ی اطلاعات مشتری در ادمین قابل ویرایش باشد»).
 * نام، نام خانوادگی، کد ملی، موبایل ورود و جنسیت ⇐ PUT /auth/users/{user_id} (مجوز identity.users.update؛ جنسیت در identity.UserIdentity).
 * موبایل ورود (G-13b، پرهام 2026-10-22): `phone_number`؛ `change_reason` اختیاری (فقط برای ممیزی)؛ تغییر واقعی همه‌ی نشست‌های مشتری را می‌بندد.
 */
function IdentityCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const [edit, setEdit] = useState(false);
  const i = c.identity;
  const userId = c.user_id;
  const allowed = can('identity.users.update');
  return (
    <Card>
      <SectionTitle extra={allowed ? (
        <span data-tip={userId ? undefined : 'سرور شناسه‌ی کاربر مشتری (user_id) را نفرستاد؛ بک‌اند را به‌روز و دوباره اجرا کنید.'}>
          <Button variant="secondary" size="sm" icon={<IconEdit size={15} />} disabled={!userId} onClick={() => setEdit(true)}>ویرایش</Button>
        </span>
      ) : null}>اطلاعات هویتی</SectionTitle>
      <div className={s.kvGrid3}>
        {kv('نام', i.first_name)}{kv('نام خانوادگی', i.last_name)}{kv('جنسیت', i.gender_display ?? (i.gender ? GENDER[i.gender] ?? i.gender : null))}
        {kv('کد ملی', i.national_id)}{kv('موبایل ورود', i.mobile)}{kv('ایمیل', i.email ? <span data-latin>{i.email}</span> : null, true)}
        {kv('کد مشتری', c.code, true)}
      </div>
      {edit && userId ? <EditIdentityModal c={c} userId={userId} onClose={() => setEdit(false)} /> : null}
    </Card>
  );
}

type IdentityForm = { first_name: string; last_name: string; national_id: string; gender: string; email: string; phone_number: string; change_reason: string };
function EditIdentityModal({ c, userId, onClose }: { c: CustomerDetail; userId: string; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateCustomerIdentity(c.id, userId);
  const [err, setErr] = useState<string | null>(null);
  const i = c.identity;
  const { register, handleSubmit, setError, watch, formState: { errors, dirtyFields } } = useForm<IdentityForm>({
    defaultValues: { first_name: i.first_name ?? '', last_name: i.last_name ?? '', national_id: i.national_id ?? '', gender: ({ مرد: 'MALE', زن: 'FEMALE' } as Record<string, string>)[i.gender ?? ''] ?? i.gender ?? '', email: i.email ?? '', phone_number: i.mobile ?? '', change_reason: '' },
  });
  const phoneChanged = normPhone(watch('phone_number') ?? '') !== (i.mobile ?? '');
  const nidChanged = clean(watch('national_id') ?? '') !== (i.national_id ?? '');
  const e = (k: keyof IdentityForm) => errors[k]?.message as string | undefined;
  const submit = handleSubmit(async (v) => {
    const body: Record<string, string | null> = {};
    // ایمیل خالی ⇐ null (ایمیل در identity یکتاست؛ رشته‌ی خالی تکراری می‌شود)؛ جنسیت خالی ⇐ null (تعیین‌نشده)
    (Object.keys(dirtyFields) as (keyof IdentityForm)[]).forEach((k) => {
      if (k === 'change_reason') return;
      if (k === 'phone_number' && !phoneChanged) return;
      body[k] = k === 'email' ? (v.email.trim() || null) : k === 'gender' ? (v.gender || null) : k === 'phone_number' ? normPhone(v[k]) : clean(v[k]);
    });
    if (!Object.keys(body).length) { setErr('تغییری برای ذخیره وجود ندارد.'); return; }
    if ((phoneChanged || nidChanged) && v.change_reason.trim()) body.change_reason = v.change_reason.trim();
    try { await update.mutateAsync(body); toast('اطلاعات هویتی مشتری ذخیره شد.'); onClose(); }
    catch (ex) { const rest = applyServerErrors(ex, setError, Object.keys(v)); setErr(rest.join(' ') || userMessage(ex)); }
  });
  return (
    <Modal open onClose={onClose} title="ویرایش اطلاعات هویتی" width={640}
      footer={<><Button onClick={() => submit()} loading={update.isPending} loadingText="در حال ذخیره…">ذخیره‌ی تغییرات</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <Input label="نام" required {...register('first_name', { required: 'نام الزامی است.' })} error={e('first_name')} />
        <Input label="نام خانوادگی" required {...register('last_name', { required: 'نام خانوادگی الزامی است.' })} error={e('last_name')} />
        <Input label="کد ملی" required {...register('national_id', { required: 'کد ملی الزامی است.', validate: (x) => isNationalId(clean(x)) || 'کد ملی معتبر نیست.' })} error={e('national_id')} dir="ltr" inputMode="numeric" maxLength={10} />
        <Select label="جنسیت" {...register('gender')} placeholder="تعیین‌نشده" options={GENDER_OPTIONS} />
        <Input label="ایمیل" latin {...register('email', { validate: (x) => !x.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x.trim()) || 'ایمیل معتبر نیست.' })} error={e('email')} dir="ltr" inputMode="email" placeholder="name@example.com" />
        <Input label="موبایل ورود" required dir="ltr" inputMode="numeric" maxLength={11} placeholder="09xxxxxxxxx"
          {...register('phone_number', { validate: (x) => isMobileNo(x) || MOBILE_MSG })} error={e('phone_number')}
          hint="فقط ادمین می‌تواند موبایل ورود را عوض کند؛ مشتری از پنل خودش با تأیید پیامکی شماره‌ی جدید." />
        {phoneChanged || nidChanged ? <Textarea label="توضیح تغییر (اختیاری)" span={2} rows={2} {...register('change_reason')} hint="در سابقه‌ی تغییرات (ممیزی) ثبت می‌شود." /> : null}
      </FormGrid>
      {phoneChanged ? (
        <div style={{ marginTop: 14 }}>
          <InfoBanner tone="warning">با ذخیره، <b>همه‌ی نشست‌های مشتری بسته می‌شود</b>؛ اولین ورود بعدی فقط با کد پیامکی شماره‌ی جدید است (رمز قبلی حفظ می‌شود و بعد از آن دوباره کار می‌کند). به شماره‌ی قدیم و جدید پیامک اطلاع‌رسانی می‌رود.</InfoBanner>
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * آدرس‌های تحویل مشتری (G-14) — GET /profiles/{id}/addresses (مجوز customers.profiles.addresses.read).
 * نوشتن (پرهام 2026-10-22): افزودن (.create)، ویرایش و پیش‌فرض (.update)، حذف = غیرفعال‌سازی (.delete). آدرس عمومی هویت (/auth/users/{id}/addresses) مجموعه‌ی جداست و این‌جا نمایش داده نمی‌شود.
 */
function AddressesCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const toast = useToast();
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<CustomerAddress | 'new' | null>(null);
  const [removing, setRemoving] = useState<CustomerAddress | null>(null);
  const pageSize = 5;
  const q = useCustomerAddresses(c.id, { page, page_size: pageSize, include_inactive: showInactive || undefined });
  const w = useAddressWrite(c.id);
  const canUpdate = can('customers.profiles.addresses.update');
  const canDelete = can('customers.profiles.addresses.delete');
  const makeDefault = async (a: CustomerAddress) => { try { await w.makeDefault.mutateAsync(a.id); toast('آدرس پیش‌فرض شد.'); } catch (e) { toast(userMessage(e), 'error'); } };
  return (
    <Card>
      <SectionTitle extra={can('customers.profiles.addresses.create') ? <Button variant="secondary" size="sm" icon={<IconPlus size={15} />} onClick={() => setForm('new')}>افزودن آدرس</Button> : null}>آدرس‌های تحویل</SectionTitle>
      <div className={s.addrBar}>
        <Toggle checked={showInactive} onChange={(v) => { setShowInactive(v); setPage(1); }} label="نمایش آدرس‌های حذف‌شده" />
        {q.data ? <span className={s.muted}>{faNum(q.data.total)} آدرس</span> : null}
      </div>
      {q.isLoading ? <SkeletonRows rows={2} height={64} /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data?.results.length ? (
        <p className={s.sub}>{showInactive ? 'آدرسی برای این مشتری ثبت نشده است.' : 'آدرس فعالی برای این مشتری ثبت نشده است.'}</p>
      ) : (
        <div className={s.list}>
          {q.data.results.map((a) => (
            <div key={a.id} className={`${s.listRow} ${a.is_active ? '' : s.addrInactive}`}>
              <span className={s.addrIcon} aria-hidden><IconMapPin size={18} /></span>
              <div>
                <div className={s.addrTitle}>
                  <b>{a.title}</b>
                  {a.is_default ? <Badge tone="brand">پیش‌فرض</Badge> : null}
                  {a.is_active ? null : <Badge tone="neutral">حذف‌شده</Badge>}
                </div>
                <div className={s.addrText}>{a.formatted_address || a.full_address}</div>
                <div className={s.addrMeta}>
                  {a.postal_code ? <span>کد پستی: <b className="tnum">{a.postal_code}</b></span> : null}
                  {a.recipient_name ? <span>گیرنده: <b>{a.recipient_name}</b></span> : null}
                  {a.recipient_phone ? <span>تلفن گیرنده: <b className="tnum">{a.recipient_phone}</b></span> : null}
                  <span>ثبت: {faDate(a.created_at)}</span>
                </div>
              </div>
              {a.is_active && (canUpdate || canDelete) ? (
                <span className={s.addrActions}>
                  {canUpdate && !a.is_default ? <Button size="sm" variant="ghost" loading={w.makeDefault.isPending && w.makeDefault.variables === a.id} onClick={() => makeDefault(a)}>پیش‌فرض کن</Button> : null}
                  {canUpdate ? <Button size="sm" variant="secondary" icon={<IconEdit size={14} />} onClick={() => setForm(a)}>ویرایش</Button> : null}
                  {canDelete ? <Button size="sm" variant="ghost" icon={<IconTrash size={14} />} onClick={() => setRemoving(a)}>حذف</Button> : null}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {q.data && q.data.total > pageSize ? <Pagination page={page} pageSize={pageSize} total={q.data.total} onPage={setPage} /> : null}
      {form ? <AddressModal existing={form === 'new' ? null : form} busy={w.create.isPending || w.update.isPending} onClose={() => setForm(null)}
        onCreate={async (body) => { await w.create.mutateAsync(body); toast('آدرس ثبت شد.'); setForm(null); }}
        onUpdate={async (id, body) => { await w.update.mutateAsync({ id, body }); toast('آدرس ویرایش شد.'); setForm(null); }} /> : null}
      <ReasonModal open={!!removing} onClose={() => setRemoving(null)} danger noReason busy={w.remove.isPending} title={`حذف آدرس «${removing?.title ?? ''}»`} confirmText="حذف آدرس"
        intro={<>آدرس غیرفعال می‌شود و در «آدرس‌های حذف‌شده» باقی می‌ماند.{removing?.is_default ? ' این آدرس پیش‌فرض است؛ آدرس فعال دیگری پیش‌فرض می‌شود.' : ''}</>}
        onConfirm={async () => { await w.remove.mutateAsync(removing!.id); toast('آدرس حذف شد.'); setRemoving(null); }} />
    </Card>
  );
}

type AddrForm = { title: string; province: string; city: string; district: string; full_address: string; details: string; postal_code: string; recipient_name: string; recipient_phone: string };
const ADDR_KEYS: (keyof AddrForm)[] = ['title', 'province', 'city', 'district', 'full_address', 'details', 'postal_code', 'recipient_name', 'recipient_phone'];
/** فرم آدرس تحویل؛ ویرایش فقط فیلدهای تغییرکرده را می‌فرستد (PATCH؛ بک‌اند نسخه نمی‌گیرد) */
function AddressModal({ existing, busy, onClose, onCreate, onUpdate }: {
  existing: CustomerAddress | null; busy: boolean; onClose: () => void;
  onCreate: (body: CustomerAddressIn) => Promise<void>; onUpdate: (id: string, body: Partial<CustomerAddressIn>) => Promise<void>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const { register, handleSubmit, setError, watch, setValue, formState: { errors, dirtyFields } } = useForm<AddrForm>({
    defaultValues: Object.fromEntries(ADDR_KEYS.map((k) => [k, existing ? String((existing as Record<string, unknown>)[k] ?? '') : ''])) as AddrForm,
  });
  const e = (k: keyof AddrForm) => errors[k]?.message as string | undefined;
  // استان و شهر کشویی (افشین 2026-10-25): فهرست رسمی تقسیمات کشوری (shared/data/iranDivisions.ts)؛ «شهر» = شهرستان‌های استان.
  // مقدار قبلی که در فهرست نیست (آدرس‌های قدیمی متن آزاد) به‌عنوان گزینه نگه داشته می‌شود.
  const [div, setDiv] = useState<IranProvince[] | null>(null);
  useEffect(() => { let live = true; import('@/shared/data/iranDivisions').then((m) => { if (live) setDiv(m.IRAN_DIVISIONS); }); return () => { live = false; }; }, []);
  const province = watch('province');
  const city = watch('city');
  const withCurrent = (opts: string[], cur: string) => (cur && !opts.includes(cur) ? [cur, ...opts] : opts).map((v) => ({ value: v, label: v }));
  const provOpts = withCurrent((div ?? []).map((p) => p.name), province);
  const cityOpts = withCurrent((div?.find((p) => p.name === province)?.counties ?? []).map((c) => c.name), city);
  const submit = handleSubmit(async (v) => {
    setErr(null);
    const val = (k: keyof AddrForm) => (k === 'recipient_phone' ? (v[k].trim() ? normPhone(v[k]) : '') : k === 'postal_code' ? clean(v[k]) : v[k].trim());
    try {
      if (existing) {
        const body: Record<string, string> = {};
        (Object.keys(dirtyFields) as (keyof AddrForm)[]).forEach((k) => { body[k] = val(k); });
        if (!Object.keys(body).length) { setErr('تغییری برای ذخیره وجود ندارد.'); return; }
        await onUpdate(existing.id, body);
      } else {
        const body = Object.fromEntries(ADDR_KEYS.map((k) => [k, val(k)]).filter(([, x]) => x !== '')) as CustomerAddressIn;
        if (isDefault) body.is_default = true;
        await onCreate(body);
      }
    } catch (ex) { const rest = applyServerErrors(ex, setError, ADDR_KEYS); setErr(rest.join(' ') || userMessage(ex)); }
  });
  return (
    <Modal open onClose={onClose} title={existing ? `ویرایش آدرس «${existing.title}»` : 'افزودن آدرس تحویل'} width={720}
      footer={<><Button onClick={() => submit()} loading={busy} loadingText="در حال ذخیره…">{existing ? 'ذخیره‌ی تغییرات' : 'ثبت آدرس'}</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={3}>
        <Input label="عنوان آدرس" required placeholder="مثلاً انبار اصلی" {...register('title', { validate: (x) => x.trim().length > 0 || 'عنوان آدرس الزامی است.' })} error={e('title')} />
        <Select label="استان" value={province} onChange={(ev) => { setValue('province', ev.target.value, { shouldDirty: true }); setValue('city', '', { shouldDirty: true }); }} error={e('province')} placeholder={div ? 'انتخاب استان' : 'در حال بارگذاری…'} options={provOpts} />
        <Select label="شهر" value={city} onChange={(ev) => setValue('city', ev.target.value, { shouldDirty: true })} error={e('city')} placeholder={province ? 'انتخاب شهر' : 'اول استان را انتخاب کنید'} options={cityOpts} disabled={!province} />
        <Input label="منطقه / محله" {...register('district')} error={e('district')} />
        <Textarea label="آدرس کامل" required span={2} rows={2} {...register('full_address', { validate: (x) => x.trim().length > 0 || 'آدرس کامل الزامی است.' })} error={e('full_address')} />
        <Input label="جزئیات (پلاک، واحد)" {...register('details')} error={e('details')} />
        <Input label="کد پستی" dir="ltr" inputMode="numeric" maxLength={10} {...register('postal_code', { validate: (x) => !x.trim() || /^[0-9]{10}$/.test(clean(x)) || 'کد پستی باید ۱۰ رقم باشد.' })} error={e('postal_code')} />
        <Input label="نام گیرنده" {...register('recipient_name')} error={e('recipient_name')} />
        <Input label="تلفن گیرنده" dir="ltr" inputMode="tel" maxLength={11} placeholder="09xxxxxxxxx" {...register('recipient_phone', { validate: optPhone })} error={e('recipient_phone')} />
      </FormGrid>
      {!existing ? <div style={{ marginTop: 14 }}><Toggle checked={isDefault} onChange={setIsDefault} label="آدرس پیش‌فرض تحویل شود" /></div> : null}
    </Modal>
  );
}

/** اطلاعات فروشگاه و تماس + ویرایش (PATCH /profiles/{id}) */
function StoreCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const [edit, setEdit] = useState(false);
  const lic = LICENSE_INQUIRY[c.license_inquiry_status];
  return (
    <Card>
      <SectionTitle extra={can('customers.profiles.update') ? <Button variant="secondary" size="sm" icon={<IconEdit size={15} />} onClick={() => setEdit(true)}>ویرایش</Button> : null}>اطلاعات فروشگاه و تماس</SectionTitle>
      <div className={s.kvGrid3}>
        {kv('نام فروشگاه', c.store_name)}{kv('نام مدیر / مسئول', c.manager_name)}{kv('نوع مشتری', <span className={s.flags}>{CUSTOMER_TYPE[c.customer_type] ?? c.customer_type}<SourceTag a={c.attributes?.customer_type} /></span>)}
        {kv('تلفن ثابت', c.phone)}{kv('موبایل ۲', c.mobile_2)}{kv('نام معرف', c.referrer_name)}
        {kv('صنف', c.guild)}{kv('کد اقتصادی', c.economic_code)}{kv('شماره پروانه کسب', c.business_license_no)}
        {kv('استعلام پروانه', <span className={s.flags}><Badge tone={lic?.tone ?? 'neutral'}>{lic?.label ?? c.license_inquiry_status}</Badge>{c.license_inquired_at ? <span className={s.muted}>{faDateTime(c.license_inquired_at)}</span> : null}</span>)}
      </div>
      {edit ? <EditStoreModal c={c} onClose={() => setEdit(false)} /> : null}
    </Card>
  );
}

type EditForm = { store_name: string; manager_name: string; customer_type: string; phone: string; mobile_2: string; referrer_name: string; guild: string; economic_code: string; business_license_no: string; license_inquiry_status: string };
function EditStoreModal({ c, onClose }: { c: CustomerDetail; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateCustomer(c.id);
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, dirtyFields } } = useForm<EditForm>({
    defaultValues: { store_name: c.store_name, manager_name: c.manager_name, customer_type: (c.attributes?.customer_type?.own as string | null | undefined) ?? '', phone: c.phone, mobile_2: c.mobile_2, referrer_name: c.referrer_name, guild: c.guild, economic_code: c.economic_code, business_license_no: c.business_license_no, license_inquiry_status: c.license_inquiry_status },
  });
  const e = (k: keyof EditForm) => errors[k]?.message as string | undefined;
  const submit = handleSubmit(async (v) => {
    // فقط فیلدهای تغییرکرده (PATCH)؛ پاک کردن فیلد ⇐ رشته‌ی خالی (null صریح ⇐ 422)
    const body: Record<string, unknown> = {};
    (Object.keys(dirtyFields) as (keyof EditForm)[]).forEach((k) => { body[k] = k === 'phone' || k === 'mobile_2' ? (String(v[k] ?? '').trim() ? normPhone(String(v[k])) : '') : clean(String(v[k] ?? '')); });
    if (!Object.keys(body).length) { setErr('تغییری برای ذخیره وجود ندارد.'); return; }
    try { await update.mutateAsync({ ...body, expected_version: c.version } as CustomerUpdate); toast('اطلاعات پرونده ذخیره شد.'); onClose(); }
    catch (ex) { const rest = applyServerErrors(ex, setError, Object.keys(v)); setErr(rest.join(' ') || 'برخی فیلدها نیاز به اصلاح دارند.'); }
  });
  return (
    <Modal open onClose={onClose} title="ویرایش اطلاعات فروشگاه" width={760}
      footer={<><Button onClick={() => submit()} loading={update.isPending} loadingText="در حال ذخیره…">ذخیره‌ی تغییرات</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={3}>
        <Input label="نام فروشگاه" {...register('store_name')} error={e('store_name')} />
        <Input label="نام مدیر / مسئول" {...register('manager_name')} error={e('manager_name')} />
        <Select label="نوع مشتری" {...register('customer_type')} placeholder="تعیین‌نشده (از گروه / پیش‌فرض)" options={Object.entries(CUSTOMER_TYPE).map(([value, label]) => ({ value, label }))} />
        <Input label="تلفن ثابت" {...register('phone', { validate: optPhone })} error={e('phone')} dir="ltr" inputMode="tel" />
        <Input label="موبایل ۲" {...register('mobile_2', { validate: optMobile })} error={e('mobile_2')} dir="ltr" inputMode="numeric" />
        <Input label="نام معرف" {...register('referrer_name')} />
        <Input label="صنف" {...register('guild')} />
        <Input label="کد اقتصادی" {...register('economic_code')} dir="ltr" inputMode="numeric" />
        <Input label="شماره پروانه کسب" {...register('business_license_no')} dir="ltr" inputMode="numeric" />
        <Select label="وضعیت استعلام پروانه" {...register('license_inquiry_status')} options={Object.entries(LICENSE_INQUIRY).map(([value, v]) => ({ value, label: v.label }))} />
      </FormGrid>
    </Modal>
  );
}

/** وضعیت مشتری + لیست سیاه + بایگانی (html: کارت «وضعیت کاربر») */
function StatusCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const toast = useToast();
  const status = useChangeStatus(c.id);
  const blacklist = useBlacklist(c.id);
  const archive = useArchiveCustomer(c.id);
  const [target, setTarget] = useState<'ACTIVE' | 'INACTIVE' | null>(null);
  const [bl, setBl] = useState(false);
  const [arch, setArch] = useState(false);
  const canStatus = can('customers.profiles.status.update');
  const switchable = c.status === 'ACTIVE' || c.status === 'INACTIVE';
  const choices: { value: 'ACTIVE' | 'INACTIVE'; }[] = [{ value: 'ACTIVE' }, { value: 'INACTIVE' }];
  return (
    <Card>
      <SectionTitle>وضعیت مشتری</SectionTitle>
      <p className={s.sub} style={{ marginBottom: 12 }}>تغییر وضعیت بر دسترسی ثبت سفارش اثر می‌گذارد. مسدودی مالی وضعیت نیست و از تب «اعتبارات» (قفل مالی) مدیریت می‌شود.</p>
      {!switchable ? <InfoBanner>{CUSTOMER_STATUS[c.status]?.hint ?? 'وضعیت فعلی از این‌جا تغییر نمی‌کند.'} وضعیت فعلی: <b>{c.status_display}</b></InfoBanner> : null}
      <div className={s.choices}>
        {choices.map((o) => {
          const on = c.status === o.value; const st = CUSTOMER_STATUS[o.value]!;
          return (
            <button type="button" key={o.value} className={`${s.choice} ${on ? s.choiceOn : ''}`} disabled={!canStatus || !switchable || on} onClick={() => setTarget(o.value)} aria-pressed={on}>
              <span className={s.choiceDot} /><span className={s.choiceText}><span className={s.choiceTitle}>{st.label}</span><span className={s.choiceDesc}>{st.hint}</span></span>
            </button>
          );
        })}
        <div className={`${s.choice} ${c.is_locked ? s.choiceOn : ''}`} style={{ cursor: 'default' }} aria-disabled>
          <span className={s.choiceDot} /><span className={s.choiceText}><span className={s.choiceTitle}>مسدود به دلایل مالی</span><span className={s.choiceDesc}>{c.is_locked ? 'قفل اعتباری مؤثر دارد؛ فقط خرید نقدی و بدون تخفیف.' : 'قفل اعتباری مؤثری ندارد.'}</span></span>
        </div>
      </div>
      <div className={s.divider} />
      <div className={s.rowBetween}>
        <div>
          <div className={s.strong}>لیست سیاه</div>
          <div className={s.sub}>{c.is_blacklisted ? `در لیست سیاه — ${c.blacklist_reason || 'بدون دلیل ثبت‌شده'}` : 'مشتری لیست سیاه در هیچ شرایطی (حتی نقدی) خرید نمی‌کند.'}</div>
        </div>
        {canStatus ? <Button variant={c.is_blacklisted ? 'secondary' : 'danger'} size="sm" icon={c.is_blacklisted ? <IconLockOpen size={15} /> : <IconLock size={15} />} onClick={() => setBl(true)}>{c.is_blacklisted ? 'خروج از لیست سیاه' : 'افزودن به لیست سیاه'}</Button> : null}
      </div>
      {can('customers.profiles.delete') && c.status === 'ACTIVE' ? (
        <>
          <div className={s.divider} />
          <div className={s.rowBetween}>
            <div><div className={s.strong}>بایگانی پرونده</div><div className={s.sub}>پرونده حذف نمی‌شود؛ وضعیت به «غیرفعال» می‌رود.</div></div>
            <Button variant="danger" size="sm" icon={<IconArchive size={15} />} onClick={() => setArch(true)}>بایگانی</Button>
          </div>
        </>
      ) : null}

      <ReasonModal open={!!target} onClose={() => setTarget(null)} title={target === 'ACTIVE' ? 'فعال کردن مشتری' : 'غیرفعال کردن مشتری'} busy={status.isPending}
        intro={target === 'INACTIVE' ? 'مشتری غیرفعال سفارش جدید ثبت نمی‌کند ولی می‌تواند بدهی‌اش را تسویه کند.' : 'مشتری دوباره می‌تواند سفارش ثبت کند.'}
        onConfirm={async (reason) => { await status.mutateAsync({ status: target!, reason, expected_version: c.version }); toast(target === 'ACTIVE' ? 'مشتری فعال شد.' : 'مشتری غیرفعال شد.'); setTarget(null); }} />
      <ReasonModal open={bl} onClose={() => setBl(false)} danger={!c.is_blacklisted} busy={blacklist.isPending} title={c.is_blacklisted ? 'خروج از لیست سیاه' : 'افزودن به لیست سیاه'}
        confirmText={c.is_blacklisted ? 'خروج از لیست سیاه' : 'افزودن به لیست سیاه'}
        onConfirm={async (reason) => { await blacklist.mutateAsync({ flag: !c.is_blacklisted, reason, expected_version: c.version }); toast(c.is_blacklisted ? 'مشتری از لیست سیاه خارج شد.' : 'مشتری به لیست سیاه افزوده شد.'); setBl(false); }} />
      <ReasonModal open={arch} onClose={() => setArch(false)} danger busy={archive.isPending} title="بایگانی پرونده‌ی مشتری" confirmText="بایگانی"
        onConfirm={async (reason) => { await archive.mutateAsync({ reason, expected_version: c.version }); toast('پرونده بایگانی شد.'); setArch(false); }} />
    </Card>
  );
}

function StatusReadonly({ c }: { c: CustomerDetail }) {
  const st = CUSTOMER_STATUS[c.status];
  return (
    <Card>
      <SectionTitle>وضعیت مشتری</SectionTitle>
      <div className={s.flags}><Badge tone={st?.tone ?? 'neutral'}>{c.status_display}</Badge>{c.is_blacklisted ? <Badge tone="danger">لیست سیاه</Badge> : null}{c.is_locked ? <Badge tone="danger">مسدود مالی</Badge> : null}</div>
      <p className={s.sub} style={{ marginTop: 10 }}>{st?.hint}</p>
    </Card>
  );
}

/** سطح همکاری (فقط مالی؛ BR-CUS-017) + روش‌های پرداخت مجاز از GET /tier */
function TierCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const toast = useToast();
  const tier = useCustomerTier(c.id, true);
  const set = useSetTier(c.id);
  const [target, setTarget] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const a = c.attributes?.cooperation_level;
  const canTier = can('customers.profiles.tier.update');
  return (
    <Card>
      <SectionTitle extra={<span className={s.actionsRow}><SourceTag a={a} />{canTier && a?.source === 'PROFILE' ? <Button size="sm" variant="ghost" onClick={() => setClearing(true)}>پاک کردن از پرونده</Button> : null}</span>}>سطح همکاری</SectionTitle>
      <p className={s.sub} style={{ marginBottom: 12 }}>سطح فقط روش‌های پرداخت را تعیین می‌کند؛ مبلغ اعتبار صفر می‌ماند تا در تب «اعتبارات» تخصیص یابد. ارتقای خودکار نداریم.</p>
      <div className={s.choices}>
        {Object.entries(COOPERATION).map(([value, v]) => {
          const on = c.cooperation_level === value;
          return (
            <button type="button" key={value} className={`${s.choice} ${on ? s.choiceOn : ''}`} disabled={!can('customers.profiles.tier.update') || on} onClick={() => setTarget(value)} aria-pressed={on}>
              <span className={s.choiceDot} /><span className={s.choiceText}><span className={s.choiceTitle}><TierText level={value} /></span><span className={s.choiceDesc}>{v.desc}</span></span>
            </button>
          );
        })}
      </div>
      {tier.isLoading ? <div style={{ marginTop: 12 }}><SkeletonRows rows={1} height={36} /></div> : tier.data ? (
        <div style={{ marginTop: 14 }} className={s.kvGrid}>
          {kv('شماره‌ی سطح', `سطح ${tier.data.verification_level.toLocaleString('fa-IR')} از ۳`)}
          {kv('روش‌های پرداخت مجاز', tier.data.allowed_payment_methods.length ? tier.data.allowed_payment_methods.map((m) => PAYMENT_METHOD[m] ?? m).join('، ') : 'هیچ')}
        </div>
      ) : null}
      <ReasonModal open={clearing} onClose={() => setClearing(false)} busy={set.isPending} title="پاک کردن سطح همکاری از پرونده"
        intro="بعد از پاک کردن، سطح از گروه فعال مشتری (اگر تعیین کرده باشد) و وگرنه پیش‌فرض سیستم (برنزی) خوانده می‌شود؛ حساب‌های اعتباری با سطح تازه همگام می‌شوند."
        onConfirm={async (reason) => { await set.mutateAsync({ clear: true, reason, expected_version: c.version }); toast('سطح همکاری از پرونده پاک شد.'); setClearing(false); }} />
      <ReasonModal open={!!target} onClose={() => setTarget(null)} busy={set.isPending} title={`تغییر سطح همکاری به «${target ? COOPERATION[target]?.label : ''}»`}
        onConfirm={async (reason) => { await set.mutateAsync({ level: target!, reason, expected_version: c.version }); toast('سطح همکاری تغییر کرد.'); setTarget(null); }}>
        {target === 'BRONZE' || (target === 'SILVER' && c.cooperation_level === 'GOLD') ? <InfoBanner tone="warning">با پایین آمدن سطح، حساب اعتباری فعالی که این سطح اجازه نمی‌دهد «منجمد» می‌شود (سقف و مهلت حفظ می‌شود).</InfoBanner> : null}
      </ReasonModal>
    </Card>
  );
}

/** سطح دسترسی تصاویر (مستقل و دستی؛ BR-CUS-019) — html: «سطح کاربر ۱ تا ۳» */
function ImageLevelCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const toast = useToast();
  const q = useCustomerImageAccess(c.id, true);
  const set = useSetImageAccess(c.id);
  const [target, setTarget] = useState<string | null>(null);
  const level = q.data?.image_access_level;
  const n = level ? IMAGE_LEVEL[level]?.n ?? 1 : 0;
  const a = c.attributes?.image_access_level;
  const canImg = can('customers.profiles.images.update');
  const [clearing, setClearing] = useState(false);
  return (
    <Card>
      <SectionTitle extra={<span className={s.actionsRow}><SourceTag a={a} />{canImg && a?.source === 'PROFILE' ? <Button size="sm" variant="ghost" onClick={() => setClearing(true)}>پاک کردن از پرونده</Button> : null}{canImg && level ? <Button variant="secondary" size="sm" onClick={() => setTarget(level)}>تغییر سطح</Button> : null}</span>}>سطح کاربر (تصاویر کاتالوگ)</SectionTitle>
      <p className={s.sub}>تعیین می‌کند مشتری کدام تصاویر کاتالوگ را می‌بیند. مستقل از سطح همکاری است و جنسیت اثری ندارد.</p>
      {q.isLoading ? <SkeletonRows rows={1} height={36} /> : q.error ? <Alert>{userMessage(q.error)}</Alert> : (
        <>
          <div className={s.levelBar}>{[1, 2, 3].map((i) => <span key={i} className={`${s.levelSeg} ${i <= n ? s.levelSegOn : ''}`} />)}</div>
          <div className={s.levelLabels}>{Object.values(IMAGE_LEVEL).map((v) => <span key={v.n} className={v.n === n ? s.levelLabelOn : ''}>سطح {v.n.toLocaleString('fa-IR')}</span>)}</div>
          <div className={s.noteBox} style={{ marginTop: 12, fontSize: 12.5 }}>{level ? `${IMAGE_LEVEL[level]?.label}: ${IMAGE_LEVEL[level]?.desc}` : '—'}</div>
        </>
      )}
      <ReasonModal open={clearing} onClose={() => setClearing(false)} busy={set.isPending} title="پاک کردن سطح تصاویر از پرونده"
        intro="بعد از پاک کردن، سطح تصاویر از گروه فعال مشتری و وگرنه پیش‌فرض سیستم (عادی) خوانده می‌شود."
        onConfirm={async (reason) => { await set.mutateAsync({ clear: true, reason, expected_version: c.version }); toast('سطح تصاویر از پرونده پاک شد.'); setClearing(false); }} />
      <Modal open={!!target} onClose={() => setTarget(null)} title="تغییر سطح تصاویر" width={520}>
        <ImageLevelForm current={level ?? 'NORMAL'} busy={set.isPending} onCancel={() => setTarget(null)} onSubmit={async (lvl, reason) => { await set.mutateAsync({ level: lvl, reason, expected_version: c.version }); toast('سطح تصاویر تغییر کرد.'); setTarget(null); }} />
      </Modal>
    </Card>
  );
}
function ImageLevelForm({ current, busy, onCancel, onSubmit }: { current: string; busy: boolean; onCancel: () => void; onSubmit: (level: string, reason: string) => Promise<void> }) {
  const [lvl, setLvl] = useState(current);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <div className={s.choices}>
        {Object.entries(IMAGE_LEVEL).map(([value, v]) => (
          <button type="button" key={value} className={`${s.choice} ${lvl === value ? s.choiceOn : ''}`} onClick={() => setLvl(value)} aria-pressed={lvl === value}>
            <span className={s.choiceDot} /><span className={s.choiceText}><span className={s.choiceTitle}>{v.label}</span><span className={s.choiceDesc}>{v.desc}</span></span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}><Input label="دلیل" required value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {err ? <div style={{ marginTop: 10 }}><Alert>{err}</Alert></div> : null}
      <div className={s.actionsRow} style={{ marginTop: 16 }}>
        <Button loading={busy} disabled={lvl === current} onClick={async () => { if (!reason.trim()) { setErr('دلیل الزامی است.'); return; } try { await onSubmit(lvl, reason.trim()); } catch (e) { setErr(userMessage(e)); } }}>ثبت سطح جدید</Button>
        <Button variant="ghost" onClick={onCancel}>انصراف</Button>
      </div>
    </>
  );
}

/** دروازه‌ی بارگذاری پروانه‌ی کسب در پنل مشتری (P-05 پرهام) — وضعیت فعلی در detail نیست ⇐ هر دو دکمه */
function LicenseGateCard({ c }: { c: CustomerDetail }) {
  const toast = useToast();
  const gate = useLicenseGate(c.id);
  const [mode, setMode] = useState<'open' | 'close' | null>(null);
  return (
    <Card>
      <SectionTitle>بارگذاری پروانه‌ی کسب در پنل مشتری</SectionTitle>
      <p className={s.sub} style={{ marginBottom: 12 }}>با باز کردن، مشتری می‌تواند تصویر و شماره‌ی پروانه را از پنل خودش بارگذاری یا ویرایش کند؛ با بستن، این بخش برایش قفل می‌شود. وضعیت فعلی دروازه در پاسخ پرونده نمی‌آید.</p>
      <div className={s.actionsRow}>
        <Button variant="secondary" size="sm" onClick={() => setMode('open')}>باز کردن بارگذاری</Button>
        <Button variant="secondary" size="sm" onClick={() => setMode('close')}>بستن بارگذاری</Button>
      </div>
      <ReasonModal open={!!mode} onClose={() => setMode(null)} busy={gate.isPending} title={mode === 'open' ? 'باز کردن بارگذاری پروانه' : 'بستن بارگذاری پروانه'}
        onConfirm={async (reason) => { const r = await gate.mutateAsync({ open: mode === 'open', reason, expected_version: c.version }); toast(r.business_license_upload_enabled ? 'بارگذاری پروانه برای مشتری باز شد.' : 'بارگذاری پروانه برای مشتری بسته شد.'); setMode(null); }} />
    </Card>
  );
}
