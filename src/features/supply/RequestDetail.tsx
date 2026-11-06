import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconDownload, IconEdit, IconFileText, IconFileUpload, IconLink, IconTrash, IconTruckDelivery, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { groupMoney, moneyDigits } from '@/shared/lib/money';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Input, Select, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Chip, Empty, ErrorBox, KeyValue, Modal, Rial, Segmented, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useAllWarehouses } from '@/features/branches/transfers';
import { ReasonModal } from '@/features/customers/components';
import { useSupplierOptions } from './api';
import { ItemPickerModal } from './ItemPicker';
import { LIFECYCLE_TONE, labelOf, REQUEST_FINAL, toneOf, VOTE } from './labels';
import { RequestDrawer } from './RequestDrawer';
import { int, isCustomerRequest, openFile, personName, personRoles, useRequest, useRequestWrite, type RequestLine, type SupplyRequest } from './requestsApi';
import { StageModal } from './RequestStage';
import { SaleUnits } from './SaleUnits';
import s from './supply.module.css';

/**
 * جزئیات درخواست تأمین — مودال (افشین 2026-10-31؛ html «درخواست تأمین تامین») و پنل راست صفحه‌ی «شورای تأمین».
 * قواعد از بک‌اند (services/request.py):
 * - ویرایش، لغو، مستند تازه و اتصال ردیف موقت فقط وقتی درخواست تأمین «در انتظار» است و تصمیم تأمین هنوز گرفته نشده (مجوز update).
 * - رأی: فقط عضو فعال شورا با مجوز رأی (`vote_summary.can_vote`)؛ مخالف توضیح الزامی؛ تا پیش از تصمیم قابل تغییر.
 * - تصمیم تأمین (مجوز approve): «تأیید» با `meets_approval` و «رد» با `meets_quorum` فعال می‌شود (افشین 2026-10-31)؛ رد دلیل الزامی؛
 *   تأیید با ردیف موقت رد می‌شود (پیام بک‌اند).
 * - تأیید مالی (مجوز finance.approve) فقط بعد از تأیید تأمین؛ رد مالی دلیل الزامی. وضعیت نهایی بعد از تصمیم مالی «تأیید/رد» می‌شود.
 * - تعیین تأمین‌کننده و انبار مقصد فقط برای درخواست تأمین تأییدشده‌ی بدون اعلامیه (مجوز update).
 * - بیعانه و پرداخت (درخواست تأمین مشتری) در این فاز نیست ⇐ به‌زودی.
 */
const WIDTH = 1180;
const MAX_DOCS = 10;
const ASSIGN_WIDTH = 520;

export function RequestDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useRequest(id);
  return (
    <Modal open={!!id} onClose={onClose} width={WIDTH} title={q.data ? <>درخواست تأمین <span data-latin>{q.data.request_no}</span></> : 'درخواست تأمین'}>
      <RequestDetailBody id={id} onDone={onClose} />
    </Modal>
  );
}

export function RequestDetailBody({ id, onDone, compact = false }: { id: string | null; onDone?: () => void; compact?: boolean }) {
  const q = useRequest(id);
  if (!id) return <Empty title="یک درخواست تأمین را از فهرست انتخاب کنید." />;
  if (q.isLoading) return <SkeletonRows rows={5} height={70} />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return <Detail r={q.data} onDone={onDone} compact={compact} />;
}

