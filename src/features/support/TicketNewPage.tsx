import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { IconPaperclip, IconSend, IconX } from '@tabler/icons-react';
import { adminApi, branchStore } from '@/shared/api/client';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useDebounced } from '@/shared/lib/useDebounced';
import { clean } from '@/shared/lib/validate';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Input, PickerField, Select, Textarea } from '@/shared/ui/form';
import { Badge, Card, Empty, InfoBanner, Modal, PageHead, Pagination, Segmented } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useCustomers, type CustomerDetail, type CustomerRow } from '@/features/customers/api';
import { CUSTOMER_STATUS } from '@/features/customers/labels';
import { checkFiles, fileSize, supportError, useCreateTicket, useDepartments } from './api';
import { CONTACT_ROLE, PRIORITY, PRIORITY_ORDER } from './labels';
import s from './support.module.css';

type Target = 'CUSTOMER' | 'VISITOR';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * ارسال پیام جدید / ثبت تیکت از پنل کارکنان (POST /support/tickets، multipart تخت).
 * مخاطب: مشتری ثبت‌شده (owner_user_id = شناسه‌ی کاربر هویتی مشتری، نه شناسه‌ی پرونده) یا مهمان (نام + تلفن یا ایمیل).
 * پیش‌پر از query (از «پیام‌های فرم تماس»): name، phone، email، subject.
 */
export default function TicketNewPage() {
  const can = usePerm();
  const nav = useNavigate();
  const toast = useToast();
  const back = useBack('/support/outbound');
  const [sp] = useSearchParams();
  const canPickCustomer = can('customers.profiles.list') && can('customers.profiles.read');
  const prefilled = !!sp.get('name');
  const [target, setTarget] = useState<Target>(prefilled || !canPickCustomer ? 'VISITOR' : 'CUSTOMER');
  const [customer, setCustomer] = useState<{ userId: string; label: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(sp.get('name') ?? '');
  const [phone, setPhone] = useState(sp.get('phone') ?? '');
  const [email, setEmail] = useState(sp.get('email') ?? '');
  const [subject, setSubject] = useState(sp.get('subject') ?? '');
  const [dep, setDep] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const branches = useBranchOptions();
  const [branch, setBranch] = useState(branchStore.get() ?? '');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deps = useDepartments();
  const create = useCreateTicket();
  const multiBranch = (branches.data?.length ?? 0) > 1;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    const fe = checkFiles(next);
    setErr(fe);
    if (!fe) setFiles(next);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (target === 'CUSTOMER' && !customer) e.customer = 'مشتری را انتخاب کنید.';
    if (target === 'VISITOR') {
      if (!name.trim()) e.name = 'نام مخاطب الزامی است.';
      if (!clean(phone) && !email.trim()) e.phone = 'تلفن یا ایمیل مخاطب الزامی است.';
      if (clean(phone) && !/^\+?[0-9]{7,15}$/.test(clean(phone).replace(/[\s()\-.]/g, ''))) e.phone = 'شماره تلفن معتبر نیست.';
      if (email.trim() && !EMAIL.test(email.trim())) e.email = 'ایمیل معتبر نیست.';
    }
    if (!subject.trim()) e.subject = 'موضوع الزامی است.';
    if (!dep) e.dep = 'دپارتمان را انتخاب کنید.';
    if (!body.trim()) e.body = 'متن پیام الزامی است.';
    setErrs(e);
    const fe = checkFiles(files);
    setErr(fe);
    if (Object.keys(e).length || fe) return;
    try {
      const t = await create.mutateAsync({
        data: {
          subject: subject.trim(), department_id: dep, priority, body: body.trim(), branch_id: branch || undefined,
          ...(target === 'CUSTOMER' ? { owner_user_id: customer!.userId } : { contact_name: name.trim(), phone: clean(phone) || undefined, email: email.trim() || undefined }),
        },
        files,
      });
      toast(`پیام ثبت شد (کد پیگیری ${t.tracking_code}).`);
      nav(`/support/tickets/${t.id}`, { replace: true });
    } catch (x) { setErr(supportError(x)); }
  };

  const depName = deps.data?.find((d) => d.id === dep)?.name;
  return (
    <>
      <PageHead back={back} title="ارسال پیام جدید" sub="ثبت تیکت از طرف پشتیبانی برای مشتری یا مهمان" />
      <div className={s.formGrid}>
        <Card>
          <div className={s.fields}>
            <div className={s.full}>
              <Segmented value={target} onChange={(v) => { setTarget(v); setErrs({}); }}
                options={[{ value: 'CUSTOMER', label: 'مشتری ثبت‌شده', disabled: !canPickCustomer, tip: canPickCustomer ? undefined : 'برای انتخاب مشتری به مجوز مشاهده‌ی پرونده‌ی مشتریان نیاز است' }, { value: 'VISITOR', label: 'مهمان' }]} />
            </div>
            {target === 'CUSTOMER' ? (
              <div className={s.full}>
                <PickerField label="مشتری" required value={customer?.label} placeholder="انتخاب مشتری از فهرست" onOpen={() => setPicking(true)} onClear={() => setCustomer(null)} error={errs.customer}
                  hint="نام، تلفن و ایمیل مخاطب از پرونده‌ی هویتی مشتری برداشته می‌شود." />
              </div>
            ) : (
              <>
                <Input label="نام مخاطب" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} error={errs.name} />
                <Input label="تلفن" latin dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} error={errs.phone} hint="تلفن یا ایمیل؛ حداقل یکی" />
                <Input label="ایمیل" latin dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} error={errs.email} />
              </>
            )}
            <div className={s.full}><Input label="موضوع" required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} error={errs.subject} /></div>
            <Select label="دپارتمان" required value={dep} onChange={(e) => setDep(e.target.value)} placeholder="انتخاب کنید" error={errs.dep}
              options={(deps.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
            {multiBranch ? (
              <Select label="شعبه" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="شعبه‌ی فعال من"
                options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
            ) : <div />}
            <div className={s.full}>
              <Segmented value={priority} onChange={setPriority} options={PRIORITY_ORDER.map((p) => ({ value: p, label: `${PRIORITY[p]!.label} (${PRIORITY[p]!.sla})` }))} />
            </div>
            <div className={s.full}><Textarea label="متن پیام" required value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={10000} error={errs.body} /></div>
            <div className={s.full}>
              <input ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.xlsx" className={s.hidden} onChange={(e) => addFiles(e.target.files)} aria-label="انتخاب فایل" />
              <button type="button" className={s.drop} onClick={() => fileRef.current?.click()} disabled={files.length >= 3} data-tip="افزودن فایل">
                <IconPaperclip size={18} /> فایل‌های ارسالی — حداکثر ۳ فایل، هر کدام تا ۳ مگابایت (jpg، png، pdf، xlsx)
              </button>
              {files.length ? (
                <div className={s.files} style={{ marginTop: 10 }}>
                  {files.map((f, i) => (
                    <span key={`${f.name}-${i}`} className={s.fileChip}><span data-latin="">{f.name}</span><small className={s.muted}>{fileSize(f.size)}</small>
                      <button type="button" aria-label={`حذف ${f.name}`} data-tip="حذف فایل" onClick={() => setFiles(files.filter((_, j) => j !== i))}><IconX size={13} /></button></span>
                  ))}
                </div>
              ) : null}
            </div>
            {err ? <div className={s.full}><Alert>{err}</Alert></div> : null}
          </div>
        </Card>
        <div className={s.side}>
          <Card>
            <div className={s.cardTitle}>خلاصه</div>
            <div className={s.sumRow}><span>مخاطب</span><b>{target === 'CUSTOMER' ? customer?.label ?? '—' : name.trim() || '—'} <Badge tone="neutral">{CONTACT_ROLE[target]}</Badge></b></div>
            <div className={s.sumRow}><span>دپارتمان</span><b>{depName ?? '—'}</b></div>
            <div className={s.sumRow}><span>اولویت</span><b>{PRIORITY[priority]?.label}</b></div>
            <div className={s.sumRow}><span>فایل‌ها</span><b>{faNum(files.length)}</b></div>
            <div style={{ marginTop: 16 }}><Button block icon={<IconSend size={17} />} loading={create.isPending} onClick={submit}>ارسال پیام</Button></div>
          </Card>
          <InfoBanner>تیکت ثبت‌شده «ارسالی» و در وضعیت «پاسخ داده‌شده» است؛ مهلت پاسخ پشتیبانی از وقتی شروع می‌شود که مخاطب جواب بدهد.</InfoBanner>
        </div>
      </div>
      {picking ? <CustomerPicker onClose={() => setPicking(false)} onPick={(c) => { setCustomer(c); setPicking(false); setErrs((x) => ({ ...x, customer: '' })); }} /> : null}
    </>
  );
}

