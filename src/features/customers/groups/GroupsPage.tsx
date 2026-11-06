import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { IconChevronLeft, IconPlus, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum, jalaliTextToGregorian } from '@/shared/lib/format';
import { useDebounced } from '@/shared/lib/useDebounced';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Input, PickerField, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Card, Empty, ErrorBox, KeyValue, Modal, PageHead, Pagination, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import {
  useAllMarketers, useCampaignPicker, useDiscountPicker, useGroup, useGroupCampaigns, useGroupDiscounts, useGroupMarketers, useGroupMarketerWrite,
  useGroupMembers, useGroupOfferWrite, useGroups, useGroupWrite, type GroupCampaign, type GroupDiscount, type GroupMarketerPeriod, type GroupMember, type GroupRow,
} from '../api';
import { AttrError, RULES, RulesFields, RulesModal, RulesSummary, diffRules, emptyRuleForm, ruleCount, ruleText, type RuleKey } from './GroupAttributes';
import { CustomerPickerModal, MarketerPickerModal, ReasonModal, conflictCodes } from '../components';
import s from '../customers.module.css';

const PAGE = 12;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * گروه‌های مشتریان — نسخه‌ی ۳ (افشین 2026-10-24؛ FrontGuidance/CUSTOMER_GROUPS_V3_FOR_FRONT.md):
 * گروه هیچ مقداری به مشتری نمی‌دهد؛ «قانون عضویت» دارد و سه عملیات: بازاریاب (شخص + دوره)، تخفیف و کمپین (در قیمت‌گذاری).
 * کارت‌ها مثل html Fixed + پنل کناری جزئیات؛ فیلتر: وضعیت + بازاریاب امروز.
 */
export default function GroupsPage() {
  const can = usePerm();
  // حالت لیست (صفحه، جست‌وجو، فیلترها) و گروه باز در URL (useListParams، افشین 2026-10-25)
  const lp = useListParams({ page_size: PAGE });
  const { text, setText, dq } = useSearchState(lp);
  const page = lp.page;
  const openId = lp.get('group') || null;
  const fStatus = lp.get('status');
  const fMarketer = lp.get('marketer');
  const list = useGroups({ page, page_size: PAGE, query: dq || undefined, is_active: fStatus ? fStatus === 'active' : undefined, marketer_id: fMarketer || undefined });
  const marketers = useAllMarketers(can('customers.profiles.marketer.read'));
  const [creating, setCreating] = useState(false);
  const open = (id: string | null) => lp.set({ group: id }, { keepPage: true });
  const active = !!dq || !!fStatus || !!fMarketer;
  return (
    <>
      <PageHead actions={can('customers.groups.create') ? <Button icon={<IconPlus size={17} />} onClick={() => setCreating(true)}>ایجاد گروه جدید</Button> : null} />
      <Card>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: کد یا نام گروه"
          filters={[
            { key: 'st', label: 'وضعیت', value: fStatus, onChange: lp.setFilter('status'), options: [{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }] },
            ...(marketers.data ? [{ key: 'mk', label: 'بازاریاب امروز', value: fMarketer, onChange: lp.setFilter('marketer'), options: marketers.data.map((m) => ({ value: m.id, label: m.full_name })) }] : []),
          ]} count={list.data ? `${faNum(list.data.total)} گروه` : undefined} />
        {list.isLoading ? <SkeletonRows rows={3} height={150} /> : list.error ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : !list.data?.results.length ? (
          <Empty title={active ? 'گروهی با این شرایط پیدا نشد' : 'هنوز گروهی ساخته نشده است'} text={active ? undefined : 'گروه چند مشتری را کنار هم می‌گذارد تا بازاریاب، تخفیف یا کمپین را یک‌جا به آن‌ها بدهید. با قانون عضویت فقط مشتریان با مشخصات تعیین‌شده عضو می‌شوند؛ گروه چیزی را در پرونده‌ی مشتری تغییر نمی‌دهد.'} />
        ) : (
          <div className={s.groupGrid}>
            {list.data.results.map((g) => <GroupCard key={g.id} g={g} onOpen={() => open(g.id)} />)}
          </div>
        )}
        {list.data && list.data.total > PAGE ? <Pagination page={page} pageSize={PAGE} total={list.data.total} onPage={lp.setPage} /> : null}
      </Card>
      {creating ? <CreateGroupModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); open(id); }} /> : null}
      {openId ? <GroupDrawer id={openId} onClose={() => open(null)} /> : null}
    </>
  );
}

