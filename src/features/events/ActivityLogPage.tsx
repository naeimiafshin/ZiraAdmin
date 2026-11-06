import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  IconActivity, IconChartBar, IconCircleCheck, IconCircleX, IconFileExport, IconHandStop, IconHistory, IconListDetails, IconUserSearch, IconX,
} from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, faTime, fullName } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useDebounced } from '@/shared/lib/useDebounced';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, ErrorBox, KeyValue, Modal, PageHead, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import { downloadXlsx } from '@/features/catalog/api';
import { useStaffList } from '@/features/users/api';
import { useActivityChanges, useActivityCounts, useActivityDetail, useActivityLogs, useAllEventTypes, type ActivityLog } from './api';
import { describe, differsFromRaw, type Part } from './describe';
import { ACTOR_KIND, domainName, RESULT, relTime, SEVERITY } from './labels';
import s from './events.module.css';

const RESULTS = ['SUCCESS', 'FAILURE', 'DENIED'] as const;
/** روز شمسی انتخاب‌شده (میلادی YYYY-MM-DD در URL) ⇐ ابتدا/انتهای روز به وقت تهران (بک‌اند datetime می‌گیرد). */
const dayStart = (d: string) => `${d}T00:00:00+03:30`;
const dayEnd = (d: string) => `${d}T23:59:59+03:30`;

/**
 * لاگ فعالیت‌ها (`events.activity_log`، مسیر بک‌اند `/events/activity-log`؛ نسخه‌ی «مدیریت کاربران ⇐ سامانه» در `/identity/activity-log`).
 * طرح html ندارد؛ ستون‌ها از IA «لاگ فعالیت ها» و بک‌اند؛ الگو «گزارش دسترسی‌ها» (افشین 2026-10-25: شکل صفحه و فیلترها تأیید شد).
 */
