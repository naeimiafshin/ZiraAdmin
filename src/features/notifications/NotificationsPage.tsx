import { useMemo, useState, type ReactNode } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconSend } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, faTime, fullName } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Input, Select, Textarea } from '@/shared/ui/form';
import { Card, Chip, Empty, InfoBanner, Modal, Pagination, Segmented, SectionTitle } from '@/shared/ui/kit';
import { searchKey, TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { fetchAll, useAllRoles, useAllStaff, useAssignments, type Notification } from '@/features/users/api';
import { PRIORITY, RECIPIENT_MODE, TOPIC } from '@/features/users/labels';
import u from '@/features/users/users.module.css';
import s from './notifications.module.css';

/** پیش‌نمایش متن در جدول (قید عرض ستون نداریم ⇐ متن کوتاه می‌شود، نه ستون). */
const short = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);
type Mode = 'ALL' | 'ROLE' | 'SPECIFIC';
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type SeenUser = AdminSchemas['NotificationSeenUserOut'];
const KEY = ['identity', 'notifications'] as const;

/** اعلان‌ها (html Fixed، مدیریت کاربران ⇐ سامانه): بالا «ارسال اعلان جدید»، پایین «اعلان‌های ارسال‌شده» (افشین 2026-10-20). */
export default function NotificationsPage() {
  const can = usePerm();
  return (
    <>
      <h2 className={s.title}>اعلان‌ها</h2>
      <div className={s.stack}>
        {can('identity.notifications.create') ? <SendForm /> : null}
        {can('identity.notifications.list') ? <SentList /> : null}
      </div>
    </>
  );
}

