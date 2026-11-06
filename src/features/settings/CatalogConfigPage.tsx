import { useState } from 'react';
import { IconBarcode, IconBox } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { Toggle } from '@/shared/ui/form';
import { ErrorBox, InfoBanner, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { Stepper } from '@/shared/ui/Stepper';
import { useToast } from '@/shared/ui/toast';
import { useCatalogConfig, useSaveSetting, type CatalogConfig } from './api';
import { changedKeys, NO_ERRORS, parseErrors, Row, SaveBar, SettingCard, SubBox, TextField, TopErrors, useDraft, type FormErrors } from './ui';
import s from './settings.module.css';

type QtyKey = 'max_order_qty' | 'max_preorder_qty' | 'max_stock_cap' | 'reorder_threshold' | 'sales_target';
type Draft = { barcode_prefix: string; min_order_qty: number } & Record<QtyKey, number | null>;
const NULLABLE: { key: QtyKey; title: string; desc: string; on: string }[] = [
  { key: 'max_order_qty', title: 'حداکثر تعداد سفارش', desc: 'بیشترین تعداد یک کالا که یک مشتری در یک فاکتور می‌خرد.', on: 'سقف دارد' },
  { key: 'max_preorder_qty', title: 'حداکثر پیش‌سفارش', desc: 'بیشترین تعداد پیش‌سفارش یک کالا.', on: 'سقف دارد' },
  { key: 'max_stock_cap', title: 'سقف موجودی انبار', desc: 'پیش‌فرض؛ هر انبار می‌تواند مقدار خودش را داشته باشد.', on: 'سقف دارد' },
  { key: 'reorder_threshold', title: 'آستانه‌ی سفارش مجدد', desc: 'وقتی موجودی به این عدد برسد کالا «کم‌موجود» حساب می‌شود؛ هر انبار می‌تواند مقدار خودش را داشته باشد.', on: 'تعیین‌شده' },
  { key: 'sales_target', title: 'هدف فروش', desc: 'تعداد هدف فروش کالای تازه.', on: 'تعیین‌شده' },
];
// از 2026-10-24 بک‌اند مقدارها را عدد صحیح می‌دهد؛ رشته‌ی قدیمی ("1.000") هم پذیرفته می‌شود.
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v)));
const toDraft = (c: CatalogConfig): Draft => ({
  barcode_prefix: c.barcode_prefix, min_order_qty: num(c.min_order_qty) ?? 1,
  ...Object.fromEntries(NULLABLE.map((f) => [f.key, num(c[f.key])])) as Record<QtyKey, number | null>,
});
const FIELDS = ['barcode_prefix', 'min_order_qty', ...NULLABLE.map((f) => f.key)];
const MAX = 1_000_000;

