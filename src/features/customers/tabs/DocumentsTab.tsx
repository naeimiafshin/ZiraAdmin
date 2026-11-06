import { useState } from 'react';
import { IconDownload, IconFileUpload, IconTrash, IconUpload } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDateTime, faNum } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Input, Select, Textarea } from '@/shared/ui/form';
import { Badge, Card, Empty, InfoBanner, Modal, Pagination, SectionTitle } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { openProtectedFile, useCustomerDocuments, useDocumentWrite, useRegistrationDocuments, type CustomerDocument } from '../api';
import { ReasonModal } from '../components';
import { DOC_REVIEW, DOC_TYPES } from '../labels';
import s from '../customers.module.css';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX = 5 * 1024 * 1024;
const size = (b: number) => (b >= 1024 * 1024 ? `${faNum((b / 1024 / 1024).toFixed(1))} مگابایت` : `${faNum(Math.round(b / 1024))} کیلوبایت`);

export function DocumentsTab({ customerId }: { customerId: string }) {
  return <Card><DocumentsPanel customerId={customerId} /></Card>;
}

/**
 * مدارک پرونده (BR-CUS-070…075): فهرست، بارگذاری (≤۵MB؛ JPEG/PNG/WebP/PDF)، تأیید/رد با دلیل، حذف مدرک تأییدنشده، دانلود مجوزدار.
 * در صفحه‌ی بررسی درخواست، فهرست از endpoint درخواست می‌آید (مجوز registration_requests.read) ولی عملیات همان مجوزهای مدارک را می‌خواهد.
 */
