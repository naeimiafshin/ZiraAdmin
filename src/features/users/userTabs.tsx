import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconCopy, IconDownload, IconKey, IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum, formatCard, formatIban, gregorianToJalaliText } from '@/shared/lib/format';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/form';
import { Badge, Card, Chip, Empty, ErrorBox, InfoBanner, KeyValue, Modal, Pagination, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import {
  openUserDocument, useAllRoles, useAllStaff, useAssignments, useDepartmentPicker, useResetPassword, useRevokeSession,
  useSetStatus, useUserDepartments, useUserSessions, type UserDetail,
} from './api';
import { DEVICE, DOC_SLOTS, EDUCATION, GENDER, labelOf, MARITAL, SESSION_STATUS, USER_STATUS, USER_TYPE } from './labels';
import s from './users.module.css';

const kv = (label: string, v: React.ReactNode, ltr = false) => <KeyValue label={label} ltr={ltr}>{v}</KeyValue>;

/** ۱. اطلاعات هویتی — همان فیلدها و ترتیب فرم افزودن کاربر */
export function IdentitySection({ u }: { u: UserDetail }) {
  const id = u.identity;
  return (
    <Card>
      <SectionTitle>اطلاعات هویتی</SectionTitle>
      <div className={s.kvGrid}>
        {kv('نام', u.first_name)}{kv('نام خانوادگی', u.last_name)}{kv('کد ملی', u.national_id)}{kv('شماره شناسنامه', id?.birth_certificate_no)}
        {kv('محل صدور', id?.issue_place)}{kv('نام پدر', id?.father_name)}{kv('تاریخ تولد', id?.birth_date ? gregorianToJalaliText(id.birth_date) : null)}
        {kv('جنسیت', id?.gender ? labelOf(GENDER, id.gender) : null)}{kv('وضعیت تأهل', id?.marital_status ? labelOf(MARITAL, id.marital_status) : null)}
        {kv('تعداد فرزند', id?.children_count !== null && id?.children_count !== undefined ? faNum(id.children_count) : null)}
        {kv('آخرین مدرک تحصیلی', id?.educational_qualification ? labelOf(EDUCATION, id.educational_qualification) : null)}{kv('شماره بیمه تأمین اجتماعی', id?.social_security_no)}
      </div>
    </Card>
  );
}

/** ۲. آدرس و تماس */
export function ContactSection({ u }: { u: UserDetail }) {
  const a = u.addresses?.[0];
  return (
    <Card>
      <SectionTitle>آدرس و تماس</SectionTitle>
      <div className={s.kvGrid}>
        {kv('استان', a?.province)}{kv('شهر', a?.city)}{kv('کد پستی', a?.postal_code)}{kv('تلفن ثابت', a?.phone)}
        {kv('ایمیل', u.email, true)}{kv('موبایل شخصی ۱', a?.mobile_1)}{kv('موبایل شخصی ۲', a?.mobile_2)}
      </div>
      <div style={{ marginTop: 14 }}>{kv('آدرس کامل', a?.full_address)}</div>
      <div className={s.sub} style={{ margin: '20px 0 10px', fontWeight: 600 }}>بستگان</div>
      {u.next_of_kin?.length ? (
        <div className={s.list}>
          {u.next_of_kin.map((k) => (
            <div key={k.id} className={s.listRow}>
              <div><div className={s.strong}>{k.full_name}</div><div className={s.sub}>{k.relation}{k.address ? ` · ${k.address}` : ''}</div></div>
              <span className="tnum">{k.phone}</span>
            </div>
          ))}
        </div>
      ) : <Empty title="اطلاعات بستگان ثبت نشده است" />}
    </Card>
  );
}

/** ۳. اطلاعات بانکی */
export function BankSection({ u }: { u: UserDetail }) {
  const b = u.bank_accounts?.[0];
  return (
    <Card>
      <SectionTitle>اطلاعات بانکی</SectionTitle>
      {b ? (
        <div className={s.kvGrid}>
          {kv('نام بانک', b.bank_name)}{kv('شماره حساب', b.account_no)}{kv('شماره کارت', b.card_no ? formatCard(b.card_no) : null)}{kv('شماره شبا', b.iban ? formatIban(b.iban) : null, true)}
        </div>
      ) : <Empty title="حساب بانکی ثبت نشده است" />}
    </Card>
  );
}

/** ۴. اطلاعات شغلی (دپارتمان با DepartmentsTab در همین تب) */
export function JobSection({ u }: { u: UserDetail }) {
  const { data: branches } = useBranchOptions();
  const { data: staff } = useAllStaff(!!u.direct_manager_id);
  const branchName = branches?.find((b) => b.id === u.primary_branch_id)?.name;
  const manager = staff?.find((x) => x.id === u.direct_manager_id);
  return (
    <Card>
      <SectionTitle>اطلاعات شغلی</SectionTitle>
      <div className={s.kvGrid}>
        {kv('شعبه‌ی اصلی', u.primary_branch_id ? branchName ?? 'شعبه' : null)}
        {kv('مدیر مستقیم', manager ? [manager.first_name, manager.last_name].filter(Boolean).join(' ') || manager.username : u.direct_manager_id ? '…' : null)}
        {kv('عنوان شغلی', u.job_title)}
        {kv('قرارداد فروش درصدی', u.has_commission_contract ? `فعال — ${faNum(u.commission_percent)}٪` : 'غیرفعال')}
        {kv('شرح شغل', u.job_description)}{kv('توضیحات حساب', u.account_description)}
      </div>
    </Card>
  );
}

/** ۵. مدارک — همه‌ی جایگاه‌های فرم، با وضعیت هر کدام */
/** readOnly: صفحه‌ی «پروفایل من» (2026-10-27) — بدون دکمه‌ی حذف. */
export function DocsSection({ u, readOnly }: { u: UserDetail; readOnly?: boolean }) {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const [del, setDel] = useState<{ id: string; label: string } | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const bySlot = new Map((u.documents ?? []).map((d) => [d.slot ?? d.doc_type, d]));
  /** حذف مدرک — DELETE /auth/users/{id}/documents/{doc} (مجوز identity.users.documents.delete). */
  const removeDoc = async () => {
    if (!del) return;
    setDelBusy(true);
    try {
      await adminApi(`/auth/users/${u.id}/documents/${del.id}`, { method: 'DELETE' });
      toast(`مدرک «${del.label}» حذف شد.`);
      setDel(null);
      await qc.invalidateQueries({ queryKey: ['identity', 'user', u.id] });
    } catch (e) { toast(userMessage(e), 'error'); } finally { setDelBusy(false); }
  };
  return (
    <Card>
      <SectionTitle>مدارک</SectionTitle>
      <div className={s.list}>
        {DOC_SLOTS.map((slot) => {
          const d = bySlot.get(slot.slot);
          return (
            <div key={slot.slot} className={s.listRow}>
              <div>
                <div className={s.strong}>{slot.label}{slot.required ? <span style={{ color: 'var(--brand)' }}> *</span> : null}</div>
                <div className={s.sub}>{d ? `بارگذاری: ${faDate(d.uploaded_at ?? d.created_at)}` : 'بارگذاری نشده'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {d && can('identity.users.documents.read') ? (
                  <Button variant="secondary" icon={<IconDownload size={16} />} onClick={() => openUserDocument(u.id, d.id).catch((e) => toast(userMessage(e), 'error'))}>مشاهده</Button>
                ) : <Badge tone={d ? 'success' : 'neutral'}>{d ? 'ثبت‌شده' : 'ندارد'}</Badge>}
                {d && !readOnly && can('identity.users.documents.delete') ? (
                  <Button variant="danger" icon={<IconTrash size={16} />} onClick={() => setDel({ id: d.id, label: slot.label })} aria-label={`حذف ${slot.label}`}>حذف</Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={!!del} onClose={() => setDel(null)} title="حذف مدرک" width={440}
        footer={<><Button variant="danger" icon={<IconTrash size={16} />} loading={delBusy} onClick={removeDoc}>حذف</Button><Button variant="ghost" onClick={() => setDel(null)}>انصراف</Button></>}>
        <p className={s.sub} style={{ fontSize: 13, lineHeight: 2, color: 'var(--ink-700)' }}>مدرک «{del?.label}» این کاربر حذف شود؟ این کار برگشت‌پذیر نیست.</p>
      </Modal>
    </Card>
  );
}

/** ۶. امنیت و نقش — اطلاعات حساب ورود */
export function AccountSection({ u }: { u: UserDetail }) {
  return (
    <Card>
      <SectionTitle>حساب ورود</SectionTitle>
      <div className={s.kvGrid}>
        {kv('موبایل ورود', u.phone_number)}{kv('نام کاربری', u.username, true)}
        {kv('نوع کاربر', USER_TYPE[u.user_type]?.label ?? u.user_type)}{kv('تاریخ ایجاد حساب', faDate(u.created_at))}
      </div>
    </Card>
  );
}

export function RoleTab({ userId }: { userId: string }) {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const roles = useAllRoles();
  const asg = useAssignments({ user_id: userId });
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const current = asg.data?.filter((a) => a.is_active) ?? [];
  const roleName = (rid: string) => roles.data?.find((r) => r.id === rid)?.name ?? '…';

  /** سیاست بک‌اند: هر کارمند حداکثر یک نقش فعال ⇐ تغییر = حذف انتساب فعلی + انتساب تازه. */
  const change = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      for (const a of current) await adminApi(`/rbac/roles/assignments/${a.id}`, { method: 'DELETE' });
      await adminApi('/rbac/roles/assignments', { method: 'POST', body: { user_id: userId, role_id: pick } });
      toast('نقش کاربر ثبت شد.');
      setPick('');
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ['rbac', 'assignments'] });
      await qc.invalidateQueries({ queryKey: ['identity'] });
    }
  };
  const remove = async (aid: string) => {
    setBusy(true);
    try {
      await adminApi(`/rbac/roles/assignments/${aid}`, { method: 'DELETE' });
      toast('نقش از کاربر گرفته شد.');
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ['rbac', 'assignments'] });
      await qc.invalidateQueries({ queryKey: ['identity'] });
    }
  };

  return (
    <Card>
      <SectionTitle>نقش کاربر</SectionTitle>
      <InfoBanner>هر کارمند فقط یک نقش فعال دارد. نقش «چه کاری» را تعیین می‌کند و به شعبه وابسته نیست؛ شعب کاربر از «تخصیص شعب» مدیریت می‌شود.</InfoBanner>
      {asg.isLoading || roles.isLoading ? <SkeletonRows rows={2} /> : asg.error ? <ErrorBox error={asg.error} onRetry={() => asg.refetch()} /> : (
        <div className={s.list}>
          {current.length === 0 ? <Empty title="نقشی به این کاربر داده نشده است" /> : current.map((a) => (
            <div key={a.id} className={s.listRow}>
              <div><div className={s.strong}>{roleName(a.role_id)}</div><div className={s.sub}>از {faDate(a.assigned_at)}{a.expires_at ? ` تا ${faDate(a.expires_at)}` : ''}</div></div>
              {can('rbac.roles.assignments.delete') ? <Button variant="ghost" onClick={() => remove(a.id)} disabled={busy}>گرفتن نقش</Button> : null}
            </div>
          ))}
        </div>
      )}
      {can('rbac.roles.assignments.create') ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 18 }}>
          <div style={{ flex: 1 }}>
            <Select label={current.length ? 'تغییر نقش به' : 'انتساب نقش'} value={pick} onChange={(e) => setPick(e.target.value)} placeholder="انتخاب نقش"
              options={(roles.data ?? []).filter((r) => r.is_active && !current.some((a) => a.role_id === r.id)).map((r) => ({ value: r.id, label: r.name }))} />
          </div>
          <Button onClick={change} loading={busy} disabled={!pick}>ثبت نقش</Button>
        </div>
      ) : null}
    </Card>
  );
}