/** پیش‌فرض‌های کاتالوگ (`/settings/catalog-config`): پیشوند بارکد داخلی و پیش‌فرض سیاست سفارش هر کالای تازه (فقط عدد صحیح). */
export default function CatalogConfigPage() {
  const can = usePerm();
  const toast = useToast();
  const q = useCatalogConfig();
  const save = useSaveSetting<CatalogConfig>('catalog-config', '/settings/catalog-config');
  const [d, setD] = useDraft(q.data, toDraft);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const editable = can('settings.catalog_config.update');
  if (q.isLoading || !d || !q.data) return q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={6} height={80} />;
  const base = toDraft(q.data);
  const changed = changedKeys(d, base);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const prefixBad = !/^2[0-9]{2}$/.test(d.barcode_prefix);
  const local: Record<string, string> = {
    barcode_prefix: prefixBad ? 'سه رقم از ۲۰۰ تا ۲۹۹.' : '',
    max_order_qty: d.max_order_qty !== null && d.max_order_qty < d.min_order_qty ? 'نباید کمتر از حداقل تعداد سفارش باشد.' : '',
    reorder_threshold: d.reorder_threshold !== null && d.max_stock_cap !== null && d.reorder_threshold > d.max_stock_cap ? 'نباید بیشتر از سقف موجودی انبار باشد.' : '',
  };
  const submit = () => {
    setErrs(NO_ERRORS);
    save.mutate(Object.fromEntries(changed.map((k) => [k, d[k]])), {
      onSuccess: () => toast('پیش‌فرض‌های کاتالوگ ذخیره شد.'),
      onError: (e) => { const p = parseErrors(e, FIELDS); setErrs(p); toast(p.general[0] ?? 'برخی مقادیر معتبر نیستند.', 'error'); },
    });
  };
  const err = (k: string) => errs.fields[k] || local[k] || '';
  return (
    <>
      <PageHead title="پیش‌فرض‌های کاتالوگ" sub={`مقدارهایی که هنگام تعریف کالای تازه پیش‌پر می‌شوند — آخرین تغییر: ${faDateTime(q.data.updated_at)}`} />
      {!editable ? <InfoBanner>مجوز ویرایش این تنظیمات را ندارید؛ فقط مقدارها نمایش داده می‌شود.</InfoBanner> : null}
      <TopErrors errors={errs} />
      <div className={s.grid2}>
        <SettingCard icon={<IconBox size={20} />} title="سیاست سفارش کالای تازه" desc="همه‌ی مقدارها عدد صحیح‌اند. تغییر فقط روی کالاهایی که بعد از این تعریف می‌شوند اثر دارد.">
          <Row title="حداقل تعداد سفارش" error={err('min_order_qty')} changed={changed.includes('min_order_qty')}>
            <Stepper label="حداقل تعداد سفارش" value={d.min_order_qty} onChange={(v) => set('min_order_qty', v)} min={1} max={MAX} unit="عدد" disabled={!editable} />
          </Row>
          {NULLABLE.map((f) => (
            <div key={f.key}>
              <Row title={f.title} desc={f.desc} error={err(f.key)} changed={changed.includes(f.key)}>
                <Toggle checked={d[f.key] !== null} onChange={(v) => set(f.key, v ? (base[f.key] ?? (f.key === 'max_order_qty' ? Math.max(d.min_order_qty, 1) : 1)) : null)} disabled={!editable}
                  label={d[f.key] !== null ? f.on : f.on === 'سقف دارد' ? 'بدون سقف' : 'تعیین‌نشده'} />
              </Row>
              {d[f.key] !== null ? (
                <SubBox><Row title="مقدار"><Stepper label={f.title} value={d[f.key] as number} onChange={(v) => set(f.key, v)} min={0} max={MAX} unit="عدد" disabled={!editable} /></Row></SubBox>
              ) : null}
            </div>
          ))}
        </SettingCard>
        <SettingCard icon={<IconBarcode size={20} />} title="بارکد داخلی" desc="بارکد EAN-13 کالاهایی که بارکد کارخانه ندارند">
          <Row title="پیشوند بارکد" desc="سه رقم اول بارکد داخلی، از ۲۰۰ تا ۲۹۹ (بازه‌ی استاندارد بارکد داخلی فروشگاه)." error={err('barcode_prefix')} changed={changed.includes('barcode_prefix')}>
            <TextField latin label="پیشوند بارکد" value={d.barcode_prefix} maxLength={3} disabled={!editable}
              onChange={(v) => set('barcode_prefix', toLatinDigits(v).replace(/\D/g, '').slice(0, 3))} />
          </Row>
          <Row title="نمونه‌ی بارکد" desc="پیشوند + شماره‌ی سریال ۹ رقمی (از «شماره‌گذاری») + رقم کنترل" wideControl>
            <span className="ltr" data-latin="" style={{ fontWeight: 800, letterSpacing: 1 }}>{(prefixBad ? '2••' : d.barcode_prefix) + ' 000000001 ?'}</span>
          </Row>
        </SettingCard>
      </div>
      {editable ? <SaveBar dirty={changed.length} saving={save.isPending} onSave={submit} onReset={() => { setD(base); setErrs(NO_ERRORS); }} /> : null}
    </>
  );
}
