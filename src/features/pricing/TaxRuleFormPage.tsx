import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal } from '@/features/catalog/components';
import { useTaxRule, useTaxWrite, type TaxRuleIn } from './api';
import { IconCategory, IconInfoCircle, IconPackage } from '@tabler/icons-react';
import { faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useBack } from '@/shared/lib/useBack';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Field, FormGrid, Input, Select, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Card, Empty, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { ScopeModal, summarize, type Pick } from './ScopePicker';
import s from '@/features/catalog/catalog.module.css';
import m from './marketing.module.css';

/**
 * «قانون مالیاتی جدید» (افشین 2026-10-24؛ طراحی Claude بر پایه‌ی قانون مالیات بر ارزش افزوده ۱۴۰۰، قوانین بودجه و الزامات سامانه مودیان).
 * بخش‌ها: مشخصات و مبنای قانونی · دامنه (همه / دسته / کالا، اولویت: کالا > دسته > پیش‌فرض) · نوع و نرخ (درصدی با سهم مالیات و سهم عوارض /
 * معاف / نرخ صفر صادراتی / مبلغ ثابت هر واحد) · مبنای محاسبه (پس از تخفیف / فقط اجرت+سود+حق‌العمل / ارزش کالا) · گرد کردن · سامانه مودیان
 * (الگوی صورتحساب، کد شناسه کالا/خدمت) · سایر مالیات و عوارض · شرط خریدار. پیش‌نمایش محاسبه کنار فرم.
 * P-13 ✅ (2026-10-24): POST/PUT/GET/DELETE /pricing/tax-rules؛ ویرایش `/pricing/tax-rules/:id/edit` (همه‌ی فیلدها؛ target_ids کل فهرست را جایگزین می‌کند)؛
 * حذف فقط وقتی `deletable` (هنوز شروع نشده)، وگرنه با «پایان اعتبار» بسته می‌شود. همپوشانی قانون‌ها را بک‌اند رد می‌کند و نام قانون معارض را می‌گوید.
 * محاسبه‌ی سفارش هنوز قانون سراسری را می‌گیرد (تا دامنه‌ی سفارش‌ها) — قانون‌ها فعلاً فقط ذخیره می‌شوند.
 */
type Kind = 'PERCENT' | 'EXEMPT' | 'ZERO_RATED' | 'FIXED_PER_UNIT';
type Scope = 'ALL' | 'CATEGORY' | 'ITEM';
const KIND: Record<Kind, { label: string; hint: string }> = {
  PERCENT: { label: 'درصدی (نرخ عمومی)', hint: 'مثل نرخ عمومی ارزش افزوده (۱۰٪ در ۱۴۰۳ تا ۱۴۰۵)' },
  EXEMPT: { label: 'معاف', hint: 'کالاهای ماده‌ی ۹ قانون؛ مالیات صفر و درج «معاف» در صورتحساب' },
  ZERO_RATED: { label: 'نرخ صفر (صادرات)', hint: 'صادرات و فروش به مناطق آزاد واجد شرایط (ماده‌ی ۱۰)' },
  FIXED_PER_UNIT: { label: 'مبلغ ثابت به ازای واحد', hint: 'مثل محصولات دخانی (ماده‌ی ۲۶)' },
};
const BASE: Record<string, string> = { NET_AFTER_DISCOUNT: 'مبلغ پس از کسر تخفیف (پیش‌فرض)', WAGE_PROFIT_COMMISSION: 'فقط اجرت ساخت + سود + حق‌العمل (طلا و جواهر)', GOODS_VALUE: 'ارزش کالا (صادرات)' };
const PATTERNS = [{ value: 'SALE', label: 'فروش' }, { value: 'FX_SALE', label: 'فروش ارزی' }, { value: 'GOLD', label: 'طلا، جواهر و پلاتین' }, { value: 'CONTRACT', label: 'قرارداد پیمانکاری' }, { value: 'EXPORT', label: 'صادرات' }];
const BUYER = [{ value: 'ALL', label: 'همه‌ی خریداران' }, { value: 'DOMESTIC', label: 'خریدار داخلی' }, { value: 'EXPORT', label: 'خریدار خارجی (صادرات)' }, { value: 'FREE_ZONE', label: 'منطقه‌ی آزاد واجد شرایط' }];
const ROUND = [{ value: 'FLOOR', label: 'رو به پایین تا ریال (پیش‌فرض سامانه مودیان)' }, { value: 'HALF_UP', label: 'نیمه به بالا تا ریال' }];
const num = (v: string) => toLatinDigits(v).replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d{0,2}).*$/, '$1');
const digits = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');

