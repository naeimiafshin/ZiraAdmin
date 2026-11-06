import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useBack } from '@/shared/lib/useBack';
import { useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconGitMerge, IconUsersPlus } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, fullName } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select, Textarea, Toggle } from '@/shared/ui/form';
import { Badge, Card, Empty, ErrorBox, InfoBanner, KeyValue, Modal, PageHead, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useAllRoles, useAllStaff, useAssignments, useRole, type Role } from '@/features/users/api';
import { BulkAssignModal } from './BulkAssignModal';
import { RoleMatrix } from './RoleMatrix';
import u from '@/features/users/users.module.css';
import s from './roles.module.css';

export default function RoleDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const back = useBack('/rbac/roles');
  const { user } = useAuth();
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const role = useRole(id);
  const asg = useAssignments({ role_id: id }, can('rbac.roles.assignments.read'));
  const staff = useAllStaff(can('identity.users.list') && can('rbac.roles.assignments.read'));
  const [editing, setEditing] = useState(false);
  const allRoles = useAllRoles(!!user?.is_superuser);
  const [parentId, setParentId] = useState('');
  const [parentBusy, setParentBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const isSuper = !!user?.is_superuser;
  /** تخصیص گروهی (2026-10-27): مجوز ساخت تخصیص + دیدن فهرست کارکنان برای جدول انتخابی. */
  const canBulk = can('rbac.roles.assignments.create') && can('identity.users.list');

  if (role.isLoading) return <SkeletonRows rows={5} height={80} />;
  if (role.error || !role.data) return <ErrorBox error={role.error} onRetry={() => role.refetch()} />;
  const r = role.data;

  const setActive = async (v: boolean) => {
    try {
      await adminApi(`/rbac/roles/${id}`, { method: 'PATCH', body: { is_active: v } });
      toast(v ? 'نقش فعال شد.' : 'نقش غیرفعال شد.');
      await qc.invalidateQueries({ queryKey: ['rbac'] });
    } catch (e) {
      toast(userMessage(e), 'error');
    }
  };

  return (
    <>
      <PageHead back={back} title={r.name}
        actions={isSuper ? <Button icon={<IconEdit size={17} />} onClick={() => setEditing(true)}>ویرایش نقش</Button> : null} />
      <div className={u.stack}>
        <Card>
          <div className={u.kvGrid3}>
            <KeyValue label="کد نقش" ltr>{r.code}</KeyValue>
            <KeyValue label="دپارتمان">{r.department}</KeyValue>
            <KeyValue label="سطح">{faNum(r.level)}</KeyValue>
            <KeyValue label="نوع"><Badge tone={r.is_system ? 'info' : 'neutral'}>{r.is_system ? 'سیستمی' : 'سفارشی'}</Badge></KeyValue>
            <KeyValue label="تاریخ تعریف">{faDate(r.created_at)}</KeyValue>
            <KeyValue label="وضعیت">
              {isSuper ? <Toggle checked={r.is_active} onChange={setActive} label={r.is_active ? 'فعال' : 'غیرفعال'} /> : <Badge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'فعال' : 'غیرفعال'}</Badge>}
            </KeyValue>
          </div>
          {r.description ? <div style={{ marginTop: 18 }}><KeyValue label="توضیحات">{r.description}</KeyValue></div> : null}
        </Card>

        {isSuper ? (
          <Card>
            <SectionTitle>ارث‌بری از نقش دیگر</SectionTitle>
            <p className={u.sub} style={{ marginBottom: 14 }}>با افزودن نقش والد، همه‌ی مجوزهای آن نقش به این نقش هم می‌رسد (در ماتریس پایین با رنگ آبی). فقط سوپر ادمین ارث‌بری را تعیین می‌کند.</p>
            <div className={s.inline}>
              <div className={s.inlineField}>
                <Select label="نقش والد" value={parentId} onChange={(e) => setParentId(e.target.value)} placeholder="انتخاب نقش"
                  options={(allRoles.data ?? []).filter((x) => x.id !== r.id && x.is_active).map((x) => ({ value: x.id, label: x.name }))} />
              </div>
              <Button icon={<IconGitMerge size={17} />} disabled={!parentId} loading={parentBusy} onClick={async () => {
                setParentBusy(true);
                try {
                  await adminApi(`/rbac/roles/${id}/parent`, { method: 'POST', body: { parent_role_id: parentId } });
                  toast('نقش والد افزوده شد؛ مجوزهای آن به این نقش رسید.');
                  setParentId('');
                  await qc.invalidateQueries({ queryKey: ['rbac', 'role', id, 'matrix'] });
                } catch (e) { toast(userMessage(e), 'error'); } finally { setParentBusy(false); }
              }}>افزودن والد</Button>
            </div>
            <InfoBanner tone="warning">بک‌اند هنوز فهرست والدهای فعلی و برداشتن والد را ندارد؛ نتیجه‌ی ارث‌بری فقط در ماتریس (رنگ آبی) دیده می‌شود.</InfoBanner>
          </Card>
        ) : null}

        {can('rbac.roles.permissions.read') ? (
          <Card>
            <RoleMatrix roleId={id} isSuper={isSuper} roleActive={r.is_active} />
          </Card>
        ) : null}

        {can('rbac.roles.assignments.read') ? (
          <Card>
            <SectionTitle extra={canBulk ? (
              <Button variant="secondary" size="sm" icon={<IconUsersPlus size={16} />} disabled={!r.is_active}
                data-tip={r.is_active ? undefined : 'نقش غیرفعال است؛ اول آن را فعال کنید'} onClick={() => setBulkOpen(true)}>
                افزودن گروهی کاربران
              </Button>
            ) : null}>کاربران دارای این نقش{asg.data?.length ? <span className={u.sub}> ({faNum(asg.data.length)})</span> : null}</SectionTitle>
            {asg.isLoading ? <SkeletonRows rows={2} /> : asg.error ? <ErrorBox error={asg.error} /> : !asg.data?.length ? <Empty title="هیچ کاربری این نقش را ندارد" /> : (
              <div className={u.list}>
                {asg.data.map((a) => {
                  const p = staff.data?.find((x) => x.id === a.user_id);
                  const name = p ? fullName(p) : 'کاربر';
                  return (
                    <div key={a.id} className={u.listRow} role="link" tabIndex={0} style={{ cursor: can('identity.users.read') ? 'pointer' : undefined }}
                      onClick={() => can('identity.users.read') && navigate(`/identity/users/${a.user_id}`)}>
                      <div><div className={u.strong}>{name}</div><div className={u.sub}>از {faDate(a.assigned_at)}{a.expires_at ? <> · تا {faDate(a.expires_at)}</> : null}</div></div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}
      </div>
      {editing ? <RoleEditModal role={r} onClose={() => setEditing(false)} /> : null}
      {bulkOpen ? <BulkAssignModal role={r} onClose={() => setBulkOpen(false)} /> : null}
    </>
  );
}

function RoleEditModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ name: role.name, department: role.department, level: String(role.level), description: role.description });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!v.name.trim()) return toast('نام نقش الزامی است.', 'error');
    setBusy(true);
    try {
      await adminApi(`/rbac/roles/${role.id}`, { method: 'PATCH', body: { name: v.name.trim(), department: v.department.trim(), level: Number(v.level || 0), description: v.description.trim() } });
      toast('نقش ذخیره شد.');
      await qc.invalidateQueries({ queryKey: ['rbac'] });
      onClose();
    } catch (e) {
      toast(userMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="ویرایش نقش" width={620} footer={<><Button onClick={save} loading={busy}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <FormGrid cols={2}>
        <Input label="نام نقش" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Input label="دپارتمان" value={v.department} onChange={(e) => setV({ ...v, department: e.target.value })} />
        <Input latin label="سطح" value={v.level} onChange={(e) => setV({ ...v, level: e.target.value.replace(/[^0-9]/g, '') })} dir="ltr" />
        <div />
        <Textarea label="توضیحات" span={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </FormGrid>
    </Modal>
  );
}

