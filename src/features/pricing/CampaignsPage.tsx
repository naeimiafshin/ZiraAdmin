import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconArchive, IconCalendar, IconPencil, IconPlayerPause, IconPlus, IconSend } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { TableFilters } from '@/shared/ui/TableFilters';
import { Card, Empty, ErrorBox, PageHead, Pagination, Segmented, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal } from '@/features/catalog/components';
import { CHANNEL } from './labels';
import { useCampaignNatures, useCampaigns, useCampaignWrite, type Campaign } from './marketingApi';
import { CAMPAIGN_STATUS, PHASE } from './marketingLabels';
import { natureGradient } from '@/features/settings/natureColor';
import m from './marketing.module.css';

/**
 * «کمپین‌ها» — html V2 (pc-10x-mk-cp): Segmented همه/در حال اجرا/زمان‌بندی‌شده/پایان‌یافته (⇐ phase)، کارت هر کمپین با ماهیت، نام، وضعیت، بازه،
 * مصرف بودجه (budget_used / budget) و آمار بازدید/سفارش/نرخ تبدیل. بک‌اند آمار ندارد (P-10) ⇐ «به‌زودی».
 * وضعیت کارت: کمپین منتشرشده ⇐ فاز؛ بقیه ⇐ وضعیت (پیش‌نویس/غیرفعال/آرشیو). انتشار = POST publish (مجوز pricing.campaigns.approve).
 */
const PH: Record<string, string | undefined> = { '': undefined, running: 'RUNNING', scheduled: 'SCHEDULED', ended: 'ENDED' };
const pct = (used: string, budget?: string | null) => (budget && Number(budget) > 0 ? Math.min(100, (Number(used) / Number(budget)) * 100) : 0);
const TONE: Record<string, string> = { success: 'var(--success)', info: 'var(--info, #3b6fd8)', neutral: 'var(--ink-500)', warning: 'var(--warning)', danger: 'var(--danger)', brand: 'var(--brand)' };

