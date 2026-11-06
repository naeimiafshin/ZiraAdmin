import { useRef, useState, type ReactNode } from 'react';
import { IconArchive, IconArchiveOff, IconBan, IconCircleCheck, IconDownload, IconEdit, IconFileUpload, IconPrinter } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Badge, Chip, Empty, ErrorBox, KeyValue, Modal, Rial, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { SoonTag } from '@/features/branches/SoonTag';
import { ConfirmModal } from '@/features/catalog/components';
import { ReasonModal } from '@/features/customers/components';
import { InvoiceDrawer } from './InvoiceDrawer';
import { INVOICE_EDITABLE, useInvoice, useInvoiceWrite, type Invoice } from './invoicesApi';
import { DELIVERY_TYPE, INVOICE_STATUS, labelOf, RECEIPT_STATUS, SETTLEMENT_METHOD, toneOf } from './labels';
import { int, openFile, personName, personRoles } from './requestsApi';
import { SaleUnits } from './SaleUnits';
import s from './supply.module.css';

/**
 * جزئیات فاکتور خرید — مودال (html «فاکتور خرید»). قواعد عملیات از بک‌اند (services/invoice.py):
 * - ویرایش و «تأیید و صدور»: فقط پیش‌نویس یا ویرایش‌شده (مجوز update / approve). تأیید ردیف‌ها را قفل و فی خالص را به‌عنوان قیمت خرید ثبت می‌کند.
 * - ابطال (مجوز void.approve، دلیل الزامی): فقط فاکتور صادرشده و بدون برگشت از خرید فعال.
 * - بایگانی و بازگردانی (مجوز update): فقط فاکتور ابطال‌شده.
 * - فایل فاکتور (PDF/JPEG/PNG/WebP تا ۵ مگابایت): بارگذاری با مجوز update تا وقتی ابطال نشده؛ دانلود با توکن.
 * - چاپ: «به‌زودی» تا قالب چاپ رسمی (افشین 2026-10-31؛ کمبود S-09).
 * دکمه‌ای که شرطش برقرار نیست خاموش است و راهنمای شناور دلیل را می‌گوید.
 */
const WIDTH = 1120;
const MB = 1_048_576;
const MAX_FILE_MB = 5;
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const PRINT_SOON = 'به‌زودی — بعد از آماده شدن قالب چاپ رسمی فاکتور';

export function InvoiceDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useInvoice(id);
  return (
    <Modal open={!!id} onClose={onClose} width={WIDTH} title={q.data ? <>فاکتور خرید <span data-latin>{q.data.invoice_no}</span></> : 'فاکتور خرید'}>
      {q.isLoading ? <SkeletonRows rows={5} height={70} /> : null}
      {q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data ? <Detail inv={q.data} /> : null}
    </Modal>
  );
}

type Act = { key: string; label: string; icon: ReactNode; show: boolean; why: string | null; variant?: 'primary' | 'danger'; run: () => void };

