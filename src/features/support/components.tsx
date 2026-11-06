import type { ReactNode } from 'react';
import { faDateTime, faNum } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/kit';
import { PRIORITY, STATUS } from './labels';
import s from './support.module.css';

const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
/** زمان نسبی فارسی («۵ دقیقه پیش»، «۲ روز دیگر») */
export function relTime(iso?: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - now) / 1000;
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(Math.round(diff), 'second');
  if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (a < 30 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
  return rtf.format(Math.round(diff / (30 * 86400)), 'month');
}

export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS[status]?.tone ?? 'neutral'}>{STATUS[status]?.label ?? status}</Badge>;
export const PriorityBadge = ({ priority }: { priority: string }) => <Badge tone={PRIORITY[priority]?.tone ?? 'neutral'}>{PRIORITY[priority]?.label ?? priority}</Badge>;

/** تاریخ + زمان نسبی زیر آن */
export const WhenCell = ({ iso }: { iso?: string | null }) => (iso ? <span data-tip={faDateTime(iso)}>{relTime(iso)}</span> : <span className={s.muted}>—</span>);

/**
 * مهلت پاسخ (due_at سرور؛ فاصله‌ی تقویمی تا مهلت، نه زمان اداری باقی‌مانده) + نشان نقض SLA.
 * is_sla_breached ممکن است تاریخی باشد (راهنمای بک‌اند) ⇐ «سابقه‌ی نقض» وقتی مهلت جاری نگذشته.
 */
export function DueCell({ due, breached }: { due?: string | null; breached?: boolean }) {
  const late = !!due && new Date(due).getTime() < Date.now();
  return (
    <span className={s.flags}>
      {due ? <span className={late ? s.late : undefined} data-tip={`مهلت: ${faDateTime(due)}`}>{late ? `گذشته — ${relTime(due)}` : relTime(due)}</span> : <span className={s.muted}>—</span>}
      {breached ? <Badge tone="danger">{late ? 'نقض SLA' : 'سابقه‌ی نقض'}</Badge> : null}
    </span>
  );
}

export type StatTone = 'brand' | 'success' | 'danger' | 'warning' | 'info';
export function Stat({ icon, tone, label, value, text, sub, on, onClick }: { icon: ReactNode; tone: StatTone; label: string; value?: number; /** مقدار متنی به‌جای عدد */ text?: string; sub: string; on?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className={`${s.statIcon} ${s[`t_${tone}`]}`}>{icon}</span>
      <span className={s.statText}>
        <span className={s.statLabel}>{label}</span>
        <span className={s.statValue}>{text ?? (value === undefined ? '…' : faNum(value))}</span>
        <span className={s.statSub}>{sub}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={`${s.stat} ${s.statBtn} ${on ? s[`on_${tone}`] : ''}`} onClick={onClick} aria-pressed={!!on} data-tip="">{body}</button>
  ) : <div className={s.stat}>{body}</div>;
}
