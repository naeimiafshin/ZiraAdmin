import { useState } from 'react';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Field, FormGrid, Input, Toggle } from '@/shared/ui/form';
import { Badge, Card, Empty, ErrorBox, Modal, Pagination, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllColors, useAllSizes, useColors, useColorSets, useColorWrite, useSetWrite, useSizes, useSizeSets, useSizeWrite, type Color, type ColorSet, type Size, type SizeSet } from './api';
import { ConfirmModal, IconButton, Swatch } from './components';
import s from './catalog.module.css';

const CODE_RE = /^[A-Z0-9-]+$/;
const activeFilter = (lp: ReturnType<typeof useListParams>) => ({ key: 'active', label: 'وضعیت', value: lp.get('active'), onChange: lp.setFilter('active'), options: [{ value: 'yes', label: 'فعال' }, { value: 'no', label: 'غیرفعال' }] });

/** سایزها: فرم درون‌خطی ساخت (کد لاتین ثابت، نام، ترتیب) + جدول با ویرایش/حذف. حذف سایز استفاده‌شده ۴۰۹ ⇐ غیرفعال. */
export function SizesTab() {
  const can = usePerm();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const list = useSizes({ page: lp.page, page_size: lp.pageSize, query: dq || undefined, is_active: lp.get('active') ? lp.get('active') === 'yes' : undefined });
  const w = useSizeWrite();
  const toast = useToast();
  const [f, setF] = useState({ code: '', name: '', sort_order: '' });
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Size | null>(null);
  const [del, setDel] = useState<Size | null>(null);
  const create = async () => {
    setErr(null);
    const code = f.code.trim().toUpperCase();
    if (!code || !CODE_RE.test(code)) { setErr('کد سایز الزامی است: فقط حروف بزرگ لاتین، رقم و خط تیره (مثل XL یا 42).'); return; }
    if (!f.name.trim()) { setErr('نام سایز را وارد کنید.'); return; }
    try { await w.create.mutateAsync({ code, name: f.name.trim(), sort_order: Number(f.sort_order || 0), is_active: true }); toast(`سایز «${f.name.trim()}» ساخته شد.`); setF({ code: '', name: '', sort_order: '' }); } catch (e) { setErr(userMessage(e)); }
  };
  const cols: Column<Size>[] = [
    { key: 'code', header: 'کد', code: true, render: (r) => <span className="ltr" data-latin>{r.code}</span> },
    { key: 'name', header: 'نام', render: (r) => <span className={s.strong}>{r.name}</span> },
    { key: 'order', header: 'ترتیب', render: (r) => <span className="tnum">{faNum(r.sort_order)}</span> },
    { key: 'status', header: 'وضعیت', render: (r) => <Badge tone={r.is_active ? 'success' : 'danger'}>{r.is_active ? 'فعال' : 'غیرفعال'}</Badge> },
    {
      key: 'acts', header: 'عملیات', render: (r) => (
        <span className={s.rowActions}>
          {can('catalog.attributes.update') ? <IconButton label="ویرایش سایز" onClick={() => setEdit(r)}><IconPencil size={15} /></IconButton> : null}
          {can('catalog.attributes.delete') ? <IconButton label="حذف سایز" danger onClick={() => setDel(r)}><IconTrash size={15} /></IconButton> : null}
        </span>
      ),
    },
  ];
  return (
    <div className={s.stack}>
      {can('catalog.attributes.create') ? (
        <Card>
          <SectionTitle extra={<span className={s.sub}>کد در SKU کالا می‌آید و بعد از ثبت تغییر نمی‌کند</span>}>سایز جدید</SectionTitle>
          {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
          <div className={s.inlineForm} style={{ gridTemplateColumns: '1fr 2fr 1fr auto' }}>
            <Input label="کد" required latin value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} dir="ltr" placeholder="XL" maxLength={10} />
            <Input label="نام" required value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="مثال: ایکس لارج" maxLength={30} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
            <Input label="ترتیب" inputMode="numeric" value={f.sort_order} onChange={(e) => setF((x) => ({ ...x, sort_order: toLatinDigits(e.target.value).replace(/[^0-9]/g, '') }))} placeholder="۰" />
            <Button icon={<IconPlus size={17} />} onClick={create} loading={w.create.isPending}>افزودن سایز</Button>
          </div>
        </Card>
      ) : null}
      <Card>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: کد یا نام سایز" filters={[activeFilter(lp)]} count={list.data ? `${faNum(list.data.total)} سایز` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={dq || lp.get('active') ? 'سایزی با این شرایط پیدا نشد' : 'هنوز سایزی تعریف نشده است'} text={dq ? undefined : 'سایزها ابعاد ماتریس کالا هستند؛ با فرم بالا اولین سایز را بسازید.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {edit ? <EditSizeModal r={edit} onClose={() => setEdit(null)} /> : null}
      {del ? <ConfirmModal title="حذف سایز" confirmLabel="حذف کن" danger onClose={() => setDel(null)}
        text={<>سایز <b>{del.name}</b> ({del.code}) حذف می‌شود. اگر روی کالایی استفاده شده باشد حذف رد می‌شود و باید غیرفعالش کنید.</>}
        onConfirm={async () => { await w.remove.mutateAsync(del.id); toast('سایز حذف شد.'); }} /> : null}
    </div>
  );
}

