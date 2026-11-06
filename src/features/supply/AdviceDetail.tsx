import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconArchive, IconArchiveOff, IconBan, IconEdit, IconFileInvoice } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Chip, Empty, ErrorBox, KeyValue, Modal, Rial, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal } from '@/features/catalog/components';
import { ReasonModal } from '@/features/customers/components';
import { AdviceDrawer } from './AdviceDrawer';
import { useAdvice, useAdviceWrite, type Advice, type InvoiceFromAdviceIn } from './advicesApi';
import { ADVICE_STATUS, DELIVERY_TYPE, labelOf, RECEIPT_STATUS, SETTLEMENT_METHOD, toneOf } from './labels';
import { int, personName } from './requestsApi';
import { SaleUnits } from './SaleUnits';
import s from './supply.module.css';

/**
 * جزئیات اعلامیه‌ی رسید انبار — مودال (html «جزییات اعلامیه»: اقلام با تعداد و شمارش انبار و دکمه‌های عملیات).
 * قواعد عملیات از بک‌اند (services/advice.py و invoice.py):
 * - ویرایش: فقط «در انتظار» و بایگانی‌نشده (مجوز update).
 * - صدور فاکتور: فقط «تأیید انبار» یا «دریافت ناقص»، بایگانی‌نشده و بدون فاکتور فعال (`can_invoice`؛ مجوز ثبت فاکتور خرید).
 *   فاکتور پیش‌نویس با تعداد شمارش انبار ساخته می‌شود؛ «تأیید و صدور» گام جدای خود فاکتور است.
 * - ابطال (مجوز void.approve، دلیل الزامی): نه وقتی باطل شده، نه بعد از ثبت نهایی انبار، نه با فاکتور فعال. رسید انبار لغو و
 *   درخواست تأمین مرجع «بسته» می‌شود.
 * - بایگانی (مجوز update): نه برای «در انتظار»؛ بازگردانی برای بایگانی‌شده. مستقل از وضعیت.
 * - وضعیت اعلامیه را فقط انبار عوض می‌کند (مودال «به‌روزرسانی وضعیت» html حذف شد — SUPPLY_FRONT_PLAN).
 * دکمه‌ای که شرطش برقرار نیست خاموش است و راهنمای شناور دلیل را می‌گوید (RULES).
 */
const WIDTH = 1120;
const INVOICE_WIDTH = 620;
const SUPPLIER_INVOICE_MAX = 50;
const NOTES_MAX = 2000;
type Delivery = NonNullable<InvoiceFromAdviceIn['delivery_type']>;
type Settlement = NonNullable<InvoiceFromAdviceIn['settlement_method']>;
const DELIVERY_KEYS: Delivery[] = ['WAREHOUSE', 'FACTORY_GATE'];
const SETTLEMENT_KEYS: Settlement[] = ['CASH', 'CHEQUE', 'TRANSFER'];
const todayTehran = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());

export function AdviceDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useAdvice(id);
  return (
    <Modal open={!!id} onClose={onClose} width={WIDTH} title={q.data ? <>اعلامیه رسید انبار <span data-latin>{q.data.advice_no}</span></> : 'اعلامیه رسید انبار'}>
      {q.isLoading ? <SkeletonRows rows={5} height={70} /> : null}
      {q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data ? <Detail a={q.data} onDone={onClose} /> : null}
    </Modal>
  );
}

type Act = { key: string; label: string; icon: ReactNode; show: boolean; why: string | null; danger?: boolean; run: () => void };

