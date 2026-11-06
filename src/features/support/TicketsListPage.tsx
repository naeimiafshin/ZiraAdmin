import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconAlertTriangle, IconArchive, IconBolt, IconClockHour4, IconFileExport, IconInbox, IconMessageCheck, IconRefresh, IconSend, IconSquarePlus, IconUserQuestion } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum, fullName } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Card, Empty, InfoBanner, PageHead, Pagination, Segmented } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllStaff } from '@/features/users/api';
import { DateFilter } from '@/features/branches/DateFilter';
import { dayEnd, dayStart } from '@/features/pricing/marketingApi';
import { exportTickets, supportError, useDepartments, useEvaluateSla, useTicketCount, useTickets, type TicketQuery, type TicketRow } from './api';
import { DueCell, PriorityBadge, Stat, StatusBadge, WhenCell } from './components';
import { CONTACT_ROLE, PRIORITY, PRIORITY_ORDER, STATUS } from './labels';
import s from './support.module.css';

export type ListMode = 'waiting' | 'answered' | 'outbound';

const META: Record<ListMode, { title: string; sub: string; ordering: string }> = {
  waiting: { title: 'تیکت‌های در انتظار', sub: 'تیکت‌هایی که منتظر پاسخ پشتیبانی‌اند؛ قدیمی‌ترین بالا', ordering: 'created_at' },
  answered: { title: 'تیکت‌های پاسخ داده شده', sub: 'تیکت‌هایی که پشتیبانی پاسخ داده یا بسته است', ordering: '-updated_at' },
  outbound: { title: 'ثبت تیکت', sub: 'پیام‌هایی که پشتیبانی برای مشتری یا مهمان فرستاده است', ordering: '-created_at' },
};

/**
 * فهرست تیکت‌ها (GET /support/tickets) در سه حالت منوی IA «پشتیبانی و ارتباطات»:
 * در انتظار (status=WAITING)، پاسخ داده شده (ANSWERED | CLOSED)، ثبت تیکت / پیام‌های ارسالی (direction=OUTBOUND).
 * فیلترها (تأیید افشین 2026-10-24): جست‌وجو، دپارتمان، اولویت، نقش مخاطب، کارشناس (+ بدون کارشناس)، بازه‌ی تاریخ ایجاد، شعبه.
 * کارت «نقض SLA» منبع را به GET /sla-breaches می‌برد که فقط وضعیت، دپارتمان، اولویت و جست‌وجو را می‌پذیرد.
 */
