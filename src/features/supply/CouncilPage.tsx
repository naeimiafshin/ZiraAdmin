import { IconClipboardList } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Badge, Card, Empty, ErrorBox, Pagination, SkeletonRows, UnderlineTabs } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { CouncilMembersTable } from './council';
import { labelOf, REQUEST_FINAL, toneOf } from './labels';
import { RequestDetailBody } from './RequestDetail';
import { int, personName, useRequests, type SupplyRequest } from './requestsApi';
import s from './supply.module.css';

/**
 * شورای تأمین (منوی خرید و تأمین) — افشین 2026-10-31: «رأی‌گیری» + «اعضا و سوابق رأی» فقط‌خواندنی؛ مدیریت اعضا و قواعد در تنظیمات است.
 * رأی‌گیری مثل html: تب‌های «در انتظار رای / تأیید شده / رد شده»، فهرست کارتی در ستون راست و جزئیات درخواست تأمین انتخاب‌شده
 * (اقلام، دلایل و مستندات، آرا، «ثبت رأی من» و «ثبت وضعیت نهایی» برای دارنده‌ی مجوز تصمیم). فیلتر: فقط جست‌وجو.
 * «در انتظار رای» یعنی درخواست تأمین باز که تأمین هنوز درباره‌اش تصمیم نگرفته: `final_status=OPEN&approval_status=PENDING` (S-14 ✅).
 */
const PAGE_SIZE = 8;
const VOTE_TABS = [
  { value: 'PENDING', label: 'در انتظار رای' },
  { value: 'APPROVED', label: 'تأیید شده' },
  { value: 'REJECTED', label: 'رد شده' },
] as const;
type VoteTab = (typeof VOTE_TABS)[number]['value'];
type Section = 'voting' | 'members';

export default function CouncilPage() {
  const can = usePerm();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const canVoting = can('supply.supply_requests.list');
  const section: Section = lp.tab === 'members' || !canVoting ? 'members' : 'voting';
  return (
    <Card>
        <div className={s.listHead}>
          <UnderlineTabs value={section} onChange={(t) => lp.set({ tab: t === 'voting' ? null : t, sel: null, vt: null, query: null })}
            options={[...(canVoting ? [{ value: 'voting' as const, label: 'رأی‌گیری' }] : []), { value: 'members' as const, label: 'اعضا و سوابق رأی' }]} />
        </div>
        {section === 'voting' ? <Voting lp={lp} /> : <CouncilMembersTable readOnly />}
    </Card>
  );
}

function Voting({ lp }: { lp: ReturnType<typeof useListParams> }) {
  const { text, setText, dq } = useSearchState(lp);
  const vt: VoteTab = VOTE_TABS.some((t) => t.value === lp.get('vt')) ? (lp.get('vt') as VoteTab) : 'PENDING';
  const sel = lp.get('sel');
  const pending = useRequests({ query: dq || undefined, final_status: 'OPEN', approval_status: 'PENDING', page: vt === 'PENDING' ? lp.page : 1, page_size: lp.pageSize });
  const approved = useRequests({ query: dq || undefined, final_status: 'APPROVED', page: vt === 'APPROVED' ? lp.page : 1, page_size: lp.pageSize });
  const rejected = useRequests({ query: dq || undefined, final_status: 'REJECTED', page: vt === 'REJECTED' ? lp.page : 1, page_size: lp.pageSize });
  const counts: Record<VoteTab, number | undefined> = { PENDING: pending.data?.total, APPROVED: approved.data?.total, REJECTED: rejected.data?.total };
  const source = { PENDING: { rows: pending.data?.results, q: pending },
    APPROVED: { rows: approved.data?.results, q: approved }, REJECTED: { rows: rejected.data?.results, q: rejected } }[vt];
  const total = counts[vt] ?? 0;

  return (
    <div className={s.voteLayout}>
      <div className={s.voteSide}>
        <UnderlineTabs value={vt} onChange={(t) => lp.set({ vt: t === 'PENDING' ? null : t, sel: null })}
          options={VOTE_TABS.map((t) => ({ value: t.value, label: <>{t.label} <span className={s.tabCount}>{counts[t.value] === undefined ? '' : faNum(counts[t.value])}</span></> }))} />
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: شماره، دلایل، تأمین‌کننده یا کالا" />
        <SideList rows={source.rows} loading={source.q.isLoading} error={source.q.error} onRetry={() => source.q.refetch()} sel={sel}
          onSelect={(id) => lp.set({ sel: id }, { keepPage: true })} active={!!dq} />
        {total > lp.pageSize ? <Pagination page={lp.page} pageSize={lp.pageSize} total={total} onPage={lp.setPage} /> : null}
      </div>
      <div className={s.voteMain}>
        <RequestDetailBody id={sel || null} compact onDone={() => lp.set({ sel: null }, { keepPage: true })} />
      </div>
    </div>
  );
}

function SideList({ rows, loading, error, onRetry, sel, onSelect, active }: {
  rows: SupplyRequest[] | undefined; loading: boolean; error: unknown; onRetry: () => void; sel: string; onSelect: (id: string) => void; active: boolean;
}) {
  if (loading) return <SkeletonRows rows={4} height={84} />;
  if (error) return <ErrorBox error={error} onRetry={onRetry} />;
  if (!rows?.length) return <Empty icon={<IconClipboardList size={26} stroke={1.5} />} title={active ? 'درخواست تأمینی با این جست‌وجو پیدا نشد' : 'درخواست تأمینی در این تب نیست'} />;
  return (
    <div className={s.reqCards}>
      {rows.map((r) => (
        <button key={r.id} type="button" className={`${s.reqCard} ${sel === r.id ? s.reqCardOn : ''}`} onClick={() => onSelect(r.id)} aria-pressed={sel === r.id}>
          <span className={s.reqCardTop}><b data-latin>{r.request_no}</b><Badge tone={toneOf(REQUEST_FINAL, r.final_status)}>{labelOf(REQUEST_FINAL, r.final_status, r.final_status_display)}</Badge></span>
          <span className={s.reqCardMeta}>{personName(r.requester)} · {faDate(r.request_date)}</span>
          <span className={s.reqCardMeta}>{faNum(r.line_count)} قلم · {faNum(int(r.total))} ریال · {faNum(r.vote_count)} رأی</span>
        </button>
      ))}
    </div>
  );
}