function EditSizeModal({ r, onClose }: { r: Size; onClose: () => void }) {
  const w = useSizeWrite();
  const toast = useToast();
  const [f, setF] = useState({ name: r.name, sort_order: String(r.sort_order), is_active: r.is_active });
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    if (!f.name.trim()) { setErr('نام سایز نمی‌تواند خالی باشد.'); return; }
    const body: Record<string, unknown> = {};
    if (f.name.trim() !== r.name) body.name = f.name.trim();
    if (Number(f.sort_order || 0) !== r.sort_order) body.sort_order = Number(f.sort_order || 0);
    if (f.is_active !== r.is_active) body.is_active = f.is_active;
    if (!Object.keys(body).length) { onClose(); return; }
    try { await w.update.mutateAsync({ id: r.id, body }); toast('سایز ذخیره شد.'); onClose(); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`ویرایش سایز ${r.code}`} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={w.update.isPending}>ذخیره‌ی تغییرات</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <Input label="کد" latin value={r.code} readOnly dir="ltr" hint="بعد از ثبت تغییر نمی‌کند" />
        <Input label="نام" required value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} maxLength={30} />
        <Input label="ترتیب" inputMode="numeric" value={f.sort_order} onChange={(e) => setF((x) => ({ ...x, sort_order: toLatinDigits(e.target.value).replace(/[^0-9]/g, '') }))} />
        <div className={s.segRow}><span className={s.segLabel}>وضعیت</span><Toggle checked={f.is_active} onChange={(v) => setF((x) => ({ ...x, is_active: v }))} label={f.is_active ? 'فعال' : 'غیرفعال'} /></div>
      </FormGrid>
    </Modal>
  );
}

