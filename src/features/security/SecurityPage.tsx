import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminSchemas } from '@/shared/api/types';
import {
  IconDeviceMobileMessage, IconKey, IconLock, IconLockOpen, IconPencil, IconPlayerStop, IconPlus, IconServer, IconUserX, IconX,
} from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { ApiError, userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, faTime, fullName } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Select, Toggle } from '@/shared/ui/form';
import { Badge, Card, Chip, Empty, ErrorBox, InfoBanner, KeyValue, Modal, Pagination, Segmented, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { Stepper } from '@/shared/ui/Stepper';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllRoles, useAllStaff } from '@/features/users/api';
import { DEVICE, SESSION_STATUS } from '@/features/users/labels';
import u from '@/features/users/users.module.css';
import {
  invalidateSecurity, useAccountLocks, useIpRules, useLimits, usePolicy, useSavePolicy, useSessionCount, useSessions, useSetTwoFactor, useTerminateSession,
  useTimeouts, useTwoFactorRules, useUnlockAccount,
  type AccountLock, type IpRule, type SecurityPolicy, type SecurityPolicyPatch, type Session, type SessionStatus,
} from './api';
import s from './security.module.css';

const TIMEOUTS = [5, 10, 15, 30, 45, 60, 120, 240, 480, 720, 1440];
const timeoutLabel = (m: number | null | undefined) => (m == null ? 'پیش‌فرض' : m % 60 === 0 && m >= 60 ? `${faNum(m / 60)} ساعت` : `${faNum(m)} دقیقه`);

/**
 * نشست‌ها (مدیریت کاربران ⇐ سامانه؛ افشین 2026-10-25): فقط فهرست نشست‌ها با فیلتر وضعیت (تب «نشست‌های فعال» حذف شد).
 * «محدودیت نشست» و «سیاست‌های امنیتی» به ماژول تنظیمات رفتند: SessionLimitsPage و SecurityPolicyPage پایین همین فایل.
 */
export default function SessionsPage() {
  const [params] = useSearchParams();
  // پیوندهای قدیمی ?tab=limits|policy ⇐ صفحه‌ی تازه در تنظیمات
  const old = params.get('tab');
  if (old === 'limits') return <Navigate to="/settings/session-limits" replace />;
  if (old === 'policy') return <Navigate to="/settings/security-policy" replace />;
  return (
    <>
      <div className={s.head}><h2 className={s.title}>نشست‌ها</h2></div>
      <SessionsTab />
    </>
  );
}

/** تنظیمات ⇐ امنیت ⇐ محدودیت نشست (منتقل‌شده از «امنیت و نشست‌ها»، 2026-10-25) */
export function SessionLimitsPage() {
  return (
    <>
      <div className={s.head}><h2 className={s.title}>محدودیت نشست</h2></div>
      <LimitsTab />
    </>
  );
}

/** تنظیمات ⇐ امنیت ⇐ سیاست‌های امنیتی (منتقل‌شده از «امنیت و نشست‌ها»، 2026-10-25) */
export function SecurityPolicyPage() {
  return (
    <>
      <div className={s.head}><h2 className={s.title}>سیاست‌های امنیتی</h2></div>
      <PolicyTab />
    </>
  );
}