export function DocumentsPanel({ customerId, requestId, title = 'مدارک' }: { customerId: string | null; requestId?: string; title?: string }) {
  const can = usePerm();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const canRead = can('customers.profiles.documents.read');
  const profileList = useCustomerDocuments(customerId ?? '', !!customerId && !requestId && canRead, { page, page_size: 10, query: q.trim() || undefined });
  const reqList = useRegistrationDocuments(requestId ?? '', !!requestId);
  const rows = requestId ? reqList.data : profileList.data?.results;
  const total = requestId ? reqList.data?.length ?? 0 : profileList.data?.total ?? 0;
  const loading = requestId ? reqList.isLoading : profileList.isLoading;
  const error = requestId ? reqList.error : profileList.error;
  const refetch = () => (requestId ? reqList.refetch() : profileList.refetch());
  const w = useDocumentWrite(customerId ?? '', requestId);
  const [uploading, setUploading] = useState(false);
  const [rejecting, setRejecting] = useState<CustomerDocument | null>(null);
  const [removing, setRemoving] = useState<CustomerDocument | null>(null);
  const [correcting, setCorrecting] = useState<CustomerDocument | null>(null);

  const approve = async (d: CustomerDocument) => { try { await w.review.mutateAsync({ id: d.id, approved: true, expected_version: d.version }); toast('مدرک تأیید شد.'); } catch (e) { toast(userMessage(e), 'error'); } };
  const cols: Column<CustomerDocument>[] = [
    { key: 'type', header: 'نوع مدرک', render: (d) => <b>{d.doc_type_display}</b> },
    { key: 'size', header: 'حجم', render: (d) => <span className={s.muted}>{size(d.file_size)}</span> },
    { key: 'at', header: 'بارگذاری', render: (d) => <span className={s.muted}>{faDateTime(d.created_at)}</span> },
    { key: 'st', header: 'وضعیت بررسی', render: (d) => <span className={s.flags}><Badge tone={DOC_REVIEW[d.review_status]?.tone ?? 'neutral'}>{DOC_REVIEW[d.review_status]?.label ?? d.review_status}</Badge>{d.review_status === 'REJECTED' && d.rejection_reason ? <span className={s.muted}>{d.rejection_reason}</span> : null}</span> },
    { key: 'ver', header: 'زمان بررسی', render: (d) => <span className={s.muted}>{faDateTime(d.verified_at)}</span> },
    {
      key: 'act', header: 'عملیات',
      render: (d) => (
        <span className={s.actionsRow} style={{ flexWrap: 'nowrap' }}>
          {canRead ? <Button size="sm" variant="ghost" icon={<IconDownload size={15} />} onClick={() => openProtectedFile(`/customers/documents/${d.id}/file`).catch((e) => toast(userMessage(e), 'error'))}>مشاهده</Button> : null}
          {can('customers.profiles.documents.update') ? <Button size="sm" variant="secondary" icon={<IconFileUpload size={15} />} onClick={() => setCorrecting(d)} data-tip="جایگزینی فایل مدرک؛ بررسی قبلی باطل می‌شود">اصلاح فایل</Button> : null}
          {can('customers.profiles.documents.update') && d.review_status !== 'VERIFIED' ? <>
            <Button size="sm" onClick={() => approve(d)} loading={w.review.isPending && w.review.variables?.id === d.id && w.review.variables.approved}>تأیید</Button>
            <Button size="sm" variant="danger" onClick={() => setRejecting(d)}>رد</Button>
          </> : null}
          {can('customers.profiles.documents.delete') && d.review_status !== 'VERIFIED' ? <Button size="sm" variant="ghost" icon={<IconTrash size={15} />} aria-label="حذف مدرک" onClick={() => setRemoving(d)}>حذف</Button> : null}
        </span>
      ),
    },
  ];
  return (
    <>
      <SectionTitle extra={customerId && can('customers.profiles.documents.create') ? <Button size="sm" icon={<IconUpload size={15} />} onClick={() => setUploading(true)}>بارگذاری مدرک</Button> : null}>{title}</SectionTitle>
      {!requestId && !canRead ? <Empty title="دسترسی به مدارک ندارید" /> : (
        <>
          {!requestId ? <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نوع مدرک یا دلیل رد" count={profileList.data ? `${faNum(total)} مدرک` : undefined} /> : null}
          <DataTable columns={cols} rows={rows} rowKey={(d) => d.id} loading={loading} error={error} onRetry={refetch}
            empty={<Empty title="مدرکی بارگذاری نشده است" text="کارت ملی، جواز کسب، تأییدیه‌ی کد پستی و سایر مدارک پرونده را این‌جا بارگذاری و بررسی کنید." />} />
          {!requestId && total > 10 ? <Pagination page={page} pageSize={10} total={total} onPage={setPage} /> : null}
        </>
      )}
      {uploading && customerId ? <UploadModal busy={w.upload.isPending} onClose={() => setUploading(false)} onSubmit={async (doc_type, file) => { await w.upload.mutateAsync({ doc_type, file }); toast('مدرک بارگذاری شد.'); setUploading(false); }} /> : null}
      {correcting ? <CorrectModal doc={correcting} busy={w.correct.isPending} onClose={() => setCorrecting(null)}
        onSubmit={async (v) => { await w.correct.mutateAsync({ id: correcting.id, expected_version: correcting.version, ...v }); toast('فایل مدرک اصلاح شد؛ مدرک دوباره در انتظار بررسی است.'); setCorrecting(null); }} /> : null}
      <ReasonModal open={!!rejecting} onClose={() => setRejecting(null)} danger busy={w.review.isPending} title={`رد مدرک «${rejecting?.doc_type_display ?? ''}»`} label="دلیل رد" confirmText="رد مدرک"
        onConfirm={async (reason) => { await w.review.mutateAsync({ id: rejecting!.id, approved: false, reason, expected_version: rejecting!.version }); toast('مدرک رد شد.'); setRejecting(null); }} />
      <ReasonModal open={!!removing} onClose={() => setRemoving(null)} danger busy={w.remove.isPending} title={`حذف مدرک «${removing?.doc_type_display ?? ''}»`} noReason confirmText="حذف مدرک"
        intro="مدرک تأییدنشده به‌طور کامل حذف می‌شود و قابل بازگشت نیست."
        onConfirm={async () => { await w.remove.mutateAsync(removing!.id); toast('مدرک حذف شد.'); setRemoving(null); }} />
    </>
  );
}

function UploadModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (docType: string, file: File) => Promise<void> }) {
  const [type, setType] = useState(DOC_TYPES[0]!.value);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="بارگذاری مدرک" width={520}
      footer={<><Button loading={busy} disabled={!file} onClick={async () => { if (!file) return; try { await onSubmit(type, file); } catch (e) { setErr(userMessage(e)); } }}>بارگذاری</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <Select label="نوع مدرک" value={type} onChange={(e) => setType(e.target.value)} options={DOC_TYPES} />
      <label className={`${s.docDrop} ${file ? s.docDropOk : ''}`} style={{ marginTop: 14 }}>
        <IconUpload size={18} />
        <span className={s.choiceText}><span className={s.choiceTitle}>{file ? file.name : 'انتخاب فایل'}</span><span className={s.choiceDesc}>{file ? size(file.size) : 'JPEG، PNG، WebP یا PDF — حداکثر ۵ مگابایت'}</span></span>
        <input type="file" accept={ACCEPT} onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && f.size > MAX) { setErr('حجم فایل بیش از ۵ مگابایت است.'); setFile(null); return; } setErr(null); setFile(f); }} />
      </label>
      {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
    </Modal>
  );
}

