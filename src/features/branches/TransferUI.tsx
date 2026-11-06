import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconAlertCircle, IconArrowDown, IconCheck, IconChevronLeft, IconFileUpload, IconPackage, IconPhoto, IconPrinter, IconSearch, IconTransfer, IconX } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Modal, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { usePricesFor, useUnits } from '@/features/catalog/api';
import { thumbColor } from '@/features/catalog/components';
import { useBranch, useStock, type StockRow } from './api';
import { ConfirmModal, ReceiveModal, RejectModal } from './TransferModals';
import { openTransferReceipt, useTransfer, useTransferWrite, type Transfer, type TransferStatus } from './transfers';
import t from './transfers.module.css';

/**
 * اجزای مشترک «انتقال بین شعبه و انبار» و «انتقال بین شعب» — مطابق html Fixed «Branch Management» (افشین 2026-10-25):
 * کارت انتقال (مسیر، قلم/واحد، وضعیت، مراحل، اقلام، عملیات)، کشوی ثبت انتقال از چپ، انتخاب کالا از موجودی مبدا و جزئیات انتقال.
 * داده‌ها از wms فعلی؛ چرخه: PENDING ⇐ تأیید ⇐ APPROVED ⇐ خروج ⇐ IN_TRANSIT ⇐ دریافت (قطعی و ثبت در دفتر موجودی) ⇐ RECEIVED.
 */
export type Variant = 'internal' | 'inter';

const COLORS: Record<TransferStatus, [string, string]> = {
  PENDING: ['#2A6FDB', '#E8F0FB'], APPROVED: ['#8E6CB0', '#F1ECF7'], IN_TRANSIT: ['#C8841A', '#FDF3E2'],
  RECEIVED: ['#1F8A5B', '#E8F5EF'], REJECTED: ['#D74E54', '#FFEDEB'], CANCELLED: ['#77777f', '#F1F1F4'],
};
export const STATE_LABEL: Record<Variant, Record<TransferStatus, string>> = {
  internal: { PENDING: 'در انتظار تأیید', APPROVED: 'تأییدشده، آماده‌ی خروج', IN_TRANSIT: 'در حال جابه‌جایی', RECEIVED: 'قطعی شده', REJECTED: 'رد شده', CANCELLED: 'لغو شده' },
  inter: { PENDING: 'در انتظار تأیید', APPROVED: 'تأیید شده', IN_TRANSIT: 'در حال انتقال', RECEIVED: 'تکمیل شده', REJECTED: 'رد شده', CANCELLED: 'لغو شده' },
};
export function StateBadge({ status, variant }: { status: TransferStatus; variant: Variant }) {
  const [fg, bg] = COLORS[status];
  return <span className={t.state} style={{ color: fg, background: bg }}>{STATE_LABEL[variant][status]}</span>;
}

const toInt = (v: string) => (/^[0-9]+$/.test(toLatinDigits(v.trim())) ? Number(toLatinDigits(v.trim())) : NaN);
const q = (v: unknown) => Number(v ?? 0);

/** مراحل html: داخلی «ثبت درخواست ⇐ خروج از مبدا ⇐ دریافت در مقصد ⇐ قطعی و ثبت سند»؛ بین شعب «ثبت شده ⇐ تأیید ⇐ در انتقال ⇐ دریافت/تکمیل» */
function stepsOf(x: Transfer, variant: Variant) {
  if (variant === 'internal') {
    return [
      { label: 'ثبت درخواست', done: true, at: x.requested_at },
      { label: 'خروج از مبدا', done: !!x.dispatched_at, at: x.dispatched_at },
      { label: 'دریافت در مقصد', done: !!x.received_at, at: x.received_at },
      { label: 'قطعی و ثبت سند', done: x.status === 'RECEIVED', at: x.received_at },
    ];
  }
  return [
    { label: 'ثبت شده', done: true, at: x.requested_at },
    { label: 'تأیید', done: !!x.approved_at, at: x.approved_at },
    { label: 'در انتقال', done: !!x.dispatched_at, at: x.dispatched_at },
    { label: 'دریافت/تکمیل', done: x.status === 'RECEIVED', at: x.received_at },
  ];
}
export function Steps({ x, variant }: { x: Transfer; variant: Variant }) {
  const color = variant === 'internal' ? 'var(--brand)' : 'var(--success)';
  const steps = stepsOf(x, variant);
  return (
    <div className={t.steps} aria-label="مراحل انتقال">
      {steps.map((sp, i) => (
        <div key={sp.label} className={t.step} style={{ flex: i < steps.length - 1 ? 1 : 'none' }}>
          <div className={t.stepDot} data-tip={sp.at ? faDateTime(sp.at) : undefined}>
            <span style={sp.done ? { background: color, borderColor: color } : undefined}>{sp.done ? <IconCheck size={12} stroke={3} /> : null}</span>
            <small style={sp.done ? { color } : undefined}>{sp.label}</small>
          </div>
          {i < steps.length - 1 ? <span className={t.stepLine} style={steps[i + 1]!.done ? { background: color } : undefined} /> : null}
        </div>
      ))}
    </div>
  );
}

const End = ({ w }: { w: Transfer['source_warehouse'] }) => (
  <div className={t.end}><b>{w?.name ?? '—'}</b><small data-latin>{w?.code ?? ''}</small></div>
);

