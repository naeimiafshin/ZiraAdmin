import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card, Modal } from '@/shared/ui/kit';
import s from './settings.module.css';

/* ─────────────────────────── کارت و ردیف تنظیمات (الگوی «سیاست‌های امنیتی») ─────────────────────────── */

export function SettingCard({ icon, title, desc, children, wide, extra }: { icon: ReactNode; title: ReactNode; desc?: ReactNode; children: ReactNode; wide?: boolean; extra?: ReactNode }) {
  return (
    <Card className={wide ? s.wide : s.full}>
      <div className={s.cardHead}>
        <span className={s.cardIcon}>{icon}</span>
        <div><div className={s.cardTitle}>{title}</div>{desc ? <div className={s.cardDesc}>{desc}</div> : null}</div>
        {extra ? <div className={s.cardHeadExtra}>{extra}</div> : null}
      </div>
      <div className={s.cardBody}>{children}</div>
    </Card>
  );
}

/** یک تنظیم: عنوان و توضیح در یک سمت، کنترل در ستون هم‌عرض سمت دیگر. changed ⇐ نقطه‌ی «تغییر ذخیره‌نشده». */
export function Row({ title, desc, error, changed, children, wideControl }: { title: ReactNode; desc?: ReactNode; error?: string; changed?: boolean; children: ReactNode; wideControl?: boolean }) {
  return (
    <div className={`${s.setting} ${changed ? s.changed : ''}`}>
      <div className={s.settingText}>
        <span className={s.settingTitle}>{title}</span>
        {desc ? <span className={s.settingDesc}>{desc}</span> : null}
        {error ? <span className={s.settingErr} role="alert">{error}</span> : null}
      </div>
      <div className={s.control} style={wideControl ? { width: 'auto' } : undefined}>{children}</div>
    </div>
  );
}

/** کادر خاکستری تنظیم‌های وابسته (فقط وقتی کلید والد روشن است نمایش داده می‌شود) */
export const SubBox = ({ children }: { children: ReactNode }) => <div className={s.subBox}>{children}</div>;

/* ─────────────────────────── ورودی عدد با واحد ─────────────────────────── */

const groupInt = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
/** نمایش فارسی: جداکننده‌ی هزارگان برای ریال، «٫» برای اعشار */
export function faDecimal(raw: string, group = false): string {
  if (raw === '') return '';
  const [i = '', f] = raw.split('.');
  const int = group ? groupInt(i) : i;
  return toFaDigits(f !== undefined ? `${int}٫${f}` : int);
}
/** ورودی کاربر ⇐ رشته‌ی لاتین (فقط رقم و یک نقطه) */
export function cleanDecimal(text: string, decimals: number): string {
  let t = toLatinDigits(text).replace(/[٫/,]/g, '.').replace(/[^0-9.]/g, '');
  const dot = t.indexOf('.');
  if (dot >= 0) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '');
  if (decimals === 0) t = t.replace('.', '');
  return t;
}
/** مقدار اعشاری بک‌اند («15.00»، «2.500») ⇐ کوتاه‌ترین شکل («15»، «2.5») */
export const trimDecimal = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '';
  const t = String(v);
  return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
};

/**
 * ورودی عدد (درصد، ریال، وزن، ضریب): نمایش فارسی، مقدار لاتین. دقت و بازه هم‌اندازه‌ی schema بک‌اند؛
 * بیرون از بازه یا دقت بیش از حد ⇐ قرمز با راهنما (بک‌اند هم رد می‌کند و پیامش زیر ردیف می‌آید).
 */
