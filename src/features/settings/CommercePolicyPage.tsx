import { useState, type ReactNode } from 'react';
import {
  IconBuildingBank, IconCash, IconClockHour4, IconDiscount2, IconLock, IconReceipt2, IconShoppingCart, IconTag,
} from '@tabler/icons-react';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime } from '@/shared/lib/format';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { Dropdown } from '@/shared/ui/Dropdown';
import { Toggle } from '@/shared/ui/form';
import { ErrorBox, InfoBanner, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { Stepper } from '@/shared/ui/Stepper';
import { useToast } from '@/shared/ui/toast';
import { useCommercePolicy, useSaveSetting, type CommercePolicy } from './api';
import { changedKeys, NO_ERRORS, NumField, parseErrors, Row, SaveBar, SettingCard, SubBox, TopErrors, trimDecimal, useDraft, type FormErrors } from './ui';
import s from './settings.module.css';

/**
 * فیلدهای «سیاست فروش و پرداخت» (CommercePolicyUpdateIn). برچسب و توضیح از یادداشت‌های مدل بک‌اند، تأیید افشین 2026-10-24.
 * int ⇐ Stepper؛ dec/money ⇐ NumField (بازه و دقت = schema)؛ nint ⇐ کلید «تعیین‌شده» + Stepper (null = تعیین‌نشده).
 */
type Kind = 'int' | 'dec' | 'money' | 'bool' | 'nint' | 'branch';
type F = { key: keyof CommercePolicy & string; title: string; desc?: string; kind: Kind; unit?: string; min?: number; max?: number; decimals?: number; when?: (d: Draft) => boolean };
type Draft = Record<string, string | number | boolean | null>;

const PCT = { kind: 'dec' as const, unit: '٪', decimals: 2, min: 0, max: 100 };
const RIAL = { kind: 'money' as const, unit: 'ریال', min: 0 };

const CARDS: { icon: ReactNode; title: string; desc: string; fields: F[]; wide?: boolean; split?: number }[] = [
  {
    icon: <IconReceipt2 size={20} />, title: 'پیش‌فاکتور و رزرو کالا', desc: 'اعتبار پیش‌فاکتور و نگه‌داشتن موجودی برای سفارش',
    fields: [
      { key: 'proforma_valid_days', title: 'مهلت اعتبار پیش‌فاکتور', desc: 'چند روز قیمت پیش‌فاکتور معتبر است و کالا برای مشتری رزرو می‌ماند؛ بعد از آن قیمت منقضی و رزرو آزاد می‌شود.', kind: 'int', unit: 'روز', min: 1, max: 365 },
      { key: 'floating_phase_hours', title: 'مهلت پرداخت سفارش شناور', desc: 'سفارشی که هنوز کامل پرداخت نشده، تا این مدت فرصت تکمیل پرداخت دارد؛ بعد از آن موجودی آزاد می‌شود.', kind: 'int', unit: 'ساعت', min: 1, max: 720 },
      { key: 'stock_lock_min_paid_pct', title: 'حداقل پرداخت برای قفل موجودی', desc: 'وقتی پرداخت‌های تأییدشده‌ی سفارش به این درصد برسد، کالا برای سفارش قفل می‌شود.', ...PCT },
    ],
  },
  {
    icon: <IconCash size={20} />, title: 'بیعانه', desc: 'پیش‌خرید و پیش‌فروش',
    fields: [
      { key: 'preorder_deposit_pct', title: 'بیعانه‌ی پیش‌خرید', ...PCT },
      { key: 'presale_deposit_pct', title: 'بیعانه‌ی پیش‌فروش', desc: 'هر دوره‌ی پیش‌فروش می‌تواند مقدار خودش را داشته باشد؛ این مقدار پیش‌فرض است.', ...PCT },
      { key: 'deposit_rounding_rial', title: 'گرد کردن مبلغ بیعانه', desc: 'مبلغ بیعانه به مضربی از این عدد گرد می‌شود.', ...RIAL, min: 1 },
    ],
  },
  {
    icon: <IconDiscount2 size={20} />, title: 'تخفیف‌های تسویه و بازگشت وجه', desc: 'تشویق مشتری به پرداخت نقدی و زودتر از موعد',
    fields: [
      { key: 'full_settlement_discount_pct', title: 'تخفیف تسویه‌ی کامل نقدی', ...PCT },
      { key: 'early_settlement_enabled', title: 'تخفیف تسویه‌ی زودهنگام', desc: 'برای چک یا بدهی‌ای که زودتر از سررسید پرداخت شود.', kind: 'bool' },
      { key: 'early_settlement_discount_pct_per_month', title: 'درصد تخفیف برای هر ماه زودتر', desc: 'ماه‌ها رو به پایین شمرده می‌شوند؛ ۱ ماه و ۲۹ روز یعنی ۱ ماه.', ...PCT, when: (d) => !!d.early_settlement_enabled },
      { key: 'cashback_pct', title: 'درصد بازگشت وجه (کش‌بک)', desc: '۰ یعنی خاموش.', ...PCT },
      { key: 'cashback_coupon_valid_days', title: 'اعتبار کد بازگشت وجه', desc: '۰ یعنی بدون انقضا.', kind: 'int', unit: 'روز', min: 0, max: 3650 },
    ],
  },
  {
    icon: <IconShoppingCart size={20} />, title: 'پنل مشتری و پرداخت آنلاین', desc: 'سفارش‌هایی که مشتری خودش ثبت می‌کند',
    fields: [
      { key: 'online_default_branch_id', title: 'شعبه‌ی پیش‌فرض سفارش‌های آنلاین', desc: 'سندهای پنل مشتری به این شعبه تعلق می‌گیرند.', kind: 'branch' },
      { key: 'bank_account_hold_minutes', title: 'مدت رزرو حساب در پرداخت آنلاین', desc: 'ظرفیت حساب بانکی چند دقیقه برای پرداخت درگاه نگه داشته می‌شود.', kind: 'int', unit: 'دقیقه', min: 1, max: 1440 },
      { key: 'otp_resend_seconds', title: 'فاصله‌ی ارسال دوباره‌ی کد پیامکی', kind: 'int', unit: 'ثانیه', min: 1, max: 3600 },
    ],
  },
  {
    icon: <IconBuildingBank size={20} />, title: 'چک و «راس»', desc: '«راس» یعنی میانگین وزنی سررسید چک‌ها. راس چک برای اعتبار چکی و راس اعتباری برای اعتبار طلایی است.',
    wide: true, split: 6,
    fields: [
      { key: 'cheque_benchmark_months', title: 'سررسید مبنای چک', desc: 'راس چک‌های مشتری با این مقدار مقایسه می‌شود.', kind: 'int', unit: 'ماه', min: 1, max: 24 },
      { key: 'cheque_early_discount_pct_per_month', title: 'تخفیف هر ماه زودتر از مبنا', ...PCT },
      { key: 'cheque_late_surcharge_pct_per_month', title: 'جریمه‌ی هر ماه دیرتر از مبنا', ...PCT },
      { key: 'third_party_cheque_weight', title: 'وزن چک شخص ثالث', desc: 'وزن چک‌های برگشتیِ صادرشده از دیگران در جمع چک‌های برگشتی مشتری.', kind: 'dec', decimals: 2, min: 0, max: 99.99, unit: 'برابر' },
      { key: 'cheque_reminder_days_1', title: 'یادآور اول پیش از سررسید چک', kind: 'int', unit: 'روز', min: 1, max: 365 },
      { key: 'cheque_reminder_days_2', title: 'یادآور دوم پیش از سررسید چک', desc: 'باید کمتر از یادآور اول باشد.', kind: 'int', unit: 'روز', min: 1, max: 365 },
      { key: 'cheque_raas_cap_amount', title: 'سقف مبلغ راس چک', desc: 'چک‌ها تا این مبلغ در محاسبه‌ی راس اعتبار چکی پذیرفته می‌شوند.', ...RIAL },
      { key: 'cheque_raas_cap_days', title: 'سقف مدت راس چک', desc: 'چک‌ها تا این مدت در محاسبه‌ی راس اعتبار چکی پذیرفته می‌شوند.', kind: 'int', unit: 'روز', min: 1, max: 3650 },
      { key: 'credit_raas_cap_amount', title: 'سقف مبلغ راس اعتباری', desc: 'برای اعتبار طلایی، تا این مبلغ.', ...RIAL },
      { key: 'credit_raas_cap_days', title: 'سقف مدت راس اعتباری', desc: 'برای اعتبار طلایی، تا این مدت.', kind: 'int', unit: 'روز', min: 1, max: 3650 },
      { key: 'raas_max_days', title: 'بیشترین مدت مجاز راس', kind: 'int', unit: 'روز', min: 1, max: 3650 },
    ],
  },
  {
    icon: <IconClockHour4 size={20} />, title: 'مهلت‌های پیش‌فرض حساب مشتری', desc: 'برای مشتری‌ای که مقدار خودش را ندارد',
    fields: [
      { key: 'default_cheque_max_due_months', title: 'مهلت پیش‌فرض حساب اعتباری تازه', desc: 'مهلت حساب چکی یا طلایی تازه با این مقدار پر می‌شود؛ «تعیین‌نشده» یعنی ۱ ماه.', kind: 'nint', unit: 'ماه', min: 1, max: 24 },
      { key: 'default_payment_due_days', title: 'مهلت پیش‌فرض پرداخت فاکتور', desc: 'برای مشتری‌ای که مهلت پرداخت خودش را ندارد.', kind: 'nint', unit: 'روز', min: 1, max: 3650 },
    ],
  },
  {
    icon: <IconLock size={20} />, title: 'قفل خودکار با چک برگشتی', desc: 'حساب مشتری با رسیدن به هر یک از این دو حد قفل می‌شود',
    fields: [
      { key: 'bounced_cheque_lock_count', title: 'تعداد چک برگشتی برای قفل حساب', kind: 'int', unit: 'چک', min: 1, max: 100 },
      { key: 'bounced_cheque_lock_amount', title: 'مبلغ چک برگشتی برای قفل حساب', desc: '۰ یعنی شرط مبلغ ندارد.', ...RIAL },
    ],
  },
  {
    icon: <IconTag size={20} />, title: 'قیمت آیتم', desc: 'محافظت در برابر کاهش ناخواسته‌ی قیمت', wide: true,
    fields: [
      { key: 'max_item_price_drop_pct', title: 'بیشترین کاهش قیمت آیتم در هر بار', desc: 'فقط وقتی درصد تعدیل آیتم دستی تغییر می‌کند؛ تغییر ناشی از قیمت کالاها محدود نیست.', ...PCT, min: 1 },
    ],
  },
];
const ALL = CARDS.flatMap((c) => c.fields);
/** کارت‌های پهن جدا؛ بقیه دوتایی در یک سطر هم‌ارتفاع */
const blocks: (typeof CARDS)[] = [];
for (const c of CARDS) { const last = blocks[blocks.length - 1]; if (c.wide || !last || last.length === 2 || last[0]!.wide) blocks.push([c]); else last.push(c); }
const FIELD_KEYS = ALL.map((f) => f.key);

const toDraft = (p: CommercePolicy): Draft =>
  Object.fromEntries(ALL.map((f) => {
    const v = p[f.key] as unknown;
    return [f.key, f.kind === 'dec' || f.kind === 'money' ? trimDecimal(v as string) : (v as Draft[string])];
  }));

/** سیاست فروش و پرداخت (`/settings/commerce-policy`): کارت‌های تنظیمات، پیش‌نویس و ذخیره‌ی جزئی (PATCH فقط فیلدهای تغییرکرده). */
export default function CommercePolicyPage() {
  const can = usePerm();
  const toast = useToast();
  const q = useCommercePolicy();
  const save = useSaveSetting<CommercePolicy>('commerce', '/settings/commerce-policy');
  const branches = useBranchOptions();
  const [d, setD] = useDraft(q.data, toDraft);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const editable = can('settings.commerce_policy.update');
  // شعبه‌ی آنلاین را فقط مدیر ارشد تعیین یا عوض می‌کند (بک‌اند ۴۰۳؛ یادداشت ONLINE_BRANCH_2026-10-25)
  const isSuper = !!useAuth().user?.is_superuser;

  if (q.isLoading || !d || !q.data) return q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={8} height={80} />;
  const base = toDraft(q.data);
  const changed = changedKeys(d, base);
  const set = (k: string, v: Draft[string]) => { setD({ ...d, [k]: v }); if (errs.fields[k]) setErrs({ ...errs, fields: { ...errs.fields, [k]: '' } }); };
  // قاعده‌ی بک‌اند: یادآور اول > یادآور دوم (پیش از ارسال هم نشان داده می‌شود)
  const reminderErr = Number(d.cheque_reminder_days_1) <= Number(d.cheque_reminder_days_2) ? 'یادآور اول باید بیشتر از یادآور دوم باشد.' : '';

  const submit = () => {
    const body = Object.fromEntries(changed.map((k) => [k, d[k] === '' ? null : d[k]]));
    setErrs(NO_ERRORS);
    save.mutate(body, {
      onSuccess: () => toast('سیاست فروش و پرداخت ذخیره شد.'),
      onError: (e) => { const p = parseErrors(e, FIELD_KEYS); setErrs(p); toast(p.general[0] ?? 'برخی مقادیر معتبر نیستند؛ ردیف‌های مشخص‌شده را اصلاح کنید.', 'error'); },
    });
  };

  const control = (f: F) => {
    const v = d[f.key];
    const off = !editable;
    switch (f.kind) {
      case 'bool': return <Toggle checked={!!v} onChange={(x) => set(f.key, x)} disabled={off} label={v ? 'فعال' : 'غیرفعال'} />;
      case 'int': return <Stepper label={f.title} value={Number(v)} onChange={(x) => set(f.key, x)} min={f.min} max={f.max} unit={f.unit} disabled={off} />;
      case 'dec': return <NumField label={f.title} value={String(v ?? '')} onChange={(x) => set(f.key, x)} decimals={f.decimals} min={f.min} max={f.max} unit={f.unit} disabled={off} />;
      case 'money': return <NumField label={f.title} value={String(v ?? '')} onChange={(x) => set(f.key, x)} min={f.min} unit={f.unit} group wide disabled={off} />;
      case 'nint': return <Toggle checked={v !== null} onChange={(x) => set(f.key, x ? (base[f.key] ?? f.min ?? 1) : null)} disabled={off} label={v !== null ? 'تعیین‌شده' : 'تعیین‌نشده'} />;
      case 'branch': {
        const list = branches.data ?? [];
        const known = !v || list.some((b) => b.id === v);
        const opts = [...list.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })), ...(known ? [] : [{ value: String(v), label: isSuper ? 'شعبه‌ی ناشناخته' : 'تعیین‌شده (بیرون از شعب قابل‌مشاهده‌ی شما)' }])];
        return (
          <div style={{ width: 230 }}>
            <Dropdown aria-label={f.title} value={String(v ?? '')} placeholder="تعیین‌نشده" options={opts} disabled={off || !branches.canList || !isSuper}
              onChange={(e) => set(f.key, (e.target as HTMLSelectElement).value || null)} />
            {!isSuper ? <small className={s.fieldNote}>فقط مدیر ارشد این شعبه را تعیین می‌کند.</small> : null}
          </div>
        );
      }
    }
  };
  const row = (f: F) => {
    const err = errs.fields[f.key] || (f.key === 'cheque_reminder_days_2' ? reminderErr : '');
    const r = <Row key={f.key} title={f.title} desc={f.desc} error={err} changed={changed.includes(f.key)}>{control(f)}</Row>;
    if (f.kind === 'nint' && d[f.key] !== null) {
      return <div key={f.key}>{r}<SubBox><Row title="مقدار"><Stepper label={f.title} value={Number(d[f.key])} onChange={(x) => set(f.key, x)} min={f.min} max={f.max} unit={f.unit} disabled={!editable} /></Row></SubBox></div>;
    }
    return r;
  };
  const renderFields = (fields: F[]) => {
    const out: ReactNode[] = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]!;
      if (f.when) continue;
      out.push(row(f));
      const deps = fields.filter((x) => x.when && fields.indexOf(x) === i + 1);
      if (deps.length && deps.every((x) => x.when!(d))) out.push(<SubBox key={`${f.key}-sub`}>{deps.map(row)}</SubBox>);
    }
    return out;
  };

  return (
    <>
      <PageHead title="سیاست فروش و پرداخت" sub={`قواعد سفارش، بیعانه، چک و پرداخت که در همه‌ی شعب و پنل مشتری اعمال می‌شود — آخرین تغییر: ${faDateTime(q.data.updated_at)}`} />
      {!editable ? <InfoBanner>مجوز ویرایش این تنظیمات را ندارید؛ فقط مقدارها نمایش داده می‌شود.</InfoBanner> : null}
      {!branches.canList ? <InfoBanner tone="warning">برای انتخاب شعبه‌ی پیش‌فرض سفارش‌های آنلاین، مجوز دیدن فهرست شعب لازم است.</InfoBanner> : null}
      <TopErrors errors={errs} />
      {blocks.map((b, i) => (b.length === 1 && b[0]!.wide
        ? <SettingCard key={b[0]!.title} wide icon={b[0]!.icon} title={b[0]!.title} desc={b[0]!.desc}>
          {b[0]!.split ? <div className={s.cols2}><div>{renderFields(b[0]!.fields.slice(0, b[0]!.split))}</div><div>{renderFields(b[0]!.fields.slice(b[0]!.split))}</div></div> : renderFields(b[0]!.fields)}
        </SettingCard>
        : <div key={i} className={s.grid2}>{b.map((c) => <SettingCard key={c.title} icon={c.icon} title={c.title} desc={c.desc}>{renderFields(c.fields)}</SettingCard>)}</div>))}
      {editable ? <SaveBar dirty={changed.length} saving={save.isPending} onSave={submit} onReset={() => { setD(base); setErrs(NO_ERRORS); }}
        note="تغییرات روی سفارش‌ها و سندهای بعدی اعمال می‌شود." /> : null}
    </>
  );
}
