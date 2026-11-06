import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconAlertTriangle, IconBox, IconBoxOff, IconBuildingWarehouse, IconCoins, IconHash, IconMap2, IconPhone, IconUser } from '@tabler/icons-react';
import { branchStore } from '@/shared/api/client';
import { usePerm } from '@/shared/auth/usePerm';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Select } from '@/shared/ui/form';
import { Badge, Card, Empty, ErrorBox, PageHead, Pagination, SkeletonRows, UnitHead, Rial } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useStockFilterOptions } from './stockFilters';
import { useBranch, useStock, useStockDashboard, type BranchDetail, type StockRow } from './api';
import s from './branches.module.css';

/** وضعیت موجودی = StockStateEnum بک‌اند (B-10) */
const STATUS = [{ value: 'IN_STOCK', label: 'مطلوب' }, { value: 'LOW', label: 'زیر حداقل' }, { value: 'OUT', label: 'ناموجود' }];
const stateOf = (r: StockRow) => (Number(r.quantity) <= 0 ? 'OUT' : r.below_threshold ? 'LOW' : 'IN_STOCK');
const VALUE_TIP = 'ارزش ریالی فقط با مجوز «ارزش ریالی موجودی» (wms.stock_reports.value.read) نمایش داده می‌شود';

/**
 * موجودی شعب و انبارها — html Fixed «Branch Management» (موجودی شعب) روی wms فعلی:
 * انتخاب شعبه + محل نگهداری (هر انبار متصل یا «کل شعبه و انبارها»)، کارت شعبه، ۴ شاخص و جدول موجودی.
 * همه در سرور (B-10 رفع شد): GET /wms/stock با `branch_id`|`warehouse_id`، برند، دسته، `stock_state`، جست‌وجو و صفحه‌بندی؛ شاخص‌ها از GET /wms/stock/dashboard با همان محل، برند و دسته. «قیمت‌گذاری مجدد» حذف است (تصمیم 2026-09-29).
 * حالت (شعبه، محل، جست‌وجو، وضعیت، صفحه) در URL.
 */
export default function BranchStockPage() {
  const can = usePerm();
  const lp = useListParams({ page_size: 10 });
  const opts = useBranchOptions();
  const list = opts.data ?? [];
  const fromStore = branchStore.get();
  const branchId = lp.get('branch') || (list.some((b) => b.id === fromStore) ? fromStore! : list[0]?.id ?? '');
  const q = useBranch(branchId || undefined);
  const b = q.data;
  const canStock = can('wms.stock.list');
  return (
    <>
      <PageHead title="موجودی شعب و انبارها" sub="موجودی کالا در خود شعبه و انبارهای متصل به آن" />
      <Card className={s.stockPick}>
        <Select label="انتخاب شعبه" required value={branchId} placeholder={opts.isLoading ? 'در حال بارگذاری…' : 'یک شعبه انتخاب کنید'}
          options={list.map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }))}
          onChange={(e) => lp.set({ branch: e.target.value || null, wh: null })} disabled={!opts.canList} />
        <Select label="محل نگهداری (خود شعبه و انبارها)" value={lp.get('wh') || 'all'} disabled={!b || b.warehouses.length < 2}
          options={[{ value: 'all', label: `کل شعبه و انبارها (${faNum(b?.warehouses.length ?? 0)})` },
            ...(b?.warehouses ?? []).map((w) => ({ value: w.warehouse_id, label: w.is_primary ? `${w.name} (انبار اصلی)` : w.name }))]}
          onChange={(e) => lp.set({ wh: e.target.value === 'all' ? null : e.target.value })} />
      </Card>
      {!opts.canList ? <Card><Empty title="فهرست شعب برای حساب شما در دسترس نیست" text="برای انتخاب شعبه به مجوز «فهرست شعب» نیاز است." /></Card>
        : opts.isLoading || q.isLoading ? <Card><SkeletonRows rows={4} /></Card>
          : opts.error ? <Card><ErrorBox error={opts.error} onRetry={() => opts.refetch()} /></Card>
            : !branchId ? <Card><Empty title="هنوز شعبه‌ای ثبت نشده" /></Card>
              : q.error || !b ? <Card>{q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <Empty title="شعبه پیدا نشد" />}</Card>
                : <>
                  <BranchCard b={b} />
                  {!b.warehouses.length ? <Card><Empty icon={<IconBuildingWarehouse size={26} stroke={1.5} />} title="انباری به این شعبه وصل نیست" text="موجودی شعبه از انبارهای متصل خوانده می‌شود؛ از نمای شعبه ⇐ «انبارهای مربوطه» یک انبار وصل کنید." /></Card>
                    : !canStock ? <Card><Empty title="موجودی برای حساب شما در دسترس نیست" text="برای دیدن موجودی به مجوز «موجودی انبار» نیاز است." /></Card>
                      : <StockView b={b} lp={lp} />}
                </>}
    </>
  );
}

