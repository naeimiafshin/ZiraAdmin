import { useNavigate } from 'react-router';
import { IconFilter, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime, faNum, jalaliTextToGregorian } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, Pagination } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useCreditChangeQueue, useCustomer, type ChangeQueueItem } from '../api';
import { rial, UrlDateFilter } from '../components';
import { CHANGE_DIRECTION, CHANGE_STATUS, CREDIT_TYPE } from '../labels';
import s from '../customers.module.css';

/**
 * تاریخچه‌ی تغییرات سقف اعتبار همه‌ی مشتریان (افشین 2026-10-25) — GET /customers/credit-change-requests
 * (مجوز customers.profiles.credit_policy.approve). حالت لیست در URL.
 * جست‌وجو (کد مشتری، فروشگاه، مدیر، نام مشتری، یادداشت) و فیلترهای وضعیت، نوع اعتبار، نوع تغییر، بازه‌ی تاریخ ثبت و مشتری
 * — همه در بک‌اند (b9ea88c، 2026-10-25). بازه‌ی نامعتبر ⇐ ۴۰۰ `invalid_date_range`.
 */
export default function CreditHistoryPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const lp = useListParams({ page_size: 20 });
  const { text, setText, dq } = useSearchState(lp);
  const status = lp.get('status');
  const creditType = lp.get('credit_type');
  const direction = lp.get('direction');
  const customerId = lp.get('customer_id');
  const from = lp.get('from');
  const to = lp.get('to');
  const gFrom = from ? jalaliTextToGregorian(from) : null;
  const gTo = to ? jalaliTextToGregorian(to) : null;
  const list = useCreditChangeQueue({
    page: lp.page, page_size: lp.pageSize, query: dq || undefined, status: status || undefined, credit_type: creditType || undefined, direction: direction || undefined,
    customer_id: customerId || undefined, date_from: gFrom ? `${gFrom}T00:00:00` : undefined, date_to: gTo ? `${gTo}T23:59:59` : undefined,
  });
  const cust = useCustomer(customerId || undefined);
  const canProfile = can('customers.profiles.read');

  const cols: Column<ChangeQueueItem>[] = [
    { key: 'at', header: 'تاریخ ثبت', render: (r) => <span className={s.muted}>{faDateTime(r.created_at)}</span> },
    { key: 'code', header: 'کد مشتری', code: true, render: (r) => <span className="ltr">{r.customer_code}</span> },
    {
      key: 'cust', header: 'فروشگاه',
      render: (r) => (
        <span className={s.actionsRow} style={{ flexWrap: 'nowrap' }}>
          <span><span className={s.strong}>{r.store_name || '—'}</span>{r.customer_name ? <span className={s.cellSub}>{r.customer_name}</span> : null}</span>
          {!customerId ? <Button size="sm" variant="ghost" icon={<IconFilter size={14} />} aria-label="فقط تغییرات همین مشتری" data-tip="فقط تغییرات همین مشتری" onClick={(e) => { e.stopPropagation(); lp.set({ customer_id: r.customer_id }); }} /> : null}
        </span>
      ),
    },
    { key: 'type', header: 'نوع اعتبار', render: (r) => <Badge tone={r.credit_type === 'GOLDEN' ? 'warning' : 'info'}>{CREDIT_TYPE[r.credit_type]?.short ?? r.credit_type}</Badge> },
    { key: 'dir', header: 'نوع تغییر', render: (r) => <Badge tone={CHANGE_DIRECTION[r.direction]?.tone ?? 'neutral'}>{CHANGE_DIRECTION[r.direction]?.label ?? r.direction}</Badge> },
    { key: 'amt', header: 'مبلغ', render: (r) => <span className="tnum">{rial(r.amount)}</span> },
    { key: 'b', header: 'سقف قبل', render: (r) => <span className={`${s.muted} tnum`}>{rial(r.limit_before)}</span> },
    { key: 'a', header: 'سقف بعد', render: (r) => <span className={`${s.strong} tnum`}>{rial(r.limit_after)}</span> },
    { key: 'st', header: 'وضعیت', render: (r) => <Badge tone={CHANGE_STATUS[r.status]?.tone ?? 'neutral'}>{CHANGE_STATUS[r.status]?.label ?? r.status}</Badge> },
    { key: 'by', header: 'ثبت‌کننده', render: (r) => r.requested_by_name || <span className={s.muted}>—</span> },
    { key: 'dec', header: 'تصمیم', render: (r) => (r.decided_by_name || r.decided_at ? <span>{r.decided_by_name ?? '—'}{r.decided_at ? <span className={s.muted}> — {faDateTime(r.decided_at)}</span> : null}</span> : <span className={s.muted}>—</span>) },
    { key: 'note', header: 'توضیح', render: (r) => (r.reject_reason ? <span className={s.danger}>{r.reject_reason}</span> : r.note || <span className={s.muted}>—</span>) },
  ];
  const custLabel = cust.data ? `${cust.data.code} — ${cust.data.store_name || ''}` : list.data?.results[0] ? `${list.data.results[0].customer_code} — ${list.data.results[0].store_name}` : 'مشتری انتخاب‌شده';
  return (
    <>
      <Card>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: کد مشتری، نام فروشگاه، نام مدیر، نام مشتری یا یادداشت"
          onReset={() => lp.set({ customer_id: null, from: null, to: null })} extraActive={!!customerId || !!from || !!to}
          filters={[
            { key: 'status', label: 'وضعیت', value: status, onChange: lp.setFilter('status'), options: Object.entries(CHANGE_STATUS).map(([value, v]) => ({ value, label: v.label })) },
            { key: 'credit_type', label: 'نوع اعتبار', value: creditType, onChange: lp.setFilter('credit_type'), options: Object.entries(CREDIT_TYPE).map(([value, v]) => ({ value, label: v.short })) },
            { key: 'direction', label: 'نوع تغییر', value: direction, onChange: lp.setFilter('direction'), options: Object.entries(CHANGE_DIRECTION).map(([value, v]) => ({ value, label: v.label })) },
          ]}
          extra={<>
            <UrlDateFilter label="از تاریخ" value={from} onCommit={(v) => lp.set({ from: v })} />
            <UrlDateFilter label="تا تاریخ" value={to} onCommit={(v) => lp.set({ to: v })} />
            {customerId ? (
              <span className={s.filterChip}>مشتری: <b className="tnum">{custLabel}</b>
                <button type="button" aria-label="حذف فیلتر مشتری" onClick={() => lp.set({ customer_id: null })}><IconX size={14} /></button>
              </span>
            ) : null}
          </>}
          count={list.data ? `${faNum(list.data.total)} تغییر` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id}
          onRowClick={canProfile ? (r) => navigate(`/customers/profiles/${r.customer_id}?tab=credit`) : undefined} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={dq || status || creditType || direction || customerId || from || to ? 'تغییری با این فیلترها پیدا نشد' : 'هنوز سقف اعتبار هیچ مشتری‌ای تغییر نکرده است'} text={dq || status || creditType || direction || customerId || from || to ? undefined : 'افزایش و کاهش سقف از تب «اعتبارات» پرونده‌ی مشتری ثبت می‌شود.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
    </>
  );
}
