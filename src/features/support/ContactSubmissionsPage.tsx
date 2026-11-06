import { useNavigate } from 'react-router';
import { IconMail, IconMailForward, IconSquarePlus } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime, faNum } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Card, Empty, InfoBanner, KeyValue, Modal, PageHead, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useContactSubmission, useContactSubmissions, type ContactRow } from './api';
import { Stat, WhenCell } from './components';
import s from './support.module.css';

/**
 * پیام‌های فرم «تماس با ما»ی سایت (GET /support/contact-submissions). بک‌اند فقط جست‌وجو دارد (نام، موضوع، ایمیل، تلفن)؛
 * وضعیت «رسیدگی‌شده» و تبدیل خودکار به تیکت ندارد ⇐ «ثبت تیکت برای این فرد» فرم ارسال پیام جدید را با مشخصات او پیش‌پر می‌کند.
 */
export default function ContactSubmissionsPage() {
  const can = usePerm();
  const nav = useNavigate();
  const back = useBack('/');
  const lp = useListParams({ page_size: 10 });
  const search = useSearchState(lp);
  const open = lp.get('open');
  const list = useContactSubmissions({ page: lp.page, page_size: lp.pageSize, query: lp.q || undefined });
  const all = useContactSubmissions({ page: 1, page_size: 1 });

  const cols: Column<ContactRow>[] = [
    { key: 'n', header: 'ردیف', render: (_r, i) => faNum((lp.page - 1) * lp.pageSize + i + 1) },
    { key: 'at', header: 'زمان دریافت', render: (r) => <WhenCell iso={r.created_at} /> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (r) => <b>{r.full_name}</b> },
    { key: 'subj', header: 'موضوع', render: (r) => r.subject },
    { key: 'email', header: 'ایمیل', render: (r) => (r.email ? <span className="ltr" data-latin="">{r.email}</span> : <span className={s.muted}>—</span>) },
    { key: 'phone', header: 'تلفن', render: (r) => (r.phone ? <span className="ltr tnum">{r.phone}</span> : <span className={s.muted}>—</span>) },
  ];

  return (
    <>
      <PageHead back={back} title="پیام‌های فرم تماس" sub="پیام‌هایی که بازدیدکنندگان از فرم «تماس با ما»ی سایت فرستاده‌اند" />
      <div className={`${s.stats} ${s.stats3}`}>
        <Stat icon={<IconMail size={20} />} tone="brand" label="همه‌ی پیام‌ها" value={all.data?.total} sub="از ابتدا تا امروز" />
        <Stat icon={<IconMail size={20} />} tone="info" label="نتیجه‌ی جست‌وجو" value={list.data?.total} sub={lp.q ? `برای «${lp.q}»` : 'بدون جست‌وجو'} />
        <div className={s.bannerCell}><InfoBanner>این فرم تیکت نمی‌سازد و کد پیگیری ندارد.{can('support.contact_submissions.read') && can('support.tickets.create') ? ' برای پیگیری، از جزئیات پیام «ثبت تیکت برای این فرد» را بزنید.' : ''}</InfoBanner></div>
      </div>
      <Card>
        <TableFilters search={search.text} onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }} placeholder="جست‌وجو: نام، موضوع، ایمیل یا تلفن"
          count={list.data ? `${faNum(list.data.total)} پیام` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('support.contact_submissions.read') ? (r) => lp.set({ open: r.id }, { keepPage: true }) : undefined}
          isSelected={(r) => r.id === open}
          empty={lp.q ? <Empty title="پیامی با این جست‌وجو پیدا نشد" /> : <Empty title="هنوز پیامی از فرم تماس نرسیده است" />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {open ? <Detail id={open} onClose={() => lp.set({ open: null }, { keepPage: true })} onTicket={(q) => nav(`/support/outbound/new?${q}`)} canTicket={can('support.tickets.create')} /> : null}
    </>
  );
}

function Detail({ id, onClose, onTicket, canTicket }: { id: string; onClose: () => void; onTicket: (q: string) => void; canTicket: boolean }) {
  const q = useContactSubmission(id);
  const d = q.data;
  const ticketQuery = d ? new URLSearchParams(Object.entries({ name: d.full_name, phone: d.phone ?? '', email: d.email ?? '', subject: d.subject }).filter(([, v]) => v)).toString() : '';
  return (
    <Modal open onClose={onClose} title="پیام فرم تماس" width={640}
      footer={d ? <>
        {canTicket ? <Button icon={<IconSquarePlus size={17} />} onClick={() => onTicket(ticketQuery)}>ثبت تیکت برای این فرد</Button> : null}
        {d.email ? <a href={`mailto:${d.email}?subject=${encodeURIComponent(`پاسخ: ${d.subject}`)}`}><Button variant="secondary" icon={<IconMailForward size={17} />}>پاسخ با ایمیل</Button></a> : null}
        <Button variant="ghost" onClick={onClose}>بستن</Button>
      </> : undefined}>
      {q.isLoading || !d ? <SkeletonRows rows={4} /> : (
        <>
          <div className={s.kv}>
            <KeyValue label="نام و نام خانوادگی">{d.full_name}</KeyValue>
            <KeyValue label="زمان دریافت">{faDateTime(d.created_at)}</KeyValue>
            <KeyValue label="ایمیل" ltr>{d.email || '—'}</KeyValue>
            <KeyValue label="تلفن" ltr>{d.phone || '—'}</KeyValue>
          </div>
          <div className={s.cardTitle} style={{ marginTop: 18 }}>{d.subject}</div>
          <div className={s.note}>{d.body}</div>
        </>
      )}
    </Modal>
  );
}