/* ───────────── ۱. نشست‌ها ───────────── */
function SessionsTab() {
  const can = usePerm();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState('');
  const [fStatus, setFStatus] = useState<SessionStatus | ''>('ACTIVE');
  const [fDevice, setFDevice] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  // جست‌وجو و نقش سمت سرور (2026-10-25: `query` روی نام، نام کاربری، موبایل، IP و مرورگر؛ `role_id` = نقش فعلی کاربر)
  const dq = useDebounced(toLatinDigits(q.trim()), 350);
  const list = useSessions(fStatus, fDevice, dq, fRole);
  const active = useSessionCount('ACTIVE');
  const expired = useSessionCount('EXPIRED');
  const staff = useAllStaff(can('identity.users.list'));
  const roles = useAllRoles(can('rbac.roles.list'));
  const terminate = useTerminateSession();
  const [detail, setDetail] = useState<Session | null>(null);
  const person = (id: string) => staff.data?.find((x) => x.id === id);
  const rows = list.data ?? [];
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const filtered = Boolean(dq || fRole || fDevice || fStatus !== 'ACTIVE');
  const end = (x: Session) => terminate.mutate(x.id, {
    onSuccess: () => toast('نشست پایان یافت.'),
    // نشستی که از قبل تمام شده ⇐ ۴۰۹ session_not_active؛ فهرست تازه می‌شود و ردیف از «فعال» بیرون می‌رود
    onError: (er) => (er instanceof ApiError && er.code === 'session_not_active' ? toast('این نشست پیش‌تر پایان یافته بود؛ فهرست تازه شد.') : toast(userMessage(er), 'error')),
  });

  const cols: Column<Session>[] = [
    { key: 'i', header: 'ردیف', render: (_, i) => <span className={u.muted}>{faNum((page - 1) * pageSize + i + 1)}</span> },
    { key: 'user', header: 'نام کاربر', render: (x) => <span className={u.strong}>{x.full_name || 'کاربر'}</span> },
    { key: 'role', header: 'نقش کاربر', render: (x) => (x.role_name ? <Chip>{x.role_name}</Chip> : <span className={u.muted}>—</span>) },
    // تاریخ و ساعت شروع در یک ستون تا جدول با زیرمنوی باز در عرض صفحه جا شود (افشین 2026-10-25)
    { key: 'start', header: 'زمان شروع', render: (x) => <span className={s.when}>{faDate(x.started_at)}<span className={u.muted}>{faTime(x.started_at)}</span></span> },
    { key: 'dev', header: 'نوع دستگاه', render: (x) => DEVICE[x.device_type] ?? x.device_type },
    { key: 'br', header: 'مرورگر', render: (x) => x.browser || '—' },
    { key: 'ip', header: 'IP', render: (x) => <span className="ltr" data-latin="">{x.ip_address || '—'}</span> },
    { key: 'loc', header: 'مکان تقریبی', render: (x) => x.approx_location || '—' },
    { key: 'last', header: 'آخرین فعالیت', render: (x) => faTime(x.last_activity_at) },
    { key: 'st', header: 'وضعیت', render: (x) => { const st = SESSION_STATUS[x.status] ?? { label: x.status, tone: 'neutral' as const }; return <span className={s.pill}><Badge tone={st.tone}>{st.label}</Badge></span>; } },
    {
      key: 'act', header: 'عملیات', render: (x) => (x.status === 'ACTIVE' && can('events.sessions.active.delete') ? (
        <Button variant="danger" size="sm" className={s.pillBtn} icon={<IconPlayerStop size={13} />} disabled={terminate.isPending}
          onClick={(e) => { e.stopPropagation(); end(x); }}>اتمام</Button>
      ) : <span className={u.muted}>—</span>),
    },
  ];

  return (
    <Card className={s.sessionsCard}>
      <TableFilters
        search={q}
        onSearch={reset(setQ)}
        placeholder="جست‌وجو: نام، نام کاربری، موبایل، IP یا مرورگر"
        filters={[
          ...(can('rbac.roles.list') ? [{ key: 'role', label: 'نقش کاربر', value: fRole, onChange: reset(setFRole), options: (roles.data ?? []).map((r) => ({ value: r.id, label: r.name })) }] : []),
          { key: 'status', label: 'وضعیت', value: fStatus, onChange: reset((v: string) => setFStatus(v as SessionStatus | '')), options: Object.entries(SESSION_STATUS).map(([value, v]) => ({ value, label: v.label })) },
          { key: 'device', label: 'نوع دستگاه', value: fDevice, onChange: reset(setFDevice), options: Object.entries(DEVICE).map(([value, label]) => ({ value, label })) },
        ]}
      />
      <div className={s.chips}>
        <Badge tone="success">نشست فعال: {active.data !== undefined ? faNum(active.data) : '…'}</Badge>
        <Badge tone="neutral">منقضی: {expired.data !== undefined ? faNum(expired.data) : '…'}</Badge>
        <Badge tone="info">نمایش: {faNum(rows.length)} نشست</Badge>
      </div>
      <DataTable columns={cols} rows={list.data ? pageRows : undefined} rowKey={(x) => x.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={can('events.sessions.active.read') ? (x) => setDetail(x) : undefined}
        empty={<Empty title={filtered ? 'نشستی با این جست‌وجو و فیلترها پیدا نشد' : 'الان هیچ نشست فعالی نیست'} text={filtered ? undefined : 'نشست‌های منقضی و پایان‌یافته با فیلتر «وضعیت» دیده می‌شوند.'} />} />
      {rows.length > 0 ? <Pagination page={page} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} /> : null}
      {detail ? <SessionDetailModal session={detail} name={(id) => { const p = person(id); return p ? fullName(p) : null; }} onClose={() => setDetail(null)} /> : null}
    </Card>
  );
}

