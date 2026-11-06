import { useState } from 'react';
import { IconCoin, IconHistory, IconMinus, IconPlus, IconReceipt2, IconStar } from '@tabler/icons-react';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDateTime, faNum } from '@/shared/lib/format';
import { toFaDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Input, Select, Textarea } from '@/shared/ui/form';
import { Stepper } from '@/shared/ui/Stepper';
import { Badge, Card, ErrorBox, InfoBanner, Modal, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useAccountHistory, useCreditSummary, useCreditWrite, useSetPaymentDueDays, type ChangeRequest, type CreditAccountSummary, type CustomerDetail } from '../api';
import { AmountInput, ReasonModal, SourceTag, TierText, digitsOnly, rial } from '../components';
import { ACCOUNT_STATUS, CHANGE_DIRECTION, CHANGE_STATUS, CREDIT_TYPE } from '../labels';
import { GuaranteesSection } from './GuaranteesSection';
import { LocksSection } from './LocksSection';
import s from '../customers.module.css';

/** تب «اعتبارات»: حساب چکی و طلایی، ضمانت‌ها، قفل مالی، مهلت فاکتور — GET /profiles/{id}/credit و endpointهای اعتبار */
export function CreditTab({ c }: { c: CustomerDetail }) {
  const summary = useCreditSummary(c.id, true);
  if (summary.isLoading) return <SkeletonRows rows={3} height={120} />;
  if (summary.error || !summary.data) return <ErrorBox error={summary.error} onRetry={() => summary.refetch()} />;
  const byType = (t: 'CHEQUE' | 'GOLDEN') => summary.data!.credit_accounts.find((a) => a.credit_type === t) ?? null;
  return (
    <div className={s.stack}>
      {summary.data.effective_credit_locks.length ? <InfoBanner tone="warning">این مشتری قفل مالی مؤثر دارد: تا رفع قفل، فقط خرید نقدی و بدون تخفیف مجاز است. جزئیات در بخش «قفل مالی» همین تب.</InfoBanner> : null}
      <div className={s.grid2eq}>
        <AccountCard c={c} type="CHEQUE" account={byType('CHEQUE')} />
        <AccountCard c={c} type="GOLDEN" account={byType('GOLDEN')} />
      </div>
      <PaymentDueCard c={c} />
      <GuaranteesSection c={c} accounts={summary.data.credit_accounts} />
      <LocksSection c={c} />
    </div>
  );
}

