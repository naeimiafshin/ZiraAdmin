import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconFileSpreadsheet, IconLock, IconPlus, IconUserOff } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Avatar, Badge, Card, Empty, PageHead, Pagination } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useToast } from '@/shared/ui/toast';
import { downloadBlob, useAllGroups, useAllMarketers, useCustomers, type CustomerRow } from './api';
import { rial, TierBadge } from './components';
import { COOPERATION, CUSTOMER_STATUS, CUSTOMER_TYPE, IMAGE_LEVEL } from './labels';
import s from './customers.module.css';

/**
 * لیست مشتریان — GET /customers/profiles (صفحه‌بندی و فیلترها در بک‌اند، R-API-01).
 * فیلترها (افشین 2026-10-21: هر ۸ فیلتر بک‌اند): وضعیت، سطح همکاری، نوع، گروه، بازاریاب، سطح تصویر، لیست سیاه، قفل مالی.
 * حالت لیست (صفحه، جست‌وجو، فیلترها) در URL (useListParams، افشین 2026-10-25) تا «بازگشت» همان حالت را برگرداند.
 * «سطح احراز» جدا نیست: همان شماره‌ی سطح همکاری است و در ستون «سطح همکاری» می‌آید (BR-CUS-030، افشین 2026-10-25).
 */
const COLUMN_OPTIONS: ColumnOption[] = [
  { key: 'i', label: 'ردیف' },
  { key: 'code', label: 'کد مشتری', fixed: true },
  { key: 'name', label: 'نام و نام خانوادگی', fixed: true },
  { key: 'store', label: 'نام فروشگاه' },
  { key: 'mobile', label: 'موبایل' },
  { key: 'nid', label: 'کد ملی' },
  { key: 'level', label: 'سطح همکاری' },
  { key: 'groups', label: 'گروه‌های مشتری' },
  { key: 'marketer', label: 'نام بازاریاب' },
  { key: 'mkPct', label: 'درصد بازاریاب' },
  { key: 'chequeLimit', label: 'سقف اعتبار چکی' }, // ستون html «سقف اعتبار» ⇐ دو ستون (تصمیم افشین، G-07)
  { key: 'goldenLimit', label: 'سقف اعتبار طلایی' },
  { key: 'type', label: 'نوع' },
  { key: 'status', label: 'وضعیت' },
  { key: 'created', label: 'تاریخ ثبت' },
  { key: 'email', label: 'ایمیل' },
];

/** مثل html: «ایمیل» پیش‌فرض پنهان */
const DEFAULT_HIDDEN = ['email'];

