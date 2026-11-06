import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconPlus } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime, faNum } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Chip, Empty, PageHead, Pagination } from '@/shared/ui/kit';
import { searchKey, TableFilters } from '@/shared/ui/TableFilters';
import { useAllRoles, useAllStaff, type StaffUser } from './api';
import { USER_STATUS } from './labels';
import s from './users.module.css';

export default function UsersListPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSession, setFSession] = useState('');
  // بک‌اند /auth/staff فیلتر نقش/وضعیت/نشست ندارد ⇐ کل فهرست کارمندان یک بار گرفته و در فرانت فیلتر و صفحه‌بندی می‌شود
  const list = useAllStaff();
  // StaffUserOut.roles کد نقش است ⇐ نام از لیست نقش‌ها (اگر مجوز دیدن نقش‌ها هست)
  const roles = useAllRoles(can('rbac.roles.list'));
  const roleName = (code: string) => roles.data?.find((r) => r.code === code)?.name ?? code;

  const filtered = useMemo(() => {
    const term = searchKey(q.trim());
    return (list.data ?? []).filter((u) =>
      (!term || searchKey(u.first_name, u.last_name, u.username, u.phone_number, u.personnel_code).includes(term))
      && (!fRole || (fRole === '__none' ? !u.roles?.length : (u.roles ?? []).includes(fRole)))
      && (!fStatus || u.status === fStatus)
      && (!fSession || (fSession === 'yes' ? (u.active_sessions_count ?? 0) > 0 : !(u.active_sessions_count ?? 0))));
  }, [list.data, q, fRole, fStatus, fSession]);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const cols: Column<StaffUser>[] = [
    { key: 'i', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((page - 1) * pageSize + i + 1)}</span> },
    { key: 'code', header: 'کد پرسنلی', code: true, render: (u) => <span className="ltr">{u.personnel_code ?? '—'}</span> },
    {
      key: 'name', header: 'نام',
      render: (u) => (
        <span className={s.strong}>{u.first_name || <span className="ltr">{u.username}</span>}</span>
      ),
    },
    { key: 'last', header: 'نام خانوادگی', render: (u) => <span className={s.strong}>{u.last_name || '—'}</span> },
    { key: 'mobile', header: 'موبایل', render: (u) => <span className="tnum">{u.phone_number}</span> },
    { key: 'role', header: 'نقش', render: (u) => (u.roles?.length ? <Chip tip>{u.roles.map(roleName).join('، ')}</Chip> : <span className={s.muted}>بدون نقش</span>) },
    { key: 'status', header: 'وضعیت', render: (u) => { const st = USER_STATUS[u.status] ?? { label: u.status, tone: 'neutral' as const }; return <Badge tone={st.tone}>{st.label}</Badge>; } },
    { key: 'login', header: 'آخرین ورود', render: (u) => <span className={s.muted}>{faDateTime(u.last_login_at)}</span> },
    { key: 'act', header: 'آخرین فعالیت', render: (u) => <span className={s.muted}>{faDateTime(u.last_activity_at)}</span> },
    { key: 'sess', header: 'نشست فعال', render: (u) => <span className="tnum">{faNum(u.active_sessions_count ?? 0)}</span> },
  ];

  return (
    <>
      <PageHead
        actions={can('identity.users.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/identity/users/new')}>افزودن کاربر جدید</Button> : null}
      />
      <Card>
        <TableFilters
          search={q}
          onSearch={reset(setQ)}
          placeholder="جست‌وجو: نام، نام کاربری، موبایل یا کد پرسنلی"
          count={list.data ? `${faNum(filtered.length)} کاربر` : undefined}
          filters={[
            { key: 'role', label: 'نقش', value: fRole, onChange: reset(setFRole), options: [...(roles.data ?? []).map((r) => ({ value: r.code, label: r.name })), { value: '__none', label: 'بدون نقش' }] },
            { key: 'status', label: 'وضعیت', value: fStatus, onChange: reset(setFStatus), options: Object.entries(USER_STATUS).map(([value, v]) => ({ value, label: v.label })) },
            { key: 'session', label: 'نشست فعال', value: fSession, onChange: reset(setFSession), options: [{ value: 'yes', label: 'دارد' }, { value: 'no', label: 'ندارد' }] },
          ]}
        />
        <DataTable
          columns={cols}
          rows={list.data ? rows : undefined}
          rowKey={(u) => u.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          onRowClick={can('identity.users.read') ? (u) => navigate(`/identity/users/${u.id}`) : undefined}
          empty={<Empty title={list.data?.length ? 'کاربری با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز کاربری ثبت نشده است'} />}
        />
        {filtered.length > 0 ? (
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        ) : null}
      </Card>
    </>
  );
}
