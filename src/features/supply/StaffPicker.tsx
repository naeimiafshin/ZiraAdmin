import { useState } from 'react';
import { fullName, faNum } from '@/shared/lib/format';
import { useDebounced } from '@/shared/lib/useDebounced';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Empty, Modal, Pagination } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useStaffList } from '@/features/users/api';

/** جدول انتخابی کارکنان برای فیلتر (قانون جدول انتخابی) — GET /auth/staff، جست‌وجو و صفحه‌بندی سمت سرور؛ مجوز فهرست کاربران. */
const PAGE_SIZE = 8;
const WIDTH = 680;
const DEBOUNCE_MS = 300;

export function StaffPicker({ title, onClose, onPick }: { title: string; onClose: () => void; onPick: (id: string, name: string) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const list = useStaffList({ page, page_size: PAGE_SIZE, query: dq || undefined });
  type Staff = NonNullable<typeof list.data>['results'][number];
  const cols: Column<Staff>[] = [
    { key: 'code', header: 'کد پرسنلی', code: true, render: (u) => <span data-latin="">{u.personnel_code || '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (u) => <b>{fullName(u)}</b> },
    { key: 'user', header: 'نام کاربری', render: (u) => <span className="ltr" data-latin="">{u.username || '—'}</span> },
    { key: 'job', header: 'عنوان شغلی', render: (u) => u.job_title || '—' },
  ];
  return (
    <Modal open onClose={onClose} title={title} width={WIDTH}>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام، نام کاربری، موبایل یا کد پرسنلی" count={list.data ? `${faNum(list.data.total)} نفر` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(u) => u.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(u) => onPick(u.id, fullName(u))} empty={<Empty title="کارمندی با این جست‌وجو پیدا نشد" />} />
      {list.data && list.data.total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}