function Detail({ a, onDone }: { a: Advice; onDone: () => void }) {
  const can = usePerm();
  const w = useAdviceWrite();
  const toast = useToast();
  const [modal, setModal] = useState<'edit' | 'void' | 'archive' | 'restore' | 'invoice' | null>(null);
  const archived = !!a.archived_at;
  const posted = a.status === 'RECEIVED' || a.status === 'PARTIAL';
  const dash = <span className={s.muted}>—</span>;

  const editWhy = [
    [archived, 'اعلامیه‌ی بایگانی‌شده ویرایش نمی‌شود.'],
    [a.status !== 'SENT', `اعلامیه در وضعیت «${a.status_display}» است؛ ویرایش فقط پیش از شروع کار انبار ممکن است.`],
  ] as const;
  const invoiceWhy = [
    [a.has_invoice, `فاکتور ${a.invoice_no ?? ''} برای این اعلامیه صادر شده است.`],
    [archived, 'اعلامیه‌ی بایگانی‌شده فاکتور نمی‌گیرد.'],
    [!posted, 'فاکتور فقط پس از «تأیید انبار» یا «دریافت ناقص» صادر می‌شود.'],
  ] as const;
  const voidWhy = [
    [a.status === 'VOIDED', 'اعلامیه از قبل باطل شده است.'],
    [a.has_invoice, 'اعلامیه فاکتور دارد و باطل نمی‌شود؛ فقط بایگانی کنید.'],
    [posted, 'کالای این اعلامیه در انبار ثبت نهایی شده و اعلامیه باطل نمی‌شود.'],
  ] as const;
  const first = (rules: readonly (readonly [boolean, string])[]) => rules.find(([hit]) => hit)?.[1] ?? null;
  const acts: Act[] = [
    { key: 'edit', label: 'ویرایش', icon: <IconEdit size={15} />, show: can('supply.receipt_advices.update'), why: first(editWhy), run: () => setModal('edit') },
    { key: 'invoice', label: 'صدور فاکتور', icon: <IconFileInvoice size={15} />, show: can('supply.purchase_invoices.create'), why: first(invoiceWhy), run: () => setModal('invoice') },
    { key: 'archive', label: 'بایگانی', icon: <IconArchive size={15} />, show: can('supply.receipt_advices.update') && !archived,
      why: a.status === 'SENT' ? 'اعلامیه‌ی در انتظار انبار بایگانی نمی‌شود؛ اول آن را باطل کنید یا منتظر نتیجه‌ی انبار بمانید.' : null, run: () => setModal('archive') },
    { key: 'restore', label: 'بازگردانی از بایگانی', icon: <IconArchiveOff size={15} />, show: can('supply.receipt_advices.update') && archived, why: null, run: () => setModal('restore') },
    { key: 'void', label: 'ابطال', icon: <IconBan size={15} />, show: can('supply.receipt_advices.void.approve'), why: first(voidWhy), danger: true, run: () => setModal('void') },
  ];

  return (
    <div className={s.detail}>
      <div className={s.detailHead}>
        <div className={s.badges}>
          <Badge tone={toneOf(ADVICE_STATUS, a.status)}>{labelOf(ADVICE_STATUS, a.status, a.status_display)}</Badge>
          {archived ? <Chip>بایگانی‌شده · {faDate(a.archived_at)}</Chip> : null}
        </div>
        <div className={s.headActs}>
          {acts.filter((x) => x.show).map((x) => (
            <span key={x.key} data-tip={x.why ?? undefined}>
              <Button size="sm" variant={x.danger ? 'danger' : 'secondary'} icon={x.icon} disabled={!!x.why} onClick={x.run}>{x.label}</Button>
            </span>
          ))}
        </div>
      </div>

      <div className={s.kvGrid4}>
        <KeyValue label="تاریخ ثبت">{faDate(a.created_at)}</KeyValue>
        <KeyValue label="تاریخ ارسال به انبار">{a.sent_to_warehouse_at ? faDate(a.sent_to_warehouse_at) : dash}</KeyValue>
        <KeyValue label="صادرکننده">{personName(a.issuer)}</KeyValue>
        <KeyValue label="سند مرجع">{a.request_no ? <>درخواست تأمین <span data-latin>{a.request_no}</span></> : null}{a.consignment_no ? <>امانی <span data-latin>{a.consignment_no}</span></> : null}{!a.request_no && !a.consignment_no ? 'صدور مستقیم' : null}</KeyValue>
        <KeyValue label="تأمین‌کننده">{a.supplier ? <>{a.supplier.name} <span className={s.muted} data-latin>{a.supplier.code}</span></> : dash}</KeyValue>
        <KeyValue label="انبار مقصد">{a.destination_warehouse ? <>{a.destination_warehouse.name} <span className={s.muted} data-latin>{a.destination_warehouse.code}</span>{a.destination_warehouse.keeper_name ? <small className={s.sub}>مسئول: {a.destination_warehouse.keeper_name}</small> : null}</> : dash}</KeyValue>
        <KeyValue label="رسید انبار">{a.receipt ? <><span data-latin>{a.receipt.receipt_no}</span> <Badge tone={toneOf(RECEIPT_STATUS, a.receipt.status)}>{labelOf(RECEIPT_STATUS, a.receipt.status, a.receipt.status_display)}</Badge></> : dash}</KeyValue>
        <KeyValue label="فاکتور خرید">{a.invoice_no ? <Link className={s.linkBtn} to={`/supply/purchase-invoices?query=${a.invoice_no}`} data-latin>{a.invoice_no}</Link> : dash}</KeyValue>
        {a.received_at ? <KeyValue label="تاریخ نتیجه‌ی انبار">{faDateTime(a.received_at)}</KeyValue> : null}
      </div>
      {a.status === 'VOIDED' ? <Alert>دلیل ابطال ({faDateTime(a.voided_at)}): {a.void_reason}</Alert> : null}
      {a.status === 'PARTIAL' ? <Alert tone="info">انبار کمتر از تعداد اعلامیه دریافت کرده است؛ فاکتور با تعداد شمارش انبار صادر می‌شود.</Alert> : null}

      <SectionTitle extra={<Chip>{faNum(a.line_count)} قلم</Chip>}>اقلام اعلامیه</SectionTitle>
      <Lines a={a} />
      <div className={s.linesTotal}>مبلغ کل اعلامیه: <b className="tnum">{faNum(int(a.total))}</b> <Rial /></div>

      <div>
        <SectionTitle>توضیحات</SectionTitle>
        <p className={s.pre}>{a.notes || <span className={s.muted}>توضیحی ثبت نشده است.</span>}</p>
      </div>

      {modal === 'edit' ? <AdviceDrawer advice={a} onClose={() => setModal(null)} /> : null}
      {modal === 'invoice' ? <InvoiceFromAdviceModal a={a} onClose={() => setModal(null)} /> : null}
      <ReasonModal open={modal === 'void'} onClose={() => setModal(null)} title={`ابطال اعلامیه ${a.advice_no}`} confirmText="ابطال اعلامیه" danger label="دلیل ابطال" busy={w.void.isPending}
        intro={`رسید انبار این اعلامیه لغو می‌شود${a.request_no ? ` و درخواست تأمین ${a.request_no} بدون تحویل بسته می‌شود` : ''}. این کار برگشت‌پذیر نیست.`}
        onConfirm={async (reason) => { await w.void.mutateAsync({ aid: a.id, reason }); toast(`اعلامیه‌ی ${a.advice_no} باطل شد.`); setModal(null); }} />
      {modal === 'archive' || modal === 'restore' ? (
        <ConfirmModal title={modal === 'archive' ? `بایگانی اعلامیه ${a.advice_no}` : `بازگردانی اعلامیه ${a.advice_no}`}
          confirmLabel={modal === 'archive' ? 'بایگانی' : 'بازگردانی'} onClose={() => setModal(null)}
          text={modal === 'archive' ? 'اعلامیه به تب «بایگانی‌شده» می‌رود و دیگر ویرایش نمی‌شود یا فاکتور نمی‌گیرد تا بازگردانی شود.' : 'اعلامیه به فهرست اصلی برمی‌گردد.'}
          onConfirm={async () => {
            const archive = modal === 'archive';
            await w.archive.mutateAsync({ aid: a.id, archived: archive });
            toast(archive ? `اعلامیه‌ی ${a.advice_no} بایگانی شد.` : `اعلامیه‌ی ${a.advice_no} از بایگانی بازگردانی شد.`);
            if (archive) onDone();
          }} />
      ) : null}
    </div>
  );
}

