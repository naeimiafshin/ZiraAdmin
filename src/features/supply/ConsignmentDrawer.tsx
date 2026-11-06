import { useState } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { groupMoney, moneyDigits } from '@/shared/lib/money';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Drawer } from '@/shared/ui/Drawer';
import { FormGrid, Select, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { KeyValue, SectionTitle } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useSupplierOptions } from './api';
import { useConsignmentWrite, type Consignment, type ConsignmentLineIn } from './consignmentsApi';
import { ItemPickerModal, type PickedItem } from './ItemPicker';
import { int, splitPath } from './requestsApi';
import s from './supply.module.css';

/**
 * کشوی ثبت/ویرایش خرید امانی (فرم‌ها در کشوی چپ — افشین 2026-10-31؛ html «خرید امانی جدید»: «دریافت کالای امانی از تأمین‌کننده با
 * تعیین تاریخ عودت»). بک‌اند یک انبار برای کل سند دارد (html انبار را روی هر ردیف می‌گیرد — SUPPLY_FRONT_PLAN). فی ردیف اختیاری است و
 * فقط برای «تبدیل به فاکتور» لازم می‌شود. قیدها: تأمین‌کننده‌ی فعال، تاریخ عودت الزامی و نه پیش از تاریخ سند، هر کالا یک بار، تعداد صحیح ≥ ۱.
 * ویرایش فقط «امانی در انبار»؛ تأمین‌کننده بعد از ثبت عوض نمی‌شود.
 */
type Line = { key: string; item_id: string; code: string; name: string; category: string; unit_name: string; qty: string; price: string };

const WIDTH = 1080;
const NOTES_MAX = 2000;
/**
 * هر نویسه‌ی غیررقمی (بعد از لاتین شدن ارقام). matches: "a", "-", "٬" — rejects: "7".
 * tester: https://regex101.com/?regex=%5B%5E0-9%5D&testString=12a3
 */
const NON_DIGIT = /[^0-9]/g;
const digits = (v: string) => toLatinDigits(v).replace(NON_DIGIT, '');
const n = (v: string) => Number(v || 0);
const todayTehran = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
let seq = 0;
const nextKey = () => `c${(seq += 1)}`;
const categoryOf = (path: string | null | undefined) => splitPath(path).filter(Boolean).join(' › ');

const fromConsignment = (c: Consignment): Line[] => (c.lines ?? []).flatMap((l) => (l.item ? [{
  key: nextKey(), item_id: l.item.id, code: l.item.code, name: l.item.display_name, category: categoryOf(l.item.category_path), unit_name: l.item.unit_name,
  qty: String(int(l.quantity)), price: l.unit_price == null ? '' : String(int(l.unit_price)),
}] : []));