export default function TaxRuleFormPage() {
  const { id: editId } = useParams(); const isEdit = !!editId;
  const can = usePerm(); const navigate = useNavigate(); const toast = useToast(); const w = useTaxWrite();
  const back = useBack('/pricing/tax-rules');
  const q = useTaxRule(editId); const loaded = useRef(false); const [del, setDel] = useState(false); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [basis, setBasis] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [scope, setScope] = useState<Scope>('ALL'); const [picks, setPicks] = useState<Pick[]>([]); const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('PERCENT');
  const [vat, setVat] = useState('9'); const [duty, setDuty] = useState('1');
  const [fixed, setFixed] = useState(''); const [fixedUnit, setFixedUnit] = useState('عدد');
  const [base, setBase] = useState('NET_AFTER_DISCOUNT'); const [round, setRound] = useState('FLOOR');
  const [reason, setReason] = useState('');
  const [patterns, setPatterns] = useState<string[]>(['SALE']); const [sstid, setSstid] = useState('');
  const [otherTitle, setOtherTitle] = useState(''); const [otherPct, setOtherPct] = useState('');
  const [buyer, setBuyer] = useState('ALL'); const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const total = kind === 'PERCENT' ? (Number(vat) || 0) + (Number(duty) || 0) : 0;
  const sample = 10_000_000;
  const tax = kind === 'PERCENT' ? (round === 'FLOOR' ? Math.floor((sample * total) / 100) : Math.round((sample * total) / 100)) : 0;
  const other = otherPct ? Math.floor((sample * Number(otherPct)) / 100) : 0;
  const validate = () => {
    if (!name.trim()) return 'نام قانون را وارد کنید.';
    if (!jalaliTextToGregorian(from)) return 'تاریخ شروع اعتبار را وارد کنید.';
    if (to && !jalaliTextToGregorian(to)) return 'تاریخ پایان معتبر نیست.';
    if (scope !== 'ALL' && !picks.length) return scope === 'CATEGORY' ? 'حداقل یک دسته‌بندی انتخاب کنید.' : 'حداقل یک کالا انتخاب کنید.';
    if (kind === 'PERCENT' && (total <= 0 || total > 100)) return 'جمع نرخ باید بیشتر از ۰ و حداکثر ۱۰۰٪ باشد.';
    if (kind === 'FIXED_PER_UNIT' && (!Number(fixed) || !fixedUnit.trim())) return 'مبلغ ثابت و واحد آن را وارد کنید.';
    if ((kind === 'EXEMPT' || kind === 'ZERO_RATED') && !reason.trim()) return 'برای معافیت یا نرخ صفر، علت و مستند قانونی لازم است.';
    if (sstid && !/^\d{13}$/.test(sstid)) return 'شناسه‌ی کالا/خدمت سامانه مودیان ۱۳ رقم است.';
    if (!patterns.length) return 'حداقل یک الگوی صورتحساب انتخاب کنید.';
    if (Number(otherPct) > 0 && !otherTitle.trim()) return 'برای «سایر مالیات و عوارض» عنوان لازم است.';
    const gf = jalaliTextToGregorian(from), gt = to ? jalaliTextToGregorian(to) : null;
    if (gf && gt && gt < gf) return 'پایان اعتبار باید بعد از شروع باشد.';
    return null;
  };
  useEffect(() => {
    const r = q.data; if (!r || loaded.current) return; loaded.current = true;
    setName(r.name); setBasis(r.legal_basis); setFrom(gregorianToJalaliText(r.valid_from)); setTo(r.valid_to ? gregorianToJalaliText(r.valid_to) : '');
    setScope(r.scope as Scope); setPicks(r.targets.map((x) => ({ type: r.scope === 'CATEGORY' ? 'CATEGORY' : 'ITEM', id: x.id, label: x.label })));
    setKind(r.kind as Kind); setVat(String(Number(r.vat_percent))); setDuty(String(Number(r.duty_percent)));
    setFixed(r.fixed_amount ? String(Number(r.fixed_amount)) : ''); setFixedUnit(r.fixed_unit || 'عدد');
    setBase(r.taxable_base); setRound(r.rounding); setReason(r.exemption_reason); setPatterns(r.invoice_patterns as string[]); setSstid(r.stuff_id);
    setOtherTitle(r.other_tax_title); setOtherPct(Number(r.other_tax_percent) ? String(Number(r.other_tax_percent)) : ''); setBuyer(r.buyer_condition); setNotes(r.notes);
  }, [q.data]);
  const submit = async () => {
    const v = validate(); if (v) { setErr(v); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setErr(null); setBusy(true);
    const pctOk = kind === 'PERCENT';
    const body: TaxRuleIn = {
      name: name.trim(), legal_basis: basis.trim(), valid_from: jalaliTextToGregorian(from)!, valid_to: to ? jalaliTextToGregorian(to) : null,
      scope, target_ids: scope === 'ALL' ? [] : picks.map((x) => x.id), kind,
      vat_percent: pctOk ? vat || '0' : '0', duty_percent: pctOk ? duty || '0' : '0',
      fixed_amount: kind === 'FIXED_PER_UNIT' ? fixed : null, fixed_unit: kind === 'FIXED_PER_UNIT' ? fixedUnit.trim() : '',
      taxable_base: base as TaxRuleIn['taxable_base'], rounding: round as TaxRuleIn['rounding'],
      exemption_reason: kind === 'EXEMPT' || kind === 'ZERO_RATED' ? reason.trim() : '',
      invoice_patterns: patterns as TaxRuleIn['invoice_patterns'], stuff_id: sstid, buyer_condition: buyer as TaxRuleIn['buyer_condition'],
      other_tax_title: otherTitle.trim(), other_tax_percent: otherTitle.trim() && otherPct ? otherPct : '0', notes,
    };
    try {
      if (isEdit) { await w.update.mutateAsync({ id: editId!, body }); toast('قانون مالیاتی ذخیره شد.'); }
      else { await w.create.mutateAsync(body); toast('قانون مالیاتی ثبت شد.'); }
      navigate('/pricing/tax-rules', { replace: true });
    } catch (e) { setErr(userMessage(e)); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };
  if (isEdit && q.isLoading) return <Card><SkeletonRows rows={6} height={56} /></Card>;
  if (isEdit && (q.error || !q.data)) return <Card><Empty title="قانون مالیاتی پیدا نشد" text={q.error ? userMessage(q.error) : undefined} /></Card>;
  const canEdit = can(isEdit ? 'pricing.tax_rules.update' : 'pricing.tax_rules.create');
  return (
    <>
      <PageHead title={isEdit ? `ویرایش قانون مالیاتی — ${q.data?.name ?? ''}` : 'قانون مالیاتی جدید'} sub="نرخ، دامنه و مبنای محاسبه‌ی مالیات بر ارزش افزوده و عوارض؛ قانون با تاریخ اثر نسخه‌بندی می‌شود و برای هر کالا قانون اختصاصی‌تر اولویت دارد." back={back} />
      <div className={m.formPage}>
        <div>
          <Alert tone="info">قانون‌ها فعلاً فقط ذخیره می‌شوند؛ محاسبه‌ی مالیات در استعلام قیمت و سفارش تا راه‌اندازی دامنه‌ی سفارش‌ها همان قانون سراسری فعلی است.</Alert>
          {err ? <Alert>{err}</Alert> : null}
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>مشخصات و مبنای قانونی</h3>
            <FormGrid cols={2}>
              <Input label="نام قانون" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="مثال: نرخ عمومی ارزش افزوده ۱۴۰۵" />
              <Input label="مبنای قانونی" value={basis} onChange={(e) => setBasis(e.target.value)} maxLength={300} placeholder="مثال: ماده ۷ قانون ارزش افزوده؛ بند ر تبصره ۶ بودجه" hint="ماده، بند قانون بودجه یا شماره‌ی بخشنامه" />
              <JalaliDateInput label="شروع اعتبار" required value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" maxYear={1500} hint="معمولاً ۱ فروردین سال بودجه" />
              <JalaliDateInput label="پایان اعتبار" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" maxYear={1500} hint="خالی = تا قانون بعدی" />
            </FormGrid>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 6 }}>دامنه</h3>
            <p className={m.cardSub}>قانون روی چه کالاهایی اعمال شود؛ اگر چند قانون هم‌زمان معتبر باشند، کالا &gt; دسته‌بندی &gt; همه‌ی کالاها اولویت دارد.</p>
            <div className={m.scopeRow}>
              <Select label="اعمال روی" value={scope} onChange={(e) => { setScope(e.target.value as Scope); setPicks([]); }} options={[{ value: 'ALL', label: 'همه‌ی کالاها (قانون پیش‌فرض)' }, { value: 'CATEGORY', label: 'دسته‌بندی‌های انتخابی' }, { value: 'ITEM', label: 'کالاها / آیتم‌های انتخابی' }]} />
              {scope !== 'ALL' ? <Field label={scope === 'CATEGORY' ? 'دسته‌بندی' : 'کالا'}><Button variant="secondary" icon={scope === 'CATEGORY' ? <IconCategory size={16} /> : <IconPackage size={16} />} onClick={() => setOpen(true)}>{picks.length ? `ویرایش انتخاب (${faNum(picks.length)})` : scope === 'CATEGORY' ? 'انتخاب دسته‌بندی' : 'انتخاب کالا'}</Button></Field> : null}
            </div>
            {picks.length ? <p className={m.hint} style={{ marginTop: 8 }}>{summarize(picks, '')}</p> : null}
            <div className={m.scopeSep} role="separator" />
            <FormGrid cols={2}>
              <Select label="شرط خریدار" value={buyer} onChange={(e) => setBuyer(e.target.value)} options={BUYER} hint="معافیت صادرات و مناطق آزاد به نوع فروش بسته است، نه مشتری" />
            </FormGrid>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 12 }}>نوع و نرخ</h3>
            <div className={m.radios} role="radiogroup" aria-label="نوع قانون">
              {(Object.keys(KIND) as Kind[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} className={`${s.radioCard} ${kind === k ? s.radioCardOn : ''}`} onClick={() => { setKind(k); if (k === 'ZERO_RATED' && !isEdit) { setBase('GOODS_VALUE'); setBuyer('EXPORT'); setPatterns(['EXPORT']); } }}>
                  <span className={`${s.radio} ${kind === k ? s.radioOn : ''}`} /><span><b>{KIND[k].label}</b><small>{KIND[k].hint}</small></span>
                </button>
              ))}
            </div>
            <div className={m.secGap}>
              {kind === 'PERCENT' ? (
                <FormGrid cols={3}>
                  <Input label="سهم مالیات (٪)" required dir="ltr" inputMode="decimal" value={toFaDigits(vat)} onChange={(e) => setVat(num(e.target.value))} hint="سهم دولت" />
                  <Input label="سهم عوارض (٪)" dir="ltr" inputMode="decimal" value={toFaDigits(duty)} onChange={(e) => setDuty(num(e.target.value))} hint="سهم شهرداری و دهیاری (ماده ۳۹)" />
                  <Field label="جمع نرخ ارزش افزوده"><div className={s.readBox} data-total>{faNum(total)}٪</div></Field>
                </FormGrid>
              ) : kind === 'FIXED_PER_UNIT' ? (
                <FormGrid cols={2}>
                  <Input label="مبلغ ثابت هر واحد (ریال)" required dir="ltr" inputMode="numeric" value={fixed ? faNum(Number(fixed)) : ''} onChange={(e) => setFixed(digits(e.target.value))} />
                  <Input label="واحد" value={fixedUnit} onChange={(e) => setFixedUnit(e.target.value)} placeholder="عدد، بسته، ۵۰ گرم" />
                </FormGrid>
              ) : (
                <Textarea label="علت معافیت و مستند" required value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={kind === 'EXEMPT' ? 'مثال: بند ۱۰ ماده ۹ قانون مالیات بر ارزش افزوده (کتاب و لوازم‌التحریر)' : 'مثال: ماده ۱۰ — صادرات با پروانه‌ی صادراتی گمرک'} hint="گرفتن مالیات از کالای معاف جریمه‌ی دو برابری دارد؛ معافیت را فقط با مستند تعریف کنید." />
              )}
            </div>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>مبنای محاسبه و سامانه مودیان</h3>
            <FormGrid cols={2}>
              <Select label="مبنای محاسبه" value={base} onChange={(e) => setBase(e.target.value)} options={Object.entries(BASE).map(([value, label]) => ({ value, label }))} disabled={kind === 'EXEMPT'} />
              <Select label="گرد کردن مبلغ مالیات" value={round} onChange={(e) => setRound(e.target.value)} options={ROUND} disabled={kind !== 'PERCENT'} />
              <Input label="شناسه‌ی کالا/خدمت (اختیاری)" latin dir="ltr" inputMode="numeric" value={sstid} onChange={(e) => setSstid(digits(e.target.value).slice(0, 13))} placeholder="۱۳ رقم" hint="نرخ باید با نرخ ثبت‌شده‌ی این شناسه در سامانه یکی باشد (خطای ۰۳۴۴)" />
              <Field label="الگوی صورتحساب">
                <div className={m.chipsF} role="group" aria-label="الگوی صورتحساب">
                  {PATTERNS.map((o) => <button key={o.value} type="button" className={m.chipF} aria-pressed={patterns.includes(o.value)} onClick={() => setPatterns((x) => (x.includes(o.value) ? x.filter((y) => y !== o.value) : [...x, o.value]))}>{o.label}</button>)}
                </div>
              </Field>
            </FormGrid>
            <div className={m.scopeSep} role="separator" />
            <div className={m.label}>سایر مالیات و عوارض (اختیاری)</div>
            <FormGrid cols={2}>
              <Input label="عنوان" value={otherTitle} onChange={(e) => setOtherTitle(e.target.value)} placeholder="مثال: عوارض خاص" />
              <Input label="نرخ (٪)" dir="ltr" inputMode="decimal" value={toFaDigits(otherPct)} onChange={(e) => setOtherPct(num(e.target.value))} disabled={!otherTitle.trim()} />
            </FormGrid>
            <div style={{ marginTop: 12 }}><Textarea label="یادداشت" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          </Card>
          <div className={m.actionsBar}>
            <Button onClick={submit} loading={busy} disabled={!canEdit}>{isEdit ? 'ذخیره تغییرات' : 'ثبت قانون'}</Button>
            <Button variant="secondary" onClick={back}>انصراف</Button>
            {isEdit && can('pricing.tax_rules.delete') ? <span style={{ marginInlineStart: 'auto' }} data-tip={q.data?.deletable ? '' : 'قانون شروع شده حذف نمی‌شود؛ با «پایان اعتبار» آن را ببندید'}><Button variant="secondary" disabled={!q.data?.deletable} onClick={() => setDel(true)}>حذف قانون</Button></span> : null}
          </div>
        </div>
        <aside className={m.side}>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 8 }}>پیش‌نمایش محاسبه</h3>
            <div className={m.sumRow}><span>مبلغ نمونه (پس از تخفیف)</span><b>{faNum(sample)} ریال</b></div>
            <div className={m.sumRow}><span>نوع</span><b>{KIND[kind].label}</b></div>
            <div className={m.sumRow}><span>نرخ</span><b data-preview-rate>{kind === 'PERCENT' ? `${faNum(total)}٪` : kind === 'FIXED_PER_UNIT' ? `${fixed ? faNum(Number(fixed)) : '—'} ریال / ${fixedUnit}` : '۰٪'}</b></div>
            <div className={m.sumRow}><span>مالیات و عوارض</span><b data-preview-tax>{kind === 'FIXED_PER_UNIT' ? '— (به تعداد)' : `${faNum(tax)} ریال`}</b></div>
            {otherTitle && otherPct ? <div className={m.sumRow}><span>{otherTitle}</span><b>{faNum(other)} ریال</b></div> : null}
            <div className={m.sumRow}><span>قابل پرداخت</span><b style={{ color: 'var(--brand)' }}>{kind === 'FIXED_PER_UNIT' ? '—' : `${faNum(sample + tax + other)} ریال`}</b></div>
            <div className={m.sumRow}><span>دامنه</span><b>{scope === 'ALL' ? 'همه‌ی کالاها' : summarize(picks, '—')}</b></div>
          </Card>
          <div className={m.sumNote}><IconInfoCircle size={15} style={{ verticalAlign: -3 }} /> پوشاک و منسوجات معاف نیستند و نرخ عمومی (۱۰٪ در ۱۴۰۵) می‌گیرند؛ نرخ عمومی هر سال با قانون بودجه ممکن است تغییر کند.</div>
        </aside>
      </div>
      {del ? <ConfirmModal title="حذف قانون مالیاتی" confirmLabel="حذف کن" danger onClose={() => setDel(false)} text={<>قانون <b>{name}</b> حذف می‌شود.</>} onConfirm={async () => { await w.remove.mutateAsync(editId!); toast('قانون حذف شد.'); navigate('/pricing/tax-rules', { replace: true }); }} /> : null}
      {open && scope !== 'ALL' ? <ScopeModal title={scope === 'CATEGORY' ? 'انتخاب دسته‌بندی' : 'انتخاب کالا'} types={[scope]} value={picks} onClose={() => setOpen(false)} onDone={(p) => { setPicks(p); setOpen(false); }} /> : null}
    </>
  );
}