function AccountCard({ c, type, account }: { c: CustomerDetail; type: 'CHEQUE' | 'GOLDEN'; account: CreditAccountSummary | null }) {
  const can = usePerm();
  const { user } = useAuth();
  const toast = useToast();
  const w = useCreditWrite(c.id);
  const [limit, setLimit] = useState<'INCREASE' | 'DECREASE' | null>(null);
  const [term, setTerm] = useState(false);
  const [status, setStatus] = useState(false);
  const [stepwise, setStepwise] = useState(false);
  const [stepReset, setStepReset] = useState(false);
  const prefix = type === 'CHEQUE' ? 'cheque' : 'golden';
  const termAttr = c.attributes?.[`${prefix}_term_months`];
  const stepAttr = c.attributes?.[`${prefix}_stepwise_increase`];
  const [history, setHistory] = useState(false);
  const canUpdate = can('customers.profiles.credit_policy.update');
  const canApprove = can('customers.profiles.credit_policy.approve');
  const isSuper = !!user?.is_superuser;
  const eligible = type === 'CHEQUE' ? c.cooperation_level !== 'BRONZE' : c.cooperation_level === 'GOLD';
  const t = CREDIT_TYPE[type]!;
  const head = `${s.creditHead} ${type === 'CHEQUE' ? s.creditHeadCheque : s.creditHeadGolden}`;
  const icon = type === 'CHEQUE' ? <IconReceipt2 size={20} /> : <IconStar size={20} />;

  if (!account) {
    return (
      <section className={s.creditCard}>
        <div className={head}><div className={s.creditTitle}><span className={s.creditIcon}>{icon}</span>{t.label}</div><Badge tone="neutral">سقف تعیین نشده</Badge></div>
        <div className={s.creditEmpty}>
          <p className={s.sub}>
            {eligible ? `برای این مشتری هنوز سقف ${t.label} تعیین نشده است.` : <>سطح همکاری <TierText level={c.cooperation_level} /> {t.label} را اجازه نمی‌دهد.</>}
          </p>
          {/* «حساب اعتباری» در این دامنه فقط رکورد سقف و مهلت است (BR-CUS-110)؛ تا رکورد ساخته نشود سقف قابل ثبت نیست. سوپر ادمین بلافاصله مبلغ سقف را وارد می‌کند. */}
          {canUpdate && eligible ? (
            <Button variant="secondary" loading={w.open.isPending} onClick={async () => {
              try { await w.open.mutateAsync(type); if (isSuper) setLimit('INCREASE'); else toast(`${t.label} با سقف صفر ثبت شد؛ مبلغ سقف را سوپر ادمین تعیین می‌کند.`); }
              catch (e) { toast(userMessage(e), 'error'); }
            }}>تعیین سقف {t.label}</Button>
          ) : null}
        </div>
      </section>
    );
  }
  const st = ACCOUNT_STATUS[account.status]!;
  const closed = account.status === 'CLOSED';
  return (
    <section className={s.creditCard}>
      <div className={head}>
        <div className={s.creditTitle}><span className={s.creditIcon}>{icon}</span>{t.label}</div>
        <span className={s.flags}><Badge tone={st.tone}>{st.label}</Badge>{account.stepwise_increase ? <Badge tone="info">افزایش پله‌ای فعال</Badge> : null}<SourceTag a={stepAttr} /></span>
      </div>
      <div className={s.creditBody}>
        <div className={s.creditRow}><span>سقف اعتبار</span><b className={s.creditBig}>{rial(account.credit_limit)}</b></div>
        <div className={s.creditRow}><span>{type === 'CHEQUE' ? 'حداکثر راس چک' : 'مهلت تسویه'}</span><span className={s.flags}><SourceTag a={termAttr} /><b>{faNum(account.term_months)} ماه</b></span></div>
        <div className={s.creditRow}><span>اعتبار مصرف‌شده</span><b className={s.muted}>— <Badge tone="neutral">به‌زودی</Badge></b></div>
        <div className={s.creditRow}><span>مانده‌ی اعتبار</span><b className={s.muted}>— <Badge tone="neutral">به‌زودی</Badge></b></div>
        <div className={s.sub}>{st.hint} آخرین تغییر: {faDateTime(account.updated_at)}</div>
      </div>
      <div className={s.creditFoot}>
        {isSuper ? <>
          <Button size="sm" icon={<IconPlus size={15} />} disabled={closed} onClick={() => setLimit('INCREASE')}>افزایش</Button>
          <Button size="sm" variant="secondary" icon={<IconMinus size={15} />} disabled={closed || Number(account.credit_limit) <= 0} onClick={() => setLimit('DECREASE')}>کاهش</Button>
        </> : <span className={s.sub} data-tip="تغییر مبلغ سقف فقط توسط سوپر ادمین انجام می‌شود">تغییر سقف: فقط سوپر ادمین</span>}
        {canUpdate ? <Button size="sm" variant="secondary" disabled={closed} onClick={() => setTerm(true)}>مهلت</Button> : null}
        {canUpdate ? <Button size="sm" variant="secondary" disabled={closed} onClick={() => setStatus(true)}>وضعیت</Button> : null}
        {(account.stepwise_increase ? canApprove : canUpdate) ? <Button size="sm" variant="secondary" disabled={closed} onClick={() => setStepwise(true)}>{account.stepwise_increase ? 'خاموش کردن پله‌ای' : 'روشن کردن پله‌ای'}</Button> : null}
        {canApprove && account.own_stepwise_increase !== null && account.own_stepwise_increase !== undefined ? <Button size="sm" variant="ghost" disabled={closed} onClick={() => setStepReset(true)} data-tip="مقدار پله‌ای از گروه یا پیش‌فرض خوانده شود">پله‌ای از گروه/پیش‌فرض</Button> : null}
        <Button size="sm" variant="ghost" icon={<IconHistory size={15} />} onClick={() => setHistory(true)} aria-label="تاریخچه‌ی تغییرات سقف">تاریخچه</Button>
      </div>

      {limit ? <LimitModal account={account} direction={limit} onClose={() => setLimit(null)} busy={w.limit.isPending}
        onSubmit={async (amount, reason) => { await w.limit.mutateAsync({ id: account.id, direction: limit, amount, reason, expected_updated_at: account.updated_at }); toast(limit === 'INCREASE' ? 'سقف اعتبار افزایش یافت.' : 'سقف اعتبار کاهش یافت.'); setLimit(null); }} /> : null}
      {term ? <TermModal account={account} onClose={() => setTerm(false)} busy={w.term.isPending} onSubmit={async (m) => { await w.term.mutateAsync({ id: account.id, term_months: m }); toast(m === null ? 'مهلت حساب از گروه/پیش‌فرض خوانده می‌شود.' : 'مهلت حساب ذخیره شد.'); setTerm(false); }} /> : null}
      <ReasonModal open={stepReset} onClose={() => setStepReset(false)} busy={w.stepwiseReset.isPending} title="افزایش پله‌ای از گروه / پیش‌فرض"
        intro="مقدار پله‌ای این حساب پاک می‌شود و از گروه فعال مشتری (به تفکیک نوع حساب) و وگرنه پیش‌فرض سیستم (روشن) خوانده می‌شود."
        onConfirm={async (reason) => { await w.stepwiseReset.mutateAsync({ id: account.id, reason }); toast('پله‌ای از گروه/پیش‌فرض خوانده می‌شود.'); setStepReset(false); }} />
      {status ? <StatusModal account={account} onClose={() => setStatus(false)} busy={w.status.isPending} onSubmit={async (st2, reason) => { await w.status.mutateAsync({ id: account.id, status: st2, reason }); toast('وضعیت حساب تغییر کرد.'); setStatus(false); }} /> : null}
      <ReasonModal open={stepwise} onClose={() => setStepwise(false)} busy={w.stepwise.isPending} title={account.stepwise_increase ? 'خاموش کردن افزایش پله‌ای مهلت' : 'روشن کردن افزایش پله‌ای مهلت'}
        intro={account.stepwise_increase ? 'با خاموش شدن، مهلت در هر تغییر می‌تواند بیش از یک ماه بالا برود (فقط مدیر اعتبارات).' : 'با روشن شدن، هر تغییر مهلت حداکثر یک ماه بالا می‌رود؛ کاهش همیشه آزاد است.'}
        onConfirm={async (reason) => { await w.stepwise.mutateAsync({ id: account.id, enabled: !account.stepwise_increase, reason }); toast('تنظیم افزایش پله‌ای ذخیره شد.'); setStepwise(false); }} />
      {history ? <HistoryModal account={account} onClose={() => setHistory(false)} /> : null}
    </section>
  );
}