/** رنگ‌ها: کد لاتین ثابت، نام، کد رنگ (#RRGGBB با انتخاب‌گر رنگ) */
export function ColorsTab() {
  const can = usePerm();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const list = useColors({ page: lp.page, page_size: lp.pageSize, query: dq || undefined, is_active: lp.get('active') ? lp.get('active') === 'yes' : undefined });
  const w = useColorWrite();
  const toast = useToast();
  const [f, setF] = useState({ code: '', name: '', hex: '#c0454b' });
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Color | null>(null);
  const [del, setDel] = useState<Color | null>(null);
  const create = async () => {
    setErr(null);
    const code = f.code.trim().toUpperCase();
    if (!code || !CODE_RE.test(code)) { setErr('کد رنگ الزامی است: فقط حروف بزرگ لاتین، رقم و خط تیره (مثل RED).'); return; }
    if (!f.name.trim()) { setErr('نام رنگ را وارد کنید.'); return; }
    if (!/^#[0-9A-Fa-f]{6}$/.test(f.hex)) { setErr('کد رنگ باید به شکل #RRGGBB باشد.'); return; }
    try { await w.create.mutateAsync({ code, name: f.name.trim(), hex_code: f.hex, is_active: true }); toast(`رنگ «${f.name.trim()}» ساخته شد.`); setF({ code: '', name: '', hex: '#c0454b' }); } catch (e) { setErr(userMessage(e)); }
  };
  const cols: Column<Color>[] = [
    { key: 'sw', header: 'نمونه', render: (r) => <Swatch hex={r.hex_code} big /> },
    { key: 'code', header: 'کد', code: true, render: (r) => <span className="ltr" data-latin>{r.code}</span> },
    { key: 'name', header: 'نام', render: (r) => <span className={s.strong}>{r.name}</span> },
    { key: 'hex', header: 'کد رنگ', code: true, render: (r) => <span className="ltr" data-latin>{r.hex_code}</span> },
    { key: 'status', header: 'وضعیت', render: (r) => <Badge tone={r.is_active ? 'success' : 'danger'}>{r.is_active ? 'فعال' : 'غیرفعال'}</Badge> },
    {
      key: 'acts', header: 'عملیات', render: (r) => (
        <span className={s.rowActions}>
          {can('catalog.attributes.update') ? <IconButton label="ویرایش رنگ" onClick={() => setEdit(r)}><IconPencil size={15} /></IconButton> : null}
          {can('catalog.attributes.delete') ? <IconButton label="حذف رنگ" danger onClick={() => setDel(r)}><IconTrash size={15} /></IconButton> : null}
        </span>
      ),
    },
  ];
  return (
    <div className={s.stack}>
      {can('catalog.attributes.create') ? (
        <Card>
          <SectionTitle extra={<span className={s.sub}>کد در SKU کالا می‌آید و بعد از ثبت تغییر نمی‌کند</span>}>رنگ جدید</SectionTitle>
          {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
          <div className={s.inlineForm} style={{ gridTemplateColumns: '1fr 2fr 1.2fr auto' }}>
            <Input label="کد" required latin value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} dir="ltr" placeholder="RED" maxLength={10} />
            <Input label="نام" required value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="مثال: قرمز" maxLength={30} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
            <HexField value={f.hex} onChange={(v) => setF((x) => ({ ...x, hex: v }))} />
            <Button icon={<IconPlus size={17} />} onClick={create} loading={w.create.isPending}>افزودن رنگ</Button>
          </div>
        </Card>
      ) : null}
      <Card>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: کد یا نام رنگ" filters={[activeFilter(lp)]} count={list.data ? `${faNum(list.data.total)} رنگ` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={dq || lp.get('active') ? 'رنگی با این شرایط پیدا نشد' : 'هنوز رنگی تعریف نشده است'} text={dq ? undefined : 'رنگ‌ها ابعاد ماتریس کالا هستند؛ با فرم بالا اولین رنگ را بسازید.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {edit ? <EditColorModal r={edit} onClose={() => setEdit(null)} /> : null}
      {del ? <ConfirmModal title="حذف رنگ" confirmLabel="حذف کن" danger onClose={() => setDel(null)}
        text={<>رنگ <b>{del.name}</b> ({del.code}) حذف می‌شود. اگر روی کالایی استفاده شده باشد حذف رد می‌شود و باید غیرفعالش کنید.</>}
        onConfirm={async () => { await w.remove.mutateAsync(del.id); toast('رنگ حذف شد.'); }} /> : null}
    </div>
  );
}

function HexField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="کد رنگ" required>
      <span className={s.hexRow}>
        <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#cccccc'} onChange={(e) => onChange(e.target.value)} aria-label="انتخاب رنگ" data-tip="انتخاب رنگ" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" data-latin maxLength={7} aria-label="کد رنگ" placeholder="#RRGGBB"
          style={{ height: 42, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '0 10px', font: 'inherit', width: 110 }} />
      </span>
    </Field>
  );
}

