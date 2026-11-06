import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconPlus } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import type { Paginated } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Textarea, Toggle } from '@/shared/ui/form';
import { Badge, Card, Empty, InfoBanner, Modal, PageHead, Pagination } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useDepartments, type Department } from '@/features/users/api';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useDebounced } from '@/shared/lib/useDebounced';
import { toLatinDigits } from '@/shared/lib/text';
import u from '@/features/users/users.module.css';
import r from '@/features/roles/roles.module.css';

function MemberCount({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['identity', 'departments', id, 'count'],
    queryFn: ({ signal }) => adminApi<Paginated<unknown>>(`/auth/departments/${id}/users`, { query: { page: 1, page_size: 1 }, signal }),
    staleTime: 60_000,
  });
  return <span className="tnum">{q.data ? `${faNum(q.data.total)} نفر` : '…'}</span>;
}

export default function DepartmentsPage() {
  const { user } = useAuth();
  const can = usePerm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [edit, setEdit] = useState<Department | 'new' | null>(null);
  const [q, setQ] = useState('');
  const query = useDebounced(toLatinDigits(q.trim()), 350);
  const list = useDepartments({ page, page_size: pageSize, query: query || undefined });
  const isSuper = !!user?.is_superuser;

  const cols: Column<Department>[] = [
    { key: 'code', header: 'کد', code: true, render: (d) => <span className="ltr">{d.code}</span> },
    { key: 'name', header: 'نام', render: (d) => <span className={u.strong}>{d.name}</span> },
    { key: 'desc', header: 'توضیحات', render: (d) => <span className={r.desc}>{d.description || '—'}</span> },
    { key: 'members', header: 'اعضا', render: (d) => (can('identity.departments.read') ? <MemberCount id={d.id} /> : '—') },
    { key: 'st', header: 'وضعیت', render: (d) => <Badge tone={d.is_active ? 'success' : 'neutral'}>{d.is_active ? 'فعال' : 'غیرفعال'}</Badge> },
    ...(isSuper ? [{ key: 'act', header: '', render: (d: Department) => <Button variant="secondary" onClick={() => setEdit(d)}>ویرایش</Button> }] : []),
  ];

  return (
    <>
      <PageHead title="دپارتمان‌ها" actions={isSuper ? <Button icon={<IconPlus size={17} />} onClick={() => setEdit('new')}>دپارتمان جدید</Button> : null} />
      <InfoBanner>دپارتمان فقط یک برچسب سازمانی است (مثلاً برای ارجاع تیکت) و هیچ نقش یا دسترسی شعبه‌ای نمی‌دهد. دپارتمان حذف نمی‌شود؛ فقط غیرفعال می‌شود.</InfoBanner>
      <Card>
        <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: کد یا نام دپارتمان" count={list.data ? `${faNum(list.data.total)} دپارتمان` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(d) => d.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={query ? 'دپارتمانی با این جست‌وجو پیدا نشد' : 'هنوز دپارتمانی تعریف نشده است'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} /> : null}
      </Card>
      {edit ? <DepartmentModal dept={edit === 'new' ? null : edit} onClose={() => setEdit(null)} /> : null}
    </>
  );
}

function DepartmentModal({ dept, onClose }: { dept: Department | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ code: dept?.code ?? '', name: dept?.name ?? '', description: dept?.description ?? '', is_active: dept?.is_active ?? true });
  const [errs, setErrs] = useState<{ code?: string; name?: string }>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const e: typeof errs = {};
    if (!dept && !v.code.trim()) e.code = 'کد الزامی است.';
    if (!v.name.trim()) e.name = 'نام الزامی است.';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (dept) await adminApi(`/auth/departments/${dept.id}`, { method: 'PATCH', body: { name: v.name.trim(), description: v.description.trim(), is_active: v.is_active } });
      else await adminApi('/auth/departments', { method: 'POST', body: { code: v.code.trim(), name: v.name.trim(), description: v.description.trim() || null } });
      toast(dept ? 'دپارتمان ذخیره شد.' : 'دپارتمان تعریف شد.');
      await qc.invalidateQueries({ queryKey: ['identity', 'departments'] });
      onClose();
    } catch (err) {
      toast(userMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={dept ? 'ویرایش دپارتمان' : 'دپارتمان جدید'} width={560}
      footer={<><Button onClick={save} loading={busy}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <FormGrid cols={2}>
        <Input latin label="کد" required={!dept} value={v.code} disabled={!!dept} dir="ltr" placeholder="SALES" error={errs.code}
          hint={dept ? 'کد دپارتمان تغییرناپذیر است.' : 'بعد از ثبت قابل تغییر نیست.'} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
        <Input label="نام" required value={v.name} error={errs.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Textarea label="توضیحات" span={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        {dept ? <Toggle checked={v.is_active} onChange={(x) => setV({ ...v, is_active: x })} label={v.is_active ? 'فعال' : 'غیرفعال'} /> : null}
      </FormGrid>
    </Modal>
  );
}