function Detail({ r, onDone, compact }: { r: SupplyRequest; onDone?: () => void; compact: boolean }) {
  const can = usePerm();
  const open = r.final_status === 'OPEN';
  // ویرایش، لغو و اتصال ردیف موقت فقط در «رأی‌گیری» و فقط برای درخواست کارمند (درخواست مشتری را مشتری از پنل خودش تغییر می‌دهد)
  const canEdit = r.lifecycle === 'VOTING' && !isCustomerRequest(r) && can('supply.supply_requests.update');
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const w = useRequestWrite();
  const toast = useToast();
  const total = int(r.total);
  // تعیین تأمین‌کننده و صدور اعلامیه فقط در «در انتظار تعیین تأمین‌کننده» (S-24)
  const canAssign = r.lifecycle === 'AWAITING_SUPPLIER' && can('supply.supply_requests.update');
  // صدور اعلامیه‌ی رسید انبار برای درخواست تأمین تأییدشده‌ی بدون اعلامیه (کشوی اعلامیه با همین درخواست تأمین باز می‌شود)
  const canAdvice = r.lifecycle === 'AWAITING_SUPPLIER' && !!r.supplier && can('supply.receipt_advices.create');
  const navigate = useNavigate();

  return (
    <div className={s.detail}>
      <div className={s.detailHead}>
        <div className={s.badges}>
          <button type="button" className={s.stageBtn} aria-haspopup="dialog" aria-label={`مسیر ${r.request_no}`} data-tip="دیدن همه‌ی مرحله‌ها" onClick={() => setStageOpen(true)}><Badge tone={LIFECYCLE_TONE[r.lifecycle] ?? 'neutral'}>{r.lifecycle_display}</Badge></button>
          <span className={s.stage}>وضعیت نهایی: <Badge tone={toneOf(REQUEST_FINAL, r.final_status)}>{labelOf(REQUEST_FINAL, r.final_status, r.final_status_display)}</Badge></span>
          <span className={s.stage}>{isCustomerRequest(r) ? 'درخواست مشتری' : 'درخواست کارمند'}</span>
        </div>
        <div className={s.headActs}>
          {canEdit ? <Button size="sm" variant="secondary" icon={<IconEdit size={15} />} onClick={() => setEditing(true)}>ویرایش</Button> : null}
          {canAssign ? <Button size="sm" icon={<IconTruckDelivery size={15} />} onClick={() => setAssigning(true)}>تعیین تأمین‌کننده</Button> : null}
          {canAdvice ? <Button size="sm" variant="secondary" icon={<IconFileText size={15} />} onClick={() => navigate(`/supply/receipt-advices/new?request=${r.id}`)}>صدور اعلامیه</Button> : null}
          {canEdit ? <Button size="sm" variant="danger" onClick={() => setCancelling(true)}>لغو درخواست تأمین</Button> : null}
        </div>
      </div>

      <div className={s.kvGrid4}>
        <KeyValue label="تاریخ">{faDate(r.request_date)}</KeyValue>
        <KeyValue label="موعد تحویل">{r.delivery_due ? <>{faDate(r.delivery_due)}{r.is_late ? <span className={s.lateTag}>تأخیر</span> : null}</> : ''}</KeyValue>
        <KeyValue label="تاریخ اعتبار">{r.valid_until ? faDate(r.valid_until) : ''}</KeyValue>
        <KeyValue label="سفارش‌دهنده">{personName(r.requester)}{personRoles(r.requester) ? <small className={s.sub}>{personRoles(r.requester)}</small> : null}</KeyValue>
        <KeyValue label="کد پرسنلی" ltr>{r.requester?.personnel_code ?? ''}</KeyValue>
        <KeyValue label="تأمین‌کننده">{r.supplier ? <>{r.supplier.name} <span className={s.muted} data-latin>{r.supplier.code}</span></> : ''}</KeyValue>
        <KeyValue label="انبار مقصد">{r.destination_warehouse ? <>{r.destination_warehouse.name}{r.destination_warehouse.keeper_name ? <small className={s.sub}>مسئول: {r.destination_warehouse.keeper_name}</small> : null}</> : ''}</KeyValue>
        <KeyValue label="اعلامیه" ltr>{r.advice_no ?? ''}</KeyValue>
        <KeyValue label="بیعانه">{depositText(r)}</KeyValue>
      </div>
      {r.reconcile_note ? <div className={s.formNote}><Alert>یادداشت تطبیق مدیر تأمین: {r.reconcile_note}</Alert></div> : null}
      {r.close_reason ? <div className={s.formNote}><Alert>{r.final_status === 'REJECTED' ? 'دلیل رد' : 'دلیل بستن'}: {r.close_reason}</Alert></div> : null}

      <SectionTitle extra={<Chip>{faNum(r.line_count)} قلم</Chip>}>اقلام سفارش</SectionTitle>
      <LinesTable r={r} canLink={canEdit} />
      <div className={s.linesTotal}>جمع کل سفارش: <b className="tnum">{faNum(total)}</b> <Rial /></div>

      <div className={compact ? s.detailCols1 : s.detailCols}>
        <div className={s.stack}>
          <div>
            <SectionTitle>دلایل و مستندات</SectionTitle>
            <p className={s.pre}>{r.reasons || <span className={s.muted}>توضیحی ثبت نشده است.</span>}</p>
            <Documents r={r} canEdit={open && can('supply.supply_requests.update')} />
          </div>
          <Approvals r={r} />
        </div>
        <div className={s.stack}>
          <Votes r={r} />
          <Decisions r={r} />
        </div>
      </div>

      {stageOpen ? <StageModal id={r.id} onClose={() => setStageOpen(false)} /> : null}
      {editing ? <RequestDrawer request={r} onClose={() => setEditing(false)} /> : null}
      <ReasonModal open={cancelling} onClose={() => setCancelling(false)} title={`لغو درخواست تأمین ${r.request_no}`} confirmText="لغو درخواست تأمین" danger busy={w.cancel.isPending}
        intro="درخواست تأمین لغو می‌شود و دیگر رأی یا تصمیمی نمی‌گیرد. این کار برگشت‌پذیر نیست." label="دلیل لغو"
        onConfirm={async (reason) => { await w.cancel.mutateAsync({ rid: r.id, reason }); toast(`درخواست تأمین ${r.request_no} لغو شد.`); setCancelling(false); onDone?.(); }} />
      {assigning ? <AssignSupplierModal title={`تعیین تأمین‌کننده — ${r.request_no}`} onClose={() => setAssigning(false)}
        defaults={{ supplier: r.supplier?.id ?? '', warehouse: r.destination_warehouse?.id ?? '' }}
        onSubmit={async (supplier_id, warehouse_id) => { await w.assign.mutateAsync({ rid: r.id, supplier_id, warehouse_id }); toast(`تأمین‌کننده و انبار درخواست تأمین ${r.request_no} تعیین شد.`); }} /> : null}
    </div>
  );
}

