import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconCheck } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { faNum } from '@/shared/lib/format';
import { useBranchOptions, type BranchOption } from '@/shared/layout/useBranches';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Toggle } from '@/shared/ui/form';
import { Card, Chip, Empty, InfoBanner, Pagination, SectionTitle } from '@/shared/ui/kit';
import { searchKey, TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { fetchAll, type UserDetail } from './api';
import s from './users.module.css';

/**
 * Branch Master (ADR 0009): ویژگی خودِ کاربر، خارج از rbac؛ فقط سوپر ادمین تعیین می‌کند.
 * قلمرو = شعبه‌هایی که او می‌تواند کارمند به آن‌ها تخصیص دهد (GET/PATCH /auth/users/{id}/branches[/grant|/revoke]).
 * این قلمرو دسترسی دیدن داده نمی‌دهد؛ دیدن داده فقط از نقش است.
 */
export function BranchMasterSection({ u }: { u: UserDetail }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const isSuper = !!me && (me.is_superuser || me.user_type === 'SUPERADMIN');
  const [flag, setFlag] = useState(u.is_branch_master);
  const [busyFlag, setBusyFlag] = useState(false);
  useEffect(() => { setFlag(u.is_branch_master); }, [u.is_branch_master]);
  const branches = useBranchOptions();
  const scope = useQuery({ queryKey: ['identity', 'user', u.id, 'scope'], queryFn: () => fetchAll<string>(`/auth/users/${u.id}/branches`), enabled: isSuper && flag });
  const [draft, setDraft] = useState<Set<string> | null>(null);
  useEffect(() => { setDraft(null); }, [scope.data]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const size = 10;
  const rows = useMemo(() => {
    const t = searchKey(q.trim());
    return (branches.data ?? []).filter((b) => !t || searchKey(b.code, b.name, b.province, b.city, b.full_address).includes(t));
  }, [branches.data, q]);

  if (!isSuper || u.user_type !== 'STAFF') return null;
  const current = new Set(scope.data ?? []);
  const sel = draft ?? current;
  const grant = [...sel].filter((x) => !current.has(x));
  const revoke = [...current].filter((x) => !sel.has(x));
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setDraft(n); };

  const setMaster = async (v: boolean) => {
    setBusyFlag(true);
    try {
      await adminApi(`/auth/users/${u.id}/branch-master`, { method: 'PATCH', body: { is_branch_master: v } });
      setFlag(v);
      toast(v ? 'کاربر Branch Master شد.' : 'Branch Master بودن کاربر برداشته شد.');
      await qc.invalidateQueries({ queryKey: ['identity', 'user', u.id] });
      await qc.invalidateQueries({ queryKey: ['identity', 'staff'] });
    } catch (e) { toast(userMessage(e), 'error'); } finally { setBusyFlag(false); }
  };
  const saveScope = async () => {
    setBusy(true);
    try {
      if (grant.length) await adminApi(`/auth/users/${u.id}/branches/grant`, { method: 'PATCH', body: { branch_ids: grant } });
      if (revoke.length) await adminApi(`/auth/users/${u.id}/branches/revoke`, { method: 'PATCH', body: { branch_ids: revoke } });
      toast('قلمرو شعب ذخیره شد.');
    } catch (e) { toast(userMessage(e), 'error'); } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ['identity', 'user', u.id, 'scope'] });
    }
  };

  const cols: Column<BranchOption>[] = [
    { key: 'sel', header: 'در قلمرو', render: (b) => <input type="checkbox" className={s.scopeCheck} checked={sel.has(b.id)} onChange={() => toggle(b.id)} onClick={(e) => e.stopPropagation()} aria-label={`قلمرو: ${b.name}`} /> },
    { key: 'code', header: 'کد شعبه', code: true, render: (b) => <span className="ltr">{b.code}</span> },
    { key: 'name', header: 'نام شعبه', render: (b) => <strong>{b.name}</strong> },
    { key: 'addr', header: 'آدرس', render: (b) => [b.province, b.city].filter(Boolean).join('، ') || '—' },
  ];

  return (
    <Card>
      <SectionTitle extra={<Toggle checked={flag} onChange={(v) => void setMaster(v)} disabled={busyFlag} label={flag ? 'فعال' : 'غیرفعال'} />}>Branch Master</SectionTitle>
      <p className={s.sub} style={{ marginBottom: flag ? 14 : 0 }}>Branch Master می‌تواند کارمندان را فقط در شعبه‌های قلمرو خودش به شعبه تخصیص دهد. این ویژگی مستقل از نقش است و دسترسی دیدن داده‌ی شعب دیگر نمی‌دهد. فقط سوپر ادمین آن را تعیین می‌کند.</p>
      {flag ? (
        <>
          <div className={s.scopeHead}>
            <strong>قلمرو شعب</strong>
            <Chip>{faNum(sel.size)} شعبه</Chip>
            <Button className={s.scopeSave} icon={<IconCheck size={16} />} onClick={saveScope} loading={busy} disabled={!grant.length && !revoke.length}>ذخیره‌ی قلمرو</Button>
          </div>
          {!branches.canList ? <InfoBanner tone="warning">فهرست شعب برای حساب شما در دسترس نیست.</InfoBanner> : null}
          <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: کد، نام یا آدرس شعبه" filters={[]} />
          <DataTable columns={cols} rows={branches.data && scope.data ? rows.slice((page - 1) * size, page * size) : undefined} rowKey={(b) => b.id}
            loading={branches.isLoading || scope.isLoading} error={scope.error ?? branches.error} onRetry={() => scope.refetch()}
            onRowClick={(b) => toggle(b.id)} isSelected={(b) => sel.has(b.id)} empty={<Empty title="شعبه‌ای پیدا نشد" />} />
          {rows.length > size ? <Pagination page={page} pageSize={size} total={rows.length} onPage={setPage} sizes={[size]} onPageSize={() => undefined} /> : null}
        </>
      ) : null}
    </Card>
  );
}
