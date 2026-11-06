import { useEffect, useState } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { faDate, faNum, fullName, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { groupMoney, moneyDigits } from '@/shared/lib/money';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Drawer } from '@/shared/ui/Drawer';
import { FormGrid, PickerField, Select, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Empty, InfoBanner, KeyValue, Modal, Pagination, Rial, SectionTitle, UnitHead } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useSupplierOptions } from './api';
import { RECEIPT_EDITABLE, useAdviceWrite, type Advice, type PricedLineIn } from './advicesApi';
import { ItemPickerModal, type PickedItem } from './ItemPicker';
import { int, personName, splitPath, useRequest, useRequests, type SupplyRequest } from './requestsApi';
import s from './supply.module.css';

/**
 * کشوی صدور/ویرایش اعلامیه‌ی رسید انبار (فرم‌ها در کشوی چپ — افشین 2026-10-31؛ ظاهر html «ثبت اعلامیه رسید انبار»).
 * دو راه صدور (تأیید افشین، بخش «جدول‌ها» در SUPPLY_FRONT_PLAN): از درخواست تأمین تأییدشده (تأمین‌کننده، انبار و اقلام خودکار پر می‌شوند و
 * قابل تغییرند) یا مستقیم (تأمین‌کننده، انبار و اقلام دستی). صادرکننده همیشه کاربر واردشده است (بک‌اند)، نه گزینه‌ی html.
 * قیدهای بک‌اند: تأمین‌کننده‌ی فعال، انبار در دسترس، دست‌کم یک ردیف، هر کالا یک بار، کالای پیش‌نویس پذیرفته نیست، عددها صحیح،
 * تخفیف واحد ≤ فی. درخواست تأمینی که اعلامیه‌ی فعال دارد دوباره اعلامیه نمی‌گیرد.
 * ویرایش فقط در وضعیت «در انتظار» و بایگانی‌نشده: توضیحات و تاریخ ارسال؛ ردیف‌ها فقط تا وقتی انبار شمارش را شروع نکرده (جایگزین کامل).
 * تأمین‌کننده و انبار بعد از صدور عوض نمی‌شوند (بک‌اند).
 */
type Line = { key: string; item_id: string; code: string; name: string; category: string; unit_name: string; qty: string; price: string; disc: string; tax: string };

const WIDTH = 1240;
const NOTES_MAX = 2000;
const PICKER_PAGE_SIZE = 8;
const PICKER_WIDTH = 980;
const DEBOUNCE_MS = 300;
/** ساعت ثبت تاریخ ارسالِ انتخابی (ظهر تهران) تا جابه‌جایی منطقه‌ی زمانی روز را عوض نکند */
const SENT_TIME = 'T12:00:00+03:30';
/** طول بخش تاریخ در رشته‌ی ISO (YYYY-MM-DD) */
const ISO_DATE_LEN = 10;
const datePart = (iso: string) => iso.slice(0, ISO_DATE_LEN);

/**
 * هر نویسه‌ی غیررقمی (بعد از لاتین شدن ارقام). matches: "a", "-", "٬" — rejects: "7".
 * tester: https://regex101.com/?regex=%5B%5E0-9%5D&testString=12a3
 */
const NON_DIGIT = /[^0-9]/g;
const digits = (v: string) => toLatinDigits(v).replace(NON_DIGIT, '');
const n = (v: string) => Number(v || 0);
const todayTehran = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
let seq = 0;
const nextKey = () => `a${(seq += 1)}`;
const categoryOf = (path: string | null | undefined) => splitPath(path).filter(Boolean).join(' › ');

type Source = { item?: { id: string; code: string; display_name: string; category_path: string; unit_name: string } | null; quantity: string; unit_price: string | null; unit_discount: string; unit_tax_duty: string };
const toLines = (rows: Source[]): Line[] => rows.flatMap((l) => (l.item ? [{
  key: nextKey(), item_id: l.item.id, code: l.item.code, name: l.item.display_name, category: categoryOf(l.item.category_path), unit_name: l.item.unit_name,
  qty: String(int(l.quantity)), price: l.unit_price == null ? '' : String(int(l.unit_price)), disc: String(int(l.unit_discount)), tax: String(int(l.unit_tax_duty)),
}] : []));