export function NumField({ value, onChange, label, unit, decimals = 0, min, max, group, wide, disabled }: {
  value: string; onChange: (v: string) => void; label: string; unit?: string; decimals?: number; min?: number; max?: number; group?: boolean; wide?: boolean; disabled?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const n = value === '' ? NaN : Number(value);
  const places = value.includes('.') ? value.split('.')[1]!.length : 0;
  const bad = value === '' || Number.isNaN(n) || (min !== undefined && n < min) || (max !== undefined && n > max) || places > decimals;
  const hint = [min !== undefined ? `حداقل ${faNum(min)}` : '', max !== undefined ? `حداکثر ${faNum(max)}` : '', decimals ? `تا ${faNum(decimals)} رقم اعشار` : 'عدد صحیح'].filter(Boolean).join('، ');
  return (
    <span className={s.num}>
      <input className={`${s.numInput} ${wide ? s.numWide : ''} ${bad ? s.numBad : ''}`} inputMode={decimals ? 'decimal' : 'numeric'} aria-label={label} aria-invalid={bad || undefined}
        data-tip={bad ? hint : ''} disabled={disabled}
        value={focus && !group ? toFaDigits(value).replace('.', '٫') : faDecimal(value, group)}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); if (value.endsWith('.')) onChange(value.slice(0, -1)); }}
        onChange={(e) => onChange(cleanDecimal(e.target.value, decimals))} />
      {unit ? <span className={s.unit}>{unit}</span> : null}
    </span>
  );
}

/** ورودی متنی کوتاه داخل ردیف تنظیمات (عنوان متغیر، متن پیش از جزء نام…) */
export function TextField({ value, onChange, label, placeholder, latin, disabled, maxLength }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; latin?: boolean; disabled?: boolean; maxLength?: number }) {
  return <input className={`${s.textIn} ${latin ? 'ltr' : ''}`} dir={latin ? 'ltr' : undefined} data-latin={latin ? '' : undefined} aria-label={label} placeholder={placeholder}
    value={latin ? value : toFaDigits(value)} maxLength={maxLength} disabled={disabled} onChange={(e) => onChange(latin ? e.target.value : e.target.value)} />;
}

/* ─────────────────────────── نوار ذخیره و پیش‌نویس ─────────────────────────── */

export function SaveBar({ dirty, saving, onSave, onReset, note, label = 'ذخیره‌ی تغییرات' }: { dirty: number; saving: boolean; onSave: () => void; onReset: () => void; note?: ReactNode; label?: string }) {
  return (
    <Card className={s.saveBar}>
      <Button onClick={onSave} loading={saving} disabled={dirty === 0}>{label}</Button>
      <Button variant="ghost" onClick={onReset} disabled={dirty === 0 || saving}>بازگرداندن تغییرات</Button>
      <span className={s.saveInfo}>{dirty ? <span className={s.saveDirty}>{faNum(dirty)} تغییر ذخیره‌نشده</span> : 'همه‌ی تغییرات ذخیره شده است.'}{note ? <> — {note}</> : null}</span>
    </Card>
  );
}

/** مقایسه‌ی پیش‌نویس با داده‌ی بک‌اند ⇐ فقط فیلدهای تغییرکرده (PATCH جزئی) */
export function changedKeys<T extends Record<string, unknown>>(draft: T, base: T): (keyof T)[] {
  return (Object.keys(draft) as (keyof T)[]).filter((k) => norm(draft[k]) !== norm(base[k]));
}
const norm = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? String(Number(v)) : String(v));

/** پیش‌نویس فرم که با رسیدن داده‌ی تازه‌ی بک‌اند (بعد از ذخیره یا بارگذاری) از نو ساخته می‌شود */
export function useDraft<S, D>(server: S | undefined | null, toDraft: (s: S) => D) {
  const [draft, setDraft] = useState<D | null>(null);
  useEffect(() => { if (server) setDraft(toDraft(server)); }, [server]); // eslint-disable-line react-hooks/exhaustive-deps
  return [draft, setDraft] as const;
}

/* ─────────────────────────── خطای بک‌اند ⇐ کنار فیلد یا بالای فرم ─────────────────────────── */

export type FormErrors = { fields: Record<string, string>; general: string[] };
export const NO_ERRORS: FormErrors = { fields: {}, general: [] };

