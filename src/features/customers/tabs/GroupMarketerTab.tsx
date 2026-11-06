import { useState } from 'react';
import { IconPlus, IconUserCheck } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate } from '@/shared/lib/format';
import { toFaDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Input, PickerField, Select } from '@/shared/ui/form';
import { Badge, Card, Empty, ErrorBox, KeyValue, Modal, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useAllGroups, useMarketerWrite, useProfileGroups, useProfileGroupWrite, useProfileMarketer, type CustomerDetail, type EffectiveMarketer, type MarketerAssignment } from '../api';
import { ComingSoon, MarketerPickerModal, ReasonModal, digitsOnly } from '../components';
import s from '../customers.module.css';

export function GroupMarketerTab({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  return (
    <div className={s.grid2eq}>
      {can('customers.profiles.group.read') ? <GroupsCard c={c} /> : <Card><ComingSoon title="گروه‌های مشتری" text="برای دیدن گروه‌های این مشتری به مجوز «تخصیص گروه مشتری» نیاز دارید." /></Card>}
      {can('customers.profiles.marketer.read') ? <MarketerCard c={c} /> : <Card><ComingSoon title="بازاریاب" text="برای دیدن بازاریاب این مشتری به مجوز «تخصیص بازاریاب مشتری» نیاز دارید." /></Card>}
    </div>
  );
}

/** گروه‌های مشتری از پرونده (profiles.group.*) — عضویت هیچ اثری بر سطح/اعتبار ندارد (BR-CUS-050) */
function GroupsCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const toast = useToast();
  const groups = useProfileGroups(c.id, true);
  const all = useAllGroups(can('customers.groups.list'));
  const w = useProfileGroupWrite(c.id);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const memberIds = new Set((groups.data ?? []).map((g) => g.group_id));
  const options = (all.data ?? []).filter((g) => g.is_active && !memberIds.has(g.id)).map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }));
  return (
    <Card>
      <SectionTitle extra={can('customers.profiles.group.update') ? <Button size="sm" icon={<IconPlus size={15} />} onClick={() => { setPick(''); setErr(null); setAdding(true); }}>افزودن به گروه</Button> : null}>گروه‌های مشتری</SectionTitle>
      <p className={s.sub} style={{ marginBottom: 12 }}>گروه فقط برای بازاریاب گروهی و تخفیف‌های قیمت‌گذاری است؛ روی سطح، تصاویر یا اعتبار اثری ندارد.</p>
      {groups.isLoading ? <SkeletonRows rows={3} height={48} /> : groups.error ? <ErrorBox error={groups.error} onRetry={() => groups.refetch()} /> : !groups.data?.length ? <Empty title="عضو هیچ گروهی نیست" /> : (
        <div className={s.list}>
          {groups.data.map((g) => (
            <div key={g.membership_id} className={s.listRow}>
              <div><div className={s.strong}>{g.group_name} {!g.is_active ? <Badge tone="neutral">گروه غیرفعال</Badge> : null}</div><div className={s.sub}><span className="ltr">{g.group_code}</span> · عضویت از {faDate(g.joined_at)}</div></div>
              {can('customers.profiles.group.update') ? <Button size="sm" variant="danger" loading={w.remove.isPending && w.remove.variables === g.membership_id} onClick={async () => { try { await w.remove.mutateAsync(g.membership_id); toast('از گروه حذف شد.'); } catch (e) { toast(userMessage(e), 'error'); } }}>حذف از گروه</Button> : null}
            </div>
          ))}
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="افزودن مشتری به گروه" width={480}
        footer={<><Button disabled={!pick} loading={w.add.isPending} onClick={async () => { try { await w.add.mutateAsync(pick); toast('به گروه افزوده شد.'); setAdding(false); } catch (e) { setErr(userMessage(e)); } }}>افزودن</Button><Button variant="ghost" onClick={() => setAdding(false)}>انصراف</Button></>}>
        {!can('customers.groups.list') ? <Alert>برای انتخاب گروه به مجوز «فهرست گروه‌ها» نیاز دارید.</Alert> : (
          <Select label="گروه" value={pick} onChange={(e) => setPick(e.target.value)} placeholder={all.isLoading ? 'در حال دریافت…' : options.length ? 'انتخاب گروه' : 'گروه فعال دیگری نیست'} options={options} />
        )}
        {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
      </Modal>
    </Card>
  );
}

/** بازاریاب (profiles.marketer.*): مؤثر، تخصیص فعال، تاریخچه؛ تخصیص با جدول انتخاب کارمند؛ پایان با دلیل */
function MarketerCard({ c }: { c: CustomerDetail }) {
  const can = usePerm();
  const toast = useToast();
  const q = useProfileMarketer(c.id, true);
  const w = useMarketerWrite(c.id);
  const [picker, setPicker] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [percent, setPercent] = useState('');
  const [ending, setEnding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // EffectiveMarketerOut (G-09): نام، درصد، منبع (DIRECT/GROUP) و نام گروه
  const eff = q.data?.effective as EffectiveMarketer | null | undefined;
  const effName = eff ? (eff.full_name || [eff.first_name, eff.last_name].filter(Boolean).join(' ') || '—') : null;
  const effPct = eff?.percent != null && eff.percent !== '' ? Number(eff.percent) : null;
  const active = q.data?.active_assignment;
  const canUpdate = can('customers.profiles.marketer.update');
  const assign = async () => {
    const p = Number(digitsOnly(percent));
    if (!picked) { setErr('بازاریاب را انتخاب کنید.'); return; }
    if (!(p >= 0 && p <= 100) || percent.trim() === '') { setErr('درصد بین ۰ و ۱۰۰ باشد.'); return; }
    try { await w.assign.mutateAsync({ marketer_id: picked.id, percent: String(p) }); toast('بازاریاب تخصیص یافت.'); setPicked(null); setPercent(''); setErr(null); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Card>
      <SectionTitle extra={canUpdate && active ? <Button size="sm" variant="secondary" onClick={() => setEnding(true)}>پایان تخصیص</Button> : null}>بازاریاب</SectionTitle>
      {q.isLoading ? <SkeletonRows rows={2} height={48} /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className={s.kvGrid}>
            <KeyValue label="بازاریاب مؤثر">{effName ? <span className={s.flags}><IconUserCheck size={16} />{effName}{effPct != null ? <span className={s.muted}>— ٪{toFaDigits(String(effPct))}</span> : null}</span> : 'ندارد'}</KeyValue>
            <KeyValue label="نوع تخصیص">{!eff ? '—' : eff.source === 'GROUP' ? <>از گروه مشتری{eff.group_name ? <> «<b>{eff.group_name}</b>»</> : null}</> : 'مستقیم روی پرونده'}</KeyValue>
          </div>
          {canUpdate ? (
            <div className={s.assignBox}>
              <div className={s.assignHead}>
                <span className={s.strong}>{active ? 'تغییر بازاریاب یا درصد' : 'تخصیص بازاریاب مستقیم'}</span>
                <span className={s.sub}>تخصیص مستقیم بر بازاریاب گروه مشتری مقدم است.</span>
              </div>
              <div className={s.assignGrid}>
                <PickerField label="بازاریاب" required value={picked?.name} placeholder="انتخاب کارمند" onOpen={() => setPicker(true)} onClear={() => setPicked(null)} />
                <Input label="درصد بازاریاب" required value={toFaDigits(percent)} onChange={(e) => setPercent(digitsOnly(e.target.value).slice(0, 3))} inputMode="numeric" placeholder="مثلاً ۳" />
                <Button loading={w.assign.isPending} loadingText="در حال ثبت…" onClick={assign}>ثبت تخصیص</Button>
              </div>
              {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
            </div>
          ) : null}
          <div className={s.subhead} style={{ fontSize: 13 }}>تاریخچه‌ی تخصیص</div>
          {q.data?.history.length ? (
            <div className={s.list}>
              {q.data.history.map((h: MarketerAssignment, i) => (
                <div key={`${h.marketer_id}-${i}`} className={s.listRow}>
                  <div><div className={s.strong}>{h.marketer_name ?? '—'} <span className={s.muted}>— ٪{toFaDigits(String(Number(h.percent)))}</span></div><div className={s.sub}>از {faDate(h.assigned_at)}</div></div>
                  <Badge tone={h.is_active ? 'success' : 'neutral'}>{h.is_active ? 'فعال' : 'پایان‌یافته'}</Badge>
                </div>
              ))}
            </div>
          ) : <p className={s.sub}>هنوز بازاریابی مستقیماً به این مشتری تخصیص داده نشده است.</p>}
        </>
      )}
      <MarketerPickerModal open={picker} onClose={() => setPicker(false)} onPick={(m) => { setPicked({ id: m.id, name: m.full_name }); setPicker(false); }} />
      <ReasonModal open={ending} onClose={() => setEnding(false)} busy={w.end.isPending} title="پایان تخصیص بازاریاب" intro="بعد از پایان، بازاریاب گروه (اگر باشد) مؤثر می‌شود."
        onConfirm={async (reason) => { await w.end.mutateAsync({ reason }); toast('تخصیص بازاریاب پایان یافت.'); setEnding(false); }} />
    </Card>
  );
}
