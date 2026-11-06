import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconBan, IconCircleCheck, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Textarea, Toggle } from '@/shared/ui/form';
import { Badge, Card, Empty, InfoBanner, Modal, PageHead, Pagination } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { invalidateBundlePolicies, useBundlePolicies, type BundlePolicy } from './api';
import { ConfirmModal, IconBtn, NO_ERRORS, parseErrors, type FormErrors } from './ui';
import s from './settings.module.css';

const STATUS = [{ value: 'true', label: 'فعال' }, { value: 'false', label: 'غیرفعال' }];

/**
 * سیاست‌های باندل (`/settings/bundle-policies`): هر باندل یکی از این سیاست‌ها را دارد (کد آن در باندل ذخیره می‌شود).
 * کد بعد از ثبت تغییرناپذیر؛ سیاست استفاده‌شده حذف نمی‌شود (فقط غیرفعال)؛ سیاست غیرفعال برای باندل تازه پیشنهاد نمی‌شود.
 */
export default function BundlePoliciesPage() {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const lp = useListParams();
  const search = useSearchState(lp);
  const active = lp.get('active');
  const list = useBundlePolicies({ page: lp.page, page_size: lp.pageSize, query: lp.q || undefined, is_active: active ? active === 'true' : undefined });
  const [edit, setEdit] = useState<BundlePolicy | 'new' | null>(null);
  const [del, setDel] = useState<BundlePolicy | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canUpdate = can('settings.bundle_policies.update');
  const canDelete = can('settings.bundle_policies.delete');

  const setActive = async (p: BundlePolicy, on: boolean) => {
    setBusyId(p.id);
    try { await adminApi(`/settings/bundle-policies/${p.id}`, { method: 'PATCH', body: { is_active: on } }); toast(on ? `سیاست «${p.name}» فعال شد.` : `سیاست «${p.name}» غیرفعال شد.`); }
    catch (e) { toast(userMessage(e), 'error'); } finally { setBusyId(null); await invalidateBundlePolicies(qc); }
  };

  const cols: Column<BundlePolicy>[] = [
    { key: 'code', header: 'کد', code: true, render: (p) => <span className="ltr" data-latin="">{p.code}</span> },
    { key: 'name', header: 'نام', render: (p) => <span className={s.strong}>{p.name}</span> },
    { key: 'desc', header: 'توضیح', render: (p) => <span className={s.desc} data-tip={p.description || ''}>{p.description || '—'}</span> },
    { key: 'order', header: 'ترتیب نمایش', render: (p) => faNum(p.sort_order) },
    { key: 'use', header: 'استفاده', render: (p) => (p.usage_count ? p.usage_text || `${faNum(p.usage_count)} باندل` : <span className={s.muted}>بدون استفاده</span>) },
    { key: 'st', header: 'وضعیت', render: (p) => <Badge tone={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'فعال' : 'غیرفعال'}</Badge> },
    ...(canUpdate || canDelete ? [{
      key: 'act', header: 'عملیات', render: (p: BundlePolicy) => (
        <span className={s.acts}>
          {canUpdate ? <IconBtn label={`ویرایش ${p.name}`} onClick={() => setEdit(p)}><IconPencil size={16} /></IconBtn> : null}
          {canUpdate ? (p.is_active
            ? <IconBtn label={`غیرفعال کردن ${p.name}`} tip="غیرفعال کردن" disabled={busyId === p.id} onClick={() => setActive(p, false)}><IconBan size={16} /></IconBtn>
            : <IconBtn label={`فعال کردن ${p.name}`} tip="فعال کردن" disabled={busyId === p.id} onClick={() => setActive(p, true)}><IconCircleCheck size={16} /></IconBtn>) : null}
          {canDelete ? <IconBtn danger label={`حذف ${p.name}`} tip={p.can_delete ? 'حذف' : `در ${p.usage_text || 'باندل‌ها'} استفاده شده و حذف نمی‌شود؛ غیرفعالش کنید.`} disabled={!p.can_delete} onClick={() => setDel(p)}><IconTrash size={16} /></IconBtn> : null}
        </span>
      ),
    }] : []),
  ];

  return (
    <>
      <PageHead title="سیاست‌های باندل" sub="هدف فروش هر باندل (مثلاً «ست هدیه» یا «حراج فصل»)؛ هنگام تعریف باندل یکی از سیاست‌های فعال انتخاب می‌شود."
        actions={can('settings.bundle_policies.create') ? <Button icon={<IconPlus size={17} />} onClick={() => setEdit('new')}>سیاست جدید</Button> : null} />
      <Card>
        <TableFilters search={search.text} onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }} placeholder="جست‌وجو: کد یا نام سیاست"
          count={list.data ? `${faNum(list.data.total)} سیاست` : undefined}
          filters={[{ key: 'active', label: 'وضعیت', value: active, onChange: lp.setFilter('active'), options: STATUS }]} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(p) => p.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={lp.q || active ? 'سیاستی با این جست‌وجو و فیلتر پیدا نشد' : 'هنوز سیاستی تعریف نشده است'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {edit ? <PolicyModal policy={edit === 'new' ? null : edit} onClose={() => setEdit(null)} /> : null}
      {del ? (
        <ConfirmModal title="حذف سیاست باندل" confirmLabel="حذف سیاست" onClose={() => setDel(null)}
          text={<>سیاست «<b>{del.name}</b>» برای همیشه حذف می‌شود و قابل بازگشت نیست.</>}
          onConfirm={async () => { await adminApi(`/settings/bundle-policies/${del.id}`, { method: 'DELETE' }); toast(`سیاست «${del.name}» حذف شد.`); await invalidateBundlePolicies(qc); }} />
      ) : null}
    </>
  );
}