/* ───────────── ۲. محدودیت نشست ───────────── */
function LimitsTab() {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const policy = usePolicy();
  const save = useSavePolicy();
  const limits = useLimits();
  const timeouts = useTimeouts();
  const [maxS, setMaxS] = useState<number | null>(null);
  const [idle, setIdle] = useState<number | null>(null);
  const [editing, setEditing] = useState<RuleRow | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (policy.data) { setMaxS(policy.data.default_max_sessions); setIdle(policy.data.default_idle_timeout_minutes); } }, [policy.data]);
  const editable = can('events.security_policy.update');

  // ردیف یکپارچه‌ی html: قانون «نشست مجاز» و «مهلت» یک کاربر یا نقش کنار هم (با target_id)
  const custom = useMemo(() => {
    const m = new Map<string, RuleRow>();
    for (const l of limits.data ?? []) {
      if (!l.is_active) continue;
      const k = `${l.basis}:${l.target_id}`;
      m.set(k, { ...(m.get(k) ?? { key: k, basis: l.basis, target: l.target_id }), name: l.target_name ?? m.get(k)?.name, role: l.role_name ?? m.get(k)?.role, limit: { id: l.id, v: l.max_concurrent } });
    }
    for (const t of timeouts.data ?? []) {
      if (!t.is_active) continue;
      const k = `${t.basis}:${t.target_id}`;
      m.set(k, { ...(m.get(k) ?? { key: k, basis: t.basis, target: t.target_id }), name: m.get(k)?.name ?? t.target_name, role: m.get(k)?.role ?? t.role_name, timeout: { id: t.id, v: t.idle_timeout_minutes } });
    }
    return [...m.values()];
  }, [limits.data, timeouts.data]);

  const saveDefaults = () => {
    if (maxS == null || idle == null) return;
    save.mutate({ default_max_sessions: maxS, default_idle_timeout_minutes: idle }, { onSuccess: () => toast('پیش‌فرض‌های نشست ذخیره شد.'), onError: (e) => toast(userMessage(e), 'error') });
  };
  const resetRow = async (r: RuleRow) => {
    setBusy(r.key);
    try {
      if (r.limit) await adminApi(`/events/sessions/limits/${r.limit.id}`, { method: 'DELETE' });
      if (r.timeout) await adminApi(`/events/sessions/timeouts/${r.timeout.id}`, { method: 'DELETE' });
      toast('به پیش‌فرض برگشت.');
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setBusy(null);
      await invalidateSecurity(qc);
    }
  };
  const canEdit = can('events.sessions.limits.update') || can('events.sessions.timeouts.update');
  const canReset = can('events.sessions.limits.delete') || can('events.sessions.timeouts.delete');

  const cols: Column<RuleRow>[] = [
    { key: 'who', header: 'کاربر / نقش', render: (r) => <span className={u.strong}>{r.name || (r.basis === 'ROLE' ? 'نقش' : 'کاربر')}</span> },
    { key: 'role', header: 'نقش', render: (r) => <span className={u.muted}>{r.basis === 'ROLE' ? 'همه‌ی دارندگان این نقش' : r.role || '—'}</span> },
    { key: 'max', header: 'نشست مجاز', render: (r) => (r.limit?.v != null ? faNum(r.limit.v) : <span className={u.muted}>پیش‌فرض</span>) },
    { key: 'to', header: 'زمان انقضا', render: (r) => (r.timeout?.v != null ? timeoutLabel(r.timeout.v) : <span className={u.muted}>پیش‌فرض</span>) },
    {
      key: 'act', header: 'عملیات', render: (r) => (
        <span className={s.rowActs}>
          {canEdit ? <Button variant="secondary" size="sm" icon={<IconPencil size={14} />} onClick={() => setEditing(r)}>ویرایش</Button> : null}
          {canReset ? <Button variant="secondary" size="sm" disabled={busy === r.key} onClick={() => resetRow(r)}>بازگشت به پیش‌فرض</Button> : null}
          {!canEdit && !canReset ? <span className={u.muted}>—</span> : null}
        </span>
      ),
    },
  ];

  return (
    <div className={`${s.grid2} ${s.stretch}`}>
      <Card>
        <SectionTitle>تنظیمات پیش‌فرض نشست</SectionTitle>
        <p className={s.lead}>روی همه‌ی کاربران اعمال می‌شود؛ برای یک کاربر یا نقش می‌توان مقدار اختصاصی تعیین کرد.</p>
        {policy.isLoading || maxS == null || idle == null ? <SkeletonRows rows={3} /> : policy.error ? <ErrorBox error={policy.error} onRetry={() => policy.refetch()} /> : (
          <>
            <Setting title="تعداد نشست فعال مجاز" desc="حداکثر نشست هم‌زمان برای هر کاربر">
              <Stepper label="تعداد نشست فعال مجاز" value={maxS} onChange={setMaxS} min={BOUNDS.default_max_sessions[0]} max={BOUNDS.default_max_sessions[1]} unit="نشست" disabled={!editable} />
            </Setting>
            <div className={s.field}>
              <Select label="زمان انقضای هر نشست (Session Timeout)" value={String(idle)} onChange={(e) => setIdle(Number(e.target.value))} disabled={!editable}
                options={timeoutOptions(idle)}
                hint="پس از این مدت عدم فعالیت، نشست به‌صورت خودکار منقضی می‌شود." />
            </div>
            {editable ? <Button block onClick={saveDefaults} loading={save.isPending}
              disabled={maxS === policy.data?.default_max_sessions && idle === policy.data?.default_idle_timeout_minutes}>ذخیره‌ی پیش‌فرض‌ها</Button> : null}
          </>
        )}
      </Card>
      <Card>
        <SectionTitle extra={can('events.sessions.limits.create') ? <Button variant="secondary" icon={<IconPlus size={16} />} onClick={() => setEditing('new')}>تنظیم اختصاصی</Button> : null}>کاربران با تنظیم اختصاصی</SectionTitle>
        <p className={s.lead}>این کاربران و نقش‌ها از پیش‌فرض پیروی نمی‌کنند.</p>
        <DataTable columns={cols} rows={limits.data && timeouts.data ? custom : undefined} rowKey={(r) => r.key} loading={limits.isLoading || timeouts.isLoading}
          error={limits.error ?? timeouts.error} onRetry={() => { limits.refetch(); timeouts.refetch(); }}
          empty={<Empty title="همه از پیش‌فرض پیروی می‌کنند" />} />
      </Card>
      {editing ? <CustomRuleModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} defaults={{ max: maxS ?? 3, idle: idle ?? 30 }} /> : null}
    </div>
  );
}

type RuleRow = {
  key: string; basis: 'USER' | 'ROLE'; target: string; name?: string | null; role?: string | null;
  limit?: { id: string; v: number | null | undefined }; timeout?: { id: string; v: number | null | undefined };
};

/** مرز عددهای سیاست امنیتی و نشست = مرز schema بک‌اند (SecurityPolicyUpdateIn، Session*UpdateIn؛ 2026-10-25). بیرون از مرز ⇐ ۴۲۲. */
const BOUNDS = {
  password_min_length: [6, 128], password_expiry_days: [1, 3650], password_history_depth: [0, 24],
  auto_lock_after_attempts: [1, 100], auto_lock_minutes: [1, 10080], login_attempt_window_minutes: [1, 1440],
  default_max_sessions: [1, 50], default_idle_timeout_minutes: [1, 10080],
} as const;
const timeoutOptions = (current?: number | null) =>
  [...new Set([...TIMEOUTS, ...(current != null ? [current] : [])])]
    .filter((m) => m >= BOUNDS.default_idle_timeout_minutes[0] && m <= BOUNDS.default_idle_timeout_minutes[1])
    .sort((a, b) => a - b).map((m) => ({ value: String(m), label: timeoutLabel(m) }));

