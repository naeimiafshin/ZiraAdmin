import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  IconAlertTriangle,
  IconArchive,
  IconArchiveOff,
  IconCheck,
  IconFileInvoice,
  IconPencil,
  IconPrinter,
  IconTruck,
  IconX,
} from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { groupMoney } from '@/shared/lib/money';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Modal, SectionTitle, UnitHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { SoonTag } from '@/features/branches/SoonTag';
import {
  fetchOrderPrint,
  useOrderDetail,
  useOrderMutations,
} from '../api/ordersApi';
import type {
  OrdersCancelReason,
  OrdersLineOut,
  OrdersSettlementPartOut,
  OrdersStatus,
} from '../api/types';
import {
  CANCEL_REASON,
  CANCEL_STATUS,
  DELIVERY_TYPE,
  ORDER_CHANNEL,
  ORDER_STATUS,
  PART_METHOD,
  SETTLEMENT_TYPE,
} from '../ordersLabels';
import { printOrder } from '../print/orderPrint';
import s from '../orders.module.css';

interface Props {
  orderId: string;
  onClose: () => void;
  onStatusUpdated?: () => void;
}

export function OrderDetailModal({ orderId, onClose, onStatusUpdated }: Props) {
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: order, isLoading, error, refetch } = useOrderDetail(orderId);
  const mutations = useOrderMutations();

  // وضعیت‌های پاپ‌آپ‌های عملیاتی
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<OrdersCancelReason>('CUSTOMER_REQUEST');
  const [cancelNote, setCancelNote] = useState('');

  const [cancelDecisionModalOpen, setCancelDecisionModalOpen] = useState(false);
  const [cancelApproveDecision, setCancelApproveDecision] = useState(true);
  const [cancelDecisionNote, setCancelDecisionNote] = useState('');

  const [printing, setPrinting] = useState(false);

  if (!orderId) return null;

  const handlePrint = async () => {
    try {
      setPrinting(true);
      const printData = await fetchOrderPrint(orderId);
      printOrder(printData);
    } catch (err) {
      toast(userMessage(err), 'error');
    } finally {
      setPrinting(false);
    }
  };

  const handleApproveAccounting = async () => {
    try {
      await mutations.approveAccounting.mutateAsync({ id: orderId, note: '' });
      toast('سفارش توسط حسابداری تأیید و فاکتور فروش صادر شد.', 'success');
      refetch();
      onStatusUpdated?.();
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  const handleRejectAccounting = async () => {
    if (!rejectReason.trim()) {
      toast('علت رد سفارش الزامی است.', 'error');
      return;
    }
    try {
      await mutations.rejectAccounting.mutateAsync({ id: orderId, note: rejectReason });
      toast('سفارش رد شد.', 'success');
      setRejectModalOpen(false);
      setRejectReason('');
      refetch();
      onStatusUpdated?.();
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  const handleAdvanceStatus = async () => {
    if (!order?.next_status) return;
    try {
      await mutations.changeStatus.mutateAsync({
        id: orderId,
        payload: { to_status: order.next_status, note: '' },
      });
      toast(`وضعیت سفارش به «${ORDER_STATUS[order.next_status as OrdersStatus]?.label}» تغییر یافت.`, 'success');
      refetch();
      onStatusUpdated?.();
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  const handleRequestCancellation = async () => {
    if (cancelReason === 'OTHER' && !cancelNote.trim()) {
      toast('برای گزینه سایر، توضیحات الزامی است.', 'error');
      return;
    }
    try {
      await mutations.requestCancellation.mutateAsync({
        id: orderId,
        payload: { reason: cancelReason, note: cancelNote },
      });
      toast('درخواست لغو سفارش ثبت شد و در انتظار بررسی است.', 'success');
      setCancelModalOpen(false);
      setCancelNote('');
      refetch();
      onStatusUpdated?.();
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  const handleDecideCancellation = async () => {
    if (!cancelApproveDecision && !cancelDecisionNote.trim()) {
      toast('برای رد درخواست لغو، درج توضیحات الزامی است.', 'error');
      return;
    }
    try {
      await mutations.decideCancellation.mutateAsync({
        id: orderId,
        payload: { approved: cancelApproveDecision, note: cancelDecisionNote },
      });
      toast(
        cancelApproveDecision ? 'درخواست لغو تأیید و سفارش لغو شد.' : 'درخواست لغو رد شد.',
        'success'
      );
      setCancelDecisionModalOpen(false);
      setCancelDecisionNote('');
      refetch();
      onStatusUpdated?.();
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  const handleToggleArchive = async () => {
    if (!order) return;
    const nextArchive = !order.archived_at;
    try {
      await mutations.setArchived.mutateAsync({ id: orderId, archived: nextArchive });
      toast(nextArchive ? 'سفارش به تب بایگانی منتقل شد.' : 'سفارش از بایگانی بازگردانده شد.', 'success');
      refetch();
      onStatusUpdated?.();
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  // محاسبه گام‌های تایم‌لاین
  const STAGE_ORDER: OrdersStatus[] = ['AWAITING_CONFIRMATION', 'PENDING_APPROVAL', 'PREPARING', 'SHIPPED', 'DELIVERED'];
  const currentStatusIdx = order ? STAGE_ORDER.indexOf(order.status) : -1;

  // ستون‌های اقلام
  const lineCols: Column<OrdersLineOut>[] = [
    { key: 'row_no', header: 'ردیف', align: 'center', render: (_, i) => faNum(i + 1) },
    { key: 'item_code', header: 'کد کالا', align: 'center', code: true, render: (l) => l.item_code || '—' },
    { key: 'item_name', header: 'نام کالا', align: 'center', render: (l) => <span className={s.strong}>{l.item_name || '—'}</span> },
    { key: 'unit_name', header: 'واحد', align: 'center', render: (l) => l.unit_name || 'عدد' },
    { key: 'quantity', header: 'تعداد', align: 'center', render: (l) => faNum(l.quantity) },
    { key: 'unit_price', header: <UnitHead unit="ریال">فی واحد</UnitHead>, align: 'center', render: (l) => groupMoney(l.unit_price) },
    { key: 'line_discount', header: <UnitHead unit="ریال">تخفیف</UnitHead>, align: 'center', render: (l) => groupMoney(l.line_discount) },
    { key: 'tax_amount', header: <UnitHead unit="ریال">مالیات</UnitHead>, align: 'center', render: (l) => groupMoney(l.tax_amount) },
    { key: 'line_total', header: <UnitHead unit="ریال">مبلغ کل</UnitHead>, align: 'center', render: (l) => <span className={s.strong}>{groupMoney(l.line_total)}</span> },
  ];

  // ستون‌های تسویه
  const partCols: Column<OrdersSettlementPartOut>[] = [
    { key: 'method', header: 'روش تسویه', align: 'center', render: (p) => <Badge tone={PART_METHOD[p.method]?.tone || 'neutral'}>{p.method_display || PART_METHOD[p.method]?.label}</Badge> },
    { key: 'amount', header: <UnitHead unit="ریال">مبلغ بخش</UnitHead>, align: 'center', render: (p) => groupMoney(p.amount) },
    { key: 'due_date', header: 'سررسید', align: 'center', render: (p) => (p.due_date ? faDate(p.due_date) : 'نقدی / فوری') },
    { key: 'bank_name', header: 'بانک و شعبه', align: 'center', render: (p) => (p.bank_name ? `${p.bank_name} ${p.bank_branch ? `(${p.bank_branch})` : ''}` : '—') },
    { key: 'sayad_no', header: 'شناسه صیادی', align: 'center', code: true, render: (p) => p.sayad_no || '—' },
    { key: 'owner_name', header: 'صاحب حساب', align: 'center', render: (p) => p.owner_name || '—' },
  ];

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        width={1060}
        title={
          <div className={s.detailTitleBox}>
            <span className={s.detailOrderNum}>{order?.order_number || 'جزئیات سفارش'}</span>
            {order ? (
              <Badge tone={ORDER_STATUS[order.status]?.tone || 'neutral'}>
                {order.status_display || ORDER_STATUS[order.status]?.label}
              </Badge>
            ) : null}
            {order?.archived_at ? <Badge tone="danger">بایگانی شده</Badge> : null}
            {order?.is_expired ? <Badge tone="danger">منقضی شده</Badge> : null}
          </div>
        }
      >
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>در حال دریافت اطلاعات پرونده سفارش...</div>
        ) : error || !order ? (
          <div style={{ padding: 30, color: 'var(--danger)' }}>خطا در بارگذاری پرونده سفارش.</div>
        ) : (
          <div>
            {/* کارت هیرو و تایم‌لاین مراحل */}
            <div className={s.detailHero}>
              <div className={s.detailHeaderRow}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
                    {order.customer?.store_name || order.customer?.full_name || '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                    کد مشتری: {order.customer?.code || '—'} · همراه: {order.customer?.mobile || '—'} · کانال ثبت: {ORDER_CHANNEL[order.channel] || order.channel_display}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePrint}
                    disabled={printing}
                    icon={<IconPrinter size={15} />}
                  >
                    {printing ? 'آماده‌سازی...' : 'چاپ سفارش'}
                  </Button>
                  {order.can_edit && (order.status === 'AWAITING_CONFIRMATION' || order.status === 'PENDING_APPROVAL') ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/orders/orders/${order.id}/edit`)}
                      icon={<IconPencil size={15} />}
                    >
                      ویرایش سفارش
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* تایم‌لاین مراحل چرخه سفارش */}
              <div className={s.timeline}>
                <div className={s.timelineLine} />
                <div
                  className={s.timelineProgress}
                  style={{
                    width: currentStatusIdx >= 0 ? `${(currentStatusIdx / (STAGE_ORDER.length - 1)) * 100}%` : '0%',
                  }}
                />
                {STAGE_ORDER.map((stepKey, idx) => {
                  const isDone = currentStatusIdx > idx;
                  const isActive = currentStatusIdx === idx;
                  return (
                    <div key={stepKey} className={s.timelineStep}>
                      <div
                        className={`${s.stepDot} ${isDone ? s.stepDotDone : ''} ${isActive ? s.stepDotActive : ''}`}
                      >
                        {isDone ? '✓' : faNum(idx + 1)}
                      </div>
                      <span className={`${s.stepLabel} ${isActive ? s.stepLabelActive : ''}`}>
                        {ORDER_STATUS[stepKey]?.label.replace('در انتظار ', '')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* شبکه دو ستونه اطلاعات و اکشن‌ها */}
            <div className={s.detailGrid}>
              {/* ستون اصلی */}
              <div className={s.detailMain}>
                {/* کارت تحویل و نشانی */}
                <Card>
                  <SectionTitle>اطلاعات تحویل و گیرنده</SectionTitle>
                  <div className={s.kvGrid} style={{ marginTop: 12 }}>
                    <div className={s.kvItem}>
                      <label>روش تحویل</label>
                      <span>{DELIVERY_TYPE[order.delivery_type] || order.delivery_type_display}</span>
                    </div>
                    <div className={s.kvItem}>
                      <label>شعبه و انبار</label>
                      <span>{order.branch?.name || '—'} {order.warehouse?.name ? `(${order.warehouse.name})` : ''}</span>
                    </div>
                    <div className={s.kvItem}>
                      <label>گیرنده</label>
                      <span>{order.recipient_name || order.customer?.full_name || '—'}</span>
                    </div>
                    <div className={s.kvItem}>
                      <label>تلفن تحویل‌گیرنده</label>
                      <span>{order.recipient_phone || order.customer?.mobile || '—'}</span>
                    </div>
                    <div className={s.kvItem} style={{ gridColumn: '1 / -1' }}>
                      <label>نشانی کامل تحویل</label>
                      <span>
                        {order.delivery_province ? `${order.delivery_province}، ${order.delivery_city}، ` : ''}
                        {order.delivery_address || '—'}
                        {order.delivery_postal_code ? ` (کد پستی: ${order.delivery_postal_code})` : ''}
                      </span>
                    </div>
                    {order.note ? (
                      <div className={s.kvItem} style={{ gridColumn: '1 / -1' }}>
                        <label>یادداشت سفارش</label>
                        <span style={{ color: 'var(--ink-700)' }}>{order.note}</span>
                      </div>
                    ) : null}
                  </div>
                </Card>

                {/* جدول اقلام سفارش */}
                <Card>
                  <SectionTitle extra={<span className={s.sub}>{faNum(order.line_count)} قلم کالا</span>}>
                    اقلام سفارش
                  </SectionTitle>
                  <div style={{ marginTop: 14 }}>
                    <DataTable
                      columns={lineCols}
                      rows={order.lines}
                      rowKey={(ln) => ln.id || `${ln.row_no}`}
                    />
                  </div>
                </Card>

                {/* جدول بخش‌های تسویه */}
                <Card>
                  <SectionTitle
                    extra={
                      <Badge tone={SETTLEMENT_TYPE[order.settlement_type]?.tone || 'neutral'}>
                        {order.settlement_type_display || SETTLEMENT_TYPE[order.settlement_type]?.label}
                      </Badge>
                    }
                  >
                    بخش‌های تسویه و پرداخت
                  </SectionTitle>
                  <div style={{ marginTop: 14 }}>
                    <DataTable
                      columns={partCols}
                      rows={order.settlement_parts}
                      rowKey={(r) => `${r.method}-${r.amount}-${r.due_date ?? ''}-${r.cheque_serial ?? ''}`}
                    />
                  </div>
                </Card>

                {/* بخش مرسولات — طبق اعلام بک‌اند مربوط به فاز ۲ انبار */}
                <Card>
                  <SectionTitle extra={<SoonTag />}>مرسوله‌ها و خروج از انبار</SectionTitle>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 8 }}>
                    تفکیک بسته‌ها و صدور خودکار حواله خروج انبار با تکمیل فاز ۲ WMS فعال می‌شود.
                  </p>
                </Card>

                {/* سوابق تصمیم‌ها و لغو */}
                {order.cancellations?.length ? (
                  <Card>
                    <SectionTitle>درخواست‌های لغو سفارش</SectionTitle>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                      {order.cancellations.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            padding: 12,
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--line-soft)',
                            background: 'var(--surface-2)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              علت: {CANCEL_REASON[c.reason] || c.reason_display}
                              {c.note ? ` (${c.note})` : ''}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 4 }}>
                              ثبت توسط: {c.requested_by?.name || '—'} در {faDateTime(c.requested_at)}
                            </div>
                            {c.decision_note ? (
                              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
                                نظر بررسی‌کننده: {c.decision_note} ({c.decided_by?.name || '—'})
                              </div>
                            ) : null}
                          </div>
                          <Badge tone={CANCEL_STATUS[c.status]?.tone || 'neutral'}>
                            {c.status_display || CANCEL_STATUS[c.status]?.label}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}
              </div>

              {/* ستون کناری: مبالغ و اقدامات */}
              <div className={s.detailSide}>
                {/* کارت مبالغ */}
                <div className={s.totalsCard}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-900)', marginBottom: 6 }}>
                    خلاصه مالی سفارش
                  </div>
                  <div className={s.totalRow}>
                    <span>جمع ناخالص</span>
                    <span>{groupMoney(order.subtotal)} ریال</span>
                  </div>
                  <div className={s.totalRow}>
                    <span>تخفیف</span>
                    <span style={{ color: 'var(--brand)' }}>−{groupMoney(order.total_discount)} ریال</span>
                  </div>
                  {Number(order.cash_discount_amount) > 0 ? (
                    <div className={s.totalRow}>
                      <span>تخفیف خرید نقدی</span>
                      <span style={{ color: 'var(--success)' }}>−{groupMoney(order.cash_discount_amount)} ریال</span>
                    </div>
                  ) : null}
                  <div className={s.totalRow}>
                    <span>مالیات ارزش افزوده</span>
                    <span>{groupMoney(order.tax_amount)} ریال</span>
                  </div>
                  <div className={`${s.totalRow} ${s.totalGrand}`}>
                    <span>مبلغ کل قابل پرداخت</span>
                    <span>{groupMoney(order.total_amount)} ریال</span>
                  </div>
                  {Number(order.prepaid_amount) > 0 ? (
                    <div className={s.totalRow}>
                      <span>بیعانه پرداختی</span>
                      <span style={{ color: 'var(--success)' }}>{groupMoney(order.prepaid_amount)} ریال</span>
                    </div>
                  ) : null}
                  {Number(order.remaining_amount) > 0 ? (
                    <div className={s.totalRow} style={{ color: 'var(--info)' }}>
                      <span>مانده تسویه‌نشده</span>
                      <span>{groupMoney(order.remaining_amount)} ریال</span>
                    </div>
                  ) : null}
                </div>

                {/* کارت فاکتور فروش (اگر صادر شده باشد) */}
                {order.invoice_number ? (
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <IconFileInvoice size={22} color="var(--brand)" />
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>فاکتور فروش صادر شده</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>
                          {order.invoice_number}
                        </div>
                      </div>
                    </div>
                    {order.invoice ? (
                      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                        <Badge tone="info">{order.invoice.status_display}</Badge>
                        <Badge tone="brand">{order.invoice.settlement_status_display}</Badge>
                      </div>
                    ) : null}
                  </Card>
                ) : null}

                {/* کارت اقدامات اپراتور / حسابدار */}
                <Card>
                  <SectionTitle>عملیات سفارش</SectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                    {/* تأیید یا رد حسابداری */}
                    {order.status === 'PENDING_APPROVAL' && can('orders.orders.accounting.approve') ? (
                      <>
                        <Button
                          variant="primary"
                          onClick={handleApproveAccounting}
                          loading={mutations.approveAccounting.isPending}
                          icon={<IconCheck size={16} />}
                        >
                          تأیید حسابداری و صدور فاکتور
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => setRejectModalOpen(true)}
                          disabled={mutations.rejectAccounting.isPending}
                          icon={<IconX size={16} />}
                        >
                          رد سفارش
                        </Button>
                      </>
                    ) : null}

                    {/* پیشرفت وضعیت دستی به مراحل بعدی */}
                    {order.next_status && can('orders.orders.fulfilment.update') && !order.has_open_cancellation ? (
                      <Button
                        variant="secondary"
                        onClick={handleAdvanceStatus}
                        loading={mutations.changeStatus.isPending}
                        icon={<IconTruck size={16} />}
                      >
                        انتقال به وضعیت «{ORDER_STATUS[order.next_status as OrdersStatus]?.label}»
                      </Button>
                    ) : null}

                    {/* دکمه درخواست لغو سفارش */}
                    {!order.has_open_cancellation &&
                    order.status !== 'DELIVERED' &&
                    order.status !== 'CANCELLED' &&
                    order.status !== 'REJECTED' &&
                    can('orders.orders.cancellation.create') ? (
                      <Button
                        variant="secondary"
                        onClick={() => setCancelModalOpen(true)}
                      >
                        درخواست لغو سفارش
                      </Button>
                    ) : null}

                    {/* تصمیم درباره درخواست لغو باز */}
                    {order.has_open_cancellation && can('orders.orders.cancellation.approve') ? (
                      <Button
                        variant="danger"
                        onClick={() => setCancelDecisionModalOpen(true)}
                        icon={<IconAlertTriangle size={16} />}
                      >
                        بررسی درخواست لغو باز
                      </Button>
                    ) : null}

                    {/* بایگانی یا بازگرداندن */}
                    {(order.status === 'DELIVERED' || order.status === 'REJECTED' || order.status === 'CANCELLED') &&
                    can('orders.orders.update') ? (
                      <Button
                        variant="secondary"
                        onClick={handleToggleArchive}
                        loading={mutations.setArchived.isPending}
                        icon={order.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
                      >
                        {order.archived_at ? 'بازگرداندن از بایگانی' : 'انتقال به بایگانی'}
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* مودال رد سفارش حسابداری */}
      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="رد سفارش توسط حسابداری"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setRejectModalOpen(false)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              onClick={handleRejectAccounting}
              loading={mutations.rejectAccounting.isPending}
            >
              ثبت رد سفارش
            </Button>
          </div>
        }
      >
        <div>
          <p style={{ fontSize: 13, color: 'var(--ink-700)', marginBottom: 12 }}>
            لطفاً دلیل رد سفارش را بنویسید (درج علت الزامی است):
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--line)',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
            placeholder="مثال: عدم تأیید اعتبار مشتری یا سقف باز پرداخت..."
          />
        </div>
      </Modal>

      {/* مودال ثبت درخواست لغو سفارش */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="درخواست لغو سفارش"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setCancelModalOpen(false)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              onClick={handleRequestCancellation}
              loading={mutations.requestCancellation.isPending}
            >
              ارسال درخواست لغو
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              علت لغو
            </label>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value as OrdersCancelReason)}
              style={{
                width: '100%',
                height: 40,
                padding: '0 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                fontFamily: 'inherit',
              }}
            >
              <option value="CUSTOMER_REQUEST">درخواست مشتری</option>
              <option value="WRONG_ITEMS">ثبت اشتباه کالا یا تعداد</option>
              <option value="NEED_CHANGED">تغییر نیاز مشتری</option>
              <option value="REORDER_OTHER_METHOD">ثبت مجدد با روش پرداخت دیگر</option>
              <option value="OTHER">سایر دلایل (توضیح الزامی)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              توضیحات تکمیلی
            </label>
            <textarea
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
              placeholder="توضیحات جهت تصمیم‌گیری مدیر مربوطه..."
            />
          </div>
        </div>
      </Modal>

      {/* مودال بررسی و تصمیم‌گیری درباره لغو سفارش */}
      <Modal
        open={cancelDecisionModalOpen}
        onClose={() => setCancelDecisionModalOpen(false)}
        title="تصمیم‌گیری درباره درخواست لغو سفارش"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setCancelDecisionModalOpen(false)}>
              انصراف
            </Button>
            <Button
              variant={cancelApproveDecision ? 'danger' : 'secondary'}
              onClick={handleDecideCancellation}
              loading={mutations.decideCancellation.isPending}
            >
              ثبت تصمیم نهایی
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              تصمیم
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="dec"
                  checked={cancelApproveDecision}
                  onChange={() => setCancelApproveDecision(true)}
                />
                <span>تأیید لغو سفارش (سفارش لغو می‌شود)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="dec"
                  checked={!cancelApproveDecision}
                  onChange={() => setCancelApproveDecision(false)}
                />
                <span>رد درخواست لغو (سفارش در چرخه می‌ماند)</span>
              </label>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              یادداشت یا دلیل تصمیم {!cancelApproveDecision ? '(الزامی)' : ''}
            </label>
            <textarea
              value={cancelDecisionNote}
              onChange={(e) => setCancelDecisionNote(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
              placeholder="توضیحات تأیید یا علت رد درخواست لغو..."
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