export default function ActivityLogPage() {
  const can = usePerm();
  const toast = useToast();
  const back = useBack('/');
  const lp = useListParams({ page_size: 20 });
  const search = useSearchState(lp);
  const domain = lp.get('domain'); const event = lp.get('event'); const result = lp.get('result');
  const actor = lp.get('actor'); const actorName = lp.get('actor_name'); const df = lp.get('df'); const dt = lp.get('dt');
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const types = useAllEventTypes(can('events.event_types.list'));

  // فیلترها سمت سرور (ActivityLogFilterIn)
  const base = {
    query: lp.q || undefined, domain_code: domain || undefined, event_code: event || undefined, actor_user_id: actor || undefined,
    date_from: df ? dayStart(df) : undefined, date_to: dt ? dayEnd(dt) : undefined,
  };
  const list = useActivityLogs({ ...base, result: result || undefined, page: lp.page, page_size: lp.pageSize });
  const counts = useActivityCounts(base, [...RESULTS]);
  const cnt = (i: number) => counts[i]?.data;

  const domains = useMemo(() => [...new Set((types.data ?? []).map((t) => t.domain_code))].sort((a, b) => domainName(a).localeCompare(domainName(b), 'fa')), [types.data]);
  const events = useMemo(() => (types.data ?? []).filter((t) => t.domain_code === domain).sort((a, b) => a.title.localeCompare(b.title, 'fa')), [types.data, domain]);
  const active = !!(lp.q || domain || event || result || actor || df || dt);

  const cols: Column<ActivityLog>[] = [
    { key: 'at', header: 'زمان', render: (x) => <span className={s.when} data-tip={relTime(x.occurred_at)}>{faDate(x.occurred_at)}<span className={s.muted}>{faTime(x.occurred_at)}</span></span> },
    { key: 'dom', header: 'دامنه', render: (x) => domainName(x.domain_code) },
    { key: 'ev', header: 'رخداد', render: (x) => <span className={s.event}><b>{x.event_title}</b><span className={s.code} data-latin="">{x.domain_code}.{x.event_code}</span></span> },
    { key: 'sev', header: 'شدت', render: (x) => <Badge tone={SEVERITY[x.severity]?.tone ?? 'neutral'}>{SEVERITY[x.severity]?.label ?? x.severity}</Badge> },
    { key: 'actor', header: 'کاربر', render: (x) => (x.actor_name ? <b>{x.actor_name}</b> : <span className={s.muted}>{ACTOR_KIND[x.actor_kind] ?? x.actor_kind}</span>) },
    // موضوع و خلاصه‌ی کوتاه فارسی (describe.ts؛ افشین 2026-10-25)؛ متن اصلی بک‌اند در مودال
    { key: 'obj', header: 'موضوع', render: (x) => <Subject d={describe(x)} /> },
    { key: 'sum', header: 'خلاصه', render: (x) => <span className={s.summary}><Parts parts={describe(x).summary} /></span> },
    { key: 'res', header: 'نتیجه', render: (x) => <Badge tone={RESULT[x.result]?.tone ?? 'neutral'}>{RESULT[x.result]?.label ?? x.result}</Badge> },
    { key: 'ip', header: 'IP', render: (x) => <span className="ltr" data-latin="">{x.ip_address || '—'}</span> },
  ];

  const exportXlsx = async () => {
    setExporting(true);
    try {
      // بک‌اند فایل xlsx می‌دهد (همان فیلترهای فهرست، بدون صفحه‌بندی، حداکثر ۵۰٬۰۰۰ ردیف؛ بیشتر ⇐ ۴۰۰ export_too_large)
      await downloadXlsx('/events/activity-log/export', { ...base, result: result || undefined }, 'activity-log.xlsx');
      toast('فایل اکسل لاگ فعالیت‌ها دانلود شد.');
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  };
  const toggleResult = (r: string) => lp.set({ result: result === r ? null : r });

  return (
    <>
      <PageHead back={back} title="لاگ فعالیت‌ها" sub="هر کاری که کاربران و سامانه در پنل انجام داده‌اند، با جزئیات و تغییر فیلدها"
        actions={can('events.activity_log.export') ? <Button variant="secondary" icon={<IconFileExport size={17} />} loading={exporting} onClick={exportXlsx}>خروجی اکسل</Button> : null} />
      <div className={s.stats}>
        <Stat icon={<IconActivity size={20} />} tone="brand" label="کل رخدادها" value={cnt(0)} sub="با جست‌وجو و فیلترها" />
        <Stat icon={<IconCircleCheck size={20} />} tone="success" label="موفق" value={cnt(1)} on={result === 'SUCCESS'} onClick={() => toggleResult('SUCCESS')}
          sub={result === 'SUCCESS' ? 'فیلتر شده — کلیک برای همه' : 'کلیک برای فیلتر'} />
        <Stat icon={<IconCircleX size={20} />} tone="danger" label="ناموفق" value={cnt(2)} on={result === 'FAILURE'} onClick={() => toggleResult('FAILURE')}
          sub={result === 'FAILURE' ? 'فیلتر شده — کلیک برای همه' : 'کلیک برای فیلتر'} />
        <Stat icon={<IconHandStop size={20} />} tone="warning" label="رد شده" value={cnt(3)} on={result === 'DENIED'} onClick={() => toggleResult('DENIED')}
          sub={result === 'DENIED' ? 'فیلتر شده — کلیک برای همه' : 'کلیک برای فیلتر'} />
      </div>

      {/* کارت خلاصه با نوار نسبی (افشین 2026-10-25، گزینه‌ی الف): تا endpoint آمار بک‌اند ساخته نشده، فقط «به‌زودی» */}
      <Card className={s.summaryCard}>
        <div className={s.summaryHead}>
          <span className={s.summaryIcon}><IconChartBar size={18} /></span>
          <span className={s.summaryTitle}>پراکندگی رخدادها بر اساس دامنه</span>
          <span className={s.soon}>به‌زودی</span>
        </div>
        <p className={s.muted}>نمودار سهم هر دامنه (با کلیک برای فیلتر) پس از ساخت گزارش آماری لاگ فعالیت در بک‌اند نمایش داده می‌شود.</p>
      </Card>

      <Card>
        <TableFilters
          search={search.text}
          onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }}
          placeholder="جست‌وجو: خلاصه، عنوان یا کد رخداد، موضوع، کد مجوز"
          stacked
          filters={[
            ...(can('events.event_types.list') ? [
              { key: 'domain', label: 'دامنه', value: domain, onChange: (v: string) => lp.set({ domain: v, event: null }), options: domains.map((d) => ({ value: d, label: domainName(d) })) },
              ...(domain ? [{ key: 'event', label: 'رخداد', value: event, onChange: lp.setFilter('event'), options: events.map((t) => ({ value: t.code, label: t.title })) }] : []),
            ] : []),
            { key: 'result', label: 'نتیجه', value: result, onChange: lp.setFilter('result'), options: RESULTS.map((r) => ({ value: r, label: RESULT[r]!.label })) },
          ]}
          extra={<>
            {can('identity.users.list') ? (
              <span className={s.actorWrap}>
                <button type="button" className={`${s.actorBtn} ${actor ? s.actorOn : ''}`} onClick={() => setPicking(true)} aria-haspopup="dialog">
                  <IconUserSearch size={16} /><span className={s.actorLabel}>کاربر</span><b>{actor ? actorName || 'انتخاب‌شده' : 'همه'}</b>
                </button>
                {actor ? <button type="button" className={s.actorClear} aria-label="برداشتن فیلتر کاربر" onClick={() => lp.set({ actor: null, actor_name: null })}><IconX size={14} /></button> : null}
              </span>
            ) : null}
            <DateFilter label="از تاریخ" value={df} onChange={(v) => lp.set({ df: v || null })} />
            <DateFilter label="تا تاریخ" value={dt} onChange={(v) => lp.set({ dt: v || null })} />
          </>}
          extraActive={!!(actor || df || dt)}
          onReset={() => lp.set({ actor: null, actor_name: null, df: null, dt: null })}
          count={list.data ? `${faNum(list.data.total)} رخداد` : undefined}
        />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(x) => x.id} onRowClick={can('events.activity_log.read') ? (x) => setOpen(x.id) : undefined}
          loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={active
            ? <Empty icon={<IconHistory size={26} stroke={1.5} />} title="رخدادی با این جست‌وجو و فیلترها پیدا نشد" />
            : <Empty icon={<IconHistory size={26} stroke={1.5} />} title="هنوز رخدادی ثبت نشده است" text="هر تغییری که کاربران در پنل می‌دهند (مثل ویرایش کاربر یا ثبت کالا) و هر ورود به سامانه این‌جا ثبت می‌شود." />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[20, 50, 100]} /> : null}
      </Card>
      {open ? <DetailModal id={open} onClose={() => setOpen(null)} /> : null}
      {picking ? <ActorPicker onClose={() => setPicking(false)} onPick={(id, name) => { lp.set({ actor: id, actor_name: name }); setPicking(false); }} /> : null}
    </>
  );
}

