import { useNavigate } from 'react-router';
import { IconBox, IconEye, IconPlus } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { faDate, faNum } from '@/shared/lib/format';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, PageHead, Pagination } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { DateFilter } from '@/features/branches/DateFilter';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useSupplierOptions, type ListParams } from './api';
import { IconButton } from './components';
import { ConsignmentDetailModal, isOverdue } from './ConsignmentDetail';
import { ConsignmentDrawer } from './ConsignmentDrawer';
import { useConsignments, type Consignment } from './consignmentsApi';
import { CONSIGNMENT_STATUS, labelOf, toneOf } from './labels';
import { int } from './requestsApi';
import s from './supply.module.css';

/**
 * خرید امانی — GET /supply/consignments. html «خرید امانی»؛ ستون‌ها و فیلترها: تأیید افشین 2026-10-31.
 * - ستون‌ها: ردیف، شماره، تاریخ، کد و نام تأمین‌کننده، انبار، جمع تعداد، موعد عودت (سررسید گذشته قرمز)، وضعیت، سند تبدیل، عملیات.
 * - فیلترها (سرور): جست‌وجو (html) + وضعیت، تأمین‌کننده، انبار، از تاریخ و تا تاریخ، شعبه.
 * - بک‌اند خروجی اکسل و چاپ برای خرید امانی ندارد. ثبت در کشوی چپ (زیرصفحه‌ی «ثبت خرید امانی»)؛ جزئیات در مودال (`?open=`).
 */
const PAGE_SIZE = 10;
const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'no', label: 'شماره', fixed: true },
  { key: 'date', label: 'تاریخ' },
  { key: 'supplier', label: 'تأمین‌کننده', fixed: true },
  { key: 'warehouse', label: 'انبار' },
  { key: 'qty', label: 'جمع تعداد' },
  { key: 'due', label: 'موعد عودت' },
  { key: 'status', label: 'وضعیت' },
  { key: 'converted', label: 'سند تبدیل' },
  { key: 'acts', label: 'عملیات', fixed: true },
];

export default function ConsignmentsListPage({ creating = false }: { creating?: boolean }) {
  const can = usePerm();
  const navigate = useNavigate();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);
  const [status, supplierId, warehouseId, branchId] = [lp.get('status'), lp.get('supplier'), lp.get('warehouse'), lp.get('branch')];
  const [df, dt] = [lp.get('df'), lp.get('dt')];
  const openId = lp.get('open') || null;
  const setOpenId = (id: string | null) => lp.set({ open: id }, { keepPage: true });
  const branches = useBranchOptions();
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const prefs = useColumnPrefs('supply.consignments', COLS);

  const filtered: ListParams = {
    query: dq || undefined, status: status || undefined, supplier_id: supplierId || undefined, warehouse_id: warehouseId || undefined,
    branch_id: branchId || undefined, date_from: df || undefined, date_to: dt || undefined,
  };
  const list = useConsignments({ ...filtered, page: lp.page, page_size: lp.pageSize });
  const filters: FilterDef[] = [
    { key: 'status', label: 'وضعیت', value: status, onChange: lp.setFilter('status'), options: Object.entries(CONSIGNMENT_STATUS).map(([value, v]) => ({ value, label: v.label })) },
    { key: 'supplier', label: 'تأمین‌کننده', value: supplierId, onChange: lp.setFilter('supplier'), options: (sups.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    { key: 'warehouse', label: 'انبار', value: warehouseId, onChange: lp.setFilter('warehouse'), options: (whs.data ?? []).map((x) => ({ value: x.id, label: x.name })) },
    ...((branches.data?.length ?? 0) > 1 ? [{ key: 'branch', label: 'شعبه', value: branchId, onChange: lp.setFilter('branch'), options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) }] : []),
  ];
  const extraActive = !!(df || dt);
  const active = !!dq || filters.some((f) => f.value) || extraActive;
  const dash = <span className={s.muted}>—</span>;
  const all: Column<Consignment>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'no', header: 'شماره', code: true, render: (c) => <span data-latin>{c.number}</span> },
    { key: 'date', header: 'تاریخ', render: (c) => faDate(c.date) },
    { key: 'supplier', header: 'تأمین‌کننده', render: (c) => (c.supplier ? <span className={s.nameStack}><b>{c.supplier.name}</b><small data-latin>{c.supplier.code}</small></span> : dash) },
    { key: 'warehouse', header: 'انبار', render: (c) => c.warehouse?.name ?? dash },
    { key: 'qty', header: 'جمع تعداد', render: (c) => <span className="tnum">{faNum(int(c.quantity))}</span> },
    { key: 'due', header: 'موعد عودت', render: (c) => <span className={isOverdue(c) ? s.overdue : undefined} data-tip={isOverdue(c) ? 'موعد عودت گذشته است' : undefined}>{faDate(c.return_due_date)}</span> },
    { key: 'status', header: 'وضعیت', render: (c) => <Badge tone={toneOf(CONSIGNMENT_STATUS, c.status)}>{labelOf(CONSIGNMENT_STATUS, c.status, c.status_display)}</Badge> },
    { key: 'converted', header: 'سند تبدیل', render: (c) => (c.converted_advice_no
      ? <span className={s.nameStack}><b data-latin>{c.converted_advice_no}</b>{c.converted_invoice_no ? <small data-latin>{c.converted_invoice_no}</small> : null}</span> : dash) },
    { key: 'acts', header: 'عملیات', render: (c) => <span className={s.rowActions}><IconButton label={`جزئیات ${c.number}`} onClick={() => setOpenId(c.id)}><IconEye size={16} /></IconButton></span> },
  ];
  const cols = all.filter((col) => prefs.isVisible(col.key));
  const closeCreate = (createdId?: string) => navigate(createdId ? `/supply/consignments?open=${createdId}` : '/supply/consignments', { replace: true });

  return (
    <>
      <PageHead actions={can('supply.consignments.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/supply/consignments/new')}>خرید امانی جدید</Button> : null} />
      <Card>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: شماره، تأمین‌کننده یا کالا" filters={filters}
          extra={<>
            <DateFilter label="از تاریخ" value={df} onChange={(v) => lp.set({ df: v || null })} />
            <DateFilter label="تا تاریخ" value={dt} onChange={(v) => lp.set({ dt: v || null })} />
            <ColumnPicker {...prefs} />
          </>}
          extraActive={extraActive} onReset={() => lp.set({ df: null, dt: null })}
          count={list.data ? `${faNum(list.data.total)} سند امانی` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(c) => c.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('supply.consignments.read') ? (c) => setOpenId(c.id) : undefined}
          empty={<Empty icon={<IconBox size={26} stroke={1.5} />} title={active ? 'سند امانی‌ای با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز خرید امانی‌ای ثبت نشده است'}
            text={active ? undefined : 'کالایی که پیش از خرید قطعی از تأمین‌کننده امانت گرفته می‌شود با «خرید امانی جدید» و تاریخ عودت ثبت می‌شود.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      <ConsignmentDetailModal id={openId} onClose={() => setOpenId(null)} />
      {creating ? <ConsignmentDrawer consignment={null} onClose={() => closeCreate()} onSaved={(c) => closeCreate(c.id)} /> : null}
    </>
  );
}
