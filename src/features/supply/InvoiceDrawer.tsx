import { useState } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { groupMoney, moneyDigits } from '@/shared/lib/money';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Drawer } from '@/shared/ui/Drawer';
import { Dropdown } from '@/shared/ui/Dropdown';
import { FormGrid, Input, PickerField, Select, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Empty, InfoBanner, KeyValue, Modal, Pagination, Rial, SectionTitle } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useSupplierOptions } from './api';
import {
  DELIVERY_KEYS, SETTLEMENT_KEYS, useInvoiceWrite, usePostedReceipts, type DeliveryType, type Invoice, type InvoiceLineIn, type SettlementMethod, type WmsReceipt,
} from './invoicesApi';
import { ItemPickerModal, type PickedItem } from './ItemPicker';
import { DELIVERY_TYPE, SETTLEMENT_METHOD } from './labels';
import { int, splitPath } from './requestsApi';
import s from './supply.module.css';

/**
 * کشوی ثبت/ویرایش فاکتور خرید (فرم‌ها در کشوی چپ — افشین 2026-10-31؛ ظاهر html «فاکتور خرید جدید»).
 * ثبت مستقیم (بدون اعلامیه): تأمین‌کننده‌ی فعال، تاریخ، شماره فاکتور تأمین‌کننده، نوع تحویل، نحوه تسویه، رسید انبار ثبت‌نهایی‌شده (اختیاری)
 * و ردیف‌ها؛ هر ردیف انبار خودش را دارد و «کالا + انبار» تکراری پذیرفته نیست (بک‌اند). فاکتور مستقیم موجودی انبار را عوض نمی‌کند.
 * ویرایش فقط پیش‌نویس یا ویرایش‌شده؛ در فاکتور ساخته‌شده از اعلامیه تأمین‌کننده و رسید عوض نمی‌شوند. ردیف‌ها جایگزین کامل‌اند.
 */
type Line = { key: string; item_id: string; code: string; name: string; category: string; unit_name: string; warehouse_id: string; qty: string; price: string; disc: string; tax: string };

const WIDTH = 1240;
const NOTES_MAX = 2000;
const SUPPLIER_INVOICE_MAX = 50;
const PICKER_PAGE_SIZE = 8;
const PICKER_WIDTH = 900;
const DEBOUNCE_MS = 300;

/**
 * هر نویسه‌ی غیررقمی (بعد از لاتین شدن ارقام). matches: "a", "-", "٬" — rejects: "7".
 * tester: https://regex101.com/?regex=%5B%5E0-9%5D&testString=12a3
 */
const NON_DIGIT = /[^0-9]/g;
const digits = (v: string) => toLatinDigits(v).replace(NON_DIGIT, '');
const n = (v: string) => Number(v || 0);
const todayTehran = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
let seq = 0;
const nextKey = () => `i${(seq += 1)}`;
const categoryOf = (path: string | null | undefined) => splitPath(path).filter(Boolean).join(' › ');

const fromInvoice = (inv: Invoice): Line[] => (inv.lines ?? []).flatMap((l) => (l.item ? [{
  key: nextKey(), item_id: l.item.id, code: l.item.code, name: l.item.display_name, category: categoryOf(l.item.category_path), unit_name: l.item.unit_name,
  warehouse_id: l.warehouse?.id ?? '', qty: String(int(l.quantity)), price: String(int(l.unit_price)), disc: String(int(l.unit_discount)), tax: String(int(l.unit_tax_duty)),
}] : []));