export function ConsignmentDrawer({ consignment, onClose, onSaved }: { consignment: Consignment | null; onClose: () => void; onSaved?: (c: Consignment) => void }) {
  const toast = useToast();
  const w = useConsignmentWrite();
  const sups = useSupplierOptions('');
  const whs = useAllWarehouses();
  const c = consignment;
  const [supplier, setSupplier] = useState(c?.supplier?.id ?? '');
  const [warehouse, setWarehouse] = useState(c?.warehouse?.id ?? '');
  const [date, setDate] = useState(gregorianToJalaliText(c?.date ?? todayTehran()));
  const [due, setDue] = useState(c?.return_due_date ? gregorianToJalaliText(c.return_due_date) : '');
  const [notes, setNotes] = useState(c?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() => (c ? fromConsignment(c) : []));
  const [picking, setPicking] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setErrs((e) => ({ ...e, lines: '' })); };
  const addPicked = (rows: PickedItem[]) => setLines((ls) => [...ls, ...rows.filter((r) => !ls.some((l) => l.item_id === r.item_id)).map((r) => ({
    key: nextKey(), item_id: r.item_id, code: r.code, name: r.name, category: categoryOf(r.category_path), unit_name: r.unit_name, qty: '1', price: '',
  }))]);
  const totalQty = lines.reduce((a, l) => a + n(l.qty), 0);
  const supOpt = (sups.data ?? []).find((x) => x.id === supplier);

  const validate = () => {
    const e: Record<string, string> = {};
    const gd = jalaliTextToGregorian(date);
    const gu = jalaliTextToGregorian(due);
    if (!gd) e.date = 'تاریخ سند را درست وارد کنید.';
    if (!gu) e.due = 'تاریخ عودت را وارد کنید.';
    if (gd && gu && gu < gd) e.due = 'تاریخ عودت نمی‌تواند پیش از تاریخ سند باشد.';
    if (!c && !supplier) e.supplier = 'تأمین‌کننده را انتخاب کنید.';
    if (!warehouse) e.warehouse = 'انبار را انتخاب کنید.';
    if (!lines.length) e.lines = 'دست‌کم یک کالا اضافه کنید.';
    const bad = lines.find((l) => n(l.qty) < 1);
    if (bad) e.lines = `ردیف «${bad.name}»: تعداد باید دست‌کم ۱ باشد.`;
    setErrs(e);
    return Object.keys(e).length ? null : { gd: gd as string, gu: gu as string };
  };

  const submit = async () => {
    const v = validate(); if (!v) return;
    setTop(null); setBusy(true);
    const body: ConsignmentLineIn[] = lines.map((l) => ({ item_id: l.item_id, quantity: n(l.qty), unit_price: l.price === '' ? null : n(l.price) }));
    try {
      const saved = c
        ? await w.update.mutateAsync({ cid: c.id, body: { date: v.gd, return_due_date: v.gu, warehouse_id: warehouse, notes: notes.trim(), lines: body } })
        : await w.create.mutateAsync({ supplier_id: supplier, warehouse_id: warehouse, date: v.gd, return_due_date: v.gu, notes: notes.trim(), lines: body });
      toast(c ? `خرید امانی ${saved.number} ویرایش شد.` : `خرید امانی ${saved.number} ثبت شد.`);
      if (onSaved) onSaved(saved); else onClose();
    } catch (ex) { setTop(userMessage(ex)); } finally { setBusy(false); }
  };

  const dash = <span className={s.muted}>—</span>;
  return (
    <Drawer open onClose={onClose} busy={busy} width={WIDTH} title={c ? `ویرایش خرید امانی ${c.number}` : 'ثبت خرید امانی'}
      sub={c ? 'ویرایش فقط تا وقتی کالا «امانی در انبار» است ممکن است؛ تأمین‌کننده تغییر نمی‌کند.' : 'دریافت کالای امانی از تأمین‌کننده با تعیین تاریخ عودت؛ کالای امانی وارد موجودی انبار نمی‌شود.'}
      footer={<>
        <Button onClick={submit} loading={busy} loadingText="در حال ثبت…">{c ? 'ذخیره‌ی تغییرات' : 'ثبت خرید امانی'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>انصراف</Button>
        <span className={s.footSum}>اقلام: <b>{faNum(lines.length)}</b> · جمع تعداد: <b className="tnum">{faNum(totalQty)}</b></span>
      </>}>
      {top ? <div className={s.formErr}><Alert>{top}</Alert></div> : null}
      <SectionTitle>اطلاعات خرید امانی</SectionTitle>
      <FormGrid cols={4}>
        <KeyValue label="شماره" ltr>{c ? <span data-latin>{c.number}</span> : <span className={s.muted}>پس از ثبت</span>}</KeyValue>
        <JalaliDateInput label="تاریخ" required value={date} onChange={(e) => { setDate(e.target.value); setErrs((x) => ({ ...x, date: '' })); }} error={errs.date} dir="ltr" maxYear={1500} />
        <JalaliDateInput label="تاریخ عودت" required value={due} onChange={(e) => { setDue(e.target.value); setErrs((x) => ({ ...x, due: '' })); }} error={errs.due} dir="ltr" maxYear={1500}
          hint="موعدی که اگر کالا خریده نشود باید به تأمین‌کننده برگردد" />
        <KeyValue label="کد تأمین‌کننده" ltr><span data-latin>{(c ? c.supplier?.code : supOpt?.code) || '—'}</span></KeyValue>
        {c ? <KeyValue label="تأمین‌کننده">{c.supplier?.name ?? dash}</KeyValue> : (
          <Select label="تأمین‌کننده" required span={2} value={supplier} error={errs.supplier} onChange={(e) => { setSupplier(e.target.value); setErrs((x) => ({ ...x, supplier: '' })); }}
            placeholder={sups.isLoading ? 'در حال دریافت…' : 'انتخاب کنید'} options={(sups.data ?? []).map((x) => ({ value: x.id, label: x.name }))} hint="فقط تأمین‌کنندگان فعال" />
        )}
        <Select label="انبار" required span={2} value={warehouse} error={errs.warehouse} onChange={(e) => { setWarehouse(e.target.value); setErrs((x) => ({ ...x, warehouse: '' })); }}
          placeholder={whs.isLoading ? 'در حال دریافت…' : 'انتخاب کنید'} options={(whs.data ?? []).filter((x) => x.is_active).map((x) => ({ value: x.id, label: x.name }))}
          hint="یک انبار برای همه‌ی اقلام سند" />
      </FormGrid>

      <div className={s.formNote}>
        <SectionTitle extra={<Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setPicking(true)}>افزودن کالا</Button>}>اقلام امانی ({faNum(lines.length)})</SectionTitle>
      </div>
      <div className={s.linesWrap}>
        <table className={s.lines}>
          <thead><tr><th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>دسته</th><th>واحد</th><th>تعداد</th><th>فی واحد<small>(ریال، اختیاری)</small></th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className={s.muted}>{faNum(i + 1)}</td>
                <td className={s.code}><span data-latin>{l.code}</span></td>
                <td className={s.nameCell}><b>{l.name}</b></td>
                <td>{l.category || dash}</td>
                <td>{l.unit_name || dash}</td>
                <td><input className={s.cellInput} inputMode="numeric" aria-label={`تعداد ${l.name}`} value={toFaDigits(l.qty)} onChange={(e) => set(l.key, { qty: digits(e.target.value) })} /></td>
                <td><input className={`${s.cellInput} ${s.cellMoney}`} inputMode="numeric" aria-label={`فی واحد ${l.name}`} value={groupMoney(l.price)} onChange={(e) => set(l.key, { price: moneyDigits(e.target.value) })} /></td>
                <td><button type="button" className={`${s.iconBtn} ${s.iconDanger}`} aria-label={`حذف ردیف ${l.name}`} data-tip="حذف ردیف" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><IconTrash size={15} /></button></td>
              </tr>
            ))}
            {!lines.length ? <tr><td colSpan={8} className={s.linesEmpty}>هنوز کالایی اضافه نشده است. از «افزودن کالا» استفاده کنید.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {errs.lines ? <p className={s.fieldErr} role="alert">{errs.lines}</p> : null}
      <p className={s.note}>فی واحد اختیاری است؛ برای «تبدیل به فاکتور» فی هر کالا لازم است و همان‌جا هم می‌شود واردش کرد.</p>
      <div className={s.formNote}>
        <FormGrid cols={1}><Textarea label="توضیحات" rows={2} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} /></FormGrid>
      </div>
      <ItemPickerModal open={picking} onClose={() => setPicking(false)} existing={lines.map((l) => l.item_id)} onPick={addPicked} title="افزودن کالای امانی" />
    </Drawer>
  );
}
