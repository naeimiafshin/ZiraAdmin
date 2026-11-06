import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconBan, IconCircleCheck, IconPencil, IconPlus, IconRuler, IconRulerMeasure, IconStack2, IconTrash } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Select } from '@/shared/ui/form';
import { Badge, Card, Empty, InfoBanner, Modal, PageHead, Pagination, Segmented } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { invalidateUnits, useAllUnits, useUnits, type Unit } from './api';
import { ConfirmModal, IconBtn, NO_ERRORS, parseErrors, Stat, type FormErrors } from './ui';
import s from './settings.module.css';

type Kind = 'MAIN' | 'SUB';
const KINDS: { value: Kind; label: string }[] = [{ value: 'MAIN', label: 'واحدهای اصلی' }, { value: 'SUB', label: 'واحدهای فرعی' }];
const STATUS = [{ value: 'true', label: 'فعال' }, { value: 'false', label: 'غیرفعال' }];

/** دلیل خاموش بودن «غیرفعال کردن» / «حذف» (قواعد بک‌اند: واحد در حال استفاده یا واحد اصلی دارای واحد فرعی) */
const blockReason = (u: Unit, action: 'deactivate' | 'delete') => {
  if (u.usage_count) return `این واحد در ${u.usage_text || `${faNum(u.usage_count)} مورد`} استفاده شده است.`;
  if (u.kind === 'MAIN' && u.sub_unit_count) return action === 'delete' ? 'اول واحدهای فرعی این واحد را حذف کنید.' : 'اول واحدهای فرعی فعال این واحد را غیرفعال کنید.';
  return '';
};

/**
 * تعریف واحد (`/settings/units`): دو بخش «واحدهای اصلی» (کوچک‌ترین واحد، ضریب ۱) و «واحدهای فرعی» (ضریب صحیح ≥ ۲ از یک واحد اصلی فعال).
 * کد، واحد اصلی و ضریب بعد از ثبت تغییرناپذیرند؛ واحد در حال استفاده غیرفعال یا حذف نمی‌شود؛ واحد بی‌استفاده واقعاً حذف می‌شود.
 */
