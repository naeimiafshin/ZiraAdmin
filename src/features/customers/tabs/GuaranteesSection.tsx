import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { IconDownload, IconFileUpload, IconPlus, IconShieldCheck } from '@tabler/icons-react';
import { applyServerErrors } from '@/shared/api/formErrors';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits } from '@/shared/lib/text';
import { clean, isNationalId } from '@/shared/lib/validate';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Select, Textarea, Toggle } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Card, Empty, InfoBanner, Modal, Pagination, SectionTitle } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { openProtectedFile, useBanks, useGuaranteeRequirement, useGuarantees, useGuaranteeWrite, type Bank, type CreditAccountSummary, type CustomerDetail, type Guarantee } from '../api';
import { AmountInput, ReasonModal, digitsOnly, formatAmount, rial } from '../components';
import { CREDIT_TYPE, GUARANTEE_STATUS, GUARANTEE_TYPE } from '../labels';
import s from '../customers.module.css';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX = 5 * 1024 * 1024;

export function GuaranteesSection({ c, accounts }: { c: CustomerDetail; accounts: CreditAccountSummary[] }) {
  const can = usePerm();
  const toast = useToast();
  const w = useGuaranteeWrite(c.id);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fAcc, setFAcc] = useState('');
  const list = useGuarantees(c.id, can('customers.profiles.guarantees.read'), { page, page_size: 10, query: q.trim() || undefined, status: fStatus || undefined, credit_account_id: fAcc || undefined });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Guarantee | null>(null);
  const [correcting, setCorrecting] = useState<Guarantee | null>(null);
  const [releasing, setReleasing] = useState<Guarantee | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const banks = useBanks(can('customers.profiles.guarantees.read'));
  const bankOf = (id?: string | null) => (id ? banks.data?.find((b) => b.id === id) : undefined);
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? CREDIT_TYPE[a.credit_type]?.label ?? a.credit_type : '—'; };
  const canUpdate = can('customers.profiles.guarantees.update');
  const openAccounts = accounts.filter((a) => a.status !== 'CLOSED');
  if (!can('customers.profiles.guarantees.read')) return null;

  const replaceFile = async (g: Guarantee, file?: File) => {
    if (!file) return;
    if (file.size > MAX) { toast('حجم فایل بیش از ۵ مگابایت است.', 'error'); return; }
    try { await w.replaceFile.mutateAsync({ id: g.id, file }); toast('تصویر ضمانت جایگزین شد.'); } catch (e) { toast(userMessage(e), 'error'); }
  };
  const cols: Column<Guarantee>[] = [
    ...(canUpdate ? [{ key: 'pick', header: 'انتخاب', render: (g: Guarantee) => g.status === 'PENDING_APPROVAL' ? <input type="checkbox" className={s.cb} aria-label="انتخاب برای تأیید" checked={sel.has(g.id)} onChange={() => setSel((x) => { const n = new Set(x); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} /> : <span className={s.muted}>—</span> }] : []),
    { key: 'acc', header: 'اعتبار مربوطه', render: (g) => <Badge tone={accName(g.credit_account_id).includes('طلایی') ? 'warning' : 'info'}>{accName(g.credit_account_id)}</Badge> },
    { key: 'type', header: 'نوع ضمانت', render: (g) => <b>{GUARANTEE_TYPE[g.guarantee_type] ?? g.guarantee_type}</b> },
    { key: 'amount', header: 'مبلغ', render: (g) => <span className="tnum">{rial(g.amount)}</span> },
    { key: 'no', header: 'شماره سند', render: (g) => <span className="tnum ltr">{g.document_no}</span> },
    { key: 'bank', header: 'بانک / شعبه', render: (g) => { const b = bankOf(g.bank_id); return b || g.bank_branch_name ? <span className={s.bankCell}>{b ? <BankLogo bank={b} /> : null}<span>{b ? b.title : ''}{b && g.bank_branch_name ? ' — ' : ''}{g.bank_branch_name ? <span className={s.muted}>{g.bank_branch_name}</span> : null}</span></span> : '—'; } },
    { key: 'owner', header: 'صاحب حساب / ضامن', render: (g) => g.guarantor_name ? `${g.guarantor_name}${g.guarantor_national_id ? ` (${g.guarantor_national_id})` : ''}` : g.owner_name || '—' },
    { key: 'due', header: 'سررسید', render: (g) => <span className="tnum">{gregorianToJalaliText(g.due_date)}</span> },
    { key: 'st', header: 'وضعیت', render: (g) => <Badge tone={GUARANTEE_STATUS[g.status]?.tone ?? 'neutral'}>{GUARANTEE_STATUS[g.status]?.label ?? g.status}</Badge> },
    { key: 'file', header: 'مدرک', render: (g) => g.has_file ? <Button size="sm" variant="ghost" icon={<IconDownload size={15} />} aria-label="دانلود تصویر ضمانت" onClick={() => openProtectedFile(`/customers/guarantees/${g.id}/file`).catch((e) => toast(userMessage(e), 'error'))}>دانلود</Button> : <span className={s.muted}>ندارد</span> },
    {
      key: 'act', header: 'عملیات',
      render: (g) => !canUpdate || g.status === 'RELEASED' ? <span className={s.muted}>{g.status === 'RELEASED' ? `آزاد شد ${faDate(g.released_at)}` : '—'}</span> : (
        <span className={s.actionsRow} style={{ flexWrap: 'nowrap' }}>
          {g.status === 'PENDING_APPROVAL' ? <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(g)}>ویرایش</Button>
            <label className={s.fileBtn} data-tip="جایگزینی تصویر ضمانت">تصویر جدید<input type="file" accept={ACCEPT} hidden onChange={(e) => replaceFile(g, e.target.files?.[0])} /></label>
            <Button size="sm" loading={w.activate.isPending} onClick={async () => { try { await w.activate.mutateAsync(g.id); toast('ضمانت فعال شد.'); } catch (e) { toast(userMessage(e), 'error'); } }}>فعال‌سازی</Button>
          </> : null}
          {g.status === 'ACTIVE' && can('customers.profiles.guarantees.create') ? <Button size="sm" variant="secondary" icon={<IconFileUpload size={15} />} onClick={() => setCorrecting(g)} data-tip="سند فعال درجا عوض نمی‌شود: سند فعلی آزاد و سند جایگزین در انتظار تأیید ثبت می‌شود">اصلاح</Button> : null}
          <Button size="sm" variant="danger" onClick={() => setReleasing(g)}>آزادسازی</Button>
        </span>
      ),
    },
  ];
  const activeTotal = (list.data?.results ?? []).filter((g) => g.status === 'ACTIVE').reduce((a, g) => a + Number(g.amount), 0);

  return (
    <Card>
      <SectionTitle extra={
        <span className={s.actionsRow}>
          {canUpdate && sel.size ? <Button size="sm" variant="secondary" icon={<IconShieldCheck size={15} />} loading={w.approveSubmission.isPending} onClick={() => setApproving(true)}>تأیید {faNum(sel.size)} ضمانت و بستن بارگذاری</Button> : null}
          {can('customers.profiles.guarantees.create') ? <Button size="sm" icon={<IconPlus size={15} />} disabled={!openAccounts.length} onClick={() => setAdding(true)} data-tip={openAccounts.length ? undefined : 'اول سقف اعتبار چکی یا طلایی را تعیین کنید'}>افزودن ضمانت</Button> : null}
        </span>
      }>ضمانت‌ها</SectionTitle>
      <p className={s.sub} style={{ marginBottom: 12 }}>هر حساب اعتباری می‌تواند چند ضمانت داشته باشد. ضمانت سقف را خودکار زیاد نمی‌کند و حذف نمی‌شود؛ فقط «آزاد» می‌شود (برگرداندن سند به مشتری).{list.data ? ` جمع ضمانت‌های فعال این صفحه: ${rial(activeTotal)}` : ''}</p>
      {canUpdate ? <RequirementAndGate c={c} accounts={accounts} /> : null}
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو در ضمانت‌ها"
        filters={[
          { key: 'st', label: 'وضعیت', value: fStatus, onChange: (v) => { setFStatus(v); setPage(1); }, options: Object.entries(GUARANTEE_STATUS).map(([value, v]) => ({ value, label: v.label })) },
          { key: 'acc', label: 'اعتبار', value: fAcc, onChange: (v) => { setFAcc(v); setPage(1); }, options: accounts.map((a) => ({ value: a.id, label: CREDIT_TYPE[a.credit_type]?.label ?? a.credit_type })) },
        ]} count={list.data ? `${faNum(list.data.total)} ضمانت` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(g) => g.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title="ضمانتی ثبت نشده است" text={openAccounts.length ? 'برای پشتوانه‌ی اعتبار، چک شخصی یا سفته‌ی مشتری را با تصویر ثبت کنید.' : 'ابتدا سقف اعتبار چکی یا طلایی را تعیین کنید.'} />} />
      {list.data && list.data.total > 10 ? <Pagination page={page} pageSize={10} total={list.data.total} onPage={setPage} /> : null}

      {adding ? <GuaranteeFormModal accounts={openAccounts} onClose={() => setAdding(false)} busy={w.create.isPending}
        onSubmit={async (fd) => { await w.create.mutateAsync(fd); toast('ضمانت ثبت شد (در انتظار تأیید).'); setAdding(false); }} /> : null}
      {editing ? <GuaranteeFormModal accounts={openAccounts} existing={editing} onClose={() => setEditing(null)} busy={w.update.isPending}
        onSubmitEdit={async (body) => { await w.update.mutateAsync({ id: editing.id, body }); toast('ضمانت ویرایش شد.'); setEditing(null); }} /> : null}
      {correcting ? <GuaranteeFormModal accounts={accounts} existing={correcting} correct onClose={() => setCorrecting(null)} busy={w.correct.isPending}
        onSubmitCorrect={async (v) => { await w.correct.mutateAsync({ id: correcting.id, ...v }); toast('ضمانت اصلاح شد: سند قبلی آزاد و سند جایگزین در انتظار تأیید است.'); setCorrecting(null); }} /> : null}
      <ReasonModal open={!!releasing} onClose={() => setReleasing(null)} danger busy={w.release.isPending} title="آزادسازی ضمانت (برگرداندن سند)" label="یادداشت آزادسازی" confirmText="تأیید می‌کنم؛ آزاد شود"
        intro="با آزادسازی تأیید می‌کنید که مشتری بدهی طلایی باز و چک وصول‌نشده ندارد؛ سامانه این را خودش بررسی نمی‌کند."
        onConfirm={async (note) => { await w.release.mutateAsync({ id: releasing!.id, note }); toast('ضمانت آزاد شد.'); setReleasing(null); }}>
        {releasing?.status === 'ACTIVE' ? <InfoBanner tone="warning">این ضمانت فعال است: با آزادسازی، سقف حساب همان ضمانت صفر می‌شود (فقط سوپر ادمین مجاز است؛ یک کاهش «اعمال‌شده» در تاریخچه ثبت می‌شود).</InfoBanner> : null}
      </ReasonModal>
      <ReasonModal open={approving} onClose={() => setApproving(false)} busy={w.approveSubmission.isPending} title="تأیید مجموعه‌ی ضمانت‌ها" noReason confirmText="تأیید و بستن بارگذاری"
        intro={`${faNum(sel.size)} ضمانت در انتظار، یک‌جا فعال می‌شوند و بخش بارگذاری ضمانت در پنل مشتری بسته می‌شود.`}
        onConfirm={async () => { await w.approveSubmission.mutateAsync({ guarantee_ids: [...sel], expected_version: c.version }); toast('ضمانت‌ها تأیید شدند.'); setSel(new Set()); setApproving(false); }} />
    </Card>
  );
}