/**
 * ساخت یا ویرایش تنظیم اختصاصی نشست. ساخت: POST هر دو قانون. ویرایش (2026-10-25): PUT روی قانون موجود؛
 * اگر یکی از دو قانون نبود، همان یکی با POST ساخته می‌شود (PUT روی قانون ناموجود ۴۰۴ است).
 */
function CustomRuleModal({ row, onClose, defaults }: { row: RuleRow | null; onClose: () => void; defaults: { max: number; idle: number } }) {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useAllStaff(!row);
  const roles = useAllRoles(!row);
  const [basis, setBasis] = useState<'USER' | 'ROLE'>(row?.basis ?? 'USER');
  const [target, setTarget] = useState(row?.target ?? '');
  const [max, setMax] = useState(row?.limit?.v ?? defaults.max);
  const [idle, setIdle] = useState(row?.timeout?.v ?? defaults.idle);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (row?.limit) {
        if (row.limit.v !== max) await adminApi(`/events/sessions/limits/${row.limit.id}`, { method: 'PUT', body: { max_concurrent: max } });
      } else await adminApi('/events/sessions/limits', { method: 'POST', body: { basis, target_id: target, max_concurrent: max } });
      if (row?.timeout) {
        if (row.timeout.v !== idle) await adminApi(`/events/sessions/timeouts/${row.timeout.id}`, { method: 'PUT', body: { idle_timeout_minutes: idle } });
      } else await adminApi('/events/sessions/timeouts', { method: 'POST', body: { basis, target_id: target, idle_timeout_minutes: idle } });
      toast('تنظیم اختصاصی ذخیره شد.');
      onClose();
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setBusy(false);
      await invalidateSecurity(qc);
    }
  };
  // مجوز هر بخش: ویرایش = update، افزودن قانونِ نبوده = create
  const maxOk = row?.limit ? can('events.sessions.limits.update') : can('events.sessions.limits.create');
  const idleOk = row?.timeout ? can('events.sessions.timeouts.update') : can('events.sessions.timeouts.create');
  return (
    <Modal open onClose={onClose} title={row ? `تنظیم اختصاصی نشست — ${row.name || (row.basis === 'ROLE' ? 'نقش' : 'کاربر')}` : 'تنظیم اختصاصی نشست'} width={560}
      footer={<><Button onClick={submit} loading={busy} disabled={!target || (!maxOk && !idleOk)}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.modalBody}>
        {row ? (
          <div className={s.detailGrid}>
            <KeyValue label={row.basis === 'ROLE' ? 'نقش' : 'کاربر'}>{row.name || '—'}</KeyValue>
            <KeyValue label="نقش فعلی">{row.basis === 'ROLE' ? 'همه‌ی دارندگان این نقش' : row.role || '—'}</KeyValue>
          </div>
        ) : (
          <>
            <Segmented value={basis} onChange={(v) => { setBasis(v); setTarget(''); }} options={[{ value: 'USER', label: 'برای یک کاربر' }, { value: 'ROLE', label: 'برای یک نقش' }]} />
            <Select label={basis === 'USER' ? 'کاربر' : 'نقش'} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="انتخاب کنید"
              options={basis === 'USER'
                ? (staff.data ?? []).map((p) => ({ value: p.id, label: `${fullName(p)}${p.personnel_code ? ` — ${p.personnel_code}` : ''}` }))
                : (roles.data ?? []).filter((r) => r.is_active).map((r) => ({ value: r.id, label: r.name }))} />
          </>
        )}
        <Setting title="تعداد نشست فعال مجاز" desc="حداکثر نشست هم‌زمان">
          <Stepper label="نشست مجاز" value={max} onChange={setMax} min={BOUNDS.default_max_sessions[0]} max={BOUNDS.default_max_sessions[1]} unit="نشست" disabled={!maxOk} />
        </Setting>
        <Select label="زمان انقضای نشست" value={String(idle)} onChange={(e) => setIdle(Number(e.target.value))} disabled={!idleOk}
          options={timeoutOptions(idle)} />
      </div>
    </Modal>
  );
}

/* ───────────── ۳. سیاست‌های امنیتی ───────────── */
type Draft = Pick<SecurityPolicy, 'password_min_length' | 'require_digit' | 'require_symbol' | 'require_uppercase' | 'password_expiry_days' | 'password_history_depth'
  | 'auto_lock_after_attempts' | 'auto_lock_minutes' | 'auto_lock_enabled' | 'login_attempt_window_minutes' | 'password_expiry_enabled' | 'ip_restriction_mode'>;
const IP_KEY = ['events', 'security', 'ip-rules'];

/**
 * 2026-10-25: `max_login_attempts` و `min_browser_versions` در بک‌اند حذف شدند (PATCH کلید ناشناخته و null را با ۴۲۲ رد می‌کند).
 * «حد نهایی تلاش ورود» و «قفل حساب بعد از» یکی شدند ⇐ `auto_lock_after_attempts`؛ بخش «مرورگر» برداشته شد.
 */
