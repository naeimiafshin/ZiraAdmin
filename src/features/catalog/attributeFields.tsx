import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconPlus } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { Field, Input, Select, Toggle } from '@/shared/ui/form';
import { Combobox } from '@/shared/ui/Combobox';
import { toLatinDigits } from '@/shared/lib/text';
import { attributeSuggestions, type Attribute, type AttributeRowIn } from './api';
import { Swatch } from './components';
import s from './catalog.module.css';

/**
 * فیلدهای مقدار ویژگی برای فرم خانواده (نقش COMMON) و فرم آیتم (ITEM/DESCRIPTIVE).
 * هر ویژگی ⇐ یک یا چند ردیف AttributeRowIn: انتخابی/سواچ ⇐ value_id، چندانتخابی ⇐ چند ردیف value_id،
 * متنی با پیشنهاد ⇐ value_text (با پیشنهاد از بک‌اند)، عددی ⇐ value_number، بله/خیر ⇐ value_bool.
 * «الزامی» را بک‌اند هنگام فعال‌سازی چک می‌کند (ستاره فقط راهنماست).
 * افشین 2026-10-23: ویژگی انتخابی/چندانتخابی (مثل «برچسب» و «فصل») در همین فرم «+ مقدار جدید» دارد (مجوز catalog.attributes.update ⇐
 * PUT /catalog/attributes/{id}/values با مقدارهای فعلی + مقدار تازه؛ بک‌اند با متن مقدار تطبیق می‌دهد) و مقدار تازه بلافاصله انتخاب می‌شود.
 */
export type AttrRows = Record<string, AttributeRowIn[]>; // attribute_id ⇐ ردیف‌ها

export const rowsToList = (rows: AttrRows): AttributeRowIn[] => Object.values(rows).flat().filter((r) => r.value_id || (r.value_text && r.value_text.trim()) || r.value_number !== undefined && r.value_number !== null || typeof r.value_bool === 'boolean');
export const listToRows = (list: { attribute_id: string; value_id?: string | null; value_text?: string | null; value_number?: string | number | null; value_bool?: boolean | null }[]): AttrRows => {
  const out: AttrRows = {};
  for (const r of list) (out[r.attribute_id] ??= []).push({ attribute_id: r.attribute_id, value_id: r.value_id ?? null, value_text: r.value_text || null, value_number: r.value_number == null ? null : String(r.value_number), value_bool: r.value_bool ?? null });
  return out;
};

export function AttributeFields({ attrs, rows, onChange, cols = 3, isLocked }: { attrs: Attribute[]; rows: AttrRows; onChange: (r: AttrRows) => void; cols?: number; /** ویژگی قفل (مثلاً جنس/مدل خانواده‌ی غیرپیش‌نویس) فقط نمایش داده می‌شود */ isLocked?: (a: Attribute) => boolean }) {
  const set = (id: string, list: AttributeRowIn[]) => onChange({ ...rows, [id]: list });
  const canAdd = usePerm()('catalog.attributes.update');
  return (
    <div className={s.attrFieldsGrid} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {attrs.map((a) => {
        const cur = rows[a.id] ?? [];
        const role = a.system_key === 'MATERIAL' ? 'جنس' : a.system_key === 'MODEL_LINE' ? 'مدل' : '';
        const label = role && !a.name.includes(role) ? `${a.name} (${role})` : a.name;
        const locked = !!isLocked?.(a);
        if (a.kind === 'SELECT' || a.kind === 'SWATCH') {
          return (
            <div key={a.id}>
              <Select label={label} required={a.is_required} disabled={locked} value={cur[0]?.value_id ?? ''} placeholder={a.values.length ? 'انتخاب کنید' : 'مقداری تعریف نشده'} hint={a.hint || undefined}
                onChange={(e) => set(a.id, e.target.value ? [{ attribute_id: a.id, value_id: e.target.value }] : [])}
                options={a.values.map((v) => ({ value: v.id, label: v.value }))} />
              {canAdd && !locked && a.kind === 'SELECT' ? <AddValue a={a} onAdded={(vid) => set(a.id, [{ attribute_id: a.id, value_id: vid }])} /> : null}
            </div>
          );
        }
        if (a.kind === 'MULTI') {
          const ids = cur.map((r) => r.value_id).filter(Boolean) as string[];
          return (
            <Field key={a.id} label={label} required={a.is_required} hint={a.hint || undefined}>
              <div className={s.pickGrid} style={{ minHeight: 42, alignItems: 'center' }}>
                {a.values.length === 0 && !canAdd ? <span className={s.muted}>مقداری تعریف نشده</span> : a.values.map((v) => {
                  const on = ids.includes(v.id);
                  return <button key={v.id} type="button" disabled={locked} className={`${s.pick} ${on ? s.pickOn : ''}`} aria-pressed={on} data-tip="" onClick={() => set(a.id, (on ? ids.filter((i) => i !== v.id) : [...ids, v.id]).map((id) => ({ attribute_id: a.id, value_id: id })))}><Swatch hex={v.hex_code} />{v.value}</button>;
                })}
                {canAdd && !locked ? <AddValue a={a} inline onAdded={(vid) => set(a.id, [...ids, vid].map((id) => ({ attribute_id: a.id, value_id: id })))} /> : null}
              </div>
            </Field>
          );
        }
        if (a.kind === 'TEXT_SUGGEST') return <SuggestInput key={a.id} a={a} label={label} disabled={locked} value={cur[0]?.value_text ?? ''} onChange={(v) => set(a.id, v.trim() ? [{ attribute_id: a.id, value_text: v }] : [])} />;
        if (a.kind === 'NUMBER') {
          return <Input key={a.id} label={label} required={a.is_required} inputMode="decimal" value={cur[0]?.value_number == null ? '' : String(cur[0].value_number)} hint={a.hint || undefined}
            onChange={(e) => { const v = toLatinDigits(e.target.value).replace(/[^0-9.]/g, ''); set(a.id, v ? [{ attribute_id: a.id, value_number: v }] : []); }} />;
        }
        if (a.kind === 'BOOL') {
          return (
            <Field key={a.id} label={label} required={a.is_required} hint={a.hint || undefined}>
              <div style={{ height: 42, display: 'flex', alignItems: 'center' }}>
                <Toggle checked={cur[0]?.value_bool === true} onChange={(v) => set(a.id, [{ attribute_id: a.id, value_bool: v }])} label={cur[0]?.value_bool === true ? 'بله' : cur.length ? 'خیر' : 'تعیین‌نشده'} />
              </div>
            </Field>
          );
        }
        return null;
      })}
    </div>
  );
}

