import { useState } from 'react';
import { IconLock } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDateTime, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits } from '@/shared/lib/text';
import { clean } from '@/shared/lib/validate';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Card, Empty, Modal, Pagination, SectionTitle } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useLocks, useLockWrite, type CreditLock, type CustomerDetail } from '../api';
import { ReasonModal } from '../components';
import { LOCK_REASON, LOCK_STATUS } from '../labels';
import s from '../customers.module.css';

/** قفل مالی (BR-CUS-150…160): فهرست با تاریخچه، قفل دستی، تعلیق موقت با کد پرسنلی، رفع قفل */
export function LocksSection({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const toast = useToast();
  const w = useLockWrite(c.id);
  const [page, setPage] = useState(1);
  const list = useLocks(c.id, can('customers.profiles.credit_lock.read'), { page, page_size: 10 });
  const [manual, setManual] = useState(false);
  const [suspend, setSuspend] = useState<CreditLock | null>(null);
  const [release, setRelease] = useState<CreditLock | null>(null);
  const canUpdate = can('customers.profiles.credit_lock.update');
  if (!can('customers.profiles.credit_lock.read')) return null;
  const hasManualEffective = (list.data?.results ?? []).some((l) => l.reason === 'MANUAL' && l.status !== 'RELEASED');

  const cols: Column<CreditLock>[] = [
    { key: 'reason', header: 'علت', render: (l) => <b>{LOCK_REASON[l.reason] ?? l.reason}</b> },
    { key: 'st', header: 'وضعیت', render: (l) => <span className={s.flags}><Badge tone={LOCK_STATUS[l.status]?.tone ?? 'neutral'}>{LOCK_STATUS[l.status]?.label ?? l.status}</Badge>{l.is_effective ? <Badge tone="danger">مؤثر</Badge> : null}</span> },
    { key: 'at', header: 'زمان قفل', render: (l) => <span className={s.muted}>{faDateTime(l.locked_at)}</span> },
    { key: 'by', header: 'قفل‌کننده', render: (l) => l.locked_by_name ?? (l.reason === 'MANUAL' ? '—' : 'سامانه') },
    { key: 'note', header: 'توضیح', render: (l) => l.note || '—' },
    { key: 'susp', header: 'تعلیق تا', render: (l) => l.suspended_until ? <span className={s.muted}>{faDateTime(l.suspended_until)}{l.override_personnel_code ? ` — کد ${toFaDigits(l.override_personnel_code)}` : ''}</span> : '—' },
    { key: 'rel', header: 'رفع قفل', render: (l) => l.released_at ? <span className={s.muted}>{faDateTime(l.released_at)}{l.released_by_name ? ` — ${l.released_by_name}` : ''}{l.release_note ? ` — ${l.release_note}` : ''}</span> : '—' },
    {
      key: 'act', header: 'عملیات',
      render: (l) => !canUpdate || l.status === 'RELEASED' ? <span className={s.muted}>—</span> : (
        <span className={s.actionsRow} style={{ flexWrap: 'nowrap' }}>
          {l.status === 'ACTIVE' ? <Button size="sm" variant="secondary" onClick={() => setSuspend(l)}>تعلیق موقت</Button> : null}
          <Button size="sm" variant="danger" onClick={() => setRelease(l)}>رفع قفل</Button>
        </span>
      ),
    },
  ];
  return (
    <Card>
      <SectionTitle extra={canUpdate ? <Button size="sm" variant="danger" icon={<IconLock size={15} />} disabled={hasManualEffective} data-tip={hasManualEffective ? 'یک قفل دستی باز وجود دارد' : undefined} onClick={() => setManual(true)}>قفل دستی (مسدود مالی)</Button> : null}>قفل مالی</SectionTitle>
      <p className={s.sub} style={{ marginBottom: 12 }}>قفل مؤثر یعنی «مسدود به دلایل مالی»: بدون چک، اعتبار طلایی و تخفیف؛ پرداخت نقدی و تسویه‌ی بدهی آزاد. قفل خودکار از رخدادهای مالی می‌آید و فقط دستی باز می‌شود.</p>
      <DataTable columns={cols} rows={list.data?.results} rowKey={(l) => l.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} empty={<Empty title="قفلی ثبت نشده است" text="این مشتری سابقه‌ی مسدودی مالی ندارد." />} />
      {list.data && list.data.total > 10 ? <Pagination page={page} pageSize={10} total={list.data.total} onPage={setPage} /> : null}

      <ReasonModal open={manual} onClose={() => setManual(false)} danger busy={w.manual.isPending} title="قفل دستی (مسدود به دلایل مالی)" label="توضیح" confirmText="اعمال قفل"
        intro="تا رفع دستی قفل، مشتری فقط نقدی و بدون تخفیف خرید می‌کند. ورود به پنل بسته نمی‌شود."
        onConfirm={async (note) => { await w.manual.mutateAsync(note); toast('قفل مالی اعمال شد.'); setManual(false); }} />
      <ReasonModal open={!!release} onClose={() => setRelease(null)} busy={w.release.isPending} title="رفع قفل مالی" label="دلیل رفع قفل" confirmText="رفع قفل"
        intro="تسویه‌ی بدهی قفل را خودکار باز نمی‌کند؛ رفع قفل همیشه دستی و با دلیل است."
        onConfirm={async (note) => { await w.release.mutateAsync({ id: release!.id, note }); toast('قفل رفع شد.'); setRelease(null); }} />
      {suspend ? <SuspendModal lock={suspend} busy={w.suspend.isPending} onClose={() => setSuspend(null)}
        onSubmit={async (v) => { await w.suspend.mutateAsync({ id: suspend.id, ...v }); toast('قفل تا تاریخ تعیین‌شده تعلیق شد.'); setSuspend(null); }} /> : null}
    </Card>
  );
}

/** تعلیق موقت: until با منطقه‌ی زمانی (بدون آن ⇐ 400)، کد پرسنلی ≤ ۲۰، توضیح */
function SuspendModal({ lock, busy, onClose, onSubmit }: { lock: CreditLock; busy: boolean; onClose: () => void; onSubmit: (v: { until: string; personnel_code: string; note: string }) => Promise<void> }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('۲۳:۵۹');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const tz = (() => { const off = -new Date().getTimezoneOffset(); const sg = off >= 0 ? '+' : '-'; const a = Math.abs(off); return `${sg}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`; })();
  const submit = async () => {
    const g = jalaliTextToGregorian(date);
    const t = clean(time).match(/^(\d{1,2}):(\d{2})$/);
    if (!g || !t) { setErr('تاریخ و ساعت پایان تعلیق را درست وارد کنید.'); return; }
    const until = `${g}T${t[1]!.padStart(2, '0')}:${t[2]}:00${tz}`;
    if (new Date(until).getTime() <= Date.now()) { setErr('زمان پایان تعلیق باید در آینده باشد.'); return; }
    if (!clean(code) || clean(code).length > 20) { setErr('کد پرسنلی الزامی است (حداکثر ۲۰ نویسه).'); return; }
    if (!note.trim()) { setErr('توضیح الزامی است.'); return; }
    try { await onSubmit({ until, personnel_code: clean(code), note: note.trim() }); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title="تعلیق موقت قفل مالی" width={560}
      footer={<><Button loading={busy} onClick={submit}>ثبت تعلیق</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <p className={s.intro}>قفل «{LOCK_REASON[lock.reason] ?? lock.reason}» تا زمان تعیین‌شده بی‌اثر می‌شود و بعد از آن خودکار برمی‌گردد. کد پرسنلی مسئول تعلیق ثبت می‌شود.</p>
      <FormGrid cols={3}>
        <JalaliDateInput label="تاریخ پایان تعلیق" required value={date} onChange={(e) => setDate(e.target.value)} maxYear={1500} dir="ltr" placeholder="۱۴۰۵/۰۱/۰۱" />
        <Input label="ساعت" required value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" placeholder="۲۳:۵۹" />
        <Input label="کد پرسنلی" required value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" maxLength={20} />
      </FormGrid>
      <div style={{ marginTop: 12 }}><Textarea label="توضیح" required rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <p className={s.sub} style={{ marginTop: 8 }}>منطقه‌ی زمانی: {toFaDigits(tz)} (ساعت دستگاه شما)</p>
      {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
    </Modal>
  );
}
