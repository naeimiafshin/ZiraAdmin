import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { IconArrowsExchange, IconCircleCheck, IconDownload, IconLockOpen, IconPaperclip, IconSend, IconUserCheck, IconUserX, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime, faNum, fullName } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useDebounced } from '@/shared/lib/useDebounced';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Select, Textarea } from '@/shared/ui/form';
import { Dropdown } from '@/shared/ui/Dropdown';
import { Badge, Card, Empty, ErrorBox, KeyValue, Modal, PageHead, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllStaff } from '@/features/users/api';
import { ReasonModal } from '@/features/customers/components';
import {
  checkFiles, downloadAttachment, fileSize, supportError, useAssignees, useDepartments, useMessages, useReply, useTicket, useTicketAction,
  type Assignee, type Attachment, type TicketDetail,
} from './api';
import { DueCell, PriorityBadge, StatusBadge, relTime } from './components';
import { CHANNEL, CONTACT_ROLE, DIRECTION, PRIORITY, PRIORITY_ORDER, SENDER } from './labels';
import s from './support.module.css';

/**
 * جزئیات و گفت‌وگوی تیکت (GET /support/tickets/{id} + پیام‌ها). عملیات: پاسخ با پیوست، اولویت، ارجاع،
 * انتقال دپارتمان، بستن و بازگشایی (PATCH؛ پاسخ هر عملیات جزئیات تازه است). به‌روزرسانی خودکار هر ۱۵ ثانیه (بک‌اند SSE ندارد).
 */