export default function UnitsPage() {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const lp = useListParams();
  const search = useSearchState(lp);
  const kind: Kind = lp.tab === 'SUB' ? 'SUB' : 'MAIN';
  const active = lp.get('active');
  const base = lp.get('base');
  const factor = lp.get('factor');
  const list = useUnits({
    kind, page: lp.page, page_size: lp.pageSize, query: lp.q || undefined,
    is_active: active ? active === 'true' : undefined,
    base_unit_id: kind === 'SUB' && base ? base : undefined, factor: kind === 'SUB' && factor ? Number(factor) : undefined,
  });
  const mains = useAllUnits('MAIN');
  const subs = useAllUnits('SUB');
  const [edit, setEdit] = useState<Unit | null>(null);
  const [del, setDel] = useState<Unit | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canUpdate = can('settings.units.update');
  const canDelete = can('settings.units.delete');
  const all = [...(mains.data ?? []), ...(subs.data ?? [])];

  const setActive = async (u: Unit, on: boolean) => {
    setBusyId(u.id);
    try {
      await adminApi(`/settings/units/${u.id}`, { method: 'PATCH', body: { is_active: on } });
      toast(on ? `واحد «${u.name}» فعال شد.` : `واحد «${u.name}» غیرفعال شد.`);
    } catch (e) { toast(userMessage(e), 'error'); } finally { setBusyId(null); await invalidateUnits(qc); }
  };

  const cols: Column<Unit>[] = [
    { key: 'code', header: 'کد', code: true, render: (u) => <span className="ltr" data-latin="">{u.code}</span> },
    { key: 'name', header: 'نام', render: (u) => <span className={s.strong}>{u.name}</span> },
    ...(kind === 'SUB' ? [{ key: 'eq', header: 'معادل', render: (u: Unit) => <span>{faNum(u.factor)} × {u.base_unit_name ?? '—'}</span> }] : []),
    { key: 'tax', header: 'کد مودیان', code: true, render: (u) => (u.tax_unit_code ? <span className="ltr" data-latin="">{u.tax_unit_code}</span> : '—') },
    ...(kind === 'MAIN' ? [{ key: 'subs', header: 'واحد فرعی', render: (u: Unit) => (u.sub_unit_count ? faNum(u.sub_unit_count) : '—') }] : []),
    { key: 'use', header: 'استفاده', render: (u) => (u.usage_count ? u.usage_text || faNum(u.usage_count) : <span className={s.muted}>بدون استفاده</span>) },
    { key: 'st', header: 'وضعیت', render: (u) => <Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'فعال' : 'غیرفعال'}</Badge> },
    ...(canUpdate || canDelete ? [{
      key: 'act', header: 'عملیات', render: (u: Unit) => {
        const offWhy = blockReason(u, 'deactivate');
        const delWhy = blockReason(u, 'delete');
        return (
          <span className={s.acts}>
            {canUpdate ? <IconBtn label={`ویرایش ${u.name}`} onClick={() => setEdit(u)}><IconPencil size={16} /></IconBtn> : null}
            {canUpdate && u.is_active && canDelete ? (
              <IconBtn label={`غیرفعال کردن ${u.name}`} tip={u.can_deactivate ? 'غیرفعال کردن' : offWhy} disabled={!u.can_deactivate || busyId === u.id} onClick={() => setActive(u, false)}><IconBan size={16} /></IconBtn>
            ) : null}
            {canUpdate && !u.is_active ? <IconBtn label={`فعال کردن ${u.name}`} tip="فعال کردن" disabled={busyId === u.id} onClick={() => setActive(u, true)}><IconCircleCheck size={16} /></IconBtn> : null}
            {canDelete ? <IconBtn danger label={`حذف ${u.name}`} tip={u.can_delete ? 'حذف' : delWhy} disabled={!u.can_delete} onClick={() => setDel(u)}><IconTrash size={16} /></IconBtn> : null}
          </span>
        );
      },
    }] : []),
  ];

  const factors = [...new Set((subs.data ?? []).map((u) => u.factor))].sort((a, b) => a - b);
  const filtered = !!(lp.q || active || (kind === 'SUB' && (base || factor)));

  return (
    <>
      <PageHead title="تعریف واحد" sub="واحد اصلی کوچک‌ترین واحد است (عدد، جفت، متر، کیلوگرم)؛ واحد فرعی ضریبی صحیح از یک واحد اصلی است (پک ۶ عددی = ۶ × عدد)." />
      <div className={s.stats}>
        <Stat icon={<IconRuler size={20} />} label="واحد اصلی" value={mains.data?.length} />
        <Stat icon={<IconStack2 size={20} />} label="واحد فرعی" value={subs.data?.length} tone="success" />
        <Stat icon={<IconRulerMeasure size={20} />} label="در حال استفاده" value={mains.data && subs.data ? all.filter((u) => u.usage_count).length : undefined} tone="warning" />
        <Stat icon={<IconBan size={20} />} label="غیرفعال" value={mains.data && subs.data ? all.filter((u) => !u.is_active).length : undefined} tone="neutral" />
      </div>
      <Card>
        <div className={s.tabsRow}>
          <Segmented value={kind} onChange={(v) => lp.set({ tab: v === 'MAIN' ? null : v, base: null, factor: null })}
            options={KINDS.map((k) => ({ value: k.value, label: <>{k.label} <span className={s.muted}>({faNum((k.value === 'MAIN' ? mains.data : subs.data)?.length ?? 0)})</span></> }))} />
          <span className={s.muted}>{kind === 'MAIN' ? 'کالای تکی همیشه با یک واحد اصلی تعریف می‌شود.' : 'آیتم N کالایی خودکار واحد فرعی «N × واحد کالاها» را می‌گیرد.'}</span>
        </div>
        {can('settings.units.create') ? <CreateForm kind={kind} mains={(mains.data ?? []).filter((m) => m.is_active)} /> : null}
        <TableFilters search={search.text} onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }} placeholder="جست‌وجو: کد یا نام واحد"
          count={list.data ? `${faNum(list.data.total)} واحد` : undefined}
          filters={[
            { key: 'active', label: 'وضعیت', value: active, onChange: lp.setFilter('active'), options: STATUS },
            ...(kind === 'SUB' ? [
              { key: 'base', label: 'واحد اصلی', value: base, onChange: lp.setFilter('base'), options: (mains.data ?? []).map((m) => ({ value: m.id, label: m.name })) },
              { key: 'factor', label: 'ضریب', value: factor, onChange: lp.setFilter('factor'), options: factors.map((f) => ({ value: String(f), label: faNum(f) })) },
            ] : []),
          ]} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(u) => u.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={filtered ? 'واحدی با این جست‌وجو و فیلترها پیدا نشد' : kind === 'MAIN' ? 'هنوز واحد اصلی تعریف نشده است' : 'هنوز واحد فرعی تعریف نشده است'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {edit ? <EditModal unit={edit} onClose={() => setEdit(null)} /> : null}
      {del ? (
        <ConfirmModal title="حذف واحد" confirmLabel="حذف واحد" onClose={() => setDel(null)}
          text={<>واحد «<b>{del.name}</b>» (<span className="ltr" data-latin="">{del.code}</span>) برای همیشه حذف می‌شود و قابل بازگشت نیست. اگر فقط نمی‌خواهید در فرم‌ها پیشنهاد شود، آن را غیرفعال کنید.</>}
          onConfirm={async () => { await adminApi(`/settings/units/${del.id}`, { method: 'DELETE' }); toast(`واحد «${del.name}» حذف شد.`); await invalidateUnits(qc); }} />
      ) : null}
    </>
  );
}

