import { useState } from 'react';
import { IconPackage } from '@tabler/icons-react';
import { faNum } from '@/shared/lib/format';
import { useDebounced } from '@/shared/lib/useDebounced';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Empty, Modal, Pagination } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import type { ListParams } from './api';
import { int, splitPath, useRequestsByItem, type RequestByItem } from './requestsApi';
import s from './supply.module.css';

/**
 * فیلتر «کالا» در فهرست درخواست‌های تأمین (افشین ۱۲ آبان ۱۴۰۵): فقط کالاهایی که برایشان درخواست تأمین ثبت شده است.
 * منبع: GET /supply/requests/by-item با همان فیلترهای صفحه (بدون خود فیلتر کالا)، پس هر کالای این فهرست دست‌کم یک
 * درخواست تأمین با فیلترهای فعلی دارد.
 * فیلتر دسته‌ی اصلی، میانی و فرعی: by-item هنوز پارامتر دسته ندارد ⇐ «به‌زودی» (کمبود بک‌اند S-21).
 * جست‌وجو همان `query` بک‌اند است که روی درخواست‌ها می‌خورد، نه فقط روی کالا (همان کمبود).
 */
const WIDTH = 860;
const PAGE_SIZE = 10;

export function RequestItemFilterModal({ base, onClose, onPick }: {
  base: ListParams; onClose: () => void; onPick: (itemId: string, name: string) => void;
}) {
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(text.trim());
  const q = useRequestsByItem({ ...base, item_id: undefined, query: dq || base.query, page, page_size: PAGE_SIZE });
  const total = q.data?.total ?? 0;

  const categoryFilters: FilterDef[] = [
    { key: 'main', label: 'دسته اصلی', value: '', onChange: () => {}, options: [], soon: true },
    { key: 'mid', label: 'دسته میانی', value: '', onChange: () => {}, options: [], soon: true },
    { key: 'sub', label: 'دسته فرعی', value: '', onChange: () => {}, options: [], soon: true },
  ];
  const cols: Column<RequestByItem>[] = [
    { key: 'code', header: 'کد کالا', code: true, render: (x) => <span data-latin>{x.item?.code}</span> },
    { key: 'name', header: 'نام کالا', render: (x) => <span className={s.strong}>{x.item?.display_name}</span> },
    { key: 'cat', header: 'دسته', render: (x) => splitPath(x.item?.category_path).filter(Boolean).join(' › ') || <span className={s.muted}>—</span> },
    { key: 'count', header: 'تعداد درخواست تأمین', render: (x) => faNum(x.request_count) },
    { key: 'qty', header: 'تعداد تجمیعی', render: (x) => <span className="tnum">{faNum(int(x.quantity))}</span> },
  ];
  const pick = (x: RequestByItem) => { if (x.item) onPick(x.item.id, x.item.display_name ?? x.item.code ?? ''); };

  return (
    <Modal open onClose={onClose} width={WIDTH} title="فیلتر بر اساس کالا">
      <p className={s.modalIntro}>فقط کالاهایی که با فیلترهای فعلی برایشان درخواست تأمین ثبت شده است. روی ردیف کالا بزنید.</p>
      <TableFilters search={text} onSearch={(v) => { setText(v); setPage(1); }} placeholder="جست‌وجو: کد یا نام کالا"
        filters={categoryFilters} count={q.data ? `${faNum(total)} کالا` : undefined} />
      <DataTable columns={cols} rows={q.data?.results.filter((x) => x.item)} rowKey={(x) => x.item?.id ?? ''} loading={q.isLoading}
        error={q.error} onRetry={() => { void q.refetch(); }} onRowClick={pick}
        empty={<Empty icon={<IconPackage size={26} stroke={1.5} />} title={dq ? 'کالایی با این جست‌وجو پیدا نشد' : 'برای هیچ کالایی درخواست تأمین ثبت نشده است'} />} />
      {total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} /> : null}
    </Modal>
  );
}