function PolicyTab() {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const policy = usePolicy();
  const save = useSavePolicy();
  const ips = useIpRules();
  const [d, setD] = useState<Draft | null>(null);
  const [cidr, setCidr] = useState('');
  const [ipBusy, setIpBusy] = useState(false);
  useEffect(() => {
    const p = policy.data;
    if (!p) return;
    setD({
      password_min_length: p.password_min_length, require_digit: p.require_digit, require_symbol: p.require_symbol, require_uppercase: p.require_uppercase,
      password_expiry_days: p.password_expiry_days, password_history_depth: p.password_history_depth,
      auto_lock_after_attempts: p.auto_lock_after_attempts, auto_lock_minutes: p.auto_lock_minutes, ip_restriction_mode: p.ip_restriction_mode,
      auto_lock_enabled: p.auto_lock_enabled, login_attempt_window_minutes: p.login_attempt_window_minutes, password_expiry_enabled: p.password_expiry_enabled,
    });
  }, [policy.data]);
  const editable = can('events.security_policy.update');
  if (policy.isLoading || !d) return policy.error ? <ErrorBox error={policy.error} onRetry={() => policy.refetch()} /> : <SkeletonRows rows={6} height={80} />;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const ipOn = d.ip_restriction_mode !== 'ALLOW_ALL';
  const ipMode: 'WHITELIST_ONLY' | 'BLACKLIST_ONLY' = d.ip_restriction_mode === 'BLACKLIST_ONLY' ? 'BLACKLIST_ONLY' : 'WHITELIST_ONLY';
  const ruleMode = ipMode === 'WHITELIST_ONLY' ? 'ALLOW' : 'BLOCK';
  const shownRules = (ips.data ?? []).filter((r) => r.is_active && r.mode === ruleMode && r.applies_to === 'GLOBAL');
  const step = (k: keyof typeof BOUNDS & keyof Draft, label: string, unit: string) => (
    <Stepper label={label} value={d[k] as number} onChange={(v) => set(k, v)} min={BOUNDS[k][0]} max={BOUNDS[k][1]} unit={unit} disabled={!editable} />
  );

  const submit = () => {
    // فقط فیلدهای تغییرکرده (PATCH جزئی)
    const p = policy.data!;
    const patch = Object.fromEntries((Object.keys(d) as (keyof Draft)[]).filter((k) => d[k] !== p[k]).map((k) => [k, d[k]])) as SecurityPolicyPatch;
    if (!Object.keys(patch).length) { toast('تغییری برای ذخیره نیست.'); return; }
    save.mutate(patch, {
      onSuccess: () => toast('سیاست‌های امنیتی ذخیره شد.'),
      onError: (e) => toast(userMessage(e), 'error'),
    });
  };
  const addIp = async () => {
    const v = toLatinDigits(cidr.trim());
    if (!v) return;
    setIpBusy(true);
    try {
      await adminApi('/events/security-policy/ip-rules', { method: 'POST', body: { mode: ruleMode, cidr: v, applies_to: 'GLOBAL', note: '' } });
      setCidr('');
      toast(`${v} به ${ipMode === 'WHITELIST_ONLY' ? 'Whitelist' : 'Blacklist'} افزوده شد.`);
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setIpBusy(false);
      await qc.invalidateQueries({ queryKey: IP_KEY }); // فقط فهرست IP؛ پیش‌نویس سیاست‌ها دست نمی‌خورد
    }
  };
  const removeIp = async (r: IpRule) => {
    try {
      await adminApi(`/events/security-policy/ip-rules/${r.id}`, { method: 'DELETE' });
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      await qc.invalidateQueries({ queryKey: IP_KEY });
    }
  };

  return (
    <>
      <div className={`${s.grid2} ${s.stretch}`}>
        <PolicyCard icon={<IconKey size={20} />} title="رمز عبور" desc="طول، پیچیدگی و انقضای رمز عبور کاربران">
          <Setting title="حداقل طول رمز">{step('password_min_length', 'حداقل طول رمز', 'کاراکتر')}</Setting>
          <div className={`${s.setting} ${s.settingCol}`}>
            <div className={s.settingText}><span className={s.settingTitle}>پیچیدگی رمز</span><span className={s.settingDesc}>رمز تازه باید همه‌ی موارد انتخاب‌شده را داشته باشد</span></div>
            <div className={s.checks}>
              {([['require_digit', 'شامل عدد'], ['require_symbol', 'شامل سیمبل (!@#…)'], ['require_uppercase', 'شامل حرف بزرگ']] as const).map(([k, label]) => (
                <label key={k} className={`${s.check} ${d[k] ? s.checkOn : ''}`}>
                  <input type="checkbox" checked={d[k]} disabled={!editable} onChange={(e) => set(k, e.target.checked)} />{label}
                </label>
              ))}
            </div>
          </div>
          <Setting title="انقضای رمز عبور" desc="فقط کارکنان؛ رمز منقضی در ورود بعدی باید عوض شود">
            <Toggle checked={d.password_expiry_enabled} onChange={(v) => set('password_expiry_enabled', v)} disabled={!editable} label={d.password_expiry_enabled ? 'فعال' : 'غیرفعال'} />
          </Setting>
          {d.password_expiry_enabled ? (
            <div className={s.subBox}>
              <Setting title="تغییر رمز هر">{step('password_expiry_days', 'انقضای رمز', 'روز')}</Setting>
            </div>
          ) : null}
          <Setting title="عدم تکرار رمزهای قبلی" desc="رمز تازه با این تعداد رمز آخر نباید یکی باشد">
            {step('password_history_depth', 'عمق تاریخچه‌ی رمز', 'رمز')}
          </Setting>
        </PolicyCard>

        <PolicyCard icon={<IconLock size={20} />} title="ورود و مسدودسازی حساب" desc="کنترل تلاش‌های ناموفق ورود">
          <Setting title="بازه‌ی زمانی تلاش" desc="تلاش‌های ناموفق در این بازه شمرده می‌شوند">
            {step('login_attempt_window_minutes', 'بازه‌ی زمانی تلاش', 'دقیقه')}
          </Setting>
          <Setting title="قفل خودکار حساب" desc="پس از تلاش‌های ناموفق، حساب موقتاً قفل می‌شود">
            <Toggle checked={d.auto_lock_enabled} onChange={(v) => set('auto_lock_enabled', v)} disabled={!editable} label={d.auto_lock_enabled ? 'فعال' : 'غیرفعال'} />
          </Setting>
          {d.auto_lock_enabled ? <div className={s.subBox}>
            <Setting title="قفل حساب بعد از" desc="حداکثر تلاش ناموفق در بازه‌ی زمانی تلاش">{step('auto_lock_after_attempts', 'قفل حساب بعد از', 'تلاش')}</Setting>
            <Setting title="مدت مسدودی">{step('auto_lock_minutes', 'مدت مسدودی', 'دقیقه')}</Setting>
          </div> : null}
        </PolicyCard>
      </div>

      {can('events.security_policy.account_locks.list') ? <AccountLocksCard /> : null}
      {can('events.security_policy.two_factor.list') ? <TwoFactorCard /> : null}

      <PolicyCard icon={<IconServer size={20} />} title="محدودیت IP" desc="کنترل دسترسی به پنل بر اساس آدرس IP" wide>
        <Setting title="فعال‌سازی محدودیت IP">
          <Toggle checked={ipOn} onChange={(v) => set('ip_restriction_mode', v ? 'WHITELIST_ONLY' : 'ALLOW_ALL')} disabled={!editable} label={ipOn ? 'فعال' : 'غیرفعال'} />
        </Setting>
        {ipOn ? (
          <>
            <div className={s.ipMode}>
              <Segmented value={ipMode} onChange={(v) => set('ip_restriction_mode', v)} options={[{ value: 'WHITELIST_ONLY', label: 'Whitelist' }, { value: 'BLACKLIST_ONLY', label: 'Blacklist' }]} />
              <span className={u.muted}>{ipMode === 'WHITELIST_ONLY' ? 'فقط IPهای این فهرست اجازه‌ی ورود دارند.' : 'IPهای این فهرست اجازه‌ی ورود ندارند.'}</span>
            </div>
            {can('events.security_policy.ip_rules.create') ? (
              <div className={s.ipAdd}>
                <input className={`${s.ipInput} ltr`} value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="مثلاً 192.168.1.0/24" data-latin=""
                  onKeyDown={(e) => { if (e.key === 'Enter') addIp(); }} />
                <Button className={s.ipBtn} onClick={addIp} loading={ipBusy} disabled={!cidr.trim()}>افزودن به {ipMode === 'WHITELIST_ONLY' ? 'Whitelist' : 'Blacklist'}</Button>
              </div>
            ) : null}
            <div className={s.ipList}>
              {ips.isLoading ? <SkeletonRows rows={1} /> : shownRules.length === 0 ? <span className={u.muted}>فهرست خالی است.</span> : shownRules.map((r) => (
                <span key={r.id} className={s.ipChip}>
                  <span className="ltr" data-latin="">{r.cidr}</span>
                  {can('events.security_policy.ip_rules.delete') ? <button type="button" onClick={() => removeIp(r)} aria-label={`حذف ${r.cidr}`}><IconX size={14} /></button> : null}
                </span>
              ))}
            </div>
            {ipMode === 'WHITELIST_ONLY' && shownRules.length === 0 ? <InfoBanner tone="warning">با Whitelist خالی، پس از ذخیره هیچ کارمندی نمی‌تواند وارد شود{user?.is_superuser ? ' (سوپرادمین از محدودیت IP مستثناست)' : '، از جمله خودتان'}. بک‌اند هم ذخیره‌ی «فقط Whitelist» بدون IP مجاز را رد می‌کند؛ ابتدا IP خودتان را اضافه کنید.</InfoBanner> : null}
          </>
        ) : null}
      </PolicyCard>

      {editable ? (
        <Card className={s.saveBar}>
          <Button onClick={submit} loading={save.isPending}>ذخیره‌ی سیاست‌های امنیتی</Button>
          <span className={u.muted}>تغییرات پس از ذخیره روی ورودهای بعدی همه‌ی کاربران اعمال می‌شود. ورود دو مرحله‌ای، باز کردن قفل حساب‌ها و فهرست IP فوری ذخیره می‌شوند.</span>
        </Card>
      ) : null}
    </>
  );
}

