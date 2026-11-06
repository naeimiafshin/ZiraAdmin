import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconChevronDown } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import type { AdminSchemas } from '@/shared/api/types';
import { faNum } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Empty, ErrorBox, InfoBanner, Modal, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useRoleMatrix } from '@/features/users/api';
import u from '@/features/users/users.module.css';
import s from './roles.module.css';

type Perm = AdminSchemas['PermissionMatrixPermissionItem'];
type BulkGrantOut = AdminSchemas['RbacBulkRolePermissionGrantOut'];

const ACTIONS: { code: string; label: string }[] = [
  { code: 'list', label: 'فهرست' }, { code: 'read', label: 'مشاهده' }, { code: 'create', label: 'ایجاد' }, { code: 'update', label: 'ویرایش' },
  { code: 'delete', label: 'حذف' }, { code: 'export', label: 'خروجی' }, { code: 'approve', label: 'تأیید' }, { code: 'print', label: 'چاپ' },
];
/** سقف هر درخواست POST /rbac/roles/{id}/permissions/bulk (RbacBulkRolePermissionGrantIn: ۱ تا ۱۰۰). */
const BULK_MAX = 100;

/** مجوز فقط‌ارثی (از نقش والد) این‌جا تغییرپذیر نیست و در «انتخاب همه» حساب نمی‌شود. */
const togglable = (p: Perm) => !(p.is_inherited && !p.is_direct);
type Tri = 'on' | 'off' | 'mixed' | 'none';
function triOf(perms: Perm[]): Tri {
  const t = perms.filter(togglable);
  if (!t.length) return 'none';
  const on = t.filter((p) => p.is_direct).length;
  if (on === t.length) return 'on';
  return on ? 'mixed' : 'off';
}

/** چک‌باکس سه‌حالته (همه / هیچ / بخشی) برای «انتخاب همه». */
function TriCheck({ state, label, disabled, onChange }: { state: Tri; label: string; disabled?: boolean; onChange: (grant: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'mixed'; }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={s.tri}
      aria-label={label}
      data-tip={label}
      checked={state === 'on'}
      disabled={disabled || state === 'none'}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onChange={() => onChange(state !== 'on')}
    />
  );
}

type Pending = { title: string; perms: Perm[] };

/**
 * ماتریس مجوزهای نقش (2026-10-27): تیک تکی (POST/DELETE تک مجوز) و «انتخاب همه» در سه سطح:
 * همه‌ی مجوزها، هر دامنه و هر ردیف (بخش). افزودن گروهی با permissions/bulk (هر ۱۰۰ تا یک درخواست، همه یا هیچ)؛
 * بک‌اند برداشتن گروهی ندارد ⇐ برداشتن با DELETE تک‌تک مجوزهای مستقیم. فقط سوپر ادمین.
 */
