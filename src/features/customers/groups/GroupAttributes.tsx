import { useEffect, useRef, useState } from 'react';
import { userMessage } from '@/shared/api/errors';
import { toFaDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select } from '@/shared/ui/form';
import { InfoBanner, Modal } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useGroupWrite, type GroupDetail, type GroupRow } from '../api';
import { conflictCodes, digitsOnly, formatAmount, rial } from '../components';
import { COOPERATION, CUSTOMER_TYPE, IMAGE_LEVEL } from '../labels';
import s from '../customers.module.css';

/**
 * قانون‌های عضویت گروه مشتری (افشین 2026-10-24، نسخه‌ی ۳؛ FrontGuidance/CUSTOMER_GROUPS_V3_FOR_FRONT.md).
 * گروه هیچ مقداری به مشتری نمی‌دهد. هر قانون اختیاری است: خالی = بررسی نمی‌شود؛ تعیین‌شده = فقط مشتری با مقدار
 * نهایی دقیقاً برابر عضو می‌شود. قانون حساب (مهلت، پله‌ای، سقف) برای مشتری بدون آن حساب یا با حساب بسته نمی‌خواند.
 * مجوز همه‌ی قانون‌ها customers.groups.update است.
 */
export type RuleKey =
  | 'cooperation_level' | 'image_access_level' | 'customer_type' | 'payment_due_days'
  | 'cheque_term_months' | 'cheque_stepwise_increase' | 'cheque_credit_limit'
  | 'golden_term_months' | 'golden_stepwise_increase' | 'golden_credit_limit';
/** نام قدیمی (سازگاری import) */
export type AttrKey = RuleKey;

type Meta = { key: RuleKey; label: string; kind: 'select' | 'number' | 'bool' | 'money'; options?: { value: string; label: string }[]; unit?: string; min?: number; max?: number };
const BOOL = [{ value: 'true', label: 'روشن' }, { value: 'false', label: 'خاموش' }];
export const RULES: { section: string; items: Meta[] }[] = [
  {
    section: 'مشتری',
    items: [
      { key: 'cooperation_level', label: 'سطح همکاری', kind: 'select', options: Object.entries(COOPERATION).map(([value, v]) => ({ value, label: v.label })) },
      { key: 'image_access_level', label: 'سطح تصاویر', kind: 'select', options: Object.entries(IMAGE_LEVEL).map(([value, v]) => ({ value, label: v.label })) },
      { key: 'customer_type', label: 'نوع مشتری', kind: 'select', options: Object.entries(CUSTOMER_TYPE).map(([value, label]) => ({ value, label })) },
      { key: 'payment_due_days', label: 'مهلت تسویه‌ی فاکتور', kind: 'number', unit: 'روز', min: 1, max: 365 },
    ],
  },
  {
    section: 'حساب اعتباری چکی',
    items: [
      { key: 'cheque_credit_limit', label: 'سقف اعتبار چکی', kind: 'money' },
      { key: 'cheque_term_months', label: 'مهلت حساب چکی', kind: 'number', unit: 'ماه', min: 1, max: 24 },
      { key: 'cheque_stepwise_increase', label: 'افزایش پله‌ای چکی', kind: 'bool', options: BOOL },
    ],
  },
  {
    section: 'حساب اعتباری طلایی',
    items: [
      { key: 'golden_credit_limit', label: 'سقف اعتبار طلایی', kind: 'money' },
      { key: 'golden_term_months', label: 'مهلت حساب طلایی', kind: 'number', unit: 'ماه', min: 1, max: 24 },
      { key: 'golden_stepwise_increase', label: 'افزایش پله‌ای طلایی', kind: 'bool', options: BOOL },
    ],
  },
];
/** نام قدیمی (سازگاری import) */
export const ATTRS = RULES;
const ALL: Meta[] = RULES.flatMap((g) => g.items);
export type RuleValues = Partial<Record<RuleKey, string | number | boolean | null>>;
type WithRules = Partial<Record<RuleKey, unknown>>;

/** نمایش مقدار یک قانون به فارسی */
export function ruleText(key: RuleKey, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const m = ALL.find((x) => x.key === key)!;
  if (m.kind === 'bool') return v ? 'روشن' : 'خاموش';
  if (m.kind === 'money') return rial(String(v));
  if (m.kind === 'number') return `${toFaDigits(String(v))} ${m.unit}`;
  return m.options?.find((o) => o.value === v)?.label ?? String(v);
}
export const attrText = ruleText;

const toStr = (m: Meta, v: unknown) => (v === null || v === undefined ? '' : m.kind === 'money' ? String(Number(v)) : String(v));
const fromStr = (m: Meta, v: string): string | number | boolean | null => {
  if (v === '') return null;
  if (m.kind === 'number') return Number(digitsOnly(v));
  if (m.kind === 'money') return digitsOnly(v);
  if (m.kind === 'bool') return v === 'true';
  return v;
};
const same = (m: Meta, a: unknown, b: unknown) => (m.kind === 'money' ? (a === null || a === undefined ? null : Number(a)) === (b === null || b === undefined ? null : Number(b)) : a === b);

export const ruleCount = (g: WithRules) => ALL.filter((m) => g[m.key] !== null && g[m.key] !== undefined).length;

