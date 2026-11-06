import { IconCheck, IconX } from '@tabler/icons-react';
import { faDateTime, faNum } from '@/shared/lib/format';
import { CUSTOMER_PATH, LIFECYCLE_LABEL, STAFF_PATH, STOPPED_AT } from './labels';
import { isCustomerRequest, type SupplyRequest } from './requestsApi';
import { Shell } from './RequestShell';
import s from './supply.module.css';

/**
 * مودال «مرحله» (افشین ۱۴ آبان ۱۴۰۵): همه‌ی مرحله‌های مسیر این نوع درخواست (کارمند یا مشتری) به ترتیب، با تفکیک
 * گذرانده‌شده، فعلی و باقی‌مانده. اگر درخواست بیرون از مسیر بسته شده (رد، لغو، منقضی، عدم امکان تأمین…)، مسیر در مرحله‌ای که
 * متوقف شد قطع می‌شود و وضعیت پایانی با رنگ جدا می‌آید. «تصمیم مشتری درباره‌ی دریافت ناقص» فقط وقتی پیش آمده باشد در مسیر دیده می‌شود.
 */
type StepState = 'done' | 'current' | 'todo' | 'stopped';

export function buildLifecycleSteps(r: Pick<SupplyRequest, 'lifecycle' | 'source' | 'vote_count'>) {
  const customer = isCustomerRequest(r);
  const path = [...(customer ? CUSTOMER_PATH : STAFF_PATH)];
  const cur = r.lifecycle;
  if (cur === 'AWAITING_PARTIAL_DECISION') path.splice(path.indexOf('RECEIVING') + 1, 0, cur);
  const refund = cur === 'AWAITING_REFUND' || cur === 'CLOSED_REFUNDED';
  const stopAt = cur === 'CUSTOMER_CANCELLED' ? (r.vote_count > 0 ? 'VOTING' : 'SUBMITTED') : STOPPED_AT[cur];
  const curIdx = path.indexOf(cur);
  const steps: { code: string; label: string; state: StepState }[] = [];
  if (curIdx >= 0) {
    path.forEach((code, i) => {
      let state: StepState = 'todo';
      if (i < curIdx || (code === 'COMPLETED' && cur === 'COMPLETED')) state = 'done';
      else if (i === curIdx) state = 'current';
      steps.push({ code, label: LIFECYCLE_LABEL[code] ?? code, state });
    });
    return { steps, ended: null as null | { code: string; open: boolean } };
  }
  // بیرون از مسیر: تا مرحله‌ی توقف گذرانده‌شده، بعد شاخه‌ی پایانی
  const at = Math.max(path.indexOf(stopAt ?? ''), 0);
  path.slice(0, at + 1).forEach((code) => steps.push({ code, label: LIFECYCLE_LABEL[code] ?? code, state: 'done' }));
  if (refund) steps.push({ code: 'AWAITING_REFUND', label: LIFECYCLE_LABEL.AWAITING_REFUND ?? '', state: cur === 'AWAITING_REFUND' ? 'current' : 'done' });
  return { steps, ended: cur === 'AWAITING_REFUND' ? null : { code: cur, open: false } };
}

export function StageModal({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <Shell id={id} title="مسیر درخواست تأمین" onClose={onClose}>
      {(r) => {
        const { steps, ended } = buildLifecycleSteps(r);
        const done = steps.filter((x) => x.state === 'done').length;
        const todo = steps.filter((x) => x.state === 'todo').length;
        const finished = r.lifecycle === 'COMPLETED';
        return (
          <>
            <div className={s.lcSummary}>
              <span className={s.lcSumDone}><b>{faNum(done)}</b> مرحله گذرانده</span>
              <span className={s.lcSumCur}>{ended ? 'متوقف شد' : finished ? 'پایان یافته' : <>مرحله‌ی فعلی</>}</span>
              <span className={s.lcSumTodo}><b>{faNum(todo)}</b> مرحله باقی‌مانده</span>
              <span className={s.muted}>{isCustomerRequest(r) ? 'مسیر درخواست مشتری' : 'مسیر درخواست کارمند'}</span>
            </div>
            <ol className={s.lc} aria-label="مرحله‌های درخواست">
              {steps.map((x, i) => (
                <li key={x.code} className={`${s.lcStep} ${s[`lc_${x.state}`] ?? ''}`} aria-current={x.state === 'current' ? 'step' : undefined}>
                  <span className={s.lcDot} aria-hidden>{x.state === 'done' ? <IconCheck size={14} stroke={2.5} /> : faNum(i + 1)}</span>
                  <div className={s.lcBody}>
                    <b>{x.label}</b>
                    {x.state === 'current' ? <small>مرحله‌ی فعلی{r.lifecycle_changed_at ? ` · از ${faDateTime(r.lifecycle_changed_at)}` : ''}{r.is_late ? ' · موعد تحویل گذشته است' : ''}</small> : null}
                    {x.state === 'done' ? <small>گذرانده شد</small> : null}
                    {x.state === 'todo' ? <small>باقی‌مانده</small> : null}
                  </div>
                </li>
              ))}
              {ended ? (
                <li className={`${s.lcStep} ${s.lc_stopped}`} aria-current="step">
                  <span className={s.lcDot} aria-hidden><IconX size={14} stroke={2.5} /></span>
                  <div className={s.lcBody}>
                    <b>{r.lifecycle_display}</b>
                    <small>وضعیت پایانی{r.lifecycle_changed_at ? ` · ${faDateTime(r.lifecycle_changed_at)}` : ''}{r.close_reason ? ` · ${r.close_reason}` : ''}</small>
                  </div>
                </li>
              ) : null}
            </ol>
          </>
        );
      }}
    </Shell>
  );
}
