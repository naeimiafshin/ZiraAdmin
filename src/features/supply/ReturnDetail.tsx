import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconBan, IconCircleCheck, IconEdit, IconPrinter } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Badge, Chip, Empty, ErrorBox, KeyValue, Modal, Rial, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { SoonTag } from '@/features/branches/SoonTag';
import { ConfirmModal } from '@/features/catalog/components';
import { ReasonModal } from '@/features/customers/components';
import { labelOf, RETURN_STATUS, toneOf } from './labels';
import { int, personName } from './requestsApi';
import { ReturnDrawer } from './ReturnDrawer';
import { useReturn, useReturnWrite, type PurchaseReturn } from './returnsApi';
import { SaleUnits } from './SaleUnits';
import s from './supply.module.css';

/**
 * جزئیات برگشت از خرید — مودال (html «برگشت از خرید …»: شماره، تاریخ، شماره فاکتور و «اقلام مرجوعی»).
 * عملیات (بک‌اند services/purchase_return.py): «ویرایش» و «تأیید» فقط پیش‌نویس (مجوز update / approve)؛ تأیید کالا را از انبار خارج
 * می‌کند و باقی‌مانده‌ی فاکتور را دوباره می‌سنجد. «لغو پیش‌نویس» (همان «حذف» html، مجوز delete، دلیل اختیاری) سند را با وضعیت
 * «لغو شده» نگه می‌دارد. چاپ «به‌زودی» (افشین 2026-10-31).
 */
const WIDTH = 1000;
const PRINT_SOON = 'به‌زودی — بعد از آماده شدن قالب چاپ رسمی';

export function ReturnDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useReturn(id);
  return (
    <Modal open={!!id} onClose={onClose} width={WIDTH} title={q.data ? <>برگشت از خرید <span data-latin>{q.data.return_no}</span></> : 'برگشت از خرید'}>
      {q.isLoading ? <SkeletonRows rows={4} height={70} /> : null}
      {q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data ? <Detail r={q.data} /> : null}
    </Modal>
  );
}

type Act = { key: string; label: string; icon: ReactNode; show: boolean; variant?: 'primary' | 'danger'; run: () => void };