function EditColorModal({ r, onClose }: { r: Color; onClose: () => void }) {
  const w = useColorWrite();
  const toast = useToast();
  const [f, setF] = useState({ name: r.name, hex: r.hex_code, is_active: r.is_active });
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    if (!f.name.trim()) { setErr('نام رنگ نمی‌تواند خالی باشد.'); return; }
    if (!/^#[0-9A-Fa-f]{6}$/.test(f.hex)) { setErr('کد رنگ باید به شکل #RRGGBB باشد.'); return; }
    const body: Record<string, unknown> = {};
    if (f.name.trim() !== r.name) body.name = f.name.trim();
    if (f.hex !== r.hex_code) body.hex_code = f.hex;
    if (f.is_active !== r.is_active) body.is_active = f.is_active;
    if (!Object.keys(body).length) { onClose(); return; }
    try { await w.update.mutateAsync({ id: r.id, body }); toast('رنگ ذخیره شد.'); onClose(); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`ویرایش رنگ ${r.code}`} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={w.update.isPending}>ذخیره‌ی تغییرات</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <Input label="کد" latin value={r.code} readOnly dir="ltr" hint="بعد از ثبت تغییر نمی‌کند" />
        <Input label="نام" required value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} maxLength={30} />
        <HexField value={f.hex} onChange={(v) => setF((x) => ({ ...x, hex: v }))} />
        <div className={s.segRow}><span className={s.segLabel}>وضعیت</span><Toggle checked={f.is_active} onChange={(v) => setF((x) => ({ ...x, is_active: v }))} label={f.is_active ? 'فعال' : 'غیرفعال'} /></div>
      </FormGrid>
    </Modal>
  );
}