function GroupCard({ g, onOpen }: { g: GroupRow; onOpen: () => void }) {
  const m = g.current_marketer;
  return (
    <article className={`${s.groupCard} ${g.is_active ? '' : s.groupCardOff}`}>
      <div className={s.groupHead}>
        <div><div className={s.groupName}>{g.name}</div><div className={`${s.groupCode} ltr`}>{g.code}</div></div>
        <Badge tone={g.is_active ? 'success' : 'neutral'}>{g.is_active ? 'فعال' : 'غیرفعال'}</Badge>
      </div>
      <div className={s.groupStats}>
        <div className={s.groupStat}><div className={s.groupStatValue}>{faNum(g.member_count)}</div><div className={s.groupStatLabel}>تعداد مشتری</div></div>
        <div className={`${s.groupStat} ${s.groupStatBrand}`}><div className={s.groupStatValue}>{faNum(ruleCount(g as Partial<Record<RuleKey, unknown>>))}</div><div className={s.groupStatLabel}>قانون عضویت</div></div>
      </div>
      <GroupRuleChips g={g} />
      <div className={s.groupFoot}>
        <span className={s.groupMarketer}>بازاریاب: <b>{m?.full_name ?? 'ندارد'}</b>{m ? <span className={s.muted}> {m.ends_on ? `تا ${faDate(m.ends_on)}` : '(بی‌پایان)'}</span> : null}</span>
        <Button variant="ghost" size="sm" icon={<IconChevronLeft size={15} />} onClick={onOpen}>مشاهده جزئیات</Button>
      </div>
    </article>
  );
}

