import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useBack } from '@/shared/lib/useBack';
import { useFieldArray, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus, IconTrash } from '@tabler/icons-react';
import { applyServerErrors } from '@/shared/api/formErrors';
import { userMessage } from '@/shared/api/errors';
import { toFaDigits } from '@/shared/lib/text';
import { clean } from '@/shared/lib/validate';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, PickerField, Select, Textarea, Toggle } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Card, InfoBanner, PageHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import type { IranProvince } from '@/shared/data/iranDivisions';
import { useSubmitRegistration, type RegistrationSubmit } from '../api';
import { normPhone } from '../phone';
import { MarketerPickerModal, TierText, digitsOnly, formatAmount, rial } from '../components';
import { COOPERATION, CUSTOMER_TYPE, IMAGE_LEVEL } from '../labels';
import { emptyGuarantee, emptyWizard, STEP_FIELDS, STEPS, wizardSchema, type WizardValues } from './wizardSchema';
import s from '../customers.module.css';

const n = (v: string) => (v.trim() ? clean(v) : undefined);
const t = (v: string) => (v.trim() ? v.trim() : undefined);

/** ویزارد «ثبت مشتری جدید» — POST /customers/registration-requests ⇐ درخواست در صف بررسی (تأیید قدم جداست؛ BR-CUS-084) */
export default function CustomerWizardPage() {
  const navigate = useNavigate();
  const back = useBack('/customers/profiles');
  const toast = useToast();
  const submitReq = useSubmitRegistration();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const form = useForm<WizardValues>({ resolver: zodResolver(wizardSchema), defaultValues: emptyWizard(), mode: 'onTouched' });
  const { register, handleSubmit, trigger, watch, setValue, setError, control, formState: { errors } } = form;
  const guarantees = useFieldArray({ control, name: 'guarantees' });
  const e = (k: keyof WizardValues) => (errors as FieldErrors<Record<string, unknown>>)[k]?.message as string | undefined;
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);
  // استان و شهر کشویی از فهرست رسمی تقسیمات کشوری (shared/data/iranDivisions.ts، مرکز آمار ایران؛ همان فهرست فرم شعبه):
  // «شهر» = شهرستان‌های استان انتخاب‌شده (افشین 2026-10-25). بک‌اند متن آزاد ذخیره می‌کند. فایل lazy بارگذاری می‌شود.
  const [div, setDiv] = useState<IranProvince[] | null>(null);
  useEffect(() => { let live = true; import('@/shared/data/iranDivisions').then((m) => { if (live) setDiv(m.IRAN_DIVISIONS); }); return () => { live = false; }; }, []);
  const province = watch('province');
  const city = watch('city');
  const withCurrent = (opts: string[], cur: string) => (cur && !opts.includes(cur) ? [cur, ...opts] : opts).map((v) => ({ value: v, label: v }));
  const provOpts = withCurrent((div ?? []).map((p) => p.name), province);
  const cityOpts = withCurrent((div?.find((p) => p.name === province)?.counties ?? []).map((c) => c.name), city);
  const [marketerName, cheque, golden, stepwise, cooperation, imageLevel] = watch(['marketer_name', 'cheque_credit', 'golden_credit', 'stepwise_increase', 'cooperation_level', 'image_access_level']);

  const goto = async (to: number) => {
    if (to > step) { const ok = await trigger(STEP_FIELDS[step]!); if (!ok) return; setDone((d) => Array.from(new Set([...d, step]))); }
    setFormError(null); setStep(to);
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const body = {
      first_name: v.first_name.trim(), last_name: v.last_name.trim(), gender: t(v.gender), national_id: clean(v.national_id), business_license_no: n(v.business_license_no),
      mobile_1: normPhone(v.mobile_1), mobile_2: v.mobile_2.trim() ? normPhone(v.mobile_2) : undefined, phone: v.phone.trim() ? normPhone(v.phone) : undefined, referrer_name: t(v.referrer_name), referrer_phone: v.referrer_phone.trim() ? normPhone(v.referrer_phone) : undefined,
      address: t(v.address), province: t(v.province), city: t(v.city), postal_code: n(v.postal_code),
      store_name: v.store_name.trim(), manager_name: t(v.manager_name) ?? `${v.first_name.trim()} ${v.last_name.trim()}`, economic_code: n(v.economic_code), guild: t(v.guild), description: t(v.description),
      // یادداشت برای بررسی (اعمال نمی‌شود)
      marketer_id: v.marketer_id || undefined, marketer_name: t(v.marketer_name), marketer_percent: n(v.marketer_percent),
      cheque_credit: n(v.cheque_credit), cheque_max_due_months: v.cheque_max_due_months ? Number(clean(v.cheque_max_due_months)) : undefined,
      golden_credit: n(v.golden_credit), stepwise_increase: v.stepwise_increase,
      guarantees: v.guarantees.length ? v.guarantees.map((g) => ({ type: g.type, credit: g.credit === 'CHEQUE' ? 'اعتبار چکی' : 'اعتبار طلایی', amount: n(g.amount), cheque_no: n(g.cheque_no), serial: n(g.serial), bank: t(g.bank), branch: t(g.branch), owner: t(g.owner), guarantor: t(g.guarantor), guarantor_nid: n(g.guarantor_nid), due: t(g.due), status: 'فعال' })) : undefined,
      username: t(v.username), customer_type: v.customer_type || undefined, cooperation_level: v.cooperation_level, image_access_level: v.image_access_level, status: 'PENDING',
    };
    Object.keys(body).forEach((k) => (body as Record<string, unknown>)[k] === undefined && delete (body as Record<string, unknown>)[k]);
    try {
      const r = await submitReq.mutateAsync(body as unknown as RegistrationSubmit);
      toast('مشتری ثبت و به صف درخواست‌ها فرستاده شد.');
      navigate(`/customers/registration-requests/${r.id}`, { replace: true });
    } catch (err) {
      const rest = applyServerErrors(err, setError, STEP_FIELDS.flat() as string[], { mobile: 'mobile_1' });
      const firstBad = STEP_FIELDS.findIndex((fs) => fs.some((f) => form.getFieldState(f).error));
      if (firstBad >= 0) setStep(firstBad);
      setFormError(rest.length ? rest.join(' ') : firstBad >= 0 ? 'برخی فیلدها نیاز به اصلاح دارند.' : userMessage(err));
    }
  }, () => { const firstBad = STEP_FIELDS.findIndex((fs) => fs.some((f) => form.getFieldState(f).error)); if (firstBad >= 0) setStep(firstBad); });

  const last = step === STEPS.length - 1;
  const amountField = (name: 'cheque_credit' | 'golden_credit', label: string) => (
    <Input label={label} value={formatAmount(watch(name))} onChange={(ev) => setValue(name, digitsOnly(ev.target.value), { shouldDirty: true })} inputMode="numeric" dir="ltr" hint={watch(name) ? rial(watch(name)) : 'ریال — فقط یادداشت'} />
  );
  return (
    <>
      <PageHead back={back} title="ثبت مشتری جدید" sub="پس از ثبت، درخواست به صف «درخواست‌های ثبت‌نام» می‌رود و با تأیید جداگانه نهایی می‌شود." />
      <Card pad={false}>
        <div className={s.steps} role="tablist">
          {STEPS.map((label, i) => (
            <button key={label} type="button" role="tab" aria-selected={i === step} className={`${s.step} ${i === step ? s.stepOn : ''} ${done.includes(i) ? s.stepDone : ''}`} onClick={() => (i <= step || done.includes(i - 1) ? goto(i) : undefined)}>
              <span className={s.num}>{done.includes(i) && i !== step ? <IconCheck size={13} /> : toFaDigits(i + 1)}</span>{label}
            </button>
          ))}
        </div>
        <form className={s.body} onSubmit={(ev) => ev.preventDefault()} noValidate>
          {formError ? <div style={{ marginBottom: 16 }}><Alert>{formError}</Alert></div> : null}
          {step === 0 ? (
            <>
              <FormGrid cols={3}>
                <Input label="نام" required {...register('first_name')} error={e('first_name')} />
                <Input label="نام خانوادگی" required {...register('last_name')} error={e('last_name')} />
                <Select label="جنسیت" {...register('gender')} placeholder="انتخاب کنید" options={[{ value: 'MALE', label: 'مرد' }, { value: 'FEMALE', label: 'زن' }]} />
                <Input label="کد ملی" required {...register('national_id')} error={e('national_id')} dir="ltr" inputMode="numeric" placeholder="کد ملی ۱۰ رقمی" />
                <Input label="شماره پروانه کسب" {...register('business_license_no')} dir="ltr" inputMode="numeric" />
              </FormGrid>
              <div style={{ marginTop: 14 }}><InfoBanner>تصویر پروانه کسب و سایر مدارک پس از ثبت، در صفحه‌ی «بررسی درخواست» بارگذاری می‌شوند (مدرک به پرونده‌ی ساخته‌شده وصل می‌شود).</InfoBanner></div>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <FormGrid cols={4}>
                <Input label="موبایل ۱ (ورود مشتری)" required {...register('mobile_1')} error={e('mobile_1')} dir="ltr" inputMode="numeric" placeholder="۰۹xxxxxxxxx" hint="اولین ورود با کد پیامکی به همین شماره" />
                <Input label="موبایل ۲" {...register('mobile_2')} error={e('mobile_2')} dir="ltr" inputMode="numeric" />
                <Input label="تلفن ثابت" {...register('phone')} error={e('phone')} dir="ltr" inputMode="tel" placeholder="۰۲۱xxxxxxxx" />
                <Input label="نام معرف" {...register('referrer_name')} />
                <Input label="تلفن معرف" {...register('referrer_phone')} error={e('referrer_phone')} dir="ltr" inputMode="tel" />
                <Select label="استان" value={province} onChange={(ev) => { setValue('province', ev.target.value, { shouldDirty: true }); setValue('city', '', { shouldDirty: true }); }} placeholder={div ? 'انتخاب استان' : 'در حال بارگذاری…'} options={provOpts} />
                <Select label="شهر" value={city} onChange={(ev) => setValue('city', ev.target.value, { shouldDirty: true })} placeholder={province ? 'انتخاب شهر' : 'اول استان را انتخاب کنید'} options={cityOpts} disabled={!province} />
                <Input label="کد پستی" {...register('postal_code')} error={e('postal_code')} dir="ltr" inputMode="numeric" />
                <Textarea label="آدرس" span={4} {...register('address')} rows={2} />
              </FormGrid>
              <div className={s.subhead}>فروشگاه و کسب‌وکار</div>
              <FormGrid cols={4}>
                <Input label="نام فروشگاه" {...register('store_name')} />
                <Input label="نام مدیر / مسئول" {...register('manager_name')} hint="خالی = نام و نام خانوادگی متقاضی" />
                <Input label="صنف" {...register('guild')} />
                <Input label="کد اقتصادی" {...register('economic_code')} dir="ltr" inputMode="numeric" />
                <Textarea label="توضیحات" span={4} {...register('description')} rows={2} />
              </FormGrid>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <InfoBanner tone="warning">این مقادیر فقط به‌عنوان <b>یادداشت برای بررسی</b> همراه درخواست ذخیره می‌شوند و خودکار روی پرونده اعمال نمی‌شوند. تخصیص واقعی بازاریاب، اعتبار و ضمانت بعد از تأیید، از صفحه‌ی پرونده‌ی مشتری انجام می‌شود.</InfoBanner>
              <div className={s.subhead}>بازاریاب</div>
              <FormGrid cols={4}>
                <PickerField label="بازاریاب پیشنهادی" value={marketerName} placeholder="انتخاب کارمند" onOpen={() => setPicker(true)}
                  onClear={() => { setValue('marketer_id', '', { shouldDirty: true }); setValue('marketer_name', '', { shouldDirty: true }); }} />
                <Input label="درصد بازاریاب" {...register('marketer_percent')} error={e('marketer_percent')} dir="ltr" inputMode="numeric" placeholder="۳" />
              </FormGrid>
              <div className={s.subhead}>اعتبار پیشنهادی</div>
              <FormGrid cols={4}>
                {amountField('cheque_credit', 'اعتبار چکی')}
                <Input label="حداکثر راس چک (ماه)" {...register('cheque_max_due_months')} error={e('cheque_max_due_months')} dir="ltr" inputMode="numeric" placeholder="۱ تا ۲۴" />
                {amountField('golden_credit', 'اعتبار طلایی')}
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 26 }}><Toggle checked={stepwise} onChange={(v) => setValue('stepwise_increase', v, { shouldDirty: true })} label="افزایش پله‌ای مهلت" /></div>
              </FormGrid>
              <div className={s.subhead} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>ضمانت‌های پیشنهادی</span>
                <Button type="button" variant="secondary" size="sm" icon={<IconPlus size={15} />} onClick={() => guarantees.append(emptyGuarantee())}>افزودن ضمانت</Button>
              </div>
              {!guarantees.fields.length ? <p className={s.sub}>ضمانت فقط چک شخصی یا سفته است؛ می‌توانید چند مورد یادداشت کنید. ثبت نهایی ضمانت با تصویر، بعد از تأیید در تب «اعتبارات» پرونده انجام می‌شود.</p> : null}
              {guarantees.fields.map((f, i) => {
                const typ = watch(`guarantees.${i}.type`);
                return (
                  <div key={f.id} className={s.guarRow} style={{ marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <FormGrid cols={4}>
                        <Select label="نوع ضمانت" {...register(`guarantees.${i}.type`)} options={[{ value: 'cheque', label: 'چک شخصی' }, { value: 'promissory_note', label: 'سفته' }]} />
                        <Select label="مربوط به اعتبار" {...register(`guarantees.${i}.credit`)} options={[{ value: 'CHEQUE', label: 'اعتبار چکی' }, { value: 'GOLDEN', label: 'اعتبار طلایی' }]} />
                        <Input label="مبلغ (ریال)" value={formatAmount(watch(`guarantees.${i}.amount`))} onChange={(ev) => setValue(`guarantees.${i}.amount`, digitsOnly(ev.target.value))} inputMode="numeric" dir="ltr" />
                        <JalaliDateInput label="تاریخ سررسید" maxYear={1500} {...register(`guarantees.${i}.due`)} dir="ltr" placeholder="۱۴۰۵/۰۳/۱۵" />
                        {typ === 'cheque' ? <>
                          <Input label="شناسه‌ی صیاد (۱۶ رقم)" {...register(`guarantees.${i}.cheque_no`)} dir="ltr" inputMode="numeric" />
                          <Input label="نام بانک" {...register(`guarantees.${i}.bank`)} />
                          <Input label="شعبه" {...register(`guarantees.${i}.branch`)} />
                          <Input label="صاحب حساب" {...register(`guarantees.${i}.owner`)} />
                        </> : <>
                          <Input label="شماره‌ی سفته" {...register(`guarantees.${i}.serial`)} dir="ltr" inputMode="numeric" />
                          <Input label="نام ضامن" {...register(`guarantees.${i}.guarantor`)} />
                          <Input label="کد ملی ضامن" {...register(`guarantees.${i}.guarantor_nid`)} dir="ltr" inputMode="numeric" />
                        </>}
                      </FormGrid>
                    </div>
                    <button type="button" className={s.remove} onClick={() => guarantees.remove(i)} aria-label="حذف ضمانت"><IconTrash size={17} /></button>
                  </div>
                );
              })}
            </>
          ) : null}
          {step === 3 ? (
            <>
              <InfoBanner tone="info">پرونده با وضعیت «در انتظار تأیید» ساخته می‌شود. <b>سطح همکاری و سطح تصاویر هنگام تأیید درخواست روی پرونده اعمال می‌شوند</b> (تأییدکننده باید مجوز تغییر این سطح‌ها را داشته باشد). نام کاربری فقط یادداشت است و رمز تعیین نمی‌شود؛ اولین ورود مشتری با کد پیامکی است.</InfoBanner>
              <FormGrid cols={4}>
                <Input label="نام کاربری پیشنهادی" latin {...register('username')} dir="ltr" autoComplete="off" />
                <Select label="نوع مشتری" {...register('customer_type')} placeholder="تعیین‌نشده (از گروه / پیش‌فرض: عمده‌فروش)" options={Object.entries(CUSTOMER_TYPE).map(([value, label]) => ({ value, label }))} hint="این مورد روی پرونده اعمال می‌شود." />
                <Select label="سطح همکاری پیشنهادی" {...register('cooperation_level')} options={Object.entries(COOPERATION).map(([value, v]) => ({ value, label: `${v.label} — ${v.desc}` }))} />
                <Select label="سطح کاربر پیشنهادی (تصاویر)" {...register('image_access_level')} options={Object.entries(IMAGE_LEVEL).map(([value, v]) => ({ value, label: v.label }))} />
              </FormGrid>
              <div className={s.subhead}>بازبینی</div>
              <div className={s.summary}>
                <div><div className={s.sub}>متقاضی</div><b>{watch('first_name')} {watch('last_name')}</b></div>
                <div><div className={s.sub}>کد ملی / موبایل</div><b className="tnum">{watch('national_id') || '—'} / {watch('mobile_1') || '—'}</b></div>
                <div><div className={s.sub}>فروشگاه</div><b>{watch('store_name') || '—'}</b></div>
                <div><div className={s.sub}>بازاریاب پیشنهادی</div><b>{marketerName || '—'}{watch('marketer_percent') ? ` — ${toFaDigits(watch('marketer_percent'))}٪` : ''}</b></div>
                <div><div className={s.sub}>اعتبار پیشنهادی</div><b>{cheque ? `چکی ${rial(cheque)}` : ''}{cheque && golden ? ' · ' : ''}{golden ? `طلایی ${rial(golden)}` : ''}{!cheque && !golden ? '—' : ''}</b></div>
                <div><div className={s.sub}>سطح پیشنهادی</div><b><TierText level={cooperation} /> · {IMAGE_LEVEL[imageLevel]?.label}</b></div>
              </div>
            </>
          ) : null}

          <div className={s.foot}>
            {last ? <Button type="button" onClick={() => onSubmit()} loading={submitReq.isPending} loadingText="در حال ثبت…" icon={<IconCheck size={17} />}>ثبت و ارسال برای تأیید</Button>
              : <Button type="button" onClick={() => goto(step + 1)} icon={<IconChevronLeft size={17} />}>مرحله بعد: {STEPS[step + 1]}</Button>}
            {step > 0 ? <Button type="button" variant="secondary" icon={<IconChevronRight size={17} />} onClick={() => goto(step - 1)}>مرحله قبل</Button> : null}
            <Button type="button" variant="ghost" onClick={back}>انصراف</Button>
            <span className={s.counter}>مرحله {toFaDigits(step + 1)} از {toFaDigits(STEPS.length)}</span>
          </div>
        </form>
      </Card>
      <MarketerPickerModal open={picker} onClose={() => setPicker(false)} onPick={(m) => { setValue('marketer_id', m.id, { shouldDirty: true }); setValue('marketer_name', m.full_name, { shouldDirty: true }); setPicker(false); }} />
    </>
  );
}