export function AdviceDrawer({ advice, requestId, onClose, onSaved }: {
  advice: Advice | null; requestId?: string | null; onClose: () => void; onSaved?: (a: Advice) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const w = useAdviceWrite();
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const [reqId, setReqId] = useState<string | null>(advice ? null : requestId ?? null);
  const req = useRequest(reqId);
  const [supplier, setSupplier] = useState(advice?.supplier?.id ?? '');
  const [warehouse, setWarehouse] = useState(advice?.destination_warehouse?.id ?? '');
  const [sent, setSent] = useState(gregorianToJalaliText(datePart(advice?.sent_to_warehouse_at ?? todayTehran())));
  const [notes, setNotes] = useState(advice?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() => (advice ? toLines(advice.lines ?? []) : []));
  const [picking, setPicking] = useState<'item' | 'request' | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linesEditable = !advice || RECEIPT_EDITABLE.includes(advice.receipt?.status ?? '');

  // انتخاب درخواست تأمین ⇐ تأمین‌کننده، انبار و اقلام از آن پر می‌شوند
  useEffect(() => {
    const r = req.data;
    if (!r || advice) return;
    setSupplier(r.supplier?.id ?? '');
    setWarehouse(r.destination_warehouse?.id ?? '');
    setLines(toLines(r.lines ?? []));
    setErrs({});
  }, [req.data, advice]);

  const set = (key: string, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setErrs((e) => ({ ...e, lines: '' })); };
  const total = lines.reduce((a, l) => a + n(l.qty) * (n(l.price) - n(l.disc) + n(l.tax)), 0);
  const addPicked = (rows: PickedItem[]) => setLines((ls) => [...ls, ...rows.filter((r) => !ls.some((l) => l.item_id === r.item_id)).map((r) => ({
    key: nextKey(), item_id: r.item_id, code: r.code, name: r.name, category: categoryOf(r.category_path), unit_name: r.unit_name,
    qty: '1', price: r.last_price != null ? String(r.last_price) : '', disc: '0', tax: '0',
  }))]);

  const supOpt = (sups.data ?? []).find((x) => x.id === supplier);
  const whOpt = (whs.data ?? []).find((x) => x.id === warehouse);
  // نام مسئول انبار فقط در خروجی انبارِ اسناد خرید هست (اعلامیه یا درخواست تأمین)، نه در فهرست انبارها
  const keeper = [advice?.destination_warehouse, req.data?.destination_warehouse].find((x) => x?.id === warehouse)?.keeper_name ?? '';

  const validate = () => {
    const e: Record<string, string> = {};
    const g = jalaliTextToGregorian(sent);
    if (!g) e.sent = 'تاریخ ارسال به انبار را درست وارد کنید.';
    if (!advice && !supplier) e.supplier = 'تأمین‌کننده را انتخاب کنید.';
    if (!advice && !warehouse) e.warehouse = 'انبار مقصد را انتخاب کنید.';
    if (linesEditable && !lines.length) e.lines = 'دست‌کم یک کالا به اعلامیه اضافه کنید.';
    const bad = linesEditable ? lines.find((l) => n(l.qty) < 1 || n(l.disc) > n(l.price)) : undefined;
    if (bad) {
      const problems: [boolean, string][] = [[n(bad.qty) < 1, 'تعداد باید دست‌کم ۱ باشد'], [bad.price === '', 'بدون فی واحد، تخفیف معنا ندارد'], [true, 'تخفیف واحد از فی بیشتر است']];
      e.lines = `ردیف «${bad.name}»: ${problems.find(([hit]) => hit)?.[1] ?? ''}.`;
    }
    setErrs(e);
    return Object.keys(e).length ? null : (g as string);
  };

  const submit = async () => {
    const g = validate(); if (!g) return;
    setTop(null); setBusy(true);
    const body: PricedLineIn[] = lines.map((l) => ({ item_id: l.item_id, quantity: n(l.qty), unit_price: l.price === '' ? null : n(l.price), unit_discount: n(l.disc), unit_tax_duty: n(l.tax) }));
    const origDate = datePart(advice?.sent_to_warehouse_at ?? todayTehran());
    const sentAt = g === origDate ? undefined : `${g}${SENT_TIME}`;
    try {
      const sentPart = sentAt ? { sent_to_warehouse_at: sentAt } : {};
      const saved = advice
        ? await w.update.mutateAsync({ aid: advice.id, body: { ...(notes.trim() !== advice.notes ? { notes: notes.trim() } : {}), ...sentPart, ...(linesEditable ? { lines: body } : {}) } })
        : await w.create.mutateAsync({ supply_request_id: reqId, supplier_id: supplier, destination_warehouse_id: warehouse, notes: notes.trim(), lines: body, ...sentPart });
      toast(advice ? `اعلامیه‌ی ${saved.advice_no} ویرایش شد.` : `اعلامیه‌ی ${saved.advice_no} صادر و رسید انبار ${saved.receipt?.receipt_no ?? ''} ساخته شد.`);
      if (onSaved) onSaved(saved); else onClose();
    } catch (ex) { setTop(userMessage(ex)); } finally { setBusy(false); }
  };

  const dash = <span className={s.muted}>—</span>;
  const numIn = (l: Line, k: 'qty' | 'price' | 'disc' | 'tax', label: string, money = false) => {
    if (!linesEditable) return <span className="tnum">{faNum(n(l[k]))}</span>;
    const show = money ? groupMoney : toFaDigits;
    const clean = money ? moneyDigits : digits;
    return <input className={`${s.cellInput} ${money ? s.cellMoney : ''}`} inputMode="numeric" aria-label={`${label} ${l.name}`}
      value={show(l[k])} onChange={(e) => set(l.key, { [k]: clean(e.target.value) })} />;
  };
  const r = req.data;
  const me = user ? fullName(user) : '—';
  const issuer = advice ? personName(advice.issuer) : me;

  return (
    <Drawer open onClose={onClose} busy={busy} width={WIDTH} title={advice ? `ویرایش اعلامیه ${advice.advice_no}` : 'ثبت اعلامیه رسید انبار'}
      sub={advice ? 'ویرایش فقط تا وقتی انبار کار را شروع نکرده ممکن است؛ تأمین‌کننده و انبار عوض نمی‌شوند.' : 'اعلامیه برای انبار و مالی فرستاده می‌شود و همان لحظه رسید انبار ساخته می‌شود.'}
      footer={<>
        <Button onClick={submit} loading={busy} loadingText="در حال ثبت…">{advice ? 'ذخیره‌ی تغییرات' : 'صدور اعلامیه'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>انصراف</Button>
        <span className={s.footSum}>تعداد اقلام: <b>{faNum(lines.length)}</b> · مبلغ کل: <b className="tnum">{faNum(total)}</b> <Rial />{lines.some((l) => l.price === '') ? <span className={s.unpriced} data-tip="دست‌کم یک ردیف فی ندارد و در جمع حساب نشده است؛ فی قطعی در فاکتور خرید تعیین می‌شود.">فی ناقص</span> : null}</span>
      </>}>
      {top ? <div className={s.formErr}><Alert>{top}</Alert></div> : null}

      {!advice ? (
        <>
          <SectionTitle>درخواست تأمین</SectionTitle>
          <FormGrid cols={4}>
            <PickerField label="درخواست تأمین تأییدشده" span={2} value={r ? `${r.request_no} — ${personName(r.requester)}` : ''} placeholder="انتخاب درخواست تأمین… (اختیاری)"
              onOpen={() => setPicking('request')} onClear={reqId ? () => { setReqId(null); setLines([]); setSupplier(''); setWarehouse(''); } : undefined}
              hint="با انتخاب درخواست تأمین، اقلام و تأمین‌کننده و انبار تعیین‌شده خودکار پر می‌شوند. بدون آن، اعلامیه مستقیم صادر می‌شود." />
            <KeyValue label="سفارش‌دهنده">{r ? personName(r.requester) : dash}</KeyValue>
            <KeyValue label="تاریخ درخواست">{r ? faDate(r.request_date) : dash}</KeyValue>
          </FormGrid>
        </>
      ) : null}

      <div className={s.formNote}><SectionTitle>اطلاعات اعلامیه</SectionTitle></div>
      <FormGrid cols={4}>
        <KeyValue label="شماره" ltr>{advice ? <span data-latin>{advice.advice_no}</span> : <span className={s.muted}>پس از صدور</span>}</KeyValue>
        <KeyValue label="تاریخ ثبت">{faDate(advice?.created_at ?? todayTehran())}</KeyValue>
        <JalaliDateInput label="تاریخ ارسال به انبار" required value={sent} onChange={(e) => { setSent(e.target.value); setErrs((x) => ({ ...x, sent: '' })); }} error={errs.sent} dir="ltr" maxYear={1500} />
        <KeyValue label="صادرکننده">{issuer}</KeyValue>
      </FormGrid>

      <div className={s.formNote}><SectionTitle>تأمین‌کننده و انبار</SectionTitle></div>
      <FormGrid cols={4}>
        {advice ? <KeyValue label="نام تأمین‌کننده">{advice.supplier?.name ?? dash}</KeyValue> : (
          <Select label="نام تأمین‌کننده" required value={supplier} error={errs.supplier} onChange={(e) => { setSupplier(e.target.value); setErrs((x) => ({ ...x, supplier: '' })); }}
            placeholder={sups.isLoading ? 'در حال دریافت…' : 'انتخاب کنید'} options={(sups.data ?? []).map((x) => ({ value: x.id, label: x.name }))} hint="فقط تأمین‌کنندگان فعال" />
        )}
        <KeyValue label="کد تأمین‌کننده" ltr><span data-latin>{(advice ? advice.supplier?.code : supOpt?.code) || '—'}</span></KeyValue>
        {advice ? <KeyValue label="نام انبار">{advice.destination_warehouse?.name ?? dash}</KeyValue> : (
          <Select label="نام انبار" required value={warehouse} error={errs.warehouse} onChange={(e) => { setWarehouse(e.target.value); setErrs((x) => ({ ...x, warehouse: '' })); }}
            placeholder={whs.isLoading ? 'در حال دریافت…' : 'انتخاب کنید'} options={(whs.data ?? []).filter((x) => x.is_active).map((x) => ({ value: x.id, label: x.name }))} />
        )}
        <KeyValue label="کد انبار" ltr><span data-latin>{(advice ? advice.destination_warehouse?.code : whOpt?.code) || '—'}</span></KeyValue>
        <KeyValue label="نام مسئول انبار">{keeper || <span className={s.muted}>{warehouse ? 'پس از صدور از انبار خوانده می‌شود' : '—'}</span>}</KeyValue>
      </FormGrid>

      <div className={s.formNote}>
        <SectionTitle extra={linesEditable ? <Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setPicking('item')}>افزودن قلم</Button> : null}>
          اقلام اعلامیه ({faNum(lines.length)})
        </SectionTitle>
      </div>
      {!linesEditable ? <div className={s.formErr}><InfoBanner>انبار شمارش این اعلامیه را شروع کرده است؛ ردیف‌ها دیگر تغییر نمی‌کنند.</InfoBanner></div> : null}
      <div className={s.linesWrap}>
        <table className={s.lines}>
          <thead><tr>
            <th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>دسته</th><th>واحد</th><th>فی واحد<small>(ریال)</small></th><th>تعداد</th><th>مبلغ</th>
            <th>تخفیف واحد</th><th>تخفیف کل</th><th>مالیات واحد</th><th>مالیات کل</th><th>مبلغ کل</th>{linesEditable ? <th /> : null}
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const q = n(l.qty);
              return (
                <tr key={l.key}>
                  <td className={s.muted}>{faNum(i + 1)}</td>
                  <td className={s.code}><span data-latin>{l.code}</span></td>
                  <td className={s.nameCell}><b>{l.name}</b></td>
                  <td>{l.category || dash}</td>
                  <td>{l.unit_name || dash}</td>
                  <td>{numIn(l, 'price', 'فی واحد', true)}</td>
                  <td>{numIn(l, 'qty', 'تعداد')}</td>
                  <td className="tnum">{l.price === '' ? dash : faNum(q * n(l.price))}</td>
                  <td>{numIn(l, 'disc', 'تخفیف واحد', true)}</td>
                  <td className="tnum">{faNum(q * n(l.disc))}</td>
                  <td>{numIn(l, 'tax', 'مالیات واحد', true)}</td>
                  <td className="tnum">{faNum(q * n(l.tax))}</td>
                  <td className={`tnum ${s.strong}`}>{l.price === '' ? dash : faNum(q * (n(l.price) - n(l.disc) + n(l.tax)))}</td>
                  {linesEditable ? <td><button type="button" className={`${s.iconBtn} ${s.iconDanger}`} aria-label={`حذف ردیف ${l.name}`} data-tip="حذف ردیف" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><IconTrash size={15} /></button></td> : null}
                </tr>
              );
            })}
            {!lines.length ? <tr><td colSpan={14} className={s.linesEmpty}>هنوز قلمی اضافه نشده است. درخواست تأمین را انتخاب کنید یا از «افزودن قلم» استفاده کنید.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {errs.lines ? <p className={s.fieldErr} role="alert">{errs.lines}</p> : null}
      <p className={s.note}>مبلغ هر ردیف = تعداد × (فی − تخفیف واحد + مالیات واحد). انبار با تعداد هر ردیف و فی خالص (فی − تخفیف) رسید می‌گیرد.</p>

      <div className={s.formNote}>
        <FormGrid cols={1}>
          <Textarea label="توضیحات" rows={3} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="توضیح برای انبار و مالی…" />
        </FormGrid>
      </div>

      <ItemPickerModal open={picking === 'item'} onClose={() => setPicking(null)} existing={lines.map((l) => l.item_id)} onPick={addPicked} title="افزودن قلم به اعلامیه" />
      {picking === 'request' ? <RequestPicker onClose={() => setPicking(null)} onPick={(id) => { setReqId(id); setPicking(null); }} /> : null}
    </Drawer>
  );
}