export function InvoiceDrawer({ invoice, onClose, onSaved }: { invoice: Invoice | null; onClose: () => void; onSaved?: (i: Invoice) => void }) {
  const can = usePerm();
  const toast = useToast();
  const w = useInvoiceWrite();
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const fromAdvice = !!invoice?.advice_id;
  const [supplier, setSupplier] = useState(invoice?.supplier?.id ?? '');
  const [date, setDate] = useState(gregorianToJalaliText(invoice?.invoice_date ?? todayTehran()));
  const [supNo, setSupNo] = useState(invoice?.supplier_invoice_no ?? '');
  const [delivery, setDelivery] = useState<DeliveryType>(invoice?.delivery_type ?? 'WAREHOUSE');
  const [settle, setSettle] = useState<SettlementMethod>(invoice?.settlement_method ?? 'CASH');
  const [receipt, setReceipt] = useState<{ id: string; no: string } | null>(invoice?.receipt ? { id: invoice.receipt.id, no: invoice.receipt.receipt_no } : null);
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [defWh, setDefWh] = useState('');
  const [lines, setLines] = useState<Line[]>(() => (invoice ? fromInvoice(invoice) : []));
  const [picking, setPicking] = useState<'item' | 'receipt' | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const whOptions = (whs.data ?? []).filter((x) => x.is_active).map((x) => ({ value: x.id, label: x.name }));
  const set = (key: string, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setErrs((e) => ({ ...e, lines: '' })); };
  const total = lines.reduce((a, l) => a + n(l.qty) * (n(l.price) - n(l.disc) + n(l.tax)), 0);
  const addPicked = (rows: PickedItem[]) => setLines((ls) => [...ls, ...rows.map((r) => ({
    key: nextKey(), item_id: r.item_id, code: r.code, name: r.name, category: categoryOf(r.category_path), unit_name: r.unit_name,
    warehouse_id: defWh, qty: '1', price: r.last_price != null ? String(r.last_price) : '', disc: '0', tax: '0',
  }))]);
  const supOpt = (sups.data ?? []).find((x) => x.id === supplier);

  const validate = () => {
    const e: Record<string, string> = {};
    const g = jalaliTextToGregorian(date);
    if (!g) e.date = 'تاریخ فاکتور را درست وارد کنید.';
    if (!supplier) e.supplier = 'تأمین‌کننده را انتخاب کنید.';
    if (!lines.length) e.lines = 'دست‌کم یک کالا به فاکتور اضافه کنید.';
    const dup = lines.find((l, i) => lines.findIndex((x) => x.item_id === l.item_id && x.warehouse_id === l.warehouse_id) !== i);
    const bad = lines.find((l) => !l.warehouse_id || n(l.qty) < 1 || l.price === '' || n(l.disc) > n(l.price));
    if (bad) {
      const problems: [boolean, string][] = [[!bad.warehouse_id, 'انبار را انتخاب کنید'], [n(bad.qty) < 1, 'تعداد باید دست‌کم ۱ باشد'], [bad.price === '', 'فی واحد را وارد کنید'], [true, 'تخفیف واحد از فی بیشتر است']];
      e.lines = `ردیف «${bad.name}»: ${problems.find(([hit]) => hit)?.[1] ?? ''}.`;
    } else if (dup) e.lines = `کالای «${dup.name}» برای همین انبار دو بار آمده است.`;
    setErrs(e);
    return Object.keys(e).length ? null : (g as string);
  };

  const submit = async () => {
    const g = validate(); if (!g) return;
    setTop(null); setBusy(true);
    const body: InvoiceLineIn[] = lines.map((l) => ({ item_id: l.item_id, warehouse_id: l.warehouse_id, quantity: n(l.qty), unit_price: n(l.price), unit_discount: n(l.disc), unit_tax_duty: n(l.tax) }));
    const header = { invoice_date: g, supplier_invoice_no: supNo.trim(), delivery_type: delivery, settlement_method: settle, notes: notes.trim() };
    const link = fromAdvice ? {} : { supplier_id: supplier, receipt_id: receipt?.id ?? null };
    try {
      const saved = invoice
        ? await w.update.mutateAsync({ iid: invoice.id, body: { ...header, ...link, lines: body } })
        : await w.create.mutateAsync({ ...header, supplier_id: supplier, receipt_id: receipt?.id ?? null, lines: body });
      toast(invoice ? `فاکتور ${saved.invoice_no} ویرایش شد.` : `فاکتور خرید ${saved.invoice_no} (پیش‌نویس) ثبت شد.`);
      if (onSaved) onSaved(saved); else onClose();
    } catch (ex) { setTop(userMessage(ex)); } finally { setBusy(false); }
  };

  const dash = <span className={s.muted}>—</span>;
  const numIn = (l: Line, k: 'qty' | 'price' | 'disc' | 'tax', label: string, money = false) => {
    const show = money ? groupMoney : toFaDigits;
    const clean = money ? moneyDigits : digits;
    return <input className={`${s.cellInput} ${money ? s.cellMoney : ''}`} inputMode="numeric" aria-label={`${label} ${l.name}`}
      value={show(l[k])} onChange={(e) => set(l.key, { [k]: clean(e.target.value) })} />;
  };
  const canReceipts = can('wms.goods_receipts.list');

  return (
    <Drawer open onClose={onClose} busy={busy} width={WIDTH} title={invoice ? `ویرایش فاکتور خرید ${invoice.invoice_no}` : 'ثبت فاکتور خرید'}
      sub={invoice ? 'ویرایش فقط پیش از «تأیید و صدور» ممکن است؛ ردیف‌ها به‌طور کامل جایگزین می‌شوند.' : 'فاکتور مستقیم (بدون اعلامیه) به‌صورت پیش‌نویس ثبت می‌شود و بعد «تأیید و صدور» می‌شود.'}
      footer={<>
        <Button onClick={submit} loading={busy} loadingText="در حال ثبت…">{invoice ? 'ذخیره‌ی تغییرات' : 'ثبت فاکتور'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>انصراف</Button>
        <span className={s.footSum}>تعداد اقلام: <b>{faNum(lines.length)}</b> · مبلغ کل: <b className="tnum">{faNum(total)}</b> <Rial /></span>
      </>}>
      {top ? <div className={s.formErr}><Alert>{top}</Alert></div> : null}
      {fromAdvice ? <div className={s.formErr}><InfoBanner>این فاکتور از اعلامیه‌ی <span data-latin>{invoice?.advice_no}</span> ساخته شده؛ تأمین‌کننده و رسید انبار آن تغییر نمی‌کند.</InfoBanner></div> : null}

      <SectionTitle>اطلاعات فاکتور</SectionTitle>
      <FormGrid cols={4}>
        <KeyValue label="شماره" ltr>{invoice ? <span data-latin>{invoice.invoice_no}</span> : <span className={s.muted}>پس از ثبت</span>}</KeyValue>
        <JalaliDateInput label="تاریخ فاکتور" required value={date} onChange={(e) => { setDate(e.target.value); setErrs((x) => ({ ...x, date: '' })); }} error={errs.date} dir="ltr" maxYear={1500} />
        <Input label="شماره فاکتور تأمین‌کننده" latin maxLength={SUPPLIER_INVOICE_MAX} value={supNo} onChange={(e) => setSupNo(e.target.value)} hint="اختیاری" />
        <KeyValue label="تاریخ ثبت">{faDate(invoice?.created_at ?? todayTehran())}</KeyValue>
        {fromAdvice ? <KeyValue label="تأمین‌کننده">{invoice?.supplier?.name ?? dash}</KeyValue> : (
          <Select label="تأمین‌کننده" required value={supplier} error={errs.supplier} onChange={(e) => { setSupplier(e.target.value); setErrs((x) => ({ ...x, supplier: '' })); }}
            placeholder={sups.isLoading ? 'در حال دریافت…' : 'انتخاب کنید'} options={(sups.data ?? []).map((x) => ({ value: x.id, label: x.name }))} hint="فقط تأمین‌کنندگان فعال" />
        )}
        <KeyValue label="کد تأمین‌کننده" ltr><span data-latin>{(fromAdvice ? invoice?.supplier?.code : supOpt?.code) || '—'}</span></KeyValue>
        <Select label="نوع تحویل" value={delivery} onChange={(e) => setDelivery(DELIVERY_KEYS.find((k) => k === e.target.value) ?? 'WAREHOUSE')}
          options={DELIVERY_KEYS.map((value) => ({ value, label: DELIVERY_TYPE[value] ?? value }))} />
        <Select label="نحوه تسویه" value={settle} onChange={(e) => setSettle(SETTLEMENT_KEYS.find((k) => k === e.target.value) ?? 'CASH')}
          options={SETTLEMENT_KEYS.map((value) => ({ value, label: SETTLEMENT_METHOD[value] ?? value }))} />
        {fromAdvice ? <KeyValue label="رسید انبار" ltr>{invoice?.receipt ? <span data-latin>{invoice.receipt.receipt_no}</span> : dash}</KeyValue> : (
          <PickerField label="رسید انبار (اختیاری)" span={2} value={receipt ? receipt.no : ''} placeholder={canReceipts ? 'اتصال به رسید ثبت‌نهایی‌شده…' : 'فهرست رسیدهای انبار برای حساب شما در دسترس نیست'}
            disabled={!canReceipts} onOpen={() => setPicking('receipt')} onClear={receipt ? () => setReceipt(null) : undefined}
            hint="فقط اتصال برای پیگیری؛ فاکتور مستقیم موجودی انبار را تغییر نمی‌دهد." />
        )}
      </FormGrid>

      <div className={s.formNote}>
        <SectionTitle extra={<span className={s.lineTools}>
          <Dropdown value={defWh} onChange={(e) => setDefWh(e.target.value)} placeholder="انبار پیش‌فرض ردیف‌های تازه" options={whOptions} aria-label="انبار پیش‌فرض ردیف‌های تازه" />
          <Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setPicking('item')}>افزودن کالا</Button>
        </span>}>اقلام فاکتور ({faNum(lines.length)})</SectionTitle>
      </div>
      <div className={s.linesWrap}>
        <table className={s.lines}>
          <thead><tr>
            <th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>واحد</th><th>انبار</th><th>فی واحد<small>(ریال)</small></th><th>تعداد</th><th>مبلغ</th>
            <th>تخفیف واحد</th><th>تخفیف کل</th><th>مالیات واحد</th><th>مالیات کل</th><th>مبلغ کل</th><th />
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const q = n(l.qty);
              return (
                <tr key={l.key}>
                  <td className={s.muted}>{faNum(i + 1)}</td>
                  <td className={s.code}><span data-latin>{l.code}</span></td>
                  <td className={s.nameCell}><b>{l.name}</b></td>
                  <td>{l.unit_name || dash}</td>
                  <td className={s.whCell}><Dropdown value={l.warehouse_id} onChange={(e) => set(l.key, { warehouse_id: e.target.value })} placeholder="انتخاب انبار" options={whOptions} aria-label={`انبار ${l.name}`} invalid={!l.warehouse_id && !!errs.lines} /></td>
                  <td>{numIn(l, 'price', 'فی واحد', true)}</td>
                  <td>{numIn(l, 'qty', 'تعداد')}</td>
                  <td className="tnum">{faNum(q * n(l.price))}</td>
                  <td>{numIn(l, 'disc', 'تخفیف واحد', true)}</td>
                  <td className="tnum">{faNum(q * n(l.disc))}</td>
                  <td>{numIn(l, 'tax', 'مالیات واحد', true)}</td>
                  <td className="tnum">{faNum(q * n(l.tax))}</td>
                  <td className={`tnum ${s.strong}`}>{faNum(q * (n(l.price) - n(l.disc) + n(l.tax)))}</td>
                  <td><button type="button" className={`${s.iconBtn} ${s.iconDanger}`} aria-label={`حذف ردیف ${l.name}`} data-tip="حذف ردیف" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><IconTrash size={15} /></button></td>
                </tr>
              );
            })}
            {!lines.length ? <tr><td colSpan={14} className={s.linesEmpty}>هنوز کالایی اضافه نشده است. از «افزودن کالا» استفاده کنید.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {errs.lines ? <p className={s.fieldErr} role="alert">{errs.lines}</p> : null}
      <p className={s.note}>مبلغ هر ردیف = تعداد × (فی − تخفیف واحد + مالیات واحد). با «تأیید و صدور»، فی خالص (فی − تخفیف) هر کالا به‌عنوان آخرین قیمت خرید ثبت می‌شود.</p>

      <div className={s.formNote}>
        <FormGrid cols={1}>
          <Textarea label="توضیحات" rows={3} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormGrid>
      </div>

      <ItemPickerModal open={picking === 'item'} onClose={() => setPicking(null)} existing={[]} onPick={addPicked} title="افزودن کالا به فاکتور" />
      {picking === 'receipt' ? <ReceiptPicker onClose={() => setPicking(null)} onPick={(r) => { setReceipt({ id: r.id, no: r.receipt_no }); setPicking(null); }} /> : null}
    </Drawer>
  );
}