/** مرجع کالای یک ردیف در بدنه‌ی ویرایش: ردیفی که وصل می‌شود کالای تازه را می‌گیرد، بقیه همان کالا یا مشخصات موقت خودشان را. */
function lineRef(l: RequestLine, linkingId: string, itemId: string) {
  if (l.id === linkingId) return { item_id: itemId, temp_name: null };
  if (l.item) return { item_id: l.item.id, temp_name: null };
  return { temp_name: l.temp_name, temp_category_id: l.temp_category_id, temp_unit_id: l.temp_unit_id };
}

/** جدول اقلام (فقط‌خواندنی؛ html «اقلام سفارش») + اتصال ردیف موقت به کالای کاتالوگ */
function LinesTable({ r, canLink }: { r: SupplyRequest; canLink: boolean }) {
  const w = useRequestWrite();
  const toast = useToast();
  const [linking, setLinking] = useState<RequestLine | null>(null);
  const lines = r.lines ?? [];
  const dash = <span className={s.muted}>—</span>;
  const link = async (line: RequestLine, itemId: string) => {
    const body = lines.map((l) => ({
      ...lineRef(l, line.id, itemId),
      quantity: int(l.quantity), unit_price: l.unit_price == null ? null : int(l.unit_price), unit_discount: int(l.unit_discount), unit_tax_duty: int(l.unit_tax_duty), target_days: l.target_days ?? null,
    }));
    try { await w.update.mutateAsync({ rid: r.id, body: { lines: body } }); toast(`ردیف «${line.temp_name}» به کالای کاتالوگ وصل شد.`); } catch (e) { toast(userMessage(e), 'error'); }
  };
  return (
    <div className={s.linesWrap}>
      <table className={s.lines}>
        <thead><tr>
          <th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>واحد اصلی</th><th>واحد فروش</th><th>فی واحد</th><th>تعداد</th><th>مجموع اولیه</th>
          <th>تخفیف واحد</th><th>تخفیف کل</th><th>مالیات واحد</th><th>مالیات کل</th><th>مبلغ کل</th><th>تارگت</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const q = int(l.quantity);
            return (
              <tr key={l.id}>
                <td className={s.muted}>{faNum(i + 1)}</td>
                <td className={s.code}>{l.item ? <span data-latin>{l.item.code}</span> : dash}</td>
                <td className={s.nameCell}>
                  <b>{l.item?.display_name ?? l.temp_name}</b>
                  {l.is_temp ? <Chip tip>موقت</Chip> : null}
                  {l.is_temp && canLink ? <button type="button" className={s.iconBtn} aria-label={`اتصال ${l.temp_name} به کالای کاتالوگ`} data-tip="اتصال به کالای کاتالوگ" onClick={() => setLinking(l)}><IconLink size={15} /></button> : null}
                </td>
                <td>{l.item?.unit_name || dash}</td>
                <td><SaleUnits item={l.item} /></td>
                <td className="tnum">{l.unit_price == null ? dash : faNum(int(l.unit_price))}</td>
                <td className="tnum">{faNum(q)}</td>
                <td className="tnum">{l.unit_price == null ? dash : faNum(q * int(l.unit_price))}</td>
                <td className="tnum">{faNum(int(l.unit_discount))}</td>
                <td className="tnum">{faNum(q * int(l.unit_discount))}</td>
                <td className="tnum">{faNum(int(l.unit_tax_duty))}</td>
                <td className="tnum">{faNum(q * int(l.unit_tax_duty))}</td>
                <td className={`tnum ${s.strong}`}>{l.line_total == null ? dash : faNum(int(l.line_total))}</td>
                <td>{l.target_days ? `${faNum(l.target_days)} روز` : dash}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ItemPickerModal open={!!linking} onClose={() => setLinking(null)} title={`اتصال «${linking?.temp_name ?? ''}» به کالای کاتالوگ`}
        existing={lines.flatMap((l) => (l.item ? [l.item.id] : []))}
        onPick={(rows) => { const first = rows[0]; if (linking && first) void link(linking, first.item_id); }} />
    </div>
  );
}

function Documents({ r, canEdit }: { r: SupplyRequest; canEdit: boolean }) {
  const w = useRequestWrite();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const docs = r.documents ?? [];
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try { await w.upload.mutateAsync({ rid: r.id, file: f, title: f.name }); toast(`مستند «${f.name}» بارگذاری شد.`); } catch (e) { toast(userMessage(e), 'error'); }
    if (ref.current) ref.current.value = '';
  };
  const download = async (docId: string) => {
    try { await openFile(`/supply/requests/${r.id}/documents/${docId}/download`); } catch (e) { toast(userMessage(e), 'error'); }
  };
  const remove = async (docId: string) => {
    try { await w.removeDoc.mutateAsync({ rid: r.id, docId }); toast('مستند حذف شد.'); } catch (e) { toast(userMessage(e), 'error'); }
  };
  return (
    <div className={s.docs}>
      {docs.map((d) => (
        <div key={d.id} className={s.docRow}>
          <b>{d.title || d.file_name}</b>
          <span className={s.muted}>{personName(d.uploaded_by)} · {faDate(d.created_at)}</span>
          <button type="button" className={s.iconBtn} aria-label={`دانلود ${d.title || d.file_name}`} data-tip="دانلود"
            onClick={() => void download(d.id)}><IconDownload size={15} /></button>
          {canEdit ? <button type="button" className={`${s.iconBtn} ${s.iconDanger}`} aria-label={`حذف ${d.title || d.file_name}`} data-tip="حذف مستند"
            onClick={() => void remove(d.id)}><IconTrash size={15} /></button> : null}
        </div>
      ))}
      {!docs.length ? <p className={s.note}>مستندی پیوست نشده است.</p> : null}
      {canEdit && docs.length < MAX_DOCS ? (
        <>
          <Button size="sm" variant="secondary" icon={<IconFileUpload size={15} />} loading={w.upload.isPending} onClick={() => ref.current?.click()}>بارگذاری مستند</Button>
          <input ref={ref} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="فایل مستند" onChange={(e) => void upload(e.target.files?.[0])} />
        </>
      ) : null}
    </div>
  );
}