/** جدول انتخابی درخواست‌های تأمین تأییدشده (GET /supply/requests?final_status=APPROVED)؛ درخواست تأمین دارای اعلامیه انتخاب نمی‌شود */
function RequestPicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const list = useRequests({ final_status: 'APPROVED', query: dq || undefined, page, page_size: PICKER_PAGE_SIZE });
  const dash = <span className={s.muted}>—</span>;
  const cols: Column<SupplyRequest>[] = [
    { key: 'no', header: 'شماره', code: true, render: (r) => <span data-latin>{r.request_no}</span> },
    { key: 'date', header: 'تاریخ', render: (r) => faDate(r.request_date) },
    { key: 'by', header: 'سفارش‌دهنده', render: (r) => personName(r.requester) },
    { key: 'sup', header: 'تأمین‌کننده', render: (r) => r.supplier?.name ?? dash },
    { key: 'wh', header: 'انبار مقصد', render: (r) => r.destination_warehouse?.name ?? dash },
    { key: 'lines', header: 'اقلام', render: (r) => faNum(r.line_count) },
    { key: 'total', header: <UnitHead>مبلغ کل</UnitHead>, render: (r) => <span className="tnum">{faNum(int(r.total))}</span> },
    { key: 'pick', header: '', render: (r) => (r.advice_no
      ? <span className={s.muted}>اعلامیه <span data-latin>{r.advice_no}</span></span>
      : <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onPick(r.id); }}>انتخاب</Button>) },
  ];
  return (
    <Modal open onClose={onClose} title="انتخاب درخواست تأمین تأییدشده" width={PICKER_WIDTH}>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: شماره، تأمین‌کننده یا کالا" count={list.data ? `${faNum(list.data.total)} درخواست تأمین` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(r) => { if (!r.advice_no) onPick(r.id); }} empty={<Empty title={dq ? 'درخواست تأمینی با این جست‌وجو پیدا نشد' : 'درخواست تأمین تأییدشده‌ای نیست'} />} />
      {list.data && list.data.total > PICKER_PAGE_SIZE ? <Pagination page={page} pageSize={PICKER_PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}
