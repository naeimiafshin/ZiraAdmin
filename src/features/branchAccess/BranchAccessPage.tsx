import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconBuildingStore, IconCheck, IconUserSearch } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { ApiError, userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum, fullName } from '@/shared/lib/format';
import { useBranchOptions, type BranchOption } from '@/shared/layout/useBranches';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Chip, Empty, InfoBanner, Pagination, SectionTitle } from '@/shared/ui/kit';
import { searchKey, TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllRoles, useAllStaff, useStaffDepartmentMap, type StaffUser } from '@/features/users/api';
import { USER_STATUS } from '@/features/users/labels';
import u from '@/features/users/users.module.css';
import s from './branchAccess.module.css';

/**
 * تخصیص شعب (ADR 0004): سوپرادمین همه‌ی شعب را می‌دهد؛ Branch Master فقط شعبه‌هایی را که خودش دارد.
 * بک‌اند قاعده را اعمال می‌کند؛ این‌جا فقط شعب قابل‌واگذاری کاربر فعلی نمایش داده می‌شود.
 * چیدمان: ۱) جدول پرسنل (جست‌وجو + فیلتر مثل جدول کاربران) ۲) جدول شعب پرسنل انتخاب‌شده (فقط جست‌وجو).
 */
export default function BranchAccessPage() {
  const { user } = useAuth();
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useAllStaff();
  const roles = useAllRoles(can('rbac.roles.list'));
  const deptMap = useStaffDepartmentMap(can('identity.users.department.read'));
  const branches = useBranchOptions();
  const roleName = (code: string) => roles.data?.find((r) => r.code === code)?.name ?? code;

  // ── پرسنل: جست‌وجو و فیلتر (همان فیلترهای جدول کاربران)
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSession, setFSession] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const reset = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };
  const people = useMemo(() => {
    const term = searchKey(q.trim());
    return (staff.data ?? []).filter((x) =>
      (!term || searchKey(x.first_name, x.last_name, x.username, x.phone_number, x.personnel_code).includes(term))
      && (!fRole || (fRole === '__none' ? !x.roles?.length : (x.roles ?? []).includes(fRole)))
      && (!fStatus || x.status === fStatus)
      && (!fSession || (fSession === 'yes' ? (x.active_sessions_count ?? 0) > 0 : !(x.active_sessions_count ?? 0))));
  }, [staff.data, q, fRole, fStatus, fSession]);
  const pageRows = people.slice((page - 1) * pageSize, page * pageSize);

  // ── انتخاب و شعب
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [bq, setBq] = useState('');
  const [busy, setBusy] = useState(false);
  const branchCard = useRef<HTMLDivElement>(null);
  const selected = staff.data?.find((x) => x.id === sel) ?? null;
  // شعبه‌ی محل کار (ADR 0009): StaffUserOut.primary_branch_id — هر کارمند ۰ یا ۱ شعبه
  const current = { data: selected ? (selected.primary_branch_id ? [selected.primary_branch_id] : []) : undefined, isLoading: !!sel && staff.isLoading, error: staff.error, refetch: () => staff.refetch() };
  useEffect(() => { setDraft(null); }, [sel, selected?.primary_branch_id]);

  // سوپر ادمین همه‌ی شعب؛ Branch Master فقط قلمرو خودش (branch_master_scope در /auth/me، ADR 0009)
  const mine = user?.is_superuser ? (branches.data ?? []) : (branches.data ?? []).filter((b) => (user?.branch_master_scope ?? []).includes(b.id));
  const bterm = searchKey(bq.trim());
  const branchRows = mine.filter((b) => !bterm || searchKey(b.code, b.name, b.province, b.city, b.full_address).includes(bterm));
  const value = draft ?? current.data ?? [];
  const editable = can('identity.users.branch_access.update') && !!selected && selected.id !== user?.id;
  const changed = draft !== null && (draft.length !== (current.data ?? []).length || draft.some((x) => !(current.data ?? []).includes(x)));

  const pick = (p: StaffUser) => {
    setSel(p.id);
    setBq('');
    requestAnimationFrame(() => branchCard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  // رابطه‌ی کارمند و شعبه یک‌به‌یک است (افشین 2026-10-20) ⇐ انتخاب یک شعبه جایگزین شعبه‌ی قبلی می‌شود
  const choose = (id: string) => setDraft([id]);
  const branchName = (id: string | undefined) => (id ? mine.find((b) => b.id === id)?.name ?? (branches.data ?? []).find((b) => b.id === id)?.name ?? 'شعبه' : null);

  const save = async () => {
    if (!sel || draft === null) return;
    const before = current.data?.[0] ?? null;
    const next = draft[0] ?? null;
    setBusy(true);
    try {
      // PUT /auth/users/{id}/branch — جابه‌جایی مستقیم مجاز نیست ⇐ اول آزادسازی، بعد تخصیص (work_branch_release_first)
      if (before && before !== next) await adminApi(`/auth/users/${sel}/branch`, { method: 'PUT', body: { branch_id: null } });
      if (next && next !== before) await adminApi(`/auth/users/${sel}/branch`, { method: 'PUT', body: { branch_id: next } });
      toast(next ? 'شعبه‌ی محل کار ذخیره شد.' : 'کارمند از شعبه آزاد شد.');
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ['identity', 'staff'] });
    }
  };

  const staffCols: Column<StaffUser>[] = [
    { key: 'code', header: 'کد پرسنلی', code: true, render: (p) => <span className="ltr">{p.personnel_code ?? '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (p) => <span className={u.strong}>{fullName(p)}</span> },
    { key: 'role', header: 'نقش', render: (p) => (p.roles?.length ? <Chip>{p.roles.map(roleName).join('، ')}</Chip> : <span className={u.muted}>بدون نقش</span>) },
    { key: 'status', header: 'وضعیت', render: (p) => { const st = USER_STATUS[p.status] ?? { label: p.status, tone: 'neutral' as const }; return <Badge tone={st.tone}>{st.label}</Badge>; } },
    { key: 'dept', header: 'دپارتمان', render: (p) => { const d = deptMap.data?.map.get(p.id); return d?.length ? d.join('، ') : <span className={u.muted}>—</span>; } },
    { key: 'branch', header: 'شعبه', render: (p) => (p.branch_name ? <Chip>{p.branch_name}</Chip> : <span className={u.muted}>بدون شعبه</span>) },
    { key: 'scope', header: 'قلمرو شعب', render: (p) => (p.user_type === 'SUPERADMIN' ? <Badge tone="info">همه‌ی شعب</Badge> : <span className={u.muted}>بر اساس تخصیص</span>) },
  ];

  const branchCols: Column<BranchOption>[] = [
    {
      key: 'pick', header: 'انتخاب', render: (b) => (
        <input type="radio" name="branch" className={s.check} checked={value.length === 1 && value[0] === b.id} disabled={!editable} aria-label={`شعبه ${b.name}`}
          onClick={(e) => e.stopPropagation()} onChange={() => choose(b.id)} />
      ),
    },
    { key: 'code', header: 'کد شعبه', code: true, render: (b) => <span className="ltr">{b.code}</span> },
    { key: 'name', header: 'نام شعبه', render: (b) => <span className={u.strong}>{b.name}</span> },
    { key: 'addr', header: 'آدرس', render: (b) => <span className={u.muted}>{[b.province, b.city, b.full_address].filter(Boolean).join('، ') || '—'}</span> },
  ];

  return (
    <>
      <div className={s.head}>
        <h2 className={s.title}>کنسول تخصیص شعب پرسنل</h2>
        <div className={s.headActions}>
          {selected ? (
            <span className={s.summary}>
              <span className={u.strong}>{fullName(selected)}</span>
              <span className={u.muted}>{value.length === 1 ? `شعبه: ${branchName(value[0])}` : value.length === 0 ? 'بدون شعبه' : `${faNum(value.length)} شعبه (باید یکی باشد)`}{changed ? ' · تغییر ذخیره‌نشده' : ''}</span>
            </span>
          ) : null}
          <Button onClick={save} loading={busy} disabled={!editable || !changed} icon={<IconCheck size={17} />}>ذخیره‌ی تغییرات</Button>
        </div>
      </div>
      <InfoBanner>
        {user?.is_superuser ? 'شما با دسترسی سوپرادمین وارد شده‌اید و می‌توانید هر کارمند را به هر شعبه‌ای تخصیص دهید.' : 'به‌عنوان Branch Master فقط می‌توانید کارمندان را به شعبه‌هایی که خودتان مدیر آن‌ها هستید تخصیص دهید.'}
        {' '}این‌جا تعیین می‌شود هر کارمند در کدام شعبه کار می‌کند (هر کارمند یک شعبه). اجازه‌ی دیدن شعب دیگر از نقش کاربر در «مدیریت نقش‌ها» می‌آید.
      </InfoBanner>
      {!branches.canList ? <InfoBanner tone="warning">فهرست شعب برای حساب شما در دسترس نیست؛ نام شعب نمایش داده نمی‌شود.</InfoBanner> : null}

      <div className={s.stack}>
        <Card>
          <SectionTitle>انتخاب پرسنل</SectionTitle>
          <TableFilters
            search={q}
            onSearch={reset(setQ)}
            placeholder="جست‌وجو: نام، نام کاربری، موبایل یا کد پرسنلی"
            count={staff.data ? `${faNum(people.length)} نفر` : undefined}
            filters={[
              { key: 'role', label: 'نقش', value: fRole, onChange: reset(setFRole), options: [...(roles.data ?? []).map((r) => ({ value: r.code, label: r.name })), { value: '__none', label: 'بدون نقش' }] },
              { key: 'status', label: 'وضعیت', value: fStatus, onChange: reset(setFStatus), options: Object.entries(USER_STATUS).map(([value, v]) => ({ value, label: v.label })) },
              { key: 'session', label: 'نشست فعال', value: fSession, onChange: reset(setFSession), options: [{ value: 'yes', label: 'دارد' }, { value: 'no', label: 'ندارد' }] },
            ]}
          />
          <DataTable columns={staffCols} rows={staff.data ? pageRows : undefined} rowKey={(p) => p.id} loading={staff.isLoading} error={staff.error} onRetry={() => staff.refetch()}
            onRowClick={pick} isSelected={(p) => p.id === sel}
            empty={<Empty title={staff.data?.length ? 'پرسنلی با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز پرسنلی ثبت نشده است'} />} />
          {people.length > 0 ? <Pagination page={page} pageSize={pageSize} total={people.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} /> : null}
        </Card>

        <div ref={branchCard} className={s.anchor}>
          <Card>
            {!selected ? (
              <Empty icon={<IconUserSearch size={30} stroke={1.4} />} title="ابتدا یک نفر را از جدول پرسنل انتخاب کنید" text="شعبه‌ی فعلی او و شعب قابل واگذاری این‌جا نمایش داده می‌شود." />
            ) : (
              <>
                <SectionTitle extra={selected.user_type === 'SUPERADMIN' ? <Badge tone="info">سوپرادمین — دسترسی به همه‌ی شعب</Badge> : null}>شعبه {fullName(selected)}</SectionTitle>
                {value.length > 1 && !changed ? <InfoBanner tone="warning">این کارمند فعلاً به {faNum(value.length)} شعبه دسترسی دارد. هر کارمند فقط در یک شعبه فعالیت می‌کند؛ با انتخاب یک شعبه و ذخیره، دسترسی به بقیه گرفته می‌شود.</InfoBanner> : null}
                {selected.id === user?.id ? <InfoBanner tone="warning">دسترسی شعب خودتان را نمی‌توانید تغییر دهید.</InfoBanner> : null}
                {current.error instanceof ApiError && current.error.status === 404 && selected.status !== 'ACTIVE' ? (
                  <InfoBanner tone="warning">شعب کاربرِ «{USER_STATUS[selected.status]?.label ?? selected.status}» از بک‌اند دریافت نمی‌شود (بک‌اند کاربر غیرفعال را «پیدا نشد» برمی‌گرداند — گزارش‌شده برای identity). تا رفع این ایراد، شعب کاربران غیرفعال از این‌جا قابل مدیریت نیست.</InfoBanner>
                ) : mine.length === 0 && !branches.isLoading ? <Empty icon={<IconBuildingStore size={30} stroke={1.4} />} title="شعبه‌ای برای واگذاری ندارید" /> : (
                  <>
                    <TableFilters search={bq} onSearch={setBq} placeholder="جست‌وجو: کد، نام یا آدرس شعبه" count={`${faNum(branchRows.length)} شعبه`}
                      extra={editable ? (
                        <Button variant={value.length === 0 ? 'primary' : 'secondary'} onClick={() => setDraft([])} data-tip="کارمند هنوز در شعبه‌ای مستقر نیست (مثلاً کارمند ستادی)">بدون شعبه</Button>
                      ) : null} />
                    <DataTable columns={branchCols} rows={current.data && branches.data ? branchRows : undefined} rowKey={(b) => b.id}
                      loading={current.isLoading || branches.isLoading} error={current.error} onRetry={() => current.refetch()}
                      onRowClick={editable ? (b) => choose(b.id) : undefined} isSelected={(b) => value.length === 1 && value[0] === b.id}
                      empty={<Empty title="شعبه‌ای با این جست‌وجو پیدا نشد" />} />
                  </>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