export default function TicketsListPage({ mode }: { mode: ListMode }) {
  const can = usePerm();
  const toast = useToast();
  const nav = useNavigate();
  const back = useBack('/');
  const lp = useListParams({ page_size: 10 });
  const search = useSearchState(lp);
  const meta = META[mode];
  const dep = lp.get('dep'); const pri = lp.get('pri'); const role = lp.get('role'); const asg = lp.get('asg');
  const branch = lp.get('branch'); const df = lp.get('df'); const dt = lp.get('dt');
  const sla = lp.get('sla') === '1';
  const tabSt = lp.get('st');
  const status = mode === 'waiting' ? 'WAITING' : mode === 'answered' ? (tabSt === 'CLOSED' ? 'CLOSED' : 'ANSWERED') : tabSt || undefined;
  const deps = useDepartments(can('support.tickets.list'));
  const staff = useAllStaff(can('identity.users.list'));
  const branches = useBranchOptions();
  const [exporting, setExporting] = useState(false);
  const evaluate = useEvaluateSla();

  const base: TicketQuery = mode === 'outbound' ? { direction: 'OUTBOUND' } : {};
  const filters: TicketQuery = {
    ...base, status, department_id: dep || undefined, priority: pri || undefined, contact_role: role || undefined,
    unassigned: asg === 'none' ? true : undefined, assigned_to_id: asg && asg !== 'none' ? asg : undefined,
    branch_id: branch || undefined, date_from: df ? dayStart(df) : undefined, date_to: dt ? dayEnd(dt) : undefined,
    query: lp.q || undefined, ordering: meta.ordering,
  };
  const list = useTickets({ ...filters, page: lp.page, page_size: lp.pageSize }, { sla });

  // کارت‌های آمار: شمارش کل همان صفحه (مستقل از فیلترهای جدول)
  const cWaiting = useTicketCount({ ...base, status: 'WAITING' });
  const cUrgent = useTicketCount({ ...base, status: 'WAITING', priority: 'URGENT' }, { enabled: mode === 'waiting' });
  const cUnassigned = useTicketCount({ ...base, status: 'WAITING', unassigned: true }, { enabled: mode === 'waiting' });
  const cAnswered = useTicketCount({ ...base, status: 'ANSWERED' }, { enabled: mode !== 'waiting' });
  const cClosed = useTicketCount({ ...base, status: 'CLOSED' }, { enabled: mode !== 'waiting' });
  const cAll = useTicketCount(base, { enabled: mode === 'outbound' });
  const canSla = can('support.tickets.sla.read');
  const cSla = useTicketCount({ status: mode === 'outbound' ? undefined : status }, { sla: true, enabled: canSla && mode !== 'outbound' });

  const rowsNow = list.data?.results ?? [];
  const hasField = (k: keyof TicketRow) => rowsNow.some((r) => r[k] !== undefined);
  const who = (id?: string | null, name?: string | null) => {
    if (!id) return null;
    if (name) return name;
    const p = staff.data?.find((x) => x.id === id);
    return p ? fullName(p) : 'ارجاع‌شده';
  };
  const multiBranch = (branches.data?.length ?? 0) > 1;
  const branchName = (id?: string | null) => (id ? branches.data?.find((b) => b.id === id)?.name ?? '—' : 'بدون شعبه');

  const cols: Column<TicketRow>[] = [
    { key: 'n', header: 'ردیف', render: (_t, i) => faNum((lp.page - 1) * lp.pageSize + i + 1) },
    { key: 'code', header: 'کد پیگیری', code: true, render: (t) => <span className="ltr" data-latin="">{t.tracking_code}</span> },
    { key: 'subj', header: 'موضوع', render: (t) => <span className={s.subject}>{t.subject}</span> },
    { key: 'who', header: 'نام مخاطب', render: (t) => <span>{t.contact_name || '—'}<span className={s.sub}>{CONTACT_ROLE[t.contact_role] ?? t.contact_role}</span></span> },
    ...(hasField('last_message_preview') ? [{ key: 'msg', header: 'آخرین پیام', render: (t: TicketRow) => <span className={s.preview} data-tip={t.last_message_preview ?? ''}>{t.last_message_preview || '—'}</span> }] : []),
    ...(hasField('received_files_count') ? [{ key: 'fin', header: 'فایل‌های دریافتی', render: (t: TicketRow) => faNum(t.received_files_count ?? 0) }] : []),
    ...(hasField('sent_files_count') ? [{ key: 'fout', header: 'فایل‌های ارسالی', render: (t: TicketRow) => faNum(t.sent_files_count ?? 0) }] : []),
    { key: 'dep', header: 'دپارتمان', render: (t) => t.department_name ?? <span className={s.muted}>تعیین‌نشده</span> },
    { key: 'pri', header: 'اولویت', render: (t) => <PriorityBadge priority={t.priority} /> },
    ...(mode === 'outbound' ? [{ key: 'st', header: 'وضعیت', render: (t: TicketRow) => <StatusBadge status={t.status} /> }] : []),
    ...(mode !== 'outbound' ? [{ key: 'asg', header: 'کارشناس', render: (t: TicketRow) => (t.assigned_to_id ? who(t.assigned_to_id, t.assigned_to_name) : <span className={s.muted}>بدون کارشناس</span>) }] : []),
    ...(multiBranch ? [{ key: 'br', header: 'شعبه', render: (t: TicketRow) => branchName(t.branch_id) }] : []),
    { key: 'at', header: mode === 'outbound' ? 'تاریخ ارسال' : 'تاریخ ایجاد', render: (t) => <WhenCell iso={t.created_at} /> },
    ...(mode === 'waiting' || sla ? [{ key: 'due', header: 'مهلت پاسخ', render: (t: TicketRow) => <DueCell due={t.due_at} breached={t.is_sla_breached} /> }] : []),
    ...(mode === 'answered' && status === 'ANSWERED' ? [{ key: 'rep', header: 'تاریخ پاسخ', render: (t: TicketRow) => <WhenCell iso={t.replied_at} /> }] : []),
    ...(mode === 'answered' && status === 'CLOSED' ? [{ key: 'cl', header: 'تاریخ بستن', render: (t: TicketRow) => <WhenCell iso={t.closed_at} /> }] : []),
    ...(mode === 'outbound' ? [{ key: 'upd', header: 'آخرین تغییر', render: (t: TicketRow) => <WhenCell iso={t.updated_at} /> }] : []),
  ];

  const fdefs: FilterDef[] = [
    ...(mode === 'outbound' ? [{ key: 'st', label: 'وضعیت', value: tabSt, onChange: lp.setFilter('st'), options: Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label })) }] : []),
    { key: 'dep', label: 'دپارتمان', value: dep, onChange: lp.setFilter('dep'), options: (deps.data ?? []).map((d) => ({ value: d.id, label: d.name })) },
    { key: 'pri', label: 'اولویت', value: pri, onChange: lp.setFilter('pri'), options: PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY[p]!.label })) },
    ...(sla ? [] : [
      { key: 'role', label: 'نقش مخاطب', value: role, onChange: lp.setFilter('role'), options: Object.entries(CONTACT_ROLE).map(([value, label]) => ({ value, label })) },
      { key: 'asg', label: 'کارشناس', value: asg, onChange: lp.setFilter('asg'), options: [{ value: 'none', label: 'بدون کارشناس' }, ...(staff.data ?? []).map((p) => ({ value: p.id, label: fullName(p) }))] },
      ...(multiBranch ? [{ key: 'branch', label: 'شعبه', value: branch, onChange: lp.setFilter('branch'), options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) }] : []),
    ]),
  ];

  const doExport = async () => {
    setExporting(true);
    try { await exportTickets(filters); toast('فایل CSV تیکت‌ها دریافت شد.'); } catch (e) { toast(supportError(e), 'error'); } finally { setExporting(false); }
  };
  const doEvaluate = async () => {
    try { const r = await evaluate.mutateAsync(); toast(`${faNum(r.scanned)} نوبت انتظار بررسی شد؛ ${faNum(r.new_breaches)} نقض تازه ثبت شد.`); } catch (e) { toast(supportError(e), 'error'); }
  };
  const toggle = (patch: Record<string, string | null>) => lp.set(patch);
  const anyFilter = !!(lp.q || dep || pri || role || asg || branch || df || dt || sla || (mode === 'outbound' && tabSt));

  return (
    <>
      <PageHead back={back} title={meta.title} sub={meta.sub}
        actions={<div className={s.actions}>
          {mode === 'waiting' && can('support.tickets.sla.update') ? <Button variant="secondary" icon={<IconRefresh size={17} />} loading={evaluate.isPending} onClick={doEvaluate}>بررسی نقض SLA</Button> : null}
          {can('support.tickets.export') && !sla ? <Button variant="secondary" icon={<IconFileExport size={17} />} loading={exporting} onClick={doExport}>خروجی CSV</Button> : null}
          {mode === 'outbound' && can('support.tickets.create') ? <Button icon={<IconSquarePlus size={17} />} onClick={() => nav('/support/outbound/new')}>ارسال پیام جدید</Button> : null}
        </div>} />

      {mode === 'waiting' ? (
        <div className={`${s.stats} ${canSla ? '' : s.stats3}`}>
          <Stat icon={<IconInbox size={20} />} tone="brand" label="در انتظار پاسخ" value={cWaiting.data} sub="همه‌ی تیکت‌های منتظر پشتیبانی" on={!pri && asg !== 'none' && !sla}
            onClick={() => toggle({ pri: null, asg: null, sla: null })} />
          <Stat icon={<IconBolt size={20} />} tone="danger" label="فوری" value={cUrgent.data} on={pri === 'URGENT'} sub={pri === 'URGENT' ? 'فیلتر شده — کلیک برای همه' : 'مهلت ۱ ساعت اداری'}
            onClick={() => toggle({ pri: pri === 'URGENT' ? null : 'URGENT' })} />
          <Stat icon={<IconUserQuestion size={20} />} tone="warning" label="بدون کارشناس" value={cUnassigned.data} on={asg === 'none'} sub={asg === 'none' ? 'فیلتر شده — کلیک برای همه' : 'هنوز به کسی ارجاع نشده'}
            onClick={() => toggle({ asg: asg === 'none' ? null : 'none', sla: null })} />
          {canSla ? <Stat icon={<IconAlertTriangle size={20} />} tone="info" label="نقض SLA" value={cSla.data} on={sla} sub={sla ? 'فیلتر شده — کلیک برای همه' : 'از مهلت پاسخ گذشته یا سابقه دارد'}
            onClick={() => toggle({ sla: sla ? null : '1', role: null, asg: null, branch: null, df: null, dt: null })} /> : null}
        </div>
      ) : mode === 'answered' ? (
        <div className={`${s.stats} ${canSla ? '' : s.stats3}`}>
          <Stat icon={<IconMessageCheck size={20} />} tone="success" label="پاسخ داده‌شده" value={cAnswered.data} on={status === 'ANSWERED' && !sla} sub="منتظر پیام بعدی مشتری" onClick={() => toggle({ st: null, sla: null })} />
          <Stat icon={<IconArchive size={20} />} tone="info" label="بسته‌شده" value={cClosed.data} on={status === 'CLOSED' && !sla} sub="رسیدگی تمام شده" onClick={() => toggle({ st: 'CLOSED', sla: null })} />
          <Stat icon={<IconInbox size={20} />} tone="warning" label="در انتظار پاسخ" value={cWaiting.data} sub="رفتن به تیکت‌های در انتظار" onClick={() => nav('/support/tickets')} />
          {canSla ? <Stat icon={<IconAlertTriangle size={20} />} tone="danger" label="سابقه‌ی نقض SLA" value={cSla.data} on={sla} sub={sla ? 'فیلتر شده — کلیک برای همه' : `در «${STATUS[status ?? 'ANSWERED']?.label}»`}
            onClick={() => toggle({ sla: sla ? null : '1', role: null, asg: null, branch: null, df: null, dt: null })} /> : null}
        </div>
      ) : (
        <div className={s.stats}>
          <Stat icon={<IconSend size={20} />} tone="brand" label="همه‌ی پیام‌های ارسالی" value={cAll.data} on={!tabSt} sub="تیکت‌های ثبت‌شده توسط پشتیبانی" onClick={() => toggle({ st: null })} />
          <Stat icon={<IconClockHour4 size={20} />} tone="success" label="منتظر پاسخ مخاطب" value={cAnswered.data} on={tabSt === 'ANSWERED'} sub="مخاطب هنوز جواب نداده" onClick={() => toggle({ st: tabSt === 'ANSWERED' ? null : 'ANSWERED' })} />
          <Stat icon={<IconInbox size={20} />} tone="warning" label="پاسخ مخاطب رسیده" value={cWaiting.data} on={tabSt === 'WAITING'} sub="منتظر پاسخ پشتیبانی" onClick={() => toggle({ st: tabSt === 'WAITING' ? null : 'WAITING' })} />
          <Stat icon={<IconArchive size={20} />} tone="info" label="بسته‌شده" value={cClosed.data} on={tabSt === 'CLOSED'} sub="رسیدگی تمام شده" onClick={() => toggle({ st: tabSt === 'CLOSED' ? null : 'CLOSED' })} />
        </div>
      )}

      <Card>
        {mode === 'answered' ? (
          <div className={s.tableTop}>
            <Segmented value={status === 'CLOSED' ? 'CLOSED' : 'ANSWERED'} onChange={(v) => lp.set({ st: v === 'ANSWERED' ? null : v })}
              options={[{ value: 'ANSWERED', label: 'پاسخ داده‌شده' }, { value: 'CLOSED', label: 'بسته‌شده' }]} />
          </div>
        ) : null}
        {sla ? <div className={s.bar}><InfoBanner tone="warning">فهرست نقض SLA شامل نقض‌های قبلی هم هست؛ در این حالت فقط جست‌وجو، دپارتمان و اولویت فیلتر می‌شوند.</InfoBanner></div> : null}
        <TableFilters stacked search={search.text} onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }} placeholder="جست‌وجو: موضوع، کد پیگیری، نام، تلفن یا ایمیل مخاطب" filters={fdefs}
          onReset={() => lp.set({ df: null, dt: null, sla: null })} extraActive={!!(df || dt || sla)}
          extra={sla ? null : <span className={s.dates}>
            <DateFilter label="از تاریخ" value={df} onChange={(v) => lp.set({ df: v || null })} />
            <DateFilter label="تا تاریخ" value={dt} onChange={(v) => lp.set({ dt: v || null })} />
          </span>}
          count={list.data ? `${faNum(list.data.total)} تیکت` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(t) => t.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('support.tickets.read') ? (t) => nav(`/support/tickets/${t.id}`) : undefined}
          empty={anyFilter ? <Empty title="تیکتی با این جست‌وجو و فیلترها پیدا نشد" />
            : mode === 'waiting' ? <Empty title="تیکتی در انتظار پاسخ نیست" text="همه‌ی تیکت‌ها پاسخ داده شده‌اند." />
            : mode === 'answered' ? <Empty title={status === 'CLOSED' ? 'تیکت بسته‌شده‌ای نیست' : 'تیکت پاسخ داده‌شده‌ای نیست'} />
            : <Empty title="هنوز پیامی از پشتیبانی ارسال نشده است" action={can('support.tickets.create') ? <Button onClick={() => nav('/support/outbound/new')}>ارسال پیام جدید</Button> : undefined} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
    </>
  );
}