/** فرم درون‌خطی ساخت واحد (RULES ۳-۵): فیلدها و دکمه در یک ردیف، هم‌قد و هم‌تراز پایین */
function CreateForm({ kind, mains }: { kind: Kind; mains: Unit[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const empty = { code: '', name: '', tax_unit_code: '', base_unit_id: '', factor: '' };
  const [v, setV] = useState(empty);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty, x: string) => { setV({ ...v, [k]: x }); if (errs.fields[k]) setErrs({ ...errs, fields: { ...errs.fields, [k]: '' } }); };
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!v.code) e.code = 'کد الزامی است.';
    if (!v.name.trim()) e.name = 'نام الزامی است.';
    if (kind === 'SUB' && !v.base_unit_id) e.base_unit_id = 'واحد اصلی را انتخاب کنید.';
    if (kind === 'SUB' && !(Number(v.factor) >= 2)) e.factor = 'عدد صحیح ۲ یا بیشتر.';
    if (Object.keys(e).length) { setErrs({ fields: e, general: [] }); return; }
    setBusy(true); setErrs(NO_ERRORS);
    try {
      await adminApi('/settings/units', {
        method: 'POST',
        body: { code: v.code, name: v.name.trim(), tax_unit_code: v.tax_unit_code || null, ...(kind === 'SUB' ? { base_unit_id: v.base_unit_id, factor: Number(v.factor) } : {}) },
      });
      toast(`واحد «${v.name.trim()}» تعریف شد.`);
      setV(empty);
      await invalidateUnits(qc);
    } catch (err) {
      const p = parseErrors(err, Object.keys(empty)); setErrs(p); if (p.general.length) toast(p.general[0]!, 'error');
    } finally { setBusy(false); }
  };
  const base = mains.find((m) => m.id === v.base_unit_id);
  const eq = kind === 'SUB' && base && Number(v.factor) >= 2 ? ` هر «${v.name.trim() || 'واحد فرعی'}» = ${faNum(Number(v.factor))} ${base.name}.` : '';
  return (
    <>
      {kind === 'SUB' && mains.length === 0 ? <InfoBanner tone="warning">برای تعریف واحد فرعی، اول یک واحد اصلی فعال تعریف کنید.</InfoBanner> : null}
      <div className={s.inline}>
        {kind === 'SUB' ? (
          <>
            <Select label="واحد اصلی" required value={v.base_unit_id} placeholder="انتخاب کنید" error={errs.fields.base_unit_id || undefined}
              options={mains.map((m) => ({ value: m.id, label: m.name }))} onChange={(e) => set('base_unit_id', e.target.value)} />
            <div className={s.inlineNarrow}>
              <Input label="ضریب" required value={v.factor} inputMode="numeric" placeholder="مثلاً ۶" error={errs.fields.factor || undefined}
                onChange={(e) => set('factor', toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 7))} />
            </div>
          </>
        ) : null}
        <Input label="نام" required value={v.name} maxLength={50} placeholder={kind === 'MAIN' ? 'مثلاً عدد' : 'مثلاً پک ۶ عددی'} error={errs.fields.name || undefined} onChange={(e) => set('name', e.target.value)} />
        <Input latin label="کد" required value={v.code} maxLength={20} dir="ltr" placeholder={kind === 'MAIN' ? 'PCS' : 'PCS6'} error={errs.fields.code || undefined}
          onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} />
        <div className={s.inlineNarrow}>
          <Input latin label="کد مودیان" value={v.tax_unit_code} maxLength={10} dir="ltr" placeholder="اختیاری" error={errs.fields.tax_unit_code || undefined}
            onChange={(e) => set('tax_unit_code', toLatinDigits(e.target.value).replace(/\D/g, ''))} />
        </div>
        <Button className={s.inlineBtn} icon={<IconPlus size={17} />} loading={busy} onClick={submit} disabled={kind === 'SUB' && mains.length === 0}>
          {kind === 'MAIN' ? 'افزودن واحد اصلی' : 'افزودن واحد فرعی'}
        </Button>
      </div>
      <div className={s.formNote}>کد: حروف بزرگ لاتین، رقم، - و _؛ کد{kind === 'SUB' ? '، واحد اصلی و ضریب' : ''} بعد از ثبت تغییرناپذیر است.{eq}</div>
    </>
  );
}