function SendForm() {
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useAllStaff();
  const roles = useAllRoles();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('SYSTEM');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [mode, setMode] = useState<Mode>('ALL');
  const [roleId, setRoleId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [find, setFind] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roleAsg = useAssignments({ role_id: roleId, user_is_active: true }, mode === 'ROLE' && !!roleId);
  const activeStaff = useMemo(() => (staff.data ?? []).filter((x) => x.is_active), [staff.data]);

  // نقش: بک‌اند خودش اعضای فعالِ حذف‌نشده‌ی نقش را پیدا می‌کند (role_ids، 2026-10-25)؛ شمارش با همان فیلتر user_is_active
  const roleRecipients = useMemo(() => Array.from(new Set((roleAsg.data ?? []).map((a) => a.user_id))), [roleAsg.data]);
  const recipients: string[] = mode === 'ALL' ? activeStaff.map((x) => x.id) : mode === 'ROLE' ? roleRecipients : picked;
  const term = searchKey(find.trim());
  const filtered = activeStaff.filter((x) => !term || searchKey(fullName(x), x.username, x.personnel_code).includes(term));

  const send = async () => {
    setErr(null);
    if (!body.trim()) return setErr('متن پیام الزامی است.');
    if (mode === 'ROLE' && !roleId) return setErr('نقش گیرندگان را انتخاب کنید.');
    if (recipients.length === 0) return setErr('هیچ گیرنده‌ای انتخاب نشده است.');
    setBusy(true);
    try {
      const sent = await adminApi<{ recipient_count?: number }>('/auth/notifications', { method: 'POST', body: { title: title.trim(), body: body.trim(), topic, priority, recipient_mode: mode, ...(mode === 'ROLE' ? { role_ids: [roleId] } : { recipient_ids: recipients }) } });
      toast(`اعلان برای ${faNum(sent?.recipient_count ?? recipients.length)} گیرنده ارسال شد.`);
      setTitle(''); setBody(''); setPicked([]);
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      setErr(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const modeCard = (m: Mode, label: string, sub: string) => (
    <button type="button" className={`${s.mode} ${mode === m ? s.modeOn : ''}`} onClick={() => setMode(m)} aria-pressed={mode === m}>
      <span className={s.modeSub}>{sub}</span><span className={s.modeLabel}>{label}</span>
    </button>
  );

  return (
    <Card>
      <SectionTitle>ارسال اعلان جدید</SectionTitle>
      {err ? <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null}
      <div className={s.form}>
        <div className={s.row3}>
          <Input label="عنوان" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان کوتاه اعلان" />
          <Select label="موضوع" value={topic} onChange={(e) => setTopic(e.target.value)} options={Object.entries(TOPIC).map(([value, label]) => ({ value, label }))} />
          <div>
            <div className={s.lbl}>اولویت</div>
            <Segmented value={priority} onChange={setPriority} options={(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as Priority[]).map((p) => ({ value: p, label: PRIORITY[p]!.label }))} />
          </div>
        </div>
        <Textarea label="متن پیام" required value={body} onChange={(e) => setBody(e.target.value)} placeholder="متن اعلان…" />
        <div>
          <div className={s.lbl}>گیرندگان <span style={{ color: 'var(--brand)' }}>*</span></div>
          <div className={s.modes}>
            {modeCard('ALL', 'همه کاربران', staff.data ? `${faNum(activeStaff.length)} نفر` : '…')}
            {modeCard('ROLE', 'بر اساس نقش', 'انتخاب نقش')}
            {modeCard('SPECIFIC', 'کاربران منتخب', 'انتخاب کاربر')}
          </div>
        </div>
        {mode === 'ROLE' ? (
          <Select label="نقش" value={roleId} onChange={(e) => setRoleId(e.target.value)} placeholder="انتخاب نقش" options={(roles.data ?? []).filter((r) => r.is_active).map((r) => ({ value: r.id, label: r.name }))} />
        ) : null}
        {mode === 'SPECIFIC' ? (
          <div className={s.picker}>
            <input className={s.pickerSearch} value={find} onChange={(e) => setFind(e.target.value)} placeholder="جست‌وجوی کاربر: نام، نام کاربری یا کد پرسنلی…" />
            <div className={s.pickerList}>
              {filtered.map((x) => (
                <label key={x.id} className={`${s.pick} ${picked.includes(x.id) ? s.pickOn : ''}`}>
                  <input type="checkbox" checked={picked.includes(x.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, x.id] : picked.filter((p) => p !== x.id))} />
                  {fullName(x)}
                </label>
              ))}
              {filtered.length === 0 ? <div className={u.sub} style={{ padding: 10 }}>کاربری پیدا نشد.</div> : null}
            </div>
          </div>
        ) : null}
        <div className={s.footer}>
          <div className={s.summary}>
            {mode === 'ALL' ? `همه ${faNum(recipients.length)} کاربر فعال سیستمی اعلان را دریافت می‌کنند.` : mode === 'ROLE' ? (roleId ? (roleAsg.isLoading ? 'در حال شمارش…' : `${faNum(recipients.length)} کاربر فعال دارای این نقش اعلان را دریافت می‌کنند.`) : 'نقش را انتخاب کنید.') : `${faNum(recipients.length)} کاربر انتخاب شده است.`}
          </div>
          <Button icon={<IconSend size={17} />} onClick={send} loading={busy} disabled={recipients.length === 0}>
            ارسال به {faNum(recipients.length)} گیرنده
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * فیلدهای جزئیات اعلان که بک‌اند هنوز نمی‌دهد (قرارداد پیشنهادی: forParham/NOTIFICATION_DETAIL_API_GUIDE.md).
 * هر کدام که بیاید خودبه‌خود نمایش داده می‌شود؛ تا آن زمان «—». داده‌ی ساختگی نداریم.
 */
type NotificationX = Notification & Partial<{
  recipient_count: number; delivered_count: number; seen_count: number; dismissed_count: number;
  created_by_id: string | null; created_by_name: string | null; target_role_names: string[]; role_names: string[];
}>;
/** نام نقش‌های هدف: بک‌اند `role_names` می‌دهد (2026-10-25)؛ `target_role_names` نام قرارداد پیشنهادی قبلی */
const roleNamesOf = (n: NotificationX) => (n.role_names?.length ? n.role_names : n.target_role_names ?? []);
type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SEEN' | 'DISMISSED';
type DeliveryRow = {
  user_id: string; first_name?: string | null; last_name?: string | null; username?: string | null; personnel_code?: string | null;
  role_names?: string[]; branch_name?: string | null; status: DeliveryStatus; delivered_at?: string | null; seen_at?: string | null; dismissed_at?: string | null;
};
const DELIVERY: Record<DeliveryStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  PENDING: { label: 'در انتظار', tone: 'neutral' }, SENT: { label: 'ارسال‌شده', tone: 'info' }, DELIVERED: { label: 'تحویل‌شده', tone: 'info' },
  FAILED: { label: 'ناموفق', tone: 'danger' }, SEEN: { label: 'مشاهده‌شده', tone: 'success' }, DISMISSED: { label: 'بسته‌شده', tone: 'neutral' },
};
const at = (iso?: string | null) => (iso ? `${faDate(iso)} ${faTime(iso)}` : '—');
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const shortId = (id: string) => `nt_${id.replace(/-/g, '').slice(0, 8)}`;

/** شمار مشاهده‌کنندگان: از خود اعلان (seen_count) یا، تا آمدن آن، از /seen-users. */
const seenQuery = (id: string) => ({
  queryKey: [...KEY, 'seen', id],
  queryFn: ({ signal }: { signal: AbortSignal }) => adminApi<Paginated<SeenUser>>(`/auth/notifications/${id}/seen-users`, { query: { page: 1, page_size: 1 }, signal }).then((r) => r.total),
  staleTime: 30_000,
});

function SentList() {
  const [q, setQ] = useState('');
  const [fTopic, setFTopic] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fMode, setFMode] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState<NotificationX | null>(null);
  const reset = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };
  const list = useQuery({
    queryKey: [...KEY, 'all'],
    queryFn: () => fetchAll<NotificationX>('/auth/notifications').then((a) => a.sort((x, y) => (y.sent_at ?? y.created_at).localeCompare(x.sent_at ?? x.created_at))),
  });

  const rows = useMemo(() => {
    const term = searchKey(q.trim());
    return (list.data ?? []).filter((n) => (!term || searchKey(n.title, n.body).includes(term))
      && (!fTopic || n.topic === fTopic) && (!fPriority || n.priority === fPriority)
      && (!fMode || (fMode === 'ROLE' ? n.recipient_mode === 'ROLE' || n.recipient_mode === 'ROLE_BASED' : n.recipient_mode === fMode)));
  }, [list.data, q, fTopic, fPriority, fMode]);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const seen = useQueries({ queries: pageRows.map((n) => ({ ...seenQuery(n.id), enabled: n.seen_count === undefined })) });

  const cols: Column<NotificationX>[] = [
    {
      key: 'title', header: 'عنوان و متن', render: (n) => (
        <div className={s.two}><span className={s.t1}>{n.title || '—'}</span><span className={s.t2} title={n.body}>{short(n.body, 60)}</span></div>
      ),
    },
    { key: 'topic', header: 'موضوع', render: (n) => <span className={s.tag}>{TOPIC[n.topic] ?? n.topic}</span> },
    {
      key: 'to', header: 'گیرندگان', render: (n) => {
        const rn = roleNamesOf(n);
        const sub = rn.length ? rn.join('، ') : n.recipient_count !== undefined ? `${faNum(n.recipient_count)} ${n.recipient_mode === 'SPECIFIC' ? 'کاربر' : 'گیرنده'}` : null;
        return <div className={s.two}><span className={s.t1}>{RECIPIENT_MODE[n.recipient_mode] ?? n.recipient_mode}</span>{sub ? <span className={s.t2}>{short(sub, 28)}</span> : null}</div>;
      },
    },
    { key: 'pr', header: 'اولویت', render: (n) => { const p = PRIORITY[n.priority] ?? { label: n.priority, tone: 'neutral' as const }; return <span className={`${s.prio} ${s[`p_${p.tone}`] ?? ''}`}>{p.label}</span>; } },
    { key: 'at', header: 'زمان ارسال', align: 'center', render: (n) => <div className={s.two}><span className={s.t1n}>{faDate(n.sent_at ?? n.created_at)}</span><span className={s.t1n}>{faTime(n.sent_at ?? n.created_at)}</span></div> },
    {
      key: 'seen', header: 'مشاهده', render: (n, i) => {
        const c = n.seen_count ?? seen[i]?.data;
        const total = n.recipient_count;
        if (c === undefined) return <span className={u.muted}>…</span>;
        // نوار پیشرفت مثل html؛ تا بک‌اند recipient_count را ندهد، مخرج «—» و نوار خالی است (عدد ساختگی نداریم)
        const d = n.delivered_count ?? 0;
        return (
          <div className={s.seenCell} data-tip={total === undefined ? 'تعداد کل گیرندگان را بک‌اند هنوز نمی‌دهد' : undefined}>
            <div className={s.seenTop}><span className={s.seenOf}>{faNum(c)} از {total === undefined ? '—' : faNum(total)}</span><span className={s.seenPct}>{total === undefined ? '—' : `${faNum(pct(c, total))}٪`}</span></div>
            <div className={s.bar} role="progressbar" aria-label="پیشرفت مشاهده" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total ? pct(c, total) : undefined}>{total ? <><span className={s.barSeen} style={{ width: `${pct(c, total)}%` }} /><span className={s.barDel} style={{ width: `${pct(d, total)}%` }} /></> : null}</div>
          </div>
        );
      },
    },
  ];

  return (
    <Card>
      <SectionTitle extra={list.data ? <Chip>{faNum(list.data.length)} اعلان</Chip> : null}>اعلان‌های ارسال‌شده</SectionTitle>
      <TableFilters
        search={q}
        onSearch={reset(setQ)}
        placeholder="جست‌وجو: عنوان یا متن اعلان"
        filters={[
          { key: 'topic', label: 'موضوع', value: fTopic, onChange: reset(setFTopic), options: Object.entries(TOPIC).map(([value, label]) => ({ value, label })) },
          { key: 'priority', label: 'اولویت', value: fPriority, onChange: reset(setFPriority), options: Object.entries(PRIORITY).map(([value, v]) => ({ value, label: v.label })) },
          { key: 'mode', label: 'گیرندگان', value: fMode, onChange: reset(setFMode), options: [{ value: 'ALL', label: 'همه کاربران' }, { value: 'ROLE', label: 'بر اساس نقش' }, { value: 'SPECIFIC', label: 'کاربران منتخب' }] },
        ]}
      />
      <DataTable variant="flat" columns={cols} rows={list.data ? pageRows : undefined} rowKey={(n) => n.id} onRowClick={setOpen} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={list.data?.length ? 'اعلانی با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز اعلانی ارسال نشده است'} />} />
      {rows.length > 0 ? <Pagination page={page} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} /> : null}
      {open ? <DetailModal n={open} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}

type Tab = 'ALL' | 'DELIVERED' | 'SEEN' | 'DISMISSED';

/** جزئیات اعلان (html Fixed: مودال «وضعیت تحویل به گیرندگان»). */
function DetailModal({ n: fromList, onClose }: { n: NotificationX; onClose: () => void }) {
  const can = usePerm();
  // داده‌ی تازه از GET /auth/notifications/{id} (تا آن زمان همان داده‌ی سطر جدول)
  const one = useQuery({ queryKey: [...KEY, 'one', fromList.id], queryFn: ({ signal }) => adminApi<NotificationX>(`/auth/notifications/${fromList.id}`, { signal }) });
  const n: NotificationX = { ...fromList, ...(one.data ?? {}) };
  const staff = useAllStaff();
  const roles = useAllRoles(can('rbac.roles.list'));
  const [tab, setTab] = useState<Tab>('ALL');
  // فهرست کامل تحویل‌ها (قرارداد پیشنهادی)؛ اگر نبود ⇐ فقط مشاهده‌کنندگان از /seen-users
  const deliveries = useQuery({
    queryKey: [...KEY, 'deliveries', n.id],
    queryFn: () => fetchAll<DeliveryRow>(`/auth/notifications/${n.id}/deliveries`),
    retry: false,
  });
  const hasDeliveries = !!deliveries.data;
  const seenUsers = useQuery({ queryKey: [...KEY, 'seen-users', n.id], queryFn: () => fetchAll<SeenUser>(`/auth/notifications/${n.id}/seen-users`), enabled: deliveries.isError });

  const person = (id: string) => staff.data?.find((x) => x.id === id);
  const roleName = (code: string) => roles.data?.find((r) => r.code === code)?.name ?? code;
  const all: DeliveryRow[] = hasDeliveries ? deliveries.data! : (seenUsers.data ?? []).map((x) => {
    const p = person(x.user_id);
    return { user_id: x.user_id, first_name: x.first_name, last_name: x.last_name, username: x.username, personnel_code: p?.personnel_code, role_names: (p?.roles ?? []).map(roleName), branch_name: p?.branch_name, status: 'SEEN', seen_at: x.seen_at };
  });
  const cnt = {
    total: n.recipient_count ?? (hasDeliveries ? all.length : undefined),
    delivered: n.delivered_count ?? (hasDeliveries ? all.filter((d) => d.status === 'DELIVERED').length : undefined),
    seen: n.seen_count ?? all.filter((d) => d.status === 'SEEN').length,
    dismissed: n.dismissed_count ?? (hasDeliveries ? all.filter((d) => d.status === 'DISMISSED').length : undefined),
  };
  const shown = tab === 'ALL' ? all : all.filter((d) => d.status === tab);
  const loading = deliveries.isLoading || (deliveries.isError && seenUsers.isLoading);
  const p = PRIORITY[n.priority] ?? { label: n.priority, tone: 'neutral' as const };
  const mode = RECIPIENT_MODE[n.recipient_mode] ?? n.recipient_mode;
  const dash = <span className={u.muted} data-tip="بک‌اند هنوز این داده را نمی‌دهد">—</span>;
  const num = (v: number | undefined) => (v === undefined ? '—' : faNum(v));

  const cols: Column<DeliveryRow>[] = [
    {
      key: 'who', header: 'گیرنده', render: (d) => (
        <div className={s.two}><span className={s.t1}>{`${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || d.username || '—'}</span><span className={`${s.t2} ltr`}>{d.personnel_code ?? d.username ?? ''}</span></div>
      ),
    },
    { key: 'role', header: 'نقش', render: (d) => (d.role_names?.length ? d.role_names.join('، ') : '—') },
    { key: 'branch', header: 'شعبه', render: (d) => d.branch_name || '—' },
    { key: 'st', header: 'وضعیت', render: (d) => { const st = DELIVERY[d.status] ?? { label: d.status, tone: 'neutral' as const }; return <span className={`${s.prio} ${s[`p_${st.tone}`] ?? ''}`}>{st.label}</span>; } },
    { key: 'at', header: 'زمان مشاهده/بستن', render: (d) => at(d.dismissed_at ?? d.seen_at) },
  ];

  return (
    <Modal open onClose={onClose} width={820}
      title={(
        <span className={s.mHead}>
          <span className={s.mTitleRow}><span className={s.mTitle}>{n.title || 'اعلان'}</span><span className={`${s.prio} ${s[`p_${p.tone}`] ?? ''}`}>اولویت: {p.label}</span><span className={s.tag}>{TOPIC[n.topic] ?? n.topic}</span></span>
          <span className={s.mId} data-latin="">{shortId(n.id)}</span>
        </span>
      )}
      footer={<div className={s.mFoot}><span className={u.muted}>ارسال‌کننده: {n.created_by_name ?? '—'}</span><Button variant="secondary" onClick={onClose}>بستن</Button></div>}>
      <div className={s.mBody}>{n.body}</div>
      <div className={s.info}>
        <Info label="شیوه ارسال">{mode} <span data-latin="">({n.recipient_mode})</span></Info>
        <Info label="نقش‌های هدف">{roleNamesOf(n).length ? roleNamesOf(n).join('، ') : n.recipient_mode === 'ROLE' || n.recipient_mode === 'ROLE_BASED' ? dash : '—'}</Info>
        <Info label="موضوع">{TOPIC[n.topic] ?? n.topic} <span data-latin="">({n.topic})</span></Info>
        <Info label="اولویت">{p.label} <span data-latin="">({n.priority})</span></Info>
        <Info label="زمان ایجاد">{at(n.created_at)}</Info>
        <Info label="زمان ارسال">{at(n.sent_at)}</Info>
        <Info label="ارسال‌کننده">{n.created_by_name ?? dash}</Info>
        <Info label="موجودیت مرتبط">{n.target_type ? <span data-latin="">{n.target_type}</span> : '—'}</Info>
      </div>
      <div className={s.stats}>
        <Stat label="کل گیرندگان" value={num(cnt.total)} tone="ink" />
        <Stat label="تحویل‌شده" value={num(cnt.delivered)} tone="info" />
        <Stat label="مشاهده‌شده" value={num(cnt.seen)} tone="success" />
        <Stat label="بسته‌شده" value={num(cnt.dismissed)} tone="muted" />
      </div>
      <div className={`${s.bar} ${s.barLg}`} role="progressbar" aria-label="پیشرفت مشاهده" aria-valuemin={0} aria-valuemax={100} aria-valuenow={cnt.total ? pct(cnt.seen, cnt.total) : undefined}
        data-tip={cnt.total ? `${faNum(pct(cnt.seen, cnt.total))}٪ مشاهده` : 'تعداد کل گیرندگان را بک‌اند هنوز نمی‌دهد'}>
        {cnt.total ? <>
          <span className={s.barSeen} style={{ width: `${pct(cnt.seen, cnt.total)}%` }} />
          <span className={s.barDel} style={{ width: `${pct(cnt.delivered ?? 0, cnt.total)}%` }} />
          <span className={s.barDis} style={{ width: `${pct(cnt.dismissed ?? 0, cnt.total)}%` }} />
        </> : null}
      </div>
      <div className={s.dHead}>
        <span className={s.dTitle}>وضعیت تحویل به گیرندگان</span>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'ALL', label: `همه (${num(hasDeliveries ? all.length : cnt.total)})` },
          { value: 'DELIVERED', label: 'تحویل‌شده' }, { value: 'SEEN', label: 'مشاهده‌شده' }, { value: 'DISMISSED', label: 'بسته‌شده' },
        ]} />
      </div>
      {!hasDeliveries && !deliveries.isLoading ? <InfoBanner tone="warning">بک‌اند هنوز فهرست کامل گیرندگان را نمی‌دهد؛ فعلاً فقط کسانی که اعلان را دیده‌اند نمایش داده می‌شوند.</InfoBanner> : null}
      <div className={s.dTable}>
        <DataTable variant="flat" columns={cols} rows={loading ? undefined : shown} rowKey={(d) => d.user_id} loading={loading}
          empty={<Empty title={tab === 'ALL' ? 'گیرنده‌ای نمایش داده نمی‌شود' : 'موردی در این وضعیت نیست'} />} />
      </div>
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return <div className={s.infoItem}><span className={s.infoLabel}>{label}</span><span className={s.infoVal}>{children}</span></div>;
}
function Stat({ label, value, tone }: { label: string; value: string; tone: 'ink' | 'info' | 'success' | 'muted' }) {
  return <div className={s.stat}><span className={s.statLabel}>{label}</span><span className={`${s.statVal} ${s[`sv_${tone}`]}`}>{value}</span></div>;
}
