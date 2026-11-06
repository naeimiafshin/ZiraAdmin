import { useEffect, useState } from 'react';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { groupMoney, moneyDigits } from '@/shared/lib/money';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Drawer } from '@/shared/ui/Drawer';
import { FormGrid, PickerField, Select, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Empty, KeyValue, Modal, Pagination, Rial, SectionTitle, UnitHead } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useInvoice, useInvoices, type Invoice } from './invoicesApi';
import { int } from './requestsApi';
import { useReturnWrite, type PurchaseReturn, type ReturnLineIn } from './returnsApi';
import s from './supply.module.css';

/**
 * کشوی ثبت/ویرایش برگشت از خرید (فرم‌ها در کشوی چپ — افشین 2026-10-31؛ html «برگشتی جدید»: «ابتدا شماره فاکتور را انتخاب کنید؛
 * اقلام فاکتور به‌صورت خودکار فهرست می‌شوند»).
 * قیدهای بک‌اند: فاکتور مبدأ «تأیید و صادرشده»؛ هر کالا یک بار و فقط از کالاهای همان فاکتور؛ تعداد ≤ «قابل برگشت» (فاکتور منهای
 * برگشتی‌های تأییدشده) که از `returnable_items` جزئیات فاکتور خوانده و پیش از ارسال سنجیده می‌شود (S-19 ✅)؛ «در پیش‌نویس» فقط اطلاع است.
 * فی مرجوعی پیش‌فرض = `unit_price` همان ردیف (فی − تخفیف واحد). انبار خروج: اگر همه‌ی ردیف‌های فاکتور یک انبار دارند خودکار، وگرنه الزامی.
 * ویرایش فقط پیش‌نویس؛ فاکتور مبدأ عوض نمی‌شود.
 */
type Row = { item_id: string; code: string; name: string; unit_name: string; invoiced: number; returned: number; returnable: number; pending: number; net: number; qty: string; price: string };

const WIDTH = 1100;
const NOTES_MAX = 2000;
const PICKER_PAGE_SIZE = 8;
const PICKER_WIDTH = 940;
const DEBOUNCE_MS = 300;
/**
 * هر نویسه‌ی غیررقمی (بعد از لاتین شدن ارقام). matches: "a", "-", "٬" — rejects: "7".
 * tester: https://regex101.com/?regex=%5B%5E0-9%5D&testString=12a3
 */
const NON_DIGIT = /[^0-9]/g;
const digits = (v: string) => toLatinDigits(v).replace(NON_DIGIT, '');
const n = (v: string) => Number(v || 0);
const todayTehran = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());

/** ردیف‌های قابل برگشت فاکتور (`returnable_items` بک‌اند: هر کالا یک ردیف، جمع چند ردیف فاکتور)؛ مقدار برگشتی در حال ویرایش روی آن سوار می‌شود */
const rowsOf = (inv: Invoice, ret: PurchaseReturn | null): Row[] => {
  const byItem = new Map<string, Row>((inv.returnable_items ?? []).flatMap((x) => (x.item ? [[x.item.id, {
    item_id: x.item.id, code: x.item.code, name: x.item.display_name, unit_name: x.item.unit_name,
    invoiced: int(x.invoiced_quantity), returned: int(x.returned_quantity), returnable: int(x.returnable_quantity), pending: int(x.pending_return_quantity),
    net: int(x.unit_price), qty: '', price: '',
  }] as const] : [])));
  (ret?.lines ?? []).forEach((l) => {
    const r = l.item ? byItem.get(l.item.id) : undefined;
    if (r) { r.qty = String(int(l.quantity)); r.price = String(int(l.return_unit_price)); }
  });
  return [...byItem.values()];
};
const singleWarehouse = (inv: Invoice) => {
  const ids = [...new Set((inv.lines ?? []).map((l) => l.warehouse?.id ?? ''))];
  return ids.length === 1 ? ids[0] ?? '' : '';
};

