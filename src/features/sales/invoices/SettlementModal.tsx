import { useRef, useState } from 'react';
import { IconCheck, IconDownload, IconFileUpload, IconPrinter, IconReceipt, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, jalaliTextToGregorian } from '@/shared/lib/format';
import { groupMoney, moneyDigits } from '@/shared/lib/money';
import { toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dropdown } from '@/shared/ui/Dropdown';
import { Field, Input, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Empty, ErrorBox, Modal, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { ApiError } from '@/shared/api/errors';
import { money, openPrivateFile, personName, SP, useBanks } from '../api/common';
import { useInvoice, useSettlementWrite, type EChequeStep, type Settlement, type SettlementIn } from '../api/invoices';
import { ICON_SM, ReasonModal } from '../components';
import { labelOf, SETTLEMENT_ROW_METHOD, SETTLEMENT_ROW_STATUS, toneOf, type SettlementRowMethod } from '../labels';
import s from '../sales.module.css';

/**
 * مودال «ثبت تسویه» فاکتور صادرشده (بک‌اند services/settlement.py؛ html این مودال را ندارد و هم‌خوان با بقیه‌ی پنل ساخته شد).
 * - روش‌ها: نقدی، کارتخوان، حواله (کد رهگیری الزامی)، چک (بانک و سررسید الزامی؛ صیاد ۱۶ رقم، کد ملی صاحب حساب ۱۰ رقم)، اعتباری
 *   (سررسید خالی = تاریخ فاکتور + مهلت تسویه‌ی مشتری). «بیعانه‌ی پیش‌فروش» تا ساخت پیش‌فروش نمایش داده نمی‌شود (تصمیم با افشین).
 * - مبلغ بیشتر از صفر و حداکثر مانده؛ فقط کلیدهای همان روش فرستاده می‌شود (کلید اضافه ۴۲۲ است).
 * - ردیف «ثبت شده» با دلیل لغو می‌شود (تنها راه کم کردن تسویه)؛ ردیف وصول‌شده‌ی خزانه‌داری قفل است.
 * - چک الکترونیکی سه مرحله‌ی ترتیبی دارد: چاپ چک ⇐ دریافت رسید از مشتری ⇐ بارگذاری چک امضاشده (PDF، JPEG یا PNG تا ۵ مگابایت).
 */
const WIDTH = 1080;
const MB = 1_048_576;
const MAX_FILE_MB = 5;
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const SAYAD_LEN = 16;
const NID_LEN = 10;
const LEGAL_NID_LEN = 11;
/** ساعت ثبت تاریخ پرداخت انتخاب‌شده (ظهر تهران تا روز در هیچ منطقه‌ی زمانی جابه‌جا نشود) */
const NOON_TEHRAN = 'T12:00:00+03:30';
const METHODS: SettlementRowMethod[] = ['CASH', 'POS', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'];

type Form = {
  method: SettlementRowMethod; amount: string; paid: string; note: string;
  tracking_no: string; deposit: string; source_bank_name: string; source_account_no: string;
  bank_id: string; due: string; sayad_code: string; cheque_serial: string; bank_branch_name: string; owner_name: string; owner_national_id: string;
};
const EMPTY: Form = {
  method: 'CASH', amount: '', paid: '', note: '', tracking_no: '', deposit: '', source_bank_name: '', source_account_no: '',
  bank_id: '', due: '', sayad_code: '', cheque_serial: '', bank_branch_name: '', owner_name: '', owner_national_id: '',
};
const digits = (v: string) => {
  // Latin digits only: strips "-" from "12-34" (⇒ "1234"); "1234" stays. https://regex101.com/?regex=%5B%5E0-9%5D&testString=12-34
  return toLatinDigits(v).replace(/[^0-9]/g, '');
};
/** مقایسه‌ی دو مبلغ رشته‌ای بدون از دست دادن دقت */
const bigOf = (v: string) => BigInt(moneyDigits(v) || '0');
const ZERO = BigInt(0);
const HTTP_BAD_REQUEST = 400;

/** بدنه‌ی هر روش فقط با کلیدهای همان روش؛ خطای فرم سمت فرانت پیش از ارسال */
function build(f: Form, outstanding: string): { body?: SettlementIn; errs: Record<string, string> } {
  const errs: Record<string, string> = {};
  const amount = moneyDigits(f.amount);
  if (!amount || bigOf(amount) <= ZERO) errs.amount = 'مبلغ باید بیشتر از صفر باشد.';
  else if (bigOf(amount) > bigOf(outstanding)) errs.amount = `مبلغ از مانده‌ی فاکتور (${money(outstanding)} ریال) بیشتر است.`;
  const paidAt = f.paid ? jalaliTextToGregorian(f.paid) : null;
  if (f.paid && !paidAt) errs.paid = 'تاریخ نامعتبر است.';
  // کلیدهای متنی schema پیش‌فرض خالی دارند ⇐ خالی فرستاده می‌شوند؛ کلیدهای هر روش پایین‌تر پر می‌شوند
  const body: SettlementIn = {
    method: f.method, amount, note: f.note.trim(), paid_at: paidAt ? `${paidAt}${NOON_TEHRAN}` : null,
    tracking_no: '', source_bank_name: '', source_account_no: '', bank_branch_name: '', cheque_serial: '', sayad_code: '', owner_name: '', owner_national_id: '', source_payment_ref: '',
  };
  if (f.method === 'BANK_TRANSFER') {
    if (!f.tracking_no.trim()) errs.tracking_no = 'کد رهگیری حواله الزامی است.';
    const dep = f.deposit ? jalaliTextToGregorian(f.deposit) : null;
    if (f.deposit && !dep) errs.deposit = 'تاریخ نامعتبر است.';
    Object.assign(body, { tracking_no: toLatinDigits(f.tracking_no.trim()), deposit_date: dep, source_bank_name: f.source_bank_name.trim(), source_account_no: digits(f.source_account_no) });
  }
  if (f.method === 'CHEQUE') {
    if (!f.bank_id) errs.bank_id = 'بانک صادرکننده‌ی چک الزامی است.';
    const due = f.due ? jalaliTextToGregorian(f.due) : null;
    if (!due) errs.due = f.due ? 'تاریخ نامعتبر است.' : 'سررسید چک الزامی است.';
    const sayad = digits(f.sayad_code);
    if (sayad && sayad.length !== SAYAD_LEN) errs.sayad_code = 'شناسه‌ی صیاد ۱۶ رقم است.';
    const nid = digits(f.owner_national_id);
    if (nid && nid.length !== NID_LEN && nid.length !== LEGAL_NID_LEN) errs.owner_national_id = 'کد ملی صاحب حساب باید ۱۰ رقم (یا شناسه‌ی ملی ۱۱ رقم) باشد.';
    Object.assign(body, { bank_id: f.bank_id || null, due_date: due, sayad_code: sayad, cheque_serial: toLatinDigits(f.cheque_serial.trim()), bank_branch_name: f.bank_branch_name.trim(), owner_name: f.owner_name.trim(), owner_national_id: nid });
  }
  if (f.method === 'CREDIT') {
    const due = f.due ? jalaliTextToGregorian(f.due) : null;
    if (f.due && !due) errs.due = 'تاریخ نامعتبر است.';
    body.due_date = due;
  }
  return Object.keys(errs).length ? { errs } : { body, errs };
}
/** خطای ۴۰۰ بک‌اند به تفکیک فیلد ⇐ نام فیلد فرم */
const FIELD_OF: Record<string, keyof Form> = { due_date: 'due', deposit_date: 'deposit', paid_at: 'paid' };

export function SettlementModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const q = useInvoice(invoiceId);
  const inv = q.data;
  const can = usePerm();
  const canCreate = can('sales.invoices.settlement.create');
  const title = inv?.invoice_number ? <>تسویه‌ی فاکتور <span data-latin>{inv.invoice_number}</span></> : 'تسویه‌ی فاکتور';
  return (
    <Modal open onClose={onClose} width={WIDTH} title={title}>
      {q.isLoading ? <SkeletonRows rows={4} height={56} /> : null}
      {q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : null}
      {inv ? (
        <div className={s.sheet}>
          <div className={s.settleHead}>
            <div className={s.settleStat}><small>مبلغ کل فاکتور (ریال)</small><b className="tnum">{money(inv.total_amount)}</b></div>
            <div className={s.settleStat}><small>تسویه‌شده (ریال)</small><b className="tnum">{money(inv.settled_amount)}</b></div>
            <div className={`${s.settleStat} ${s.settleOut}`}><small>مانده (ریال)</small><b className="tnum">{money(inv.outstanding)}</b></div>
          </div>
          {canCreate && inv.status === 'ISSUED' && bigOf(inv.outstanding) > ZERO ? <NewSettlement invoiceId={inv.id} outstanding={inv.outstanding} /> : null}
          {inv.status === 'ISSUED' && bigOf(inv.outstanding) === ZERO ? <Alert tone="info">این فاکتور کامل تسویه شده است.</Alert> : null}
          <SectionTitle>ردیف‌های تسویه</SectionTitle>
          <Rows rows={inv.settlements ?? []} />
        </div>
      ) : null}
    </Modal>
  );
}

function NewSettlement({ invoiceId, outstanding }: { invoiceId: string; outstanding: string }) {
  const w = useSettlementWrite();
  const toast = useToast();
  const banks = useBanks();
  const [f, setF] = useState<Form>(EMPTY);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => ({ ...x, [k]: v })); setErrs((x) => ({ ...x, [k]: '' })); };
  const submit = async () => {
    setTop(null);
    const r = build(f, outstanding);
    setErrs(r.errs);
    if (!r.body) return;
    try {
      await w.record.mutateAsync({ invoiceId, body: r.body });
      toast('ردیف تسویه ثبت شد.');
      setF(EMPTY);
    } catch (e) {
      if (e instanceof ApiError && e.status === HTTP_BAD_REQUEST && e.detail && typeof e.detail === 'object' && !Array.isArray(e.detail)) {
        const next: Record<string, string> = {};
        const rest: string[] = [];
        Object.entries(e.detail as Record<string, unknown>).forEach(([k, v]) => {
          const msg = Array.isArray(v) ? String(v[0]) : String(v);
          const key = FIELD_OF[k] ?? k;
          if (key in EMPTY && key !== 'method') next[key] = msg; else rest.push(msg);
        });
        setErrs(next);
        if (rest.length) setTop(rest.join('؛ '));
      } else setTop(userMessage(e));
    }
  };
  const m = f.method;
  return (
    <div className={s.settleForm}>
      {top ? <Alert>{top}</Alert> : null}
      <div className={s.settleGrid}>
        <Field label="روش تسویه" required>
          <Dropdown aria-label="روش تسویه" value={m} options={METHODS.map((v) => ({ value: v, label: SETTLEMENT_ROW_METHOD[v] }))} onChange={(e) => set('method', e.target.value as SettlementRowMethod)} />
        </Field>
        <Input label="مبلغ (ریال)" required inputMode="numeric" value={groupMoney(f.amount)} onChange={(e) => set('amount', moneyDigits(e.target.value))} error={errs.amount}
          hint={<>مانده: <span className="tnum">{money(outstanding)}</span> ریال <button type="button" className={s.linkBtn} onClick={() => set('amount', moneyDigits(outstanding))}>کل مانده</button></>} />
        <JalaliDateInput label="تاریخ پرداخت" value={f.paid} onChange={(e) => set('paid', e.target.value)} error={errs.paid} hint="خالی = اکنون" dir="ltr" maxYear={1500} />
        {m === 'BANK_TRANSFER' ? (
          <>
            <Input label="کد رهگیری" required latin value={f.tracking_no} onChange={(e) => set('tracking_no', e.target.value)} error={errs.tracking_no} />
            <JalaliDateInput label="تاریخ واریز" value={f.deposit} onChange={(e) => set('deposit', e.target.value)} error={errs.deposit} dir="ltr" maxYear={1500} />
            <Input label="بانک مبدأ" value={f.source_bank_name} onChange={(e) => set('source_bank_name', e.target.value)} />
            <Input label="شماره حساب مبدأ" latin value={f.source_account_no} onChange={(e) => set('source_account_no', e.target.value)} />
          </>
        ) : null}
        {m === 'CHEQUE' ? (
          <>
            <Field label="بانک صادرکننده" required error={errs.bank_id}>
              <Dropdown aria-label="بانک صادرکننده" value={f.bank_id} placeholder={banks.error ? 'فهرست بانک‌ها در دسترس نیست' : 'انتخاب بانک'} invalid={!!errs.bank_id}
                options={(banks.data ?? []).map((b) => ({ value: b.id, label: b.title }))} onChange={(e) => set('bank_id', e.target.value)} />
            </Field>
            <JalaliDateInput label="سررسید چک" required value={f.due} onChange={(e) => set('due', e.target.value)} error={errs.due} dir="ltr" maxYear={1500} hint="نه پیش از تاریخ فاکتور و نه بیش از مهلت حساب چکی مشتری" />
            <Input label="شناسه صیاد" latin inputMode="numeric" maxLength={SAYAD_LEN} value={f.sayad_code} onChange={(e) => set('sayad_code', e.target.value)} error={errs.sayad_code} hint="۱۶ رقم؛ اختیاری" />
            <Input label="سریال چک" latin value={f.cheque_serial} onChange={(e) => set('cheque_serial', e.target.value)} />
            <Input label="شعبه بانک" value={f.bank_branch_name} onChange={(e) => set('bank_branch_name', e.target.value)} />
            <Input label="نام صاحب حساب" value={f.owner_name} onChange={(e) => set('owner_name', e.target.value)} />
            <Input label="کد ملی صاحب حساب" latin inputMode="numeric" maxLength={LEGAL_NID_LEN} value={f.owner_national_id} onChange={(e) => set('owner_national_id', e.target.value)} error={errs.owner_national_id} />
          </>
        ) : null}
        {m === 'CREDIT' ? <JalaliDateInput label="سررسید" value={f.due} onChange={(e) => set('due', e.target.value)} error={errs.due} dir="ltr" maxYear={1500} hint="خالی = تاریخ فاکتور + مهلت تسویه‌ی مشتری" /> : null}
      </div>
      <Textarea label="توضیحات" rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} />
      <div className={s.settleFoot}>
        <Button variant="ghost" onClick={() => { setF(EMPTY); setErrs({}); setTop(null); }}>پاک کردن</Button>
        <Button icon={<IconCheck size={ICON_SM} />} loading={w.record.isPending} onClick={submit}>ثبت تسویه</Button>
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: Settlement[] }) {
  const can = usePerm();
  const w = useSettlementWrite();
  const toast = useToast();
  const [cancelling, setCancelling] = useState<Settlement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  if (!rows.length) return <Empty icon={<IconReceipt size={26} stroke={1.5} />} title="هنوز تسویه‌ای ثبت نشده است" />;
  const canStep = can('sales.invoices.settlement.create');
  const step = async (r: Settlement, st: EChequeStep, file?: File) => {
    try { await w.eCheque.mutateAsync({ id: r.id, step: st, file }); toast('مرحله‌ی چک الکترونیکی ثبت شد.'); } catch (e) { toast(userMessage(e), 'error'); }
  };
  const pickFile = (f: File | undefined) => {
    const id = uploadFor;
    if (fileRef.current) fileRef.current.value = '';
    setUploadFor(null);
    const r = rows.find((x) => x.id === id);
    if (!f || !r) return;
    if (!FILE_TYPES.includes(f.type) || f.size > MAX_FILE_MB * MB) { toast('فقط PDF، JPEG یا PNG تا ۵ مگابایت پذیرفته می‌شود.', 'error'); return; }
    void step(r, 'signed', f);
  };
  const download = async (r: Settlement) => {
    try { await openPrivateFile(`${SP}/settlements/${r.id}/attachment`); } catch (e) { toast(userMessage(e), 'error'); }
  };
  const details = (r: Settlement) => {
    if (r.method === 'CHEQUE') return [r.bank_name, r.due_date ? `سررسید ${faDate(r.due_date)}` : '', r.sayad_code ? `صیاد ${r.sayad_code}` : ''].filter(Boolean).join(' · ');
    if (r.method === 'BANK_TRANSFER') return [r.tracking_no ? `رهگیری ${r.tracking_no}` : '', r.source_bank_name].filter(Boolean).join(' · ');
    if (r.method === 'CREDIT' && r.due_date) return `سررسید ${faDate(r.due_date)}`;
    return r.note || '';
  };
  return (
    <>
      <table className={s.subTable}>
        <thead><tr><th>روش</th><th>مبلغ (ریال)</th><th>تاریخ</th><th>جزئیات</th><th>وضعیت</th><th>ثبت‌کننده</th><th>چک الکترونیکی</th><th>عملیات</th></tr></thead>
        <tbody>{rows.map((r) => {
          const live = r.status === 'RECORDED';
          const cheque = r.method === 'CHEQUE' && live;
          return (
            <tr key={r.id} className={r.status === 'CANCELLED' ? s.cancelled : undefined}>
              <td>{labelOf(SETTLEMENT_ROW_METHOD, r.method, r.method_display)}</td>
              <td className="tnum">{money(r.amount)}</td>
              <td>{faDateTime(r.paid_at)}</td>
              <td data-latin>{details(r) || '—'}</td>
              <td>
                <Badge tone={toneOf(SETTLEMENT_ROW_STATUS, r.status)}>{labelOf(SETTLEMENT_ROW_STATUS, r.status, r.status_display)}</Badge>
                {r.cancel_reason ? <span className={s.sub}>{r.cancel_reason}</span> : null}
              </td>
              <td>{personName(r.recorded_by)}</td>
              <td>{r.method === 'CHEQUE' ? (
                <span className={s.steps}>
                  <StepBtn done={!!r.e_cheque_printed_at} at={r.e_cheque_printed_at} disabled={!cheque || !canStep} label="چاپ چک" icon={<IconPrinter size={13} />} onClick={() => void step(r, 'printed')} />
                  <StepBtn done={!!r.e_cheque_receipt_at} at={r.e_cheque_receipt_at} disabled={!cheque || !canStep || !r.e_cheque_printed_at} why={r.e_cheque_printed_at ? null : 'ابتدا چک را چاپ کنید.'} label="دریافت رسید" icon={<IconReceipt size={13} />} onClick={() => void step(r, 'receipt')} />
                  <StepBtn done={r.has_attachment} disabled={!cheque || !canStep || !r.e_cheque_receipt_at} why={r.e_cheque_receipt_at ? null : 'ابتدا رسید چک الکترونیکی را ثبت کنید.'} label="چک امضاشده" icon={<IconFileUpload size={13} />} onClick={() => { setUploadFor(r.id); fileRef.current?.click(); }} />
                  {r.has_attachment && can('sales.invoices.settlement.read') ? (
                    <button type="button" className={s.iconBtn} aria-label="دانلود چک امضاشده" data-tip="دانلود چک امضاشده" onClick={() => void download(r)}><IconDownload size={14} /></button>
                  ) : null}
                </span>
              ) : '—'}</td>
              <td>{live && can('sales.invoices.settlement.delete') ? <Button size="sm" variant="danger" icon={<IconX size={13} />} onClick={() => setCancelling(r)}>لغو</Button> : '—'}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png" aria-label="فایل چک امضاشده" onChange={(e) => pickFile(e.target.files?.[0])} />
      <ReasonModal open={!!cancelling} onClose={() => setCancelling(null)} title="لغو ردیف تسویه" confirmText="لغو ردیف" danger label="دلیل لغو"
        intro={cancelling ? <>ردیف {labelOf(SETTLEMENT_ROW_METHOD, cancelling.method, cancelling.method_display)} به مبلغ {money(cancelling.amount)} ریال لغو می‌شود و مانده‌ی فاکتور برمی‌گردد. ردیف با وضعیت «لغو شده» می‌ماند.</> : null}
        onConfirm={async (reason) => { if (cancelling) { await w.cancel.mutateAsync({ id: cancelling.id, reason }); toast('ردیف تسویه لغو شد.'); } }} />
    </>
  );
}

function StepBtn({ done, at, disabled, why, label, icon, onClick }: { done: boolean; at?: string | null; disabled: boolean; why?: string | null; label: string; icon: React.ReactNode; onClick: () => void }) {
  if (done) return <span className={`${s.step} ${s.stepDone}`} data-tip={at ? faDateTime(at) : label}><IconCheck size={13} />{label}</span>;
  return <span data-tip={(disabled && why) || label}><button type="button" className={`${s.step} ${disabled ? '' : s.stepNext}`} disabled={disabled} onClick={onClick}>{icon}{label}</button></span>;
}