function Detail({ inv }: { inv: Invoice }) {
  const can = usePerm();
  const w = useInvoiceWrite();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<'edit' | 'approve' | 'void' | 'archive' | 'restore' | null>(null);
  const editable = INVOICE_EDITABLE.includes(inv.status);
  const dash = <span className={s.muted}>—</span>;
  const lockedWhy = editable ? null : `فاکتور در وضعیت «${inv.status_display}» است؛ فقط پیش‌نویس یا ویرایش‌شده تغییر می‌کند.`;
  const acts: Act[] = [
    { key: 'edit', label: 'ویرایش', icon: <IconEdit size={15} />, show: can('supply.purchase_invoices.update'), why: lockedWhy, run: () => setModal('edit') },
    { key: 'approve', label: 'تأیید و صدور', icon: <IconCircleCheck size={15} />, show: can('supply.purchase_invoices.approve'), why: lockedWhy, variant: 'primary', run: () => setModal('approve') },
    { key: 'archive', label: 'بایگانی', icon: <IconArchive size={15} />, show: can('supply.purchase_invoices.update') && inv.status === 'VOIDED', why: null, run: () => setModal('archive') },
    { key: 'restore', label: 'بازگردانی از بایگانی', icon: <IconArchiveOff size={15} />, show: can('supply.purchase_invoices.update') && inv.status === 'VOIDED_ARCHIVED', why: null, run: () => setModal('restore') },
    { key: 'void', label: 'ابطال', icon: <IconBan size={15} />, show: can('supply.purchase_invoices.void.approve') && !['VOIDED', 'VOIDED_ARCHIVED'].includes(inv.status),
      why: inv.status === 'APPROVED_ISSUED' ? null : 'فقط فاکتور «تأیید و صادرشده» ابطال می‌شود.', variant: 'danger', run: () => setModal('void') },
  ];

  const upload = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    if (!FILE_TYPES.includes(f.type) || f.size > MAX_FILE_MB * MB) { toast('فقط PDF، JPEG، PNG یا WebP تا ۵ مگابایت پذیرفته می‌شود.', 'error'); return; }
    try { await w.upload.mutateAsync({ iid: inv.id, file: f }); toast('فایل فاکتور بارگذاری شد.'); } catch (e) { toast(userMessage(e), 'error'); }
  };
  const download = async () => {
    try { await openFile(`/supply/invoices/${inv.id}/file`); } catch (e) { toast(userMessage(e), 'error'); }
  };
  const voided = inv.status === 'VOIDED' || inv.status === 'VOIDED_ARCHIVED';
  const ref = [
    inv.advice_no ? <span key="a">اعلامیه <span data-latin>{inv.advice_no}</span></span> : null,
    inv.consignment_no ? <span key="c">امانی <span data-latin>{inv.consignment_no}</span></span> : null,
  ].filter(Boolean);

  return (
    <div className={s.detail}>
      <div className={s.detailHead}>
        <div className={s.badges}>
          <Badge tone={toneOf(INVOICE_STATUS, inv.status)}>{labelOf(INVOICE_STATUS, inv.status, inv.status_display)}</Badge>
        </div>
        <div className={s.headActs}>
          {acts.filter((x) => x.show).map((x) => (
            <span key={x.key} data-tip={x.why ?? undefined}>
              <Button size="sm" variant={x.variant ?? 'secondary'} icon={x.icon} disabled={!!x.why} onClick={x.run}>{x.label}</Button>
            </span>
          ))}
          <span data-tip={PRINT_SOON}><Button size="sm" variant="ghost" icon={<IconPrinter size={15} />} disabled>چاپ</Button></span>
          <SoonTag tip={PRINT_SOON} />
        </div>
      </div>

      <div className={s.kvGrid4}>
        <KeyValue label="تاریخ فاکتور">{faDate(inv.invoice_date)}</KeyValue>
        <KeyValue label="شماره فاکتور تأمین‌کننده" ltr>{inv.supplier_invoice_no ? <span data-latin>{inv.supplier_invoice_no}</span> : dash}</KeyValue>
        <KeyValue label="تأمین‌کننده">{inv.supplier ? <>{inv.supplier.name} <span className={s.muted} data-latin>{inv.supplier.code}</span></> : dash}</KeyValue>
        <KeyValue label="سند مرجع">{ref.length ? ref : 'ثبت مستقیم'}</KeyValue>
        <KeyValue label="سفارش‌دهنده">{inv.requester ? <>{personName(inv.requester)}{personRoles(inv.requester) ? <small className={s.sub}>{personRoles(inv.requester)}</small> : null}</> : dash}</KeyValue>
        <KeyValue label="رسید انبار">{inv.receipt ? <><span data-latin>{inv.receipt.receipt_no}</span> <Badge tone={toneOf(RECEIPT_STATUS, inv.receipt.status)}>{labelOf(RECEIPT_STATUS, inv.receipt.status, inv.receipt.status_display)}</Badge></> : dash}</KeyValue>
        <KeyValue label="نوع تحویل">{inv.delivery_type_display || DELIVERY_TYPE[inv.delivery_type] || inv.delivery_type}</KeyValue>
        <KeyValue label="نحوه تسویه">{inv.settlement_method_display || SETTLEMENT_METHOD[inv.settlement_method] || inv.settlement_method}</KeyValue>
        <KeyValue label="صادرکننده">{personName(inv.issuer)}</KeyValue>
        <KeyValue label="تأیید و صدور">{inv.approved_at ? <>{personName(inv.approved_by)}<small className={s.sub}>{faDateTime(inv.approved_at)}</small></> : dash}</KeyValue>
        <KeyValue label="فایل فاکتور">
          <span className={s.fileCell}>
            {inv.has_file ? <Button size="sm" variant="ghost" icon={<IconDownload size={15} />} onClick={download}>دانلود</Button> : <span className={s.muted}>بارگذاری نشده</span>}
            {can('supply.purchase_invoices.update') && !voided ? (
              <>
                <Button size="sm" variant="ghost" icon={<IconFileUpload size={15} />} loading={w.upload.isPending} onClick={() => fileRef.current?.click()}>{inv.has_file ? 'جایگزینی' : 'بارگذاری'}</Button>
                <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="فایل فاکتور" onChange={(e) => void upload(e.target.files?.[0])} />
              </>
            ) : null}
          </span>
        </KeyValue>
      </div>
      {voided ? <Alert>ابطال ({personName(inv.voided_by)}، {faDateTime(inv.voided_at)}): {inv.void_reason}</Alert> : null}

      <SectionTitle extra={<Chip>{faNum(inv.line_count)} قلم</Chip>}>اقلام فاکتور</SectionTitle>
      <Lines inv={inv} />
      <div className={s.invTotals}>
        <span>جمع مبلغ: <b className="tnum">{faNum(int(inv.subtotal))}</b></span>
        <span>جمع تخفیف: <b className="tnum">{faNum(int(inv.total_discount))}</b></span>
        <span>جمع مالیات و عوارض: <b className="tnum">{faNum(int(inv.total_tax_duty))}</b></span>
        <span className={s.invGrand}>مبلغ کل فاکتور: <b className="tnum">{faNum(int(inv.total_amount))}</b> <Rial /></span>
      </div>
      <div>
        <SectionTitle>توضیحات</SectionTitle>
        <p className={s.pre}>{inv.notes || <span className={s.muted}>توضیحی ثبت نشده است.</span>}</p>
      </div>

      {modal === 'edit' ? <InvoiceDrawer invoice={inv} onClose={() => setModal(null)} /> : null}
      {modal === 'approve' ? (
        <ConfirmModal title={`تأیید و صدور فاکتور ${inv.invoice_no}`} confirmLabel="تأیید و صدور" onClose={() => setModal(null)}
          text={<>پس از تأیید، ردیف‌های فاکتور دیگر تغییر نمی‌کنند و فی خالص (فی − تخفیف) هر کالا به‌عنوان آخرین قیمت خرید ثبت می‌شود. مبلغ کل: <b>{faNum(int(inv.total_amount))}</b> ریال.</>}
          onConfirm={async () => { await w.approve.mutateAsync(inv.id); toast(`فاکتور ${inv.invoice_no} تأیید و صادر شد.`); }} />
      ) : null}
      <ReasonModal open={modal === 'void'} onClose={() => setModal(null)} title={`ابطال فاکتور ${inv.invoice_no}`} confirmText="ابطال فاکتور" danger label="دلیل ابطال" busy={w.void.isPending}
        intro="فاکتور صادرشده باطل می‌شود. اگر برگشت از خرید فعال داشته باشد، ابطال رد می‌شود. این کار برگشت‌پذیر نیست."
        onConfirm={async (reason) => { await w.void.mutateAsync({ iid: inv.id, reason }); toast(`فاکتور ${inv.invoice_no} باطل شد.`); setModal(null); }} />
      {modal === 'archive' || modal === 'restore' ? (
        <ConfirmModal title={modal === 'archive' ? `بایگانی فاکتور ابطالی ${inv.invoice_no}` : `بازگردانی فاکتور ${inv.invoice_no}`}
          confirmLabel={modal === 'archive' ? 'بایگانی' : 'بازگردانی'} onClose={() => setModal(null)}
          text={modal === 'archive' ? 'فاکتور ابطالی به وضعیت «ابطالی بایگانی‌شده» می‌رود.' : 'فاکتور به وضعیت «ابطال‌شده» برمی‌گردد.'}
          onConfirm={async () => {
            const archive = modal === 'archive';
            await w.archive.mutateAsync({ iid: inv.id, archived: archive });
            toast(archive ? `فاکتور ${inv.invoice_no} بایگانی شد.` : `فاکتور ${inv.invoice_no} از بایگانی بازگردانی شد.`);
          }} />
      ) : null}
    </div>
  );
}