/**
 * اصلاح فایل مدرک (پرهام 2026-10-22): PUT /documents/{id}/file — حتی برای مدرک تأییدشده.
 * تأیید قبلی باطل و نسخه +۱ می‌شود؛ برای جواز کسب، نتیجه‌ی استعلام قبلی هم باطل می‌شود و شماره‌ی جواز (اختیاری) قابل اصلاح است. دلیل اختیاری است.
 */
function CorrectModal({ doc, busy, onClose, onSubmit }: { doc: CustomerDocument; busy: boolean; onClose: () => void; onSubmit: (v: { file: File; reason?: string; business_license_no?: string }) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const license = doc.doc_type === 'BUSINESS_LICENSE';
  return (
    <Modal open onClose={onClose} title={`اصلاح فایل «${doc.doc_type_display}»`} width={560}
      footer={<><Button loading={busy} disabled={!file} onClick={async () => { if (!file) return; setErr(null); try { await onSubmit({ file, reason: reason.trim() || undefined, business_license_no: license && licenseNo.trim() ? licenseNo.trim() : undefined }); } catch (e) { setErr(userMessage(e)); } }}>ذخیره‌ی فایل جدید</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div> : null}
      <InfoBanner tone="warning">{doc.review_status === 'VERIFIED' ? 'این مدرک تأیید شده است؛ ' : ''}با اصلاح فایل، نتیجه‌ی بررسی قبلی باطل و مدرک دوباره «در انتظار بررسی» می‌شود{license ? '؛ نتیجه‌ی استعلام جواز هم باطل می‌شود' : ''}. سابقه حذف نمی‌شود.</InfoBanner>
      <label className={`${s.docDrop} ${file ? s.docDropOk : ''}`} style={{ marginTop: 14 }}>
        <IconUpload size={18} />
        <span className={s.choiceText}><span className={s.choiceTitle}>{file ? file.name : 'انتخاب فایل جدید'}</span><span className={s.choiceDesc}>{file ? size(file.size) : 'JPEG، PNG، WebP یا PDF — حداکثر ۵ مگابایت'}</span></span>
        <input type="file" accept={ACCEPT} onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && f.size > MAX) { setErr('حجم فایل بیش از ۵ مگابایت است.'); setFile(null); return; } setErr(null); setFile(f); }} />
      </label>
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {license ? <Input label="شماره‌ی جواز کسب (اختیاری)" dir="ltr" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} hint="فقط اگر شماره‌ی جواز هم عوض شده است." /> : null}
        <Textarea label="توضیح (اختیاری)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} hint="در سابقه‌ی تغییرات ثبت می‌شود." />
      </div>
    </Modal>
  );
}