/** ورودی متنی با پیشنهاد از مقدارهای قبلی (مدل و هر ویژگی TEXT_SUGGEST) */
function SuggestInput({ a, label, value, onChange, disabled }: { a: Attribute; label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const iid = useId();
  const [opts, setOpts] = useState<string[]>([]);
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => { attributeSuggestions(a.id, value, ctl.signal).then((r) => setOpts(r.results.map((x) => x.value))).catch(() => undefined); }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [a.id, value]);
  // فهرست پیشنهاد = Dropdown استاندارد پنل (Combobox؛ نه datalist بومی مرورگر) — افشین 2026-10-23
  return (
    <Field label={label} required={a.is_required} htmlFor={iid} hint={a.hint || (a.system_key === 'MODEL_LINE' ? 'در نام کالا می‌آید؛ مقدار مشترک بین برندها' : undefined)}>
      <Combobox id={iid} aria-label={label} disabled={disabled} value={value} onChange={onChange} options={opts} maxLength={200} />
    </Field>
  );
}

/** «+ مقدار جدید» برای ویژگی انتخابی: مقدار به فهرست ویژگی اضافه و بلافاصله انتخاب می‌شود */
function AddValue({ a, onAdded, inline }: { a: Attribute; onAdded: (valueId: string) => void; inline?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [v, setV] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    const val = v.trim(); if (!val) return;
    const dup = a.values.find((x) => x.value.trim() === val); if (dup) { onAdded(dup.id); setV(''); setOpen(false); return; }
    setBusy(true); setErr(null);
    try {
      const values = [...a.values.map((x) => ({ value: x.value, hex_code: x.hex_code ?? null, sort_order: x.sort_order })), { value: val, sort_order: a.values.length }];
      const out = await adminApi<{ id: string; value: string }[]>(`/catalog/attributes/${a.id}/values`, { method: 'PUT', body: { values } });
      await qc.invalidateQueries({ queryKey: ['catalog', 'attributes'] });
      const made = out.find((x) => x.value.trim() === val); if (made) onAdded(made.id);
      setV(''); setOpen(false);
    } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  if (!open) return <button type="button" className={s.pick} style={inline ? undefined : { marginTop: 6 }} data-tip="" onClick={() => setOpen(true)} aria-label={`مقدار جدید برای ${a.name}`}><IconPlus size={13} />مقدار جدید</button>;
  return (
    <span className={s.addVal} style={inline ? undefined : { marginTop: 6 }}>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} maxLength={100} placeholder={`مقدار ${a.name}`} aria-label={`مقدار جدید ${a.name}`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }} />
      <button type="button" className={`${s.pick} ${s.pickOn}`} data-tip="" disabled={busy || !v.trim()} onClick={() => void add()}>افزودن</button>
      <button type="button" className={s.pick} data-tip="" onClick={() => { setOpen(false); setV(''); }}>انصراف</button>
      {err ? <span className={s.warnText} style={{ margin: 0 }}>{err}</span> : null}
    </span>
  );
}
