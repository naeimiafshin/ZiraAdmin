import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  IconArchive,
  IconDownload,
  IconEye,
  IconPencil,
  IconPlus,
  IconShoppingBag,
} from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { groupMoney } from '@/shared/lib/money';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Empty, PageHead, Pagination, Segmented, UnitHead } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import {
  exportOrders,
  useOrderStatusCounts,
  useOrders,
} from './api/ordersApi';
import type {
  OrdersChannel,
  OrdersFilterParams,
  OrdersOrderOut,
  OrdersSettlementType,
  OrdersSort,
  OrdersStatus,
} from './api/types';
import { OrderDetailModal } from './detail/OrderDetailModal';
import { OrdersInvoicesTab } from './OrdersInvoicesTab';
import {
  ORDER_CHANNEL,
  ORDER_STATUS,
  SETTLEMENT_TYPE,
} from './ordersLabels';
import s from './orders.module.css';

const PAGE_SIZE = 20;

const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'order_no', label: 'شماره سفارش', fixed: true },
  { key: 'order_date', label: 'تاریخ ثبت', fixed: true },
  { key: 'valid_until', label: 'مهلت اعتبار' },
  { key: 'customer', label: 'مشتری', fixed: true },
  { key: 'branch', label: 'شعبه' },
  { key: 'salesperson', label: 'کارشناس فروش' },
  { key: 'line_count', label: 'تعداد قلم' },
  { key: 'total_amount', label: 'مبلغ کل' },
  { key: 'settlement', label: 'نوع تسویه' },
  { key: 'channel', label: 'کانال' },
  { key: 'invoice_no', label: 'شماره فاکتور' },
  { key: 'status', label: 'وضعیت', fixed: true },
  { key: 'actions', label: 'عملیات', fixed: true },
];

const DEFAULT_HIDDEN = ['valid_until', 'salesperson', 'channel'];

interface Props {
  defaultTab?: 'orders' | 'invoices';
}