/** الزام ضمانت برای مشتری (مبلغ و نوع مورد نیاز) + دروازه‌ی بارگذاری ضمانت در پنل مشتری (P-05) */
function RequirementAndGate({ c, accounts }: { c: CustomerDetail; accounts: CreditAccountSummary[] }) {
  const toast = useToast();
  const req = useGuaranteeRequirement(c.id, true);
  const w = useGuaranteeWrite(c.id);
  const [edit, setEdit] = useState(false);
  const [gate, setGate] = useState<'open' | 'close' | null>(null);
  const [form, setForm] = useState({ required_type: 'PERSONAL_CHEQUE', required_amount: '', credit_account_id: '', reason: '' });
  const [err, setErr] = useState<string | null>(null);
  const r = req.data;
  return (
    <div className={s.noteBox} style={{ marginBottom: 14 }}>
      <div className={s.rowBetween}>
        <div>
          <div className={s.strong}>الزام ضمانت و بارگذاری از پنل مشتری</div>
          <div className={s.sub}>{r && r.is_active ? `الزام فعلی: ${GUARANTEE_TYPE[r.required_type] ?? r.required_type} به مبلغ ${rial(r.required_amount)}${r.reason ? ` — ${r.reason}` : ''}` : 'الزامی تعیین نشده است. با تعیین الزام، مشتری در پنل خودش می‌بیند چه ضمانتی باید بیاورد.'}</div>
        </div>
        <span className={s.actionsRow}>
          <Button size="sm" variant="secondary" onClick={() => { setForm({ required_type: r?.required_type ?? 'PERSONAL_CHEQUE', required_amount: r ? String(Math.trunc(Number(r.required_amount))) : '', credit_account_id: r?.credit_account_id ?? '', reason: '' }); setEdit(true); }}>{r ? 'تغییر الزام' : 'تعیین الزام'}</Button>
          <Button size="sm" variant="secondary" onClick={() => setGate('open')}>باز کردن بارگذاری</Button>
          <Button size="sm" variant="secondary" onClick={() => setGate('close')}>بستن بارگذاری</Button>
        </span>
      </div>
      <Modal open={edit} onClose={() => setEdit(false)} title="الزام ضمانت مشتری" width={560}
        footer={<><Button loading={w.requirement.isPending} onClick={async () => {
          if (!Number(form.required_amount)) { setErr('مبلغ الزامی است.'); return; } if (!form.reason.trim()) { setErr('دلیل الزامی است.'); return; }
          try { await w.requirement.mutateAsync({ credit_account_id: form.credit_account_id || null, required_type: form.required_type, required_amount: form.required_amount, reason: form.reason.trim(), expected_version: c.version }); toast('الزام ضمانت ذخیره شد.'); setEdit(false); } catch (e) { setErr(userMessage(e)); }
        }}>ذخیره</Button><Button variant="ghost" onClick={() => setEdit(false)}>انصراف</Button></>}>
        <FormGrid cols={2}>
          <Select label="نوع ضمانت مورد نیاز" value={form.required_type} onChange={(e) => setForm({ ...form, required_type: e.target.value })} options={Object.entries(GUARANTEE_TYPE).map(([value, label]) => ({ value, label }))} />
          <Select label="برای حساب" value={form.credit_account_id} onChange={(e) => setForm({ ...form, credit_account_id: e.target.value })} placeholder="بدون تعیین حساب" options={accounts.map((a) => ({ value: a.id, label: CREDIT_TYPE[a.credit_type]?.label ?? a.credit_type }))} />
        </FormGrid>
        <div style={{ marginTop: 12 }}><AmountInput label="مبلغ مورد نیاز" required value={form.required_amount} onChange={(v) => setForm({ ...form, required_amount: v })} /></div>
        <div style={{ marginTop: 12 }}><Textarea label="دلیل" required rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
      </Modal>
      <ReasonModal open={!!gate} onClose={() => setGate(null)} busy={w.gate.isPending} title={gate === 'open' ? 'باز کردن بارگذاری ضمانت در پنل مشتری' : 'بستن بارگذاری ضمانت در پنل مشتری'}
        onConfirm={async (reason) => { const g = await w.gate.mutateAsync({ open: gate === 'open', reason, expected_version: c.version }); toast(g.guarantee_upload_enabled ? 'بارگذاری ضمانت برای مشتری باز شد.' : 'بارگذاری ضمانت برای مشتری بسته شد.'); setGate(null); }} />
    </div>
  );
}