/** ویرایش واحد: فقط نام و کد مودیان (کد، نوع، واحد اصلی و ضریب تغییرناپذیرند) */
function EditModal({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ name: unit.name, tax_unit_code: unit.tax_unit_code ?? '' });
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!v.name.trim()) { setErrs({ fields: { name: 'نام الزامی است.' }, general: [] }); return; }
    const body: Record<string, string> = {};
    if (v.name.trim() !== unit.name) body.name = v.name.trim();
    if (v.tax_unit_code !== (unit.tax_unit_code ?? '')) body.tax_unit_code = v.tax_unit_code;
    if (!Object.keys(body).length) { onClose(); return; }
    setBusy(true); setErrs(NO_ERRORS);
    try {
      await adminApi(`/settings/units/${unit.id}`, { method: 'PATCH', body });
      toast('واحد ذخیره شد.'); await invalidateUnits(qc); onClose();
    } catch (e) { setErrs(parseErrors(e, ['name', 'tax_unit_code'])); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`ویرایش واحد «${unit.name}»`} width={600}
      footer={<><Button onClick={save} loading={busy}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.modalBody}>
        {errs.general.length ? <InfoBanner tone="warning">{errs.general.join(' ')}</InfoBanner> : null}
        <FormGrid cols={2}>
          <Input latin label="کد" value={unit.code} disabled dir="ltr" hint="تغییرناپذیر" />
          <Input label="نوع" value={unit.kind === 'MAIN' ? 'واحد اصلی' : `واحد فرعی — ${faNum(unit.factor)} × ${unit.base_unit_name ?? ''}`} disabled hint="نوع، واحد اصلی و ضریب تغییرناپذیرند" />
          <Input label="نام" required value={v.name} maxLength={50} error={errs.fields.name || undefined} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <Input latin label="کد واحد سامانه‌ی مودیان" value={v.tax_unit_code} maxLength={10} dir="ltr" placeholder="اختیاری؛ خالی = پاک کردن" error={errs.fields.tax_unit_code || undefined}
            onChange={(e) => setV({ ...v, tax_unit_code: toLatinDigits(e.target.value).replace(/\D/g, '') })} />
        </FormGrid>
      </div>
    </Modal>
  );
}