/** جدول انتخابی رسیدهای انبار ثبت‌نهایی‌شده (GET /wms/receipts?status=POSTED) */
function ReceiptPicker({ onClose, onPick }: { onClose: () => void; onPick: (r: WmsReceipt) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const list = usePostedReceipts({ query: dq || undefined, page, page_size: PICKER_PAGE_SIZE });
  const cols: Column<WmsReceipt>[] = [
    { key: 'no', header: 'شماره رسید', code: true, render: (r) => <span data-latin>{r.receipt_no}</span> },
    { key: 'date', header: 'تاریخ', render: (r) => faDate(r.decided_at ?? r.created_at) },
    { key: 'wh', header: 'انبار', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'sup', header: 'تأمین‌کننده', render: (r) => r.supplier_name || '—' },
    { key: 'lines', header: 'اقلام', render: (r) => faNum(r.line_count) },
  ];
  return (
    <Modal open onClose={onClose} title="اتصال به رسید انبار ثبت‌نهایی‌شده" width={PICKER_WIDTH}>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: شماره رسید یا تأمین‌کننده" count={list.data ? `${faNum(list.data.total)} رسید` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={onPick} empty={<Empty title={dq ? 'رسیدی با این جست‌وجو پیدا نشد' : 'رسید ثبت‌نهایی‌شده‌ای نیست'} />} />
      {list.data && list.data.total > PICKER_PAGE_SIZE ? <Pagination page={page} pageSize={PICKER_PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}
