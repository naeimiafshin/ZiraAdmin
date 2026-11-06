import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useBack } from '@/shared/lib/useBack';
import { useForm } from 'react-hook-form';
import { IconCheck, IconEdit, IconExternalLink, IconX } from '@tabler/icons-react';
import { applyServerErrors } from '@/shared/api/formErrors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime } from '@/shared/lib/format';
import { toFaDigits } from '@/shared/lib/text';
import { clean } from '@/shared/lib/validate';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select, Textarea } from '@/shared/ui/form';
import { Badge, Card, ErrorBox, InfoBanner, KeyValue, Modal, PageHead, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useRegistration, useRegistrationWrite, type RegistrationDetail, type RegistrationUpdate } from '../api';
import { ReasonModal, TierText, rial } from '../components';
import { CUSTOMER_TYPE, GENDER, IMAGE_LEVEL, LICENSE_INQUIRY, REG_SOURCE, REG_STATUS } from '../labels';
import { DocumentsPanel } from '../tabs/DocumentsTab';
import { normPhone, optMobile, optPhone } from '../phone';
import s from '../customers.module.css';

const kv = (label: string, v: React.ReactNode, ltr = false) => <KeyValue label={label} ltr={ltr}>{v}</KeyValue>;
const str = (d: Record<string, unknown>, k: string): string => { const v = d[k]; return v === null || v === undefined || v === '' ? '' : String(v); };