export default function TicketDetailPage() {
  const { id = '' } = useParams();
  const can = usePerm();
  const toast = useToast();
  const back = useBack('/support/tickets');
  const t = useTicket(id);
  const msgs = useMessages(id, can('support.tickets.messages.read'));
  const action = useTicketAction(id);
  const [modal, setModal] = useState<null | 'close' | 'reopen' | 'transfer' | 'assign'>(null);
  const staff = useAllStaff(can('identity.users.list'));
  const branches = useBranchOptions();

  if (t.isLoading) return <><PageHead back={back} title="جزئیات تیکت" /><Card><SkeletonRows rows={6} /></Card></>;
  if (t.error || !t.data) return <><PageHead back={back} title="جزئیات تیکت" /><Card><ErrorBox error={t.error} onRetry={() => t.refetch()} /></Card></>;
  const d = t.data;
  const open = d.status !== 'CLOSED';
  const canUpdate = can('support.tickets.update');
  const who = (uid?: string | null) => { if (!uid) return null; const p = staff.data?.find((x) => x.id === uid); return p ? fullName(p) : 'ارجاع‌شده'; };
  const branchName = d.branch_id ? branches.data?.find((b) => b.id === d.branch_id)?.name ?? 'شعبه‌ی ثبت‌شده' : 'بدون شعبه';
  const run = async (path: Parameters<typeof action.mutateAsync>[0]['path'], body: unknown, ok: string) => {
    try { await action.mutateAsync({ path, body }); toast(ok); setModal(null); } catch (e) { toast(supportError(e), 'error'); throw e; }
  };

  return (
    <>
      <PageHead back={back} title={d.subject}
        sub={<span className={s.flags}><span className="ltr" data-latin="">{d.tracking_code}</span><StatusBadge status={d.status} /><PriorityBadge priority={d.priority} /></span>}
        actions={canUpdate ? (open
          ? <Button variant="danger" icon={<IconCircleCheck size={17} />} onClick={() => setModal('close')}>بستن تیکت</Button>
          : <Button variant="secondary" icon={<IconLockOpen size={17} />} onClick={() => setModal('reopen')}>بازگشایی تیکت</Button>) : null} />

      <div className={s.layout}>
        <Thread ticket={d} msgs={msgs} />
        <div className={s.side}>
          <Card>
            <div className={s.cardTitle}>مشخصات تیکت</div>
            <div className={s.kv}>
              <KeyValue label="وضعیت"><StatusBadge status={d.status} /></KeyValue>
              <KeyValue label={`اولویت (مهلت ${PRIORITY[d.priority]?.sla ?? ''})`}>
                {open && canUpdate ? (
                  <Dropdown aria-label="اولویت" value={d.priority} disabled={action.isPending}
                    onChange={(e) => { const v = e.target.value; if (v !== d.priority) run('', { priority: v }, 'اولویت تغییر کرد؛ مهلت پاسخ دوباره محاسبه شد.').catch(() => {}); }}
                    options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY[p]!.label }))} />
                ) : <PriorityBadge priority={d.priority} />}
              </KeyValue>
              <KeyValue label="دپارتمان">
                <span className={s.inlineEdit}>{d.department_name ?? <span className={s.muted}>تعیین‌نشده</span>}
                  {open && canUpdate ? <Button size="sm" variant="ghost" icon={<IconArrowsExchange size={15} />} aria-label="انتقال به دپارتمان دیگر" onClick={() => setModal('transfer')}>انتقال</Button> : null}</span>
              </KeyValue>
              <KeyValue label="کارشناس">
                <span className={s.inlineEdit}>{d.assigned_to_id ? ((d as TicketDetail & { assigned_to_name?: string | null }).assigned_to_name ?? who(d.assigned_to_id)) : <span className={s.muted}>بدون کارشناس</span>}</span>
              </KeyValue>
              <KeyValue label="مهلت پاسخ"><DueCell due={d.due_at} breached={d.is_sla_breached} /></KeyValue>
              <KeyValue label="زمان اولین پاسخ">{d.first_response_minutes === null || d.first_response_minutes === undefined ? '—' : `${faNum(d.first_response_minutes)} دقیقه`}</KeyValue>
              <KeyValue label="کانال">{CHANNEL[d.channel] ?? d.channel}</KeyValue>
              <KeyValue label="جهت">{DIRECTION[d.direction] ?? d.direction}</KeyValue>
              <KeyValue label="شعبه">{branchName}</KeyValue>
              <KeyValue label="تاریخ ایجاد">{faDateTime(d.created_at)}</KeyValue>
              <KeyValue label="آخرین پاسخ پشتیبانی">{faDateTime(d.replied_at)}</KeyValue>
              <KeyValue label="تاریخ بستن">{faDateTime(d.closed_at)}</KeyValue>
            </div>
            {open && canUpdate ? (
              <div className={s.actions} style={{ marginTop: 16 }}>
                <Button size="sm" variant="secondary" icon={<IconUserCheck size={15} />} onClick={() => setModal('assign')} disabled={!d.department_id}
                  data-tip={d.department_id ? undefined : 'تیکت بدون دپارتمان قابل ارجاع نیست'}>{d.assigned_to_id ? 'تغییر کارشناس' : 'ارجاع به کارشناس'}</Button>
                {d.assigned_to_id ? <Button size="sm" variant="ghost" icon={<IconUserX size={15} />} loading={action.isPending}
                  onClick={() => run('/assign', { assignee_id: null }, 'ارجاع برداشته شد.').catch(() => {})}>لغو ارجاع</Button> : null}
              </div>
            ) : null}
          </Card>
          <Card>
            <div className={s.cardTitle}>مخاطب</div>
            <div className={`${s.kv} ${s.kv1}`}>
              <KeyValue label="نام">{d.contact_name || '—'} <Badge tone="neutral">{CONTACT_ROLE[d.contact_role] ?? d.contact_role}</Badge></KeyValue>
              <KeyValue label="تلفن" ltr>{d.contact_phone || '—'}</KeyValue>
              <KeyValue label="ایمیل" ltr>{d.contact_email || '—'}</KeyValue>
            </div>
            {d.contact_id && can('customers.profiles.read') ? <div style={{ marginTop: 14 }}><Link to={`/customers/profiles/${d.contact_id}`}><Button size="sm" variant="secondary">پرونده‌ی مشتری</Button></Link></div> : null}
          </Card>
          {d.resolution || d.last_reopen_reason ? (
            <Card>
              {d.resolution ? <><div className={s.cardTitle}>نتیجه‌ی رسیدگی</div><div className={s.note}>{d.resolution}</div></> : null}
              {d.last_reopen_reason ? <><div className={s.cardTitle} style={{ marginTop: d.resolution ? 16 : 0 }}>دلیل آخرین بازگشایی</div><div className={s.note}>{d.last_reopen_reason}</div></> : null}
            </Card>
          ) : null}
        </div>
      </div>

      <ReasonModal open={modal === 'close'} onClose={() => setModal(null)} title="بستن تیکت" label="نتیجه‌ی رسیدگی" confirmText="بستن تیکت" danger busy={action.isPending}
        intro="پس از بستن، پیام تازه‌ای روی تیکت ثبت نمی‌شود تا دوباره بازگشایی شود. نتیجه‌ی رسیدگی برای مخاطب هم قابل مشاهده است."
        onConfirm={(r) => run('/close', { resolution: r.slice(0, 2000) }, 'تیکت بسته شد.')} />
      <ReasonModal open={modal === 'reopen'} onClose={() => setModal(null)} title="بازگشایی تیکت" label="دلیل بازگشایی" confirmText="بازگشایی" busy={action.isPending}
        intro="تیکت به وضعیت «در انتظار پاسخ» برمی‌گردد و نوبت تازه‌ی مهلت پاسخ شروع می‌شود."
        onConfirm={(r) => run('/reopen', { reason: r.slice(0, 2000) }, 'تیکت بازگشایی شد.')} />
      {modal === 'transfer' ? <TransferModal ticket={d} busy={action.isPending} onClose={() => setModal(null)}
        onConfirm={(department_id, reason) => run('/department', { department_id, reason }, 'تیکت به دپارتمان تازه منتقل شد.')} /> : null}
      {modal === 'assign' ? <AssignModal ticket={d} busy={action.isPending} onClose={() => setModal(null)}
        onPick={(a) => run('/assign', { assignee_id: a.id }, `تیکت به «${a.display_name}» ارجاع شد.`).catch(() => {})} /> : null}
    </>
  );
}