/** آرای شورا: خلاصه، فهرست آرا و فرم «ثبت رای من» (html «مشاهده آرا» و «ثبت رای») */
export function Votes({ r }: { r: SupplyRequest }) {
  const vs = r.vote_summary;
  const votes = r.votes ?? [];
  const toast = useToast();
  if (!vs && !r.votes) return null;
  const voteDoc = async (voteId: string) => {
    try { await openFile(`/supply/requests/${r.id}/votes/${voteId}/document`); } catch (e) { toast(userMessage(e), 'error'); }
  };
  const stat = (label: string, value: ReactNode, tone?: string) => <div className={s.stat}><b className={tone}>{value}</b><small>{label}</small></div>;
  return (
    <div>
      <SectionTitle>آرای شورای تأمین</SectionTitle>
      {vs ? (
        <div className={s.stats}>
          {stat('موافق', faNum(vs.for_count), s.good)}
          {stat('مخالف', faNum(vs.against_count), s.bad)}
          {stat('منتظر', faNum(Math.max(vs.member_count - vs.for_count - vs.against_count, 0)))}
          {stat('درصد موافق', `${faNum(vs.for_pct)}٪`)}
        </div>
      ) : null}
      {vs ? <p className={s.note}>حد نصاب رأی: {vs.min_votes ? `${faNum(vs.min_votes)} رأی` : 'ندارد'} · شرط قبولی: {vs.min_approval_pct ? `${faNum(vs.min_approval_pct)}٪ موافق` : 'مشورتی'} · اعضای فعال: {faNum(vs.member_count)} نفر</p> : null}
      <div className={s.voteList}>
        {votes.map((v) => (
          <div key={v.id} className={s.voteRow}>
            <div><b>{personName(v.member)}</b><small className={s.muted}>{v.member_title}</small></div>
            <Badge tone={toneOf(VOTE, v.vote)}>{labelOf(VOTE, v.vote, v.vote_display)}</Badge>
            <span className={s.voteReason}>{v.reason || <span className={s.muted}>—</span>}</span>
            {v.has_document ? <button type="button" className={s.iconBtn} aria-label={`پیوست رأی ${personName(v.member)}`} data-tip="پیوست رأی"
              onClick={() => void voteDoc(v.id)}><IconDownload size={15} /></button> : null}
            <span className={s.muted}>{faDateTime(v.voted_at)}</span>
          </div>
        ))}
        {!votes.length ? <p className={s.note}>هنوز رأیی ثبت نشده است.</p> : null}
      </div>
      <MyVote r={r} />
    </div>
  );
}