/**
 * ورود دو مرحله‌ای برای هر نقش (2026-10-25، تصمیم افشین: فقط یک تیک، روش فقط پیامک، بدون مهلت).
 * فهرست نقش‌ها از rbac؛ تیک = نقشی که در GET /two-factor هست. هر تیک فوری ذخیره می‌شود.
 */
function TwoFactorCard() {
  const can = usePerm();
  const toast = useToast();
  const rules = useTwoFactorRules();
  const roles = useAllRoles(can('rbac.roles.list'));
  const setTf = useSetTwoFactor();
  const [pending, setPending] = useState<string | null>(null);
  const on = new Set((rules.data ?? []).filter((r) => r.is_active && r.is_required).map((r) => r.role_id));
  const active = (roles.data ?? []).filter((r) => r.is_active);
  const toggle = (roleId: string, name: string, v: boolean) => {
    setPending(roleId);
    setTf.mutate({ roleId, on: v }, {
      onSuccess: () => toast(v ? `ورود دو مرحله‌ای برای «${name}» الزامی شد.` : `ورود دو مرحله‌ای «${name}» برداشته شد.`),
      onError: (e) => toast(userMessage(e), 'error'),
      onSettled: () => setPending(null),
    });
  };
  // نقش تیک‌خورده‌ای که فهرست نقش‌ها را نمی‌بینیم (بدون مجوز rbac) هم با نامش نشان داده می‌شود
  const items = can('rbac.roles.list')
    ? active.map((r) => ({ id: r.id, name: r.name }))
    : (rules.data ?? []).map((r) => ({ id: r.role_id, name: r.role_name ?? r.role_code ?? 'نقش' }));
  return (
    <PolicyCard icon={<IconDeviceMobileMessage size={20} />} title={<>احراز هویت دومرحله‌ای <span data-latin="">(2FA)</span></>} desc="نقش‌هایی که برای ورود به پنل کد پیامکی هم لازم دارند" wide>
      <p className={s.note}>
        روش فقط پیامک است و مهلت ندارد: از ورود بعدی، کارکنان نقش تیک‌خورده پس از رمز عبور یک کد پیامکی هم وارد می‌کنند.
        کارمندی که موبایل ثبت‌شده ندارد نمی‌تواند وارد شود. سوپر ادمین هیچ‌وقت کد نمی‌گیرد. هر تیک فوری ذخیره می‌شود.
      </p>
      {rules.isLoading || roles.isLoading ? <SkeletonRows rows={1} /> : rules.error ? <ErrorBox error={rules.error} onRetry={() => rules.refetch()} /> : items.length === 0 ? (
        <span className={u.muted}>{can('rbac.roles.list') ? 'نقش فعالی تعریف نشده است.' : 'برای هیچ نقشی ورود دو مرحله‌ای الزامی نیست.'}</span>
      ) : (
        <div className={`${s.checks} ${s.roleChecks}`}>
          {items.map((r) => {
            const checked = on.has(r.id);
            const allowed = checked ? can('events.security_policy.two_factor.delete') : can('events.security_policy.two_factor.update');
            return (
              <label key={r.id} className={`${s.check} ${checked ? s.checkOn : ''}`}
                data-tip={allowed ? undefined : 'مجوز تغییر ورود دو مرحله‌ای را ندارید'}>
                <input type="checkbox" checked={checked} disabled={!allowed || pending === r.id} onChange={(e) => toggle(r.id, r.name, e.target.checked)} aria-label={`ورود دو مرحله‌ای برای ${r.name}`} />
                {r.name}
              </label>
            );
          })}
        </div>
      )}
    </PolicyCard>
  );
}