/** 400 دامنه (`{field: [پیام]}`، `__all__`) و 422 اسکیما (`[{loc, msg, type, ctx}]`) ⇐ پیام فارسی هر فیلد */
export function parseErrors(error: unknown, knownFields: string[]): FormErrors {
  if (!(error instanceof ApiError)) return { fields: {}, general: [userMessage(error)] };
  const out: FormErrors = { fields: {}, general: [] };
  const put = (field: string, msg: string) => {
    if (field && knownFields.includes(field) && !out.fields[field]) out.fields[field] = msg;
    else out.general.push(msg);
  };
  const d = error.detail;
  if ((error.status === 400 || error.status === 422) && Array.isArray(d)) {
    for (const e of d as { loc?: (string | number)[]; msg?: string; type?: string; ctx?: Record<string, unknown> }[]) {
      const loc = (e.loc ?? []).filter((x) => !['body', 'payload', 'query', 'path'].includes(String(x)));
      const field = loc.filter((x) => typeof x === 'string').pop() as string | undefined;
      put(field ?? '', pydanticFa(e));
    }
  } else if ((error.status === 400 || error.status === 422) && d && typeof d === 'object') {
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) put(k === '__all__' ? '' : k, Array.isArray(v) ? String(v[0]) : String(v));
  } else {
    out.general.push(userMessage(error));
  }
  return out;
}

function pydanticFa(e: { msg?: string; type?: string; ctx?: Record<string, unknown> }): string {
  const m = e.msg ?? '';
  if (/[؀-ۿ]/.test(m)) return m.replace(/^Value error,\s*/, '');
  const c = e.ctx ?? {};
  switch (e.type) {
    case 'decimal_max_places': return Number(c.decimal_places) === 0 ? 'فقط عدد صحیح مجاز است.' : `حداکثر ${faNum(Number(c.decimal_places))} رقم اعشار مجاز است.`;
    case 'less_than_equal': return `حداکثر ${faNum(Number(c.le))} مجاز است.`;
    case 'greater_than_equal': return `حداقل ${faNum(Number(c.ge))} مجاز است.`;
    case 'string_pattern_mismatch': return 'قالب مقدار معتبر نیست.';
    case 'string_too_long': return `حداکثر ${faNum(Number(c.max_length))} نویسه مجاز است.`;
    case 'string_too_short': return 'این فیلد نباید خالی باشد.';
    case 'missing': return 'این فیلد الزامی است.';
    case 'extra_forbidden': return 'این فیلد قابل تغییر نیست.';
    case 'enum': return 'مقدار انتخاب‌شده معتبر نیست.';
    default: return 'مقدار واردشده معتبر نیست.';
  }
}

export const TopErrors = ({ errors }: { errors: FormErrors }) =>
  errors.general.length ? <div className={s.topErr}><Alert>{errors.general.map((g, i) => <div key={i}>{g}</div>)}</Alert></div> : null;

/* ─────────────────────────── تأیید کار برگشت‌ناپذیر ─────────────────────────── */

export function ConfirmModal({ title, text, confirmLabel, onConfirm, onClose }: { title: string; text: ReactNode; confirmLabel: string; onConfirm: () => Promise<unknown>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(); onClose(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={title} width={460}
      footer={<><Button variant="danger" onClick={go} loading={busy}>{confirmLabel}</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.modalBody}>
        {err ? <Alert>{err}</Alert> : null}
        <p style={{ margin: 0, lineHeight: 1.9 }}>{text}</p>
      </div>
    </Modal>
  );
}

export function IconBtn({ label, onClick, danger, disabled, tip, children }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; tip?: string; children: ReactNode }) {
  return (
    <button type="button" className={`${s.iconBtn} ${danger ? s.iconDanger : ''}`} aria-label={label} data-tip={tip ?? label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}>{children}</button>
  );
}

/** کارت شمارنده (هم‌شکل «گزارش دسترسی‌ها») */
export function Stat({ icon, label, value, tone = 'brand' }: { icon: ReactNode; label: string; value: number | undefined; tone?: 'brand' | 'success' | 'neutral' | 'warning' }) {
  return (
    <div className={s.stat}>
      <span className={`${s.statIcon} ${s[`t_${tone}`]}`}>{icon}</span>
      <span className={s.statText}><span className={s.statLabel}>{label}</span><span className={s.statValue}>{value === undefined ? '…' : faNum(value)}</span></span>
    </div>
  );
}