function Lines({ inv }: { inv: Invoice }) {
  const lines = inv.lines ?? [];
  const dash = <span className={s.muted}>—</span>;
  if (!lines.length) return <Empty title="این فاکتور ردیفی ندارد" />;
  return (
    <div className={s.linesWrap}>
      <table className={s.lines}>
        <thead><tr>
          <th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>واحد اصلی</th><th>واحد فروش</th><th>انبار</th><th>فی واحد</th><th>تعداد</th><th>مبلغ</th>
          <th>تخفیف واحد</th><th>مالیات واحد</th><th>مبلغ کل</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td className={s.muted}>{faNum(i + 1)}</td>
              <td className={s.code}>{l.item ? <span data-latin>{l.item.code}</span> : dash}</td>
              <td className={s.nameCell}><b>{l.item?.display_name ?? '—'}</b></td>
              <td>{l.item?.unit_name || dash}</td>
                <td><SaleUnits item={l.item} /></td>
              <td>{l.warehouse?.name ?? dash}</td>
              <td className="tnum">{faNum(int(l.unit_price))}</td>
              <td className="tnum">{faNum(int(l.quantity))}</td>
              <td className="tnum">{faNum(int(l.quantity) * int(l.unit_price))}</td>
              <td className="tnum">{faNum(int(l.unit_discount))}</td>
              <td className="tnum">{faNum(int(l.unit_tax_duty))}</td>
              <td className={`tnum ${s.strong}`}>{faNum(int(l.line_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