const LOCK_REASON: Record<string, { label: string; tone: 'warning' | 'danger' | 'neutral' }> = {
  AUTOMATIC_ATTEMPTS: { label: 'تلاش‌های ناموفق ورود', tone: 'warning' },
  MANUAL_ADMIN: { label: 'قفل دستی مدیر', tone: 'neutral' },
  SUSPICIOUS_ACTIVITY: { label: 'فعالیت مشکوک', tone: 'danger' },
};

/** حساب‌های قفل‌شده (2026-10-25): GET /account-locks (active، query سمت سرور) و PATCH …/unlock. */
function AccountLocksCard() {
  const can = usePerm();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [state, setState] = useState<'' | 'true' | 'false'>('true');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const dq = useDebounced(toLatinDigits(q.trim()), 350);
  const list = useAccountLocks({ active: state, query: dq, page, pageSize });
  const unlock = useUnlockAccount();
  const [confirm, setConfirm] = useState<AccountLock | null>(null);
  const at = (iso?: string | null) => (iso ? <span className={s.when}>{faDate(iso)}<span className={u.muted}>{faTime(iso)}</span></span> : null);
  const filtered = Boolean(dq) || state !== 'true';
  const doUnlock = (x: AccountLock) => unlock.mutate(x.id, {
    onSuccess: () => { toast(`قفل حساب ${x.user_name || 'کاربر'} باز شد.`); setConfirm(null); },
    onError: (e) => {
      // قفلی که در این فاصله خودش تمام شده ⇐ ۴۰۹ account_lock_not_active
      toast(e instanceof ApiError && e.code === 'account_lock_not_active' ? 'این قفل دیگر برقرار نبود؛ فهرست تازه شد.' : userMessage(e), e instanceof ApiError && e.code === 'account_lock_not_active' ? undefined : 'error');
      setConfirm(null);
    },
  });

  const cols: Column<AccountLock>[] = [
    { key: 'user', header: 'کاربر', render: (x) => <span className={u.strong}>{x.user_name || 'کاربر'}</span> },
    { key: 'reason', header: 'دلیل', render: (x) => { const r = LOCK_REASON[x.reason] ?? { label: x.reason, tone: 'neutral' as const }; return <Badge tone={r.tone}>{r.label}</Badge>; } },
    { key: 'at', header: 'زمان قفل', render: (x) => at(x.locked_at) },
    { key: 'until', header: 'باز شدن خودکار', render: (x) => at(x.unlock_at) ?? <span className={u.muted}>فقط دستی</span> },
    { key: 'st', header: 'وضعیت', render: (x) => <span className={s.pill}><Badge tone={x.is_active ? 'danger' : 'neutral'}>{x.is_active ? 'قفل' : 'باز شده'}</Badge></span> },
    { key: 'off', header: 'زمان باز شدن', render: (x) => at(x.unlocked_at) ?? <span className={u.muted}>—</span> },
    {
      key: 'act', header: 'عملیات', render: (x) => (x.is_active && can('events.security_policy.account_locks.update') ? (
        <Button variant="secondary" size="sm" className={s.pillBtn} icon={<IconLockOpen size={13} />} onClick={() => setConfirm(x)}>باز کردن قفل</Button>
      ) : <span className={u.muted}>—</span>),
    },
  ];

  return (
    <PolicyCard icon={<IconUserX size={20} />} title="حساب‌های قفل‌شده" desc="حساب‌هایی که با تلاش ناموفق، دستی یا فعالیت مشکوک قفل شده‌اند" wide>
      <TableFilters
        search={q}
        onSearch={(v) => { setQ(v); setPage(1); }}
        placeholder="جست‌وجو: نام، نام کاربری یا موبایل"
        filters={[{ key: 'state', label: 'وضعیت قفل', value: state, onChange: (v: string) => { setState(v as '' | 'true' | 'false'); setPage(1); }, options: [{ value: 'true', label: 'قفل برقرار' }, { value: 'false', label: 'باز شده' }] }]}
      />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(x) => x.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={filtered ? 'حسابی با این جست‌وجو و فیلتر پیدا نشد' : 'الان هیچ حسابی قفل نیست'} text={filtered ? undefined : 'حساب‌هایی که قبلاً قفل شده و باز شده‌اند با فیلتر «وضعیت قفل» دیده می‌شوند.'} />} />
      {list.data && list.data.total > 0 ? <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} /> : null}
      {confirm ? (
        <Modal open onClose={() => setConfirm(null)} title="باز کردن قفل حساب" width={480}
          footer={<><Button onClick={() => doUnlock(confirm)} loading={unlock.isPending} icon={<IconLockOpen size={16} />}>باز کردن قفل</Button><Button variant="ghost" onClick={() => setConfirm(null)}>انصراف</Button></>}>
          <p className={s.note}>قفل حساب <strong>{confirm.user_name || 'کاربر'}</strong> باز شود؟ پس از آن کاربر می‌تواند دوباره وارد شود.</p>
        </Modal>
      ) : null}
    </PolicyCard>
  );
}