/** بررسی درخواست ثبت‌نام — GET/PATCH /registration-requests/{id}، approve / reject؛ مدارک از /documents درخواست */
export default function RegistrationReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const back = useBack('/customers/registration-requests');
  const can = usePerm();
  const toast = useToast();
  const q = useRegistration(id);
  const w = useRegistrationWrite(id);
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState(false);
  if (q.isLoading) return <SkeletonRows rows={5} height={90} />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  const d = r.submitted_data ?? {};
  const st = REG_STATUS[r.status] ?? { label: r.status_display, tone: 'neutral' as const };
  const pending = r.status === 'PENDING';
  const canDecide = can('customers.registration_requests.approve');
  const guarantees = Array.isArray(d.guarantees) ? (d.guarantees as Record<string, unknown>[]) : [];
  const hasNotes = ['marketer_name', 'marketer_percent', 'cheque_credit', 'golden_credit', 'cheque_max_due_months', 'cooperation_level', 'image_access_level'].some((k) => str(d, k)) || guarantees.length > 0;

  return (
    <>
      <PageHead back={back}
        actions={<>
          {pending && can('customers.registration_requests.update') ? <Button variant="secondary" icon={<IconEdit size={16} />} onClick={() => setEditing(true)}>اصلاح درخواست</Button> : null}
          {r.customer_id && can('customers.profiles.read') ? <Button variant="secondary" icon={<IconExternalLink size={16} />} onClick={() => navigate(`/customers/profiles/${r.customer_id}`)}>پرونده‌ی مشتری</Button> : null}
        </>} />
      <div className={s.reviewHead}>
        <h2 className="ltr">{r.request_no}</h2>
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge tone={r.source === 'ADMIN' ? 'info' : 'neutral'}>منبع: {REG_SOURCE[r.source] ?? r.source_display}</Badge>
        <span className={s.muted}>ثبت: {faDateTime(r.created_at)}</span>
        {r.reviewed_at ? <span className={s.muted}>بررسی: {r.reviewed_by_name ?? '—'} — {faDateTime(r.reviewed_at)}</span> : null}
      </div>
      {r.status === 'REJECTED' && r.rejection_reason ? <InfoBanner tone="warning">دلیل رد: {r.rejection_reason}</InfoBanner> : null}

      <div className={s.grid2}>
        <div className={s.stack}>
          <Card>
            <SectionTitle>اطلاعات متقاضی</SectionTitle>
            <div className={s.kvGrid3}>
              {kv('نام و نام خانوادگی', r.full_name)}{kv('جنسیت', str(d, 'gender') ? GENDER[str(d, 'gender')] ?? str(d, 'gender') : null)}{kv('کد ملی', r.national_id)}
              {kv('موبایل ۱', r.mobile)}{kv('موبایل ۲', str(d, 'mobile_2'))}{kv('تلفن ثابت', str(d, 'phone'))}
              {kv('نام معرف', str(d, 'referrer_name'))}{kv('تلفن معرف', str(d, 'referrer_phone'))}{kv('شماره پروانه کسب', str(d, 'business_license_no'))}
              {kv('نام کاربری درخواستی', str(d, 'username'), true)}
            </div>
            <div style={{ marginTop: 16 }}>{kv('آدرس', [str(d, 'province'), str(d, 'city'), str(d, 'address')].filter(Boolean).join('، ') + (str(d, 'postal_code') ? ` — کد پستی ${toFaDigits(str(d, 'postal_code'))}` : ''))}</div>
          </Card>
          <Card>
            <SectionTitle>فروشگاه و کسب‌وکار</SectionTitle>
            <div className={s.kvGrid3}>
              {kv('نام فروشگاه', r.customer_store_name || str(d, 'store_name'))}{kv('نام مدیر / مسئول', str(d, 'manager_name'))}{kv('نوع مشتری', CUSTOMER_TYPE[str(d, 'customer_type')] ?? str(d, 'customer_type'))}
              {kv('صنف', str(d, 'guild'))}{kv('کد اقتصادی', str(d, 'economic_code'))}{kv('استعلام پروانه', str(d, 'license_inquiry_status') ? LICENSE_INQUIRY[str(d, 'license_inquiry_status')]?.label : null)}
            </div>
            {str(d, 'description') ? <div style={{ marginTop: 16 }}>{kv('توضیحات', str(d, 'description'))}</div> : null}
          </Card>
          <Card><DocumentsPanel customerId={r.customer_id ?? null} requestId={r.id} title="مدارک متقاضی" /></Card>
        </div>
        <div className={s.stack}>
          <Card>
            <SectionTitle>تصمیم</SectionTitle>
            {pending ? (
              <>
                <p className={s.sub} style={{ marginBottom: 12 }}>با تأیید، پرونده فعال می‌شود و مشتری با اولین ورود پیامکی به پنل خودش دسترسی می‌گیرد. رد کردن دلیل لازم دارد و مشتری می‌تواند دوباره درخواست بدهد.</p>
                {canDecide ? (
                  <div className={s.decision}>
                    <Button icon={<IconCheck size={17} />} onClick={() => setApproving(true)} block>تأیید و ارسال به لیست مشتریان</Button>
                    <Button variant="danger" icon={<IconX size={17} />} onClick={() => setRejecting(true)} block>عدم تأیید درخواست</Button>
                  </div>
                ) : <Alert tone="info">برای تأیید یا رد به مجوز «تأیید درخواست ثبت‌نام» نیاز دارید.</Alert>}
              </>
            ) : <InfoBanner>این درخواست قبلاً {st.label.replace('شده', ' شده')} است و تصمیم آن نهایی است.</InfoBanner>}
          </Card>
          <Card>
            <SectionTitle>یادداشت‌های کارشناس برای بررسی</SectionTitle>
            <p className={s.sub} style={{ marginBottom: 12 }}><b>سطح همکاری و سطح تصاویر با تأیید درخواست روی پرونده اعمال می‌شوند</b> (به مجوز تغییر این سطح‌ها نیاز دارد). بازاریاب، اعتبار و ضمانت فقط یادداشت‌اند (نام کاربری درخواستی در کارت «اطلاعات متقاضی» است)؛ بعد از تأیید از صفحه‌ی پرونده تخصیص دهید.</p>
            {!hasNotes ? <p className={s.sub}>یادداشتی ثبت نشده است.</p> : (
              <div className={s.kvGrid}>
                {kv('بازاریاب پیشنهادی', str(d, 'marketer_name') || str(d, 'marketer_percent') ? `${str(d, 'marketer_name') || 'انتخاب نشده'}${str(d, 'marketer_percent') ? ` — ${toFaDigits(String(Number(str(d, 'marketer_percent'))))}٪` : ''}` : null)}
                {kv('اعتبار چکی', str(d, 'cheque_credit') ? rial(str(d, 'cheque_credit')) : null)}
                {kv('راس چک (ماه)', str(d, 'cheque_max_due_months') ? toFaDigits(str(d, 'cheque_max_due_months')) : null)}
                {kv('اعتبار طلایی', str(d, 'golden_credit') ? rial(str(d, 'golden_credit')) : null)}
                {kv('افزایش پله‌ای', d.stepwise_increase === undefined || d.stepwise_increase === null ? null : d.stepwise_increase ? 'روشن' : 'خاموش')}
                {kv('سطح همکاری پیشنهادی', str(d, 'cooperation_level') ? <TierText level={str(d, 'cooperation_level')} /> : null)}
                {kv('سطح تصاویر پیشنهادی', str(d, 'image_access_level') ? IMAGE_LEVEL[str(d, 'image_access_level')]?.label ?? str(d, 'image_access_level') : null)}
              </div>
            )}
            {guarantees.length ? (
              <>
                <div className={s.subhead} style={{ fontSize: 13 }}>ضمانت‌های پیشنهادی</div>
                <div className={s.list}>
                  {guarantees.map((g, i) => (
                    <div key={i} className={s.listRow}>
                      <div>
                        <div className={s.strong}>{str(g, 'type') === 'promissory_note' ? 'سفته' : 'چک شخصی'} {str(g, 'amount') ? `— ${rial(str(g, 'amount'))}` : ''} <span className={s.muted}>({str(g, 'credit')})</span></div>
                        <div className={s.sub}>{[str(g, 'cheque_no') || str(g, 'serial'), str(g, 'bank'), str(g, 'branch'), str(g, 'owner'), str(g, 'guarantor'), str(g, 'guarantor_nid'), str(g, 'due')].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </Card>
        </div>
      </div>

      <ReasonModal open={approving} onClose={() => setApproving(false)} busy={w.approve.isPending} title="تأیید درخواست ثبت‌نام" noReason confirmText="تأیید درخواست"
        intro={<>درخواست {toFaDigits(r.request_no)} تأیید و پرونده‌ی «{r.full_name ?? ''}» فعال می‌شود.{str(d, 'gender') ? <> جنسیت درخواست روی حساب کاربر ثبت می‌شود؛ اگر حساب جنسیت دیگری داشته باشد تأیید رد می‌شود (۴۰۹) — اول جنسیت را در «اصلاح درخواست» یا پرونده‌ی هویتی هماهنگ کنید.</> : null}</>}
        onConfirm={async () => { await w.approve.mutateAsync(); toast('درخواست تأیید شد؛ مشتری به لیست مشتریان افزوده شد.'); setApproving(false); }} />
      <ReasonModal open={rejecting} onClose={() => setRejecting(false)} danger busy={w.reject.isPending} title="رد درخواست ثبت‌نام" label="دلیل رد" confirmText="رد درخواست"
        intro="دلیل رد برای مشتری قابل مشاهده است و او می‌تواند با اصلاح، دوباره درخواست بدهد."
        onConfirm={async (reason) => { await w.reject.mutateAsync(reason); toast('درخواست رد شد.'); setRejecting(false); }} />
      {editing ? <EditRequestModal r={r} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

type EditForm = { gender: string; store_name: string; manager_name: string; economic_code: string; guild: string; business_license_no: string; license_inquiry_status: string; phone: string; mobile_2: string; referrer_name: string; customer_type: string; description: string };
/**
 * اصلاح درخواست در انتظار (PATCH؛ فقط فیلدهای تغییرکرده).
 * expected_version = نسخه‌ی پرونده‌ی مشتری که در خود خروجی درخواست آمده (customer_version، G-03).
 */
function EditRequestModal({ r, onClose }: { r: RegistrationDetail; onClose: () => void }) {
  const toast = useToast();
  const w = useRegistrationWrite(r.id);
  const d = r.submitted_data ?? {};
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, dirtyFields } } = useForm<EditForm>({
    defaultValues: { gender: ['MALE', 'FEMALE', 'OTHER'].includes(str(d, 'gender')) ? str(d, 'gender') : '', store_name: r.customer_store_name ?? str(d, 'store_name'), manager_name: str(d, 'manager_name'), economic_code: str(d, 'economic_code'), guild: str(d, 'guild'), business_license_no: str(d, 'business_license_no'), license_inquiry_status: str(d, 'license_inquiry_status') || 'NOT_CHECKED', phone: str(d, 'phone'), mobile_2: str(d, 'mobile_2'), referrer_name: str(d, 'referrer_name'), customer_type: str(d, 'customer_type') || 'WHOLESALE', description: str(d, 'description') },
  });
  const e = (k: keyof EditForm) => errors[k]?.message as string | undefined;
  const submit = handleSubmit(async (v) => {
    const body: Record<string, unknown> = {};
    (Object.keys(dirtyFields) as (keyof EditForm)[]).forEach((k) => { body[k] = k === 'gender' ? (v.gender || null) : k === 'phone' || k === 'mobile_2' ? (v[k].trim() ? normPhone(v[k]) : '') : clean(String(v[k] ?? '')); });
    if (!Object.keys(body).length) { setErr('تغییری برای ذخیره وجود ندارد.'); return; }
    try { await w.update.mutateAsync({ ...body, expected_version: r.customer_version } as RegistrationUpdate); toast('درخواست اصلاح شد.'); onClose(); }
    catch (ex) { const rest = applyServerErrors(ex, setError, Object.keys(v)); setErr(rest.join(' ') || 'برخی فیلدها نیاز به اصلاح دارند.'); }
  });
  return (
    <Modal open onClose={onClose} title="اصلاح درخواست ثبت‌نام" width={760}
      footer={<><Button onClick={() => submit()} loading={w.update.isPending}>ذخیره‌ی تغییرات</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={3}>
        <Select label="جنسیت" {...register('gender')} placeholder="تعیین‌نشده" options={['MALE', 'FEMALE', 'OTHER'].map((value) => ({ value, label: GENDER[value]! }))} hint="هنگام تأیید روی حساب کاربر ثبت می‌شود." />
        <Input label="نام فروشگاه" {...register('store_name')} error={e('store_name')} />
        <Input label="نام مدیر / مسئول" {...register('manager_name')} />
        <Select label="نوع مشتری" {...register('customer_type')} options={Object.entries(CUSTOMER_TYPE).map(([value, label]) => ({ value, label }))} />
        <Input label="تلفن ثابت" {...register('phone', { validate: optPhone })} error={e('phone')} dir="ltr" inputMode="tel" />
        <Input label="موبایل ۲" {...register('mobile_2', { validate: optMobile })} error={e('mobile_2')} dir="ltr" />
        <Input label="نام معرف" {...register('referrer_name')} />
        <Input label="صنف" {...register('guild')} />
        <Input label="کد اقتصادی" {...register('economic_code')} dir="ltr" />
        <Input label="شماره پروانه کسب" {...register('business_license_no')} dir="ltr" />
        <Select label="وضعیت استعلام پروانه" {...register('license_inquiry_status')} options={Object.entries(LICENSE_INQUIRY).map(([value, v]) => ({ value, label: v.label }))} />
        <Textarea label="توضیحات" span={2} {...register('description')} rows={2} />
      </FormGrid>
    </Modal>
  );
}
