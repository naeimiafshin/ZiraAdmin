import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconPercentage } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { ErrorBox, InfoBanner, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { invalidateSettings, useGradePolicies, type GradePolicy } from './api';
import { NO_ERRORS, NumField, parseErrors, Row, SaveBar, SettingCard, TopErrors, trimDecimal, useDraft, type FormErrors } from './ui';

type Draft = Record<number, string>;
const toDraft = (rows: GradePolicy[]): Draft => Object.fromEntries(rows.map((r) => [r.grade, trimDecimal(r.default_discount_pct)]));
const DESC: Record<number, string> = {
  1: 'گرید ۱ کالای سالم است و همیشه ۰٪؛ قابل تغییر نیست.',
  2: 'وقتی کالایی در انبار به گرید ۲ تغییر می‌کند، قیمت کالای تازه با این درصد کاهش پیش‌پر می‌شود.',
  3: 'وقتی کالایی در انبار به گرید ۳ تغییر می‌کند، قیمت کالای تازه با این درصد کاهش پیش‌پر می‌شود.',
};

/** تخفیف پیش‌فرض گریدها (`/settings/grade-policies`): سه ردیف ثابت؛ هر ردیف تغییرکرده جدا با PUT ذخیره می‌شود. */
export default function GradePolicyPage() {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useGradePolicies();
  const [d, setD] = useDraft(q.data, toDraft);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const editable = can('settings.grade_policy.update');
  if (q.isLoading || !d || !q.data) return q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={3} height={70} />;
  const base = toDraft(q.data);
  const changed = q.data.filter((r) => Number(d[r.grade]) !== Number(base[r.grade])).map((r) => r.grade);
  const submit = async () => {
    setBusy(true); setErrs(NO_ERRORS);
    const fields: Record<string, string> = {};
    for (const g of changed) {
      try { await adminApi(`/settings/grade-policies/${g}`, { method: 'PUT', body: { default_discount_pct: d[g] } }); } catch (e) {
        const p = parseErrors(e, ['default_discount_pct']);
        fields[String(g)] = p.fields.default_discount_pct || p.general[0] || 'ذخیره نشد.';
      }
    }
    await invalidateSettings(qc, 'grades');
    setBusy(false);
    if (Object.keys(fields).length) { setErrs({ fields, general: [] }); toast('برخی گریدها ذخیره نشد؛ ردیف‌های مشخص‌شده را ببینید.', 'error'); } else toast('تخفیف پیش‌فرض گریدها ذخیره شد.');
  };
  return (
    <>
      <PageHead title="تخفیف پیش‌فرض گریدها" sub="درصد کاهش قیمت کالایی که در انبار به گرید پایین‌تر تغییر می‌کند" />
      {!editable ? <InfoBanner>مجوز ویرایش این تنظیمات را ندارید؛ فقط مقدارها نمایش داده می‌شود.</InfoBanner> : null}
      <TopErrors errors={errs} />
      {/* کارت تکی تمام‌عرض، هم‌عرض نوار ذخیره (افشین 2026-10-25) */}
      <SettingCard wide icon={<IconPercentage size={20} />} title="درصد کاهش قیمت هر گرید" desc="هنگام ثبت تغییر گرید در انبار پیش‌پر می‌شود و همان‌جا قابل تغییر است">
        {q.data.map((r) => (
          <Row key={r.grade} title={`گرید ${faNum(r.grade)}`} desc={DESC[r.grade]} error={errs.fields[String(r.grade)]} changed={changed.includes(r.grade)}>
            <NumField label={`درصد کاهش گرید ${r.grade}`} value={d[r.grade] ?? ''} onChange={(v) => setD({ ...d, [r.grade]: v })} decimals={2} min={0} max={r.grade === 1 ? 0 : 100} unit="٪" disabled={!editable || r.grade === 1} />
          </Row>
        ))}
      </SettingCard>
      {editable ? <SaveBar dirty={changed.length} saving={busy} onSave={submit} onReset={() => { setD(base); setErrs(NO_ERRORS); }} /> : null}
    </>
  );
}