export function ReturnDrawer({ ret, onClose, onSaved }: { ret: PurchaseReturn | null; onClose: () => void; onSaved?: (r: PurchaseReturn) => void }) {
  const toast = useToast();
  const w = useReturnWrite();
  const whs = useAllWarehouses();
  const [invId, setInvId] = useState<string | null>(ret?.source_invoice_id ?? null);
  const inv = useInvoice(invId);
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouse, setWarehouse] = useState(ret?.warehouse?.id ?? '');
  const [date, setDate] = useState(gregorianToJalaliText(ret?.return_date ?? todayTehran()));
  const [notes, setNotes] = useState(ret?.notes ?? '');
  const [picking, setPicking] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const data = inv.data;
    if (!data) return;
    setRows(rowsOf(data, ret));
    if (!ret) setWarehouse(singleWarehouse(data));
  }, [inv.data, ret]);

  const set = (id: string, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.item_id === id ? { ...r, ...patch } : r))); setErrs((e) => ({ ...e, lines: '' })); };
  const chosen = rows.filter((r) => n(r.qty) > 0);
  const priceOf = (r: Row) => (r.price === '' ? r.net : n(r.price));
  const total = chosen.reduce((a, r) => a + n(r.qty) * priceOf(r), 0);

  const validate = () => {
    const e: Record<string, string> = {};
    const g = jalaliTextToGregorian(date);
    if (!g) e.date = 'تاریخ برگشت را درست وارد کنید.';
    if (!invId) e.invoice = 'فاکتور مبدأ را انتخاب کنید.';
    if (!warehouse) e.warehouse = 'انبار خروج کالا را انتخاب کنید.';
    if (invId && !chosen.length) e.lines = 'دست‌کم برای یک کالا تعداد مرجوعی وارد کنید.';
    const over = chosen.find((r) => n(r.qty) > r.returnable);
    if (over) e.lines = `تعداد مرجوعی «${over.name}» از «قابل برگشت» (${toFaDigits(over.returnable)}) بیشتر است.`;
    setErrs(e);
    return Object.keys(e).length ? null : (g as string);
  };

  const submit = async () => {
    const g = validate(); if (!g || !invId) return;
    setTop(null); setBusy(true);
    const lines: ReturnLineIn[] = chosen.map((r) => ({ item_id: r.item_id, quantity: n(r.qty), return_unit_price: priceOf(r) }));
    try {
      const saved = ret
        ? await w.update.mutateAsync({ rid: ret.id, body: { return_date: g, warehouse_id: warehouse, notes: notes.trim(), lines } })
        : await w.create.mutateAsync({ source_invoice_id: invId, return_date: g, warehouse_id: warehouse, notes: notes.trim(), lines });
      toast(ret ? `برگشتی ${saved.return_no} ویرایش شد.` : `برگشت از خرید ${saved.return_no} (پیش‌نویس) ثبت شد.`);
      if (onSaved) onSaved(saved); else onClose();
    } catch (ex) { setTop(userMessage(ex)); } finally { setBusy(false); }
  };

  const d = inv.data;
  const dash = <span className={s.muted}>—</span>;
  const cell = (r: Row, k: 'qty' | 'price', label: string, money = false) => {
    const show = money ? groupMoney : toFaDigits;
    const clean = money ? moneyDigits : digits;
    return <input className={`${s.cellInput} ${money ? s.cellMoney : ''}`} inputMode="numeric" aria-label={`${label} ${r.name}`}
      value={show(r[k])} placeholder={k === 'price' ? groupMoney(String(r.net)) : '۰'} onChange={(e) => set(r.item_id, { [k]: clean(e.target.value) })} />;
  };

  return (
    <Drawer open onClose={onClose} busy={busy} width={WIDTH} title={ret ? `ویرایش برگشتی ${ret.return_no}` : 'ثبت برگشت از خرید'}
      sub={ret ? 'ویرایش فقط پیش از تأیید ممکن است؛ فاکتور مبدأ تغییر نمی‌کند.' : 'عودت کالای معیوب یا اضافی به تأمین‌کننده؛ پیش‌نویس ثبت می‌شود و با «تأیید» کالا از انبار خارج می‌شود.'}
      footer={<>
        <Button onClick={submit} loading={busy} loadingText="در حال ثبت…">{ret ? 'ذخیره‌ی تغییرات' : 'ثبت برگشتی'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>انصراف</Button>
        <span className={s.footSum}>اقلام مرجوعی: <b>{faNum(chosen.length)}</b> · مبلغ کل برگشتی: <b className="tnum">{faNum(total)}</b> <Rial /></span>
      </>}>
      {top ? <div className={s.formErr}><Alert>{top}</Alert></div> : null}
      <SectionTitle>فاکتور مبدأ</SectionTitle>
      <FormGrid cols={4}>
        {ret ? <KeyValue label="شماره فاکتور" ltr><span data-latin>{ret.invoice_no}</span></KeyValue> : (
          <PickerField label="شماره فاکتور" required span={2} value={d ? `${d.invoice_no} — ${d.supplier?.name ?? ''}` : ''} placeholder="انتخاب فاکتور تأیید و صادرشده…"
            error={errs.invoice} onOpen={() => setPicking(true)} onClear={invId ? () => { setInvId(null); setRows([]); setWarehouse(''); } : undefined} />
        )}
        <KeyValue label="تأمین‌کننده">{d?.supplier?.name ?? dash}</KeyValue>
        <KeyValue label="تاریخ فاکتور">{d ? faDate(d.invoice_date) : dash}</KeyValue>
      </FormGrid>
      <div className={s.formNote}><SectionTitle>اطلاعات برگشتی</SectionTitle></div>
      <FormGrid cols={4}>
        <KeyValue label="شماره" ltr>{ret ? <span data-latin>{ret.return_no}</span> : <span className={s.muted}>پس از ثبت</span>}</KeyValue>
        <JalaliDateInput label="تاریخ برگشت" required value={date} onChange={(e) => { setDate(e.target.value); setErrs((x) => ({ ...x, date: '' })); }} error={errs.date} dir="ltr" maxYear={1500} />
        <Select label="انبار خروج کالا" required span={2} value={warehouse} error={errs.warehouse} onChange={(e) => { setWarehouse(e.target.value); setErrs((x) => ({ ...x, warehouse: '' })); }}
          placeholder={whs.isLoading ? 'در حال دریافت…' : 'انتخاب کنید'} options={(whs.data ?? []).filter((x) => x.is_active).map((x) => ({ value: x.id, label: x.name }))}
          hint="اگر همه‌ی ردیف‌های فاکتور یک انبار دارند، همان انبار خودکار انتخاب می‌شود." />
      </FormGrid>

      <div className={s.formNote}><SectionTitle>اقلام مرجوعی ({faNum(chosen.length)})</SectionTitle></div>
      <div className={s.linesWrap}>
        <table className={s.lines}>
          <thead><tr>
            <th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>واحد</th><th>تعداد فاکتور</th><th>برگشت‌شده</th><th>قابل برگشت</th><th>در پیش‌نویس</th><th>فی خالص فاکتور</th><th>فی واحد مرجوعی<small>(ریال)</small></th><th>تعداد مرجوعی</th><th>مبلغ کل</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.item_id}>
                <td className={s.muted}>{faNum(i + 1)}</td>
                <td className={s.code}><span data-latin>{r.code}</span></td>
                <td className={s.nameCell}><b>{r.name}</b></td>
                <td>{r.unit_name || dash}</td>
                <td className="tnum">{faNum(r.invoiced)}</td>
                <td className="tnum">{faNum(r.returned)}</td>
                <td className={`tnum ${s.strong}`}>{faNum(r.returnable)}</td>
                <td className="tnum" data-tip={r.pending ? 'در برگشتی‌های پیش‌نویس؛ تا تأیید از «قابل برگشت» کم نمی‌شود' : undefined}>{r.pending ? faNum(r.pending) : dash}</td>
                <td className="tnum">{faNum(r.net)}</td>
                <td>{cell(r, 'price', 'فی واحد مرجوعی', true)}</td>
                <td>{cell(r, 'qty', 'تعداد مرجوعی')}</td>
                <td className={`tnum ${s.strong}`}>{n(r.qty) > 0 ? faNum(n(r.qty) * priceOf(r)) : dash}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={12} className={s.linesEmpty}>ابتدا شماره فاکتور را انتخاب کنید؛ اقلام فاکتور به‌صورت خودکار فهرست می‌شوند.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {errs.lines ? <p className={s.fieldErr} role="alert">{errs.lines}</p> : null}
      <p className={s.note}>فقط ردیف‌هایی که تعداد مرجوعی دارند ثبت می‌شوند. «قابل برگشت» = تعداد فاکتور منهای برگشتی‌های تأییدشده؛ «در پیش‌نویس» تعدادی است که در برگشتی‌های تأییدنشده آمده و هنوز کم نشده. فی خالی یعنی فی خالص فاکتور.</p>
      <div className={s.formNote}>
        <FormGrid cols={1}><Textarea label="توضیحات" rows={2} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="دلیل برگشت (معیوب، اضافه، …)" /></FormGrid>
      </div>
      {picking ? <InvoicePicker onClose={() => setPicking(false)} onPick={(id) => { setInvId(id); setPicking(false); setErrs((x) => ({ ...x, invoice: '' })); }} /> : null}
    </Drawer>
  );
}

