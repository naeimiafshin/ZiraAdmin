import { useState } from 'react';
import { IconGavel, IconTags, IconUsersGroup } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { Empty, ErrorBox, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { Stepper } from '@/shared/ui/Stepper';
import { useToast } from '@/shared/ui/toast';
import { Toggle } from '@/shared/ui/form';
import { useCommercePolicy, useSaveSetting, type CommercePolicy } from '@/features/settings/api';
import { changedKeys, NO_ERRORS, parseErrors, Row, SaveBar, SettingCard, SubBox, TopErrors, useDraft, type FormErrors } from '@/features/settings/ui';
import { useCouncilMembers } from './api';
import { CouncilMembersTable } from './council';
import { CouncilTitlesTable } from './councilTitles';

/**
 * تنظیمات «شورای تأمین» (`/settings/supply-council`) — افشین 2026-10-31: همه‌ی مدیریت شورا در تنظیمات است:
 * قواعد رأی‌گیری (حد نصاب رأی، شرط قبولی و سقف اعضا = سه فیلد سیاست فروش و پرداخت؛ S-11/S-12 رفع شد 2026-10-31)،
 * اعضا (افزودن، ویرایش عنوان، کنار گذاشتن، فعال کردن دوباره) و عنوان‌های شورا (/settings/council-titles؛ S-10 رفع شد 2026-10-31).
 * طرح html ندارد؛ الگوی صفحه‌های تنظیمی («سیاست‌های امنیتی»).
 */
const MIN_VOTES_MAX = 100;
const APPROVAL_PCT_MAX = 100;
const APPROVAL_PCT_STEP = 5;
const MAX_MEMBERS_MIN = 1;
const MAX_MEMBERS_MAX = 1000;

export default function CouncilSettingsPage() {
  const can = usePerm();
  const canMembers = can('supply.supply_council.list');
  if (!canMembers && !can('settings.commerce_policy.read') && !can('settings.council_titles.list')) {
    return <><PageHead title="شورای تأمین" /><Empty title="به این بخش دسترسی ندارید" text="برای دیدن شورای تأمین به مجوز «فهرست اعضای شورای تأمین» نیاز است." /></>;
  }
  return (
    <>
      <PageHead title="شورای تأمین" sub="اعضای شورا، عنوان‌ها و قواعد رأی‌گیری درخواست‌های تأمین" />
      {can('settings.commerce_policy.read') ? <RulesCard /> : null}
      {canMembers ? (
        <SettingCard wide icon={<IconUsersGroup size={20} />} title="اعضای شورا"
          desc="فقط عضو فعال شورا می‌تواند به درخواست‌های تأمین رأی بدهد. عضو حذف نمی‌شود؛ کنار گذاشتن او سوابق رأی را نگه می‌دارد.">
          <CouncilMembersTable />
        </SettingCard>
      ) : null}
      {can('settings.council_titles.list') ? (
        <SettingCard wide icon={<IconTags size={20} />} title="عنوان‌های شورا"
          desc="عنوان هر عضو از همین فهرست انتخاب می‌شود. عنوان حذف نمی‌شود؛ آرشیو آن را از گزینه‌های عضو تازه برمی‌دارد و عضوهایی که دارندش نگهش می‌دارند.">
          <CouncilTitlesTable />
        </SettingCard>
      ) : null}
    </>
  );
}

/**
 * قواعد رأی‌گیری (بک‌اند 2026-10-31، S-11/S-12 رفع شد) — سه فیلد «سیاست فروش و پرداخت»، ذخیره با PATCH فقط فیلدهای تغییرکرده:
 * حد نصاب رأی (تعداد، ۰ = بدون حد نصاب؛ شرط هر دو تصمیم تأیید و رد)، شرط قبولی (درصد رأی موافق از رأی‌های داده‌شده، ۰ = مشورتی؛
 * فقط برای «تأیید»)، سقف اعضای فعال (۱ تا ۱۰۰۰ یا null = بدون سقف؛ سقف کمتر از اعضای فعال ⇐ ۴۰۰ بک‌اند).
 */
type Rules = { supply_council_min_votes: number; supply_council_min_approval_pct: number; supply_council_max_members: number | null };
const RULE_KEYS = ['supply_council_min_votes', 'supply_council_min_approval_pct', 'supply_council_max_members'] as const;
const toRules = (p: CommercePolicy): Rules => ({
  supply_council_min_votes: p.supply_council_min_votes,
  supply_council_min_approval_pct: p.supply_council_min_approval_pct,
  supply_council_max_members: p.supply_council_max_members ?? null,
});

function RulesCard() {
  const can = usePerm();
  const toast = useToast();
  const q = useCommercePolicy();
  const save = useSaveSetting<CommercePolicy>('commerce', '/settings/commerce-policy');
  const activeMembers = useCouncilMembers({ page: 1, page_size: 1, is_active: true }, can('supply.supply_council.list'));
  const [draft, setDraft] = useDraft(q.data, toRules);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const editable = can('settings.commerce_policy.update');
  if (q.isLoading || (q.data && !draft)) return <SkeletonRows rows={3} height={56} />;
  if (q.error || !q.data || !draft) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const base = toRules(q.data);
  const changed = changedKeys(draft, base);
  const members = activeMembers.data?.total;
  const set = (patch: Partial<Rules>) => setDraft({ ...draft, ...patch });
  const capped = draft.supply_council_max_members !== null;
  const capBelow = capped && members !== undefined && (draft.supply_council_max_members ?? 0) < members;

  const submit = async () => {
    if (capBelow) { setErrs({ fields: { supply_council_max_members: `سقف نمی‌تواند از تعداد اعضای فعال فعلی (${faNum(members)} نفر) کمتر باشد.` }, general: [] }); return; }
    setErrs(NO_ERRORS);
    const body: Partial<Rules> = {};
    changed.forEach((k) => { (body as Record<string, unknown>)[k] = draft[k]; });
    try {
      await save.mutateAsync(body);
      toast('قواعد رأی‌گیری شورای تأمین ذخیره شد.');
    } catch (e) { const p = parseErrors(e, [...RULE_KEYS]); setErrs(p); toast(p.general[0] ?? Object.values(p.fields)[0] ?? 'ذخیره نشد.', 'error'); }
  };

  return (
    <>
      <TopErrors errors={errs} />
      <SettingCard wide icon={<IconGavel size={20} />} title="قواعد رأی‌گیری"
        desc="رأی شورا پیش از «تصمیم تأمین» درخواست تأمین گرفته می‌شود. حد نصاب رأی شرط هر دو تصمیم «تأیید» و «رد» است؛ شرط قبولی فقط برای «تأیید»."> 
        <Row title="حد نصاب رأی" changed={changed.includes('supply_council_min_votes')} error={errs.fields.supply_council_min_votes}
          desc={<>حداقل تعداد رأی اعضا پیش از ثبت تصمیم تأمین؛ ۰ یعنی بدون حد نصاب.{members !== undefined && draft.supply_council_min_votes > members ? <> حد نصاب از تعداد اعضای فعال ({faNum(members)} نفر) بیشتر است و تصمیم تأمین ممکن نمی‌شود.</> : null}</>}>
          <Stepper label="حد نصاب رأی" value={draft.supply_council_min_votes} onChange={(v) => set({ supply_council_min_votes: v })} min={0} max={MIN_VOTES_MAX} unit="رأی" disabled={!editable} />
        </Row>
        <Row title="شرط قبولی" changed={changed.includes('supply_council_min_approval_pct')} error={errs.fields.supply_council_min_approval_pct}
          desc="«تأیید» فقط وقتی ثبت می‌شود که رأی موافق دست‌کم این درصد از رأی‌های داده‌شده باشد؛ ۰ یعنی رأی شورا فقط مشورتی است. «رد» همیشه آزاد است.">
          <Stepper label="شرط قبولی" value={draft.supply_council_min_approval_pct} onChange={(v) => set({ supply_council_min_approval_pct: v })} min={0} max={APPROVAL_PCT_MAX} step={APPROVAL_PCT_STEP} unit="٪ موافق" disabled={!editable} />
        </Row>
        <Row title="سقف تعداد اعضای شورا" changed={changed.includes('supply_council_max_members')} error={errs.fields.supply_council_max_members ?? (capBelow ? `سقف از تعداد اعضای فعال فعلی (${faNum(members)} نفر) کمتر است؛ ذخیره نمی‌شود.` : undefined)}
          desc={<>بیشترین تعداد عضو فعال شورا؛ وقتی پر شود، افزودن عضو یا فعال کردن دوباره‌ی عضو ممکن نیست.{members !== undefined ? <> اعضای فعال فعلی: {faNum(members)} نفر.</> : null}</>}>
          <Toggle checked={capped} label={capped ? 'سقف دارد' : 'بدون سقف'} disabled={!editable}
            onChange={(on) => set({ supply_council_max_members: on ? Math.max(members ?? 0, MAX_MEMBERS_MIN) : null })} />
        </Row>
        {capped ? (
          <SubBox>
            <Row title="سقف اعضا">
              <Stepper label="سقف اعضا" value={draft.supply_council_max_members ?? MAX_MEMBERS_MIN} onChange={(v) => set({ supply_council_max_members: v })} min={MAX_MEMBERS_MIN} max={MAX_MEMBERS_MAX} unit="نفر" disabled={!editable} />
            </Row>
          </SubBox>
        ) : null}
      </SettingCard>
      {editable ? <SaveBar dirty={changed.length} saving={save.isPending} onSave={submit} onReset={() => { setDraft(base); setErrs(NO_ERRORS); }} /> : null}
    </>
  );
}
