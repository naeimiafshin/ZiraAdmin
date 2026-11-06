import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconChartBar } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { usePerm } from '@/shared/auth/usePerm';
import { Toggle } from '@/shared/ui/form';
import { ErrorBox, InfoBanner, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { invalidateSettings, useScoreFactors, type ScoreFactor } from './api';
import { NO_ERRORS, NumField, parseErrors, SaveBar, SettingCard, TextField, TopErrors, trimDecimal, useDraft, type FormErrors } from './ui';
import s from './settings.module.css';

type R = { code: ScoreFactor['code']; code_display: string; title: string; weight: string; is_active: boolean };
const toDraft = (rows: ScoreFactor[]): R[] => rows.map((r) => ({ code: r.code, code_display: r.code_display, title: r.title, weight: trimDecimal(r.weight), is_active: r.is_active }));
const same = (a: R, b: R | undefined) => !!b && a.title.trim() === b.title && Number(a.weight) === Number(b.weight) && a.is_active === b.is_active;

/**
 * فرمول امتیاز خوش‌حسابی (`/settings/score-formula`): ده متغیر ثابت F01…F10؛ فقط عنوان، وزن و فعال بودن قابل تغییر است.
 * PATCH فقط ردیف‌ها و فیلدهای تغییرکرده (هر سه فیلد در بک‌اند اختیاری‌اند، 2026-10-24).
 */
export default function ScoreFormulaPage() {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useScoreFactors();
  const [d, setD] = useDraft(q.data, toDraft);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const editable = can('settings.score_formula.update');
  if (q.isLoading || !d || !q.data) return q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={10} height={56} />;
  const base = toDraft(q.data);
  const changed = d.filter((r, i) => !same(r, base[i]));
  const set = (i: number, patch: Partial<R>) => setD(d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const sum = d.filter((r) => r.is_active).reduce((a, r) => a + (Number(r.weight) || 0), 0);

  const submit = async () => {
    const bad = changed.find((r) => !r.title.trim());
    if (bad) { setErrs({ fields: {}, general: [`عنوان ${bad.code_display} نباید خالی باشد.`] }); return; }
    setBusy(true); setErrs(NO_ERRORS);
    try {
      await adminApi('/settings/score-formula', { method: 'PATCH', body: { rows: changed.map((r) => { const b = base.find((x) => x.code === r.code)!; return { code: r.code, ...(r.title.trim() !== b.title ? { title: r.title.trim() } : {}), ...(Number(r.weight) !== Number(b.weight) ? { weight: r.weight || '0' } : {}), ...(r.is_active !== b.is_active ? { is_active: r.is_active } : {}) }; }) } });
      toast('فرمول امتیاز خوش‌حسابی ذخیره شد.');
      await invalidateSettings(qc, 'score');
    } catch (e) { const p = parseErrors(e, []); setErrs(p); toast(p.general[0] ?? 'ذخیره نشد.', 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="فرمول امتیاز خوش‌حسابی" sub="امتیاز هر مشتری = جمع (وزن × مقدار) متغیرهای فعال" />
      <InfoBanner>ده متغیر ثابت‌اند و اضافه یا حذف نمی‌شوند؛ مقدار هر متغیر را خود سامانه حساب می‌کند. محاسبه‌ی مقدار متغیرها هنوز طراحی نشده است، پس فعلاً فقط عنوان و وزن‌ها را آماده می‌کنید. جمع وزن‌ها لازم نیست ۱۰۰ باشد.</InfoBanner>
      <TopErrors errors={errs} />
      <SettingCard wide icon={<IconChartBar size={20} />} title="متغیرها و وزن‌ها" desc={<>جمع وزن متغیرهای فعال: <b className="tnum">{trimDecimal(sum.toFixed(3)).replace('.', '٫') || '۰'}</b></>}>
        {d.map((r, i) => (
          <div key={r.code} className={`${s.setting} ${changed.includes(r) ? s.changed : ''}`}>
            <div className={s.settingText} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <span className={s.settingTitle} style={{ minWidth: 90 }}>{r.code_display}</span>
              <span className="ltr" data-latin="" style={{ color: 'var(--ink-400)', fontSize: 12 }}>{r.code}</span>
              <TextField label={`عنوان ${r.code_display}`} value={r.title} maxLength={100} disabled={!editable} onChange={(v) => set(i, { title: v })} />
            </div>
            <div className={s.control} style={{ width: 'auto', gap: 22 }}>
              <NumField label={`وزن ${r.code_display}`} value={r.weight} onChange={(v) => set(i, { weight: v })} decimals={3} min={0} max={9999.999} unit="وزن" disabled={!editable} />
              <Toggle checked={r.is_active} onChange={(v) => set(i, { is_active: v })} disabled={!editable} label={r.is_active ? 'فعال' : 'غیرفعال'} />
            </div>
          </div>
        ))}
      </SettingCard>
      {editable ? <SaveBar dirty={changed.length} saving={busy} onSave={submit} onReset={() => { setD(base); setErrs(NO_ERRORS); }} /> : null}
    </>
  );
}
