import { useState } from 'react';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { useNavigate } from 'react-router';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDateTime, faNum, jalaliTextToGregorian } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, PageHead, Pagination, Segmented } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { downloadBlob, useRegistrationCounts, useRegistrations, type RegistrationRow } from '../api';
import { REG_SOURCE, REG_STATUS } from '../labels';
import { UrlDateFilter } from '../components';
import s from '../customers.module.css';

type Tab = '' | 'PENDING' | 'APPROVED' | 'REJECTED';

/** درخواست‌های ثبت‌نام — تب‌های وضعیت با شمارنده (GET /counts) + فیلتر منبع و بازه‌ی تاریخ (افشین 2026-10-21) */
export default function RegistrationRequestsPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  // حالت لیست در URL (useListParams، افشین 2026-10-25)؛ تب پیش‌فرض «در انتظار»، `tab=ALL` = همه
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const { page, pageSize } = lp;
  const tab: Tab = lp.tab === 'ALL' ? '' : ((lp.tab || 'PENDING') as Tab);
  const setTab = (t: Tab) => lp.setTab(t === '' ? 'ALL' : t === 'PENDING' ? '' : t);
  const source = lp.get('source');
  const from = lp.get('from');
  const to = lp.get('to');
  const counts = useRegistrationCounts();
  const gFrom = from ? jalaliTextToGregorian(from) : null;
  const gTo = to ? jalaliTextToGregorian(to) : null;
  const params = {
    page, page_size: pageSize, query: dq || undefined, status: tab || undefined, source: source || undefined,
    date_from: gFrom ? `${gFrom}T00:00:00` : undefined, date_to: gTo ? `${gTo}T23:59:59` : undefined,
  };
  const list = useRegistrations(params);
  const [exporting, setExporting] = useState(false);
  const total = counts.data ? counts.data.PENDING + counts.data.APPROVED + counts.data.REJECTED : undefined;
  const pill = (nv?: number) => (nv === undefined ? null : <span className={s.countPill}>{faNum(nv)}</span>);

  const exportXlsx = async () => {
    setExporting(true);
    try { const { page: _p, page_size: _s, ...rest } = params; await downloadBlob('/customers/registration-requests/export', rest, 'registration-requests.xlsx'); toast('خروجی اکسل آماده شد.'); }
    catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };

  const cols: Column<RegistrationRow>[] = [
    { key: 'no', header: 'شماره درخواست', render: (r) => <span className={`${s.code} ltr`}>{r.request_no}</span> },
    { key: 'name', header: 'متقاضی', render: (r) => <span className={s.strong}>{r.full_name ?? '—'}</span> },
    { key: 'store', header: 'نام فروشگاه', render: (r) => r.customer_store_name || <span className={s.muted}>—</span> },
    { key: 'mobile', header: 'موبایل', render: (r) => <span className="tnum">{r.mobile ?? '—'}</span> },
    { key: 'nid', header: 'کد ملی', code: true, render: (r) => <span className="tnum">{r.national_id ?? '—'}</span> },
    { key: 'src', header: 'منبع', render: (r) => <Badge tone={r.source === 'ADMIN' ? 'info' : 'neutral'}>{REG_SOURCE[r.source] ?? r.source_display}</Badge> },
    { key: 'st', header: 'وضعیت', render: (r) => <Badge tone={REG_STATUS[r.status]?.tone ?? 'neutral'}>{r.status_display}</Badge> },
    { key: 'at', header: 'تاریخ ثبت', render: (r) => <span className={s.muted}>{faDateTime(r.created_at)}</span> },
    { key: 'rev', header: 'بررسی‌کننده', render: (r) => r.reviewed_by_name ? <span>{r.reviewed_by_name}<span className={s.muted}> — {faDateTime(r.reviewed_at)}</span></span> : <span className={s.muted}>—</span> },
  ];
  const active = !!dq || !!source || !!from || !!to;
  return (
    <>
      <PageHead actions={<>
        {can('customers.registration_requests.export') ? <Button variant="secondary" icon={<IconFileSpreadsheet size={17} />} onClick={exportXlsx} loading={exporting} loadingText="در حال ساخت فایل…">خروجی اکسل</Button> : null}
      </>} />
      <Card>
        <div className={s.tabsRow}>
          <Segmented<Tab> value={tab} onChange={setTab} options={[
            { value: '', label: <span className={s.counts}>همه {pill(total)}</span> },
            { value: 'PENDING', label: <span className={s.counts}>در انتظار بررسی {pill(counts.data?.PENDING)}</span> },
            { value: 'APPROVED', label: <span className={s.counts}>تأییدشده {pill(counts.data?.APPROVED)}</span> },
            { value: 'REJECTED', label: <span className={s.counts}>ردشده {pill(counts.data?.REJECTED)}</span> },
          ]} />
        </div>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: شماره درخواست، نام، کد ملی، نام فروشگاه یا موبایل"
          onReset={() => lp.set({ from: null, to: null })} extraActive={!!from || !!to}
          filters={[{ key: 'src', label: 'منبع', value: source, onChange: lp.setFilter('source'), options: Object.entries(REG_SOURCE).map(([value, label]) => ({ value, label })) }]}
          extra={<>
            <UrlDateFilter label="از تاریخ" value={from} onCommit={(v) => lp.set({ from: v })} />
            <UrlDateFilter label="تا تاریخ" value={to} onCommit={(v) => lp.set({ to: v })} />
          </>}
          count={list.data ? `${faNum(list.data.total)} درخواست` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('customers.registration_requests.read') ? (r) => navigate(`/customers/registration-requests/${r.id}`) : undefined}
          empty={<Empty title={active || tab ? 'درخواستی با این شرایط پیدا نشد' : 'هنوز درخواستی ثبت نشده است'} text={tab === 'PENDING' && !active ? 'درخواست‌های تازه‌ی ثبت‌نام (از پنل مشتری یا ویزارد ادمین) این‌جا در صف بررسی می‌نشینند.' : undefined} />} />
        {list.data && list.data.total > 0 ? <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
    </>
  );
}