function MyVote({ r }: { r: SupplyRequest }) {
  const vs = r.vote_summary;
  const w = useRequestWrite();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [vote, setVote] = useState<'FOR' | 'AGAINST'>(vs?.my_vote === 'AGAINST' ? 'AGAINST' : 'FOR');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deposit, setDeposit] = useState('');
  const customer = isCustomerRequest(r);
  if (r.lifecycle === 'SUBMITTED') return <p className={s.closedNote}>رأی‌گیری بعد از تأیید مدیر سفارشات شروع می‌شود.</p>;
  if (r.lifecycle !== 'VOTING') return <p className={s.closedNote}>رأی‌گیری این درخواست بسته شده است.</p>;
  if (!vs?.can_vote) return <p className={s.closedNote}>شما عضو فعال شورای تأمین نیستید و امکان رأی دادن ندارید.</p>;
  const submit = async () => {
    if (vote === 'AGAINST' && !reason.trim()) { setErr('برای رأی مخالف، توضیح الزامی است.'); return; }
    // درخواست مشتری: رأی موافق بدون مبلغ پیشنهادی بیعانه پذیرفته نمی‌شود (افشین ۱۳ آبان ۱۴۰۵)
    if (customer && vote === 'FOR' && int(deposit) < 1) { setErr('برای رأی موافق، مبلغ پیشنهادی بیعانه را وارد کنید.'); return; }
    setErr(null);
    try {
      await w.vote.mutateAsync({ rid: r.id, vote, reason: reason.trim(), document: file, deposit: customer && vote === 'FOR' ? int(deposit) : null });
      toast(vs.my_vote ? 'رأی شما تغییر کرد.' : 'رأی شما ثبت شد.'); setReason(''); setFile(null);
    } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <div className={s.myVote}>
      <div className={s.myVoteHead}><b>ثبت رأی</b>{vs.my_vote ? <span className={s.muted}>رأی فعلی شما: {labelOf(VOTE, vs.my_vote)}</span> : null}</div>
      <Segmented value={vote} onChange={setVote} options={[{ value: 'FOR', label: 'موافق' }, { value: 'AGAINST', label: 'مخالف' }]} />
      {customer && vote === 'FOR' ? <Input label="مبلغ پیشنهادی بیعانه (ریال)" required value={groupMoney(deposit)} format={groupMoney} onChange={(e) => { setDeposit(moneyDigits(e.target.value)); setErr(null); }} inputMode="numeric" dir="ltr" /> : null}
      <Textarea label="دلایل و مستندات رأی" rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder="برای رأی مخالف الزامی است…" />
      <div className={s.myVoteFoot}>
        <Button size="sm" variant="ghost" icon={<IconFileUpload size={15} />} onClick={() => ref.current?.click()}>{file ? file.name : 'پیوست (اختیاری)'}</Button>
        {file ? <button type="button" className={s.iconBtn} aria-label="برداشتن پیوست" data-tip="برداشتن پیوست" onClick={() => setFile(null)}><IconX size={14} /></button> : null}
        <input ref={ref} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="پیوست رأی" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button onClick={submit} loading={w.vote.isPending}>{vs.my_vote ? 'تغییر رأی من' : 'ثبت رأی من'}</Button>
      </div>
      {err ? <Alert>{err}</Alert> : null}
    </div>
  );
}

/**
 * کارهای هر مرحله‌ی چرخه (S-24؛ تصمیم افشین ۱۳ آبان ۱۴۰۵). هر دکمه فقط در مرحله‌ی خودش و با مجوز خودش دیده می‌شود؛
 * تصمیم نهایی همیشه با بک‌اند است.
 * - «ثبت شد» (فقط مشتری): تأیید یا رد مدیر سفارشات (مجوز orders.approve).
 * - «رأی‌گیری»: تصمیم مدیر تأمین (مجوز approve). «تأیید» با شرط قبولی رأی و «رد» با حد نصاب. درخواست مشتری در تأیید مبلغ
 *   قطعی بیعانه (الزامی) و در صورت نیاز موعد تحویل تازه می‌گیرد.
 * - «در انتظار تأیید مالی واریز» (فقط مشتری): تأیید یا رد مالی (مجوز finance.approve). رد به رأی‌گیری برمی‌گردد.
 * - «در انتظار تعیین تأمین‌کننده»: «عدم امکان تأمین» با دلیل (مجوز approve).
 * - «در انتظار تطبیق»: تطبیق درخواست، دریافت انبار و فاکتور کاغذی تأمین‌کننده (مجوز approve). مغایرت یادداشت الزامی دارد.
 * - «در انتظار استرداد بیعانه»: ثبت استرداد توسط مالی (مجوز finance.approve).
 */