/** چیپ قانون‌های تعیین‌شده‌ی گروه روی کارت (حداکثر ۳ + «+n») */
function GroupRuleChips({ g }: { g: GroupRow }) {
  const r = g as Partial<Record<RuleKey, unknown>>;
  const set = RULES.flatMap((sec) => sec.items).filter((m) => r[m.key] !== null && r[m.key] !== undefined);
  if (!set.length) return <div className={s.groupAttrs}><span className={s.muted}>بدون قانون عضویت (همه‌ی مشتریان)</span></div>;
  return (
    <div className={s.groupAttrs}>
      {set.slice(0, 3).map((m) => <span key={m.key} className={s.groupChip}>{m.label}: {ruleText(m.key, r[m.key])}</span>)}
      {set.length > 3 ? <span className={s.groupMore} data-tip={set.slice(3).map((m) => `${m.label}: ${ruleText(m.key, r[m.key])}`).join('، ')}>+{faNum(set.length - 3)}</span> : null}
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const w = useGroupWrite();
  const [name, setName] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState(() => emptyRuleForm());
  const [err, setErr] = useState<string | null>(null);
  const diff = diffRules(rules);
  const submit = async () => {
    if (!name.trim()) { setErr('نام گروه الزامی است.'); return; }
    if (diff.error) { setErr(diff.error); return; }
    try {
      const g = await w.create.mutateAsync({ name: name.trim(), ...diff.changed });
      toast('گروه ساخته شد.'); onCreated(g.id);
    } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title="ثبت گروه مشتریان جدید" width={showRules ? 640 : 520}
      footer={<><Button onClick={submit} loading={w.create.isPending}>ایجاد گروه</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <AttrError err={err} />
      <p className={s.intro}>کد گروه (CG-…) را سامانه می‌سازد. بعد از ساخت، از پنل گروه بازاریاب (با دوره‌ی زمانی)، تخفیف و کمپین را به گروه اختصاص دهید و اعضا را اضافه کنید.</p>
      <Input label="نام گروه" required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً پوشاک اصفهان" />
      <button type="button" className={s.attrToggle} onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}>
        {showRules ? 'بستن قانون‌های عضویت' : 'تعیین قانون‌های عضویت (اختیاری)'}{Object.keys(diff.changed).length ? ` — ${faNum(Object.keys(diff.changed).length)} قانون` : ''}
      </button>
      {showRules ? <RulesFields values={rules} onChange={(k, v) => setRules((f) => ({ ...f, [k]: v }))} /> : null}
    </Modal>
  );
}

/** بازاریاب گروه: دوره‌ها (شخص + بازه، بدون درصد)؛ ثبت، پایان زودتر، لغو دوره‌ی شروع‌نشده */
function MarketerSection({ groupId, canUpdate }: { groupId: string; canUpdate: boolean }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const periods = useGroupMarketers(groupId, { page, page_size: 5 });
  const w = useGroupMarketerWrite(groupId);
  const [adding, setAdding] = useState(false);
  const [ending, setEnding] = useState<GroupMarketerPeriod | null>(null);
  const [cancelling, setCancelling] = useState<GroupMarketerPeriod | null>(null);
  const today = todayIso();
  const state = (p: GroupMarketerPeriod) => {
    if (p.cancelled_at) return { label: 'لغوشده', tone: 'neutral' as const };
    if (p.is_current) return { label: 'جاری', tone: 'success' as const };
    if (p.starts_on > today) return { label: 'آینده', tone: 'info' as const };
    return { label: 'پایان‌یافته', tone: 'neutral' as const };
  };
  return (
    <div>
      <SectionTitle extra={canUpdate ? <Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setAdding(true)}>تعیین بازاریاب</Button> : null}>بازاریاب گروه</SectionTitle>
      <p className={s.sub} style={{ marginBottom: 8 }}>بازاریاب با دوره‌ی زمانی و بدون درصد؛ درصد و کالاهای بازاریابی در تعریف خود بازاریاب است. بازاریاب مستقیم مشتری بر بازاریاب گروه مقدم است.</p>
      {periods.isLoading ? <SkeletonRows rows={2} height={44} /> : periods.error ? <ErrorBox error={periods.error} onRetry={() => periods.refetch()} /> : !periods.data?.results.length ? <p className={s.sub}>برای این گروه بازاریابی تعیین نشده است.</p> : (
        <div className={s.list}>
          {periods.data.results.map((p) => {
            const st = state(p);
            const started = p.starts_on <= today;
            const canEnd = canUpdate && !p.cancelled_at && started && (!p.ends_on || p.ends_on >= today);
            const canCancel = canUpdate && !p.cancelled_at && !started;
            return (
              <div key={p.id} className={s.listRow}>
                <div>
                  <div className={s.strong}>{p.marketer_name ?? '—'} <Badge tone={st.tone}>{st.label}</Badge></div>
                  <div className={s.sub}>از {faDate(p.starts_on)} {p.ends_on ? `تا ${faDate(p.ends_on)}` : '(بی‌پایان)'}{p.cancel_reason ? ` — دلیل لغو: ${p.cancel_reason}` : p.end_reason ? ` — ${p.end_reason}` : p.reason ? ` — ${p.reason}` : ''}</div>
                </div>
                <span className={s.actionsRow}>
                  {canEnd ? <Button size="sm" variant="secondary" onClick={() => setEnding(p)}>پایان زودتر</Button> : null}
                  {canCancel ? <Button size="sm" variant="danger" onClick={() => setCancelling(p)}>لغو</Button> : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {periods.data && periods.data.total > 5 ? <Pagination page={page} pageSize={5} total={periods.data.total} onPage={setPage} /> : null}
      {adding ? <AddPeriodModal groupId={groupId} onClose={() => setAdding(false)} /> : null}
      {ending ? <EndPeriodModal groupId={groupId} period={ending} onClose={() => setEnding(null)} /> : null}
      <ReasonModal open={!!cancelling} onClose={() => setCancelling(null)} danger busy={w.cancel.isPending} title="لغو دوره‌ی بازاریاب" label="دلیل لغو" confirmText="لغو دوره"
        intro={`دوره‌ی «${cancelling?.marketer_name ?? ''}» از ${faDate(cancelling?.starts_on)} هنوز شروع نشده و لغو می‌شود؛ در تاریخچه می‌ماند.`}
        onConfirm={async (reason) => { await w.cancel.mutateAsync({ periodId: cancelling!.id, reason }); toast('دوره لغو شد.'); setCancelling(null); }} />
    </div>
  );
}

function AddPeriodModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const toast = useToast();
  const w = useGroupMarketerWrite(groupId);
  const [picker, setPicker] = useState(false);
  const [mk, setMk] = useState<{ id: string; name: string } | null>(null);
  const [start, setStart] = useState(() => faDate(todayIso()));
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!mk) { setErr('بازاریاب را انتخاب کنید.'); return; }
    const s0 = jalaliTextToGregorian(start);
    if (!s0) { setErr('تاریخ شروع معتبر نیست.'); return; }
    const e0 = end.trim() ? jalaliTextToGregorian(end) : null;
    if (end.trim() && !e0) { setErr('تاریخ پایان معتبر نیست.'); return; }
    if (e0 && e0 < s0) { setErr('تاریخ پایان نباید قبل از شروع باشد.'); return; }
    try { await w.add.mutateAsync({ marketer_id: mk.id, starts_on: s0, ends_on: e0, reason: reason.trim() || null }); toast('بازاریاب گروه ثبت شد.'); onClose(); }
    catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title="تعیین بازاریاب گروه" width={520}
      footer={<><Button onClick={submit} loading={w.add.isPending}>ثبت دوره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <AttrError err={err} />
      <p className={s.intro}>دوره‌های بازاریاب یک گروه نباید روی هم بیفتند؛ اگر دوره‌ی دیگری در این بازه هست، اول آن را تمام یا لغو کنید.</p>
      <PickerField label="بازاریاب" required value={mk?.name} placeholder="انتخاب بازاریاب" onOpen={() => setPicker(true)} onClear={() => setMk(null)} />
      <div className={s.dateRow} style={{ marginTop: 14 }}>
        <JalaliDateInput label="از تاریخ" required value={start} onChange={(e) => setStart(e.target.value)} placeholder="۱۴۰۵/۰۸/۰۱" dir="ltr" />
        <JalaliDateInput label="تا تاریخ" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="خالی = بی‌پایان" dir="ltr" hint="خالی = بی‌پایان" />
      </div>
      <div style={{ marginTop: 12 }}><Textarea label="توضیح" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <MarketerPickerModal open={picker} onClose={() => setPicker(false)} onPick={(m) => { setMk({ id: m.id, name: m.full_name }); setPicker(false); }} />
    </Modal>
  );
}

function EndPeriodModal({ groupId, period, onClose }: { groupId: string; period: GroupMarketerPeriod; onClose: () => void }) {
  const toast = useToast();
  const w = useGroupMarketerWrite(groupId);
  const [end, setEnd] = useState(() => faDate(todayIso()));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    const e0 = jalaliTextToGregorian(end);
    if (!e0) { setErr('تاریخ پایان معتبر نیست.'); return; }
    if (e0 < period.starts_on) { setErr('تاریخ پایان نباید قبل از شروع دوره باشد.'); return; }
    if (period.ends_on && e0 >= period.ends_on) { setErr('تاریخ تازه باید زودتر از پایان فعلی باشد؛ تمدید ممکن نیست (دوره‌ی تازه ثبت کنید).'); return; }
    try { await w.end.mutateAsync({ periodId: period.id, ends_on: e0, reason: reason.trim() || null }); toast('دوره‌ی بازاریاب تمام شد.'); onClose(); }
    catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`پایان دوره‌ی «${period.marketer_name ?? ''}»`} width={460}
      footer={<><Button onClick={submit} loading={w.end.isPending}>ثبت پایان</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <AttrError err={err} />
      <p className={s.intro}>شروع: {faDate(period.starts_on)} — پایان فعلی: {period.ends_on ? faDate(period.ends_on) : 'بی‌پایان'}</p>
      <JalaliDateInput label="آخرین روز دوره" required value={end} onChange={(e) => setEnd(e.target.value)} dir="ltr" />
      <div style={{ marginTop: 12 }}><Textarea label="توضیح" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    </Modal>
  );
}

const SCOPE_BLOCK: Record<string, string> = { ALL: 'برای همه‌ی مشتریان', OTHER: 'فقط مشتری یا سطح خاص' };

/** تخفیف‌ها و کمپین‌های اختصاص‌یافته به گروه (ثبت در قیمت‌گذاری)؛ اختصاص از میان تخفیف‌های فعال و کمپین‌های منتشرشده */
function GroupOffers({ groupId, groupActive }: { groupId: string; groupActive: boolean }) {
  const can = usePerm();
  const toast = useToast();
  const canD = can('pricing.discounts.list');
  const canC = can('pricing.campaigns.list');
  const canDU = can('pricing.discounts.update');
  const canCU = can('pricing.campaigns.update');
  const discounts = useGroupDiscounts(groupId, canD);
  const campaigns = useGroupCampaigns(groupId, canC);
  const w = useGroupOfferWrite(groupId);
  const [picking, setPicking] = useState<'discount' | 'campaign' | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'discount' | 'campaign'; id: string; title: string } | null>(null);
  if (!canD && !canC) return null;
  return (
    <div>
      <SectionTitle extra={groupActive ? <span className={s.actionsRow}>
        {canD && canDU ? <Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setPicking('discount')}>اختصاص تخفیف</Button> : null}
        {canC && canCU ? <Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setPicking('campaign')}>اختصاص کمپین</Button> : null}
      </span> : null}>تخفیف‌ها و کمپین‌های گروه</SectionTitle>
      {discounts.isLoading || campaigns.isLoading ? <SkeletonRows rows={2} height={44} /> : (
        <div className={s.list}>
          {(discounts.data?.results ?? []).map((d) => (
            <div key={d.id} className={s.listRow}>
              <div><div className={s.strong}>{d.title}</div><div className={s.sub}>تخفیف · {d.kind_display} · {d.value_display}</div></div>
              <span className={s.actionsRow}>
                <Badge tone={d.status === 'ACTIVE' ? 'success' : 'neutral'}>{d.status === 'ACTIVE' ? 'فعال' : d.status === 'DRAFT' ? 'پیش‌نویس' : d.status === 'INACTIVE' ? 'غیرفعال' : 'بایگانی'}</Badge>
                {canDU ? <Button size="sm" variant="ghost" onClick={() => setRemoving({ kind: 'discount', id: d.id, title: d.title })}>برداشتن</Button> : null}
              </span>
            </div>
          ))}
          {(campaigns.data?.results ?? []).map((c) => (
            <div key={c.id} className={s.listRow}>
              <div><div className={s.strong}>{c.name}</div><div className={s.sub}>کمپین · {c.nature_display} · {faDate(c.starts_at)} تا {faDate(c.ends_at)}</div></div>
              <span className={s.actionsRow}>
                <Badge tone={c.phase === 'RUNNING' ? 'success' : 'neutral'}>{c.phase === 'RUNNING' ? 'در حال اجرا' : c.phase === 'SCHEDULED' ? 'زمان‌بندی‌شده' : 'پایان‌یافته'}</Badge>
                {canCU ? <Button size="sm" variant="ghost" onClick={() => setRemoving({ kind: 'campaign', id: c.id, title: c.name })}>برداشتن</Button> : null}
              </span>
            </div>
          ))}
          {!discounts.data?.results.length && !campaigns.data?.results.length ? <p className={s.sub}>تخفیف یا کمپینی به این گروه اختصاص داده نشده است.</p> : null}
        </div>
      )}
      {picking ? <OfferPickerModal kind={picking} groupId={groupId} onClose={() => setPicking(null)} /> : null}
      <ReasonModal open={!!removing} onClose={() => setRemoving(null)} danger noReason busy={w.removeDiscount.isPending || w.removeCampaign.isPending}
        title={removing?.kind === 'discount' ? 'برداشتن تخفیف از گروه' : 'برداشتن کمپین از گروه'} confirmText="برداشتن"
        intro={`«${removing?.title ?? ''}» دیگر برای اعضای این گروه نیست؛ خود ${removing?.kind === 'discount' ? 'تخفیف' : 'کمپین'} و بقیه‌ی مخاطبانش دست نمی‌خورد. اگر این گروه تنها مخاطب باشد، برداشتن ممکن نیست.`}
        onConfirm={async () => { if (removing!.kind === 'discount') await w.removeDiscount.mutateAsync(removing!.id); else await w.removeCampaign.mutateAsync(removing!.id); toast('از گروه برداشته شد.'); setRemoving(null); }} />
    </div>
  );
}

function OfferPickerModal({ kind, groupId, onClose }: { kind: 'discount' | 'campaign'; groupId: string; onClose: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300);
  const p = { page, page_size: 8, query: dq || undefined };
  const dl = useDiscountPicker(p, kind === 'discount');
  const cl = useCampaignPicker(p, kind === 'campaign');
  const w = useGroupOfferWrite(groupId);
  const [err, setErr] = useState<string | null>(null);
  const list = kind === 'discount' ? dl : cl;
  const blockOf = (r: GroupDiscount | GroupCampaign): string | null => {
    if (r.group_ids?.includes(groupId)) return 'اختصاص دارد';
    if (r.audience_scope !== 'GROUPS') return SCOPE_BLOCK[r.audience_scope] ?? 'قابل انتخاب نیست';
    if ('phase' in r && r.phase === 'ENDED') return 'تمام‌شده';
    return null;
  };
  const assign = async (id: string) => {
    setErr(null);
    try { if (kind === 'discount') await w.addDiscount.mutateAsync(id); else await w.addCampaign.mutateAsync(id); toast(kind === 'discount' ? 'تخفیف به گروه اختصاص یافت.' : 'کمپین به گروه اختصاص یافت.'); onClose(); }
    catch (e) { setErr(userMessage(e)); }
  };
  const busy = w.addDiscount.isPending || w.addCampaign.isPending;
  const cols: Column<GroupDiscount | GroupCampaign>[] = [
    { key: 't', header: kind === 'discount' ? 'تخفیف' : 'کمپین', render: (r) => <b>{'title' in r ? r.title : r.name}</b> },
    { key: 'd', header: 'جزئیات', render: (r) => <span className={s.sub}>{'kind_display' in r ? `${r.kind_display} · ${r.value_display}` : `${r.nature_display} · ${faDate(r.starts_at)} تا ${faDate(r.ends_at)}`}</span> },
    { key: 'a', header: '', render: (r) => { const b = blockOf(r); return b ? <Badge tone="neutral">{b}</Badge> : <Button size="sm" loading={busy && (w.addDiscount.variables === r.id || w.addCampaign.variables === r.id)} onClick={() => assign(r.id)}>اختصاص</Button>; } },
  ];
  return (
    <Modal open onClose={onClose} title={kind === 'discount' ? 'اختصاص تخفیف به گروه' : 'اختصاص کمپین به گروه'} width={820}
      footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
      <p className={s.intro}>{kind === 'discount' ? 'تخفیف‌های فعال' : 'کمپین‌های منتشرشده'} با همه‌ی تنظیماتشان در قیمت‌گذاری تعریف شده‌اند؛ اینجا فقط این گروه به مخاطبانشان اضافه می‌شود. مواردی که «برای همه‌ی مشتریان» یا فقط برای مشتری/سطح خاص‌اند قابل انتخاب نیستند.</p>
      {err ? <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div> : null}
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder={kind === 'discount' ? 'جست‌وجوی تخفیف' : 'جست‌وجوی کمپین'} count={list.data ? `${faNum(list.data.total)} مورد` : undefined} />
      <DataTable columns={cols} rows={list.data?.results as (GroupDiscount | GroupCampaign)[] | undefined} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={kind === 'discount' ? 'تخفیف فعالی پیدا نشد' : 'کمپین منتشرشده‌ای پیدا نشد'} />} />
      {list.data && list.data.total > 8 ? <Pagination page={page} pageSize={8} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}

/** پنل کناری جزئیات گروه: مشخصات، قانون‌های عضویت، بازاریاب، تخفیف و کمپین، اعضا، فعال/غیرفعال */
function GroupDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const can = usePerm();
  const toast = useToast();
  const navigate = useNavigate();
  const g = useGroup(id);
  const w = useGroupWrite(id);
  const [page, setPage] = useState(1);
  const [memberQ, setMemberQ] = useState('');
  const memberQd = useDebounced(memberQ.trim(), 300);
  const members = useGroupMembers(id, { page, page_size: 8, query: memberQd || undefined });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [toggling, setToggling] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<GroupMember | null>(null);
  const [editRules, setEditRules] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // قانون تازه یا فعال‌سازی گروه با این اعضا نمی‌خواند (409) ⇐ اول باید از گروه خارج شوند
  const [conflict, setConflict] = useState<{ codes: string[]; message: string } | null>(null);
  // افزودن عضو ناهمخوان ⇐ کل دسته رد می‌شود (409)
  const [addErr, setAddErr] = useState<{ codes: string[]; message: string } | null>(null);
  const canUpdate = can('customers.groups.update');
  const d = g.data;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && document.querySelectorAll('[role=dialog]').length <= 1) onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const cols: Column<GroupMember>[] = [
    { key: 'code', header: 'کد', code: true, render: (m) => <span className={s.flags}><span className="ltr">{m.customer_code}</span>{conflict?.codes.includes(m.customer_code) ? <Badge tone="danger">مغایر</Badge> : null}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (m) => <b>{m.full_name ?? '—'}</b> },
    { key: 'store', header: 'فروشگاه', render: (m) => m.store_name || '—' },
    { key: 'joined', header: 'عضویت از', render: (m) => <span className={s.muted}>{faDate(m.joined_at)}</span> },
    { key: 'act', header: '', render: (m) => canUpdate ? <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setRemoving(m); }}>خروج از گروه</Button> : null },
  ];
  return createPortal(
    <>
      <div className={s.drawerOverlay} onMouseDown={onClose} />
      <aside className={s.drawer} role="dialog" aria-modal="true" aria-label="جزئیات گروه">
        <div className={s.drawerHead}>
          <div>{d ? <><h3>{d.name} <Badge tone={d.is_active ? 'success' : 'neutral'}>{d.is_active ? 'فعال' : 'غیرفعال'}</Badge></h3><div className={`${s.sub} ltr`}>{d.code}</div></> : <h3>گروه</h3>}</div>
          <button type="button" className={s.x} onClick={onClose} aria-label="بستن"><IconX size={18} /></button>
        </div>
        <div className={s.drawerBody}>
          {g.isLoading ? <SkeletonRows rows={3} height={60} /> : g.error || !d ? <ErrorBox error={g.error} onRetry={() => g.refetch()} /> : (
            <>
              <div className={s.groupStats}>
                <div className={s.groupStat}><div className={s.groupStatValue}>{faNum(d.member_count)}</div><div className={s.groupStatLabel}>تعداد مشتری</div></div>
                <div className={`${s.groupStat} ${s.groupStatBrand}`}><div className={s.groupStatValue}>{faNum(ruleCount(d as Partial<Record<RuleKey, unknown>>))}</div><div className={s.groupStatLabel}>قانون عضویت</div></div>
              </div>
              <div>
                <SectionTitle extra={canUpdate ? <Button size="sm" variant="secondary" onClick={() => { setName(d.name); setErr(null); setRenaming(true); }}>تغییر نام</Button> : null}>مشخصات گروه</SectionTitle>
                <div className={s.kvGrid}>
                  <KeyValue label="کد گروه" ltr>{d.code}</KeyValue><KeyValue label="نام گروه">{d.name}</KeyValue>
                  <KeyValue label="بازاریاب امروز">{d.current_marketer?.full_name ?? 'ندارد'}</KeyValue><KeyValue label="تاریخ ایجاد">{faDate(d.created_at)}</KeyValue>
                </div>
              </div>
              <div>
                <SectionTitle extra={canUpdate ? <Button size="sm" variant="secondary" onClick={() => setEditRules(true)}>ویرایش قانون‌ها</Button> : null}>قانون‌های عضویت</SectionTitle>
                <RulesSummary g={d} />
              </div>
              <MarketerSection groupId={d.id} canUpdate={canUpdate} />
              <GroupOffers groupId={d.id} groupActive={d.is_active} />
              <div>
                <SectionTitle extra={canUpdate && d.is_active ? <Button size="sm" icon={<IconPlus size={15} />} onClick={() => setAdding(true)}>افزودن مشتری</Button> : null}>اعضای گروه</SectionTitle>
                {!d.is_active ? <Alert tone="info">گروه غیرفعال است؛ اعضا می‌مانند ولی عضو تازه اضافه نمی‌شود، قانون‌هایش اجرا نمی‌شود و بازاریابش مؤثر نیست.</Alert> : null}
                {conflict ? (
                  <div className={s.stack} style={{ gap: 8, marginBottom: 10 }}>
                    <Alert>{conflict.message}</Alert>
                    <div className={s.actionsRow} style={{ flexWrap: 'wrap' }}>
                      <span className={s.sub}>مشتریان مغایر (کلیک کنید تا در جدول نمایش داده شود، بعد «خروج از گروه»):</span>
                      {conflict.codes.map((c) => <Button key={c} size="sm" variant="secondary" onClick={() => { setMemberQ(c); setPage(1); }}><span className="ltr">{c}</span></Button>)}
                      <Button size="sm" variant="ghost" onClick={() => { setConflict(null); setMemberQ(''); setPage(1); }}>بستن پیام</Button>
                    </div>
                  </div>
                ) : null}
                <TableFilters search={memberQ} onSearch={(v) => { setMemberQ(v); setPage(1); }} placeholder="جست‌وجوی عضو: کد، نام، فروشگاه یا موبایل"
                  count={members.data ? `${faNum(members.data.total)} عضو` : undefined} />
                <DataTable columns={cols} rows={members.data?.results} rowKey={(m) => m.membership_id} loading={members.isLoading} error={members.error} onRetry={() => members.refetch()}
                  onRowClick={can('customers.profiles.read') ? (m) => navigate(`/customers/profiles/${m.customer_id}`) : undefined}
                  empty={<Empty title={memberQd ? 'عضوی با این جست‌وجو پیدا نشد' : 'این گروه هنوز عضوی ندارد'} />} />
                {members.data && members.data.total > 8 ? <Pagination page={page} pageSize={8} total={members.data.total} onPage={setPage} /> : null}
              </div>
            </>
          )}
        </div>
        <div className={s.drawerFoot}>
          {d && can(d.is_active ? 'customers.groups.delete' : 'customers.groups.update') ? <Button variant={d.is_active ? 'danger' : 'primary'} onClick={() => setToggling(true)}>{d.is_active ? 'غیرفعال کردن گروه' : 'فعال کردن گروه'}</Button> : null}
          <Button variant="ghost" onClick={onClose}>بستن</Button>
        </div>
      </aside>

      <Modal open={renaming} onClose={() => setRenaming(false)} title="تغییر نام گروه" width={440}
        footer={<><Button loading={w.rename.isPending} disabled={!name.trim() || name.trim() === d?.name} onClick={async () => { try { await w.rename.mutateAsync({ name: name.trim(), expected_version: d!.version }); toast('نام گروه تغییر کرد.'); setRenaming(false); } catch (e) { setErr(userMessage(e)); } }}>ذخیره</Button><Button variant="ghost" onClick={() => setRenaming(false)}>انصراف</Button></>}>
        <Input label="نام گروه" required value={name} onChange={(e) => setName(e.target.value)} />
        {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
      </Modal>
      {editRules && d ? <RulesModal g={d} onClose={() => setEditRules(false)} onConflict={(codes, message) => { setConflict({ codes, message }); setMemberQ(''); setPage(1); }} /> : null}
      <ReasonModal open={toggling} onClose={() => setToggling(false)} danger={!!d?.is_active} busy={w.activate.isPending || w.deactivate.isPending} title={d?.is_active ? 'غیرفعال کردن گروه' : 'فعال کردن گروه'} noReason confirmText={d?.is_active ? 'غیرفعال کن' : 'فعال کن'}
        intro={d?.is_active ? 'اعضا می‌مانند؛ عضو تازه اضافه نمی‌شود، قانون‌ها اجرا نمی‌شوند و بازاریاب گروه مؤثر نیست.' : 'با فعال شدن، قانون‌های عضویت دوباره اجرا می‌شوند؛ اگر عضوی با آن‌ها نخواند، فعال‌سازی رد می‌شود.'}
        onConfirm={async () => {
          try { if (d!.is_active) await w.deactivate.mutateAsync(d!.version); else await w.activate.mutateAsync(d!.version); }
          catch (e) { const codes = conflictCodes(e); if (codes) { setConflict({ codes, message: userMessage(e) }); setToggling(false); return; } throw e; }
          toast(d!.is_active ? 'گروه غیرفعال شد.' : 'گروه فعال شد.'); setToggling(false);
        }} />
      <ReasonModal open={!!removing} onClose={() => setRemoving(null)} danger busy={w.removeMember.isPending} title={`خروج «${removing?.full_name ?? removing?.customer_code ?? ''}» از گروه`} noReason confirmText="خروج از گروه"
        intro="مشتری از گروه خارج می‌شود؛ پرونده‌اش تغییری نمی‌کند ولی بازاریاب، تخفیف و کمپین‌های این گروه دیگر به او نمی‌رسد."
        onConfirm={async () => { await w.removeMember.mutateAsync(removing!.membership_id); toast('مشتری از گروه خارج شد.'); const code = removing!.customer_code; if (conflict) { const rest = conflict.codes.filter((x) => x !== code); setConflict(rest.length ? { ...conflict, codes: rest } : null); if (!rest.length) { setMemberQ(''); setPage(1); } } setRemoving(null); }} />
      <CustomerPickerModal open={adding} onClose={() => { setAdding(false); setAddErr(null); }} busy={w.addMembers.isPending} error={addErr?.message} blockedCodes={addErr?.codes} excludeIds={(members.data?.results ?? []).map((m) => m.customer_id)}
        onConfirm={async (ids) => { try { const r = await w.addMembers.mutateAsync(ids); toast(`${faNum(r.added.length)} مشتری افزوده شد${r.skipped.length ? `؛ ${faNum(r.skipped.length)} مورد از قبل عضو بود` : ''}.`); setAdding(false); setAddErr(null); } catch (e) { const codes = conflictCodes(e); if (codes) setAddErr({ codes, message: userMessage(e) }); else toast(userMessage(e), 'error'); } }} />
    </>,
    document.body,
  );
}
