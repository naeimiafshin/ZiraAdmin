import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconShield } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { applyServerErrors } from '@/shared/api/formErrors';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { searchKey, TableFilters } from '@/shared/ui/TableFilters';
import { faNum } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Textarea } from '@/shared/ui/form';
import { Badge, Card, Chip, Empty, InfoBanner, Modal, PageHead, Pagination } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useAllRoles, useDepartmentPicker, type Role } from '@/features/users/api';
import u from '@/features/users/users.module.css';
import s from './roles.module.css';

export default function RolesPage() {
  const can = usePerm();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fRole, setFRole] = useState('');
  const [fDept, setFDept] = useState('');
  const [creating, setCreating] = useState(false);
  // فیلتر نقش و دپارتمان در بک‌اند نیست ⇐ کل فهرست نقش‌ها (کوچک) یک بار، فیلتر و صفحه‌بندی در فرانت
  const list = useAllRoles();
  const all = list.data ?? [];
  const NO_DEPT = '__none';
  const depts = useMemo(() => [...new Set(all.map((r) => r.department?.trim()).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, 'fa')), [all]);
  const filtered = useMemo(() => {
    const term = searchKey(q.trim());
    return all.filter((r) =>
      (!term || searchKey(r.code, r.name, r.description, r.department).includes(term))
      && (!fStatus || (fStatus === 'active') === r.is_active)
      && (!fRole || r.id === fRole)
      && (!fDept || (fDept === NO_DEPT ? !r.department?.trim() : r.department?.trim() === fDept)));
  }, [all, q, fStatus, fRole, fDept]);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const reset = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };

  const cols: Column<Role>[] = [
    { key: 'code', header: 'کد نقش', code: true, render: (r) => <span className="ltr">{r.code}</span> },
    { key: 'name', header: 'نام نقش', render: (r) => <span className={u.nameCell}><span className={s.shield}><IconShield size={17} /></span><span className={u.strong}>{r.name}</span></span> },
    { key: 'dept', header: 'دپارتمان', render: (r) => (r.department ? <Chip>{r.department}</Chip> : <span className={u.muted}>—</span>) },
    { key: 'desc', header: 'توضیحات', render: (r) => <span className={s.desc}>{r.description || '—'}</span> },
    { key: 'type', header: 'نوع', render: (r) => <Badge tone={r.is_system ? 'info' : 'neutral'}>{r.is_system ? 'سیستمی' : 'سفارشی'}</Badge> },
    { key: 'st', header: 'وضعیت', render: (r) => <Badge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'فعال' : 'غیرفعال'}</Badge> },
  ];

  return (
    <>
      <PageHead actions={user?.is_superuser ? <Button icon={<IconPlus size={17} />} onClick={() => setCreating(true)}>افزودن نقش جدید</Button> : null} />
      <Card>
        <TableFilters
          search={q}
          onSearch={reset(setQ)}
          placeholder="جست‌وجو: کد، نام، دپارتمان یا توضیحات نقش"
          count={list.data ? `${faNum(filtered.length)} نقش` : undefined}
          filters={[
            { key: 'status', label: 'وضعیت', value: fStatus, onChange: reset(setFStatus), options: [{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }] },
            { key: 'role', label: 'نقش', value: fRole, onChange: reset(setFRole), options: all.map((r) => ({ value: r.id, label: r.name })) },
            { key: 'dept', label: 'دپارتمان', value: fDept, onChange: reset(setFDept), options: [...depts.map((d) => ({ value: d, label: d })), { value: NO_DEPT, label: 'بدون دپارتمان' }] },
          ]}
        />
        <InfoBanner>تعریف، ویرایش، غیرفعال‌سازی نقش و تغییر ماتریس مجوزها فقط در اختیار سوپرادمین است. نقش‌ها سراسری‌اند و به شعبه وابسته نیستند؛ دسترسی به داده‌های شعب از «تخصیص شعب» مدیریت می‌شود.</InfoBanner>
        <DataTable columns={cols} rows={list.data ? rows : undefined} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('rbac.roles.read') ? (r) => navigate(`/rbac/roles/${r.id}`) : undefined}
          empty={<Empty title={all.length ? 'نقشی با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز نقشی تعریف نشده است'} />} />
        {filtered.length > 0 ? <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} /> : null}
      </Card>
      {creating ? <RoleCreateModal onClose={() => setCreating(false)} onCreated={(r) => navigate(`/rbac/roles/${r.id}`)} /> : null}
    </>
  );
}

const roleSchema = z.object({
  code: z.string().trim().min(1, 'کد نقش الزامی است.').max(50, 'حداکثر ۵۰ نویسه.'),
  name: z.string().trim().min(1, 'نام نقش الزامی است.').max(100, 'حداکثر ۱۰۰ نویسه.'),
  department: z.string().trim().max(50, 'حداکثر ۵۰ نویسه.'),
  level: z.string().trim().regex(/^[0-9]*$/, 'عدد صحیح وارد کنید.'),
  description: z.string().trim(),
});
type RoleForm = z.infer<typeof roleSchema>;

export function RoleCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: Role) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const depts = useDepartmentPicker();
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<RoleForm>({
    resolver: zodResolver(roleSchema), defaultValues: { code: '', name: '', department: '', level: '0', description: '' },
  });
  const submit = handleSubmit(async (v) => {
    setErr(null);
    try {
      const r = await adminApi<Role>('/rbac/roles', { method: 'POST', body: { ...v, level: Number(v.level || 0) } });
      toast('نقش تعریف شد. حالا مجوزهایش را تعیین کنید.');
      await qc.invalidateQueries({ queryKey: ['rbac', 'roles'] });
      onCreated(r);
    } catch (e) {
      const rest = applyServerErrors(e, setError, ['code', 'name', 'department', 'level', 'description']);
      setErr(rest.join(' ') || (rest.length === 0 && !Object.keys(errors).length ? userMessage(e) : null));
    }
  });
  return (
    <Modal open onClose={onClose} title="تعریف نقش جدید" width={620}
      footer={<><Button onClick={submit} loading={isSubmitting}>ثبت نقش</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null}
      <form onSubmit={submit} noValidate>
        <FormGrid cols={2}>
          <Input latin label="کد نقش" required {...register('code')} error={errors.code?.message} dir="ltr" placeholder="sales_expert" hint="بعد از ثبت قابل تغییر نیست." />
          <Input label="نام نقش" required {...register('name')} error={errors.name?.message} />
          <Input label="دپارتمان" {...register('department')} error={errors.department?.message} list="role-depts" />
          <Input latin label="سطح" {...register('level')} error={errors.level?.message} inputMode="numeric" dir="ltr" />
          <Textarea label="توضیحات" span={2} {...register('description')} />
        </FormGrid>
        <datalist id="role-depts">{(depts.data ?? []).map((d) => <option key={d.id} value={d.name} />)}</datalist>
      </form>
    </Modal>
  );
}