function Detail({ r }: { r: PurchaseReturn }) {
  const can = usePerm();
  const w = useReturnWrite();
  const toast = useToast();
  const [modal, setModal] = useState<'edit' | 'approve' | 'cancel' | null>(null);
  const draft = r.status === 'DRAFT';
  const dash = <span className={s.muted}>—</span>;
  const why = draft ? null : `برگشتی در وضعیت «${r.status_display}» است؛ فقط پیش‌نویس تغییر می‌کند.`;
  const acts: Act[] = [
    { key: 'edit', label: 'ویرایش', icon: <IconEdit size={15} />, show: can('supply.purchase_returns.update'), run: () => setModal('edit') },
    { key: 'approve', label: 'تأیید', icon: <IconCircleCheck size={15} />, show: can('supply.purchase_returns.approve'), variant: 'primary', run: () => setModal('approve') },
    { key: 'cancel', label: 'لغو پیش‌نویس', icon: <IconBan size={15} />, show: can('supply.purchase_returns.delete'), variant: 'danger', run: () => setModal('cancel') },
  ];
  const lines = r.lines ?? [];
  return (
    <div className={s.detail}>
      <div className={s.detailHead}>
        <div className={s.badges}><Badge tone={toneOf(RETURN_STATUS, r.status)}>{labelOf(RETURN_STATUS, r.status, r.status_display)}</Badge></div>
        <div className={s.headActs}>
          {acts.filter((x) => x.show).map((x) => (
            <span key={x.key} data-tip={why ?? undefined}>
              <Button size="sm" variant={x.variant ?? 'secondary'} icon={x.icon} disabled={!draft} onClick={x.run}>{x.label}</Button>
            </span>
          ))}
          <span data-tip={PRINT_SOON}><Button size="sm" variant="ghost" icon={<IconPrinter size={15} />} disabled>چاپ</Button></span>
          <SoonTag tip={PRINT_SOON} />
        </div>
      </div>
      <div className={s.kvGrid4}>
        <KeyValue label="تاریخ">{faDate(r.return_date)}</KeyValue>
        <KeyValue label="شماره فاکتور" ltr><Link className={s.linkBtn} to={`/supply/purchase-invoices?query=${r.invoice_no}`} data-latin>{r.invoice_no}</Link></KeyValue>
        <KeyValue label="تأمین‌کننده">{r.supplier ? <>{r.supplier.name} <span className={s.muted} data-latin>{r.supplier.code}</span></> : dash}</KeyValue>
        <KeyValue label="انبار خروج">{r.warehouse ? <>{r.warehouse.name} <span className={s.muted} data-latin>{r.warehouse.code}</span></> : dash}</KeyValue>
        <KeyValue label="صادرکننده">{personName(r.issuer)}</KeyValue>
        <KeyValue label="تأیید">{r.approved_at ? <>{personName(r.approved_by)}<small className={s.sub}>{faDateTime(r.approved_at)}</small></> : dash}</KeyValue>
      </div>
      {r.status === 'CANCELLED' ? <Alert>لغو پیش‌نویس{r.cancel_reason ? `: ${r.cancel_reason}` : ''}</Alert> : null}
      {r.status === 'APPROVED' ? <Alert tone="info">کالاهای این برگشتی از انبار {r.warehouse?.name ?? ''} خارج و به تأمین‌کننده عودت شده است.</Alert> : null}

      <SectionTitle extra={<Chip>{faNum(r.line_count)} قلم</Chip>}>اقلام مرجوعی</SectionTitle>
      {lines.length ? (
        <div className={s.linesWrap}>
          <table className={s.lines}>
            <thead><tr><th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>واحد اصلی</th><th>واحد فروش</th><th>فی واحد مرجوعی</th><th>تعداد</th><th>مبلغ کل</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td className={s.muted}>{faNum(i + 1)}</td>
                  <td className={s.code}>{l.item ? <span data-latin>{l.item.code}</span> : dash}</td>
                  <td className={s.nameCell}><b>{l.item?.display_name ?? '—'}</b></td>
                  <td>{l.item?.unit_name || dash}</td>
                  <td><SaleUnits item={l.item} /></td>
                  <td className="tnum">{faNum(int(l.return_unit_price))}</td>
                  <td className="tnum">{faNum(int(l.quantity))}</td>
                  <td className={`tnum ${s.strong}`}>{faNum(int(l.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="این برگشتی ردیفی ندارد" />}
      <div className={s.linesTotal}>مبلغ کل برگشتی: <b className="tnum">{faNum(int(r.total_amount))}</b> <Rial /></div>
      <div>
        <SectionTitle>توضیحات</SectionTitle>
        <p className={s.pre}>{r.notes || <span className={s.muted}>توضیحی ثبت نشده است.</span>}</p>
      </div>

      {modal === 'edit' ? <ReturnDrawer ret={r} onClose={() => setModal(null)} /> : null}
      {modal === 'approve' ? (
        <ConfirmModal title={`تأیید برگشتی ${r.return_no}`} confirmLabel="تأیید و خروج از انبار" onClose={() => setModal(null)}
          text={<>با تأیید، {faNum(r.line_count)} قلم از انبار <b>{r.warehouse?.name ?? ''}</b> خارج و به تأمین‌کننده عودت می‌شود و برگشتی دیگر ویرایش نمی‌شود. اگر موجودی انبار کافی نباشد یا باقی‌مانده‌ی فاکتور کمتر شده باشد، تأیید رد می‌شود.</>}
          onConfirm={async () => { await w.approve.mutateAsync(r.id); toast(`برگشتی ${r.return_no} تأیید شد و کالا از انبار خارج شد.`); }} />
      ) : null}
      <ReasonModal open={modal === 'cancel'} onClose={() => setModal(null)} title={`لغو پیش‌نویس ${r.return_no}`} confirmText="لغو پیش‌نویس" danger label="دلیل (اختیاری)" minLength={0}
        busy={w.cancel.isPending} intro="پیش‌نویس لغو می‌شود و سند با وضعیت «لغو شده» در فهرست می‌ماند."
        onConfirm={async (reason) => { await w.cancel.mutateAsync({ rid: r.id, reason }); toast(`پیش‌نویس ${r.return_no} لغو شد.`); setModal(null); }} />
    </div>
  );
}