/** اقلام با تعداد اعلامیه، شمارش انبار و کسری (html: «# محصول تعداد شمارش انبار») */
function Lines({ a }: { a: Advice }) {
  const lines = a.lines ?? [];
  const dash = <span className={s.muted}>—</span>;
  if (!lines.length) return <Empty title="این اعلامیه قلمی ندارد" />;
  return (
    <div className={s.linesWrap}>
      <table className={s.lines}>
        <thead><tr>
          <th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>واحد اصلی</th><th>واحد فروش</th><th>فی واحد</th><th>تعداد</th><th>شمارش انبار</th><th>کسری</th>
          <th>تخفیف واحد</th><th>مالیات واحد</th><th>مبلغ کل</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const short = l.shortage == null ? 0 : int(l.shortage);
            return (
              <tr key={l.id}>
                <td className={s.muted}>{faNum(i + 1)}</td>
                <td className={s.code}>{l.item ? <span data-latin>{l.item.code}</span> : dash}</td>
                <td className={s.nameCell}><b>{l.item?.display_name ?? '—'}</b></td>
                <td>{l.item?.unit_name || dash}</td>
                <td><SaleUnits item={l.item} /></td>
                <td className="tnum">{l.unit_price == null ? dash : faNum(int(l.unit_price))}</td>
                <td className="tnum">{faNum(int(l.quantity))}</td>
                <td className="tnum">{l.counted_quantity == null ? <span className={s.muted}>هنوز شمارش نشده</span> : faNum(int(l.counted_quantity))}</td>
                <td className={`tnum ${short ? s.bad : ''}`}>{l.shortage == null ? dash : faNum(short)}</td>
                <td className="tnum">{faNum(int(l.unit_discount))}</td>
                <td className="tnum">{faNum(int(l.unit_tax_duty))}</td>
                <td className={`tnum ${s.strong}`}>{l.line_total == null ? dash : faNum(int(l.line_total))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** «صدور فاکتور» از اعلامیه (POST /advices/{id}/invoice) ⇐ فاکتور پیش‌نویس؛ همه‌ی فیلدها اختیاری با پیش‌فرض بک‌اند */
export function InvoiceFromAdviceModal({ a, onClose }: { a: Advice; onClose: () => void }) {
  const w = useAdviceWrite();
  const toast = useToast();
  const [date, setDate] = useState(gregorianToJalaliText(todayTehran()));
  const [supNo, setSupNo] = useState('');
  const [delivery, setDelivery] = useState<Delivery>('WAREHOUSE');
  const [settle, setSettle] = useState<Settlement>('CASH');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    const g = jalaliTextToGregorian(date);
    if (!g) { setErr('تاریخ فاکتور را درست وارد کنید.'); return; }
    setErr(null);
    try {
      const inv = await w.invoice.mutateAsync({ aid: a.id, body: { invoice_date: g, supplier_invoice_no: supNo.trim(), delivery_type: delivery, settlement_method: settle, notes: notes.trim() } });
      toast(`فاکتور خرید ${inv.invoice_no} (پیش‌نویس) از اعلامیه‌ی ${a.advice_no} ساخته شد.`);
      onClose();
    } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} width={INVOICE_WIDTH} title={`صدور فاکتور خرید — اعلامیه ${a.advice_no}`}
      footer={<><Button onClick={go} loading={w.invoice.isPending}>ساخت فاکتور پیش‌نویس</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <p className={s.modalIntro}>ردیف‌های فاکتور از اقلام اعلامیه با تعداد شمارش انبار ساخته می‌شوند (ردیف بدون دریافت حذف می‌شود). فاکتور پیش‌نویس است و «تأیید و صدور» آن در صفحه‌ی فاکتور خرید انجام می‌شود.</p>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <JalaliDateInput label="تاریخ فاکتور" required value={date} onChange={(e) => { setDate(e.target.value); setErr(null); }} dir="ltr" maxYear={1500} />
        <Input label="شماره فاکتور تأمین‌کننده" latin maxLength={SUPPLIER_INVOICE_MAX} value={supNo} onChange={(e) => setSupNo(e.target.value)} hint="اختیاری" />
        <Select label="نوع تحویل" value={delivery} onChange={(e) => setDelivery(DELIVERY_KEYS.find((k) => k === e.target.value) ?? 'WAREHOUSE')} options={DELIVERY_KEYS.map((value) => ({ value, label: DELIVERY_TYPE[value] ?? value }))} />
        <Select label="نحوه تسویه" value={settle} onChange={(e) => setSettle(SETTLEMENT_KEYS.find((k) => k === e.target.value) ?? 'CASH')} options={SETTLEMENT_KEYS.map((value) => ({ value, label: SETTLEMENT_METHOD[value] ?? value }))} />
        <Textarea label="توضیحات" span={2} rows={2} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormGrid>
    </Modal>
  );
}