/** جدول انتخابی مشتری (تک‌انتخابی)؛ شناسه‌ی کاربر هویتی از جزئیات پرونده خوانده می‌شود (فهرست مشتریان user_id ندارد) */
function CustomerPicker({ onClose, onPick }: { onClose: () => void; onPick: (c: { userId: string; label: string }) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dq = useDebounced(q.trim(), 300);
  const list = useCustomers({ page, page_size: 8, query: dq || undefined });
  const pick = async (c: CustomerRow) => {
    setBusy(c.id); setErr(null);
    try {
      const d = await adminApi<CustomerDetail>(`/customers/profiles/${c.id}`);
      onPick({ userId: d.user_id, label: `${c.full_name}${c.store_name ? ` — ${c.store_name}` : ''}` });
    } catch (e) { setErr(supportError(e)); } finally { setBusy(null); }
  };
  const cols: Column<CustomerRow>[] = [
    { key: 'code', header: 'کد', code: true, render: (c) => <span className="ltr">{c.code}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (c) => <b>{c.full_name}</b> },
    { key: 'store', header: 'نام فروشگاه', render: (c) => c.store_name || '—' },
    { key: 'mobile', header: 'موبایل', render: (c) => <span className="tnum">{c.mobile ?? '—'}</span> },
    { key: 'st', header: 'وضعیت', render: (c) => <Badge tone={CUSTOMER_STATUS[c.status]?.tone ?? 'neutral'}>{CUSTOMER_STATUS[c.status]?.label ?? c.status}</Badge> },
    { key: 'pick', header: '', render: (c) => <Button size="sm" variant="secondary" loading={busy === c.id} onClick={(e) => { e.stopPropagation(); pick(c); }}>انتخاب</Button> },
  ];
  return (
    <Modal open onClose={onClose} title="انتخاب مشتری" width={860}>
      {err ? <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div> : null}
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: کد، نام، نام فروشگاه یا موبایل" count={list.data ? `${faNum(list.data.total)} مشتری` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(c) => c.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} onRowClick={(c) => { if (!busy) pick(c); }}
        empty={<Empty title="مشتری‌ای پیدا نشد" />} />
      {list.data && list.data.total > 8 ? <Pagination page={page} pageSize={8} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}

