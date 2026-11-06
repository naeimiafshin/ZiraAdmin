import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconArrowBackUp, IconEdit, IconFileInvoice } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { groupMoney, moneyDigits } from '@/shared/lib/money';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Textarea } from '@/shared/ui/form';
import { Badge, Chip, ErrorBox, KeyValue, Modal, Rial, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal } from '@/features/catalog/components';
import { ConsignmentDrawer } from './ConsignmentDrawer';
import { useConsignment, useConsignmentWrite, type Consignment, type ConsignmentConvertIn } from './consignmentsApi';
import { CONSIGNMENT_STATUS, labelOf, toneOf } from './labels';
import { int } from './requestsApi';
import { SaleUnits } from './SaleUnits';
import s from './supply.module.css';

/**
 * جزئیات خرید امانی — مودال. عملیات (بک‌اند services/consignment.py)، همه فقط برای «امانی در انبار» و با مجوز update:
 * - «ویرایش».
 * - «عودت»: فقط وضعیت را «عودت‌شده» می‌کند؛ کالای امانی هیچ‌وقت وارد موجودی نشده بود (افشین 2026-10-28، بک‌اند).
 * - «تبدیل به فاکتور» (نام html): یک اعلامیه‌ی رسید انبار با اقلام امانی و فی‌های داده‌شده می‌سازد؛ کالا از مسیر عادی انبار وارد
 *   موجودی می‌شود و فاکتور از همان اعلامیه صادر می‌شود. فی هر کالا لازم است.
 * سند تبدیل‌شده شماره‌ی اعلامیه و (بعداً) فاکتور را با پیوند نشان می‌دهد.
 */
const WIDTH = 980;
const CONVERT_WIDTH = 900;
const NOTES_MAX = 2000;
const todayTehran = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
/**
 * هر نویسه‌ی غیررقمی (بعد از لاتین شدن ارقام). matches: "a", "-", "٬" — rejects: "7".
 * tester: https://regex101.com/?regex=%5B%5E0-9%5D&testString=12a3
 */
const NON_DIGIT = /[^0-9]/g;
const digits = (v: string) => toLatinDigits(v).replace(NON_DIGIT, '');
const n = (v: string) => Number(v || 0);

/** سند امانی که موعد عودتش گذشته و هنوز در انبار است */
export const isOverdue = (c: Consignment) => c.status === 'IN_WAREHOUSE' && c.return_due_date < todayTehran();

export function ConsignmentDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useConsignment(id);
  return (
    <Modal open={!!id} onClose={onClose} width={WIDTH} title={q.data ? <>خرید امانی <span data-latin>{q.data.number}</span></> : 'خرید امانی'}>
      {q.isLoading ? <SkeletonRows rows={4} height={70} /> : null}
      {q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data ? <Detail c={q.data} /> : null}
    </Modal>
  );
}

type Act = { key: string; label: string; icon: ReactNode; variant?: 'primary' | 'danger'; run: () => void };