function PolicyModal({ policy, onClose }: { policy: BundlePolicy | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ code: policy?.code ?? '', name: policy?.name ?? '', description: policy?.description ?? '', sort_order: String(policy?.sort_order ?? 0), is_active: policy?.is_active ?? true });
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const e: Record<string, string> = {};
    if (!policy && !/^[A-Z][A-Z0-9_]*$/.test(v.code)) e.code = 'با حرف بزرگ لاتین شروع شود؛ فقط حروف بزرگ لاتین، رقم و _.';
    if (!v.name.trim()) e.name = 'نام الزامی است.';
    if (Object.keys(e).length) { setErrs({ fields: e, general: [] }); return; }
    const sort = Number(v.sort_order || 0);
    setBusy(true); setErrs(NO_ERRORS);
    try {
      if (policy) {
        const body: Record<string, unknown> = {};
        if (v.name.trim() !== policy.name) body.name = v.name.trim();
        if (v.description !== policy.description) body.description = v.description;
        if (sort !== policy.sort_order) body.sort_order = sort;
        if (v.is_active !== policy.is_active) body.is_active = v.is_active;
        if (Object.keys(body).length) await adminApi(`/settings/bundle-policies/${policy.id}`, { method: 'PATCH', body });
      } else {
        await adminApi('/settings/bundle-policies', { method: 'POST', body: { code: v.code, name: v.name.trim(), description: v.description, sort_order: sort, is_active: v.is_active } });
      }
      toast(policy ? 'سیاست باندل ذخیره شد.' : 'سیاست باندل تعریف شد.');
      await invalidateBundlePolicies(qc); onClose();
    } catch (err) { setErrs(parseErrors(err, ['code', 'name', 'description', 'sort_order', 'is_active'])); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={policy ? `ویرایش سیاست «${policy.name}»` : 'سیاست باندل جدید'} width={600}
      footer={<><Button onClick={save} loading={busy}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.modalBody}>
        {errs.general.length ? <InfoBanner tone="warning">{errs.general.join(' ')}</InfoBanner> : null}
        {policy && policy.usage_count && !v.is_active && policy.is_active ? <InfoBanner>باندل‌هایی که این سیاست را دارند آن را نگه می‌دارند؛ فقط برای باندل تازه پیشنهاد نمی‌شود.</InfoBanner> : null}
        <FormGrid cols={2}>
          <Input latin label="کد" required={!policy} value={v.code} disabled={!!policy} dir="ltr" maxLength={30} placeholder="GIFT_SET" error={errs.fields.code || undefined}
            hint={policy ? 'کد تغییرناپذیر است.' : 'حروف بزرگ لاتین، رقم و _؛ بعد از ثبت قابل تغییر نیست.'} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
          <Input label="نام" required value={v.name} maxLength={100} error={errs.fields.name || undefined} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <Textarea label="توضیح" span={2} value={v.description} maxLength={2000} error={errs.fields.description || undefined} onChange={(e) => setV({ ...v, description: e.target.value })} />
          <Input label="ترتیب نمایش" value={toFaDigits(v.sort_order)} inputMode="numeric" error={errs.fields.sort_order || undefined} hint="عدد کوچک‌تر بالاتر نمایش داده می‌شود."
            onChange={(e) => setV({ ...v, sort_order: toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 5) })} />
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 10 }}>
            <Toggle checked={v.is_active} onChange={(x) => setV({ ...v, is_active: x })} label={v.is_active ? 'فعال' : 'غیرفعال'} />
          </div>
        </FormGrid>
      </div>
    </Modal>
  );
}