/** انتخاب کاربر عامل با جدول (جست‌وجو + صفحه‌بندی سمت سرور؛ GET /auth/staff). */
function ActorPicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string, name: string) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300);
  const list = useStaffList({ page, page_size: 8, query: dq || undefined });
  type Staff = NonNullable<typeof list.data>['results'][number];
  const cols: Column<Staff>[] = [
    { key: 'code', header: 'کد پرسنلی', code: true, render: (u) => <span data-latin="">{u.personnel_code || '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (u) => <b>{fullName(u)}</b> },
    { key: 'user', header: 'نام کاربری', render: (u) => <span className="ltr" data-latin="">{u.username || '—'}</span> },
    { key: 'mobile', header: 'موبایل', render: (u) => <span className="ltr">{u.phone_number || '—'}</span> },
  ];
  return (
    <Modal open onClose={onClose} title="انتخاب کاربر" width={680}>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام، نام کاربری، موبایل یا کد پرسنلی" count={list.data ? `${faNum(list.data.total)} نفر` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(u) => u.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(u) => onPick(u.id, fullName(u))} empty={<Empty title="کاربری پیدا نشد" />} />
      {list.data && list.data.total > 8 ? <Pagination page={page} pageSize={8} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}

/** جزئیات یک رخداد: مشخصات، payload خوانا و جدول تغییر فیلدها (مقدار قبلی ⇐ مقدار جدید). */
function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const can = usePerm();
  const navigate = useNavigate();
  const q = useActivityDetail(id);
  const canChanges = can('events.activity_log.detail.read');
  const ch = useActivityChanges(id, canChanges);
  const d = q.data;
  const desc = d ? describe(d) : null;
  const payload = d && Object.keys(d.payload ?? {}).length ? JSON.stringify(d.payload, null, 2) : null;
  const changeCols: Column<NonNullable<typeof ch.data>[number]>[] = [
    { key: 'f', header: 'فیلد', render: (c) => <span className={s.event}><b>{c.field_label || c.field_path}</b>{c.field_label && c.field_label !== c.field_path ? <span className={s.code} data-latin="">{c.field_path}</span> : null}</span> },
    { key: 'o', header: 'مقدار قبلی', render: (c) => <Val v={c.old_value} old /> },
    { key: 'arrow', header: '', render: () => <span className={s.muted}>⇐</span> },
    { key: 'n', header: 'مقدار جدید', render: (c) => <Val v={c.new_value} /> },
  ];
  return (
    <Modal open onClose={onClose} title={d ? d.event_title : 'جزئیات رخداد'} width={860}>
      {q.isLoading ? <SkeletonRows rows={5} /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
        <div className={s.detail}>
          <div className={s.kv}>
            <KeyValue label="زمان">{faDate(d.occurred_at)} {faTime(d.occurred_at)} <span className={s.muted}>({relTime(d.occurred_at)})</span></KeyValue>
            <KeyValue label="نتیجه"><Badge tone={RESULT[d.result]?.tone ?? 'neutral'}>{RESULT[d.result]?.label ?? d.result}</Badge></KeyValue>
            <KeyValue label="دامنه">{domainName(d.domain_code)}</KeyValue>
            <KeyValue label="کد رخداد" ltr><span data-latin="">{`${d.domain_code}.${d.event_code}`}</span></KeyValue>
            <KeyValue label="شدت"><Badge tone={SEVERITY[d.severity]?.tone ?? 'neutral'}>{SEVERITY[d.severity]?.label ?? d.severity}</Badge></KeyValue>
            <KeyValue label="کاربر">{d.actor_name || ACTOR_KIND[d.actor_kind] || d.actor_kind}</KeyValue>
            <KeyValue label="نقش کاربر"><span className={s.soon}>به‌زودی</span></KeyValue>
            <KeyValue label="نشست مربوط"><span className={s.soon}>به‌زودی</span></KeyValue>
            <KeyValue label="موضوع"><Subject d={desc!} /></KeyValue>
            <KeyValue label="شناسه‌ی موضوع" ltr><span data-latin="">{d.object_label || '—'}</span></KeyValue>
            <KeyValue label="کد مجوز" ltr><span data-latin="">{d.permission_code || '—'}</span></KeyValue>
            {d.branch_id ? <KeyValue label="شعبه" ltr><span data-latin="">{d.branch_id}</span></KeyValue> : null}
            <KeyValue label="IP" ltr><span data-latin="">{d.ip_address || '—'}</span></KeyValue>
            <KeyValue label="شناسه درخواست" ltr><span data-latin="">{d.request_id || '—'}</span></KeyValue>
          </div>
          <div className={s.block}>
            <span className={s.blockTitle}>خلاصه</span>
            <p className={s.blockText}><Parts parts={desc!.summary} /></p>
            {d.summary && differsFromRaw(d, desc!.summary) ? <p className={`${s.rawText} ltr`} data-latin="" dir="auto">متن ثبت‌شده: {d.summary}</p> : null}
          </div>
          {d.user_agent ? <div className={s.block}><span className={s.blockTitle}>مرورگر / دستگاه</span><p className={`${s.blockText} ltr`} data-latin="">{d.user_agent}</p></div> : null}
          <div className={s.block}>
            <span className={s.blockTitle}>تغییر فیلدها</span>
            {!canChanges ? <p className={s.muted}>دیدن تغییر فیلدها مجوز «جزئیات تغییرات فعالیت» می‌خواهد.</p>
              : ch.isLoading ? <SkeletonRows rows={2} /> : ch.error ? <ErrorBox error={ch.error} onRetry={() => ch.refetch()} />
              : (ch.data ?? []).length === 0 ? <p className={s.muted}>این رخداد تغییر فیلدی ثبت نکرده است.</p>
              : <DataTable columns={changeCols} rows={ch.data} rowKey={(c) => c.field_path} />}
          </div>
          {payload ? <div className={s.block}><span className={s.blockTitle}>داده‌ی رخداد (payload)</span><pre className={s.json} data-latin="" dir="ltr">{payload}</pre></div> : null}
          {can('events.event_types.list') ? (
            <div className={s.blockActs}>
              <Button variant="ghost" icon={<IconListDetails size={16} />} onClick={() => navigate(`/events/event-types?query=${encodeURIComponent(d.event_code)}&domain=${d.domain_code}`)}>این نوع رخداد در کاتالوگ</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** تکه‌های متن: فارسی عادی، کد/IP لاتین (ارقام لاتین می‌مانند) */
function Parts({ parts }: { parts: Part[] }) {
  return <>{parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <bdi key={i} className={s.latin} dir="ltr" data-latin="">{p.latin}</bdi>))}</>;
}

/** موضوع: نوع (کم‌رنگ) + نام؛ بدون نام ⇐ فقط نوع؛ هیچ‌کدام ⇐ «—» */
function Subject({ d }: { d: ReturnType<typeof describe> }) {
  if (!d.noun && !d.name.length) return <span className={s.muted}>—</span>;
  return (
    <span className={s.subject}>
      {d.noun ? <span className={d.name.length ? s.subjectNoun : undefined}>{d.noun}</span> : null}
      {d.name.length ? <b><Parts parts={d.name} /></b> : null}
    </span>
  );
}

/** مقدار قبلی/جدید: خالی ⇐ «—»، مقدار JSON/طولانی ⇐ لاتین و قابل‌شکست فقط داخل مودال. */
function Val({ v, old }: { v?: string | null; old?: boolean }) {
  if (v === null || v === undefined || v === '') return <span className={s.muted}>—</span>;
  return <span className={`${s.val} ${old ? s.valOld : s.valNew}`} data-latin="" dir="auto">{v}</span>;
}

function Stat({ icon, tone, label, value, sub, on, onClick }: {
  icon: ReactNode; tone: 'brand' | 'success' | 'danger' | 'warning'; label: string; value: number | undefined; sub: string; on?: boolean; onClick?: () => void;
}) {
  const body = (
    <>
      <span className={`${s.statIcon} ${s[`t_${tone}`]}`}>{icon}</span>
      <span className={s.statText}>
        <span className={s.statLabel}>{label}</span>
        <span className={s.statValue}>{value === undefined ? '…' : faNum(value)}</span>
        <span className={s.statSub}>{sub}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={`${s.stat} ${s.statBtn} ${on ? s[`on_${tone}`] : ''}`} onClick={onClick} aria-pressed={!!on} data-tip="">{body}</button>
  ) : <div className={s.stat}>{body}</div>;
}
