import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconArrowDown, IconArrowUp, IconTextSize } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { usePerm } from '@/shared/auth/usePerm';
import { Toggle } from '@/shared/ui/form';
import { ErrorBox, InfoBanner, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { invalidateSettings, useNamingRule, type NamingPart } from './api';
import { IconBtn, NO_ERRORS, parseErrors, SaveBar, SettingCard, TextField, TopErrors, useDraft, type FormErrors } from './ui';
import s from './settings.module.css';

type P = { part: NamingPart['part']; part_display: string; label: string; is_active: boolean };
const toDraft = (rows: NamingPart[]): P[] => rows.map((r) => ({ part: r.part, part_display: r.part_display, label: r.label, is_active: r.is_active }));
/** مقدار نمونه‌ی هر جزء برای پیش‌نمایش (فقط نمایش) */
const SAMPLE: Record<string, string> = { PRODUCT_NAME: 'تیشرت مردانه نخی', GOODS_COUNT: '۶ عددی', SIZE: 'L', COLOR: 'سرمه‌ای', GRADE: '۱' };
const sig = (rows: P[]) => JSON.stringify(rows.map((r) => [r.part, r.label.trim(), r.is_active]));

/**
 * قاعده‌ی نام‌گذاری آیتم (`/settings/naming-rules/ITEM`): ترتیب اجزای نام آیتم، متن پیش از هر جزء و روشن/خاموش.
 * PUT کل قاعده را جایگزین می‌کند (ترتیب آرایه = ترتیب در نام). نام خانواده و کالای تکی از چک‌باکس‌های هر خانواده ساخته می‌شود، نه از این‌جا.
 */
export default function NamingRulePage() {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useNamingRule();
  const [d, setD] = useDraft(q.data, toDraft);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const editable = can('settings.naming_rule.update');
  if (q.isLoading || !d || !q.data) return q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={5} height={56} />;
  const base = toDraft(q.data);
  const dirty = sig(d) !== sig(base);
  const move = (i: number, by: -1 | 1) => { const n = [...d]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x!); setD(n); };
  const set = (i: number, patch: Partial<P>) => setD(d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const preview = d.filter((r) => r.is_active).map((r) => [r.label.trim(), SAMPLE[r.part] ?? r.part_display].filter(Boolean).join(' ')).join(' ');

  const submit = async () => {
    setBusy(true); setErrs(NO_ERRORS);
    try {
      await adminApi('/settings/naming-rules/ITEM', { method: 'PUT', body: { parts: d.map((r) => ({ part: r.part, label: r.label.trim(), is_active: r.is_active })) } });
      toast('قاعده‌ی نام‌گذاری ذخیره شد.');
      await invalidateSettings(qc, 'naming');
    } catch (e) { const p = parseErrors(e, []); setErrs(p); toast(p.general[0] ?? 'ذخیره نشد.', 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="قاعده‌ی نام‌گذاری کالا" sub="این قاعده فقط برای آیتم‌هاست: نام پیشنهادی آیتم (واحد فروش) هنگام ساخت، از این اجزا و به همین ترتیب ساخته می‌شود" />
      <InfoBanner>تغییر قاعده فقط روی آیتم‌هایی اثر دارد که بعد از این ساخته می‌شوند؛ نام آیتم‌های موجود عوض نمی‌شود (و همیشه دستی قابل ویرایش است). نام خانواده و کالای تکی با چک‌باکس‌های فرم هر خانواده تعیین می‌شود.</InfoBanner>
      <TopErrors errors={errs} />
      <SettingCard wide icon={<IconTextSize size={20} />} title="اجزای نام آیتم" desc="«متن پیش از مقدار» قبل از مقدار جزء می‌آید؛ مثلاً «رنگ» ⇐ «رنگ سرمه‌ای». خالی یعنی فقط مقدار.">
        {d.map((r, i) => (
          <div key={r.part} className={`${s.partRow} ${r.is_active ? '' : s.partOff}`}>
            <span className={s.partNo}>{i + 1}</span>
            <span className={s.partName}>{r.part_display}</span>
            <TextField label={`متن پیش از ${r.part_display}`} value={r.label} placeholder="بدون متن" maxLength={100} disabled={!editable} onChange={(v) => set(i, { label: v })} />
            <span className={s.partSample}>نمونه: {[r.label.trim(), SAMPLE[r.part]].filter(Boolean).join(' ')}</span>
            <span className={s.partMove}>
              <IconBtn label={`بالا بردن ${r.part_display}`} disabled={!editable || i === 0} onClick={() => move(i, -1)}><IconArrowUp size={16} /></IconBtn>
              <IconBtn label={`پایین بردن ${r.part_display}`} disabled={!editable || i === d.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={16} /></IconBtn>
              <Toggle checked={r.is_active} onChange={(v) => set(i, { is_active: v })} disabled={!editable} label={r.is_active ? 'در نام' : 'خاموش'} />
            </span>
          </div>
        ))}
        <div className={s.namePreview}>
          <span className={s.muted}>پیش‌نمایش نام یک آیتم نمونه</span>
          <div className={s.namePreviewVal}>{preview || '—'}</div>
        </div>
      </SettingCard>
      {editable ? <SaveBar dirty={dirty ? 1 : 0} saving={busy} onSave={submit} onReset={() => { setD(base); setErrs(NO_ERRORS); }} /> : null}
    </>
  );
}
