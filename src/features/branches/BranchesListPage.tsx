import { useNavigate } from 'react-router';
import { IconBuildingStore, IconChevronLeft, IconMapPin, IconPencil, IconPhone, IconPlus, IconUser } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { Badge, Card, Empty, ErrorBox, PageHead, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useBranchProvinces, useBranches, useStockCounts, type Branch, type StockCounts } from './api';
import { BRANCH_STATUS, branchMarkColor } from './labels';
import { SoonTag } from './SoonTag';
import s from './branches.module.css';


/**
 * لیست شعب — GET /organization/branches (صفحه‌بندی، جست‌وجو و فیلتر در سرور).
 * چیدمان کارت مثل html Fixed «Branch Management» (استثنای قانون جدول با تأیید افشین 2026-10-23).
 * جست‌وجو: نام، کد، تلفن، آدرس. فیلترها (افشین): وضعیت، استان.
 * مسئول از `manager_name` (B-01)؛ قلم کالا برای همه‌ی کارت‌های صفحه با یک `GET /wms/stock/counts?branch_ids=…` (B-02)؛ فروش ماه به‌زودی (دامنه‌ی فروش).
 */
export default function BranchesListPage() {
  const can = usePerm();
  const nav = useNavigate();
  const lp = useListParams({ page_size: 12 });
  const { text, setText, dq } = useSearchState(lp);
  const params = { page: lp.page, page_size: lp.pageSize, query: dq || undefined, status: lp.get('status') || undefined, province: lp.get('province') || undefined };
  const list = useBranches(params);
  const provinces = useBranchProvinces();

  const filters: FilterDef[] = [
    { key: 'status', label: 'وضعیت', value: lp.get('status'), onChange: lp.setFilter('status'), options: Object.entries(BRANCH_STATUS).map(([value, v]) => ({ value, label: v.label })) },
    { key: 'province', label: 'استان', value: lp.get('province'), onChange: lp.setFilter('province'), options: (provinces.data ?? []).map((p) => ({ value: p, label: p })) },
  ];
  const active = !!dq || !!lp.get('status') || !!lp.get('province');
  const rows = list.data?.results;
  const counts = useStockCounts({ branch_ids: (rows ?? []).map((b) => b.id) }, can('wms.stock.list'));

  return (
    <>
      <PageHead
        title="لیست شعب"
        sub={list.data ? `مدیریت شعبه‌ها و انبارهای زیرا مارکت — ${faNum(list.data.total)} شعبه` : 'مدیریت شعبه‌ها و انبارهای زیرا مارکت'}
        actions={can('organization.branches.create') ? (
          <Button icon={<IconPlus size={17} />} onClick={() => nav('/organization/branches/new')}>شعبه جدید</Button>
        ) : null}
      />
      <Card>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: نام، کد، تلفن یا آدرس شعبه" filters={filters}
          count={list.data ? `${faNum(list.data.total)} شعبه` : undefined} />
        <div className={s.listBody}>
          {list.isLoading ? <SkeletonRows rows={3} height={150} /> : null}
          {list.error ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
          {rows && rows.length === 0 ? (
            <Empty
              icon={<IconBuildingStore size={26} stroke={1.5} />}
              title={active ? 'شعبه‌ای با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز شعبه‌ای تعریف نشده است'}
              text={active ? undefined : can('organization.branches.create') ? 'با «شعبه جدید» اولین شعبه را بسازید.' : 'شعبه‌ای برای نمایش به شما وجود ندارد.'}
            />
          ) : null}
          {rows && rows.length > 0 ? (
            <div className={s.grid}>
              {rows.map((b) => <BranchCard key={b.id} b={b} canEdit={can('organization.branches.update')} counts={can('wms.stock.list') ? counts.data : null} />)}
            </div>
          ) : null}
        </div>
        {list.data && (list.data.total > list.data.page_size || lp.page > 1) ? (
          <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data?.total ?? 0} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[12, 24, 48]} />
        ) : null}
      </Card>
    </>
  );
}

function BranchCard({ b, canEdit, counts }: { b: Branch; canEdit: boolean; counts: StockCounts | null | undefined }) {
  const items = counts?.branches.find((c) => c.branch_id === b.id)?.items_in_stock;
  const nav = useNavigate();
  const st = BRANCH_STATUS[b.status] ?? { label: b.status_display, tone: 'neutral' as const };
  const address = [b.province && b.city ? `${b.province}، ${b.city}` : b.province || b.city, b.full_address].filter(Boolean).join('، ');
  return (
    <article className={`${s.card} ${b.status === 'ACTIVE' ? '' : s.cardOff}`}>
      <div className={s.head}>
        <span className={s.mark} style={{ background: branchMarkColor(b.code) }} aria-hidden><IconBuildingStore size={20} /></span>
        <div className={s.title}>
          <div className={s.name}>{b.name}</div>
          <div className={s.code} data-latin>{b.code}</div>
        </div>
        <span className={s.badges}>{b.is_online ? <Badge tone="info">آنلاین</Badge> : null}<Badge tone={st.tone}>{st.label}</Badge></span>
      </div>
      <ul className={s.lines}>
        <li data-tip="مسئول شعبه"><IconUser size={15} />{b.manager_name ? <span>مسئول: <b>{b.manager_name}</b></span> : <span className={s.soon}>مسئول: تعیین نشده</span>}</li>
        <li data-tip="شماره تماس"><IconPhone size={15} />{b.phone ? <span className="ltr">{b.phone}</span> : <span className={s.soon}>تلفن ثبت نشده</span>}</li>
        <li data-tip="نشانی"><IconMapPin size={15} />{address ? <span className={s.addr}>{address}</span> : <span className={s.soon}>نشانی ثبت نشده</span>}</li>
      </ul>
      <div className={s.stats}>
        <div className={s.stat} data-tip={counts === null ? 'برای دیدن موجودی به مجوز «موجودی انبار» نیاز است' : 'اقلام دارای موجودی در انبارهای شعبه'}>{items !== undefined ? <b>{faNum(items)}</b> : <b className={s.soonNum}>—</b>}<span>قلم کالا</span></div>
        <div className={s.stat}><b><SoonTag /></b><span>فروش ماه</span></div>
        <div className={s.stat}><b>{faNum((b.employees ?? []).length)}</b><span>کارمند</span></div>
      </div>
      <div className={s.foot}>
        <button type="button" className={s.view} onClick={() => nav(`/organization/branches/${b.id}`)}>مشاهده شعبه<IconChevronLeft size={15} /></button>
        {canEdit ? (
          <button type="button" className={s.edit} aria-label={`ویرایش ${b.name}`} data-tip="ویرایش شعبه" onClick={() => nav(`/organization/branches/${b.id}/edit`)}>
            <IconPencil size={16} />
          </button>
        ) : null}
      </div>
    </article>
  );
}