export default function OrdersListPage({ defaultTab = 'orders' }: Props) {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);

  // تب اصلی: سفارش‌ها یا فاکتورها
  const { id: routeId } = useParams<{ id?: string }>();
  const location = useLocation();
  const isInvoiceRoute = location.pathname.startsWith('/orders/invoices');
  const mainTab = (isInvoiceRoute ? 'invoices' : (lp.get('view') as 'orders' | 'invoices')) || defaultTab;
  const setMainTab = (v: string) => {
    lp.set({ view: v === 'orders' ? undefined : v, page: 1, open: undefined });
  };

  // تب وضعیت سفارش‌ها
  const statusTab = (lp.get('status') as OrdersStatus | 'ALL' | 'CANCELLATION_REQUESTED') || 'ALL';
  const isArchived = lp.get('archived') === 'true';

  const channel = lp.get('ch') as OrdersChannel | '';
  const settlementType = lp.get('st') as OrdersSettlementType | '';
  const invoiced = lp.get('inv');
  const dateFrom = lp.get('df');
  const dateTo = lp.get('dt');
  const sort = (lp.get('sort') as OrdersSort) || 'newest';

  const openId = routeId || lp.get('open') || null;

  const prefs = useColumnPrefs('orders.list', COLS, DEFAULT_HIDDEN);
  const { isVisible } = prefs;

  // پارامترهای فیلتر لیست
  const filterParams: OrdersFilterParams = {
    page: lp.page,
    page_size: lp.pageSize,
    query: dq || undefined,
    status:
      statusTab !== 'ALL' && statusTab !== 'CANCELLATION_REQUESTED'
        ? [statusTab as OrdersStatus]
        : undefined,
    cancellation_requested: statusTab === 'CANCELLATION_REQUESTED' ? true : undefined,
    channel: channel ? [channel] : undefined,
    settlement_type: settlementType ? [settlementType] : undefined,
    invoiced: invoiced === 'true' ? true : invoiced === 'false' ? false : undefined,
    archived: isArchived,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    sort,
  };

  const { data, isLoading, error, refetch } = useOrders(filterParams);
  const { data: counts } = useOrderStatusCounts({
    ...filterParams,
    status: undefined,
    cancellation_requested: undefined,
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    try {
      setExporting(true);
      await exportOrders(filterParams);
      toast('خروجی اکسل سفارش‌ها با موفقیت دانلود شد.', 'success');
    } catch {
      toast('خطا در دریافت خروجی اکسل سفارش‌ها.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleOpenOrder = (id: string) => {
    lp.set({ open: id });
  };

  const handleCloseDetail = () => {
    lp.set({ open: undefined });
  };

  const setStatusTab = (tab: OrdersStatus | 'ALL' | 'CANCELLATION_REQUESTED') => {
    lp.set({
      status: tab === 'ALL' ? undefined : tab,
      archived: undefined,
      page: 1,
    });
  };

  const toggleArchived = () => {
    lp.set({
      archived: isArchived ? undefined : 'true',
      status: undefined,
      page: 1,
    });
  };

  const filters: FilterDef[] = [
    {
      key: 'channel',
      label: 'کانال ثبت',
      value: channel,
      options: [
        { value: '', label: 'همه کانال‌ها' },
        { value: 'ONLINE', label: 'سایت' },
        { value: 'APP', label: 'اپلیکیشن' },
        { value: 'ADMIN', label: 'پنل کارمند' },
        { value: 'SUPPLY_REQUEST', label: 'درخواست تأمین' },
      ],
      onChange: (v) => lp.set({ ch: v || undefined, page: 1 }),
    },
    {
      key: 'settlement_type',
      label: 'نوع تسویه',
      value: settlementType,
      options: [
        { value: '', label: 'همه روش‌ها' },
        { value: 'CASH', label: 'نقدی' },
        { value: 'CHEQUE', label: 'چکی' },
        { value: 'CREDIT', label: 'اعتباری' },
        { value: 'MIXED', label: 'ترکیبی' },
      ],
      onChange: (v) => lp.set({ st: v || undefined, page: 1 }),
    },
    {
      key: 'invoiced',
      label: 'صدور فاکتور',
      value: invoiced || '',
      options: [
        { value: '', label: 'همه' },
        { value: 'true', label: 'فاکتور صادر شده' },
        { value: 'false', label: 'بدون فاکتور' },
      ],
      onChange: (v) => lp.set({ inv: v || undefined, page: 1 }),
    },
  ];

  const columns: Column<OrdersOrderOut>[] = [];

  if (isVisible('row')) {
    columns.push({
      key: 'row',
      header: 'ردیف',
      align: 'center',
      render: (_, idx) => faNum((lp.page - 1) * lp.pageSize + idx + 1),
    });
  }

  if (isVisible('order_no')) {
    columns.push({
      key: 'order_no',
      header: 'شماره سفارش',
      align: 'center',
      code: true,
      render: (r) => (
        <button
          type="button"
          className={s.linkBtn}
          onClick={(e) => {
            e.stopPropagation();
            handleOpenOrder(r.id);
          }}
          data-tip="مشاهده جزئیات سفارش"
        >
          {r.order_number}
        </button>
      ),
    });
  }

  if (isVisible('order_date')) {
    columns.push({
      key: 'order_date',
      header: 'تاریخ ثبت',
      align: 'center',
      render: (r) => faDate(r.order_date),
    });
  }

  if (isVisible('valid_until')) {
    columns.push({
      key: 'valid_until',
      header: 'مهلت اعتبار',
      align: 'center',
      render: (r) => (
        <div>
          <span>{faDate(r.valid_until)}</span>
          {r.is_expired ? (
            <span style={{ marginInlineStart: 4 }}>
              <Badge tone="danger">منقضی</Badge>
            </span>
          ) : null}
        </div>
      ),
    });
  }

  if (isVisible('customer')) {
    columns.push({
      key: 'customer',
      header: 'مشتری',
      align: 'center',
      render: (r) => (
        <div>
          <div className={s.strong}>
            {r.customer?.store_name || r.customer?.full_name || '—'}
          </div>
          {r.customer?.code ? (
            <span className={s.sub}>کد: {r.customer.code}</span>
          ) : null}
        </div>
      ),
    });
  }

  if (isVisible('branch')) {
    columns.push({
      key: 'branch',
      header: 'شعبه',
      align: 'center',
      render: (r) => r.branch?.name || '—',
    });
  }

  if (isVisible('salesperson')) {
    columns.push({
      key: 'salesperson',
      header: 'کارشناس فروش',
      align: 'center',
      render: (r) => r.salesperson?.name || '—',
    });
  }

  if (isVisible('line_count')) {
    columns.push({
      key: 'line_count',
      header: 'تعداد قلم',
      align: 'center',
      render: (r) => faNum(r.line_count),
    });
  }

  if (isVisible('total_amount')) {
    columns.push({
      key: 'total_amount',
      header: <UnitHead unit="ریال">مبلغ کل</UnitHead>,
      align: 'center',
      render: (r) => groupMoney(r.total_amount),
    });
  }

  if (isVisible('settlement')) {
    columns.push({
      key: 'settlement',
      header: 'نوع تسویه',
      align: 'center',
      render: (r) => {
        const inf = SETTLEMENT_TYPE[r.settlement_type];
        return <Badge tone={inf?.tone || 'neutral'}>{r.settlement_type_display || inf?.label}</Badge>;
      },
    });
  }

  if (isVisible('channel')) {
    columns.push({
      key: 'channel',
      header: 'کانال',
      align: 'center',
      render: (r) => ORDER_CHANNEL[r.channel] || r.channel_display,
    });
  }

  if (isVisible('invoice_no')) {
    columns.push({
      key: 'invoice_no',
      header: 'شماره فاکتور',
      align: 'center',
      code: true,
      render: (r) => r.invoice_number || '—',
    });
  }

  if (isVisible('status')) {
    columns.push({
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      render: (r) => {
        const inf = ORDER_STATUS[r.status];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <Badge tone={inf?.tone || 'neutral'}>{r.status_display || inf?.label}</Badge>
            {r.has_open_cancellation ? (
              <Badge tone="danger">درخواست لغو</Badge>
            ) : null}
          </div>
        );
      },
    });
  }

  if (isVisible('actions')) {
    columns.push({
      key: 'actions',
      header: 'عملیات',
      align: 'center',
      render: (r) => (
        <div className={s.rowActions}>
          <button
            type="button"
            className={s.iconBtn}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenOrder(r.id);
            }}
            data-tip="مشاهده پرونده سفارش"
            aria-label="مشاهده"
          >
            <IconEye size={16} />
          </button>
          {r.status === 'AWAITING_CONFIRMATION' || r.status === 'PENDING_APPROVAL' ? (
            <button
              type="button"
              className={s.iconBtn}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/orders/orders/${r.id}/edit`);
              }}
              data-tip="ویرایش سفارش"
              aria-label="ویرایش"
            >
              <IconPencil size={16} />
            </button>
          ) : null}
        </div>
      ),
    });
  }

  const statusTabsList: { key: OrdersStatus | 'ALL' | 'CANCELLATION_REQUESTED'; label: string; count?: number }[] = [
    { key: 'ALL', label: 'همه', count: counts?.ALL },
    { key: 'AWAITING_CONFIRMATION', label: 'در انتظار تأیید مشتری', count: counts?.AWAITING_CONFIRMATION },
    { key: 'PENDING_APPROVAL', label: 'در انتظار تأیید حسابدار', count: counts?.PENDING_APPROVAL },
    { key: 'APPROVED', label: 'تأیید شده', count: counts?.APPROVED },
    { key: 'PREPARING', label: 'آماده‌سازی', count: counts?.PREPARING },
    { key: 'SHIPPED', label: 'ارسال شده', count: counts?.SHIPPED },
    { key: 'DELIVERED', label: 'تحویل مشتری', count: counts?.DELIVERED },
    { key: 'REJECTED', label: 'رد شده', count: counts?.REJECTED },
    { key: 'CANCELLED', label: 'لغو شده', count: counts?.CANCELLED },
    { key: 'CANCELLATION_REQUESTED', label: 'دارای درخواست لغو', count: counts?.CANCELLATION_REQUESTED },
  ];

  return (
    <div>
      <PageHead
        title="مدیریت سفارشات"
        sub="فهرست و کارتابل سفارش‌ها، فاکتورهای فروش صادرشده و درخواست‌های تأمین"
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {mainTab === 'orders' ? (
              <Button
                variant="secondary"
                size="md"
                onClick={handleExport}
                disabled={exporting}
                icon={<IconDownload size={16} />}
              >
                {exporting ? 'در حال خروجی...' : 'خروجی اکسل'}
              </Button>
            ) : null}
            {can('orders.orders.create') ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => navigate('/orders/orders/new')}
                icon={<IconPlus size={16} />}
              >
                ثبت سفارش جدید
              </Button>
            ) : null}
          </div>
        }
      />

      {/* ناوبری دو تب اصلی: سفارش‌ها و فاکتورها */}
      <div style={{ marginBottom: 18 }}>
        <Segmented
          value={mainTab}
          onChange={setMainTab}
          options={[
            { value: 'orders', label: 'سفارش‌ها' },
            { value: 'invoices', label: 'فاکتورهای سفارش' },
          ]}
        />
      </div>

      {mainTab === 'invoices' ? (
        <OrdersInvoicesTab onOpenOrder={handleOpenOrder} />
      ) : (
        <>
          {/* تب‌های وضعیت و دکمه بایگانی */}
          <div className={s.tabsBar}>
            <div className={s.tabGroup}>
              {statusTabsList.map((t) => {
                const active = !isArchived && statusTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={`${s.tabPill} ${active ? s.tabPillActive : ''}`}
                    onClick={() => setStatusTab(t.key)}
                  >
                    <span>{t.label}</span>
                    {t.count !== undefined ? (
                      <span className={s.tabCount}>{faNum(t.count)}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={`${s.archiveSwitch} ${isArchived ? s.archiveSwitchActive : ''}`}
              onClick={toggleArchived}
              data-tip="نمایش سفارش‌های بایگانی‌شده"
            >
              <IconArchive size={16} />
              <span>تب بایگانی</span>
              {counts?.ARCHIVED !== undefined ? (
                <span className={s.tabCount}>{faNum(counts.ARCHIVED)}</span>
              ) : null}
            </button>
          </div>

          {/* نوار فیلترها و جست‌وجو */}
          <TableFilters
            stacked
            search={text}
            onSearch={setText}
            placeholder="جست‌وجوی شماره سفارش، شماره فاکتور، کالا یا نام مشتری..."
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

          {/* جدول سفارش‌ها */}
          <DataTable
            columns={columns}
            rows={data?.results}
            rowKey={(r) => r.id}
            loading={isLoading}
            error={error}
            onRetry={refetch}
            onRowClick={(r) => handleOpenOrder(r.id)}
            empty={
              <Empty
                title={isArchived ? 'هیچ سفارشی در بایگانی نیست' : 'هیچ سفارشی یافت نشد'}
                icon={<IconShoppingBag size={40} />}
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
        </>
      )}

      {/* مودال جزئیات سفارش (هماهنگ با URL openId) */}
      {openId ? (
        <OrderDetailModal
          orderId={openId}
          onClose={handleCloseDetail}
          onStatusUpdated={() => {
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}