/** جدول انتخابی فاکتورهای «تأیید و صادرشده» (GET /supply/invoices?status=APPROVED_ISSUED) */
function InvoicePicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const list = useInvoices({ status: 'APPROVED_ISSUED', query: dq || undefined, page, page_size: PICKER_PAGE_SIZE });
  const cols: Column<Invoice>[] = [
    { key: 'no', header: 'شماره فاکتور', code: true, render: (x) => <span data-latin>{x.invoice_no}</span> },
    { key: 'date', header: 'تاریخ', render: (x) => faDate(x.invoice_date) },
    { key: 'sup', header: 'تأمین‌کننده', render: (x) => x.supplier?.name ?? '—' },
    { key: 'lines', header: 'اقلام', render: (x) => faNum(x.line_count) },
    { key: 'total', header: <UnitHead>مبلغ کل</UnitHead>, render: (x) => <span className="tnum">{faNum(int(x.total_amount))}</span> },
  ];
  return (
    <Modal open onClose={onClose} title="انتخاب فاکتور خرید صادرشده" width={PICKER_WIDTH}>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: شماره فاکتور، تأمین‌کننده یا کالا" count={list.data ? `${faNum(list.data.total)} فاکتور` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(x) => x.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(x) => onPick(x.id)} empty={<Empty title={dq ? 'فاکتوری با این جست‌وجو پیدا نشد' : 'فاکتور تأیید و صادرشده‌ای نیست'} />} />
      {list.data && list.data.total > PICKER_PAGE_SIZE ? <Pagination page={page} pageSize={PICKER_PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}
