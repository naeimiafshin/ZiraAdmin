import { useState } from 'react';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Badge, Rial } from '@/shared/ui/kit';
import { SoonTag } from '@/features/branches/SoonTag';
import { labelOf, STAGE_STATUS, toneOf } from './labels';
import { Approvals, Decisions, Votes } from './RequestDetail';
import { int, isCustomerRequest, type SupplyRequest } from './requestsApi';
import { Shell } from './RequestShell';
import s from './supply.module.css';

/**
 * مودال‌های ستون‌های فهرست درخواست‌های تأمین (افشین ۱۴ آبان ۱۴۰۵، html «لیست پیش‌سفارشات»):
 * - «آرا»: آرای شورا، فرم رأی من و تصمیم مدیر تأمین (همان بخش‌های جزئیات).
 * - «بیعانه»: چهار گام html — مبلغ و خلاصه، نحوه‌ی پرداخت، اسناد پرداختی، وضعیت تأیید مالی (با دکمه‌های مالی در مرحله‌ی خودش).
 * - «وضعیت مالی»: وضعیت تأیید مالی و سابقه و دکمه‌های مالی.
 * هر مودال جزئیات کامل درخواست را از GET /supply/requests/{id} می‌گیرد (آرا و سابقه‌ی تصمیم‌ها فقط در جزئیات هست).
 * ثبت واریز و نحوه و اسناد پرداخت بیعانه کار پنل مشتری و خزانه‌داری است و در پنل ادمین API ندارد ⇐ «به‌زودی».
 */
const PAY_SOON = 'به‌زودی — نحوه و اسناد پرداخت بیعانه را مشتری در پنل خودش و خزانه‌داری ثبت می‌کنند';

export function VotesModal({ id, onClose }: { id: string; onClose: () => void }) {
  return <Shell id={id} title="آرای شورای تأمین" onClose={onClose}>{(r) => <><Votes r={r} /><Decisions r={r} /></>}</Shell>;
}

const row = (label: string, value: React.ReactNode) => <div className={s.kvRow} key={label}><span>{label}</span><b>{value}</b></div>;
const dash = <span className={s.muted}>—</span>;
const money = (v: string | null | undefined) => (v == null ? dash : <><span className="tnum">{faNum(int(v))}</span> <Rial /></>);

function FinanceStatus({ r }: { r: SupplyRequest }) {
  const fin = (r.approvals ?? []).filter((a) => a.stage === 'FINANCE');
  return (
    <>
      <div className={s.kvList}>
        {row('وضعیت تأیید مالی', <Badge tone={toneOf(STAGE_STATUS, r.finance_approval_status)}>{labelOf(STAGE_STATUS, r.finance_approval_status)}</Badge>)}
        {row('مبلغ واریزشده', money(r.deposit_paid_amount))}
        {row('شماره پیگیری', r.deposit_reference ? <span data-latin>{r.deposit_reference}</span> : dash)}
        {row('زمان واریز', r.deposit_paid_at ? faDateTime(r.deposit_paid_at) : dash)}
      </div>
      {fin.length ? <Approvals r={{ ...r, approvals: fin }} /> : null}
      <Decisions r={r} />
    </>
  );
}

export function FinanceModal({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <Shell id={id} title="وضعیت مالی" onClose={onClose}>
      {(r) => (isCustomerRequest(r) ? <FinanceStatus r={r} />
        : <p className={s.note}>درخواست کارمند تأیید مالی ندارد؛ مدیر مالی عضو ثابت شورای تأمین است و نظرش را در رأی‌گیری ثبت می‌کند.</p>)}
    </Shell>
  );
}

const STEPS = ['مبلغ بیعانه', 'نحوه پرداخت', 'اسناد پرداختی', 'وضعیت تأیید مالی'];

export function DepositModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = STEPS.length - 1;
  return (
    <Shell id={id} title="بیعانه" onClose={onClose}>
      {(r) => {
        const total = int(r.total);
        const amt = r.deposit_amount == null ? null : int(r.deposit_amount);
        const vs = r.vote_summary;
        return (
          <>
            <div className={s.stepper} aria-label="گام‌های بیعانه">
              {STEPS.map((t, i) => <button type="button" key={t} className={`${s.stepBtn} ${i === step ? s.stepOn : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>{faNum(i + 1)}. {t}</button>)}
            </div>
            {step === 0 ? (
              <>
                <div className={s.depHero}>
                  <div><small>مبلغ بیعانه</small><b className="tnum">{amt == null ? 'هنوز تعیین نشده' : faNum(amt)}</b>{amt == null ? null : <Rial />}</div>
                  <div><small>نسبت به مبلغ کل سفارش</small><b className="tnum">{amt != null && total > 0 ? `${faNum(Math.round((amt / total) * 100))}٪` : '—'}</b></div>
                </div>
                <div className={s.kvList}>
                  {row('مبلغ کل سفارش', money(r.total))}
                  {row('بیعانه‌ی پیشنهادی آرا', vs?.deposit_avg ? <>کمترین {faNum(int(vs.deposit_min))} · میانگین {faNum(int(vs.deposit_avg))} · بیشترین {faNum(int(vs.deposit_max))}</> : dash)}
                  {row('مهلت واریز', r.deposit_due_date ? faDate(r.deposit_due_date) : dash)}
                  {row('موعد تحویل', r.delivery_due ? faDate(r.delivery_due) : dash)}
                  {row('مرحله', r.lifecycle_display)}
                </div>
              </>
            ) : null}
            {step === 1 ? (
              <>
                <p className={s.note}>نحوه‌ی پرداخت را مشتری در پنل خودش انتخاب می‌کند. <SoonTag tip={PAY_SOON} /></p>
                <div className={s.kvList}>
                  {row('مبلغ واریزشده', money(r.deposit_paid_amount))}
                  {row('شماره پیگیری', r.deposit_reference ? <span data-latin>{r.deposit_reference}</span> : dash)}
                  {row('زمان واریز', r.deposit_paid_at ? faDateTime(r.deposit_paid_at) : dash)}
                </div>
              </>
            ) : null}
            {step === 2 ? <p className={s.note}>اسناد پرداختی (رسید واریز) هنوز از بک‌اند به پنل ادمین نمی‌آید. <SoonTag tip={PAY_SOON} /></p> : null}
            {step === 3 ? <FinanceStatus r={r} /> : null}
            <div className={s.decisionBtns}>
              {step < last ? <Button onClick={() => setStep(step + 1)}>ادامه: {STEPS[step + 1]}</Button> : <Button onClick={onClose}>پایان</Button>}
              {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>بازگشت</Button> : null}
            </div>
          </>
        );
      }}
    </Shell>
  );
}
