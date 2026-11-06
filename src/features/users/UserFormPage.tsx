import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useBack } from '@/shared/lib/useBack';
import { useFieldArray, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react';
import { applyServerErrors } from '@/shared/api/formErrors';
import { adminApi } from '@/shared/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { formatCard, formatIban, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { clean, formatMobileInput } from '@/shared/lib/validate';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select, Textarea, Toggle } from '@/shared/ui/form';
import { Card, ErrorBox, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { uploadStaffDocument, useAssignments, useUserDepartments, useAllRoles, useAllStaff, useCreateStaff, useDepartmentPicker, useUpdateUser, useUser, type StaffRegister, type UserDetail, type UserUpdate } from './api';
import { DocsSection, SecurityTab } from './userTabs';
import { BranchMasterSection } from './BranchMasterSection';
import { DOC_SLOTS, EDUCATION, GENDER, MARITAL, USER_STATUS } from './labels';
import { emptyKin, emptyUserForm, STEP_FIELDS, userFormSchema, type UserFormValues } from './userFormSchema';
import s from './userForm.module.css';

const STEPS = ['اطلاعات هویتی', 'آدرس و تماس', 'اطلاعات بانکی', 'اطلاعات شغلی', 'مدارک', 'امنیت و نقش'];
const n = (v: string) => (v.trim() ? clean(v) : null);
const t = (v: string) => (v.trim() ? toLatinDigits(v.trim()) : null);
const fa = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : toFaDigits(String(v)));

function fromUser(u: UserDetail, roleId: string): UserFormValues {
  const id = u.identity; const a = u.addresses?.[0]; const b = u.bank_accounts?.[0];
  return {
    ...emptyUserForm('edit'),
    first_name: u.first_name ?? '', last_name: u.last_name ?? '', national_id: fa(u.national_id),
    birth_certificate_no: fa(id?.birth_certificate_no), issue_place: id?.issue_place ?? '', father_name: id?.father_name ?? '',
    birth_date: id?.birth_date ? gregorianToJalaliText(id.birth_date) : '', gender: id?.gender ?? '', marital_status: id?.marital_status ?? '',
    children_count: fa(id?.children_count ?? 0), educational_qualification: id?.educational_qualification ?? '', social_security_no: fa(id?.social_security_no),
    province: a?.province ?? '', city: a?.city ?? '', full_address: a?.full_address ?? '', postal_code: fa(a?.postal_code), phone: fa(a?.phone),
    email: u.email ?? '', mobile_1: fa(a?.mobile_1), mobile_2: fa(a?.mobile_2),
    next_of_kin: [...(u.next_of_kin ?? []).map((k) => ({ full_name: k.full_name, relation: k.relation, phone: fa(k.phone), address: k.address ?? '' })), emptyKin(), emptyKin()].slice(0, Math.max(2, u.next_of_kin?.length ?? 0)),
    bank_name: b?.bank_name ?? '', account_no: fa(b?.account_no), card_no: formatCard(b?.card_no ?? ''), iban: formatIban(b?.iban ?? ''),
    primary_branch_id: u.primary_branch_id ?? '', direct_manager_id: u.direct_manager_id ?? '', job_title: u.job_title ?? '', job_description: u.job_description ?? '',
    has_commission_contract: !!u.has_commission_contract, commission_percent: u.has_commission_contract ? fa(u.commission_percent) : '',
    account_description: u.account_description ?? '', user_type: u.user_type,
    // تب ۶ (امنیت و نقش) مثل فرم افزودن
    phone_number: fa(u.phone_number), username: u.username ?? '', status: u.status, role_id: roleId,
    department_id: u.departments?.[0]?.id ?? '',
  };
}

export default function UserFormPage() {
  const { id } = useParams();
  const mode: 'create' | 'edit' = id ? 'edit' : 'create';
  const existing = useUser(id);
  const asg = useAssignments({ user_id: id }, mode === 'edit');
  if (mode === 'edit' && (existing.isLoading || asg.isLoading)) return <SkeletonRows rows={6} />;
  if (mode === 'edit' && (existing.error || !existing.data)) return <ErrorBox error={existing.error} onRetry={() => existing.refetch()} />;
  const active = (asg.data ?? []).filter((a) => a.is_active);
  return (
    <UserForm key={id ?? 'new'} mode={mode} userId={id} existing={existing.data} assignmentIds={active.map((a) => a.id)}
      initial={mode === 'edit' && existing.data ? fromUser(existing.data, active[0]?.role_id ?? '') : emptyUserForm('create')} />
  );
}

function UserForm({ mode, initial, userId, existing, assignmentIds = [] }: { mode: 'create' | 'edit'; initial: UserFormValues; userId?: string; existing?: UserDetail; assignmentIds?: string[] }) {
  const navigate = useNavigate();
  const back = useBack(mode === 'edit' ? `/identity/users/${userId}` : '/identity/users');
  const toast = useToast();
  const can = usePerm();
  const { user: me } = useAuth();
  // تب‌ها و فیلدهای ویرایش = فرم افزودن (۶ تب)
  const steps = STEPS;
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<number[]>(mode === 'edit' ? [0, 1, 2, 3, 4, 5] : []);
  const qc = useQueryClient();
  const userDepts = useUserDepartments(userId ?? '', mode === 'edit');
  const isSelf = mode === 'edit' && me?.id === userId;
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateStaff();
  const update = useUpdateUser(userId ?? '');
  const form = useForm<UserFormValues>({ resolver: zodResolver(userFormSchema), defaultValues: initial, mode: 'onTouched' });
  const { register, handleSubmit, trigger, watch, setValue, setError, control, formState: { errors } } = form;
  const kin = useFieldArray({ control, name: 'next_of_kin' });
  const branches = useBranchOptions();
  const staff = useAllStaff();
  const depts = useDepartmentPicker();
  const roles = useAllRoles();
  const docs = watch('documents');
  const hasCommission = watch('has_commission_contract');
  const e = (k: keyof UserFormValues) => (errors as FieldErrors<Record<string, unknown>>)[k]?.message as string | undefined;
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);
  // مجرد ⇐ تعداد فرزند خاموش و ۰
  const single = watch('marital_status') === 'SINGLE';
  useEffect(() => { if (single) setValue('children_count', '۰', { shouldValidate: true }); }, [single, setValue]);
  // موبایل ورود فقط از موبایل‌های تب «آدرس و تماس»
  const [m1, m2, loginMobile] = watch(['mobile_1', 'mobile_2', 'phone_number']);
  const mobileOptions = [...new Set([m1, m2].map((m) => toLatinDigits(m ?? '').trim()).filter((m) => /^09[0-9]{9}$/.test(m)))].map((m) => ({ value: m, label: toFaDigits(m) }));
  useEffect(() => {
    if (mode === 'create' && step === 5 && mobileOptions.length && !mobileOptions.some((o) => o.value === toLatinDigits(loginMobile ?? ''))) setValue('phone_number', mobileOptions[0]!.value);
  }, [step, mobileOptions, loginMobile, setValue]);

  const goto = async (to: number) => {
    if (to > step) {
      const ok = await trigger(STEP_FIELDS[step] as (keyof UserFormValues)[]);
      if (!ok) return;
      if (step === 4 && mode === 'create') {
        const missing = DOC_SLOTS.filter((d) => d.required && !docs[d.slot]);
        if (missing.length) { setFormError(`مدارک الزامی بارگذاری نشده: ${missing.map((m) => m.label).join('، ')}`); return; }
      }
      setDone((d) => Array.from(new Set([...d, step])));
    }
    setFormError(null);
    setStep(to);
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const common = {
      first_name: v.first_name.trim(), last_name: v.last_name.trim(), national_id: clean(v.national_id),
      birth_certificate_no: clean(v.birth_certificate_no), issue_place: v.issue_place.trim(), father_name: v.father_name.trim(),
      birth_date: jalaliTextToGregorian(v.birth_date)!, gender: v.gender, marital_status: v.marital_status,
      children_count: Number(clean(v.children_count)), educational_qualification: v.educational_qualification, social_security_no: n(v.social_security_no),
      province: v.province.trim(), city: v.city.trim(), full_address: v.full_address.trim(), postal_code: clean(v.postal_code), phone: clean(v.phone),
      email: t(v.email), mobile_1: n(v.mobile_1), mobile_2: n(v.mobile_2),
      next_of_kin: v.next_of_kin.map((k) => ({ full_name: k.full_name.trim(), relation: k.relation.trim(), phone: clean(k.phone), address: t(k.address) })),
      account_no: clean(v.account_no), bank_name: v.bank_name.trim(), iban: clean(v.iban).toUpperCase().replace(/\s/g, ''), card_no: clean(v.card_no).replace(/[\s-]/g, ''),
      primary_branch_id: v.primary_branch_id || null, direct_manager_id: v.direct_manager_id || null,
      job_title: t(v.job_title), job_description: t(v.job_description), account_description: t(v.account_description),
      has_commission_contract: v.has_commission_contract,
      // بک‌اند commission_percent=null را رد می‌کند (422) ⇐ بدون قرارداد، کلید فرستاده نمی‌شود
      commission_percent: v.has_commission_contract ? Number(clean(v.commission_percent)) : undefined,
    };
    try {
      if (mode === 'create') {
        const body = {
          ...common, phone_number: clean(v.phone_number), username: t(v.username), password: v.password, user_type: v.user_type,
          role_id: v.role_id, status: v.status, department_id: v.department_id || null,
          documents: Object.entries(v.documents).map(([slot, d]) => ({ slot, file: d.file })),
        } as unknown as StaffRegister;
        const u = await create.mutateAsync(body);
        toast('کاربر با موفقیت ثبت شد.');
        navigate(`/identity/users/${u.id}`, { replace: true });
      } else {
        await update.mutateAsync({ ...common, user_type: v.user_type || undefined } as unknown as UserUpdate);
        // نقش، وضعیت و دپارتمان endpoint جدا دارند (همان قواعد صفحه‌ی کاربر)
        if (v.role_id && v.role_id !== initial.role_id) {
          for (const aid of assignmentIds) await adminApi(`/rbac/roles/assignments/${aid}`, { method: 'DELETE' });
          await adminApi('/rbac/roles/assignments', { method: 'POST', body: { user_id: userId, role_id: v.role_id } });
        }
        if (!isSelf && v.status && v.status !== initial.status) {
          await adminApi(`/auth/users/${userId}/status`, { method: 'PUT', query: { status: v.status } });
        }
        if (v.department_id !== initial.department_id && userDepts.data) {
          await adminApi(`/auth/users/${userId}/departments`, {
            method: 'PUT',
            body: { department_ids: v.department_id ? [v.department_id] : [], expected_department_ids: userDepts.data.departments.map((d) => d.id), expected_version: userDepts.data.department_version },
          });
        }
        await qc.invalidateQueries();
        toast('اطلاعات کاربر ذخیره شد.');
        navigate(`/identity/users/${userId}`, { replace: true });
      }
    } catch (err) {
      const all = STEP_FIELDS.flat() as string[];
      const rest = applyServerErrors(err, setError, all);
      const firstBad = STEP_FIELDS.findIndex((fs) => fs.some((f) => form.getFieldState(f).error));
      if (firstBad >= 0 && firstBad < steps.length) setStep(firstBad);
      setFormError(rest.length ? rest.join(' ') : firstBad >= 0 ? 'برخی فیلدها نیاز به اصلاح دارند.' : userMessage(err));
    }
  }, () => {
    const firstBad = STEP_FIELDS.findIndex((fs) => fs.some((f) => form.getFieldState(f).error));
    if (firstBad >= 0) setStep(firstBad);
  });

  const upload = async (slot: string, file: File | undefined) => {
    if (!file) return;
    try {
      const r = await uploadStaffDocument(file, slot);
      setValue('documents', { ...docs, [slot]: { file: r.file, name: file.name } }, { shouldDirty: true });
      setFormError(null);
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  const last = step === steps.length - 1;
  return (
    <>
      <PageHead back={back} title={mode === 'create' ? 'افزودن کاربر' : 'ویرایش کاربر'} />
      <Card pad={false}>
        <div className={s.steps} role="tablist">
          {steps.map((label, i) => (
            <button key={label} type="button" role="tab" aria-selected={i === step} className={`${s.step} ${i === step ? s.stepOn : ''} ${done.includes(i) ? s.stepDone : ''}`}
              onClick={() => (i <= step || done.includes(i - 1) ? goto(i) : undefined)}>
              <span className={s.num}>{done.includes(i) && i !== step ? <IconCheck size={13} /> : (i + 1).toLocaleString('fa-IR')}</span>{label}
            </button>
          ))}
        </div>
        <form className={s.body} onSubmit={(ev) => ev.preventDefault()} noValidate>
          {formError ? <div style={{ marginBottom: 16 }}><Alert>{formError}</Alert></div> : null}
          {step === 0 ? (
            <FormGrid cols={4}>
              <Input label="نام" required {...register('first_name')} error={e('first_name')} placeholder="نام" />
              <Input label="نام خانوادگی" required {...register('last_name')} error={e('last_name')} placeholder="نام خانوادگی" />
              <Input label="کد ملی" required {...register('national_id')} error={e('national_id')} placeholder="کد ملی ۱۰ رقمی" inputMode="numeric" dir="ltr" />
              <Input label="شماره شناسنامه" required {...register('birth_certificate_no')} error={e('birth_certificate_no')} placeholder="شماره شناسنامه" />
              <Input label="محل صدور" required {...register('issue_place')} error={e('issue_place')} placeholder="محل صدور" />
              <Input label="نام پدر" required {...register('father_name')} error={e('father_name')} placeholder="نام پدر" />
              <JalaliDateInput label="تاریخ تولد" required {...register('birth_date')} error={e('birth_date')} placeholder="۱۳۷۰/۰۱/۰۱" dir="ltr" />
              <Select label="جنسیت" required {...register('gender')} error={e('gender')} placeholder="انتخاب جنسیت" options={GENDER} />
              <Select label="وضعیت تأهل" required {...register('marital_status')} error={e('marital_status')} placeholder="انتخاب وضعیت تأهل" options={MARITAL} />
              <Input label="تعداد فرزند" required {...register('children_count')} error={e('children_count')} inputMode="numeric" readOnly={single} aria-disabled={single || undefined} hint={single ? 'برای مجرد ۰ ثبت می‌شود.' : undefined} />
              <Select label="آخرین مدرک تحصیلی" required {...register('educational_qualification')} error={e('educational_qualification')} placeholder="انتخاب مدرک" options={EDUCATION} />
              <Input label="شماره بیمه تأمین اجتماعی" {...register('social_security_no')} error={e('social_security_no')} placeholder="شماره بیمه" />
            </FormGrid>
          ) : null}
          {step === 1 ? (
            <>
              <FormGrid cols={4}>
                <Input label="استان" required {...register('province')} error={e('province')} />
                <Input label="شهر" required {...register('city')} error={e('city')} />
                <Input label="کد پستی" required {...register('postal_code')} error={e('postal_code')} placeholder="۱۰ رقم" inputMode="numeric" dir="ltr" />
                <Input label="تلفن ثابت" required {...register('phone')} error={e('phone')} dir="ltr" />
                <Textarea label="آدرس کامل" required span={4} {...register('full_address')} error={e('full_address')} />
                <Input label="ایمیل" type="email" latin {...register('email')} error={e('email')} dir="ltr" placeholder="name@example.com" />
                <Input label="موبایل شخصی ۱" required {...register('mobile_1')} format={formatMobileInput} error={e('mobile_1')} dir="ltr" placeholder="۰۹xxxxxxxxx" inputMode="numeric" />
                <Input label="موبایل شخصی ۲" {...register('mobile_2')} format={formatMobileInput} error={e('mobile_2')} dir="ltr" placeholder="۰۹xxxxxxxxx" inputMode="numeric" />
              </FormGrid>
              <div className={s.subhead}>
                <span>بستگان (حداقل ۲ نفر) <span className={s.req}>*</span></span>
                {kin.fields.length < 2 ? <Button type="button" variant="secondary" icon={<IconPlus size={16} />} onClick={() => kin.append(emptyKin())}>افزودن</Button> : null}
              </div>
              {kin.fields.map((f, i) => (
                <div key={f.id} className={s.kinRow}>
                  <FormGrid cols={4}>
                    <Input label="نام و نام خانوادگی" required {...register(`next_of_kin.${i}.full_name`)} error={errors.next_of_kin?.[i]?.full_name?.message} />
                    <Input label="نسبت" required {...register(`next_of_kin.${i}.relation`)} error={errors.next_of_kin?.[i]?.relation?.message} />
                    <Input label="موبایل" required {...register(`next_of_kin.${i}.phone`)} format={formatMobileInput} error={errors.next_of_kin?.[i]?.phone?.message} dir="ltr" placeholder="۰۹xxxxxxxxx" inputMode="numeric" />
                    <Input label="آدرس" {...register(`next_of_kin.${i}.address`)} />
                  </FormGrid>
                  {kin.fields.length > 2 ? <button type="button" className={s.remove} onClick={() => kin.remove(i)} aria-label="حذف"><IconTrash size={17} /></button> : null}
                </div>
              ))}
            </>
          ) : null}
          {step === 2 ? (
            <FormGrid cols={4}>
              <Input label="نام بانک" required {...register('bank_name')} error={e('bank_name')} />
              <Input label="شماره حساب" required {...register('account_no')} error={e('account_no')} dir="ltr" />
              <Input label="شماره کارت" required {...register('card_no')} error={e('card_no')} dir="ltr" placeholder="۶۱۰۴ ۰۰۰۰ ۰۰۰۰ ۰۰۰۰" format={formatCard} inputMode="numeric" maxLength={19} />
              <Input label="شماره شبا" required span={2} {...register('iban')} error={e('iban')} dir="ltr" placeholder="IR ۰۰۰۰ ۰۰۰۰ ۰۰۰۰ ۰۰۰۰ ۰۰۰۰ ۰۰۰۰" format={formatIban} maxLength={32} />
            </FormGrid>
          ) : null}
          {step === 3 ? (
            <FormGrid cols={4}>
              <Select label="دپارتمان" {...register('department_id')} disabled={mode === 'edit' && !can('identity.users.department.update')} placeholder={depts.isLoading ? 'در حال دریافت…' : 'بدون دپارتمان'} options={(depts.data ?? []).filter((d) => d.is_active).map((d) => ({ value: d.id, label: d.name }))} />
              <Select label="شعبه‌ی اصلی" {...register('primary_branch_id')} hint={branches.canList ? undefined : 'فهرست شعب برای حساب شما در دسترس نیست.'} disabled={!branches.canList}
                placeholder="بدون شعبه‌ی اصلی" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
              <Select label="مدیر مستقیم" {...register('direct_manager_id')} placeholder="بدون مدیر مستقیم"
                options={(staff.data ?? []).filter((x) => x.id !== userId).map((x) => ({ value: x.id, label: [x.first_name, x.last_name].filter(Boolean).join(' ') || x.username || x.phone_number }))} />
              <Input label="عنوان شغلی" {...register('job_title')} />
              <Textarea label="شرح شغل" span={2} {...register('job_description')} />
              <Textarea label="توضیحات حساب" span={2} {...register('account_description')} />
              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 16 }}>
                <Toggle checked={hasCommission} onChange={(v) => setValue('has_commission_contract', v, { shouldDirty: true })} label="قرارداد فروش درصدی" />
              </div>
              {hasCommission ? <Input label="درصد پورسانت" required {...register('commission_percent')} error={e('commission_percent')} inputMode="decimal" dir="ltr" /> : null}
            </FormGrid>
          ) : null}
          {step === 4 && mode === 'create' ? (
            <div className={s.docs}>
              {can('identity.users.documents.create') ? null : <Alert>برای بارگذاری مدارک مجوز ندارید؛ ثبت کاربر بدون مدارک الزامی ممکن نیست.</Alert>}
              {DOC_SLOTS.map((d) => (
                <label key={d.slot} className={`${s.doc} ${docs[d.slot] ? s.docOk : ''}`}>
                  <span className={s.docIcon}>{docs[d.slot] ? <IconCheck size={18} /> : <IconUpload size={18} />}</span>
                  <span className={s.docText}>
                    <span className={s.docName}>{d.label}{d.required ? <span className={s.req}> *</span> : null}</span>
                    <span className={s.docFile}>{docs[d.slot]?.name ?? 'انتخاب فایل'}</span>
                  </span>
                  <input type="file" accept="image/*,application/pdf" disabled={!can('identity.users.documents.create')} onChange={(ev) => upload(d.slot, ev.target.files?.[0])} />
                </label>
              ))}
            </div>
          ) : null}
          {step === 4 && mode === 'edit' && existing ? (
            <>
              <Alert tone="info">مدارکی که هنگام تعریف کاربر بارگذاری شده‌اند. بک‌اند هنوز افزودن یا جایگزینی مدرک برای کاربر ثبت‌شده را پشتیبانی نمی‌کند.</Alert>
              <div style={{ marginTop: 14 }}><DocsSection u={existing} /></div>
            </>
          ) : null}
          {step === 5 && mode === 'edit' ? (
            <>
              <FormGrid cols={3}>
                <Input label="موبایل ورود" readOnly {...register('phone_number')} dir="ltr" hint="از این فرم قابل تغییر نیست." />
                <Input label="نام کاربری" latin readOnly {...register('username')} dir="ltr" hint="از این فرم قابل تغییر نیست." />
                <Select label="نوع کاربر" required {...register('user_type')} error={e('user_type')}
                  options={[{ value: 'STAFF', label: 'کارمند' }, ...(me?.is_superuser || initial.user_type === 'SUPERADMIN' ? [{ value: 'SUPERADMIN', label: 'سوپرادمین' }] : [])]} />
                <Select label="نقش" {...register('role_id')} error={e('role_id')} disabled={!can('rbac.roles.assignments.create')} placeholder={roles.isLoading ? 'در حال دریافت…' : 'بدون نقش'}
                  options={(roles.data ?? []).filter((r) => r.is_active || r.id === initial.role_id).map((r) => ({ value: r.id, label: r.name }))} />
                <Select label="وضعیت" required {...register('status')} error={e('status')} disabled={isSelf} hint={isSelf ? 'وضعیت حساب خودتان را نمی‌توانید تغییر دهید.' : undefined}
                  options={Object.entries(USER_STATUS).map(([value, x]) => ({ value, label: x.label }))} />
              </FormGrid>
              {existing ? <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}><SecurityTab u={existing} only="password" /><BranchMasterSection u={existing} /></div> : null}
            </>
          ) : null}
          {step === 5 && mode === 'create' ? (
            <FormGrid cols={3}>
              <Select label="موبایل ورود" required {...register('phone_number')} error={e('phone_number')} placeholder={mobileOptions.length ? undefined : 'ابتدا موبایل شخصی را در تب «آدرس و تماس» وارد کنید'} options={mobileOptions} hint="یکی از موبایل‌های شخصی همین کاربر" />
              <Input label="نام کاربری" latin {...register('username')} error={e('username')} dir="ltr" autoComplete="off" />
              <Input label="رمز عبور اولیه" required type="password" {...register('password')} error={e('password')} dir="ltr" autoComplete="new-password" />
              <Select label="نوع کاربر" required {...register('user_type')} error={e('user_type')}
                options={[{ value: 'STAFF', label: 'کارمند' }, ...(me?.is_superuser ? [{ value: 'SUPERADMIN', label: 'سوپرادمین' }] : [])]} />
              <Select label="نقش" required {...register('role_id')} error={e('role_id')} placeholder={roles.isLoading ? 'در حال دریافت…' : 'انتخاب نقش'}
                options={(roles.data ?? []).filter((r) => r.is_active).map((r) => ({ value: r.id, label: r.name }))} />
              <Select label="وضعیت" required {...register('status')} error={e('status')} options={Object.entries(USER_STATUS).map(([value, x]) => ({ value, label: x.label }))} />
            </FormGrid>
          ) : null}

          <div className={s.foot}>
            {last || mode === 'edit' ? (
              <Button key="submit" type="button" onClick={() => onSubmit()} loading={create.isPending || update.isPending} loadingText="در حال ذخیره…" icon={<IconCheck size={17} />}>
                {mode === 'create' ? 'ثبت کاربر' : 'ذخیره‌ی تغییرات'}
              </Button>
            ) : null}
            {!last ? (
              <Button key="next" type="button" variant={mode === 'edit' ? 'secondary' : 'primary'} onClick={() => goto(step + 1)} icon={<IconChevronLeft size={17} />}>مرحله بعد: {steps[step + 1]}</Button>
            ) : null}
            {step > 0 ? <Button type="button" variant="secondary" icon={<IconChevronRight size={17} />} onClick={() => goto(step - 1)}>مرحله قبل</Button> : null}
            <Button type="button" variant="ghost" onClick={back}>انصراف</Button>
            <span className={s.counter}>مرحله {(step + 1).toLocaleString('fa-IR')} از {steps.length.toLocaleString('fa-IR')}</span>
          </div>
        </form>
      </Card>
    </>
  );
}