/** خلاصه‌ی قانون‌ها (پنل کناری گروه) */
export function RulesSummary({ g }: { g: GroupRow | GroupDetail }) {
  const rules = g as WithRules;
  if (!ruleCount(rules)) return <p className={s.sub}>این گروه قانون عضویت ندارد؛ هر مشتری می‌تواند عضو شود.</p>;
  return (
    <div className={s.attrSummary}>
      {RULES.map((sec) => (
        <div key={sec.section} className={s.attrSection}>
          <div className={s.attrSectionTitle}>{sec.section}</div>
          {sec.items.map((m) => {
            const v = rules[m.key];
            return (
              <div key={m.key} className={s.attrRow}>
                <span>{m.label}</span>
                {v !== null && v !== undefined ? <b>{ruleText(m.key, v)}</b> : <span className={s.muted}>بررسی نمی‌شود</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** فیلدهای فرم قانون‌ها (ایجاد و ویرایش) */
export function RulesFields({ values, onChange }: { values: Record<RuleKey, string>; onChange: (k: RuleKey, v: string) => void }) {
  return (
    <div className={s.attrForm}>
      <InfoBanner tone="info">قانون‌ها شرط عضویت‌اند و هیچ مقداری را روی پرونده‌ی مشتری تغییر نمی‌دهند. خالی = بررسی نمی‌شود؛ تعیین‌شده = فقط مشتری با مقدار دقیقاً برابر عضو می‌شود (قانون حساب برای مشتری بدون آن حساب یا با حساب بسته نمی‌خواند).</InfoBanner>
      {RULES.map((sec) => (
        <div key={sec.section}>
          <div className={s.subhead}>{sec.section}</div>
          <FormGrid cols={2}>
            {sec.items.map((m) => {
              if (m.kind === 'money') {
                return <Input key={m.key} label={`${m.label} (ریال)`} value={formatAmount(values[m.key])} onChange={(e) => onChange(m.key, digitsOnly(e.target.value).slice(0, 18))}
                  inputMode="numeric" dir="ltr" placeholder="بررسی نمی‌شود" hint={values[m.key] ? rial(values[m.key]) : 'خالی = بررسی نمی‌شود'} />;
              }
              if (m.kind === 'number') {
                return <Input key={m.key} label={`${m.label} (${m.unit})`} value={toFaDigits(values[m.key])} hint="خالی = بررسی نمی‌شود"
                  onChange={(e) => onChange(m.key, digitsOnly(e.target.value).slice(0, 3))} inputMode="numeric" placeholder="بررسی نمی‌شود" />;
              }
              return <Select key={m.key} label={m.label} value={values[m.key]} hint="خالی = بررسی نمی‌شود"
                onChange={(e) => onChange(m.key, e.target.value)} placeholder="بررسی نمی‌شود" options={m.options!} />;
            })}
          </FormGrid>
        </div>
      ))}
    </div>
  );
}

export const emptyRuleForm = (g?: WithRules): Record<RuleKey, string> =>
  Object.fromEntries(ALL.map((m) => [m.key, toStr(m, g?.[m.key])])) as Record<RuleKey, string>;

/** بررسی فرم؛ خروجی: کلیدهای تغییرکرده با مقدار API یا پیام خطا */
export function diffRules(form: Record<RuleKey, string>, base?: WithRules): { changed: RuleValues; error?: string } {
  const changed: RuleValues = {};
  for (const m of ALL) {
    const now = fromStr(m, form[m.key]);
    const before = base ? (base[m.key] ?? null) : null;
    if (m.kind === 'number' && typeof now === 'number' && (now < (m.min ?? 1) || now > (m.max ?? 999))) {
      return { changed, error: `${m.label} باید بین ${toFaDigits(String(m.min))} و ${toFaDigits(String(m.max))} ${m.unit} باشد.` };
    }
    if (!same(m, now, before)) changed[m.key] = now;
  }
  return { changed };
}

/** خطای فرم: بالای فرم و با اسکرول به آن (پیام 409 بلند است و نباید زیر فرم پنهان بماند) */
export function AttrError({ err }: { err: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (err) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [err]);
  return err ? <div ref={ref} style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null;
}

/** مودال ویرایش قانون‌های عضویت — PUT /groups/{id}/rules */
export function RulesModal({ g, onClose, onConflict }: { g: GroupDetail; onClose: () => void; onConflict?: (codes: string[], message: string) => void }) {
  const toast = useToast();
  const w = useGroupWrite(g.id);
  const [form, setForm] = useState(() => emptyRuleForm(g as WithRules));
  const [err, setErr] = useState<string | null>(null);
  const { changed } = diffRules(form, g as WithRules);
  const submit = async () => {
    const d = diffRules(form, g as WithRules);
    if (d.error) { setErr(d.error); return; }
    if (!Object.keys(d.changed).length) { setErr('تغییری برای ذخیره وجود ندارد.'); return; }
    try { await w.rules.mutateAsync({ ...d.changed, expected_version: g.version }); toast('قانون‌های عضویت ذخیره شد.'); onClose(); }
    catch (e) {
      // قانون تازه با اعضای فعلی نمی‌خواند (409) ⇐ مودال بسته و مغایرها بالای جدول اعضا نشان داده می‌شوند
      const codes = conflictCodes(e);
      if (codes && onConflict) { onConflict(codes, userMessage(e)); onClose(); return; }
      setErr(userMessage(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={`قانون‌های عضویت گروه «${g.name}»`} width={640}
      footer={<><Button onClick={submit} loading={w.rules.isPending} loadingText="در حال ذخیره…">ذخیره‌ی قانون‌ها</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <AttrError err={err} />
      <RulesFields values={form} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
      {Object.keys(changed).length ? <p className={s.sub} style={{ marginTop: 10 }}>{toFaDigits(String(Object.keys(changed).length))} قانون تغییر می‌کند.</p> : null}
    </Modal>
  );
}
