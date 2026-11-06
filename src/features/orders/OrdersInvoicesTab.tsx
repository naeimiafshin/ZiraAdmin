import { useState } from 'react';
import { IconDownload, IconReceipt } from '@tabler/icons-react';
import { faDate, faNum } from '@/shared/lib/format';
import { groupMoney } from '@/shared/lib/money';
import { useColumnPrefs, type ColumnOption } from '@/shared/lib/useColumnPrefs';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Empty, Pagination, UnitHead } from '@/shared/ui/kit';
import { TableFilters, type FilterDef } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { DateFilter } from '@/features/branches/DateFilter';
import {
  exportOrderInvoices,
  useOrderInvoiceCounts,
  useOrderInvoices,
} from './api/ordersApi';
import type {
  OrdersInvoiceFilterParams,
  OrdersInvoiceRowOut,
  OrdersInvoiceSettlementStatus,
  OrdersInvoiceStatus,
  OrdersSettlementType,
} from './api/types';
import {
  INVOICE_SETTLEMENT_STATUS,
  INVOICE_STATUS,
  SETTLEMENT_TYPE,
} from './ordersLabels';
import s from './orders.module.css';

const PAGE_SIZE = 20;

const COLS: ColumnOption[] = [
  { key: 'row', label: 'ردیف', fixed: true },
  { key: 'inv_no', label: 'شماره فاکتور', fixed: true },
  { key: 'ord_no', label: 'شماره سفارش', fixed: true },
  { key: 'customer', label: 'مشتری', fixed: true },
  { key: 'branch', label: 'شعبه' },
  { key: 'lines', label: 'تعداد قلم' },
  { key: 'inv_date', label: 'تاریخ فاکتور' },
  { key: 'total', label: 'مبلغ فاکتور' },
  { key: 'settlement', label: 'نوع تسویه' },
  { key: 'settle_date', label: 'تاریخ تسویه' },
  { key: 'inv_status', label: 'وضعیت فاکتور' },
  { key: 'settle_status', label: 'وضعیت تسویه' },
];

const DEFAULT_HIDDEN = ['branch'];

interface Props {
  onOpenOrder: (orderId: string) => void;
}