function Thread({ ticket, msgs }: { ticket: TicketDetail; msgs: ReturnType<typeof useMessages> }) {
  const can = usePerm();
  const toast = useToast();
  const reply = useReply(ticket.id);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const count = msgs.data?.length ?? 0;
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [count]);
  const open = ticket.status !== 'CLOSED';
  const canReply = can('support.tickets.messages.create');

  const send = async () => {
    const text = body.trim();
    if (!text) { setErr('متن پاسخ را بنویسید.'); return; }
    const fe = checkFiles(files); if (fe) { setErr(fe); return; }
    setErr(null);
    try { await reply.mutateAsync({ body: text, files }); setBody(''); setFiles([]); toast('پاسخ ارسال شد.'); } catch (e) { setErr(supportError(e)); }
  };
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    const fe = checkFiles(next);
    setErr(fe);
    if (!fe) setFiles(next);
    if (fileRef.current) fileRef.current.value = '';
  };
  const dl = async (a: Attachment) => { try { await downloadAttachment(a); } catch (e) { toast(supportError(e), 'error'); } };

  return (
    <Card className={s.thread} pad={false}>
      <div className={s.threadHead}>
        <span className={s.threadTitle}>گفت‌وگو</span>
        <span className={s.muted}>{msgs.data ? `${faNum(count)} پیام` : ''}</span>
      </div>
      <div className={s.messages} ref={box}>
        {!can('support.tickets.messages.read') ? <Empty title="مشاهده‌ی پیام‌ها برای حساب شما مجاز نیست" />
          : msgs.isLoading ? <SkeletonRows rows={4} height={70} />
          : msgs.error ? <ErrorBox error={msgs.error} onRetry={() => msgs.refetch()} />
          : count === 0 ? <Empty title="پیامی ثبت نشده است" />
          : msgs.data!.map((m) => (
            <div key={m.id} className={`${s.row} ${m.sender_role === 'STAFF' ? s.rowStaff : ''}`}>
              <div className={s.bubble}>
                <div className={s.sender}>{m.sender_name}<Badge tone={m.sender_role === 'STAFF' ? 'brand' : 'neutral'}>{SENDER[m.sender_role] ?? m.sender_role}</Badge></div>
                <div className={s.body}>{m.body}</div>
                {m.attachments.length ? (
                  <div className={s.atts}>
                    {m.attachments.map((a) => (
                      <button key={a.id} type="button" className={s.att} onClick={() => dl(a)} aria-label={`دانلود ${a.original_name}`} data-tip={`دانلود ${a.original_name}`}>
                        <IconDownload size={14} /><span data-latin="">{a.original_name}</span><small>{fileSize(a.size_bytes)}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={s.meta} data-tip={faDateTime(m.sent_at)}>{relTime(m.sent_at)}</div>
              </div>
            </div>
          ))}
      </div>
      {!open ? <div className={s.readonly}>این تیکت بسته است؛ برای ارسال پیام تازه، تیکت را بازگشایی کنید.</div>
        : !canReply ? <div className={s.readonly}>ارسال پاسخ برای حساب شما مجاز نیست.</div> : (
          <div className={s.composer}>
            {err ? <Alert>{err}</Alert> : null}
            {files.length ? (
              <div className={s.files}>
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className={s.fileChip}><span data-latin="">{f.name}</span><small className={s.muted}>{fileSize(f.size)}</small>
                    <button type="button" aria-label={`حذف ${f.name}`} data-tip="حذف فایل" onClick={() => setFiles(files.filter((_, j) => j !== i))}><IconX size={13} /></button></span>
                ))}
              </div>
            ) : null}
            <div className={s.composerRow}>
              <textarea className={s.input} value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={10000} aria-label="متن پاسخ" placeholder="پاسخ خود را بنویسید… (Ctrl+Enter برای ارسال)"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
              <input ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.xlsx" className={s.hidden} onChange={(e) => addFiles(e.target.files)} aria-label="انتخاب فایل" />
              <Button variant="secondary" icon={<IconPaperclip size={17} />} aria-label="افزودن فایل" data-tip="افزودن فایل (حداکثر ۳ فایل، هر کدام ۳ مگابایت)" onClick={() => fileRef.current?.click()} disabled={files.length >= 3} />
              <Button icon={<IconSend size={17} />} loading={reply.isPending} onClick={send}>ارسال پاسخ</Button>
            </div>
          </div>
        )}
    </Card>
  );
}

function TransferModal({ ticket, busy, onClose, onConfirm }: { ticket: TicketDetail; busy: boolean; onClose: () => void; onConfirm: (dep: string, reason: string) => Promise<unknown> }) {
  const deps = useDepartments();
  const [dep, setDep] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!dep) { setErr('دپارتمان مقصد را انتخاب کنید.'); return; }
    if (!reason.trim()) { setErr('دلیل انتقال الزامی است.'); return; }
    try { await onConfirm(dep, reason.trim()); } catch (e) { setErr(supportError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="انتقال به دپارتمان دیگر" width={540}
      footer={<><Button onClick={submit} loading={busy}>انتقال</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Select label="دپارتمان مقصد" required value={dep} onChange={(e) => setDep(e.target.value)} placeholder="انتخاب کنید"
          options={(deps.data ?? []).filter((x) => x.id !== ticket.department_id).map((x) => ({ value: x.id, label: x.name }))} />
        <Textarea label="دلیل انتقال" required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} hint="حداکثر ۵۰۰ نویسه. اگر کارشناس فعلی در دپارتمان تازه شرایط نداشته باشد، ارجاع برداشته می‌شود." />
        {err ? <Alert>{err}</Alert> : null}
      </div>
    </Modal>
  );
}

/** جدول انتخابی کارشناس (GET /departments/{id}/assignees؛ فقط کارشناسان واجد شرایط دپارتمان و شعبه‌ی تیکت) */
function AssignModal({ ticket, busy, onClose, onPick }: { ticket: TicketDetail; busy: boolean; onClose: () => void; onPick: (a: Assignee) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300);
  const list = useAssignees(ticket.department_id, ticket.branch_id, dq, page);
  const cols: Column<Assignee>[] = [
    { key: 'name', header: 'نام کارشناس', render: (a) => <b>{a.display_name}</b> },
    { key: 'cur', header: 'وضعیت', render: (a) => (a.id === ticket.assigned_to_id ? <Badge tone="success">کارشناس فعلی</Badge> : <span className={s.muted}>—</span>) },
    { key: 'pick', header: '', render: (a) => <Button size="sm" variant="secondary" disabled={busy || a.id === ticket.assigned_to_id} onClick={(e) => { e.stopPropagation(); onPick(a); }}>ارجاع</Button> },
  ];
  return (
    <Modal open onClose={onClose} title={`ارجاع به کارشناس — ${ticket.department_name ?? ''}`} width={620}>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام کارشناس" count={list.data ? `${faNum(list.data.total)} کارشناس` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(a) => a.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        isSelected={(a) => a.id === ticket.assigned_to_id} onRowClick={(a) => { if (a.id !== ticket.assigned_to_id && !busy) onPick(a); }}
        empty={<Empty title="کارشناس واجد شرایطی پیدا نشد" text="کارشناس باید فعال، عضو این دپارتمان، دارای مجوز پاسخ به تیکت و دسترسی به شعبه‌ی تیکت باشد." />} />
      {list.data && list.data.total > 8 ? <Pagination page={page} pageSize={8} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}