const Kv = ({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) => (
  <div className={s.kv}><span className={s.kvLabel}>{icon}{label}</span><span className={s.kvValue}>{children}</span></div>
);

function BranchCard({ b }: { b: BranchDetail }) {
  const nav = useNavigate();
  const manager = !b.manager_id ? 'تعیین نشده' : b.manager_name ?? 'تعیین‌شده';
  return (
    <Card className={s.infoCard}>
      <div className={s.kvGrid6}>
        <Kv icon={<IconHash size={14} />} label="کد شعبه"><span data-latin>{b.code}</span></Kv>
        <Kv icon={<IconBuildingWarehouse size={14} />} label="نام شعبه">
          <button type="button" className={s.linkText} onClick={() => nav(`/organization/branches/${b.id}`)} data-tip="مشاهده‌ی شعبه">{b.name}</button>
        </Kv>
        <Kv icon={<IconUser size={14} />} label="مدیر شعبه">{manager}</Kv>
        <Kv icon={<IconPhone size={14} />} label="تلفن تماس">{b.phone ? <span className="ltr">{b.phone}</span> : '—'}</Kv>
        <Kv icon={<IconBox size={14} />} label="تعداد انبارها">{faNum(b.warehouses.length)} انبار</Kv>
        <Kv icon={<IconMap2 size={14} />} label="نشانی">{[b.province, b.city, b.full_address].filter(Boolean).join('، ') || '—'}</Kv>
      </div>
    </Card>
  );
}

function StockView({ b, lp }: { b: BranchDetail; lp: ReturnType<typeof useListParams> }) {
  const wh = lp.get('wh');
  const scope = useMemo(() => b.warehouses.filter((w) => !wh || w.warehouse_id === wh), [b.warehouses, wh]);
  const primaryId = b.warehouses.find((w) => w.is_primary)?.warehouse_id;
  const brand = lp.get('brand'); const cat = lp.get('cat'); const st = lp.get('stock');
  const opts = useStockFilterOptions();
  const { text, setText, dq } = useSearchState(lp);
  // همه‌چیز در سرور (B-10): دامنه = انبارهای شعبه (branch_id) یا یک انبار؛ برند، دسته، وضعیت، جست‌وجو و صفحه‌بندی
  const where_ = { ...(wh ? { warehouse_id: wh } : { branch_id: b.id }), brand_id: brand || undefined, category_id: cat || undefined };
  const list = useStock({ ...where_, query: dq || undefined, stock_state: st || undefined, in_stock_only: st ? undefined : false, page: lp.page, page_size: lp.pageSize });
  // شاخص‌ها روی «نمای فعلی» = همان محل، برند و دسته (بدون جست‌وجو و وضعیت)
  const kpi = useStockDashboard(where_);
  const k = kpi.data;

  const filters: FilterDef[] = [
    { key: 'brand', label: 'برند', value: brand, onChange: lp.setFilter('brand'), options: opts.brands },
    { key: 'cat', label: 'دسته اصلی', value: cat, onChange: lp.setFilter('cat'), options: opts.mainCategories },
    { key: 'stock', label: 'وضعیت موجودی', value: st, onChange: lp.setFilter('stock'), options: STATUS },
  ];
  const cols: Column<StockRow>[] = [
    { key: 'i', header: 'ردیف', render: (_r, i) => faNum((lp.page - 1) * lp.pageSize + i + 1) },
    { key: 'code', header: 'کد کالا', code: true, render: (r) => <span data-latin>{r.item?.code ?? '—'}</span> },
    { key: 'brand', header: 'برند', render: (r) => r.item?.brand_name || '—' },
    { key: 'name', header: 'نام کالا', render: (r) => r.item?.display_name ?? '—' },
    { key: 'loc', header: 'محل نگهداری', render: (r) => <span className={s.locCell}><Badge tone={r.warehouse?.id === primaryId ? 'brand' : 'info'}>{r.warehouse?.id === primaryId ? 'اصلی' : 'انبار'}</Badge>{r.warehouse?.name ?? '—'}</span> },
    { key: 'qty', header: 'موجودی', render: (r) => <b className={stateOf(r) === 'OUT' ? s.dangerText : stateOf(r) === 'LOW' ? s.warnText : s.okText}>{faNum(Number(r.quantity))}</b> },
    { key: 'min', header: 'حداقل موجودی', render: (r) => (r.reorder_threshold !== null && r.reorder_threshold !== undefined ? faNum(Number(r.reorder_threshold)) : '—') },
    { key: 'value', header: <UnitHead>ارزش موجودی</UnitHead>, render: (r) => (r.stock_value !== null && r.stock_value !== undefined ? faNum(Number(r.stock_value)) : <span className={s.soon} data-tip={VALUE_TIP}>—</span>) },
    { key: 'st', header: 'وضعیت', render: (r) => { const x = stateOf(r); return x === 'OUT' ? <Badge tone="danger">ناموجود</Badge> : x === 'LOW' ? <Badge tone="warning">زیر حداقل</Badge> : <Badge tone="success">مطلوب</Badge>; } },
  ];
  const where = wh ? scope[0]?.name ?? '' : b.name;
  const kv = (n: number | undefined) => (kpi.isLoading || n === undefined ? null : n);
  return (
    <>
      <div className={s.kpiCards}>
        <Kpi icon={<IconBox size={20} />} tone={s.tBlue} label="ردیف موجودی" value={kv(k?.stock_rows) === null ? null : `${faNum(k!.stock_rows)} ردیف`} />
        <Kpi icon={<IconAlertTriangle size={20} />} tone={s.tAmber} label="کالای کم‌موجود" value={kv(k?.below_threshold) === null ? null : `${faNum(k!.below_threshold)} قلم`} />
        <Kpi icon={<IconBoxOff size={20} />} tone={s.tRose} label="کالای ناموجود" value={kv(k?.out_of_stock) === null ? null : `${faNum(k!.out_of_stock)} قلم`} />
        <Kpi icon={<IconCoins size={20} />} tone={s.tGreen} label="ارزش موجودی در نمای فعلی" tip={k && k.stock_value === null ? VALUE_TIP : undefined}
          value={!k ? null : k.stock_value !== null && k.stock_value !== undefined ? <>{faNum(Number(k.stock_value))} <Rial /></> : '—'} />
      </div>
      <Card className={s.stockCard}>
        <h3 className={s.tableTitle}>موجودی {where}</h3>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: نام، کد یا بارکد کالا" filters={filters} count={list.data ? `${faNum(list.data.total)} ردیف` : undefined} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={dq || st || brand || cat ? 'کالایی با این جست‌وجو و فیلترها پیدا نشد' : 'در این محل هنوز موجودی ثبت نشده'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
    </>
  );
}

function Kpi({ icon, tone, label, value, tip }: { icon: ReactNode; tone?: string; label: string; value: ReactNode | null; tip?: string }) {
  return (
    <Card className={s.kpiCard}>
      <span className={`${s.resIcon} ${tone ?? ""}`}>{icon}</span>
      <span className={s.kpiText} data-tip={tip}><small>{label}</small><b>{value ?? '…'}</b></span>
    </Card>
  );
}
