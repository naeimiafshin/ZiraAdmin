import { useEffect, useState } from 'react';
import { IconBan, IconCircleCheck, IconListDetails, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select, Textarea, Toggle } from '@/shared/ui/form';
import { Badge, Card, Empty, ErrorBox, Modal, Pagination, SkeletonRows, UnderlineTabs } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAttributes, useAttributeWrite, type Attribute, type AttributeIn, type AttributeValueIn } from './api';
import { ConfirmModal, IconButton, RoleBadge, Swatch } from './components';
import { ATTR_CONTROL, ATTR_KIND, ATTR_ROLE, CREATABLE_KINDS, CREATABLE_ROLES, KINDS_REQUIRE_VALUES, KINDS_WITH_VALUES, SYSTEM_KEY } from './labels';
import { ColorsTab, SetsTab, SizesTab } from './BaseValuesTabs';
import s from './catalog.module.css';

type Tab = 'attributes' | 'sizes' | 'colors' | 'sets';
const TABS: { value: Tab; label: string }[] = [
  { value: 'attributes', label: 'ویژگی‌ها' }, { value: 'sizes', label: 'سایزها' }, { value: 'colors', label: 'رنگ‌ها' }, { value: 'sets', label: 'مجموعه‌های سایز و رنگ' },
];
const PAGE = 12;

/**
 * ویژگی‌ها و متغیرها — یک صفحه با چهار تب (تصمیم افشین 2026-10-22، گزینه‌ی الف؛ همه با مجوز catalog.attributes):
 * ویژگی‌ها (کارت‌ها مثل html Fixed V2) | سایزها | رنگ‌ها | مجموعه‌های سایز و رنگ. تب و فیلترها در URL.
 * قواعد بک‌اند: نقش و نوع بعد از ساخت تغییر نمی‌کند (۴۲۲)؛ مقدار استفاده‌شده حذف نمی‌شود (۴۰۹)؛ ویژگی سیستمی (جنس، مدل) حذف نمی‌شود.
 */
export default function AttributesPage() {
  const lp = useListParams({ page_size: PAGE });
  const tab = (TABS.some((t) => t.value === lp.tab) ? lp.tab : 'attributes') as Tab;
  return (
    <>
      <div className={s.tabsRow}><UnderlineTabs value={tab} onChange={(t) => lp.set({ tab: t, query: null, page: null })} options={TABS} /></div>
      {tab === 'attributes' ? <AttributesTab /> : tab === 'sizes' ? <SizesTab /> : tab === 'colors' ? <ColorsTab /> : <SetsTab />}
    </>
  );
}