export function OrdersInvoicesTab({ onOpenOrder }: Props) {
  const toast = useToast();
  const lp = useListParams({ page_size: PAGE_SIZE });
  const { text, setText, dq } = useSearchState(lp);

  const settlementTab = (lp.get('stype') as OrdersSettlementType | 'ALL') || 'ALL';
  const invStatus = lp.get('istat') as OrdersInvoiceStatus | '';
  const settleStatus = lp.get('sstat') as OrdersInvoiceSettlementStatus | '';
  const dateFrom = lp.get('df');
  const dateTo = lp.get('dt');

  const prefs = useColumnPrefs('orders.invoices', COLS, DEFAULT_HIDDEN);
  const { isVisible } = prefs;

  const filterParams: OrdersInvoiceFilterParams = {
    page: lp.page,
    page_size: lp.pageSize,
    query: dq || undefined,
    settlement_type: settlementTab !== 'ALL' ? [settlementTab] : undefined,
    invoice_status: invStatus ? [invStatus] : undefined,
    settlement_status: settleStatus ? [settleStatus] : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data, isLoading, error, refetch } = useOrderInvoices(filterParams);
  const { data: counts } = useOrderInvoiceCounts(filterParams);

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    try {
      setExporting(true);
      await exportOrderInvoices(filterParams);
      toast('خروجی اکسل فاکتورهای سفارش با موفقیت دانلود شد.', 'success');
    } catch {
      toast('خطا در دریافت خروجی اکسل فاکتورها.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const setSettlementTab = (tab: OrdersSettlementType | 'ALL') => {
    lp.set({ stype: tab === 'ALL' ? undefined : tab, page: 1 });
  };

  const filters: FilterDef[] = [
    {
      key: 'inv_status',
      label: 'وضعیت فاکتور',
      value: invStatus,
      options: [
        { value: '', label: 'همه' },
        { value: 'ISSUED', label: 'صادر شده' },
        { value: 'VOIDED', label: 'ابطال شده' },
      ],
      onChange: (v) => lp.set({ istat: v || undefined, page: 1 }),
    },
    {
      key: 'settle_status',
      label: 'وضعیت تسویه',
      value: settleStatus,
      options: [
        { value: '', label: 'همه' },
        { value: 'UNSETTLED', label: 'در انتظار تسویه' },
        { value: 'PARTIAL', label: 'تسویه جزئی' },
        { value: 'SETTLED', label: 'تسویه شده' },
      ],
      onChange: (v) => lp.set({ sstat: v || undefined, page: 1 }),
    },
  ];

  const columns: Column<OrdersInvoiceRowOut>[] = [];

  if (isVisible('row')) {
    columns.push({
      key: 'row',
      header: 'ردیف',
      align: 'center',
      render: (_, idx) => faNum((lp.page - 1) * lp.pageSize + idx + 1),
    });
  }

  if (isVisible('inv_no')) {
    columns.push({
      key: 'inv_no',
      header: 'شماره فاکتور',
      align: 'center',
      code: true,
      render: (r) => r.invoice_number || '—',
    });
  }

  if (isVisible('ord_no')) {
    columns.push({
      key: 'ord_no',
      header: 'شماره سفارش',
      align: 'center',
      code: true,
      render: (r) => (
        <button
          type="button"
          className={s.linkBtn}
          onClick={(e) => {
            e.stopPropagation();
            onOpenOrder(r.order_id);
          }}
          data-tip="مشاهده پرونده سفارش"
        >
          {r.order_number}
        </button>
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

  if (isVisible('lines')) {
    columns.push({
      key: 'lines',
      header: 'تعداد قلم',
      align: 'center',
      render: (r) => faNum(r.line_count),
    });
  }

  if (isVisible('inv_date')) {
    columns.push({
      key: 'inv_date',
      header: 'تاریخ فاکتور',
      align: 'center',
      render: (r) => faDate(r.invoice_date),
    });
  }

  if (isVisible('total')) {
    columns.push({
      key: 'total',
      header: <UnitHead unit="ریال">مبلغ فاکتور</UnitHead>,
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
        return <Badge tone={inf?.tone || 'neutral'}>{r.settlement_type_display || inf?.label || r.settlement_type}</Badge>;
      },
    });
  }

  if (isVisible('settle_date')) {
    columns.push({
      key: 'settle_date',
      header: 'تاریخ تسویه',
      align: 'center',
      render: (r) => faDate(r.settlement_date),
    });
  }

  if (isVisible('inv_status')) {
    columns.push({
      key: 'inv_status',
      header: 'وضعیت فاکتور',
      align: 'center',
      render: (r) => {
        const inf = INVOICE_STATUS[r.invoice_status];
        return <Badge tone={inf?.tone || 'neutral'}>{r.invoice_status_display || inf?.label}</Badge>;
      },
    });
  }

  if (isVisible('settle_status')) {
    columns.push({
      key: 'settle_status',
      header: 'وضعیت تسویه',
      align: 'center',
      render: (r) => {
        const inf = INVOICE_SETTLEMENT_STATUS[r.settlement_status];
        return <Badge tone={inf?.tone || 'neutral'}>{r.settlement_status_display || inf?.label}</Badge>;
      },
    });
  }

  const tabsList: { key: OrdersSettlementType | 'ALL'; label: string; count?: number }[] = [
    { key: 'ALL', label: 'همه فاکتورها', count: counts?.ALL },
    { key: 'CASH', label: 'نقدی', count: counts?.CASH },
    { key: 'CHEQUE', label: 'چکی', count: counts?.CHEQUE },
    { key: 'CREDIT', label: 'اعتباری', count: counts?.CREDIT },
    { key: 'MIXED', label: 'ترکیبی', count: counts?.MIXED },
  ];

  return (
    <div>
      {/* تب‌های نوع تسویه */}
      <div className={s.tabsBar}>
        <div className={s.tabGroup}>
          {tabsList.map((t) => {
            const active = settlementTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`${s.tabPill} ${active ? s.tabPillActive : ''}`}
                onClick={() => setSettlementTab(t.key)}
              >
                <span>{t.label}</span>
                {t.count !== undefined ? (
                  <span className={s.tabCount}>{faNum(t.count)}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            icon={<IconDownload size={15} />}
          >
            {exporting ? 'در حال خروجی...' : 'خروجی اکسل'}
          </Button>
        </div>
      </div>

      {/* نوار جست‌وجو و فیلترها */}
      <TableFilters
        search={text}
        onSearch={setText}
        placeholder="جست‌وجوی شماره فاکتور، شماره سفارش یا نام مشتری..."
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

      {/* جدول فاکتورهای سفارش */}
      <DataTable
        columns={columns}
        rows={data?.results}
        rowKey={(r) => r.invoice_id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        onRowClick={(r) => onOpenOrder(r.order_id)}
        empty={<Empty title="هیچ فاکتوری با این فیلترها یافت نشد" icon={<IconReceipt size={40} />} />}
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
    </div>
  );
}
