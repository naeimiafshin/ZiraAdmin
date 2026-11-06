import { useState } from 'react';
import { IconEye } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime } from '@/shared/lib/format';
import { Toggle } from '@/shared/ui/form';
import { ErrorBox, InfoBanner, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useCatalogDisplay, useSaveSetting, type CatalogDisplay } from './api';
import { changedKeys, NO_ERRORS, parseErrors, Row, SaveBar, SettingCard, TopErrors, useDraft, type FormErrors } from './ui';

type Draft = { show_prices: boolean; show_stock: boolean };
const toDraft = (p: CatalogDisplay): Draft => ({ show_prices: p.show_prices, show_stock: p.show_stock });

/** نمایش کاتالوگ (`/settings/catalog-display`): قیمت در سایت عمومی و موجودی در سایت و پنل مشتری. */
export default function CatalogDisplayPage() {
  const can = usePerm();
  const toast = useToast();
  const q = useCatalogDisplay();
  const save = useSaveSetting<CatalogDisplay>('display', '/settings/catalog-display');
  const [d, setD] = useDraft(q.data, toDraft);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const editable = can('settings.catalog_display.update');
  if (q.isLoading || !d || !q.data) return q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={3} height={80} />;
  const base = toDraft(q.data);
  const changed = changedKeys(d, base);
  const submit = () => {
    setErrs(NO_ERRORS);
    save.mutate(Object.fromEntries(changed.map((k) => [k, d[k]])), {
      onSuccess: () => toast('تنظیمات نمایش کاتالوگ ذخیره شد.'),
      onError: (e) => { const p = parseErrors(e, ['show_prices', 'show_stock']); setErrs(p); toast(p.general[0] ?? 'ذخیره نشد.', 'error'); },
    });
  };
  return (
    <>
      <PageHead title="نمایش کاتالوگ" sub={`آنچه مشتری و بازدیدکننده‌ی سایت از کالاها می‌بینند — آخرین تغییر: ${faDateTime(q.data.updated_at)}`} />
      {!editable ? <InfoBanner>مجوز ویرایش این تنظیمات را ندارید؛ فقط مقدارها نمایش داده می‌شود.</InfoBanner> : null}
      <TopErrors errors={errs} />
      {/* کارت تکی تمام‌عرض، هم‌عرض نوار ذخیره (افشین 2026-10-25) */}
      <SettingCard wide icon={<IconEye size={20} />} title="قیمت و موجودی" desc="هر دو به‌طور پیش‌فرض خاموش‌اند">
        <Row title="نمایش قیمت در سایت عمومی" desc="وقتی خاموش است، قیمت اصلاً در پاسخ سایت عمومی (بدون ورود) فرستاده نمی‌شود." error={errs.fields.show_prices} changed={changed.includes('show_prices')}>
          <Toggle checked={d.show_prices} onChange={(v) => setD({ ...d, show_prices: v })} disabled={!editable} label={d.show_prices ? 'نمایش' : 'پنهان'} />
        </Row>
        <Row title="نمایش موجودی" desc="یک کلید برای سایت عمومی و پنل مشتری؛ وقتی خاموش است هیچ مشتری و بازدیدکننده‌ای موجودی کالا را نمی‌بیند." error={errs.fields.show_stock} changed={changed.includes('show_stock')}>
          <Toggle checked={d.show_stock} onChange={(v) => setD({ ...d, show_stock: v })} disabled={!editable} label={d.show_stock ? 'نمایش' : 'پنهان'} />
        </Row>
      </SettingCard>
      {editable ? <SaveBar dirty={changed.length} saving={save.isPending} onSave={submit} onReset={() => setD(base)} /> : null}
    </>
  );
}