export function Decisions({ r }: { r: SupplyRequest }) {
  const can = usePerm();
  const w = useRequestWrite();
  const toast = useToast();
  type M = 'orders-ok' | 'orders-no' | 'approve' | 'reject' | 'fin-ok' | 'fin-no' | 'unsup' | 'rec-ok' | 'rec-no' | 'refund' | null;
  const [modal, setModal] = useState<M>(null);
  const vs = r.vote_summary;
  const customer = isCustomerRequest(r);
  const st = r.lifecycle;
  const ordersStage = st === 'SUBMITTED' && can('supply.supply_requests.orders.approve');
  const supplyStage = st === 'VOTING' && can('supply.supply_requests.approve');
  const financeStage = st === 'AWAITING_DEPOSIT_CHECK' && can('supply.supply_requests.finance.approve');
  const unsupStage = st === 'AWAITING_SUPPLIER' && can('supply.supply_requests.approve');
  const recStage = st === 'AWAITING_RECONCILIATION' && can('supply.supply_requests.approve');
  const refundStage = st === 'AWAITING_REFUND' && can('supply.supply_requests.finance.approve');
  if (!ordersStage && !supplyStage && !financeStage && !unsupStage && !recStage && !refundStage) return null;
  const hasTemp = (r.lines ?? []).some((l) => l.is_temp);
  const voted = (vs?.for_count ?? 0) + (vs?.against_count ?? 0);
  const approveTip = !vs?.meets_quorum
    ? `حد نصاب رأی نرسیده است (${faNum(voted)} از ${faNum(vs?.min_votes ?? 0)} رأی).`
    : `رأی موافق ${faNum(vs.for_pct)}٪ است و شرط قبولی ${faNum(vs.min_approval_pct)}٪ است.`;
  const rejectTip = `حد نصاب رأی نرسیده است (${faNum(voted)} از ${faNum(vs?.min_votes ?? 0)} رأی).`;
  const run = async (fn: () => Promise<unknown>, msg: string) => { await fn(); toast(msg); setModal(null); };
  const no = r.request_no;
  const block = (title: string, note: string, buttons: ReactNode) => (
    <>
      <SectionTitle>{title}</SectionTitle>
      <p className={s.note}>{note}</p>
      <div className={s.decisionBtns}>{buttons}</div>
    </>
  );
  return (
    <div className={s.decision}>
      {ordersStage ? block('بررسی مدیر سفارشات', 'درخواست مشتری پیش از رأی‌گیری باید تأیید مدیر سفارشات را بگیرد. رد، درخواست را می‌بندد و دلیل الزامی است.', <>
        <Button onClick={() => setModal('orders-ok')}>تأیید و ارسال به رأی‌گیری</Button>
        <Button variant="danger" onClick={() => setModal('orders-no')}>رد</Button>
      </>) : null}
      {supplyStage ? (
        <>
          {block('تصمیم مدیر تأمین', customer
            ? '«تأیید» شرط قبولی رأی شورا را لازم دارد و مبلغ قطعی بیعانه را تعیین می‌کند؛ بعد از آن درخواست منتظر پذیرش و واریز بیعانه‌ی مشتری می‌ماند. «رد» فقط حد نصاب را لازم دارد.'
            : '«تأیید» شرط قبولی رأی شورا را لازم دارد؛ بعد از آن درخواست برای تعیین تأمین‌کننده می‌رود. «رد» فقط حد نصاب را لازم دارد.', <>
            <span data-tip={vs?.meets_approval ? '' : approveTip}><Button disabled={!vs?.meets_approval} onClick={() => setModal('approve')}>تأیید</Button></span>
            <span data-tip={vs?.meets_quorum ? '' : rejectTip}><Button variant="danger" disabled={!vs?.meets_quorum} onClick={() => setModal('reject')}>رد</Button></span>
          </>)}
          {hasTemp ? <Alert>ردیف‌های موقت باید پیش از تأیید به کالای کاتالوگ وصل شوند (دکمه‌ی اتصال کنار ردیف).</Alert> : null}
        </>
      ) : null}
      {financeStage ? block('تأیید مالی واریز بیعانه', 'مالی واریز مشتری را بررسی می‌کند. تأیید ⇐ تعیین تأمین‌کننده؛ رد ⇐ برگشت به تصمیم مدیر تأمین (ممکن است بیعانه یا موعد تحویل عوض شود).', <>
        <Button onClick={() => setModal('fin-ok')}>تأیید واریز</Button>
        <Button variant="danger" onClick={() => setModal('fin-no')}>واریز تأیید نشد</Button>
      </>) : null}
      {unsupStage ? block('عدم امکان تأمین', customer ? 'اگر تأمین این درخواست ممکن نیست، درخواست برای استرداد بیعانه به مالی می‌رود.' : 'اگر تأمین این درخواست ممکن نیست، درخواست بسته می‌شود.', <>
        <Button variant="danger" onClick={() => setModal('unsup')}>عدم امکان تأمین</Button>
      </>) : null}
      {recStage ? block('تطبیق و تأیید مدیر تأمین', 'تعداد درخواستی، تعداد ورودی انبار و فاکتور کاغذی تأمین‌کننده را مقایسه کنید. تأیید ⇐ ثبت فاکتور خرید. مغایرت ⇐ درخواست در همین مرحله می‌ماند تا با تأمین‌کننده حل شود.', <>
        <Button onClick={() => setModal('rec-ok')}>تطبیق درست است</Button>
        <Button variant="danger" onClick={() => setModal('rec-no')}>ثبت مغایرت</Button>
      </>) : null}
      {refundStage ? block('استرداد بیعانه', 'بعد از برگرداندن پول به مشتری در خزانه‌داری، استرداد را این‌جا ثبت کنید تا درخواست بسته شود.', <>
        <Button onClick={() => setModal('refund')}>ثبت استرداد بیعانه</Button>
      </>) : null}

      <ReasonModal open={modal === 'orders-ok'} onClose={() => setModal(null)} title={`تأیید مدیر سفارشات — ${no}`} confirmText="تأیید" minLength={0} label="توضیح (اختیاری)" busy={w.orders.isPending}
        onConfirm={(reason) => run(() => w.orders.mutateAsync({ rid: r.id, approved: true, reason }), `درخواست تأمین ${no} برای رأی‌گیری فرستاده شد.`)} />
      <ReasonModal open={modal === 'orders-no'} onClose={() => setModal(null)} title={`رد مدیر سفارشات — ${no}`} confirmText="رد درخواست" danger label="دلیل رد" busy={w.orders.isPending}
        onConfirm={(reason) => run(() => w.orders.mutateAsync({ rid: r.id, approved: false, reason }), `درخواست تأمین ${no} رد شد.`)} />
      {modal === 'approve' && customer ? <CustomerApproveModal r={r} onClose={() => setModal(null)} /> : null}
      <ReasonModal open={modal === 'approve' && !customer} onClose={() => setModal(null)} title={`تأیید مدیر تأمین — ${no}`} confirmText="تأیید" minLength={0} label="توضیح (اختیاری)" busy={w.decide.isPending}
        intro="درخواست تأمین تأیید می‌شود و برای تعیین تأمین‌کننده می‌رود."
        onConfirm={(reason) => run(() => w.decide.mutateAsync({ rid: r.id, approved: true, reason }), `درخواست تأمین ${no} تأیید شد.`)} />
      <ReasonModal open={modal === 'reject'} onClose={() => setModal(null)} title={`رد درخواست تأمین — ${no}`} confirmText="رد درخواست تأمین" danger label="دلیل رد" busy={w.decide.isPending}
        intro="درخواست تأمین رد و بسته می‌شود."
        onConfirm={(reason) => run(() => w.decide.mutateAsync({ rid: r.id, approved: false, reason }), `درخواست تأمین ${no} رد شد.`)} />
      <ReasonModal open={modal === 'fin-ok'} onClose={() => setModal(null)} title={`تأیید واریز بیعانه — ${no}`} confirmText="تأیید واریز" minLength={0} label="توضیح (اختیاری)" busy={w.finance.isPending}
        onConfirm={(reason) => run(() => w.finance.mutateAsync({ rid: r.id, approved: true, reason }), `واریز بیعانه‌ی ${no} تأیید شد.`)} />
      <ReasonModal open={modal === 'fin-no'} onClose={() => setModal(null)} title={`رد واریز بیعانه — ${no}`} confirmText="رد واریز" danger label="دلیل رد" busy={w.finance.isPending}
        intro="اطلاعات واریز پاک می‌شود و درخواست برای تصمیم تازه‌ی مدیر تأمین برمی‌گردد."
        onConfirm={(reason) => run(() => w.finance.mutateAsync({ rid: r.id, approved: false, reason }), `واریز بیعانه‌ی ${no} رد شد.`)} />
      <ReasonModal open={modal === 'unsup'} onClose={() => setModal(null)} title={`عدم امکان تأمین — ${no}`} confirmText="ثبت عدم امکان تأمین" danger label="دلیل" busy={w.unsuppliable.isPending}
        intro={customer ? 'درخواست برای استرداد بیعانه به مالی می‌رود.' : 'درخواست بسته می‌شود.'}
        onConfirm={(reason) => run(() => w.unsuppliable.mutateAsync({ rid: r.id, reason }), `عدم امکان تأمین ${no} ثبت شد.`)} />
      <ReasonModal open={modal === 'rec-ok'} onClose={() => setModal(null)} title={`تطبیق درست — ${no}`} confirmText="تأیید تطبیق" minLength={0} label="یادداشت (اختیاری)" busy={w.reconcile.isPending}
        intro="فاکتور تأمین‌کننده با امضای تأیید برای مالی فرستاده می‌شود و درخواست به «در انتظار ثبت فاکتور خرید» می‌رود."
        onConfirm={(note) => run(() => w.reconcile.mutateAsync({ rid: r.id, approved: true, note }), `تطبیق ${no} تأیید شد.`)} />
      <ReasonModal open={modal === 'rec-no'} onClose={() => setModal(null)} title={`ثبت مغایرت — ${no}`} confirmText="ثبت مغایرت" danger label="شرح مغایرت" busy={w.reconcile.isPending}
        onConfirm={(note) => run(() => w.reconcile.mutateAsync({ rid: r.id, approved: false, note }), `مغایرت ${no} ثبت شد.`)} />
      <ReasonModal open={modal === 'refund'} onClose={() => setModal(null)} title={`استرداد بیعانه — ${no}`} confirmText="ثبت استرداد" minLength={0} label="یادداشت (اختیاری)" busy={w.refund.isPending}
        onConfirm={(note) => run(() => w.refund.mutateAsync({ rid: r.id, note }), `استرداد بیعانه‌ی ${no} ثبت شد.`)} />
    </div>
  );
}