export function DepartmentsTab({ userId }: { userId: string }) {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useUserDepartments(userId);
  const editable = can('identity.users.department.update');
  const picker = useDepartmentPicker(editable);
  const [sel, setSel] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const currentIds = useMemo(() => (q.data?.departments ?? []).map((d) => d.id), [q.data]);
  useEffect(() => { setSel(null); }, [q.data]);
  const value = sel ?? currentIds;

  const save = async () => {
    if (!q.data) return;
    setBusy(true);
    try {
      await adminApi(`/auth/users/${userId}/departments`, {
        method: 'PUT',
        body: { department_ids: value, expected_department_ids: currentIds, expected_version: q.data.department_version },
      });
      toast('دپارتمان‌های کاربر ذخیره شد.');
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ['identity', 'user', userId] });
    }
  };

  return (
    <Card>
      <SectionTitle>دپارتمان‌ها</SectionTitle>
      <InfoBanner>دپارتمان فقط برچسب سازمانی است (مثلاً برای ارجاع تیکت) و هیچ نقش یا دسترسی شعبه‌ای نمی‌دهد.</InfoBanner>
      {q.isLoading ? <SkeletonRows rows={2} /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !editable ? (
        q.data?.departments.length ? <div className={s.actionsRow}>{q.data.departments.map((d) => <Chip key={d.id}>{d.name}</Chip>)}</div> : <Empty title="دپارتمانی ثبت نشده است" />
      ) : picker.isLoading ? <SkeletonRows rows={2} /> : (
        <>
          {(picker.data ?? []).length === 0 ? <Empty title="هنوز دپارتمانی تعریف نشده است" /> : (
            <div className={s.checkGrid}>
              {(picker.data ?? []).map((d) => (
                <label key={d.id} className={s.check}>
                  <input type="checkbox" checked={value.includes(d.id)} onChange={(e) => setSel(e.target.checked ? [...value, d.id] : value.filter((x) => x !== d.id))} />
                  {d.name}
                </label>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Button onClick={save} loading={busy} disabled={sel === null}>ذخیره‌ی دپارتمان‌ها</Button>
          </div>
        </>
      )}
    </Card>
  );
}

export function SessionsTab({ userId }: { userId: string }) {
  const can = usePerm();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const q = useUserSessions(userId, page);
  const revoke = useRevokeSession(userId);
  return (
    <Card>
      <SectionTitle>نشست‌های کاربر</SectionTitle>
      {q.isLoading ? <SkeletonRows rows={3} /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data?.results.length ? <Empty title="نشستی ثبت نشده است" /> : (
        <>
          <div className={s.list}>
            {q.data.results.map((x) => {
              const st = SESSION_STATUS[x.status] ?? { label: x.status, tone: 'neutral' as const };
              return (
                <div key={x.id} className={s.listRow}>
                  <div>
                    <div className={s.strong}>{DEVICE[x.device_type] ?? x.device_type}{x.browser ? ` · ${x.browser}` : ''}</div>
                    <div className={s.sub}>شروع: {faDateTime(x.started_at)} · آخرین فعالیت: {faDateTime(x.last_activity_at)}{x.ip_address ? ` · IP ${x.ip_address}` : ''}{x.approx_location ? ` · ${x.approx_location}` : ''}</div>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {x.is_alive && can('identity.users.update') ? (
                    <Button variant="ghost" icon={<IconPlayerStop size={16} />} disabled={revoke.isPending}
                      onClick={() => revoke.mutate(x.id, { onSuccess: () => toast('نشست پایان یافت.'), onError: (e) => toast(userMessage(e), 'error') })}>پایان نشست</Button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Pagination page={page} pageSize={10} total={q.data.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

/** وضعیت حساب + بازنشانی رمز؛ only='password' ⇐ فقط رمز (در فرم ویرایش) */
export function SecurityTab({ u, only }: { u: UserDetail; only?: 'password' }) {
  const can = usePerm();
  const { user: me } = useAuth();
  const toast = useToast();
  const setStatus = useSetStatus(u.id);
  const reset = useResetPassword(u.id);
  const [newPass, setNewPass] = useState<string | null>(null);
  const [status, setStatusVal] = useState(u.status);
  const isSelf = me?.id === u.id;

  return (
    <>
      {only ? null : <Card>
        <SectionTitle>وضعیت حساب</SectionTitle>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, maxWidth: 320 }}>
            <Select label="وضعیت" value={status} onChange={(e) => setStatusVal(e.target.value as typeof status)} disabled={!can('identity.users.update') || isSelf}
              options={Object.entries(USER_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
          </div>
          {can('identity.users.update') && !isSelf ? (
            <Button loading={setStatus.isPending} disabled={status === u.status}
              onClick={() => setStatus.mutate(status, { onSuccess: () => toast('وضعیت حساب ذخیره شد.'), onError: (e) => toast(userMessage(e), 'error') })}>ذخیره‌ی وضعیت</Button>
          ) : null}
        </div>
        {isSelf ? <div className={s.sub} style={{ marginTop: 10 }}>وضعیت حساب خودتان را نمی‌توانید تغییر دهید.</div> : null}
      </Card>}
      {can('identity.users.update') ? (
        <Card>
          <SectionTitle>رمز عبور</SectionTitle>
          <p className={s.sub} style={{ marginBottom: 14 }}>رمز تازه به‌صورت خودکار ساخته می‌شود و فقط یک بار نمایش داده می‌شود؛ آن را به کاربر تحویل دهید.</p>
          <Button variant="secondary" icon={<IconKey size={17} />} loading={reset.isPending}
            onClick={() => reset.mutate(undefined, { onSuccess: (p) => setNewPass(p ?? ''), onError: (e) => toast(userMessage(e), 'error') })}>بازنشانی رمز عبور</Button>
        </Card>
      ) : null}
      {/* Branch Master: بک‌اند مقدار فعلی is_branch_master را در UserOut برنمی‌گرداند ⇐ تا افزوده شود نمایش داده نمی‌شود (گزارش‌شده). */}
      <Modal open={newPass !== null} onClose={() => setNewPass(null)} title="رمز عبور تازه" footer={<Button onClick={() => setNewPass(null)}>متوجه شدم</Button>}>
        {newPass ? (
          <>
            <p className={s.sub} style={{ marginBottom: 12 }}>این رمز دیگر نمایش داده نمی‌شود.</p>
            <div className={s.secret}>
              <span className="ltr" style={{ flex: 1 }}>{newPass}</span>
              <Button variant="ghost" icon={<IconCopy size={16} />} onClick={() => navigator.clipboard?.writeText(newPass).then(() => toast('کپی شد.'))}>کپی</Button>
            </div>
          </>
        ) : <p>رمز بازنشانی شد.</p>}
      </Modal>
    </>
  );
}