function Detail({ c }: { c: Consignment }) {
  const can = usePerm();
  const w = useConsignmentWrite();
  const toast = useToast();
  const [modal, setModal] = useState<'edit' | 'return' | 'convert' | null>(null);
  const live = c.status === 'IN_WAREHOUSE';
  const dash = <span className={s.muted}>—</span>;
  const why = live ? null : `سند در وضعیت «${c.status_display}» است؛ فقط «امانی در انبار» تغییر می‌کند.`;
  const acts: Act[] = [
    { key: 'edit', label: 'ویرایش', icon: <IconEdit size={15} />, run: () => setModal('edit') },
    { key: 'convert', label: 'تبدیل به فاکتور', icon: <IconFileInvoice size={15} />, variant: 'primary', run: () => setModal('convert') },
    { key: 'return', label: 'عودت', icon: <IconArrowBackUp size={15} />, variant: 'danger', run: () => setModal('return') },
  ];
  const lines = c.lines ?? [];
  return (
    <div className={s.detail}>
      <div className={s.detailHead}>
        <div className={s.badges}>
          <Badge tone={toneOf(CONSIGNMENT_STATUS, c.status)}>{labelOf(CONSIGNMENT_STATUS, c.status, c.status_display)}</Badge>
          {isOverdue(c) ? <Badge tone="danger">موعد عودت گذشته</Badge> : null}
        </div>
        {can('supply.consignments.update') ? (
          <div className={s.headActs}>
            {acts.map((x) => (
              <span key={x.key} data-tip={why ?? undefined}>
                <Button size="sm" variant={x.variant ?? 'secondary'} icon={x.icon} disabled={!live} onClick={x.run}>{x.label}</Button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={s.kvGrid4}>
        <KeyValue label="تاریخ">{faDate(c.date)}</KeyValue>
        <KeyValue label="تاریخ عودت">{faDate(c.return_due_date)}</KeyValue>
        <KeyValue label="تأمین‌کننده">{c.supplier ? <>{c.supplier.name} <span className={s.muted} data-latin>{c.supplier.code}</span></> : dash}</KeyValue>
        <KeyValue label="انبار">{c.warehouse ? <>{c.warehouse.name} <span className={s.muted} data-latin>{c.warehouse.code}</span></> : dash}</KeyValue>
        <KeyValue label="جمع تعداد">{faNum(int(c.quantity))}</KeyValue>
        <KeyValue label="اعلامیه‌ی تبدیل">{c.converted_advice_no ? <Link className={s.linkBtn} to={`/supply/receipt-advices?open=${c.converted_advice_id}`} data-latin>{c.converted_advice_no}</Link> : dash}</KeyValue>
        <KeyValue label="فاکتور">{c.converted_invoice_no ? <Link className={s.linkBtn} to={`/supply/purchase-invoices?query=${c.converted_invoice_no}`} data-latin>{c.converted_invoice_no}</Link> : dash}</KeyValue>
        <KeyValue label="تاریخ عودت واقعی">{c.returned_at ? faDateTime(c.returned_at) : dash}</KeyValue>
      </div>
      {c.status === 'CONVERTED' ? <Alert tone="info">این سند به اعلامیه‌ی رسید انبار تبدیل شده است؛ کالا با رسید انبار وارد موجودی می‌شود و فاکتور از همان اعلامیه صادر می‌شود.</Alert> : null}
      <SectionTitle extra={<Chip>{faNum(c.line_count)} قلم</Chip>}>اقلام امانی</SectionTitle>
      <div className={s.linesWrap}>
        <table className={s.lines}>
          <thead><tr><th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>واحد اصلی</th><th>واحد فروش</th><th>تعداد</th><th>فی واحد</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td className={s.muted}>{faNum(i + 1)}</td>
                <td className={s.code}>{l.item ? <span data-latin>{l.item.code}</span> : dash}</td>
                <td className={s.nameCell}><b>{l.item?.display_name ?? '—'}</b></td>
                <td>{l.item?.unit_name || dash}</td>
                <td><SaleUnits item={l.item} /></td>
                <td className="tnum">{faNum(int(l.quantity))}</td>
                <td className="tnum">{l.unit_price == null ? <span className={s.muted}>تعیین نشده</span> : faNum(int(l.unit_price))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <SectionTitle>توضیحات</SectionTitle>
        <p className={s.pre}>{c.notes || <span className={s.muted}>توضیحی ثبت نشده است.</span>}</p>
      </div>

      {modal === 'edit' ? <ConsignmentDrawer consignment={c} onClose={() => setModal(null)} /> : null}
      {modal === 'return' ? (
        <ConfirmModal title={`عودت خرید امانی ${c.number}`} confirmLabel="ثبت عودت" danger onClose={() => setModal(null)}
          text={<>کالاهای این سند به تأمین‌کننده برگشت داده شده‌اند و سند «عودت‌شده» می‌شود. چون کالای امانی هیچ‌وقت وارد موجودی نشده بود، موجودی انبار تغییر نمی‌کند. این کار برگشت‌پذیر نیست.</>}
          onConfirm={async () => { await w.markReturned.mutateAsync(c.id); toast(`عودت خرید امانی ${c.number} ثبت شد.`); }} />
      ) : null}
      {modal === 'convert' ? <ConvertModal c={c} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

type Row = { item_id: string; code: string; name: string; max: number; qty: string; price: string; disc: string; tax: string };

/** «تبدیل به فاکتور» ⇐ اعلامیه‌ی رسید انبار (PUT /consignments/{id}/convert): تعداد (≤ امانی)، فی (الزامی)، تخفیف و مالیات هر کالا */
function ConvertModal({ c, onClose }: { c: Consignment; onClose: () => void }) {
  const w = useConsignmentWrite();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>(() => (c.lines ?? []).flatMap((l) => (l.item ? [{
    item_id: l.item.id, code: l.item.code, name: l.item.display_name, max: int(l.quantity), qty: String(int(l.quantity)),
    price: l.unit_price == null ? '' : String(int(l.unit_price)), disc: '0', tax: '0',
  }] : [])));
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const set = (id: string, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.item_id === id ? { ...r, ...patch } : r))); setErr(null); };
  const total = rows.reduce((a, r) => a + n(r.qty) * (n(r.price) - n(r.disc) + n(r.tax)), 0);
  const go = async () => {
    const bad = rows.find((r) => r.price === '' || n(r.qty) < 1 || n(r.qty) > r.max || n(r.disc) > n(r.price));
    if (bad) {
      const problems: [boolean, string][] = [[bad.price === '', 'فی واحد را وارد کنید'], [n(bad.qty) < 1, 'تعداد باید دست‌کم ۱ باشد'],
        [n(bad.qty) > bad.max, `تعداد بیشتر از امانی (${toFaDigits(bad.max)}) است`], [true, 'تخفیف واحد از فی بیشتر است']];
      setErr(`ردیف «${bad.name}»: ${problems.find(([hit]) => hit)?.[1] ?? ''}.`); return;
    }
    const body: ConsignmentConvertIn = { notes: notes.trim(), lines: rows.map((r) => ({ item_id: r.item_id, quantity: n(r.qty), unit_price: n(r.price), unit_discount: n(r.disc), unit_tax_duty: n(r.tax) })) };
    try {
      const advice = await w.convert.mutateAsync({ cid: c.id, body });
      toast(`خرید امانی ${c.number} به اعلامیه‌ی ${advice.advice_no} تبدیل شد؛ رسید انبار ${advice.receipt?.receipt_no ?? ''} ساخته شد.`);
      onClose();
      navigate(`/supply/receipt-advices?open=${advice.id}`);
    } catch (e) { setErr(userMessage(e)); }
  };
  const cell = (r: Row, k: 'qty' | 'price' | 'disc' | 'tax', label: string, money = false) => {
    const show = money ? groupMoney : toFaDigits;
    const clean = money ? moneyDigits : digits;
    return <input className={`${s.cellInput} ${money ? s.cellMoney : ''}`} inputMode="numeric" aria-label={`${label} ${r.name}`} value={show(r[k])} onChange={(e) => set(r.item_id, { [k]: clean(e.target.value) })} />;
  };
  return (
    <Modal open onClose={onClose} width={CONVERT_WIDTH} title={`تبدیل به فاکتور — خرید امانی ${c.number}`}
      footer={<><Button onClick={go} loading={w.convert.isPending}>تبدیل و صدور اعلامیه</Button><Button variant="ghost" onClick={onClose}>انصراف</Button>
        <span className={s.footSum}>مبلغ کل: <b className="tnum">{faNum(total)}</b> <Rial /></span></>}>
      <p className={s.modalIntro}>برای کالاهایی که خریده می‌شوند یک اعلامیه‌ی رسید انبار صادر می‌شود؛ کالا با رسید انبار وارد موجودی می‌شود و فاکتور خرید بعد از تأیید انبار از همان اعلامیه ساخته می‌شود. فی هر کالا لازم است.</p>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={s.linesWrap}>
        <table className={s.lines}>
          <thead><tr><th>کد محصول</th><th>نام محصول</th><th>امانی</th><th>تعداد خرید</th><th>فی واحد<small>(ریال)</small></th><th>تخفیف واحد</th><th>مالیات واحد</th><th>مبلغ کل</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item_id}>
                <td className={s.code}><span data-latin>{r.code}</span></td>
                <td className={s.nameCell}><b>{r.name}</b></td>
                <td className="tnum">{faNum(r.max)}</td>
                <td>{cell(r, 'qty', 'تعداد خرید')}</td>
                <td>{cell(r, 'price', 'فی واحد', true)}</td>
                <td>{cell(r, 'disc', 'تخفیف واحد', true)}</td>
                <td>{cell(r, 'tax', 'مالیات واحد', true)}</td>
                <td className={`tnum ${s.strong}`}>{faNum(n(r.qty) * (n(r.price) - n(r.disc) + n(r.tax)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.formNote}><FormGrid cols={1}><Textarea label="توضیحات اعلامیه" rows={2} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={`پیش‌فرض: تبدیل خرید امانی ${c.number}`} /></FormGrid></div>
    </Modal>
  );
}
