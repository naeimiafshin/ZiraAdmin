import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  IconCheck,
  IconDownload,
  IconEye,
  IconPackage,
  IconShoppingCart,
} from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { groupMoney } from '@/shared/lib/money';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Empty, Modal, PageHead, Pagination, UnitHead } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import {
  exportSupplyRequests,
  useCustomerSupplyRequests,
  useSupplyCounts,
  useSupplyRequestDetail,
  useSupplyRequestMutations,
} from '../api/ordersApi';
import type {
  OrdersSupplyFilterParams,
  OrdersSupplyLifecycle,
  OrdersSupplyRequestOut,
  OrdersSupplyTab,
} from '../api/types';
import { SUPPLY_LIFECYCLE } from '../ordersLabels';
import s from '../orders.module.css';

const PAGE_SIZE = 20;

type SupplyTab = 'ALL' | 'NEW' | 'IN_SUPPLY' | 'READY' | 'DONE' | 'CLOSED';

const SUPPLY_TABS: { key: SupplyTab; label: string }[] = [
  { key: 'ALL', label: 'همه درخواست‌ها' },
  { key: 'NEW', label: 'درخواست‌های جدید' },
  { key: 'IN_SUPPLY', label: 'در حال بررسی و تأمین' },
  { key: 'READY', label: 'آماده صدور سفارش' },
  { key: 'DONE', label: 'تکمیل‌شده' },
  { key: 'CLOSED', label: 'بسته‌شده / لغو' },
];

const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'req_no', label: 'شماره درخواست', fixed: true },
  { key: 'date', label: 'تاریخ ثبت', fixed: true },
  { key: 'customer', label: 'مشتری', fixed: true },
  { key: 'branch', label: 'شعبه' },
  { key: 'status', label: 'وضعیت چرخه', fixed: true },
  { key: 'deposit', label: 'مبلغ بیعانه' },
  { key: 'delivery_due', label: 'موعد تحویل' },
  { key: 'valid_until', label: 'مهلت اعتبار' },
  { key: 'actions', label: 'عملیات', fixed: true },
];

const DEFAULT_HIDDEN = ['branch'];