/** تغییر فوری سقف (فقط سوپر ادمین، P-07) — expected_updated_at = updated_at حساب، بدون تبدیل به Date */
function LimitModal({ account, direction, onClose, busy, onSubmit }: { account: CreditAccountSummary; direction: 'INCREASE' | 'DECREASE'; onClose: () => void; busy: boolean; onSubmit: (amount: string, reason: string) => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const cur = Number(account.credit_limit);
  const n = Number(amount || 0);
  const after = direction === 'INCREASE' ? cur + n : cur - n;
  const d = CHANGE_DIRECTION[direction]!;
  const valid = n > 0 && after >= 0 && reason.trim();
  return (
    <Modal open onClose={onClose} title={`${d.label} سقف ${CREDIT_TYPE[account.credit_type]?.label}`} width={560}
      footer={<><Button variant={direction === 'DECREASE' ? 'danger' : 'primary'} loading={busy} disabled={!valid} onClick={async () => { try { await onSubmit(amount, reason.trim()); } catch (e) { setErr(userMessage(e)); } }}>ثبت {d.label}</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.summary} style={{ marginBottom: 16 }}>
        <div><div className={s.sub}>سقف فعلی</div><b>{rial(account.credit_limit)}</b></div>
        <div><div className={s.sub}>مبلغ {d.label}</div><b>{n ? rial(n) : '—'}</b></div>
        <div><div className={s.sub}>سقف پس از تغییر</div><b style={{ color: after < 0 ? 'var(--danger)' : 'var(--ink-900)' }}>{n ? rial(after) : '—'}</b></div>
      </div>
      <AmountInput label={`مبلغ ${d.label}`} required value={amount} onChange={setAmount} shortcuts={[200_000_000, 500_000_000, 1_000_000_000]} error={after < 0 ? 'مبلغ کاهش از سقف فعلی بیشتر است.' : undefined} />
      <div style={{ marginTop: 14 }}><Textarea label="دلیل" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <p className={s.sub} style={{ marginTop: 10 }}>تغییر بلافاصله اعمال می‌شود و در تاریخچه‌ی حساب ثبت می‌گردد. ضمانت سقف را خودکار زیاد نمی‌کند.</p>
      {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
    </Modal>
  );
}

function TermModal({ account, onClose, busy, onSubmit }: { account: CreditAccountSummary; onClose: () => void; busy: boolean; onSubmit: (months: number | null) => Promise<void> }) {
  const [m, setM] = useState(account.term_months);
  const [err, setErr] = useState<string | null>(null);
  const jump = account.stepwise_increase && m > account.term_months + 1;
  return (
    <Modal open onClose={onClose} title={account.credit_type === 'CHEQUE' ? 'حداکثر راس چک (ماه)' : 'مهلت تسویه‌ی اعتبار طلایی (ماه)'} width={480}
      footer={<><Button loading={busy} disabled={(m === account.term_months && account.own_term_months !== null) || jump} onClick={async () => { try { await onSubmit(m); } catch (e) { setErr(userMessage(e)); } }}>ذخیره‌ی مهلت</Button>{account.own_term_months !== null && account.own_term_months !== undefined ? <Button variant="ghost" disabled={busy} onClick={async () => { try { await onSubmit(null); } catch (e) { setErr(userMessage(e)); } }}>از گروه / پیش‌فرض</Button> : null}<Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <p className={s.intro}>بین ۱ تا ۲۴ ماه. {account.stepwise_increase ? 'افزایش پله‌ای روشن است: در هر تغییر حداکثر یک ماه بالا می‌رود؛ کاهش آزاد است.' : 'افزایش پله‌ای خاموش است: هر عدد ۱ تا ۲۴ مجاز است.'}</p>
      <div className={s.rowBetween}><span>مهلت فعلی: <b>{faNum(account.term_months)} ماه</b></span><Stepper label="مهلت به ماه" value={m} onChange={setM} min={1} max={24} unit="ماه" /></div>
      {jump ? <div style={{ marginTop: 12 }}><Alert>با پله‌ای روشن، مهلت فقط تا {faNum(account.term_months + 1)} ماه قابل افزایش است.</Alert></div> : null}
      {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
    </Modal>
  );
}

function StatusModal({ account, onClose, busy, onSubmit }: { account: CreditAccountSummary; onClose: () => void; busy: boolean; onSubmit: (status: string, reason: string) => Promise<void> }) {
  // BR-CUS-123: ACTIVE ⇄ SUSPENDED دستی؛ هر وضعیت ⇐ CLOSED؛ FROZEN دستی گذاشته/برداشته نمی‌شود
  // BR-CUS-057 (2026-10-24): FROZEN مشتق است؛ فرم روی وضعیت ذخیره‌شده‌ی دستی (stored_status) کار می‌کند
  const stored = account.stored_status ?? account.status;
  const options = [
    ...(stored === 'SUSPENDED' ? [{ value: 'ACTIVE', label: 'فعال' }] : []),
    ...(stored === 'ACTIVE' ? [{ value: 'SUSPENDED', label: 'معلق (برگشت‌پذیر)' }] : []),
    { value: 'CLOSED', label: 'بسته (نهایی و بدون برگشت)' },
  ];
  const [st, setSt] = useState(options[0]!.value);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="تغییر وضعیت حساب اعتباری" width={480}
      footer={<><Button variant={st === 'CLOSED' ? 'danger' : 'primary'} loading={busy} disabled={!reason.trim()} onClick={async () => { try { await onSubmit(st, reason.trim()); } catch (e) { setErr(userMessage(e)); } }}>ثبت وضعیت</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <p className={s.intro}>وضعیت دستی: <b>{ACCOUNT_STATUS[stored]?.label}</b>.{account.status === 'FROZEN' ? <> وضعیت مؤثر: <b>{ACCOUNT_STATUS.FROZEN?.label}</b> — سطح همکاری مؤثر مشتری این نوع اعتبار را اجازه نمی‌دهد؛ منجمد بودن دستی تعیین یا برداشته نمی‌شود و با تغییر سطح (در پرونده یا گروه) خودش برطرف می‌شود. تعلیق یا بستن همچنان ممکن است.</> : null}</p>
      <Select label="وضعیت جدید" value={st} onChange={(e) => setSt(e.target.value)} options={options} />
      <div style={{ marginTop: 12 }}><Textarea label="دلیل" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {st === 'CLOSED' ? <div style={{ marginTop: 12 }}><InfoBanner tone="warning">حساب بسته دیگر باز نمی‌شود و هیچ تغییری روی آن ممکن نیست.</InfoBanner></div> : null}
      {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
    </Modal>
  );
}

function HistoryModal({ account, onClose }: { account: CreditAccountSummary; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const h = useAccountHistory(account.id, { page, page_size: 10 });
  const cols: Column<ChangeRequest>[] = [
    { key: 'd', header: 'تاریخ', render: (r) => <span className={s.muted}>{faDateTime(r.created_at)}</span> },
    { key: 'dir', header: 'نوع', render: (r) => <Badge tone={CHANGE_DIRECTION[r.direction]?.tone ?? 'neutral'}>{CHANGE_DIRECTION[r.direction]?.label ?? r.direction}</Badge> },
    { key: 'amt', header: 'مبلغ', render: (r) => <span className="tnum">{rial(r.amount)}</span> },
    { key: 'b', header: 'سقف قبل', render: (r) => <span className="tnum">{rial(r.limit_before)}</span> },
    { key: 'a', header: 'سقف بعد', render: (r) => <span className="tnum">{rial(r.limit_after)}</span> },
    { key: 'st', header: 'وضعیت', render: (r) => <Badge tone={CHANGE_STATUS[r.status]?.tone ?? 'neutral'}>{CHANGE_STATUS[r.status]?.label ?? r.status}</Badge> },
    { key: 'note', header: 'توضیح', render: (r) => r.note || r.reject_reason || '—' },
  ];
  return (
    <Modal open onClose={onClose} title={`تاریخچه‌ی سقف ${CREDIT_TYPE[account.credit_type]?.label}`} width={900}>
      <DataTable columns={cols} rows={h.data?.results} rowKey={(r) => r.id} loading={h.isLoading} error={h.error} onRetry={() => h.refetch()} empty={<div className={s.sub} style={{ padding: 24, textAlign: 'center' }}>هنوز تغییری روی سقف این حساب ثبت نشده است.</div>} />
      {h.data && h.data.total > 10 ? <Pagination page={page} pageSize={10} total={h.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}

/** مهلت تسویه‌ی فاکتور اعتباری (روز) — PUT /profiles/{id}/credit-policy؛ null = پیش‌فرض سامانه */
function PaymentDueCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const toast = useToast();
  const set = useSetPaymentDueDays(c.id);
  const due = c.attributes?.payment_due_days;
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(c.payment_due_days ? String(c.payment_due_days) : '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <div className={s.rowBetween}>
        <div className={s.creditTitle}><span className={s.creditIcon}><IconCoin size={20} /></span>مهلت تسویه‌ی فاکتور اعتباری</div>
        <div className={s.flags}>
          <SourceTag a={due} />
          <b className="tnum">{c.payment_due_days ? `${faNum(c.payment_due_days)} روز` : `پیش‌فرض سامانه${c.effective_payment_due_days ? ` (${faNum(c.effective_payment_due_days)} روز)` : ''}`}</b>
          {can('customers.profiles.credit_policy.update') ? <Button size="sm" variant="secondary" onClick={() => { setVal(due?.own != null ? String(due.own) : ''); setOpen(true); }}>تغییر</Button> : null}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="مهلت تسویه‌ی فاکتور اعتباری" width={460}
        footer={<><Button loading={set.isPending} onClick={async () => { const n = val ? Number(digitsOnly(val)) : null; if (n !== null && !(n >= 1)) { setErr('عدد روز باید ۱ یا بیشتر باشد.'); return; } try { await set.mutateAsync({ payment_due_days: n, expected_version: c.version }); toast('مهلت تسویه ذخیره شد.'); setOpen(false); } catch (e) { setErr(userMessage(e)); } }}>ذخیره</Button><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button></>}>
        <Input label="مهلت به روز" value={toFaDigits(val)} onChange={(e) => setVal(digitsOnly(e.target.value))} inputMode="numeric" dir="ltr" hint="خالی = از گروه فعال مشتری و وگرنه پیش‌فرض سامانه (تنظیمات)" />
        {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
      </Modal>
    </Card>
  );
}
