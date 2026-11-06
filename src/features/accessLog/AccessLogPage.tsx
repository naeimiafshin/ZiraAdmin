import { useState } from 'react';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { IconActivity, IconCircleCheck, IconCircleX, IconFileExport, IconPercentage } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, faTime, fullName } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, KeyValue, Modal, PageHead, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllStaff } from '@/features/users/api';
import s from './accessLog.module.css';
import { saveBlob } from '@/shared/lib/download';

type Decision = AdminSchemas['AccessDecisionOut'];
const RESULT: Record<string, { label: string; tone: 'success' | 'danger' }> = { ALLOW: { label: 'مجاز', tone: 'success' }, DENY: { label: 'رد شد', tone: 'danger' } };
const DENY_REASONS = ['NO_PERMISSION', 'WRONG_BRANCH', 'UNDECLARED', 'NOT_AUTHENTICATED', 'EXPIRED'] as const;
const REASON: Record<string, string> = {
  GRANTED: 'مجوز داشت', ROLE_PERMISSION: 'مجوز نقش', SYSTEM_USER: 'کاربر سیستمی', NO_PERMISSION: 'نداشتن مجوز',
  WRONG_BRANCH: 'خارج از شعبه', UNDECLARED: 'مجوز تعریف‌نشده', NOT_AUTHENTICATED: 'احراز هویت نشده', EXPIRED: 'نشست منقضی',
};

/**
 * گزارش دسترسی‌ها (rbac.access_log، مسیر بک‌اند `/rbac/access-log`): ثبت مجاز یا رد شدن هر درخواست.
 * طرح html و IA ندارد؛ هم‌خوان با بقیه‌ی پنل. فیلترها همان پارامترهای بک‌اند‌اند (جست‌وجو = کد مجوز).
 */
