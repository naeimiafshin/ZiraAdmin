import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, PageHead, Pagination } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal } from '@/features/catalog/components';
import { useSupplierWrite, useSuppliers, type Supplier } from './api';
import { IconButton } from './components';
import { labelOf, SUPPLIER_STATUS, toneOf } from './labels';
import { SupplierDrawer } from './SupplierDrawer';
import s from './supply.module.css';

/**
 * تأمین‌کنندگان — GET /supply/suppliers (صفحه‌بندی، جست‌وجو و فیلتر وضعیت در بک‌اند).
 * html و IA این صفحه را ندارند؛ با استاندارد «مدیریت کاربران» ساخته شد. ستون‌ها و فیلترها: تأیید افشین 2026-10-31.
 * جست‌وجو: کد، نام، شناسه‌ی ملی، کد اقتصادی، تلفن، رابط. فیلتر: فقط وضعیت (بک‌اند فیلتر دیگری ندارد).
 * ثبت و ویرایش در کشوی چپ؛ مسدود/فعال/غیرفعال در صفحه‌ی جزئیات. حذف فقط تأمین‌کننده‌ی بدون سند (۴۰۹ ⇐ پیام بک‌اند).
 */
const PAGE_SIZE = 10;
const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'code', label: 'کد', fixed: true },
  { key: 'name', label: 'نام', fixed: true },
  { key: 'national', label: 'شناسه‌ی ملی' },
  { key: 'economic', label: 'کد اقتصادی' },
  { key: 'phone', label: 'تلفن' },
  { key: 'contact', label: 'نام رابط' },
  { key: 'status', label: 'وضعیت' },
  { key: 'updated', label: 'آخرین تغییر' },
  { key: 'acts', label: 'عملیات', fixed: true },
];

export default function SuppliersListPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);
  const status = lp.get('status');
  const list = useSuppliers({ page: lp.page, page_size: lp.pageSize, query: dq || undefined, status: status || undefined });
  const w = useSupplierWrite();
  const prefs = useColumnPrefs('supply.suppliers', COLS);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  const filters: FilterDef[] = [
    { key: 'status', label: 'وضعیت', value: status, onChange: lp.setFilter('status'), options: Object.entries(SUPPLIER_STATUS).map(([value, v]) => ({ value, label: v.label })) },
  ];
  const active = !!dq || !!status;
  const dash = <span className={s.muted}>—</span>;

  const all: Column<Supplier>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'code', header: 'کد', code: true, render: (x) => <span data-latin>{x.code}</span> },
    { key: 'name', header: 'نام', render: (x) => <span className={s.strong}>{x.name}</span> },
    { key: 'national', header: 'شناسه‌ی ملی', code: true, render: (x) => (x.national_id ? <span className="ltr">{x.national_id}</span> : dash) },
    { key: 'economic', header: 'کد اقتصادی', code: true, render: (x) => (x.economic_code ? <span className="ltr">{x.economic_code}</span> : dash) },
    { key: 'phone', header: 'تلفن', render: (x) => (x.phone ? <span className="ltr tnum">{x.phone}</span> : dash) },
    { key: 'contact', header: 'نام رابط', render: (x) => x.contact_name || dash },
    { key: 'status', header: 'وضعیت', render: (x) => <Badge tone={toneOf(SUPPLIER_STATUS, x.status)}>{labelOf(SUPPLIER_STATUS, x.status, x.status_display)}</Badge> },
    { key: 'updated', header: 'آخرین تغییر', render: (x) => <span className={s.muted}>{faDate(x.updated_at)}</span> },
    {
      key: 'acts', header: 'عملیات',
      render: (x) => (
        <span className={s.rowActions}>
          {can('supply.suppliers.update') ? <IconButton label={`ویرایش ${x.name}`} onClick={() => setEditing(x)}><IconPencil size={16} /></IconButton> : null}
          {can('supply.suppliers.delete') ? <IconButton label={`حذف ${x.name}`} danger onClick={() => setDeleting(x)}><IconTrash size={16} /></IconButton> : null}
        </span>
      ),
    },
  ];
  const cols = all.filter((c) => prefs.isVisible(c.key) && (c.key !== 'acts' || can('supply.suppliers.update') || can('supply.suppliers.delete')));

  return (
    <>
      <PageHead actions={can('supply.suppliers.create') ? <Button icon={<IconPlus size={17} />} onClick={() => setEditing('new')}>تأمین‌کننده‌ی جدید</Button> : null} />
      <Card>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: کد، نام، شناسه‌ی ملی، کد اقتصادی، تلفن یا رابط" filters={filters}
          extra={<ColumnPicker {...prefs} />} count={list.data ? `${faNum(list.data.total)} تأمین‌کننده` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(x) => x.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('supply.suppliers.read') ? (x) => navigate(`/supply/suppliers/${x.id}`) : undefined}
          empty={<Empty title={active ? 'تأمین‌کننده‌ای با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز تأمین‌کننده‌ای ثبت نشده است'}
            text={active ? undefined : 'درخواست تأمین، اعلامیه و فاکتور خرید به تأمین‌کننده نیاز دارند؛ با «تأمین‌کننده‌ی جدید» اولین را ثبت کنید.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {editing ? <SupplierDrawer supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <ConfirmModal title="حذف تأمین‌کننده" confirmLabel="حذف تأمین‌کننده" danger onClose={() => setDeleting(null)}
          text={<>تأمین‌کننده‌ی <b>{deleting.name}</b> برای همیشه حذف می‌شود. اگر سندی (درخواست تأمین، اعلامیه، فاکتور، امانی یا برگشتی) داشته باشد، حذف رد می‌شود و باید آن را مسدود یا غیرفعال کنید.</>}
          onConfirm={async () => { await w.remove.mutateAsync(deleting.id); toast(`تأمین‌کننده‌ی «${deleting.name}» حذف شد.`); }} />
      ) : null}
    </>
  );
}