/** تأیید مدیر تأمین روی درخواست مشتری: مبلغ قطعی بیعانه (الزامی، پیش‌فرض میانگین پیشنهاد آرا) و موعد تحویل تازه (اختیاری) */
function CustomerApproveModal({ r, onClose }: { r: SupplyRequest; onClose: () => void }) {
  const w = useRequestWrite();
  const toast = useToast();
  const vs = r.vote_summary;
  const [amount, setAmount] = useState(vs?.deposit_avg ? moneyDigits(vs.deposit_avg) : '');
  const [due, setDue] = useState(r.delivery_due ? gregorianToJalaliText(r.delivery_due) : '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    const amt = int(moneyDigits(amount));
    if (amt < 1) { setErr('مبلغ قطعی بیعانه را وارد کنید.'); return; }
    const gdue = due.trim() ? jalaliTextToGregorian(due) : null;
    if (due.trim() && !gdue) { setErr('موعد تحویل معتبر نیست.'); return; }
    setErr(null);
    try {
      await w.decide.mutateAsync({ rid: r.id, approved: true, reason: reason.trim(), deposit_amount: amt, ...(gdue && gdue !== r.delivery_due ? { delivery_due: gdue } : {}) });
      toast(`درخواست تأمین ${r.request_no} تأیید شد و منتظر پذیرش و واریز بیعانه‌ی مشتری است.`); onClose();
    } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} width={ASSIGN_WIDTH} title={`تأیید مدیر تأمین — ${r.request_no}`}
      footer={<><Button onClick={submit} loading={w.decide.isPending}>تأیید</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.stack}>
        {vs?.deposit_avg ? <p className={s.note}>بیعانه‌ی پیشنهادی آرای موافق: کمترین {faNum(int(vs.deposit_min))}، میانگین {faNum(int(vs.deposit_avg))}، بیشترین {faNum(int(vs.deposit_max))} ریال.</p> : null}
        <Input label="مبلغ قطعی بیعانه (ریال)" required value={groupMoney(amount)} format={groupMoney} onChange={(e) => { setAmount(moneyDigits(e.target.value)); setErr(null); }} inputMode="numeric" dir="ltr" />
        <JalaliDateInput label="موعد تحویل" value={due} onChange={(e) => { setDue(e.target.value); setErr(null); }} hint="در صورت نیاز تغییر دهید؛ مشتری با واریز بیعانه آن را می‌پذیرد" dir="ltr" maxYear={1500} />
        <Textarea label="توضیح (اختیاری)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {err ? <Alert>{err}</Alert> : null}
      </div>
    </Modal>
  );
}