export function RoleMatrix({ roleId, isSuper, roleActive }: { roleId: string; isSuper: boolean; roleActive: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const matrix = useRoleMatrix(roleId);
  const [open, setOpen] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<Pending | null>(null);
  const canEdit = isSuper && roleActive;

  const refresh = () => qc.invalidateQueries({ queryKey: ['rbac', 'role', roleId, 'matrix'] });

  const toggle = async (permissionId: string, grant: boolean) => {
    setBusy(permissionId);
    try {
      if (grant) await adminApi(`/rbac/roles/${roleId}/permissions`, { method: 'POST', body: { permission_id: permissionId } });
      else await adminApi(`/rbac/roles/${roleId}/permissions/${permissionId}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const grantAll = async (key: string, perms: Perm[]) => {
    const ids = perms.filter((p) => togglable(p) && !p.is_direct).map((p) => p.permission_id);
    if (!ids.length) return;
    setBusy(key);
    let added = 0;
    const chunks = Array.from({ length: Math.ceil(ids.length / BULK_MAX) }, (_, i) => ids.slice(i * BULK_MAX, (i + 1) * BULK_MAX));
    try {
      // پشت سر هم (نه هم‌زمان) تا شمار افزوده‌ها در خطای میانه درست بماند
      await chunks.reduce(async (prev, chunk) => {
        await prev;
        const r = await adminApi<BulkGrantOut>(`/rbac/roles/${roleId}/permissions/bulk`, { method: 'POST', body: { permission_ids: chunk } });
        added += r.added_count;
      }, Promise.resolve());
      toast(`${faNum(added)} مجوز به نقش افزوده شد.`);
    } catch (e) {
      toast(added ? `${faNum(added)} مجوز افزوده شد؛ بقیه خطا داد: ${userMessage(e)}` : userMessage(e), 'error');
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  const revokeAll = async (key: string, perms: Perm[]) => {
    const ids = perms.filter((p) => p.is_direct).map((p) => p.permission_id);
    if (!ids.length) return;
    setBusy(key);
    let done = 0;
    try {
      await ids.reduce(async (prev, pid) => {
        await prev;
        await adminApi(`/rbac/roles/${roleId}/permissions/${pid}`, { method: 'DELETE' });
        done += 1;
      }, Promise.resolve());
      toast(`${faNum(done)} مجوز از نقش برداشته شد.`);
    } catch (e) {
      toast(`${faNum(done)} از ${faNum(ids.length)} مجوز برداشته شد؛ بقیه خطا داد: ${userMessage(e)}`, 'error');
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  /** ردیف بی‌پرسش؛ دامنه و کل ماتریس پیش از برداشتن تأیید می‌گیرند. */
  const group = (key: string, title: string, perms: Perm[], ask: boolean) => (grant: boolean) => {
    if (grant) { void grantAll(key, perms); return; }
    if (ask) { setConfirmRevoke({ title, perms }); return; }
    void revokeAll(key, perms);
  };

  const domains = matrix.data?.matrix ?? [];
  const all = domains.flatMap((d) => d.resources.flatMap((x) => x.permissions));
  const grantedCount = all.filter((p) => p.is_granted).length;
  const busyAny = busy !== null;

  return (
    <>
      <SectionTitle extra={matrix.data ? (
        <span className={s.matrixTools}>
          <span className={u.sub}>{faNum(grantedCount)} از {faNum(all.length)} مجوز</span>
          {isSuper ? (
            <label className={s.allLabel}>
              <TriCheck state={triOf(all)} label="همه‌ی مجوزها" disabled={!canEdit || busyAny} onChange={group('all', 'همه‌ی مجوزهای این نقش', all, true)} />
              همه‌ی مجوزها
            </label>
          ) : null}
        </span>
      ) : null}>ماتریس مجوزها</SectionTitle>
      {!isSuper ? <InfoBanner>فقط سوپرادمین ماتریس مجوزها را تغییر می‌دهد.</InfoBanner> : null}
      {isSuper && !roleActive ? <InfoBanner tone="warning">این نقش غیرفعال است؛ برای تغییر مجوزها اول آن را فعال کنید.</InfoBanner> : null}
      <div className={s.legend}>
        <span>☑ مجوز مستقیم</span>
        <span style={{ color: 'var(--info)' }}>☑ به‌ارث‌رسیده از نقش والد (غیرقابل تغییر در این‌جا)</span>
        {isSuper ? <span>چک‌باکس کنار دامنه و هر بخش = انتخاب همه‌ی مجوزهای همان</span> : null}
      </div>
      {matrix.isLoading ? <SkeletonRows rows={5} /> : null}
      {matrix.error ? <ErrorBox error={matrix.error} onRetry={() => matrix.refetch()} /> : null}
      {matrix.data && !domains.length ? <Empty title="مجوزی تعریف نشده است" /> : null}
      {domains.map((d) => {
          const isOpen = open.includes(d.domain_code);
          const g = d.resources.flatMap((x) => x.permissions);
          const dKey = `d:${d.domain_code}`;
          return (
            <div key={d.domain_code} className={s.matrixDomain} data-domain={d.domain_code}>
              <div className={s.domainHead} onClick={() => setOpen((o) => (isOpen ? o.filter((c) => c !== d.domain_code) : [...o, d.domain_code]))} role="button" aria-expanded={isOpen}>
                <span className={s.domainName}>
                  {isSuper ? <TriCheck state={triOf(g)} label={`همه‌ی مجوزهای ${d.domain_name}`} disabled={!canEdit || busyAny} onChange={group(dKey, `همه‌ی مجوزهای «${d.domain_name}»`, g, true)} /> : null}
                  {d.domain_name}
                </span>
                <span>{busy === dKey ? 'در حال ذخیره… ' : null}{faNum(g.filter((p) => p.is_granted).length)} / {faNum(g.length)} <IconChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, verticalAlign: 'middle' }} /></span>
              </div>
              {isOpen ? (
                <>
                  <div className={`${s.mRow} ${s.mHead}`}><span>بخش</span>{ACTIONS.map((a) => <span key={a.code} className={s.cb}>{a.label}</span>)}</div>
                  {d.resources.map((res) => {
                    const rKey = `r:${d.domain_code}:${res.resource_code}`;
                    return (
                      <div key={res.resource_code} className={s.mRow}>
                        <span className={s.mName}>
                          <span className={s.rowName}>
                            {isSuper ? <TriCheck state={triOf(res.permissions)} label={`همه‌ی مجوزهای ${res.resource_name}`} disabled={!canEdit || busyAny} onChange={group(rKey, res.resource_name, res.permissions, false)} /> : null}
                            {res.resource_name}
                          </span>
                        </span>
                        {ACTIONS.map((a) => {
                          const p = res.permissions.find((x) => x.action_code === a.code);
                          if (!p) return <span key={a.code} className={s.cb} />;
                          const inheritedOnly = !togglable(p);
                          return (
                            <span key={a.code} className={s.cb}>
                              <input type="checkbox" aria-label={`${res.resource_name} — ${a.label}`} checked={p.is_granted} className={inheritedOnly ? s.inherited : ''}
                                disabled={!canEdit || inheritedOnly || busyAny} onChange={(e) => toggle(p.permission_id, e.target.checked)} />
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              ) : null}
            </div>
          );
        })}
      {confirmRevoke ? (
        <Modal open onClose={() => setConfirmRevoke(null)} title="برداشتن گروهی مجوزها" width={480}
          footer={<>
            <Button variant="danger" onClick={() => { const c = confirmRevoke; setConfirmRevoke(null); void revokeAll('confirm', c.perms); }}>برداشتن {faNum(confirmRevoke.perms.filter((p) => p.is_direct).length)} مجوز</Button>
            <Button variant="ghost" onClick={() => setConfirmRevoke(null)}>انصراف</Button>
          </>}>
          <p>{confirmRevoke.title} از این نقش برداشته شود؟ کاربرانی که این نقش را دارند همین حالا دسترسی‌شان را از دست می‌دهند.</p>
          <p className={u.sub}>مجوزهای به‌ارث‌رسیده از نقش والد دست نمی‌خورند.</p>
        </Modal>
      ) : null}
    </>
  );
}
