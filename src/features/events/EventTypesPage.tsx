import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconHistory, IconListDetails } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, faTime } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, ErrorBox, KeyValue, Modal, PageHead, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useAllEventTypes, useEventType, useEventTypes, type EventType } from './api';
import { CATEGORY, domainName, SEVERITY } from './labels';
import s from './events.module.css';

const yesNo = (v: boolean) => <Badge tone={v ? 'success' : 'neutral'}>{v ? 'بله' : 'خیر'}</Badge>;

/**
 * کاتالوگ رخدادها (`events.event_types`، `/events/event-types`): فهرست فقط‌خواندنی رخدادهایی که دامنه‌ها اعلام کرده‌اند
 * (`syncevents` می‌سازد، دستی ساخته یا ویرایش نمی‌شود). طرح html و IA ندارد (افشین 2026-10-25: شکل و فیلترها تأیید شد).
 */
export default function EventTypesPage() {
  const can = usePerm();
  const back = useBack('/');
  const lp = useListParams({ page_size: 20 });
  const search = useSearchState(lp);
  const domain = lp.get('domain'); const category = lp.get('category'); const severity = lp.get('severity');
  const [open, setOpen] = useState<string | null>(null);
  const all = useAllEventTypes();
  const list = useEventTypes({ query: lp.q || undefined, domain_code: domain || undefined, category: category || undefined, severity: severity || undefined, page: lp.page, page_size: lp.pageSize });
  const domains = useMemo(() => [...new Set((all.data ?? []).map((t) => t.domain_code))].sort((a, b) => domainName(a).localeCompare(domainName(b), 'fa')), [all.data]);
  const active = !!(lp.q || domain || category || severity);

  const cols: Column<EventType>[] = [
    { key: 'dom', header: 'دامنه', render: (t) => domainName(t.domain_code) },
    { key: 'code', header: 'کد رخداد', code: true, render: (t) => <span className="ltr" data-latin="">{t.domain_code}.{t.code}</span> },
    { key: 'title', header: 'عنوان', render: (t) => <b>{t.title}</b> },
    { key: 'res', header: 'منبع', code: true, render: (t) => <span className="ltr" data-latin="">{t.resource_code}</span> },
    { key: 'cat', header: 'دسته', render: (t) => CATEGORY[t.category] ?? t.category },
    { key: 'sev', header: 'شدت', render: (t) => <Badge tone={SEVERITY[t.severity]?.tone ?? 'neutral'}>{SEVERITY[t.severity]?.label ?? t.severity}</Badge> },
    { key: 'chg', header: 'ثبت تغییر فیلدها', render: (t) => yesNo(t.records_changes) },
    { key: 'alert', header: 'هشدار', render: (t) => yesNo(t.is_alertable) },
    { key: 'ret', header: 'ماندگاری (روز)', render: (t) => faNum(t.retention_days) },
    { key: 'sync', header: 'آخرین همگام‌سازی', render: (t) => <span className={s.when}>{faDate(t.synced_at)}<span className={s.muted}>{faTime(t.synced_at)}</span></span> },
  ];

  return (
    <>
      <PageHead back={back} title="کاتالوگ رخدادها" sub="همه‌ی رخدادهایی که سامانه ثبت می‌کند؛ از اعلام هر دامنه ساخته می‌شود و فقط‌خواندنی است" />
      <Card>
        <TableFilters
          search={search.text}
          onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }}
          placeholder="جست‌وجو: کد یا عنوان رخداد"
          filters={[
            { key: 'domain', label: 'دامنه', value: domain, onChange: lp.setFilter('domain'), options: domains.map((d) => ({ value: d, label: domainName(d) })) },
            { key: 'category', label: 'دسته', value: category, onChange: lp.setFilter('category'), options: Object.entries(CATEGORY).map(([value, label]) => ({ value, label })) },
            { key: 'severity', label: 'شدت', value: severity, onChange: lp.setFilter('severity'), options: Object.entries(SEVERITY).map(([value, v]) => ({ value, label: v.label })) },
          ]}
          count={list.data ? `${faNum(list.data.total)} رخداد` : undefined}
        />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(t) => t.id} onRowClick={can('events.event_types.read') ? (t) => setOpen(t.id) : undefined}
          loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={active
            ? <Empty icon={<IconListDetails size={26} stroke={1.5} />} title="رخدادی با این جست‌وجو و فیلترها پیدا نشد" />
            : <Empty icon={<IconListDetails size={26} stroke={1.5} />} title="کاتالوگ رخدادها خالی است" text="رخدادها با فرمان syncevents از اعلام دامنه‌ها ساخته می‌شوند؛ احتمالاً این فرمان روی سرور اجرا نشده است." />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[20, 50, 100]} /> : null}
      </Card>
      {open ? <TypeModal id={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function TypeModal({ id, onClose }: { id: string; onClose: () => void }) {
  const can = usePerm();
  const navigate = useNavigate();
  const q = useEventType(id);
  const t = q.data;
  const schema = t && Object.keys(t.payload_schema ?? {}).length ? JSON.stringify(t.payload_schema, null, 2) : null;
  return (
    <Modal open onClose={onClose} title={t ? t.title : 'نوع رخداد'} width={720}
      footer={t && can('events.activity_log.list') ? (
        <Button variant="secondary" icon={<IconHistory size={16} />} onClick={() => navigate(`/events/activity-log?domain=${t.domain_code}&event=${encodeURIComponent(t.code)}`)}>لاگ‌های این رخداد</Button>
      ) : undefined}>
      {q.isLoading ? <SkeletonRows rows={4} /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : t ? (
        <div className={s.detail}>
          <div className={s.kv}>
            <KeyValue label="دامنه">{domainName(t.domain_code)}</KeyValue>
            <KeyValue label="کد رخداد" ltr><span data-latin="">{`${t.domain_code}.${t.code}`}</span></KeyValue>
            <KeyValue label="منبع (مجوز)" ltr><span data-latin="">{`${t.domain_code}.${t.resource_code}`}</span></KeyValue>
            <KeyValue label="دسته">{CATEGORY[t.category] ?? t.category}</KeyValue>
            <KeyValue label="شدت"><Badge tone={SEVERITY[t.severity]?.tone ?? 'neutral'}>{SEVERITY[t.severity]?.label ?? t.severity}</Badge></KeyValue>
            <KeyValue label="وضعیت"><Badge tone={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'فعال' : 'غیرفعال'}</Badge></KeyValue>
            <KeyValue label="ثبت در لاگ">{t.is_audited ? 'بله' : 'خیر'}</KeyValue>
            <KeyValue label="ثبت تغییر فیلدها">{t.records_changes ? 'بله' : 'خیر'}</KeyValue>
            <KeyValue label="هشدار">{t.is_alertable ? 'بله' : 'خیر'}</KeyValue>
            <KeyValue label="ماندگاری">{faNum(t.retention_days)} روز</KeyValue>
            <KeyValue label="آخرین همگام‌سازی">{faDate(t.synced_at)} {faTime(t.synced_at)}</KeyValue>
          </div>
          <div className={s.block}>
            <span className={s.blockTitle}>ساختار داده‌ی رخداد (payload)</span>
            {schema ? <pre className={s.json} data-latin="" dir="ltr">{schema}</pre> : <p className={s.muted}>برای این رخداد ساختار داده اعلام نشده است.</p>}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