/** متن بیعانه: کارمند ⇐ «ندارد»؛ مشتری ⇐ مبلغ قطعی یا «تعیین نشده» */
export function depositText(r: SupplyRequest): ReactNode {
  if (!isCustomerRequest(r)) return <span className={s.muted}>ندارد (درخواست کارمند)</span>;
  if (r.deposit_amount == null) return <span className={s.muted}>هنوز تعیین نشده</span>;
  return <><span className="tnum">{faNum(int(r.deposit_amount))}</span> <Rial /></>;
}

export function Approvals({ r }: { r: SupplyRequest }) {
  const rows = r.approvals ?? [];
  if (!rows.length) return null;
  return (
    <div>
      <SectionTitle>سابقه‌ی تصمیم‌ها</SectionTitle>
      {rows.map((a) => (
        <div key={a.id} className={s.voteRow}>
          <div><b>{a.stage_display}</b><small className={s.muted}>{personName(a.approver)}</small></div>
          <Badge tone={a.decision === 'APPROVED' ? 'success' : 'danger'}>{a.decision_display}</Badge>
          <span className={s.voteReason}>{a.reason || <span className={s.muted}>—</span>}</span>
          <span className={s.muted}>{faDateTime(a.decided_at)}</span>
        </div>
      ))}
    </div>
  );
}

/** تعیین تأمین‌کننده و انبار مقصد (html «تعیین تامین‌کننده»): تأمین‌کنندگان فعال + انبارهای فعال در دسترس کاربر */
export function AssignSupplierModal({ title, defaults, onSubmit, onClose }: {
  title: string; defaults?: { supplier: string; warehouse: string }; onSubmit: (supplierId: string, warehouseId: string) => Promise<unknown>; onClose: () => void;
}) {
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const [sup, setSup] = useState(defaults?.supplier ?? '');
  const [wh, setWh] = useState(defaults?.warehouse ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!sup || !wh) { setErr('تأمین‌کننده و انبار مقصد را انتخاب کنید.'); return; }
    setBusy(true); setErr(null);
    try { await onSubmit(sup, wh); onClose(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={title} width={ASSIGN_WIDTH}
      footer={<><Button onClick={go} loading={busy}>تأیید</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={s.stack}>
        <Select label="تأمین‌کننده" required value={sup} onChange={(e) => setSup(e.target.value)} placeholder={sups.isLoading ? 'در حال دریافت…' : 'انتخاب تأمین‌کننده…'}
          options={(sups.data ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }))} hint="فقط تأمین‌کنندگان فعال" />
        <Select label="انبار مقصد" required value={wh} onChange={(e) => setWh(e.target.value)} placeholder={whs.isLoading ? 'در حال دریافت…' : 'انتخاب انبار مقصد…'}
          options={(whs.data ?? []).filter((x) => x.is_active).map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }))} />
      </div>
    </Modal>
  );
}