type GForm = { credit_account_id: string; guarantee_type: string; amount: string; document_no: string; bank_id: string; bank_branch_name: string; owner_name: string; due_date: string; guarantor_name: string; guarantor_national_id: string; issue_place: string };
/** ثبت ضمانت (multipart، تصویر الزامی BR-CUS-140) یا ویرایش ضمانت در انتظار (PATCH، بدون فایل) */
/**
 * افزودن، ویرایش (در انتظار تأیید) یا اصلاح ضمانت فعال (`correct`، پرهام 2026-10-22: PATCH /guarantees/{id}/correction؛
 * سند قبلی RELEASED و سند جایگزین PENDING_APPROVAL؛ تصویر جدید الزامی، توضیح اختیاری؛ حساب و نوع ثابت؛ اعتبار تازه خودکار تخصیص نمی‌یابد).
 */
function GuaranteeFormModal({ accounts, existing, correct, onClose, busy, onSubmit, onSubmitEdit, onSubmitCorrect }: {
  accounts: CreditAccountSummary[]; existing?: Guarantee; correct?: boolean; onClose: () => void; busy: boolean;
  onSubmit?: (fd: FormData) => Promise<void>; onSubmitEdit?: (body: Record<string, unknown>) => Promise<void>;
  onSubmitCorrect?: (v: { file: File; data: Record<string, unknown>; reason?: string; confirm_no_open_balance: boolean }) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmNoBalance, setConfirmNoBalance] = useState(false);
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, dirtyFields } } = useForm<GForm>({
    defaultValues: existing ? {
      credit_account_id: existing.credit_account_id, guarantee_type: existing.guarantee_type, amount: String(Math.trunc(Number(existing.amount))), document_no: toFaDigits(existing.document_no),
      bank_id: existing.bank_id ?? '', bank_branch_name: existing.bank_branch_name, owner_name: existing.owner_name, due_date: existing.due_date ? gregorianToJalaliText(existing.due_date) : '', guarantor_name: existing.guarantor_name, guarantor_national_id: toFaDigits(existing.guarantor_national_id), issue_place: existing.issue_place,
    } : { credit_account_id: accounts[0]?.id ?? '', guarantee_type: 'PERSONAL_CHEQUE', amount: '', document_no: '', bank_id: '', bank_branch_name: '', owner_name: '', due_date: '', guarantor_name: '', guarantor_national_id: '', issue_place: '' },
  });
  const type = watch('guarantee_type');
  const amount = watch('amount');
  const cheque = type === 'PERSONAL_CHEQUE';
  // BR-CUS-131: چک شخصی bank_id الزامی دارد؛ فهرست از treasury.Bank (GET /customers/banks، 2026-10-22)
  const banks = useBanks();
  const bank = banks.data?.find((b) => b.id === watch('bank_id'));
  const e = (k: keyof GForm) => errors[k]?.message as string | undefined;
  const submit = handleSubmit(async (v) => {
    setErr(null);
    const due = v.due_date ? jalaliTextToGregorian(v.due_date) : null;
    if (v.due_date && !due) { setError('due_date', { message: 'تاریخ شمسی معتبر وارد کنید.' }); return; }
    const vals: Record<string, string> = {
      credit_account_id: v.credit_account_id, guarantee_type: v.guarantee_type, amount: digitsOnly(v.amount), document_no: clean(v.document_no),
      ...(cheque && v.bank_id ? { bank_id: v.bank_id } : {}), bank_branch_name: v.bank_branch_name.trim(), owner_name: v.owner_name.trim(), guarantor_name: v.guarantor_name.trim(), guarantor_national_id: clean(v.guarantor_national_id), issue_place: v.issue_place.trim(), ...(due ? { due_date: due } : {}),
    };
    try {
      if (existing && correct && onSubmitCorrect) {
        if (!file) { setErr('تصویر سند جایگزین الزامی است.'); return; }
        if (!confirmNoBalance) { setErr('تأیید نبود بدهی باز روی این ضمانت الزامی است.'); return; }
        const data: Record<string, unknown> = {};
        (Object.keys(dirtyFields) as (keyof GForm)[]).forEach((k) => { if (k !== 'credit_account_id' && k !== 'guarantee_type' && vals[k] !== undefined && vals[k] !== '') data[k] = vals[k]; });
        await onSubmitCorrect({ file, data, reason: reason.trim() || undefined, confirm_no_open_balance: true });
      } else if (existing && onSubmitEdit) {
        const body: Record<string, unknown> = {};
        (Object.keys(dirtyFields) as (keyof GForm)[]).forEach((k) => { if (k !== 'credit_account_id' && k !== 'guarantee_type' && vals[k] !== undefined && vals[k] !== '') body[k] = vals[k]; });
        if (!Object.keys(body).length) { setErr('تغییری برای ذخیره وجود ندارد.'); return; }
        await onSubmitEdit(body);
      } else if (onSubmit) {
        if (!file) { setErr('تصویر ضمانت الزامی است.'); return; }
        const fd = new FormData();
        Object.entries(vals).forEach(([k, val]) => { if (val !== '') fd.append(k, val); });
        fd.append('file', file);
        await onSubmit(fd);
      }
    } catch (ex) { const rest = applyServerErrors(ex, setError, Object.keys(v)); setErr(rest.join(' ') || 'برخی فیلدها نیاز به اصلاح دارند.'); }
  });
  return (
    <Modal open onClose={onClose} title={correct ? 'اصلاح ضمانت فعال' : existing ? 'ویرایش ضمانت در انتظار تأیید' : 'افزودن ضمانت'} width={760}
      footer={<><Button onClick={() => submit()} loading={busy} loadingText="در حال ثبت…">{correct ? 'ثبت سند جایگزین' : existing ? 'ذخیره‌ی تغییرات' : 'ثبت ضمانت'}</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null}
      {correct ? <div style={{ marginBottom: 14 }}><InfoBanner tone="warning">ضمانت فعال درجا عوض نمی‌شود: سند فعلی «آزاد» و سند جایگزین با اطلاعات زیر «در انتظار تأیید» ثبت می‌شود. حساب و نوع ضمانت ثابت می‌مانند، سابقه حذف نمی‌شود و اعتبار تازه خودکار تخصیص نمی‌یابد. اگر با آزاد شدن سند، سقف مثبت حساب صفر شود، فقط سوپر ادمین مجاز است.</InfoBanner></div> : null}
      {!existing ? (
        <div className={s.typeCards} style={{ marginBottom: 16 }}>
          {Object.entries(GUARANTEE_TYPE).map(([value, label]) => (
            <button type="button" key={value} className={`${s.choice} ${type === value ? s.choiceOn : ''}`} onClick={() => setValue('guarantee_type', value, { shouldDirty: true })} aria-pressed={type === value}>
              <span className={s.choiceDot} /><span className={s.choiceText}><span className={s.choiceTitle}>{label}</span><span className={s.choiceDesc}>{value === 'PERSONAL_CHEQUE' ? 'چک صیادی به نام مشتری؛ روی چک عبارت «ضمانت» درج شده باشد' : 'سفته با امضای ضامن'}</span></span>
            </button>
          ))}
        </div>
      ) : null}
      <FormGrid cols={3}>
        <Select label="مربوط به اعتبار" required disabled={!!existing} {...register('credit_account_id', { required: 'حساب اعتباری را انتخاب کنید.' })} error={e('credit_account_id')} options={accounts.map((a) => ({ value: a.id, label: CREDIT_TYPE[a.credit_type]?.label ?? a.credit_type }))} />
        <div style={{ gridColumn: 'span 2' }}>
          <Input label="مبلغ ضمانت" required value={formatAmount(amount)} onChange={(ev) => setValue('amount', digitsOnly(ev.target.value), { shouldDirty: true, shouldValidate: true })} inputMode="numeric" dir="ltr" hint={amount ? rial(amount) : 'مبلغ به ریال'} error={e('amount')} />
          <input type="hidden" {...register('amount', { validate: (v) => Number(digitsOnly(v)) > 0 || 'مبلغ باید بزرگ‌تر از صفر باشد.' })} />
        </div>
        <Input label={cheque ? 'شناسه‌ی صیاد (۱۶ رقم)' : 'شماره‌ی سفته'} required dir="ltr" inputMode="numeric" {...register('document_no', { validate: (v) => (cheque ? /^[0-9]{16}$/.test(clean(v)) || 'شناسه‌ی صیاد باید دقیقاً ۱۶ رقم باشد.' : clean(v).length > 0 || 'شماره‌ی سفته الزامی است.') })} error={e('document_no')} />
        {cheque ? <>
          <Select label="بانک" required placeholder={banks.isLoading ? 'در حال بارگذاری…' : 'انتخاب بانک'} {...register('bank_id', { validate: (v) => !cheque || !!v || 'بانک را انتخاب کنید.' })} error={e('bank_id')}
            options={(banks.data ?? []).map((b) => ({ value: b.id, label: b.title }))} hint={bank ? <span className={s.bankCell}><BankLogo bank={bank} /> {bank.title}</span> : undefined} />
          <Input label="نام شعبه" required {...register('bank_branch_name', { validate: (v) => !cheque || v.trim().length > 0 || 'نام شعبه الزامی است.' })} error={e('bank_branch_name')} placeholder="مثلاً شعبه‌ی میدان ونک" />
          <Input label="صاحب حساب" required {...register('owner_name', { validate: (v) => !cheque || v.trim().length > 0 || 'صاحب حساب الزامی است.' })} error={e('owner_name')} />
          <JalaliDateInput label="تاریخ سررسید چک" required maxYear={1500} {...register('due_date', { validate: (v) => !cheque || v.trim().length > 0 || 'سررسید چک الزامی است.' })} error={e('due_date')} dir="ltr" placeholder="۱۴۰۵/۰۳/۱۵" />
        </> : <>
          <Input label="نام ضامن" required {...register('guarantor_name', { validate: (v) => cheque || v.trim().length > 0 || 'نام ضامن الزامی است.' })} error={e('guarantor_name')} />
          <Input label="کد ملی ضامن" required dir="ltr" inputMode="numeric" {...register('guarantor_national_id', { validate: (v) => cheque || isNationalId(v) || 'کد ملی ضامن معتبر نیست.' })} error={e('guarantor_national_id')} />
          <Input label="محل تنظیم" {...register('issue_place')} />
          <JalaliDateInput label="تاریخ سررسید" maxYear={1500} {...register('due_date')} error={e('due_date')} dir="ltr" placeholder="۱۴۰۵/۰۶/۱۰" />
        </>}
      </FormGrid>
      {!existing || correct ? (
        <label className={`${s.docDrop} ${file ? s.docDropOk : ''}`} style={{ marginTop: 16 }}>
          <IconDownload size={18} style={{ transform: 'rotate(180deg)' }} />
          <span className={s.choiceText}><span className={s.choiceTitle}>تصویر {correct ? 'سند جایگزین' : cheque ? 'چک' : 'سفته'} (الزامی)</span><span className={s.choiceDesc}>{file ? `${file.name} — ${faNum(Math.round(file.size / 1024))} کیلوبایت` : 'JPEG، PNG، WebP یا PDF — حداکثر ۵ مگابایت'}</span></span>
          <input type="file" accept={ACCEPT} onChange={(ev) => { const f = ev.target.files?.[0] ?? null; if (f && f.size > MAX) { setErr('حجم فایل بیش از ۵ مگابایت است.'); return; } setFile(f); }} />
        </label>
      ) : <p className={s.sub} style={{ marginTop: 12 }}>برای جایگزینی تصویر از دکمه‌ی «تصویر جدید» در جدول استفاده کنید.</p>}
      {correct ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <Textarea label="توضیح اصلاح (اختیاری)" rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} hint="در سابقه‌ی تغییرات ثبت می‌شود." />
          <Toggle checked={confirmNoBalance} onChange={setConfirmNoBalance} label="تأیید می‌کنم مشتری روی این ضمانت بدهی طلایی باز یا چک وصول‌نشده ندارد (سامانه خودش بررسی نمی‌کند)." />
        </div>
      ) : null}
    </Modal>
  );
}

/** لوگوی بانک (public/banks/<logo>)؛ بدون لوگو ⇐ حرف اول نام */
export function BankLogo({ bank, size = 20 }: { bank: Pick<Bank, 'title' | 'logo'>; size?: number }) {
  if (bank.logo) return <img className={s.bankLogo} src={`/banks/${bank.logo}`} alt="" width={size} height={size} loading="lazy" />;
  const ch = bank.title.replace(/^(بانک|مؤسسه اعتباری|پست بانک)\s*/, '').trim().charAt(0) || bank.title.charAt(0);
  return <span className={s.bankMono} style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }} aria-hidden>{ch}</span>;
}