/** مجموعه‌های سایز و رنگ: کارت + ویرایش + حذف واقعی (سایزها/رنگ‌ها و کالاها دست نمی‌خورند) */
export function SetsTab() {
  const can = usePerm();
  const lp = useListParams({ page_size: 100 });
  const { text, setText, dq } = useSearchState(lp);
  const sizeSets = useSizeSets({ page: 1, page_size: 100, query: dq || undefined });
  const colorSets = useColorSets({ page: 1, page_size: 100, query: dq || undefined });
  const [edit, setEdit] = useState<{ kind: 'size'; set: SizeSet | null } | { kind: 'color'; set: ColorSet | null } | null>(null);
  const [del, setDel] = useState<{ kind: 'size' | 'color'; set: SizeSet | ColorSet } | null>(null);
  const w = useSetWrite();
  const toast = useToast();
  const block = (title: string, kind: 'size' | 'color', q: typeof sizeSets | typeof colorSets) => (
    <Card>
      <SectionTitle extra={can('catalog.attributes.create') ? <Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setEdit({ kind, set: null } as never)}>{kind === 'size' ? 'مجموعه‌ی سایز جدید' : 'مجموعه‌ی رنگ جدید'}</Button> : null}>{title}</SectionTitle>
      {q.isLoading ? <SkeletonRows rows={2} height={90} /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data?.results.length ? (
        <Empty title={dq ? 'مجموعه‌ای با این نام پیدا نشد' : 'هنوز مجموعه‌ای ساخته نشده است'} text={dq ? undefined : 'مجموعه، انتخاب چند سایز یا رنگ را در تعریف ماتریسی کالا یک‌کلیکی می‌کند (مثل «سایزبندی بزرگ‌سال»).'} />
      ) : (
        <div className={s.setGrid}>
          {q.data.results.map((st) => {
            const members = kind === 'size' ? (st as SizeSet).sizes : (st as ColorSet).colors;
            return (
              <article key={st.id} className={s.setCard}>
                <div className={s.setHead}><span className={s.setName}>{st.name}</span><span className={s.rowActions}><Badge tone="neutral">{faNum(members.length)} عضو</Badge>{can('catalog.attributes.update') ? <IconButton label="ویرایش مجموعه" onClick={() => setEdit({ kind, set: st } as never)}><IconPencil size={15} /></IconButton> : null}{can('catalog.attributes.delete') ? <IconButton label="حذف مجموعه" danger onClick={() => setDel({ kind, set: st })}><IconTrash size={15} /></IconButton> : null}</span></div>
                <div className={s.chips}>{members.map((m) => <span key={m.id} className={s.chip}>{'hex_code' in m ? <Swatch hex={m.hex_code} /> : null}{m.name}</span>)}</div>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
  return (
    <div className={s.stack}>
      <Card><TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: نام مجموعه" /></Card>
      {block('مجموعه‌های سایز', 'size', sizeSets)}
      {block('مجموعه‌های رنگ', 'color', colorSets)}
      {edit ? <SetModal kind={edit.kind} set={edit.set} onClose={() => setEdit(null)} /> : null}
      {del ? <ConfirmModal title={`حذف مجموعه‌ی ${del.kind === 'size' ? 'سایز' : 'رنگ'}`} confirmLabel="حذف کن" danger onClose={() => setDel(null)}
        text={<>مجموعه‌ی <b>{del.set.name}</b> حذف می‌شود؛ {del.kind === 'size' ? 'سایزها' : 'رنگ‌ها'} و کالاها دست نمی‌خورند.</>}
        onConfirm={async () => { if (del.kind === 'size') await w.removeSizeSet.mutateAsync(del.set.id); else await w.removeColorSet.mutateAsync(del.set.id); toast('مجموعه حذف شد.'); }} /> : null}
    </div>
  );
}

function SetModal({ kind, set, onClose }: { kind: 'size' | 'color'; set: SizeSet | ColorSet | null; onClose: () => void }) {
  const w = useSetWrite();
  const toast = useToast();
  const sizes = useAllSizes(kind === 'size');
  const colors = useAllColors(kind === 'color');
  const all = (kind === 'size' ? sizes.data : colors.data) ?? [];
  const initial = set ? (kind === 'size' ? (set as SizeSet).sizes : (set as ColorSet).colors).map((m) => m.id) : [];
  const [name, setName] = useState(set?.name ?? '');
  const [ids, setIds] = useState<string[]>(initial);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const busy = w.createSizeSet.isPending || w.updateSizeSet.isPending || w.createColorSet.isPending || w.updateColorSet.isPending;
  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr('نام مجموعه را وارد کنید.'); return; }
    if (!ids.length) { setErr('دست‌کم یک عضو انتخاب کنید.'); return; }
    try {
      if (kind === 'size') { if (set) await w.updateSizeSet.mutateAsync({ id: set.id, body: { name: name.trim(), size_ids: ids } }); else await w.createSizeSet.mutateAsync({ name: name.trim(), size_ids: ids }); }
      else { if (set) await w.updateColorSet.mutateAsync({ id: set.id, body: { name: name.trim(), color_ids: ids } }); else await w.createColorSet.mutateAsync({ name: name.trim(), color_ids: ids }); }
      toast(set ? 'مجموعه ذخیره شد.' : 'مجموعه ساخته شد.'); onClose();
    } catch (e) { setErr(userMessage(e)); }
  };
  const label = kind === 'size' ? 'سایز' : 'رنگ';
  return (
    <Modal open onClose={onClose} title={set ? `ویرایش مجموعه‌ی ${label} «${set.name}»` : `مجموعه‌ی ${label} جدید`} width={640}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={busy}>{set ? 'ذخیره‌ی تغییرات' : 'ساخت مجموعه'}</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={1}>
        <Input label="نام مجموعه" required value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'size' ? 'مثال: سایزبندی بزرگ‌سال' : 'مثال: رنگ‌های پاییزی'} maxLength={100} />
        <Field label={`${label}های عضو`} required hint={`${faNum(ids.length)} انتخاب‌شده از ${faNum(all.length)} ${label} فعال`}>
          {(kind === 'size' ? sizes : colors).isLoading ? <SkeletonRows rows={1} height={40} /> : all.length === 0 ? <span className={s.muted}>{label} فعالی وجود ندارد؛ اول در تب «{label}ها» بسازید.</span> : (
            <div className={s.pickGrid}>
              {all.map((m) => (
                <button key={m.id} type="button" className={`${s.pick} ${ids.includes(m.id) ? s.pickOn : ''}`} aria-pressed={ids.includes(m.id)} onClick={() => toggle(m.id)} data-tip="">
                  {'hex_code' in m ? <Swatch hex={(m as Color).hex_code} /> : null}{m.name} <span className={s.muted} data-latin>{m.code}</span>
                </button>
              ))}
            </div>
          )}
        </Field>
      </FormGrid>
    </Modal>
  );
}