function useUnitName() {
  const can = usePerm();
  const units = useUnits(can('catalog.products.list'));
  return (id?: string | null) => (id ? units.data?.find((u) => u.id === id)?.name : undefined) ?? '—';
}

/** اقلام داخل کارت (html: کد کالا، نام کالا، واحد اصلی، مقدار) — ردیف‌ها از جزئیات همان انتقال */
function CardLines({ id }: { id: string }) {
  const d = useTransfer(id);
  const unitName = useUnitName();
  return (
    <div className={t.lines}>
      <div className={t.linesHead}><div className={t.c1}>کد کالا</div><div className={t.c2}>نام کالا</div><div className={t.c3}>واحد اصلی</div><div className={t.c4}>مقدار</div></div>
      {d.isLoading ? <div className={t.linesMsg}>…</div> : d.error ? <div className={t.linesMsg}>{userMessage(d.error)}</div> : (d.data?.lines ?? []).map((l) => (
        <div key={l.id} className={t.line}>
          <div className={t.c1} data-latin>{l.item?.code ?? '—'}</div>
          <div className={t.c2}><span className={t.sw} style={{ background: thumbColor(l.item?.code ?? '') }} /><b>{l.item?.display_name ?? '—'}</b></div>
          <div className={t.c3}><span className={t.unit}>{unitName(l.item?.unit_id)}</span></div>
          <div className={t.c4}>{faNum(q(l.quantity))}</div>
        </div>
      ))}
    </div>
  );
}

