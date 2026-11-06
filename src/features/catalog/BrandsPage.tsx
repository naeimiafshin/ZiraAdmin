import { useState } from 'react';
import { IconBan, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, PageHead, Pagination } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useBrands, useBrandWrite, type Brand } from './api';
import { BrandModal } from './BrandModal';
import { ConfirmModal, IconButton } from './components';
import { BRAND_ORIGIN, BRAND_STATUS } from './labels';
import s from './catalog.module.css';

/**
 * برندها — GET /catalog/brands (صفحه‌بندی و فیلتر در بک‌اند).
 * جست‌وجو: نام و نام لاتین (سرور). فیلتر: وضعیت، مبدا (پیشنهاد Claude؛ «حوزه» متن آزاد است و فهرست ثابتی ندارد).
 * حذف فقط وقتی برند در خانواده‌ای یا معرفی صفحه‌ی اصلی استفاده نشده باشد (۴۰۹ ⇐ غیرفعال کنید). لوگو اختیاری است (افشین 2026-10-22؛ برند کاتالوگ و معرفی برند در cms می‌توانند متفاوت باشند).
 */
export default function BrandsPage() {
  const can = usePerm();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const params = { page: lp.page, page_size: lp.pageSize, query: dq || undefined, status: lp.get('status') || undefined, origin: lp.get('origin') || undefined };
  const list = useBrands(params);
  const w = useBrandWrite();
  const toast = useToast();
  const [editing, setEditing] = useState<Brand | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'deactivate' | 'delete'; b: Brand } | null>(null);

  const filters: FilterDef[] = [
    { key: 'status', label: 'وضعیت', value: lp.get('status'), onChange: lp.setFilter('status'), options: Object.entries(BRAND_STATUS).map(([value, v]) => ({ value, label: v.label })) },
    { key: 'origin', label: 'مبدا', value: lp.get('origin'), onChange: lp.setFilter('origin'), options: Object.entries(BRAND_ORIGIN).map(([value, label]) => ({ value, label })) },
  ];
  const active = !!dq || !!lp.get('status') || !!lp.get('origin');
  const cols: Column<Brand>[] = [
    {
      key: 'name', header: 'برند',
      render: (b) => (
        <span className={s.brandCell}>
          {b.logo ? <img className={s.brandLogo} src={b.logo} alt="" /> : <span className={s.brandMark} aria-hidden>{b.name.slice(0, 1)}</span>}
          <span><span className={s.strong}>{b.name}</span>{b.latin_name ? <span className={s.latin} data-latin>{b.latin_name}</span> : null}</span>
        </span>
      ),
    },
    { key: 'scope', header: 'حوزه', render: (b) => b.scope },
    { key: 'count', header: 'خانواده‌ی کالا', render: (b) => <span className="tnum">{faNum(b.product_count)}</span> },
    { key: 'country', header: 'کشور', render: (b) => b.country || <span className={s.muted}>—</span> },
    { key: 'origin', header: 'مبدا', render: (b) => BRAND_ORIGIN[b.origin] ?? b.origin },
    { key: 'status', header: 'وضعیت', render: (b) => <Badge tone={BRAND_STATUS[b.status]?.tone ?? 'neutral'}>{BRAND_STATUS[b.status]?.label ?? b.status}</Badge> },
    {
      key: 'acts', header: 'عملیات',
      render: (b) => (
        <span className={s.rowActions}>
          {can('catalog.brands.update') ? <IconButton label="ویرایش برند" onClick={() => setEditing(b)}><IconPencil size={16} /></IconButton> : null}
          {can('catalog.brands.update') ? <IconButton label="غیرفعال‌سازی برند" onClick={() => setConfirm({ kind: 'deactivate', b })} disabled={b.status === 'INACTIVE'}><IconBan size={16} /></IconButton> : null}
          {can('catalog.brands.delete') ? <IconButton label="حذف برند" danger onClick={() => setConfirm({ kind: 'delete', b })}><IconTrash size={16} /></IconButton> : null}
        </span>
      ),
    },
  ];
  return (
    <>
      <PageHead actions={can('catalog.brands.create') ? <Button icon={<IconPlus size={17} />} onClick={() => setEditing('new')}>برند جدید</Button> : null} />
      <Card>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: نام یا نام لاتین برند" filters={filters}
          count={list.data ? `${faNum(list.data.total)} برند` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(b) => b.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={active ? 'برندی با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز برندی تعریف نشده است'} text={active ? undefined : 'با «برند جدید» اولین برند را بسازید؛ تعریف ماتریسی کالا به برند نیاز دارد.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {editing ? <BrandModal brand={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {confirm?.kind === 'deactivate' ? (
        <ConfirmModal title="غیرفعال‌سازی برند" confirmLabel="غیرفعال کن" onClose={() => setConfirm(null)}
          text={<>برند <b>{confirm.b.name}</b> غیرفعال می‌شود و دیگر در تعریف کالای تازه و معرفی صفحه‌ی اصلی انتخاب‌شدنی نیست. خانواده‌های موجود دست نمی‌خورند.</>}
          onConfirm={async () => { await w.deactivate.mutateAsync(confirm.b.id); toast('برند غیرفعال شد.'); }} />
      ) : null}
      {confirm?.kind === 'delete' ? (
        <ConfirmModal title="حذف برند" confirmLabel="حذف کن" danger onClose={() => setConfirm(null)}
          text={<>برند <b>{confirm.b.name}</b> برای همیشه حذف می‌شود. اگر در خانواده‌ای یا معرفی صفحه‌ی اصلی استفاده شده باشد، حذف رد می‌شود و باید غیرفعالش کنید.</>}
          onConfirm={async () => { await w.remove.mutateAsync(confirm.b.id); toast('برند حذف شد.'); }} />
      ) : null}
    </>
  );
}