export default function AccessLogPage() {
  const can = usePerm();
  const toast = useToast();
  const back = useBack('/');
  const lp = useListParams({ page_size: 10 });
  const search = useSearchState(lp);
  const user = lp.get('user'); const decision = lp.get('decision'); const reason = lp.get('reason');
  const staff = useAllStaff(can('identity.users.list'));
  const branches = useBranchOptions();
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const filters = { user_id: user || undefined, decision: decision || undefined, reason: reason || undefined };
  const list = useQuery({
    queryKey: ['rbac', 'access-log', lp.page, lp.pageSize, lp.q, user, decision, reason],
    queryFn: ({ signal }) => adminApi<Paginated<Decision>>('/rbac/access-log', { query: { page: lp.page, page_size: lp.pageSize, query: lp.q || undefined, ...filters }, signal }),
    placeholderData: keepPreviousData,
  });
  // شمارش‌ها (هم‌پای جست‌وجو و فیلتر کاربر، مستقل از فیلتر نتیجه/دلیل) ⇐ کارت‌های بالا و نوار دلایل؛ هر کدام یک درخواست page_size=1
  const facetBase = { query: lp.q || undefined, user_id: user || undefined, page: 1, page_size: 1 };
  const facets: { k: string; decision?: string; reason?: string }[] = [{ k: 'all' }, { k: 'ALLOW', decision: 'ALLOW' }, { k: 'DENY', decision: 'DENY' }, ...DENY_REASONS.map((r) => ({ k: r, decision: 'DENY', reason: r }))];
  const counts = useQueries({
    queries: facets.map((f) => ({
      queryKey: ['rbac', 'access-log', 'count', f.k, lp.q, user],
      queryFn: ({ signal }: { signal: AbortSignal }) => adminApi<Paginated<Decision>>('/rbac/access-log', { query: { ...facetBase, decision: f.decision, reason: f.reason }, signal }).then((r) => r.total),
      staleTime: 30_000,
    })),
  });
  const cnt = (k: string) => counts[facets.findIndex((f) => f.k === k)]?.data;
  const total = cnt('all'); const denied = cnt('DENY'); const allowed = cnt('ALLOW');
  const denyRate = total ? Math.round(((denied ?? 0) / total) * 100) : undefined;
  const reasonMax = Math.max(1, ...DENY_REASONS.map((r) => cnt(r) ?? 0));
  const who = (id?: string | null) => { if (!id) return null; const p = staff.data?.find((x) => x.id === id); return p ? fullName(p) : null; };
  const branchName = (id?: string | null) => (id ? branches.data?.find((b) => b.id === id)?.name ?? '—' : '—');

  const cols: Column<Decision>[] = [
    { key: 'at', header: 'زمان', render: (d) => <span>{faDate(d.occurred_at)} <span className={s.muted}>{faTime(d.occurred_at)}</span></span> },
    { key: 'user', header: 'کاربر', render: (d) => (d.user_id ? <strong>{who(d.user_id) ?? 'کاربر'}</strong> : <span className={s.muted}>ناشناس</span>) },
    { key: 'perm', header: 'مجوز', code: true, render: (d) => <span className="ltr" data-latin="">{d.permission_code}</span> },
    { key: 'res', header: 'نتیجه', render: (d) => { const r = RESULT[d.decision] ?? { label: d.decision, tone: 'danger' as const }; return <Badge tone={r.tone}>{r.label}</Badge>; } },
    { key: 'why', header: 'دلیل', render: (d) => REASON[d.reason] ?? d.reason },
    { key: 'branch', header: 'شعبه', render: (d) => branchName(d.branch_id) },
    { key: 'ip', header: 'IP', render: (d) => <span data-latin="" className="ltr">{d.ip_address || '—'}</span> },
  ];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await adminApi<Decision[]>('/rbac/access-log/export', { query: { ...filters, permission_code: lp.q || undefined } });
      const head = ['زمان', 'کاربر', 'مجوز', 'نتیجه', 'دلیل', 'شعبه', 'IP', 'شناسه درخواست'];
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = [head, ...rows.map((d) => [`${faDate(d.occurred_at)} ${faTime(d.occurred_at)}`, who(d.user_id) ?? (d.user_id ?? 'ناشناس'), d.permission_code,
        RESULT[d.decision]?.label ?? d.decision, REASON[d.reason] ?? d.reason, branchName(d.branch_id), d.ip_address ?? '', d.request_id])].map((r) => r.map((c) => esc(String(c))).join(','));
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      saveBlob(blob, 'access-log.csv');
      toast(`${rows.length.toLocaleString('fa-IR')} ردیف خروجی گرفته شد.`);
    } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };

  return (
    <>
      <PageHead back={back} title="گزارش دسترسی‌ها" sub="ثبت مجاز یا رد شدن هر درخواست کاربران به سامانه"
        actions={can('rbac.access_log.export') ? <Button variant="secondary" icon={<IconFileExport size={17} />} loading={exporting} onClick={exportCsv}>خروجی CSV</Button> : null} />
      <div className={s.stats}>
        <Stat icon={<IconActivity size={20} />} tone="brand" label="کل رویدادها" value={total} sub="با جست‌وجو و فیلتر کاربر" />
        <Stat icon={<IconCircleCheck size={20} />} tone="success" label="مجاز" value={allowed} on={decision === 'ALLOW'}
          onClick={() => lp.set({ decision: decision === 'ALLOW' ? null : 'ALLOW', reason: null })} sub={decision === 'ALLOW' ? 'فیلتر شده — کلیک برای همه' : 'کلیک برای فیلتر'} />
        <Stat icon={<IconCircleX size={20} />} tone="danger" label="رد شده" value={denied} on={decision === 'DENY' && !reason}
          onClick={() => lp.set({ decision: decision === 'DENY' && !reason ? null : 'DENY', reason: null })} sub={decision === 'DENY' && !reason ? 'فیلتر شده — کلیک برای همه' : 'کلیک برای فیلتر'} />
        <Stat icon={<IconPercentage size={20} />} tone="warning" label="نرخ رد" value={denyRate} suffix="٪" sub="سهم رد شده از کل" />
      </div>

      <Card className={s.reasons}>
        <div className={s.reasonsHead}>
          <span className={s.reasonsTitle}>دلایل رد دسترسی</span>
          <span className={s.muted}>روی هر دلیل کلیک کنید تا جدول فیلتر شود</span>
        </div>
        <div className={s.reasonList}>
          {DENY_REASONS.map((r) => {
            const c = cnt(r);
            const on = reason === r;
            return (
              <button key={r} type="button" className={`${s.reason} ${on ? s.reasonOn : ''}`} aria-pressed={on}
                onClick={() => lp.set({ reason: on ? null : r, decision: on ? null : 'DENY' })} data-tip={on ? 'برداشتن فیلتر' : `فقط «${REASON[r]}»`}>
                <span className={s.reasonTop}><span>{REASON[r]}</span><strong>{c === undefined ? '…' : faNum(c)}</strong></span>
                <span className={s.reasonBar}><span style={{ width: `${c ? Math.max(4, (c / reasonMax) * 100) : 0}%` }} /></span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <TableFilters
          search={search.text}
          onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }}
          placeholder="جست‌وجو: کد مجوز (مثلاً identity.users)"
          filters={[
            ...(staff.data ? [{ key: 'user', label: 'کاربر', value: user, onChange: lp.setFilter('user'), options: staff.data.map((p) => ({ value: p.id, label: fullName(p) })) }] : []),
            { key: 'decision', label: 'نتیجه', value: decision, onChange: lp.setFilter('decision'), options: Object.entries(RESULT).map(([value, v]) => ({ value, label: v.label })) },
            { key: 'reason', label: 'دلیل', value: reason, onChange: lp.setFilter('reason'), options: Object.entries(REASON).map(([value, label]) => ({ value, label })) },
          ]}
        />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(d) => d.id} onRowClick={can('rbac.access_log.read') ? (d) => setOpen(d.id) : undefined}
          loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} empty={lp.q || user || decision || reason
            ? <Empty title="رکوردی با این جست‌وجو و فیلترها پیدا نشد" />
            : <Empty title="هنوز رویدادی ثبت نشده است" text="سامانه فقط درخواست‌های رد شده و عملیات حساسِ مجاز را ثبت می‌کند؛ درخواست‌های عادیِ مجاز در این گزارش نمی‌آیند." />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {open ? <DetailModal id={open} who={who} branchName={branchName} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function DetailModal({ id, who, branchName, onClose }: { id: string; who: (id?: string | null) => string | null; branchName: (id?: string | null) => string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['rbac', 'access-log', 'one', id], queryFn: ({ signal }) => adminApi<Decision>(`/rbac/access-log/${id}`, { signal }) });
  const d = q.data;
  return (
    <Modal open onClose={onClose} title="جزئیات تصمیم دسترسی" width={620}>
      {q.isLoading || !d ? <SkeletonRows rows={4} /> : (
        <div className={s.kv}>
          <KeyValue label="زمان">{faDate(d.occurred_at)} {faTime(d.occurred_at)}</KeyValue>
          <KeyValue label="نتیجه"><Badge tone={RESULT[d.decision]?.tone ?? 'danger'}>{RESULT[d.decision]?.label ?? d.decision}</Badge></KeyValue>
          <KeyValue label="کاربر">{d.user_id ? who(d.user_id) ?? 'کاربر' : 'ناشناس'}</KeyValue>
          <KeyValue label="دلیل">{REASON[d.reason] ?? d.reason}</KeyValue>
          <KeyValue label="مجوز" ltr>{d.permission_code}</KeyValue>
          <KeyValue label="شعبه">{branchName(d.branch_id)}</KeyValue>
          <KeyValue label="IP" ltr>{d.ip_address || '—'}</KeyValue>
          <KeyValue label="شناسه درخواست" ltr>{d.request_id}</KeyValue>
        </div>
      )}
    </Modal>
  );
}

function Stat({ icon, tone, label, value, suffix, sub, on, onClick }: {
  icon: React.ReactNode; tone: 'brand' | 'success' | 'danger' | 'warning'; label: string; value: number | undefined; suffix?: string; sub: string; on?: boolean; onClick?: () => void;
}) {
  const body = (
    <>
      <span className={`${s.statIcon} ${s[`t_${tone}`]}`}>{icon}</span>
      <span className={s.statText}>
        <span className={s.statLabel}>{label}</span>
        <span className={s.statValue}>{value === undefined ? '…' : `${faNum(value)}${suffix ?? ''}`}</span>
        <span className={s.statSub}>{sub}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={`${s.stat} ${s.statBtn} ${on ? s.statOn : ''} ${on ? s[`on_${tone}`] : ''}`} onClick={onClick} aria-pressed={!!on} data-tip="">{body}</button>
  ) : <div className={s.stat}>{body}</div>;
}