/** کارت یک انتقال؛ داخلی: اقلام درون کارت؛ بین شعب: کلیک ⇐ جزئیات انتقال */
export function TransferCard({ x, variant, onOpen }: { x: Transfer; variant: Variant; onOpen?: () => void }) {
  const a = useTransferActions(x, variant);
  const branch = variant === 'internal' ? (x.source_warehouse?.branches ?? []).find((b) => (x.destination_warehouse?.branches ?? []).some((d) => d.id === b.id)) : null;
  const head = (
    <>
      <div className={t.id}><b data-latin>{x.transfer_no}</b>{branch ? <small>{branch.name}</small> : null}</div>
      <div className={t.route}>
        <End w={x.source_warehouse} />
        <div className={t.flow} aria-hidden><span /><IconChevronLeft size={17} stroke={2} /></div>
        <End w={x.destination_warehouse} />
      </div>
      <div className={t.nums}>
        <div className={t.num}><b>{faNum(x.line_count)}</b><small>قلم</small></div>
        <div className={t.num}><b>{faNum(q(x.total_quantity))}</b><small>واحد</small></div>
        <StateBadge status={x.status} variant={variant} />
        {x.has_shortage ? <span className={t.state} style={{ color: '#D74E54', background: '#FFEDEB' }}>کسری حمل</span> : null}
        {onOpen ? <IconChevronLeft size={18} className={t.chev} aria-hidden /> : null}
      </div>
    </>
  );
  return (
    <article className={t.card} data-transfer={x.transfer_no}>
      {onOpen ? <div className={`${t.head} ${t.headClick}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} aria-label={`جزئیات انتقال ${x.transfer_no}`}>{head}</div>
        : <div className={t.head}>{head}</div>}
      <Steps x={x} variant={variant} />
      {variant === 'internal' ? <CardLines id={x.id} /> : null}
      {x.status === 'REJECTED' ? <div className={t.reason}><IconAlertCircle size={15} />دلیل رد: {x.reject_reason || '—'}</div> : null}
      {a.err ? <div style={{ margin: '0 20px 12px' }}><Alert>{a.err}</Alert></div> : null}
      {a.buttons.length ? <div className={t.foot}>{a.buttons}<small>{faDate(x.requested_at)}</small></div> : null}
      {a.modals}
    </article>
  );
}

/** عملیات هر مرحله با مجوزهای wms (approve / update)؛ مودال‌های تأیید، رد و دریافت همان مودال‌های قبلی */
export function useTransferActions(x: Transfer, variant: Variant) {
  const can = usePerm();
  const w = useTransferWrite();
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<'' | 'approve' | 'dispatch' | 'cancel' | 'reject' | 'receive'>('');
  const [full, setFull] = useState<Transfer | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const upd = can('wms.transfers.update');
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setErr(null);
    try { await fn(); toast(msg); } catch (e) { setErr(userMessage(e)); } finally { setModal(''); }
  };
  // دریافت به ردیف‌های انتقال نیاز دارد (جزئیات)
  const openReceive = async () => {
    setErr(null);
    try { setFull(await adminApi<Transfer>(`/wms/transfers/${x.id}`)); setModal('receive'); } catch (e) { setErr(userMessage(e)); }
  };
  const B = (key: string, label: ReactNode, cls: string | undefined, onClick: () => void, icon?: ReactNode) => (
    <button key={key} type="button" className={`${t.act} ${cls ?? ""}`} onClick={(e) => { e.stopPropagation(); onClick(); }}>{icon}{label}</button>
  );
  const buttons: ReactNode[] = [];
  const green = variant === 'inter' ? t.actGreen : t.actBrand;
  if (x.status === 'PENDING' && can('wms.transfers.approve')) buttons.push(B('ap', variant === 'inter' ? 'تأیید' : 'تأیید انتقال', green, () => setModal('approve'), variant === 'inter' ? <IconCheck size={15} /> : null));
  if (x.status === 'APPROVED' && upd) buttons.push(B('dp', 'ثبت خروج از مبدا', green, () => setModal('dispatch')));
  if (x.status === 'IN_TRANSIT' && upd) buttons.push(B('rc', variant === 'inter' ? 'ثبت دریافت' : 'ثبت دریافت در مقصد', green, () => { void openReceive(); }, variant === 'inter' ? <IconPackage size={15} /> : null));
  if ((x.status === 'PENDING' || x.status === 'APPROVED') && upd) buttons.push(B('cn', 'لغو انتقال', '', () => setModal('cancel')));
  if (['PENDING', 'APPROVED', 'IN_TRANSIT'].includes(x.status) && upd) buttons.push(B('rj', 'رد', t.actDanger, () => setModal('reject'), <IconX size={14} />));
  if (x.status === 'RECEIVED') buttons.push(B('pr', 'چاپ رسید انتقال', '', () => { void printTransfer(x.id).catch((e) => setErr(userMessage(e))); }, <IconPrinter size={15} />));
  if (upd && (x.status === 'IN_TRANSIT' || x.status === 'RECEIVED')) {
    buttons.push(B('up', x.has_receipt_image ? 'جایگزینی رسید امضاشده' : 'بارگذاری رسید امضاشده', '', () => file.current?.click(), <IconFileUpload size={15} />));
  }
  if (x.has_receipt_image) buttons.push(B('vw', 'مشاهده‌ی رسید', '', () => { openTransferReceipt(x.id).catch((e) => setErr(userMessage(e))); }, <IconPhoto size={15} />));
  const modals = (
    <>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="فایل رسید امضاشده"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => w.image.mutateAsync({ id: x.id, file: f }), 'رسید امضاشده بارگذاری شد.'); }} />
      {modal === 'approve' ? <ConfirmModal title="تأیید انتقال" text={`انتقال ${x.transfer_no} تأیید شود؟ بعد از تأیید، مبدا خروج کالا را ثبت می‌کند.`} confirm="تأیید انتقال" loading={w.approve.isPending}
        onConfirm={() => run(() => w.approve.mutateAsync(x.id), 'انتقال تأیید شد.')} onClose={() => setModal('')} /> : null}
      {modal === 'dispatch' ? <ConfirmModal title="ثبت خروج از مبدا" text="با ثبت خروج، مقدار ارسالی در مبدا رزرو و انتقال «در حال جابه‌جایی» می‌شود." confirm="ثبت خروج" loading={w.dispatch.isPending}
        onConfirm={() => run(() => w.dispatch.mutateAsync(x.id), 'خروج از مبدا ثبت شد.')} onClose={() => setModal('')} /> : null}
      {modal === 'cancel' ? <ConfirmModal title="لغو انتقال" text={`انتقال ${x.transfer_no} لغو شود؟ این کار برگشت‌پذیر نیست.`} confirm="لغو انتقال" danger loading={w.cancel.isPending}
        onConfirm={() => run(() => w.cancel.mutateAsync(x.id), 'انتقال لغو شد.')} onClose={() => setModal('')} /> : null}
      {modal === 'reject' ? <RejectModal transfer={x} onClose={() => setModal('')} onDone={() => { toast('انتقال رد شد.'); setModal(''); }} /> : null}
      {modal === 'receive' && full ? <ReceiveModal transfer={full} onClose={() => setModal('')} onDone={(r) => { toast(r.has_shortage ? 'دریافت با کسری حمل ثبت شد.' : 'دریافت در مقصد ثبت و سند قطعی شد.'); setModal(''); }} /> : null}
    </>
  );
  return { buttons, modals, err };
}

/** چاپ رسید انتقال (پنجره‌ی چاپ مرورگر با اقلام، ارسالی، دریافتی و امضاها) */
export async function printTransfer(id: string) {
  const x = await adminApi<Transfer>(`/wms/transfers/${id}`);
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const rows = (x.lines ?? []).map((l, i) => `<tr><td>${faNum(i + 1)}</td><td dir="ltr">${esc(l.item?.code)}</td><td>${esc(l.item?.display_name)}</td><td>${faNum(q(l.quantity))}</td><td>${l.received_quantity == null ? '—' : faNum(q(l.received_quantity))}</td></tr>`).join('');
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) throw new Error('پنجره‌ی چاپ باز نشد؛ اجازه‌ی پنجره‌ی بازشو را بدهید.');
  win.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>رسید انتقال ${esc(x.transfer_no)}</title>
<style>body{font-family:Tahoma,sans-serif;padding:28px;color:#23232d}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}td,th{border:1px solid #ddd;padding:7px;text-align:right}.m{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:12.5px}.s{display:flex;justify-content:space-between;margin-top:60px;font-size:12px}</style></head><body>
<h1>رسید انتقال ${esc(x.transfer_no)}</h1>
<div class="m"><div>مبدا: <b>${esc(x.source_warehouse?.name)}</b> (${esc(x.source_warehouse?.code)})</div><div>مقصد: <b>${esc(x.destination_warehouse?.name)}</b> (${esc(x.destination_warehouse?.code)})</div>
<div>ثبت: ${esc(faDateTime(x.requested_at))}</div><div>دریافت: ${esc(x.received_at ? faDateTime(x.received_at) : '—')}</div>
<div>درخواست‌کننده: ${esc(x.requester_name || '—')}</div><div>تحویل‌گیرنده: ${esc(x.received_by_name || '—')}</div></div>
<table><thead><tr><th>#</th><th>کد کالا</th><th>نام کالا</th><th>ارسالی</th><th>دریافتی</th></tr></thead><tbody>${rows}</tbody></table>
<div class="s"><span>امضای مبدا</span><span>امضای حمل‌کننده</span><span>امضای مقصد</span></div>
<script>window.onload=function(){window.print()}</script></body></html>`);
  win.document.close();
}

// ───────────────────────── جزئیات انتقال (بین شعب) ─────────────────────────
export function TransferDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useTransfer(id);
  const x = d.data;
  const unitName = useUnitName();
  const a = useTransferActionsSafe(x);
  const units = (x?.lines ?? []).reduce((s, l) => s + q(l.quantity), 0);
  const recvCol = x?.status === 'RECEIVED' ? 'دریافتی' : 'وضعیت دریافت';
  const tl = x ? timeline(x) : [];
  return (
    <Modal open onClose={onClose} width={680}
      title={x ? <span className={t.dtTitle}><span className={t.dtIcon}><IconTransfer size={22} /></span><span><b>انتقال <span data-latin>{x.transfer_no}</span></b> <StateBadge status={x.status} variant="inter" /><small>ثبت در تاریخ {faDate(x.requested_at)}</small></span></span> : 'جزئیات انتقال'}
      footer={<div className={t.dtFoot}><Button variant="secondary" onClick={onClose}>بستن</Button><span>{a?.buttons}</span></div>}>
      {d.isLoading ? <SkeletonRows rows={4} /> : !x ? <Alert>{d.error ? userMessage(d.error) : 'انتقال پیدا نشد.'}</Alert> : (
        <>
          <div className={t.dtRoute}>
            <div><small>مبدا</small><b>{x.source_warehouse?.name ?? '—'}</b><i data-latin>{x.source_warehouse?.code}</i>{x.source_warehouse?.branches?.length ? <small>{x.source_warehouse.branches.map((b) => b.name).join('، ')}</small> : null}</div>
            <IconChevronLeft size={22} />
            <div><small>مقصد</small><b>{x.destination_warehouse?.name ?? '—'}</b><i data-latin>{x.destination_warehouse?.code}</i>{x.destination_warehouse?.branches?.length ? <small>{x.destination_warehouse.branches.map((b) => b.name).join('، ')}</small> : null}</div>
          </div>
          <div className={t.dtSec}><b>اقلام انتقال</b><small>{faNum(x.lines?.length ?? 0)} قلم · {faNum(units)} واحد</small></div>
          <div className={t.items}>
            <div className={t.itemsHead}><div className={t.i1}>کد کالا</div><div className={t.i2} style={{ flex: 2.4 }}>نام کالا</div><div style={{ flex: 1, textAlign: 'center' }}>تعداد</div><div style={{ flex: 1.4, textAlign: 'left' }}>{recvCol}</div></div>
            {(x.lines ?? []).map((l) => {
              const rec = l.received_quantity;
              const short = q(l.shortage) > 0;
              return (
                <div key={l.id} className={t.item} style={{ padding: '11px 14px' }}>
                  <div className={t.i1} data-latin>{l.item?.code ?? '—'}</div>
                  <div style={{ flex: 2.4, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span className={t.av} style={{ background: thumbColor(l.item?.code ?? '') }}>{(l.item?.display_name ?? '؟').slice(0, 1)}</span>
                    <b style={{ fontSize: 12.5, fontWeight: 600, color: '#484649', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.item?.display_name ?? '—'}</b>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}><b>{faNum(q(l.quantity))}</b> <small style={{ color: '#bbb' }}>{unitName(l.item?.unit_id)}</small></div>
                  <div style={{ flex: 1.4, textAlign: 'left', fontWeight: 700, color: rec == null ? '#aaa' : short ? '#D74E54' : '#1F8A5B' }}>
                    {rec == null ? 'در انتظار' : short ? `${faNum(q(rec))} (کسری ${faNum(q(l.shortage))})` : faNum(q(rec))}
                  </div>
                </div>
              );
            })}
          </div>
          {x.status === 'REJECTED' ? <div className={t.reason} style={{ margin: '14px 0 0' }}><IconAlertCircle size={15} />دلیل رد: {x.reject_reason || '—'}</div> : null}
          {x.note ? <p style={{ fontSize: 12, color: '#777', margin: '12px 0 0' }}>توضیحات: {x.note}</p> : null}
          <div className={t.dtSec} style={{ margin: '20px 0 10px' }}><b>سابقه وضعیت</b></div>
          <div className={t.tl}>
            {tl.map((e, i) => (
              <div key={e.title} className={t.tlRow}>
                <div className={t.tlDot} style={{ color: e.done ? e.color : '#d8d8de' }}><span style={e.done ? undefined : { background: '#fff' }} />{i < tl.length - 1 ? <i /> : null}</div>
                <div className={t.tlText}><b style={{ color: e.done ? '#23232d' : '#aaa' }}>{e.title}</b><small>{e.meta}</small></div>
              </div>
            ))}
          </div>
          {a?.err ? <Alert>{a.err}</Alert> : null}
          {a?.modals}
        </>
      )}
    </Modal>
  );
}
function useTransferActionsSafe(x: Transfer | undefined) {
  const dummy = useMemo(() => x, [x]);
  const r = useTransferActions((dummy ?? ({ id: '', status: 'CANCELLED', transfer_no: '', has_receipt_image: false } as unknown as Transfer)), 'inter');
  return dummy ? r : null;
}
function timeline(x: Transfer) {
  const ev: { title: string; meta: string; done: boolean; color: string }[] = [
    { title: 'ثبت درخواست انتقال', meta: `${faDateTime(x.requested_at)}${x.requester_name ? ` — ${x.requester_name}` : ''}`, done: true, color: '#2A6FDB' },
  ];
  if (x.status === 'CANCELLED') { ev.push({ title: 'لغو انتقال', meta: x.cancelled_at ? faDateTime(x.cancelled_at) : '—', done: true, color: '#77777f' }); return ev; }
  ev.push({ title: 'تأیید انتقال', meta: x.approved_at ? `${faDateTime(x.approved_at)}${x.approver_name ? ` — ${x.approver_name}` : ''}` : 'در انتظار', done: !!x.approved_at, color: '#8E6CB0' });
  ev.push({ title: 'خروج از مبدا', meta: x.dispatched_at ? faDateTime(x.dispatched_at) : 'در انتظار', done: !!x.dispatched_at, color: '#C8841A' });
  if (x.status === 'REJECTED') { ev.push({ title: 'رد انتقال', meta: `${x.rejected_at ? faDateTime(x.rejected_at) : '—'} — ${x.reject_reason || ''}`, done: true, color: '#D74E54' }); return ev; }
  ev.push({ title: 'دریافت در مقصد و ثبت سند', meta: x.received_at ? `${faDateTime(x.received_at)}${x.received_by_name ? ` — ${x.received_by_name}` : ''}${q(x.total_shortage) > 0 ? ` — کسری حمل ${faNum(q(x.total_shortage))}` : ''}` : 'در انتظار', done: !!x.received_at, color: '#1F8A5B' });
  return ev;
}

// ───────────────────────── کشوی ثبت انتقال (از چپ) ─────────────────────────
type Opt = { value: string; label: string; code?: string; kind?: string };
function Pick({ label, small, value, options, placeholder, onChange, disabled, error }: {
  label: string; small?: boolean; value: string; options: Opt[]; placeholder: string; onChange: (v: string) => void; disabled?: boolean; error?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const cur = options.find((o) => o.value === value);
  return (
    <div className={t.field} ref={ref}>
      <div className={small ? t.fLabelSm : t.fLabel}>{label} <em>*</em></div>
      <button type="button" className={t.sel} aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <span className={t.nameRow}>{cur?.kind ? <span className={t.kind}>{cur.kind}</span> : null}<span>{cur ? <b>{cur.label}</b> : <span style={{ color: '#aaa' }}>{placeholder}</span>}</span></span>
        <span className={t.code} data-latin>{cur?.code ?? ''}</span>
      </button>
      {open ? (
        <div className={`${t.menu} ${t.selMenu}`} role="listbox" aria-label={label}>
          {options.length ? options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}>
              <span className={t.nameRow}>{o.kind ? <span className={t.kind}>{o.kind}</span> : null}<span>{o.label}</span></span><span className={t.code} data-latin>{o.code ?? ''}</span>
            </button>
          )) : <button type="button" disabled>گزینه‌ای نیست</button>}
        </div>
      ) : null}
      {error ? <div className={t.fErr} role="alert">{error}</div> : null}
    </div>
  );
}

/** گزینه‌های «خود شعبه یا انبار» یک شعبه: انبار اصلی = فروشگاه خود شعبه، بقیه انبارهای اختصاصی */
function useStores(branchId: string) {
  const b = useBranch(branchId || undefined);
  const opts: Opt[] = (b.data?.warehouses ?? []).map((w) => ({ value: w.warehouse_id, label: w.is_primary ? `${b.data!.name} (فروشگاه)` : w.name, code: w.code, kind: w.is_primary ? 'فروشگاه' : 'انبار' }));
  return { branch: b.data, opts, loading: b.isLoading };
}

type Line = { item_id: string; code: string; name: string; unit_id?: string | null; available: number; qty: string };

/**
 * ثبت انتقال — داخلی (مبدا و مقصد از خود شعبه و انبارهای اختصاصی همان شعبه) یا بین شعب (شعبه و انبار مبدا، شعبه و انبار مقصد).
 * html: اقلام با −/+، «افزودن کالا از مبدا»، خلاصه (تعداد ردیف، جمع مقدار، ارزش انتقال) و توضیحات.
 */
export function TransferDrawer({ mode, branchId: initialBranch, onClose, onCreated }: { mode: Variant; branchId?: string; onClose: () => void; onCreated: (x: Transfer) => void }) {
  const can = usePerm();
  const w = useTransferWrite();
  const branches = useBranchOptions();
  const bOpts: Opt[] = (branches.data ?? []).filter((b) => b.status === 'ACTIVE').map((b) => ({ value: b.id, label: b.name, code: b.code }));
  const [sb, setSb] = useState(initialBranch ?? '');
  const [db, setDb] = useState('');
  const src = useStores(sb);
  const dst = useStores(mode === 'internal' ? sb : db);
  const [s, setS] = useState(''); const [d, setD] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  // پیش‌فرض داخلی: مبدا = فروشگاه شعبه، مقصد = اولین انبار دیگر
  useEffect(() => {
    if (mode !== 'internal' || !src.branch) return;
    const prim = src.branch.warehouses.find((x) => x.is_primary) ?? src.branch.warehouses[0];
    setS(prim?.warehouse_id ?? ''); setD(src.branch.warehouses.find((x) => x.warehouse_id !== prim?.warehouse_id)?.warehouse_id ?? ''); setLines([]);
  }, [mode, src.branch?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'inter' && src.branch) { setS(src.branch.warehouses.find((x) => x.is_primary)?.warehouse_id ?? src.branch.warehouses[0]?.warehouse_id ?? ''); setLines([]); } }, [mode, src.branch?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'inter' && dst.branch) setD(dst.branch.warehouses.find((x) => x.is_primary)?.warehouse_id ?? dst.branch.warehouses[0]?.warehouse_id ?? ''); }, [mode, dst.branch?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !picking) onClose(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [picking, onClose]);
  const canPrice = can('pricing.prices.list');
  const prices = usePricesFor(useMemo(() => lines.map((l) => l.item_id), [lines]), canPrice);
  const unitName = useUnitName();
  const priceOf = (id: string) => { const p = prices.data?.get(id)?.sale_price; return p ? Number(p) : null; };
  const sumQty = lines.reduce((a, l) => a + (Number.isNaN(toInt(l.qty)) ? 0 : toInt(l.qty)), 0);
  const sumVal = lines.reduce((a, l) => a + (priceOf(l.item_id) ?? 0) * (Number.isNaN(toInt(l.qty)) ? 0 : toInt(l.qty)), 0);
  const setQty = (id: string, v: string) => { setErrs(({ lines: _l, ...r }) => r); setLines((ls) => ls.map((l) => (l.item_id === id ? { ...l, qty: v } : l))); };
  const bump = (l: Line, by: number) => { const n = Number.isNaN(toInt(l.qty)) ? 0 : toInt(l.qty); setQty(l.item_id, toFaDigits(String(Math.min(l.available, Math.max(1, n + by))))); };
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!sb) e.sb = mode === 'internal' ? 'شعبه را انتخاب کنید.' : 'شعبه‌ی مبدا را انتخاب کنید.';
    if (mode === 'inter' && !db) e.db = 'شعبه‌ی مقصد را انتخاب کنید.';
    if (!s) e.s = 'مبدا را انتخاب کنید.';
    if (!d) e.d = 'مقصد را انتخاب کنید.';
    if (s && d && s === d) e.d = 'مقصد باید با مبدا فرق کند.';
    if (!lines.length) e.lines = 'حداقل یک کالا از مبدا اضافه کنید.';
    else if (lines.some((l) => { const n = toInt(l.qty); return Number.isNaN(n) || n <= 0 || n > l.available; })) e.lines = 'تعداد هر ردیف باید عدد صحیح، بزرگ‌تر از صفر و حداکثر برابر موجودی مبدا باشد.';
    setErrs(e); setErr(null);
    if (Object.keys(e).length) return;
    try {
      const x = await w.create.mutateAsync({ source_warehouse_id: s, destination_warehouse_id: d, insurance_status: 'NONE', source_doc_no: '', note: note.trim(),
        lines: lines.map((l) => ({ item_id: l.item_id, quantity: String(toInt(l.qty)) })) });
      onCreated(x);
    } catch (x) { setErr(userMessage(x)); }
  };
  const internal = mode === 'internal';
  const storeLabel = (side: 'مبدا' | 'مقصد') => (internal ? `${side} (خود شعبه یا انبار)` : `انبار ${side} (یا خود شعبه)`);
  return (
    <div className={t.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={t.drawer} style={{ width: internal ? 'min(560px,96vw)' : 'min(620px,97vw)' }} role="dialog" aria-modal="true" aria-label={internal ? 'ثبت انتقال بین انبارهای شعبه' : 'ثبت انتقال بین شعب'}>
        <div className={t.dHead}>
          <div>
            <h3>{internal ? 'ثبت انتقال بین انبارهای شعبه' : 'ثبت انتقال بین شعب'}</h3>
            <p>{internal ? `${src.branch?.name ?? 'شعبه'} — انتقال داخلی میان خود شعبه و انبارهای اختصاصی آن` : 'ابتدا شعبه و سپس انبار آن را برای مبدا و مقصد انتخاب کنید'}</p>
          </div>
          <button type="button" className={t.x} onClick={onClose} aria-label="بستن"><IconX size={16} /></button>
        </div>
        <div className={t.dBody}>
          {err ? <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div> : null}
          {internal ? (
            <>
              {!initialBranch ? <div style={{ marginBottom: 14 }}><Pick label="شعبه" value={sb} options={bOpts} placeholder="انتخاب شعبه" error={errs.sb} onChange={setSb} /></div> : null}
              <Pick label={storeLabel('مبدا')} value={s} options={src.opts} placeholder={sb ? 'انتخاب مبدا' : 'اول شعبه را انتخاب کنید'} disabled={!sb} error={errs.s}
                onChange={(v) => { setS(v); setLines([]); if (v === d) setD(''); }} />
              <div className={t.down}><span><IconArrowDown size={18} /></span></div>
              <Pick label={storeLabel('مقصد')} value={d} options={dst.opts.filter((o) => o.value !== s)} placeholder={sb ? 'انتخاب مقصد' : 'اول شعبه را انتخاب کنید'} disabled={!sb} error={errs.d} onChange={setD} />
              {sb && src.branch && src.branch.warehouses.length < 2 ? <p className={t.fErr}>این شعبه فقط فروشگاه خودش را دارد؛ برای انتقال داخلی باید انبار دیگری به شعبه اختصاص یابد.</p> : null}
            </>
          ) : (
            <>
              <div className={t.box}>
                <div className={t.boxTitle} style={{ color: 'var(--brand)' }}>مبدا</div>
                <Pick small label="شعبه مبدا" value={sb} options={bOpts} placeholder="انتخاب شعبه" error={errs.sb} onChange={(v) => { setSb(v); if (v === db) setDb(''); }} />
                <Pick small label={storeLabel('مبدا')} value={s} options={src.opts} placeholder={sb ? 'انتخاب انبار' : 'اول شعبه را انتخاب کنید'} disabled={!sb} error={errs.s} onChange={(v) => { setS(v); setLines([]); }} />
              </div>
              <div className={t.down}><span><IconArrowDown size={18} /></span></div>
              <div className={t.box}>
                <div className={t.boxTitle} style={{ color: 'var(--info)' }}>مقصد</div>
                <Pick small label="شعبه مقصد" value={db} options={bOpts.filter((o) => o.value !== sb)} placeholder="انتخاب شعبه" error={errs.db} onChange={setDb} />
                <Pick small label={storeLabel('مقصد')} value={d} options={dst.opts} placeholder={db ? 'انتخاب انبار' : 'اول شعبه را انتخاب کنید'} disabled={!db} error={errs.d} onChange={setD} />
              </div>
            </>
          )}

          <div className={t.secTitle}>اقلام انتقال</div>
          <div className={t.items}>
            <div className={t.itemsHead}><div className={t.i1}>کد کالا</div><div className={t.i2}>نام کالا</div><div className={t.i3}>واحد اصلی</div><div className={t.i4}>موجودی مبدا</div><div className={t.i5}>تعداد</div><div className={t.i6} /></div>
            {lines.map((l) => {
              const n = toInt(l.qty); const bad = !!l.qty && (Number.isNaN(n) || n <= 0 || n > l.available); const p = priceOf(l.item_id);
              return (
                <div key={l.item_id} className={t.item}>
                  <div className={t.i1} data-latin>{l.code}</div>
                  <div className={t.i2}><b>{l.name}</b>{canPrice ? <small>{p ? `${faNum(p)} ریال / واحد` : 'قیمت ثبت نشده'}</small> : null}</div>
                  <div className={t.i3}><span className={t.unit}>{unitName(l.unit_id)}</span></div>
                  <div className={t.i4}>{faNum(l.available)}</div>
                  <div className={t.i5}><div className={t.qty}>
                    <button type="button" onClick={() => bump(l, -1)} aria-label={`کم کردن ${l.code}`} disabled={!Number.isNaN(n) && n <= 1}>−</button>
                    <input inputMode="numeric" value={l.qty} aria-label={`تعداد ${l.code}`} className={bad ? t.qtyBad : ''} onChange={(e) => setQty(l.item_id, toFaDigits(e.target.value))} />
                    <button type="button" onClick={() => bump(l, 1)} aria-label={`افزودن یک ${l.code}`} disabled={!Number.isNaN(n) && n >= l.available}>+</button>
                  </div></div>
                  <button type="button" className={t.rm} onClick={() => setLines((ls) => ls.filter((x) => x.item_id !== l.item_id))} aria-label={`حذف ${l.code}`}><IconX size={14} /></button>
                </div>
              );
            })}
            {!lines.length ? <div className={t.itemsEmpty}>هنوز کالایی انتخاب نشده است.</div> : null}
            <button type="button" className={t.addItem} onClick={() => setPicking(true)} disabled={!s}>+ {internal ? 'افزودن کالا از مبدا' : 'افزودن کالا از انبار مبدا'}</button>
          </div>
          {errs.lines ? <div className={t.fErr} role="alert">{errs.lines}</div> : null}
          <div className={t.sums}>
            <div><b>{faNum(lines.length)}</b><small>تعداد ردیف</small></div>
            <div><b>{faNum(sumQty)}</b><small>جمع مقدار</small></div>
            {canPrice ? <div><b style={{ color: 'var(--success)' }}>{faNum(sumVal)} ریال</b><small>ارزش انتقال</small></div> : null}
          </div>
          <div style={{ marginTop: 18 }}>
            <div className={t.fLabel}>توضیحات</div>
            <textarea className={t.textarea} placeholder="توضیح اختیاری برای این انتقال…" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} aria-label="توضیحات" />
          </div>
        </div>
        <div className={t.dFoot}>
          <button type="button" className={t.cancel} onClick={onClose}>انصراف</button>
          <button type="button" className={t.submit} onClick={submit} disabled={w.create.isPending}><IconCheck size={16} />{w.create.isPending ? 'در حال ثبت…' : internal ? 'ثبت انتقال داخلی' : 'ثبت درخواست انتقال'}</button>
        </div>
      </div>
      {picking ? <ItemPicker warehouseId={s} title={`موجودی ${[...src.opts].find((o) => o.value === s)?.label ?? 'مبدا'}`} existing={lines.map((l) => l.item_id)} onClose={() => setPicking(false)}
        onAdd={(rows) => { setErrs(({ lines: _l, ...r }) => r); setLines((ls) => [...ls, ...rows.filter((r) => r.item && !ls.some((l) => l.item_id === r.item!.id)).map((r) => ({ item_id: r.item!.id, code: r.item!.code, name: r.item!.display_name, unit_id: r.item!.unit_id, available: q(r.available), qty: toFaDigits('1') }))]); setPicking(false); }} /> : null}
    </div>
  );
}