function AttributesTab() {
  const can = usePerm();
  const lp = useListParams({ page_size: PAGE });
  const { text, setText, dq } = useSearchState(lp);
  const params = { page: lp.page, page_size: lp.pageSize, query: dq || undefined, role: lp.get('role') || undefined, kind: lp.get('kind') || undefined, is_active: lp.get('active') ? lp.get('active') === 'yes' : undefined };
  const list = useAttributes(params);
  const w = useAttributeWrite();
  const toast = useToast();
  const [editing, setEditing] = useState<Attribute | 'new' | null>(null);
  const [values, setValues] = useState<Attribute | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'deactivate' | 'delete'; a: Attribute } | null>(null);
  const filters: FilterDef[] = [
    { key: 'role', label: 'نقش', value: lp.get('role'), onChange: lp.setFilter('role'), options: Object.entries(ATTR_ROLE).map(([value, v]) => ({ value, label: v.label })) },
    { key: 'kind', label: 'نوع', value: lp.get('kind'), onChange: lp.setFilter('kind'), options: Object.entries(ATTR_KIND).map(([value, label]) => ({ value, label })) },
    { key: 'active', label: 'وضعیت', value: lp.get('active'), onChange: lp.setFilter('active'), options: [{ value: 'yes', label: 'فعال' }, { value: 'no', label: 'غیرفعال' }] },
  ];
  const active = !!dq || !!lp.get('role') || !!lp.get('kind') || !!lp.get('active');
  return (
    <>
      <Card>
        <p className={s.intro}>همه‌ی مشخصات کالا به‌جز دسته‌بندی، برند و واحد این‌جا تعریف می‌شود: سایز و رنگ در تب‌های خودشان (ابعاد ماتریس)، جنس و مدل (نام کالا) و ویژگی‌های آیتم و توصیفی این‌جا. مقادیر همین ویژگی‌ها در «تعریف ماتریسی کالا» و «ساخت آیتم» انتخاب می‌شوند.</p>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: نام یا کد ویژگی" filters={filters} count={list.data ? `${faNum(list.data.total)} ویژگی` : undefined}
          extra={can('catalog.attributes.create') ? <Button icon={<IconPlus size={17} />} onClick={() => setEditing('new')}>ویژگی جدید</Button> : null} />
        {list.isLoading ? <SkeletonRows rows={3} height={170} /> : list.error ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : !list.data?.results.length ? (
          <Empty title={active ? 'ویژگی‌ای با این شرایط پیدا نشد' : 'هنوز ویژگی‌ای تعریف نشده است'} text={active ? undefined : 'با «ویژگی جدید» اولین ویژگی را بسازید. سایز و رنگ در تب‌های خودشان تعریف می‌شوند.'} />
        ) : (
          <div className={s.attrGrid}>
            {list.data.results.map((a) => (
              <article key={a.id} className={`${s.attrCard} ${a.is_active ? '' : s.attrCardOff}`}>
                <div className={s.attrHead}>
                  <div>
                    <div className={s.attrName}>{a.name}{a.system_key ? <span className={s.sub}> ویژگی سیستمی ({SYSTEM_KEY[a.system_key] ?? a.system_key})</span> : null}</div>
                    <div className={s.attrHint}>{a.hint || ATTR_ROLE[a.role]?.hint}</div>
                  </div>
                  <span style={{ display: 'inline-flex', gap: 4 }}>{!a.is_active ? <Badge tone="danger">غیرفعال</Badge> : null}<RoleBadge role={a.role} /></span>
                </div>
                <div className={s.attrMeta}>
                  <span>نوع: <b>{ATTR_KIND[a.kind] ?? a.kind}</b></span>
                  <span>کنترل: <b>{ATTR_CONTROL[a.input_control] ?? a.input_control}</b></span>
                  {KINDS_WITH_VALUES.has(a.kind) ? <span className={s.attrCount}>{faNum(a.values.length)} مقدار</span> : null}
                  {a.is_required ? <span>الزامی</span> : null}
                  {!a.show_in_public ? <span>پنهان در سایت</span> : null}
                </div>
                <div className={s.chips}>
                  {a.values.slice(0, 8).map((v) => <span key={v.id} className={s.chip}><Swatch hex={v.hex_code} />{v.value}</span>)}
                  {a.values.length > 8 ? <span className={`${s.chip} ${s.chipMore}`} data-tip={a.values.slice(8).map((v) => v.value).join('، ')}>+{faNum(a.values.length - 8)}</span> : null}
                  {KINDS_WITH_VALUES.has(a.kind) && a.values.length === 0 ? <span className={s.muted}>{a.kind === 'TEXT_SUGGEST' ? 'بدون مقدار پیشنهادی؛ کاربر متن آزاد می‌نویسد' : 'هنوز مقداری ندارد'}</span> : null}
                  {!KINDS_WITH_VALUES.has(a.kind) ? <span className={s.muted}>{a.kind === 'NUMBER' ? 'ورودی عددی آزاد' : a.kind === 'BOOL' ? 'بله / خیر' : 'بدون مقدار از پیش‌تعریف‌شده'}</span> : null}
                </div>
                <div className={s.attrFoot}>
                  {KINDS_WITH_VALUES.has(a.kind) && can('catalog.attributes.update') ? <Button variant="secondary" size="sm" icon={<IconListDetails size={15} />} onClick={() => setValues(a)}>مدیریت مقادیر</Button> : <span />}
                  <span className={s.rowActions}>
                    {can('catalog.attributes.update') ? <IconButton label="ویرایش ویژگی" onClick={() => setEditing(a)}><IconPencil size={15} /></IconButton> : null}
                    {can('catalog.attributes.update') ? (a.is_active
                      ? <IconButton label="غیرفعال‌سازی" onClick={() => setConfirm({ kind: 'deactivate', a })}><IconBan size={15} /></IconButton>
                      : <IconButton label="فعال‌سازی" onClick={async () => { try { await w.update.mutateAsync({ id: a.id, body: { is_active: true } }); toast('ویژگی فعال شد.'); } catch (e) { toast(userMessage(e), 'error'); } }}><IconCircleCheck size={15} /></IconButton>) : null}
                    {can('catalog.attributes.delete') && !a.system_key ? <IconButton label="حذف ویژگی" danger onClick={() => setConfirm({ kind: 'delete', a })}><IconTrash size={15} /></IconButton> : null}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
        {list.data && list.data.total > PAGE ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} /> : null}
      </Card>
      {editing ? <AttributeModal a={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {values ? <ValuesModal a={values} onClose={() => setValues(null)} /> : null}
      {confirm?.kind === 'deactivate' ? (
        <ConfirmModal title="غیرفعال‌سازی ویژگی" confirmLabel="غیرفعال کن" onClose={() => setConfirm(null)}
          text={<>ویژگی <b>{confirm.a.name}</b> در فرم‌های تعریف کالا و آیتم دیگر نشان داده نمی‌شود؛ مقدارهای ثبت‌شده روی کالاها می‌مانند.</>}
          onConfirm={async () => { await w.deactivate.mutateAsync(confirm.a.id); toast('ویژگی غیرفعال شد.'); }} />
      ) : null}
      {confirm?.kind === 'delete' ? (
        <ConfirmModal title="حذف ویژگی" confirmLabel="حذف کن" danger onClose={() => setConfirm(null)}
          text={<>ویژگی <b>{confirm.a.name}</b> و همه‌ی مقدارهایش برای همیشه حذف می‌شود. اگر روی کالا یا خانواده‌ای استفاده شده باشد، حذف رد می‌شود و باید غیرفعالش کنید.</>}
          onConfirm={async () => { await w.remove.mutateAsync(confirm.a.id); toast('ویژگی حذف شد.'); }} />
      ) : null}
    </>
  );
}

type ValueRow = { value: string; hex_code: string; id?: string };
/** ویرایشگر مقادیر: ردیف‌های متن (+ رنگ برای سواچ)؛ ترتیب ردیف = sort_order */
function ValuesEditor({ rows, onChange, swatch }: { rows: ValueRow[]; onChange: (r: ValueRow[]) => void; swatch: boolean }) {
  const upd = (i: number, patch: Partial<ValueRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className={s.valuesEditor}>
      {rows.map((r, i) => (
        <div key={i} className={s.valueRow} style={swatch ? undefined : { gridTemplateColumns: '1fr auto' }}>
          <input type="text" value={r.value} onChange={(e) => upd(i, { value: e.target.value })} placeholder={`مقدار ${faNum(i + 1)}`} aria-label={`مقدار ${faNum(i + 1)}`} maxLength={100}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onChange([...rows, { value: '', hex_code: '#cccccc' }]); } }} />
          {swatch ? <input type="color" value={r.hex_code || '#cccccc'} onChange={(e) => upd(i, { hex_code: e.target.value })} aria-label={`رنگ مقدار ${faNum(i + 1)}`} data-tip="رنگ سواچ" /> : null}
          <IconButton label="حذف مقدار" danger onClick={() => onChange(rows.filter((_, j) => j !== i))}><IconTrash size={15} /></IconButton>
        </div>
      ))}
      <div><Button variant="secondary" size="sm" icon={<IconPlus size={15} />} onClick={() => onChange([...rows, { value: '', hex_code: '#cccccc' }])}>افزودن مقدار</Button></div>
    </div>
  );
}
const toValuesIn = (rows: ValueRow[], swatch: boolean): AttributeValueIn[] =>
  rows.filter((r) => r.value.trim()).map((r, i) => ({ value: r.value.trim(), hex_code: swatch ? r.hex_code || null : null, sort_order: i }));

/** تعریف/ویرایش ویژگی. در ویرایش، نقش و نوع فقط نمایش داده می‌شوند (بک‌اند ۴۲۲ می‌دهد). */
function AttributeModal({ a, onClose }: { a: Attribute | null; onClose: () => void }) {
  const w = useAttributeWrite();
  const toast = useToast();
  const [f, setF] = useState<{ code: string; name: string; kind: string; role: string; input_control: string; hint: string; is_required: boolean; is_filterable: boolean; show_in_public: boolean; sort_order: string }>({
    code: a?.code ?? '', name: a?.name ?? '', kind: a?.kind ?? 'SELECT', role: a?.role ?? 'COMMON', input_control: a?.input_control ?? 'DROPDOWN',
    hint: a?.hint ?? '', is_required: a?.is_required ?? false, is_filterable: a?.is_filterable ?? true, show_in_public: a?.show_in_public ?? true, sort_order: String(a?.sort_order ?? 0),
  });
  const [rows, setRows] = useState<ValueRow[]>([{ value: '', hex_code: '#cccccc' }]);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const swatch = f.kind === 'SWATCH';
  // کنترل پیش‌فرض متناسب با نوع (قابل تغییر)
  useEffect(() => {
    if (a) return;
    const def: Record<string, string> = { SELECT: 'DROPDOWN', SWATCH: 'SWATCH', MULTI: 'CHIP_MULTI', TEXT_SUGGEST: 'TEXT_SUGGEST', NUMBER: 'NUMBER', BOOL: 'CHIP_SINGLE' };
    setF((x) => ({ ...x, input_control: def[x.kind] ?? x.input_control }));
  }, [f.kind, a]);
  const busy = w.create.isPending || w.update.isPending;
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'نام ویژگی را وارد کنید.';
    const code = f.code.trim();
    if (code && !/^[a-z][a-z0-9_]*$/.test(code)) e.code = 'کد فقط حروف کوچک لاتین، رقم و زیرخط (با حرف شروع شود).';
    const vals = toValuesIn(rows, swatch);
    if (!a && KINDS_REQUIRE_VALUES.has(f.kind) && vals.length === 0) e.values = 'ویژگی‌های انتخابی، سواچ و چندانتخابی دست‌کم یک مقدار می‌خواهند.';
    setErrs(e); setErr(null);
    if (Object.keys(e).length) return;
    try {
      if (a) {
        const body: Record<string, unknown> = {};
        if (f.name.trim() !== a.name) body.name = f.name.trim();
        if (f.input_control !== a.input_control) body.input_control = f.input_control;
        if (f.hint !== a.hint) body.hint = f.hint;
        (['is_required', 'is_filterable', 'show_in_public'] as const).forEach((k) => { if (f[k] !== a[k]) body[k] = f[k]; });
        if (Number(f.sort_order || 0) !== a.sort_order) body.sort_order = Number(f.sort_order || 0);
        if (Object.keys(body).length) await w.update.mutateAsync({ id: a.id, body });
        toast(`ویژگی «${f.name}» ذخیره شد.`);
      } else {
        const body: AttributeIn = {
          code: code || null, name: f.name.trim(), kind: f.kind as AttributeIn['kind'], role: f.role as AttributeIn['role'], input_control: f.input_control as AttributeIn['input_control'],
          hint: f.hint, is_active: true, is_required: f.is_required, is_filterable: f.is_filterable, show_in_public: f.show_in_public, sort_order: Number(f.sort_order || 0),
          values: KINDS_WITH_VALUES.has(f.kind) && vals.length ? vals : null,
        };
        await w.create.mutateAsync(body);
        toast(`ویژگی «${f.name}» با ${faNum(vals.length)} مقدار تعریف شد.`);
      }
      onClose();
    } catch (ex) { setErr(userMessage(ex)); }
  };
  return (
    <Modal open onClose={onClose} title={a ? 'ویرایش ویژگی' : 'تعریف ویژگی جدید'} width={720}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={busy}>{a ? 'ذخیره‌ی تغییرات' : 'ثبت ویژگی'}</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <Input label="نام ویژگی" required value={f.name} onChange={(e) => { setF((x) => ({ ...x, name: e.target.value })); setErrs((x) => (x.name ? { ...x, name: '' } : x)); }} error={errs.name} placeholder="مثال: جنس پارچه" maxLength={100} />
        {a ? <Input label="کد" latin value={a.code} readOnly dir="ltr" hint="کد بعد از ساخت ثابت است" />
          : <Input label="کد (اختیاری)" latin value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toLowerCase() }))} error={errs.code} dir="ltr" placeholder="material" maxLength={50} hint="خالی ⇐ attr_ + شماره‌ی خودکار" />}
        {a ? <Input label="نقش در تعریف کالا" value={ATTR_ROLE[a.role]?.label ?? a.role} readOnly hint="نقش بعد از ساخت تغییر نمی‌کند؛ برای نقش دیگر ویژگی تازه بسازید" />
          : <Select label="نقش در تعریف کالا" required value={f.role} onChange={(e) => setF((x) => ({ ...x, role: e.target.value }))} options={CREATABLE_ROLES.map((r) => ({ value: r, label: ATTR_ROLE[r]!.label }))} hint={ATTR_ROLE[f.role]?.hint} />}
        {a ? <Input label="نوع ورودی" value={ATTR_KIND[a.kind] ?? a.kind} readOnly hint="نوع بعد از ساخت تغییر نمی‌کند" />
          : <Select label="نوع ورودی" required value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))} options={CREATABLE_KINDS.map((k) => ({ value: k, label: ATTR_KIND[k]! }))} />}
        <Select label="کنترل نمایش در فرم" value={f.input_control} onChange={(e) => setF((x) => ({ ...x, input_control: e.target.value }))} options={Object.entries(ATTR_CONTROL).filter(([k]) => k !== 'AUTO').map(([value, label]) => ({ value, label }))} />
        <Input label="ترتیب نمایش" inputMode="numeric" value={f.sort_order} onChange={(e) => setF((x) => ({ ...x, sort_order: toLatinDigits(e.target.value).replace(/[^0-9]/g, '') }))} />
        <Textarea label="راهنما" span={2} rows={2} value={f.hint} onChange={(e) => setF((x) => ({ ...x, hint: e.target.value }))} placeholder="زیر نام ویژگی و در فرم‌ها نشان داده می‌شود" />
        <div className={s.toggles} style={{ gridColumn: 'span 2' }}>
          <Toggle checked={f.is_required} onChange={(v) => setF((x) => ({ ...x, is_required: v }))} label="الزامی هنگام فعال‌سازی" />
          <Toggle checked={f.is_filterable} onChange={(v) => setF((x) => ({ ...x, is_filterable: v }))} label="فیلتر در فروشگاه" />
          <Toggle checked={f.show_in_public} onChange={(v) => setF((x) => ({ ...x, show_in_public: v }))} label="نمایش در سایت" />
        </div>
        {!a && KINDS_WITH_VALUES.has(f.kind) ? (
          <div style={{ gridColumn: 'span 2' }}>
            <div className={s.segLabel} style={{ marginBottom: 6 }}>مقدارهای از پیش‌تعریف‌شده{KINDS_REQUIRE_VALUES.has(f.kind) ? <span style={{ color: 'var(--danger)' }}> *</span> : <span className={s.sub}> (اختیاری؛ پیشنهاد هنگام تایپ)</span>}</div>
            {errs.values ? <div className={s.formErr}><Alert>{errs.values}</Alert></div> : null}
            <ValuesEditor rows={rows} onChange={(r) => { setRows(r); setErrs((x) => (x.values ? { ...x, values: '' } : x)); }} swatch={swatch} />
          </div>
        ) : null}
        {a && KINDS_WITH_VALUES.has(a.kind) ? <div className={s.sub} style={{ gridColumn: 'span 2' }}>مقدارها از دکمه‌ی «مدیریت مقادیر» روی کارت ویژگی ویرایش می‌شوند.</div> : null}
      </FormGrid>
    </Modal>
  );
}

