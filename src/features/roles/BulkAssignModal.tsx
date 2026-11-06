import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconUserPlus } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { ApiError, userMessage } from '@/shared/api/errors';
import type { AdminSchemas } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/useAuth';
import { faNum, fullName, jalaliTextToGregorian } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Chip, Empty, Modal, Pagination } from '@/shared/ui/kit';
import { searchKey, TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { selectColumn } from '@/features/catalog/catalogTables';
import { useAllRoles, useAllStaff, type Role, type StaffUser } from '@/features/users/api';
import { USER_STATUS } from '@/features/users/labels';
import u from '@/features/users/users.module.css';
import s from './roles.module.css';

type BulkAssignOut = AdminSchemas['RbacBulkRoleAssignmentOut'];
/** سقف هر درخواست POST /rbac/roles/{id}/assignments/bulk (RbacBulkRoleAssignmentIn: ۱ تا ۱۰۰؛ همه یا هیچ). */
const BULK_MAX = 100;
const NO_ROLE = '__none';
const DEFAULT_PAGE_SIZE = 10;
/** پایان روز به وقت تهران؛ «۱۴۰۵/۰۹/۳۰» ⇐ "2026-12-21T23:59:59+03:30". */
const dayEndTehran = (ymd: string) => `${ymd}T23:59:59+03:30`;

/** چرا این کاربر قابل انتخاب نیست (همان قیدهای بک‌اند در assign_role_bulk)؛ null = قابل انتخاب. */
function blockReason(x: StaffUser, role: Role, selfId: string | undefined, isSuper: boolean, roleName: (code: string) => string): string | null {
  if ((x.roles ?? []).includes(role.code)) return 'همین نقش را دارد';
  if (x.roles?.length) return `نقش دیگر دارد: ${x.roles.map(roleName).join('، ')}`;
  if (!x.is_active || x.status !== 'ACTIVE') return 'کاربر فعال نیست';
  if (!isSuper && x.id === selfId) return 'نقش خودتان را نمی‌توانید تعیین کنید';
  return null;
}

/**
 * پیام‌های انگلیسی بک‌اند (domains/rbac/services/role.py ⇐ assign_role_bulk) به فارسی؛ شناسه‌ی کاربر با نامش جایگزین می‌شود.
 * مثال: "User '3f2…' is inactive." ⇐ «کاربر «علی رضایی» غیرفعال است.»
 */
/**
 * شناسه‌ی UUID داخل متن خطا. می‌خورد به "User '3f2504e0-4f89-41d3-9a0c-0305e82c3301' is inactive." و نمی‌خورد به "User 'ali' is inactive."
 * https://regex101.com/?regex=%5B0-9a-f%5D%7B8%7D-%5B0-9a-f%5D%7B4%7D-%5B0-9a-f%5D%7B4%7D-%5B0-9a-f%5D%7B4%7D-%5B0-9a-f%5D%7B12%7D&flags=i&testString=User%20%273f2504e0-4f89-41d3-9a0c-0305e82c3301%27%20is%20inactive.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** [تکه‌ای از متن انگلیسی بک‌اند, پیام فارسی] — اولین تکه‌ای که در متن باشد برنده است. */
const ASSIGN_ERRORS: Array<[string[], (who: string) => string]> = [
  [['already has an active role'], (w) => `${w} نقش فعال دیگری دارد. هر کارمند فقط یک نقش فعال دارد؛ نقش او را از صفحه‌ی خودش عوض کنید.`],
  [['multiple active roles'], (w) => `${w} بیش از یک نقش فعال دارد و باید اول اصلاح شود.`],
  [['is deleted'], (w) => `${w} حذف شده است.`],
  [["' is inactive", 'status is not ACTIVE'], (w) => `${w} فعال نیست.`],
  [['is not staff or superadmin'], (w) => `${w} کارمند نیست.`],
  [['Users not found'], () => 'برخی کاربران انتخاب‌شده پیدا نشدند؛ فهرست را تازه کنید.'],
  [['Self-assignment'], () => 'نقش خودتان را نمی‌توانید تعیین کنید.'],
  [['permissions actor does not possess'], () => 'این نقش مجوزهایی دارد که خودتان ندارید؛ فقط سوپر ادمین می‌تواند آن را تخصیص دهد.'],
  [['expires_at must be in the future'], () => 'تاریخ انقضا باید بعد از امروز باشد.'],
];
function assignErrorMessage(e: unknown, nameOf: (id: string) => string): string {
  if (!(e instanceof ApiError)) return userMessage(e);
  const text = e.detailText;
  const id = text.match(UUID)?.[0];
  const who = id ? `کاربر «${nameOf(id)}»` : 'یکی از کاربران';
  if (text.startsWith('Role ') && text.includes('is inactive')) return 'این نقش غیرفعال است؛ اول آن را فعال کنید.';
  const hit = ASSIGN_ERRORS.find(([parts]) => parts.some((part) => text.includes(part)));
  return hit ? hit[1](who) : userMessage(e);
}

/** تخصیص گروهی یک نقش به کارکنان (2026-10-27) با جدول انتخابی کاربران و تاریخ انقضای اختیاری. */
export function BulkAssignModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const { user } = useAuth();
  const isSuper = !!user?.is_superuser;
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useAllStaff();
  const roles = useAllRoles();
  const roleName = (code: string) => roles.data?.find((r) => r.code === code)?.name ?? code;
  const [q, setQ] = useState('');
  // پیش‌فرض «بدون نقش»: فقط این‌ها قابل تخصیص‌اند (هر کارمند حداکثر یک نقش فعال)
  const [fRole, setFRole] = useState(NO_ROLE);
  const [fStatus, setFStatus] = useState('');
  const [fSession, setFSession] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sel, setSel] = useState<string[]>([]);
  const [expires, setExpires] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reason = (x: StaffUser) => blockReason(x, role, user?.id, isSuper, roleName);
  const filtered = useMemo(() => {
    const term = searchKey(q.trim());
    return (staff.data ?? []).filter((x) =>
      (!term || searchKey(x.first_name, x.last_name, x.username, x.phone_number, x.personnel_code).includes(term))
      && (!fRole || (fRole === NO_ROLE ? !x.roles?.length : (x.roles ?? []).includes(fRole)))
      && (!fStatus || x.status === fStatus)
      && (!fSession || (fSession === 'yes' ? (x.active_sessions_count ?? 0) > 0 : !(x.active_sessions_count ?? 0))));
  }, [staff.data, q, fRole, fStatus, fSession]);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pickable = rows.filter((x) => !reason(x));
  const allOn = pickable.length > 0 && pickable.every((x) => sel.includes(x.id));
  const nameOf = (id: string) => { const x = staff.data?.find((y) => y.id === id); return x ? fullName(x) : 'نامشخص'; };
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const toggle = (x: StaffUser) => {
    if (reason(x)) return;
    setSel((cur) => {
      if (cur.includes(x.id)) return cur.filter((i) => i !== x.id);
      if (cur.length >= BULK_MAX) { toast(`در هر بار حداکثر ${faNum(BULK_MAX)} کاربر.`, 'error'); return cur; }
      return [...cur, x.id];
    });
  };
  const toggleAll = () => setSel((cur) => (allOn
    ? cur.filter((i) => !pickable.some((x) => x.id === i))
    : Array.from(new Set([...cur, ...pickable.map((x) => x.id)])).slice(0, BULK_MAX)));

  const cols: Column<StaffUser>[] = [
    selectColumn<StaffUser>({ isOn: (x) => sel.includes(x.id), toggle, allOn, toggleAll, label: (x) => `انتخاب ${fullName(x)}`, disabled: (x) => !!reason(x) }),
    { key: 'code', header: 'کد پرسنلی', code: true, render: (x) => <span className="ltr">{x.personnel_code ?? '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (x) => <span className={u.strong}>{fullName(x)}</span> },
    { key: 'mobile', header: 'موبایل', render: (x) => <span className="tnum">{x.phone_number}</span> },
    { key: 'role', header: 'نقش فعلی', render: (x) => (x.roles?.length ? <Chip tip>{x.roles.map(roleName).join('، ')}</Chip> : <span className={u.muted}>بدون نقش</span>) },
    { key: 'status', header: 'وضعیت', render: (x) => { const st = USER_STATUS[x.status] ?? { label: x.status, tone: 'neutral' as const }; return <Badge tone={st.tone}>{st.label}</Badge>; } },
    { key: 'why', header: 'قابل تخصیص', render: (x) => { const r = reason(x); return r ? <span className={u.muted} data-tip={r}>{r}</span> : <Badge tone="success">بله</Badge>; } },
  ];

  const submit = async () => {
    setError(null);
    if (!sel.length) { setError('دست‌کم یک کاربر انتخاب کنید.'); return; }
    let expiresAt: string | undefined;
    if (expires.trim()) {
      const g = jalaliTextToGregorian(expires);
      if (!g) { setError('تاریخ انقضا معتبر نیست.'); return; }
      expiresAt = dayEndTehran(g);
      if (new Date(expiresAt).getTime() <= Date.now()) { setError('تاریخ انقضا باید بعد از امروز باشد.'); return; }
    }
    setBusy(true);
    try {
      const r = await adminApi<BulkAssignOut>(`/rbac/roles/${role.id}/assignments/bulk`, {
        method: 'POST',
        body: expiresAt ? { user_ids: sel, expires_at: expiresAt } : { user_ids: sel },
      });
      toast(r.existing_count
        ? `نقش «${role.name}» به ${faNum(r.created_count)} کاربر داده شد؛ ${faNum(r.existing_count)} کاربر از قبل همین نقش را داشتند.`
        : `نقش «${role.name}» به ${faNum(r.created_count)} کاربر داده شد.`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['rbac', 'assignments'] }), qc.invalidateQueries({ queryKey: ['identity', 'staff'] })]);
      onClose();
    } catch (e) {
      // همه یا هیچ: هیچ تخصیصی ثبت نشده است
      setError(assignErrorMessage(e, nameOf));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`تخصیص گروهی نقش «${role.name}»`} width={1040}
      footer={<>
        <Button icon={<IconUserPlus size={17} />} onClick={submit} loading={busy} disabled={!sel.length}>
          {sel.length ? `تخصیص نقش به ${faNum(sel.length)} کاربر` : 'تخصیص نقش'}
        </Button>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
      </>}>
      <div className={s.bulkBody} data-bulk-assign>
        <p className={u.sub}>هر کارمند فقط یک نقش فعال دارد؛ کسانی که نقش دیگری دارند یا فعال نیستند قابل انتخاب نیستند. ثبت همه یا هیچ است: اگر یکی رد شود، هیچ تخصیصی ثبت نمی‌شود.</p>
        {error ? <Alert>{error}</Alert> : null}
        <TableFilters
          search={q}
          onSearch={reset(setQ)}
          placeholder="جست‌وجو: نام، نام کاربری، موبایل یا کد پرسنلی"
          count={staff.data ? `${faNum(filtered.length)} کاربر` : undefined}
          filters={[
            { key: 'role', label: 'نقش', value: fRole, onChange: reset(setFRole), options: [...(roles.data ?? []).map((r) => ({ value: r.code, label: r.name })), { value: NO_ROLE, label: 'بدون نقش' }] },
            { key: 'status', label: 'وضعیت', value: fStatus, onChange: reset(setFStatus), options: Object.entries(USER_STATUS).map(([value, v]) => ({ value, label: v.label })) },
            { key: 'session', label: 'نشست فعال', value: fSession, onChange: reset(setFSession), options: [{ value: 'yes', label: 'دارد' }, { value: 'no', label: 'ندارد' }] },
          ]}
        />
        <DataTable
          columns={cols}
          rows={staff.data ? rows : undefined}
          rowKey={(x) => x.id}
          loading={staff.isLoading}
          error={staff.error}
          onRetry={() => staff.refetch()}
          onRowClick={toggle}
          isSelected={(x) => sel.includes(x.id)}
          empty={<Empty title={staff.data?.length ? 'کاربری با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز کاربری ثبت نشده است'} />}
        />
        {filtered.length > 0 ? (
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        ) : null}
        <div className={s.bulkBar}>
          <span data-sel-count>
            <b className="tnum">{faNum(sel.length)}</b> کاربر انتخاب شده (حداکثر {faNum(BULK_MAX)})
            {sel.length ? <> · <button type="button" className={s.linkBtn} onClick={() => setSel([])}>پاک کردن انتخاب</button></> : null}
          </span>
          <div className={s.bulkExpire}>
            <JalaliDateInput label="تاریخ انقضای نقش (اختیاری)" value={expires} onChange={(e) => { setExpires(e.target.value); setError(null); }} dir="ltr" maxYear={1500} placeholder="بدون انقضا" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