export default function CampaignsPage() {
  const can = usePerm(); const navigate = useNavigate();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const ph = lp.get('ph');
  const natures = useCampaignNatures();
  const list = useCampaigns({ page: lp.page, page_size: lp.pageSize, query: dq || undefined, phase: PH[ph], status: lp.get('st') || undefined, nature: lp.get('nature') || undefined });
  const filtered = !!(ph || dq || lp.get('st') || lp.get('nature'));
  return (
    <>
      <PageHead title="کمپین‌ها" sub="برنامه‌ریزی و پایش کمپین‌های فروش، مناسبتی و وفاداری"
        actions={can('pricing.campaigns.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/pricing/campaigns/new')}>کمپین جدید</Button> : null} />
      <div className={m.tabsBar}>
        <Segmented value={ph} onChange={(v) => lp.set({ ph: v || null })} options={[{ value: '', label: 'همه' }, { value: 'running', label: 'در حال اجرا' }, { value: 'scheduled', label: 'زمان‌بندی‌شده' }, { value: 'ended', label: 'پایان‌یافته' }]} />
      </div>
      <Card className={m.formCard}>
        <TableFilters search={text} onSearch={setText} placeholder="جستجوی نام کمپین…" filters={[
          { key: 'st', label: 'وضعیت', value: lp.get('st'), onChange: (v) => lp.set({ st: v }), options: Object.entries(CAMPAIGN_STATUS).map(([value, x]) => ({ value, label: x.label })) },
          { key: 'nature', label: 'ماهیت', value: lp.get('nature'), onChange: (v) => lp.set({ nature: v }), options: (natures.data ?? []).map((x) => ({ value: x.code, label: x.name })) },
        ]} />
      </Card>
      {list.isLoading ? <Card><SkeletonRows rows={4} height={120} /></Card> : list.error ? <Card><ErrorBox error={list.error} onRetry={() => list.refetch()} /></Card>
        : !list.data?.results.length ? <Card><Empty title={filtered ? 'کمپینی با این فیلترها پیدا نشد' : 'هنوز کمپینی تعریف نشده است'} text={filtered ? undefined : 'کمپین فروش، مناسبتی یا وفاداری را برنامه‌ریزی کنید.'} /></Card>
          : <div className={m.campGrid}>{list.data.results.map((c) => <CampaignCard key={c.id} c={c} />)}</div>}
      {list.data && list.data.total > lp.pageSize ? <Card><Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 20, 50]} /></Card> : null}
    </>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  const can = usePerm(); const navigate = useNavigate(); const toast = useToast(); const w = useCampaignWrite();
  const [confirm, setConfirm] = useState<'disable' | 'archive' | null>(null);
  const st = c.status === 'PUBLISHED' ? PHASE[c.phase] : CAMPAIGN_STATUS[c.status];
  const publish = async () => { try { await w.publish.mutateAsync(c.id); toast(`کمپین «${c.name}» منتشر شد.`); } catch (e) { toast(userMessage(e), 'error'); } };
  const head = c.banner_url ? { backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.45),rgba(0,0,0,.15)),url(${c.banner_url})` } : { background: natureGradient(c.nature_color) };
  return (
    <article className={m.camp} data-campaign={c.id}>
      <div className={m.campHead} style={head}>
        <div><small>{c.nature_display || c.nature}</small><h3>{c.name}</h3></div>
        <span className={m.campPill} style={{ color: TONE[st?.tone ?? 'neutral'] }}>{st?.label ?? c.status}</span>
      </div>
      <div className={m.campBody}>
        <div className={m.campDate}><IconCalendar size={15} /><span className="tnum">{faDate(c.starts_at)} – {faDate(c.ends_at)}</span>{c.channel !== 'ALL' ? <span className={m.dateTag}>{CHANNEL[c.channel]}</span> : null}{c.discount_count ? <span className={m.dateTag}>{faNum(c.discount_count)} تخفیف مرتبط</span> : null}</div>
        <div className={m.budget}><span>مصرف بودجه</span><b className="tnum">{/* بودجه بدون اعشار (افشین 2026-10-24) */}{c.budget ? `${faNum(Math.round(Number(c.budget_used)))} / ${faNum(Math.round(Number(c.budget)))} ریال` : `${faNum(Math.round(Number(c.budget_used)))} ریال / بدون سقف`}</b></div>
        <div className={m.bar} role="progressbar" aria-label="مصرف بودجه" aria-valuenow={Math.round(pct(c.budget_used, c.budget))} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct(c.budget_used, c.budget)}%` }} /></div>
        <div className={m.stats} data-tip="آمار بازدید و سفارش کمپین هنوز در سامانه نیست (به‌زودی)">
          <div className={m.stat}><b>—</b><span>بازدید · به‌زودی</span></div><div className={m.stat}><b>—</b><span>سفارش · به‌زودی</span></div><div className={m.stat}><b>—</b><span>نرخ تبدیل · به‌زودی</span></div>
        </div>
        <div className={m.campFoot}>
          {can('pricing.campaigns.update') && c.status !== 'ARCHIVED' ? <Button size="sm" variant="secondary" icon={<IconPencil size={15} />} onClick={() => navigate(`/pricing/campaigns/${c.id}/edit`)}>ویرایش</Button> : null}
          {can('pricing.campaigns.approve') && (c.status === 'DRAFT' || c.status === 'DISABLED') && c.phase !== 'ENDED' ? <Button size="sm" icon={<IconSend size={15} />} onClick={publish} loading={w.publish.isPending}>انتشار</Button> : null}
          {can('pricing.campaigns.update') && c.status === 'PUBLISHED' ? <Button size="sm" variant="secondary" icon={<IconPlayerPause size={15} />} onClick={() => setConfirm('disable')}>غیرفعال</Button> : null}
          {can('pricing.campaigns.update') && c.status !== 'ARCHIVED' ? <Button size="sm" variant="secondary" icon={<IconArchive size={15} />} onClick={() => setConfirm('archive')}>آرشیو</Button> : null}
        </div>
      </div>
      {confirm ? <ConfirmModal title={confirm === 'disable' ? 'غیرفعال کردن کمپین' : 'آرشیو کمپین'} danger={confirm === 'archive'} confirmLabel={confirm === 'disable' ? 'غیرفعال کن' : 'آرشیو کن'} onClose={() => setConfirm(null)}
        text={confirm === 'disable' ? <>کمپین <b>{c.name}</b> از فروشگاه برداشته می‌شود؛ بعداً می‌توانید دوباره منتشرش کنید.</> : <>کمپین <b>{c.name}</b> آرشیو می‌شود و دیگر قابل ویرایش یا انتشار نیست.</>}
        onConfirm={async () => { await (confirm === 'disable' ? w.disable : w.archive).mutateAsync(c.id); toast(confirm === 'disable' ? 'کمپین غیرفعال شد.' : 'کمپین آرشیو شد.'); }} /> : null}
    </article>
  );
}