export default function CustomerSupplyRequestsPage() {
  const navigate = useNavigate();
  const can = usePerm();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);

  const activeTab = (lp.tab as SupplyTab) || 'ALL';
  const openId = lp.get('open') || null;

  const prefs = useColumnPrefs('orders.supply', COLS, DEFAULT_HIDDEN);
  const { isVisible } = prefs;

  // فیلترها
  const lifecycle = lp.get('lifecycle') as OrdersSupplyLifecycle | '';
  const dateFrom = lp.get('df');
  const dateTo = lp.get('dt');

  const filterParams: OrdersSupplyFilterParams = {
    page: lp.page,
    page_size: lp.pageSize,
    query: dq || undefined,
    tab: activeTab !== 'ALL' ? (activeTab as OrdersSupplyTab) : undefined,
    lifecycle: lifecycle ? [lifecycle] : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const countsParams: OrdersSupplyFilterParams = {
    query: dq || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data, isLoading, error, refetch } = useCustomerSupplyRequests(filterParams);
  const { data: counts } = useSupplyCounts(countsParams);

  // جزئیات درخواست بازشده
  const { data: detailData, isLoading: loadingDetail, refetch: refetchDetail } = useSupplyRequestDetail(openId);
  const mutations = useSupplyRequestMutations();

  // وضعیت تصمیم‌گیری شورا
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionApproved, setDecisionApproved] = useState(true);
  const [decisionNote, setDecisionNote] = useState('');

  // وضعیت خروجی اکسل
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    try {
      setExporting(true);
      await exportSupplyRequests(filterParams);
      toast('خروجی اکسل درخواست‌های تأمین با موفقیت دانلود شد.', 'success');
    } catch {
      toast('خطا در دریافت خروجی اکسل.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ثبت تصمیم شورا
  const handleSaveDecision = async () => {
    if (!openId) return;
    if (!decisionApproved && !decisionNote.trim()) {
      toast('برای رد درخواست، درج توضیحات الزامی است.', 'error');
      return;
    }

    try {
      await mutations.decide.mutateAsync({
        id: openId,
        payload: {
          approved: decisionApproved,
          reason: decisionNote || undefined,
        },
      });
      toast(decisionApproved ? 'درخواست تأمین تأیید شد.' : 'درخواست تأمین رد شد.', 'success');
      setDecisionModalOpen(false);
      setDecisionNote('');
      refetchDetail();
      refetch();
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  // تبدیل به سفارش قطعی
  const handleConvertToOrder = async () => {
    if (!openId) return;
    try {
      const order = await mutations.convert.mutateAsync({
        id: openId,
        payload: {},
      });
      toast('درخواست تأمین با موفقیت به سفارش قطعی تبدیل شد.', 'success');
      lp.set({ open: null });
      navigate(`/orders/orders?open=${order.id}`);
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  const filters: FilterDef[] = [
    {
      key: 'lifecycle',
      label: 'مرحله تأمین',
      value: lifecycle,
      options: [
        { value: '', label: 'همه مراحل' },
        ...Object.entries(SUPPLY_LIFECYCLE).map(([k, v]) => ({
          value: k,
          label: v.label,
        })),
      ],
      onChange: (v) => lp.set({ lifecycle: v || undefined, page: 1 }),
    },
  ];

  // ستون‌های جدول
  const columns: Column<OrdersSupplyRequestOut>[] = [
    {
      key: 'row',
      header: 'ردیف',
      align: 'center',
      render: (_, idx) => faNum((lp.page - 1) * lp.pageSize + idx + 1),
    },
    {
      key: 'req_no',
      header: 'شماره درخواست',
      code: true,
      align: 'center',
      render: (r) => <span dir="ltr" data-latin>{r.request_no}</span>,
    },
    {
      key: 'date',
      header: 'تاریخ ثبت',
      align: 'center',
      render: (r) => faDate(r.request_date),
    },
    {
      key: 'customer',
      header: 'مشتری',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.customer?.store_name || r.customer?.full_name || '—'}</div>
          {r.customer?.code ? (
            <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }} dir="ltr" data-latin>
              {r.customer.code}
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  if (isVisible('branch')) {
    columns.push({
      key: 'branch',
      header: 'شعبه',
      align: 'center',
      render: (r) => r.branch?.name || '—',
    });
  }

  columns.push({
    key: 'status',
    header: 'وضعیت چرخه',
    align: 'center',
    render: (r) => {
      const info = SUPPLY_LIFECYCLE[r.lifecycle] || { label: r.lifecycle_display, tone: 'neutral' };
      return <Badge tone={info.tone}>{info.label}</Badge>;
    },
  });

  if (isVisible('deposit')) {
    columns.push({
      key: 'deposit',
      header: <UnitHead unit="ریال">مبلغ بیعانه</UnitHead>,
      align: 'center',
      render: (r) => (r.deposit_amount ? groupMoney(r.deposit_amount) : '—'),
    });
  }

  if (isVisible('delivery_due')) {
    columns.push({
      key: 'delivery_due',
      header: 'موعد تحویل',
      align: 'center',
      render: (r) => (r.delivery_due ? faDate(r.delivery_due) : '—'),
    });
  }

  if (isVisible('valid_until')) {
    columns.push({
      key: 'valid_until',
      header: 'مهلت اعتبار',
      align: 'center',
      render: (r) => (r.valid_until ? faDate(r.valid_until) : '—'),
    });
  }

  columns.push({
    key: 'actions',
    header: 'عملیات',
    align: 'center',
    render: (r) => (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => lp.set({ open: r.id })}
        icon={<IconEye size={15} />}
      >
        بررسی
      </Button>
    ),
  });

  return (
    <div>
      <PageHead
        title="درخواست‌های تأمین مشتریان"
        sub="کارتابل ارزیابی نیازهای سفارشی، بررسی شورا و تبدیل به سفارش قطعی"
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="secondary"
              size="md"
              onClick={handleExport}
              disabled={exporting}
              icon={<IconDownload size={16} />}
            >
              {exporting ? 'در حال خروجی...' : 'خروجی اکسل'}
            </Button>
          </div>
        }
      />

      {/* تب‌های چرخه‌ی تأمین */}
      <div className={s.tabBar} role="tablist" style={{ marginTop: 14 }}>
        {SUPPLY_TABS.map((t) => {
          const isActive = activeTab === t.key;
          const count = counts ? counts[t.key] : undefined;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${s.tabBtn} ${isActive ? s.tabActive : ''}`}
              onClick={() => lp.set({ tab: t.key === 'ALL' ? undefined : t.key, page: 1 })}
            >
              <span>{t.label}</span>
              {count !== undefined ? <span className={s.tabCount}>{faNum(count)}</span> : null}
            </button>
          );
        })}
      </div>

      {/* نوار جست‌وجو و فیلترها */}
      <TableFilters
        search={text}
        onSearch={setText}
        placeholder="جست‌وجوی شماره درخواست یا نام مشتری..."
        filters={filters}
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <DateFilter
              label="از تاریخ"
              value={dateFrom}
              onChange={(df) => lp.set({ df: df || undefined, page: 1 })}
            />
            <DateFilter
              label="تا تاریخ"
              value={dateTo}
              onChange={(dt) => lp.set({ dt: dt || undefined, page: 1 })}
            />
            <ColumnPicker {...prefs} />
          </div>
        }
      />

      {/* جدول درخواست‌ها */}
      <DataTable
        columns={columns}
        rows={data?.results}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        onRowClick={(r) => lp.set({ open: r.id })}
        empty={
          <Empty
            title="هیچ درخواست تأمینی یافت نشد"
            icon={<IconPackage size={40} />}
          />
        }
      />

      {/* صفحه‌بندی */}
      {data && data.total > lp.pageSize ? (
        <Pagination
          total={data.total}
          page={lp.page}
          pageSize={lp.pageSize}
          onPage={(page) => lp.set({ page })}
        />
      ) : null}

      {/* مودال بررسی و تصمیم‌گیری درخواست تأمین */}
      <Modal
        open={Boolean(openId)}
        onClose={() => lp.set({ open: null })}
        title={`بررسی درخواست تأمین ${detailData?.request_no || ''}`}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', width: '100%' }}>
            <Button variant="secondary" onClick={() => lp.set({ open: null })}>
              بستن
            </Button>

            <div style={{ display: 'flex', gap: 8 }}>
              {/* دکمه تصمیم شورا */}
              {can('orders.supply.decision') && detailData?.lifecycle === 'VOTING' ? (
                <Button
                  variant="primary"
                  onClick={() => setDecisionModalOpen(true)}
                  icon={<IconCheck size={16} />}
                >
                  ثبت نظر و رأی شورا
                </Button>
              ) : null}

              {/* تبدیل به سفارش فروش */}
              {can('orders.supply.convert') &&
              (detailData?.lifecycle === 'AWAITING_SALES_ORDER' || detailData?.lifecycle === 'AWAITING_ACCEPTANCE') ? (
                <Button
                  variant="primary"
                  onClick={handleConvertToOrder}
                  loading={mutations.convert.isPending}
                  icon={<IconShoppingCart size={16} />}
                >
                  تبدیل به سفارش قطعی فروش
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        {loadingDetail ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-400)' }}>
            در حال دریافت اطلاعات درخواست...
          </div>
        ) : detailData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>مشتری:</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                  {detailData.customer?.store_name || detailData.customer?.full_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                  کد: {detailData.customer?.code} · همراه: {detailData.customer?.mobile}
                </div>
              </div>

              <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>وضعیت جاری تأمین:</div>
                <div style={{ marginTop: 6 }}>
                  <Badge tone={SUPPLY_LIFECYCLE[detailData.lifecycle]?.tone || 'neutral'}>
                    {detailData.lifecycle_display || SUPPLY_LIFECYCLE[detailData.lifecycle]?.label}
                  </Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 6 }}>
                  موعد تحویل: {detailData.delivery_due ? faDate(detailData.delivery_due) : 'تعیین‌نشده'}
                </div>
              </div>
            </div>

            {/* جدول اقلام درخواستی */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
                اقلام مورد نیاز جهت تأمین:
              </div>
              <div style={{ border: '1px solid var(--frame-line)', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'center' }}>
                  <thead style={{ background: 'var(--surface-2)' }}>
                    <tr>
                      <th style={{ padding: 8 }}>ردیف</th>
                      <th style={{ padding: 8 }}>کد کالا</th>
                      <th style={{ padding: 8 }}>نام کالا</th>
                      <th style={{ padding: 8 }}>تعداد درخواستی</th>
                      <th style={{ padding: 8 }}>تعداد تأمین‌شده</th>
                      <th style={{ padding: 8 }}>قیمت برآوردی (ریال)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailData.lines.map((l, idx) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--frame-line)' }}>
                        <td style={{ padding: 8 }}>{faNum(idx + 1)}</td>
                        <td style={{ padding: 8 }} dir="ltr" data-latin>
                          {l.item_code || '—'}
                        </td>
                        <td style={{ padding: 8, fontWeight: 600, textAlign: 'start' }}>
                          {l.item_name || l.temp_name}
                        </td>
                        <td style={{ padding: 8 }}>{faNum(l.quantity)}</td>
                        <td style={{ padding: 8 }}>{faNum(l.received_quantity)}</td>
                        <td style={{ padding: 8 }}>{l.unit_price ? groupMoney(l.unit_price) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* سوابق تصمیم شورا و تأییدیه‌ها */}
            {detailData.approvals && detailData.approvals.length > 0 ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>سوابق تصمیم شورا و مراحل تأیید:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detailData.approvals.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: 'var(--surface-2)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <b>{v.approver?.name || v.stage_display}:</b> {v.reason || 'بدون توضیح'}
                      </div>
                      <Badge tone={v.decision === 'APPROVED' ? 'success' : v.decision === 'REJECTED' ? 'danger' : 'neutral'}>
                        {v.decision_display}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* مودال ثبت نظر و رأی شورا */}
      <Modal
        open={decisionModalOpen}
        onClose={() => setDecisionModalOpen(false)}
        title="ثبت رأی و نظر عضو شورا"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDecisionModalOpen(false)}>
              انصراف
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveDecision}
              loading={mutations.decide.isPending}
            >
              ثبت نهایی رأی
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              تصمیم شما:
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="council_vote"
                  checked={decisionApproved}
                  onChange={() => setDecisionApproved(true)}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--emerald)' }}>موافقت با تأمین</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="council_vote"
                  checked={!decisionApproved}
                  onChange={() => setDecisionApproved(false)}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>مخالفت و رد تأمین</span>
              </label>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              توضیحات / دلایل تصمیم:
            </label>
            <textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
              placeholder="توضیحات شورا درباره تأمین، شرایط قیمت، زمان‌بندی یا دلایل رد..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