export default function CustomersListPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const { page, pageSize } = lp;
  const FILTER_KEYS = ['status', 'level', 'type', 'group', 'marketer', 'image', 'blacklist', 'locked'] as const;
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, lp.get(k)])) as Record<(typeof FILTER_KEYS)[number], string>;
  const setFilter = lp.setFilter;
  const params = {
    page, page_size: pageSize, query: dq || undefined,
    status: f.status || undefined, cooperation_level: f.level || undefined, customer_type: f.type || undefined,
    group_id: f.group || undefined, marketer_id: f.marketer || undefined, image_access_level: f.image || undefined,
    is_blacklisted: f.blacklist ? f.blacklist === 'yes' : undefined, is_locked: f.locked ? f.locked === 'yes' : undefined,
  };
  const list = useCustomers(params);
  const groups = useAllGroups(can('customers.groups.list'));
  const marketers = useAllMarketers(can('customers.profiles.marketer.read'));
  const [exporting, setExporting] = useState(false);

  const yesNo = (yes: string, no: string) => [{ value: 'yes', label: yes }, { value: 'no', label: no }];
  const filters: FilterDef[] = [
    { key: 'status', label: 'وضعیت', value: f.status ?? '', onChange: setFilter('status'), options: Object.entries(CUSTOMER_STATUS).filter(([k]) => k !== 'BLOCKED').map(([value, v]) => ({ value, label: v.label })) },
    { key: 'level', label: 'سطح همکاری', value: f.level ?? '', onChange: setFilter('level'), options: Object.entries(COOPERATION).map(([value, v]) => ({ value, label: v.label })) },
    { key: 'type', label: 'نوع مشتری', value: f.type ?? '', onChange: setFilter('type'), options: Object.entries(CUSTOMER_TYPE).map(([value, label]) => ({ value, label })) },
    ...(groups.data ? [{ key: 'group', label: 'گروه', value: f.group ?? '', onChange: setFilter('group'), options: groups.data.map((g) => ({ value: g.id, label: g.name })) }] : []),
    ...(marketers.data ? [{ key: 'marketer', label: 'بازاریاب', value: f.marketer ?? '', onChange: setFilter('marketer'), options: marketers.data.map((m) => ({ value: m.id, label: m.full_name })) }] : []),
    { key: 'image', label: 'سطح تصویر', value: f.image ?? '', onChange: setFilter('image'), options: Object.entries(IMAGE_LEVEL).map(([value, v]) => ({ value, label: v.label })) },
    { key: 'blacklist', label: 'لیست سیاه', value: f.blacklist ?? '', onChange: setFilter('blacklist'), options: yesNo('در لیست سیاه', 'خارج از لیست سیاه') },
    { key: 'locked', label: 'قفل مالی', value: f.locked ?? '', onChange: setFilter('locked'), options: yesNo('مسدود مالی', 'بدون قفل') },
  ];

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const { page: _p, page_size: _s, ...rest } = params;
      await downloadBlob('/customers/profiles/export', rest, 'customers.xlsx');
      toast('خروجی اکسل آماده شد.');
    } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); }
  };

  const allCols: Column<CustomerRow>[] = [
    { key: 'i', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((page - 1) * pageSize + i + 1)}</span> },
    { key: 'code', header: 'کد مشتری', code: true, render: (c) => <span className="ltr">{c.code}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (c) => <span className={s.strong}>{c.full_name || '—'}</span> },
    { key: 'store', header: 'نام فروشگاه', render: (c) => c.store_name || <span className={s.muted}>—</span> },
    { key: 'mobile', header: 'موبایل', render: (c) => <span className="tnum">{c.mobile ?? '—'}</span> },
    { key: 'nid', header: 'کد ملی', code: true, render: (c) => <span className="tnum">{c.national_id ?? '—'}</span> },
    { key: 'level', header: 'سطح همکاری', render: (c) => <TierBadge level={c.cooperation_level} n={c.verification_level} /> },
    // ستون‌های html Fixed که جدول نداشت (افشین 2026-10-21)
    {
      key: 'groups', header: 'گروه‌های مشتری',
      render: (c) => (c.group_names?.length ? (
        <span className={s.groupChips} data-tip={c.group_names.length > 2 ? c.group_names.join('، ') : undefined}>
          {c.group_names.slice(0, 2).map((g) => <span key={g} className={s.groupChip}>{g}</span>)}
          {c.group_names.length > 2 ? <span className={s.groupMore}>+{faNum(c.group_names.length - 2)}</span> : null}
        </span>
      ) : <span className={s.muted}>—</span>),
    },
    {
      key: 'marketer', header: 'نام بازاریاب',
      render: (c) => (c.marketer_name ? (
        <span className={s.mkCell} data-tip={c.marketer_source === 'GROUP' ? 'بازاریاب گروه مشتری' : undefined}><Avatar seed={c.marketer_name} name={c.marketer_name} size={22} />{c.marketer_name}</span>
      ) : <span className={s.muted}>—</span>),
    },
    { key: 'mkPct', header: 'درصد بازاریاب', render: (c) => (c.marketer_percent != null && Number(c.marketer_percent) > 0 ? <span className={`${s.mkPct} tnum`}>٪{faNum(Number(c.marketer_percent))}</span> : <span className={s.muted}>—</span>) },
    { key: 'chequeLimit', header: 'سقف اعتبار چکی', render: (c) => (c.cheque_limit != null ? <span className={`${s.limit} tnum`}>{rial(c.cheque_limit)}</span> : <span className={s.muted} data-tip="حساب اعتبار چکی فعال ندارد">—</span>) },
    { key: 'goldenLimit', header: 'سقف اعتبار طلایی', render: (c) => (c.golden_limit != null ? <span className={`${s.limit} tnum`}>{rial(c.golden_limit)}</span> : <span className={s.muted} data-tip="حساب اعتبار طلایی فعال ندارد">—</span>) },
    { key: 'type', header: 'نوع', render: (c) => CUSTOMER_TYPE[c.customer_type] ?? c.customer_type },
    {
      key: 'status', header: 'وضعیت',
      render: (c) => (
        <span className={s.flags}>
          <Badge tone={CUSTOMER_STATUS[c.status]?.tone ?? 'neutral'}>{c.status_display}</Badge>
          {c.is_locked ? <Badge tone="danger"><IconLock size={12} />مسدود مالی</Badge> : null}
          {c.is_blacklisted ? <Badge tone="danger"><IconUserOff size={12} />لیست سیاه</Badge> : null}
        </span>
      ),
    },
    { key: 'created', header: 'تاریخ ثبت', render: (c) => <span className={s.muted}>{faDate(c.created_at)}</span> },
    { key: 'email', header: 'ایمیل', render: (c) => (c.email ? <span className={`${s.muted} ltr`} data-latin>{c.email}</span> : <span className={s.muted}>—</span>) },
  ];

  // انتخاب ستون‌ها (ذخیره برای هر کاربر؛ html Fixed): نام و کد مشتری ثابت‌اند
  const colOptions: ColumnOption[] = COLUMN_OPTIONS;
  const prefs = useColumnPrefs('customers.profiles', colOptions, DEFAULT_HIDDEN);
  const cols = allCols.filter((c) => prefs.isVisible(c.key));
  const active = !!dq || Object.values(f).some(Boolean);
  return (
    <>
      <PageHead
        actions={
          <>
            {can('customers.profiles.export') ? <Button variant="secondary" icon={<IconFileSpreadsheet size={17} />} onClick={exportXlsx} loading={exporting} loadingText="در حال ساخت فایل…">خروجی اکسل</Button> : null}
            {can('customers.registration_requests.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/customers/profiles/new')}>ثبت مشتری جدید</Button> : null}
          </>
        }
      />
      <Card>
        <TableFilters stacked search={text} onSearch={setText} placeholder="جست‌وجو: کد، نام، نام فروشگاه، نام مدیر، تلفن یا موبایل"
          filters={filters} count={list.data ? `${faNum(list.data.total)} مشتری` : undefined}
          extra={<ColumnPicker {...prefs} />} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(c) => c.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('customers.profiles.read') ? (c) => navigate(`/customers/profiles/${c.id}`) : undefined}
          empty={<Empty title={active ? 'مشتری‌ای با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز مشتری‌ای ثبت نشده است'} text={active ? undefined : 'با «ثبت مشتری جدید» اولین پرونده را بسازید.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
    </>
  );
}