/** مدیریت مقادیر: جایگزینی کامل (PUT)؛ حذف مقدار استفاده‌شده ⇐ ۴۰۹ همان‌جا نشان داده می‌شود */
function ValuesModal({ a, onClose }: { a: Attribute; onClose: () => void }) {
  const w = useAttributeWrite();
  const toast = useToast();
  const swatch = a.kind === 'SWATCH';
  const [rows, setRows] = useState<ValueRow[]>(() => (a.values.length ? [...a.values].sort((x, y) => x.sort_order - y.sort_order).map((v) => ({ id: v.id, value: v.value, hex_code: v.hex_code ?? '#cccccc' })) : [{ value: '', hex_code: '#cccccc' }]));
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    const vals = toValuesIn(rows, swatch);
    if (KINDS_REQUIRE_VALUES.has(a.kind) && vals.length === 0) { setErr('این نوع ویژگی دست‌کم یک مقدار می‌خواهد.'); return; }
    const names = vals.map((v) => v.value);
    if (new Set(names).size !== names.length) { setErr('مقدار تکراری در فهرست هست.'); return; }
    try { await w.setValues.mutateAsync({ id: a.id, values: vals }); toast(`${faNum(vals.length)} مقدار برای «${a.name}» ذخیره شد.`); onClose(); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`مقادیر «${a.name}»`} width={560}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={w.setValues.isPending}>ذخیره‌ی مقادیر</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <p className={s.sub} style={{ marginTop: 0 }}>ترتیب ردیف‌ها همان ترتیب نمایش است. مقداری که روی کالایی استفاده شده حذف نمی‌شود.</p>
      <ValuesEditor rows={rows} onChange={setRows} swatch={swatch} />
    </Modal>
  );
}