/** html «افزودن کالا به انتقال»: موجودی قابل انتقال مبدا با جست‌وجو و انتخاب چندتایی */
function ItemPicker({ warehouseId, title, existing, onAdd, onClose }: { warehouseId: string; title: string; existing: string[]; onAdd: (r: StockRow[]) => void; onClose: () => void }) {
  const can = usePerm();
  const [text, setText] = useState(''); const dq = useDebounced(text.trim(), 300);
  const stock = useStock({ warehouse_id: warehouseId, query: dq || undefined, in_stock_only: true, page_size: 50 }, !!warehouseId);
  const rows = useMemo(() => stock.data?.results ?? [], [stock.data]);
  const canPrice = can('pricing.prices.list');
  const prices = usePricesFor(useMemo(() => rows.map((r) => r.item?.id).filter((x): x is string => !!x), [rows]), canPrice);
  const unitName = useUnitName();
  const [sel, setSel] = useState<Map<string, StockRow>>(new Map());
  const toggle = (r: StockRow) => setSel((m) => { const n = new Map(m); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r); return n; });
  return (
    <Modal open onClose={onClose} width={880} title={<span className={t.dtTitle}><span><b>افزودن کالا به انتقال</b><small>{title}</small></span></span>}
      footer={<div className={t.dtFoot}><small style={{ color: '#999', fontSize: 11.5 }}>{faNum(sel.size)} کالا انتخاب شده{stock.data ? ` · ${faNum(stock.data.total)} کالای دارای موجودی` : ''}</small>
        <span><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={() => onAdd([...sel.values()])} disabled={!sel.size}>افزودن {sel.size ? faNum(sel.size) : ''}</Button></span></div>}>
      <div className={t.pkSearch}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="جستجو با کد، نام یا بارکد…" aria-label="جست‌وجوی کالا" /><IconSearch size={16} /></div>
      <div className={t.items}>
        <div className={t.pkHead}><div className={t.p0} /><div className={t.p1}>کد کالا</div><div className={t.p2}>نام کالا</div><div className={t.p3}>دسته‌بندی</div><div className={t.p4}>برند</div><div className={t.p5}>واحد اصلی</div><div className={t.p6}>موجودی</div>{canPrice ? <div className={t.p7}>قیمت فروش (ریال)</div> : null}</div>
        {stock.isLoading ? <div className={t.itemsEmpty}>…</div> : rows.map((r) => {
          const already = !!r.item && existing.includes(r.item.id); const on = sel.has(r.id); const p = r.item ? prices.data?.get(r.item.id)?.sale_price : null;
          return (
            <button key={r.id} type="button" className={t.pkRow} role="checkbox" aria-checked={on} disabled={already || q(r.available) <= 0} onClick={() => toggle(r)} aria-label={`انتخاب ${r.item?.code ?? ''}`}>
              <div className={t.p0}><span className={`${t.cb} ${on ? t.cbOn : ''}`}>{on ? <IconCheck size={11} stroke={3} /> : null}</span></div>
              <div className={t.p1} data-latin>{r.item?.code}</div>
              <div className={t.p2}>{r.item?.display_name}{already ? <small>پیش‌تر افزوده شده</small> : null}</div>
              <div className={t.p3}>{r.item?.category_path || '—'}</div>
              <div className={t.p4}>{r.item?.brand_name || '—'}</div>
              <div className={t.p5}><span className={t.unit}>{unitName(r.item?.unit_id)}</span></div>
              <div className={t.p6}>{faNum(q(r.available))}</div>
              {canPrice ? <div className={t.p7}>{p ? faNum(Number(p)) : '—'}</div> : null}
            </button>
          );
        })}
        {!stock.isLoading && !rows.length ? <div className={t.itemsEmpty}>{dq ? 'کالایی مطابق جستجو در مبدا یافت نشد.' : 'مبدا موجودی قابل انتقال ندارد.'}</div> : null}
      </div>
    </Modal>
  );
}
