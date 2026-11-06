import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { IconAlertTriangle, IconArchive, IconArchiveOff, IconCash, IconCheck, IconFileDiff, IconFileInvoice, IconPencil, IconPrinter, IconUser, IconX } from '@tabler/icons-react';
import { ApiError, userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { numberToWordsFa } from '@/shared/lib/numberWords';
import { ErrorBox, SkeletonRows, useEscapeLayer } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { SoonTag } from '@/features/branches/SoonTag';
import { useCommercePolicy, useCompany } from '@/features/settings/api';
import { money, personName, qty, useItemTraits } from '../api/common';
import { fetchInvoicePrint, useInvoice, useInvoiceWrite, type Invoice } from '../api/invoices';
import { ConfirmModal, ReasonModal } from '../components';
import h from '../h.module.css';
import { labelOf, RETURN_STATUS, SETTLEMENT_ROW_STATUS, SOURCE_TYPE, toneOf } from '../labels';
import { SheetLines } from '../lines';
import { printInvoice, returnSentence } from '../print';
import { Pill, type PillTone } from '../ui';
import { invoicePill } from './InvoiceListPage';
import { SettlementModal } from './SettlementModal';

/**
 * برگه‌ی فاکتور فروش (html «INVOICE SHEET MODAL»): پوشش تیره‌ی تمام‌صفحه، نوار دکمه‌ها روی پوشش، و برگه‌ی سفید صورتحساب
 * (سربرگ، مهر وضعیت، مشخصات فروشنده و خریدار، مشخصات کالا، مبلغ به حروف، جمع‌ها، جای مهر و امضا و دو جمله‌ی پایین برگه).
 * عملیات با مجوز + وضعیت سند (پرچم‌های بک‌اند):
 * - پیش‌نویس: «انصراف و بازگشت»، «تایید و صدور فاکتور» (سبز)، «ویرایش»؛ پیام کهربایی html «هنوز صادر نشده».
 * - صادرشده: «ثبت تسویه»، «اصلاحیه» (فقط سوپر ادمین با مجوز اصلاحیه)، «بایگانی»، «ابطال و آرشیو» (قرمز؛ خاموش با دلیل وقتی `can_void` نیست).
 * - «چاپ»: GET …/print (ثبت رخداد چاپ) و همین برگه در پنجره‌ی چاپ.
 * مشخصات فروشنده از اطلاعات شرکت (فقط با مجوز دیدن شرکت) و شعبه‌ی صادرکننده؛ «مانده حساب» خریدار «به‌زودی» (با حسابداری).
 * «جمع پس از تخفیف» و «مجموع اولیه»ی هر ردیف را بک‌اند نمی‌دهد ⇐ «به‌زودی» (کمبود SL-03).
 */
const HTTP_NOT_FOUND = 404;
const STAMP_TONE: Record<PillTone, string> = { warn: h.st_warn!, ok: h.st_ok!, info: h.st_info!, danger: h.st_danger!, neutral: h.st_neutral! };
const PILL_OF: Record<string, PillTone> = { warning: 'warn', success: 'ok', info: 'info', danger: 'danger', neutral: 'neutral', brand: 'danger' };

export function InvoiceDetailModal({ id, onClose, initialAct = null }: { id: string | null; onClose: () => void; initialAct?: 'void' | null }) {
  useEscapeLayer(!!id, onClose);
  if (!id) return null;
  return createPortal(
    <div className={h.ov} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={h.ovIn} role="dialog" aria-modal="true" aria-label="برگه‌ی فاکتور فروش">
        <SheetBody id={id} onClose={onClose} initialAct={initialAct} />
      </div>
    </div>,
    document.body,
  );
}

function SheetBody({ id, onClose, initialAct }: { id: string; onClose: () => void; initialAct: 'void' | null }) {
  const q = useInvoice(id);
  const closeBtn = <button type="button" className={h.sclose} title="بستن" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>;
  if (q.data) return <Sheet inv={q.data} onClose={onClose} closeBtn={closeBtn} initialAct={initialAct} />;
  const notFound = q.error instanceof ApiError && q.error.status === HTTP_NOT_FOUND;
  return (
    <>
      <div className={h.sbar}><div className={h.stitle}><b>مشاهده فاکتور فروش</b></div><div className={h.sacts}>{closeBtn}</div></div>
      <div className={h.sheetMsg}>
        {q.isLoading ? <SkeletonRows rows={6} height={56} /> : null}
        {notFound ? <p className={h.faint}>این فاکتور پیدا نشد؛ شاید مال شعبه‌ای است که به آن دسترسی ندارید یا حذف شده است.</p> : null}
        {q.error && !notFound ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : null}
      </div>
    </>
  );
}

function Sheet({ inv, onClose, closeBtn, initialAct }: { inv: Invoice; onClose: () => void; closeBtn: React.ReactNode; initialAct: 'void' | null }) {
  const can = usePerm();
  const w = useInvoiceWrite();
  const toast = useToast();
  const navigate = useNavigate();
  const company = useCompany(can('organization.company.read'));
  const policy = useCommercePolicy(can('settings.commerce_policy.read'));
  const traits = useItemTraits([...new Set((inv.lines ?? []).map((l) => l.item?.id ?? '').filter(Boolean))], can('catalog.items.read'));
  const [modal, setModal] = useState<'issue' | 'void' | 'settle' | null>(null);
  const [printing, setPrinting] = useState(false);
  const draft = inv.status === 'DRAFT';
  const issued = inv.status === 'ISSUED';
  const voided = inv.status === 'VOIDED';
  const archived = !!inv.archived_at;
  const no = inv.invoice_number ?? 'پیش‌نویس';
  const voidWhy = inv.can_void ? null : 'فاکتوری که تسویه‌ی ثبت‌شده، برگشتی در جریان یا خروج کالا دارد ابطال نمی‌شود؛ اول ردیف‌های تسویه را لغو کنید.';
  useEffect(() => { if (initialAct === 'void' && issued && inv.can_void) setModal('void'); }, [initialAct, issued, inv.can_void]);

  const doPrint = async () => {
    setPrinting(true);
    try { printInvoice(await fetchInvoicePrint(inv.id), policy.data?.sales_return_window_days ?? null, traits); } catch (e) { toast(userMessage(e), 'error'); } finally { setPrinting(false); }
  };
  const toggleArchive = async () => {
    try {
      await w.archive.mutateAsync({ id: inv.id, archived: !archived });
      toast(archived ? `فاکتور ${no} از بایگانی خارج شد.` : `فاکتور ${no} بایگانی شد.`);
    } catch (e) { toast(userMessage(e), 'error'); }
  };
  const c = inv.customer;
  const pill = invoicePill(inv);
  const dash = '—';
  const totalQty = (inv.lines ?? []).reduce((a, l) => a + qty(l.quantity), 0);
  const co = company.data;
  const sellerRows: [string, React.ReactNode, boolean?][] = [
    ['نام', co ? `${co.name}${inv.branch?.name ? ` — ${inv.branch.name}` : ''}` : inv.branch?.name || dash, true],
    ['کد اقتصادی', co?.economic_code ? <span data-latin>{co.economic_code}</span> : dash],
    ['شناسه ملی', co?.national_id ? <span data-latin>{co.national_id}</span> : dash],
    ['شعبه', inv.branch ? <>{inv.branch.name} (<span data-latin>{inv.branch.code}</span>)</> : dash],
    ['صادرکننده', personName(inv.issuer)],
    ['نشانی', co?.address || dash, true],
  ];
  const buyerRows: [string, React.ReactNode, boolean?][] = [
    ['نام مشتری', c?.store_name || c?.full_name || dash, true],
    ['کد مشتری', c?.code ? <span data-latin>{c.code}</span> : dash],
    ['کد اقتصادی', c?.economic_code ? <span data-latin>{c.economic_code}</span> : dash],
    ['شناسه ملی', c?.national_id ? <span data-latin>{c.national_id}</span> : dash],
    ['تلفن', c?.phone || c?.mobile ? <span data-latin>{c?.phone || c?.mobile}</span> : dash],
    ['کد پستی', c?.postal_code ? <span data-latin>{c.postal_code}</span> : dash],
    ['مانده حساب', <SoonTag key="b" tip="به‌زودی — مانده‌ی حساب مشتری با حسابداری" />],
    ['نشانی', [c?.province, c?.city, c?.address].filter(Boolean).join('، ') || dash, true],
  ];
  const party = (title: string, icon: React.ReactNode, rows: [string, React.ReactNode, boolean?][]) => (
    <div className={h.party}>
      <div className={h.partyHead}>{icon}{title}</div>
      <div className={h.partyBody}>
        {rows.map(([k, v, wide]) => <div key={k} className={`${h.prow} ${wide ? h.prowWide : ''}`}><span className={h.pk}>{k}:</span><span className={h.pv}>{v}</span></div>)}
      </div>
    </div>
  );
  const title = draft ? 'پیش‌نمایش فاکتور فروش' : 'مشاهده فاکتور فروش';

  return (
    <>
      <div className={h.sbar}>
        <div className={h.stitle}><b>{title}</b><span dir="ltr" data-latin>{inv.invoice_number ?? ''}</span></div>
        <div className={h.sacts}>
          {can('sales.invoices.print') ? <button type="button" className={h.sbtn} onClick={() => void doPrint()} disabled={printing}><IconPrinter size={16} />{printing ? 'در حال آماده‌سازی…' : 'چاپ'}</button> : null}
          {draft ? <button type="button" className={h.sbtn} onClick={onClose}>انصراف و بازگشت</button> : null}
          {draft && can('sales.invoices.approve') ? (
            <span data-tip={(inv.lines?.length ?? 0) === 0 ? 'فاکتور بدون ردیف صادر نمی‌شود.' : undefined}>
              <button type="button" className={h.sbtnGreen} disabled={(inv.lines?.length ?? 0) === 0} onClick={() => setModal('issue')}><IconCheck size={16} />تایید و صدور فاکتور</button>
            </span>
          ) : null}
          {draft && can('sales.invoices.update') ? <button type="button" className={h.sbtn} onClick={() => navigate(`/sales/invoices/${inv.id}/edit`)}><IconPencil size={16} />ویرایش</button> : null}
          {issued && (can('sales.invoices.settlement.create') || can('sales.invoices.settlement.read')) ? <button type="button" className={h.sbtn} onClick={() => setModal('settle')}><IconCash size={16} />ثبت تسویه</button> : null}
          {issued && can('sales.invoices.amend.approve') ? <button type="button" className={h.sbtn} onClick={() => navigate(`/sales/invoices/${inv.id}/edit?amend=1`)}><IconFileDiff size={16} />اصلاحیه</button> : null}
          {!draft && can('sales.invoices.update') ? <button type="button" className={h.sbtn} onClick={() => void toggleArchive()}>{archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}{archived ? 'خروج از بایگانی' : 'بایگانی'}</button> : null}
          {issued && can('sales.invoices.void.approve') ? (
            <span data-tip={voidWhy ?? undefined}><button type="button" className={h.sbtnRed} disabled={!!voidWhy} onClick={() => setModal('void')}><IconArchive size={16} />ابطال و آرشیو</button></span>
          ) : null}
          {closeBtn}
        </div>
      </div>

      {draft ? <div className={h.draftNote}><IconAlertTriangle size={18} />این فاکتور هنوز صادر نشده است. اطلاعات را بررسی کنید؛ با «تایید و صدور فاکتور» شماره قطعی گرفته و به لیست فاکتورها اضافه می‌شود.</div> : null}
      {voided ? <div className={h.voidNote}><IconAlertTriangle size={18} />ابطال شده — {personName(inv.voided_by)}، {faDateTime(inv.voided_at)}: {inv.void_reason}</div> : null}

      <div className={h.paper} data-print>
        <div className={h.stripe} />
        <div className={h.phead}>
          <div className={h.pbrand}>
            <div className={h.plogo}><IconFileInvoice size={26} /></div>
            <div><div className={h.pco}>{co?.name || 'زیرا مارکت'}</div><div className={h.ptag}>{inv.branch?.name || 'عمده‌فروشی'}</div></div>
          </div>
          <div className={h.pcenter}><div className={h.ptitle}>صورتحساب فروش کالا</div><div className={h.psub}>فاکتور فروش عمده · مبالغ به ریال</div></div>
          <div className={h.pmeta}>
            <div className={h.pmetaRow}><span className={h.pmetaK}>شماره فاکتور</span><span dir="ltr" data-latin className={inv.invoice_number ? h.pmetaNo : h.draftNo}>{no}</span></div>
            <div className={h.pmetaRow}><span className={h.pmetaK}>تاریخ صدور</span><span className={h.pmetaV}>{faDate(inv.date)}</span></div>
            <div className={h.pmetaRow}><span className={h.pmetaK}>نوع تحویل</span><span className={h.pmetaV}>{inv.delivery_type_display}</span></div>
            <div className={h.pmetaRow}><span className={h.pmetaK}>انبار</span><span className={h.pmetaV}>{inv.delivery_warehouse ? <>{inv.delivery_warehouse.name} (<span data-latin>{inv.delivery_warehouse.code}</span>)</> : dash}</span></div>
          </div>
        </div>
        <div className={`${h.stamp} ${STAMP_TONE[pill.tone]}`}>{pill.label}</div>

        <div className={h.parties}>
          {party('مشخصات فروشنده', <IconFileInvoice size={16} />, sellerRows)}
          {party('مشخصات خریدار (طرف حساب)', <IconUser size={16} />, buyerRows)}
        </div>

        <div className={h.psec}>
          <div className={h.psecTitle}>مشخصات کالا</div>
          <SheetLines inv={inv} traits={traits} />
        </div>

        <div className={h.pbottom}>
          <div className={h.pbox}>
            <div className={h.pwords}><span className={h.pk}>مبلغ قابل پرداخت به حروف: </span><b className={h.pv}>{numberToWordsFa(inv.total_amount) || '—'} ریال</b></div>
            <div className={h.pinfo}>
              <div><span className={h.pk}>نحوه تسویه: </span><b>{inv.settlement_method_display}</b></div>
              <div><span className={h.pk}>وضعیت تسویه: </span><b className={STAMP_TONE[pill.tone]}>{pill.label}</b></div>
              <div><span className={h.pk}>صادرکننده: </span><b>{personName(inv.issuer)}</b></div>
              <div><span className={h.pk}>تعداد اقلام: </span><b>{faNum(inv.lines?.length ?? inv.line_count)} قلم / {faNum(totalQty)} واحد</b></div>
              <div><span className={h.pk}>فروشنده: </span><b>{personName(inv.salesperson)}</b></div>
              <div><span className={h.pk}>منبع سند: </span><b>{SOURCE_TYPE[inv.source_type]}{inv.source_no ? <> <span data-latin>{inv.source_no}</span></> : null}</b></div>
              {issued ? <div><span className={h.pk}>تسویه‌شده: </span><b className="tnum">{money(inv.settled_amount)}</b> ریال</div> : null}
              {issued ? <div><span className={h.pk}>مانده: </span><b className="tnum">{money(inv.outstanding)}</b> ریال</div> : null}
              {inv.settlement_due_date ? <div><span className={h.pk}>سررسید تسویه: </span><b>{faDate(inv.settlement_due_date)}</b></div> : null}
              {inv.coupon_codes?.length ? <div><span className={h.pk}>کد تخفیف: </span><b data-latin>{inv.coupon_codes.join('، ')}</b></div> : null}
            </div>
            <div className={h.pnote}><span className={h.pk}>توضیحات: </span>{inv.note || '—'}</div>
          </div>
          <div className={h.ptots}>
            <div className={h.ptot}><span className={h.ptotK}>مجموع اولیه</span><b className="tnum">{money(inv.subtotal)}</b></div>
            <div className={h.ptot}><span className={h.ptotK}>تخفیف کل</span><b className={`tnum ${h.disc}`}>{money(inv.total_discount)}</b></div>
            <div className={h.ptot}><span className={h.ptotK}>جمع پس از تخفیف</span><SoonTag tip="به‌زودی — بک‌اند این جمع را نمی‌دهد و فرانت مبلغ حساب نمی‌کند" /></div>
            <div className={h.ptot}><span className={h.ptotK}>مالیات و عوارض کل</span><b className="tnum">{money(inv.total_tax_duty)}</b></div>
            <div className={h.ptotGrand}><span>مبلغ قابل پرداخت</span><b className="tnum">{money(inv.total_amount)}</b></div>
          </div>
        </div>

        <div className={h.signs}><div className={h.sign}>مهر و امضای فروشنده</div><div className={h.sign}>مهر و امضای خریدار</div></div>
        <div className={h.pfoot}><span>این صورتحساب توسط سامانه فروش زیرا مارکت صادر شده است.</span><span>{returnSentence(policy.data?.sales_return_window_days ?? null)}</span></div>
      </div>

      {(inv.settlements?.length ?? 0) > 0 ? (
        <div className={h.extra}>
          <div className={h.extraTitle}>ردیف‌های تسویه</div>
          <table className={h.mini}>
            <thead><tr><th>روش</th><th>مبلغ (ریال)</th><th>تاریخ</th><th>وضعیت</th><th>ثبت‌کننده</th></tr></thead>
            <tbody>{(inv.settlements ?? []).map((r) => (
              <tr key={r.id} className={r.status === 'CANCELLED' ? h.miniDead : undefined}>
                <td>{r.method_display}</td><td className="tnum">{money(r.amount)}</td><td>{faDateTime(r.paid_at)}</td>
                <td><Pill tone={PILL_OF[toneOf(SETTLEMENT_ROW_STATUS, r.status)] ?? 'neutral'}>{labelOf(SETTLEMENT_ROW_STATUS, r.status, r.status_display)}</Pill></td><td>{personName(r.recorded_by)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
      {(inv.returns?.length ?? 0) > 0 ? (
        <div className={h.extra}>
          <div className={h.extraTitle}>برگشتی‌های این فاکتور</div>
          <table className={h.mini}>
            <thead><tr><th>شماره</th><th>تاریخ</th><th>وضعیت</th><th>مبلغ (ریال)</th></tr></thead>
            <tbody>{(inv.returns ?? []).map((r) => (
              <tr key={r.id}><td data-latin>{r.return_no}</td><td>{faDate(r.date)}</td>
                <td><Pill tone={PILL_OF[toneOf(RETURN_STATUS, r.status)] ?? 'neutral'}>{labelOf(RETURN_STATUS, r.status, r.status_display)}</Pill></td><td className="tnum">{money(r.total_amount)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
      {(inv.revisions?.length ?? 0) > 0 ? (
        <div className={h.extra}>
          <div className={h.extraTitle}>تاریخچه‌ی اصلاحیه</div>
          <table className={h.mini}>
            <thead><tr><th>شماره اصلاحیه</th><th>دلیل</th><th>اصلاح‌کننده</th><th>زمان</th></tr></thead>
            <tbody>{(inv.revisions ?? []).map((r) => (
              <tr key={r.id}><td>{faNum(r.revision_no)}</td><td>{r.reason}</td><td>{personName(r.amended_by)}</td><td>{faDateTime(r.amended_at)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      <ConfirmModal open={modal === 'issue'} onClose={() => setModal(null)} title="تایید و صدور فاکتور" confirmText="تایید و صدور فاکتور"
        text={<>پس از صدور، فاکتور شماره‌ی قطعی می‌گیرد و ردیف‌ها دیگر قابل ویرایش نیستند (فقط با اصلاحیه‌ی مدیر ارشد). مبلغ کل: <b>{money(inv.total_amount)}</b> ریال.</>}
        onConfirm={async () => { const x = await w.issue.mutateAsync(inv.id); toast(`فاکتور ${x.invoice_number ?? ''} صادر شد.`); }} />
      <ReasonModal open={modal === 'void'} onClose={() => setModal(null)} title={`ابطال فاکتور ${no}`} confirmText="ابطال و آرشیو" danger label="دلیل ابطال"
        intro="فاکتور صادرشده باطل می‌شود و از شمارش فروش بیرون می‌رود. این کار برگشت‌پذیر نیست."
        onConfirm={async (reason) => { await w.void.mutateAsync({ id: inv.id, reason }); toast(`فاکتور ${no} ابطال شد.`); }} />
      {modal === 'settle' ? <SettlementModal invoiceId={inv.id} onClose={() => setModal(null)} /> : null}
    </>
  );
}