function PolicyCard({ icon, title, desc, children, wide }: { icon: ReactNode; title: ReactNode; desc: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <Card className={wide ? s.wide : s.full}>
      <div className={s.cardHead}>
        <span className={s.cardIcon}>{icon}</span>
        <div><div className={s.cardTitle}>{title}</div><div className={s.cardDesc}>{desc}</div></div>
      </div>
      <div className={s.cardBody}>{children}</div>
    </Card>
  );
}

function Setting({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className={s.setting}>
      <div className={s.settingText}>
        <span className={s.settingTitle}>{title}</span>
        {desc ? <span className={s.settingDesc}>{desc}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** جزئیات نشست — GET /events/sessions/active/{id}: زمان انقضا، پایان، پایان‌دهنده و موبایل کاربر. */
function SessionDetailModal({ session, name, onClose }: { session: Session; name: (id: string) => string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['events', 'security', 'session', session.id], queryFn: ({ signal }) => adminApi<AdminSchemas['SessionDetailOut']>(`/events/sessions/active/${session.id}`, { signal }) });
  const d = q.data;
  const st = SESSION_STATUS[(d ?? session).status] ?? { label: (d ?? session).status, tone: 'neutral' as const };
  const at = (iso?: string | null) => (iso ? `${faDate(iso)} ${faTime(iso)}` : '—');
  return (
    <Modal open onClose={onClose} title={`نشست ${session.full_name || 'کاربر'}`} width={640}>
      {q.isLoading ? <SkeletonRows rows={4} /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
        <div className={s.detailGrid}>
          <KeyValue label="وضعیت"><Badge tone={st.tone}>{st.label}</Badge></KeyValue>
          <KeyValue label="کاربر">{d.full_name || session.full_name || '—'}</KeyValue>
          <KeyValue label="نقش فعلی کاربر">{d.role_name || '—'}</KeyValue>
          <KeyValue label="موبایل کاربر">{d.user_mobile || '—'}</KeyValue>
          <KeyValue label="شروع">{at(d.started_at)}</KeyValue>
          <KeyValue label="آخرین فعالیت">{at(d.last_activity_at)}</KeyValue>
          <KeyValue label="انقضا">{at(d.expires_at)}</KeyValue>
          <KeyValue label="پایان">{at(d.terminated_at)}</KeyValue>
          <KeyValue label="پایان‌دهنده">{d.terminated_by_id ? name(d.terminated_by_id) ?? 'کاربر' : '—'}</KeyValue>
          <KeyValue label="نوع دستگاه">{DEVICE[d.device_type] ?? d.device_type}</KeyValue>
          <KeyValue label="مرورگر">{d.browser || '—'}</KeyValue>
          <KeyValue label="IP" ltr>{d.ip_address || '—'}</KeyValue>
          <KeyValue label="مکان تقریبی">{d.approx_location || '—'}</KeyValue>
        </div>
      ) : null}
    </Modal>
  );
}
