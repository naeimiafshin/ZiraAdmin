import { useState } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Input, Select, Textarea } from '@/shared/ui/form';
import { Empty, Modal } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useStock, type StockRow } from './api';
import { INSURANCE_OPTIONS, useAllWarehouses, useTransferWrite, type Transfer, type TransferLine } from './transfers';
import s from './branches.module.css';

/** عدد صحیح از ورودی فارسی/لاتین؛ نامعتبر ⇐ NaN (همه‌ی مقدارها عدد صحیح‌اند، ADR 0008) */
const toInt = (v: string) => (/^[0-9]+$/.test(toLatinDigits(v.trim())) ? Number(toLatinDigits(v.trim())) : NaN);

export function ConfirmModal({ title, text, confirm, danger, loading, onConfirm, onClose }: {
  title: string; text: string; confirm: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={title} width={480}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirm}</Button></>}>
      <p className={s.hint}>{text}</p>
    </Modal>
  );
}

export function RejectModal({ transfer, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: () => void }) {
  const w = useTransferWrite();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!reason.trim()) { setErr('دلیل رد را بنویسید.'); return; }
    setErr(null);
    try { await w.reject.mutateAsync({ id: transfer.id, reason: reason.trim() }); onDone(); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`رد انتقال ${transfer.transfer_no}`} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button variant="danger" loading={w.reject.isPending} onClick={submit}>رد انتقال</Button></>}>
      <p className={s.hint}>انتقال ردشده دیگر قابل ادامه نیست{transfer.status === 'IN_TRANSIT' ? ' و رزرو انبار مبدأ آزاد می‌شود' : ''}.</p>
      <Textarea label="دلیل رد" required value={reason} onChange={(e) => setReason(e.target.value)} error={err ?? undefined} rows={3} maxLength={2000} />
    </Modal>
  );
}

/** دریافت در مقصد: برای هر ردیف مقدار دریافتی (پیش‌فرض = ارسالی)؛ کمتر از ارسالی ⇐ کسری حمل */
export function ReceiveModal({ transfer, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: (t: Transfer) => void }) {
  const w = useTransferWrite();
  const lines = transfer.lines ?? [];
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, toFaDigits(String(Number(l.quantity)))])));
  const [err, setErr] = useState<string | null>(null);
  const bad = lines.filter((l) => { const n = toInt(vals[l.id] ?? ''); return Number.isNaN(n) || n > Number(l.quantity); });
  const short = lines.reduce((a, l) => { const n = toInt(vals[l.id] ?? ''); return a + (Number.isNaN(n) ? 0 : Math.max(0, Number(l.quantity) - n)); }, 0);
  const cols: Column<TransferLine>[] = [
    { key: 'code', header: 'کد کالا', code: true, render: (r) => <span data-latin>{r.item?.code ?? '—'}</span> },
    { key: 'name', header: 'نام کالا', render: (r) => r.item?.display_name ?? '—' },
    { key: 'qty', header: 'ارسالی', render: (r) => faNum(Number(r.quantity)) },
    { key: 'rcv', header: 'دریافتی', render: (r) => (
      <input className={`${s.cellInput} ${bad.includes(r) ? s.cellBad : ''}`} inputMode="numeric" aria-label={`مقدار دریافتی ${r.item?.code ?? ''}`} value={vals[r.id] ?? ''}
        onChange={(e) => setVals((v) => ({ ...v, [r.id]: toFaDigits(e.target.value) }))} />
    ) },
    { key: 'sh', header: 'کسری', render: (r) => { const n = toInt(vals[r.id] ?? ''); const d = Number.isNaN(n) ? 0 : Number(r.quantity) - n; return d > 0 ? <b className={s.dangerText}>{faNum(d)}</b> : '—'; } },
  ];
  const submit = async () => {
    if (bad.length) { setErr('مقدار دریافتی هر ردیف باید عدد صحیح و حداکثر برابر مقدار ارسالی باشد.'); return; }
    setErr(null);
    try {
      const t = await w.receive.mutateAsync({ id: transfer.id, body: { lines: lines.map((l) => ({ line_id: l.id, received_quantity: String(toInt(vals[l.id]!)) })) } });
      onDone(t);
    } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`ثبت دریافت در مقصد — ${transfer.transfer_no}`} width={860}
      footer={<div className={s.mFoot}><span className={s.mNote}>{short > 0 ? `کسری حمل: ${faNum(short)} واحد — کل مقدار ارسالی از مبدأ کسر و فقط دریافتی به مقصد افزوده می‌شود.` : 'همه‌ی مقدار ارسالی دریافت می‌شود.'}</span>
        <span className={s.mActs}><Button variant="secondary" onClick={onClose}>انصراف</Button><Button loading={w.receive.isPending} onClick={submit}>ثبت دریافت</Button></span></div>}>
      <p className={s.hint}>مقدار شمارش‌شده در انبار مقصد ({transfer.destination_warehouse?.name}) را وارد کنید. کالا در آدرس اصلی خودش در انبار مقصد ثبت می‌شود.</p>
      {err ? <Alert>{err}</Alert> : null}
      <DataTable variant="flat" columns={cols} rows={lines} rowKey={(r) => r.id} />
    </Modal>
  );
}

type Draft = { item_id: string; code: string; name: string; available: number; qty: string };

/** ثبت انتقال جدید: مبدأ، مقصد، بیمه، سند مرتبط، یادداشت و اقلام از موجودی قابل استفاده‌ی مبدأ */
export function CreateTransferModal({ initialSource, onClose, onCreated }: { initialSource?: string; onClose: () => void; onCreated: (t: Transfer) => void }) {
  const w = useTransferWrite();
  const whs = useAllWarehouses();
  const active = (whs.data ?? []).filter((x) => x.is_active);
  const [src, setSrc] = useState(initialSource ?? '');
  const [dst, setDst] = useState('');
  const [ins, setIns] = useState('NONE');
  const [doc, setDoc] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<Draft[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const stock = useStock({ warehouse_id: src, query: q.trim() || undefined, in_stock_only: true, page_size: 6 }, !!src);
  const add = (r: StockRow) => {
    if (!r.item || lines.some((l) => l.item_id === r.item!.id)) return;
    setLines((ls) => [...ls, { item_id: r.item!.id, code: r.item!.code, name: r.item!.display_name, available: Number(r.available), qty: '' }]);
  };
  const pickCols: Column<StockRow>[] = [
    { key: 'code', header: 'کد کالا', code: true, render: (r) => <span data-latin>{r.item?.code}</span> },
    { key: 'name', header: 'نام کالا', render: (r) => r.item?.display_name ?? '—' },
    { key: 'av', header: 'قابل انتقال', render: (r) => faNum(Number(r.available)) },
    { key: 'add', header: 'افزودن', render: (r) => { const has = lines.some((l) => l.item_id === r.item?.id); return (
      <button type="button" className={s.iconBtn} onClick={() => add(r)} disabled={has || Number(r.available) <= 0} aria-label={`افزودن ${r.item?.code ?? ''}`} data-tip={has ? 'در فهرست است' : 'افزودن به انتقال'}><IconPlus size={16} /></button>); } },
  ];
  const lineCols: Column<Draft>[] = [
    { key: 'code', header: 'کد کالا', code: true, render: (r) => <span data-latin>{r.code}</span> },
    { key: 'name', header: 'نام کالا', render: (r) => r.name },
    { key: 'av', header: 'قابل انتقال', render: (r) => faNum(r.available) },
    { key: 'qty', header: 'مقدار', render: (r) => { const n = toInt(r.qty); const bad = !!r.qty && (Number.isNaN(n) || n <= 0 || n > r.available); return (
      <input className={`${s.cellInput} ${bad ? s.cellBad : ''}`} inputMode="numeric" aria-label={`مقدار ${r.code}`} value={r.qty}
        onChange={(e) => { setErrs(({ lines: _l, ...rest }) => rest); setLines((ls) => ls.map((l) => (l.item_id === r.item_id ? { ...l, qty: toFaDigits(e.target.value) } : l))); }} />); } },
    { key: 'rm', header: 'حذف', render: (r) => <button type="button" className={s.iconBtn} onClick={() => setLines((ls) => ls.filter((l) => l.item_id !== r.item_id))} aria-label={`حذف ${r.code}`} data-tip="حذف ردیف"><IconTrash size={16} /></button> },
  ];
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!src) e.src = 'انبار مبدأ را انتخاب کنید.';
    if (!dst) e.dst = 'انبار مقصد را انتخاب کنید.';
    if (src && dst && src === dst) e.dst = 'انبار مقصد باید با انبار مبدأ فرق کند.';
    if (!lines.length) e.lines = 'حداقل یک کالا اضافه کنید.';
    else if (lines.some((l) => { const n = toInt(l.qty); return Number.isNaN(n) || n <= 0 || n > l.available; })) e.lines = 'مقدار هر ردیف باید عدد صحیح، بزرگ‌تر از صفر و حداکثر برابر «قابل انتقال» باشد.';
    setErrs(e); setErr(null);
    if (Object.keys(e).length) return;
    try {
      const t = await w.create.mutateAsync({ source_warehouse_id: src, destination_warehouse_id: dst, insurance_status: ins as Transfer['insurance_status'], source_doc_no: toLatinDigits(doc.trim()), note: note.trim(),
        lines: lines.map((l) => ({ item_id: l.item_id, quantity: String(toInt(l.qty)) })) });
      onCreated(t);
    } catch (x) { setErr(userMessage(x)); }
  };
  const opts = active.map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }));
  return (
    <Modal open onClose={onClose} title="ثبت انتقال جدید" width={980}
      footer={<div className={s.mFoot}><span className={s.mNote}>انتقال پس از ثبت «در انتظار تأیید» است؛ تا خروج از مبدأ موجودی جابه‌جا نمی‌شود.</span>
        <span className={s.mActs}><Button variant="secondary" onClick={onClose}>انصراف</Button><Button loading={w.create.isPending} onClick={submit}>ثبت انتقال</Button></span></div>}>
      {err ? <Alert>{err}</Alert> : null}
      <div className={s.formGrid3}>
        <Select label="انبار مبدأ" required value={src} placeholder="انتخاب انبار" options={opts} error={errs.src}
          onChange={(e) => { setSrc(e.target.value); setLines([]); }} />
        <Select label="انبار مقصد" required value={dst} placeholder="انتخاب انبار" options={opts.filter((o) => o.value !== src)} error={errs.dst} onChange={(e) => setDst(e.target.value)} />
        <Select label="وضعیت بیمه‌ی حمل" value={ins} options={INSURANCE_OPTIONS} onChange={(e) => setIns(e.target.value)} />
        <Input label="شماره سند مرتبط (اختیاری)" latin value={doc} maxLength={30} onChange={(e) => setDoc(e.target.value)} />
        <Input label="یادداشت (اختیاری)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} span={2} />
      </div>
      <h4 className={s.subTitle}>افزودن کالا از موجودی انبار مبدأ</h4>
      {!src ? <Empty title="اول انبار مبدأ را انتخاب کنید" /> : (
        <>
          <TableFilters search={q} onSearch={setQ} placeholder="جست‌وجو: نام، کد یا بارکد کالا" />
          <DataTable variant="flat" columns={pickCols} rows={stock.data?.results} rowKey={(r) => r.id} loading={stock.isLoading} error={stock.error}
            empty={<Empty title={q ? 'کالایی پیدا نشد' : 'این انبار موجودی قابل انتقال ندارد'} />} />
        </>
      )}
      <h4 className={s.subTitle}>اقلام انتقال ({faNum(lines.length)})</h4>
      {errs.lines ? <p className={s.fieldErr} role="alert">{errs.lines}</p> : null}
      {lines.length ? <DataTable variant="flat" columns={lineCols} rows={lines} rowKey={(r) => r.item_id} /> : <Empty title="هنوز کالایی اضافه نشده" />}
    </Modal>
  );
}
