import { useRef, useState } from 'react';
import { IconFileUpload, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { faDate, faNum, fullName, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { groupMoney, moneyDigits } from '@/shared/lib/money';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Drawer } from '@/shared/ui/Drawer';
import { FormGrid, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Chip, InfoBanner, Rial, SectionTitle } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { ItemPickerModal, type PickedItem, type TempItem } from './ItemPicker';
import { int, useRequestWrite, type RequestLineIn, type SupplyRequest } from './requestsApi';
import s from './supply.module.css';

/**
 * کشوی ثبت/ویرایش درخواست تأمین (فرم‌ها در کشوی چپ — افشین 2026-10-31؛ ظاهر html «ثبت درخواست تأمین»).
 * ستون‌های اقلام مثل html: کد، نام (+ «موقت»)، واحد، فی واحد، تعداد، مجموع اولیه، تخفیف واحد، تخفیف کل، مالیات و عوارض واحد،
 * مالیات و عوارض کل، مبلغ کل، تارگت (روز). مبلغ کل ردیف = تعداد × (فی − تخفیف واحد + مالیات واحد) — همان فرمول بک‌اند (line_total را سرور حساب می‌کند).
 * قیدهای بک‌اند: دست‌کم یک ردیف؛ کالای کاتالوگ یا نام کالای موقت؛ همه‌ی عددها صحیح؛ تخفیف واحد ≤ فی؛ تارگت ۱ تا ۳۶۵۰ روز؛
 * تاریخ اعتبار پیش از تاریخ درخواست تأمین نیست؛ هر کالا یک بار. ویرایش فقط پیش از تصمیم تأمین و ردیف‌ها جایگزین کامل.
 * تارگت فروش هر ردیف برای کارمند الزامی است (افشین ۱۴ آبان ۱۴۰۵)؛ درخواست مشتری تارگت ندارد و در این کشو ثبت نمی‌شود.
 * مستندات (PDF/JPEG/PNG/WebP، ≤۵MB، حداکثر ۱۰) در ثبت بعد از ساخت درخواست تأمین بارگذاری می‌شوند؛ در ویرایش از مودال جزئیات.
 */
type Line = {
  key: string; item_id: string | null; temp_name: string; temp_category_id: string | null; temp_unit_id: string | null;
  code: string; name: string; unit_name: string; qty: string; price: string; disc: string; tax: string; days: string;
};
type Doc = { file: File; title: string };

const WIDTH = 1240;
const TARGET_MAX = 3650;
const MAX_DOCS = 10;
const MB = 1_048_576;
const MAX_DOC_MB = 5;
const MAX_DOC_BYTES = MAX_DOC_MB * MB;
const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const REASONS_MAX = 2000;

/**
 * هر نویسه‌ی غیررقمی (بعد از لاتین شدن ارقام). matches: "a", "-", "٬" — rejects: "7".
 * tester: https://regex101.com/?regex=%5B%5E0-9%5D&testString=12a3
 */
const NON_DIGIT = /[^0-9]/g;
/** پسوند نام فایل. matches: ".pdf" در "doc.pdf" — rejects: "doc". tester: https://regex101.com/?regex=%5C.%5B%5E.%5D%2B%24&testString=doc.pdf */
const FILE_EXT = /\.[^.]+$/;
const digits = (v: string) => toLatinDigits(v).replace(NON_DIGIT, '');
const n = (v: string) => Number(v || 0);
/** امروز به وقت تهران (YYYY-MM-DD) */
const todayTehran = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
let seq = 0;
const nextKey = () => `l${(seq += 1)}`;

const fromRequest = (r: SupplyRequest): Line[] => (r.lines ?? []).map((l) => ({
  key: nextKey(), item_id: l.item?.id ?? null, temp_name: l.temp_name, temp_category_id: l.temp_category_id ?? null, temp_unit_id: l.temp_unit_id ?? null,
  code: l.item?.code ?? '', name: l.item?.display_name ?? l.temp_name, unit_name: l.item?.unit_name ?? '',
  qty: String(int(l.quantity)), price: l.unit_price == null ? '' : String(int(l.unit_price)), disc: String(int(l.unit_discount)), tax: String(int(l.unit_tax_duty)), days: l.target_days ? String(l.target_days) : '',
}));

export function RequestDrawer({ request, onClose, onSaved }: { request: SupplyRequest | null; onClose: () => void; onSaved?: (r: SupplyRequest) => void }) {
  const { user } = useAuth();
  const w = useRequestWrite();
  const toast = useToast();
  // تاریخ درخواست را کاربر وارد نمی‌کند (افشین ۱۲ آبان ۱۴۰۵): ثبت تازه با تاریخ امروز (بک‌اند) و ویرایش با همان تاریخ ثبت
  const requestDate = request?.request_date ?? todayTehran();
  const [valid, setValid] = useState(request?.valid_until ? gregorianToJalaliText(request.valid_until) : '');
  // موعد تحویل الزامی (افشین ۱۳ آبان ۱۴۰۵؛ S-23 رفع شد): نه پیش از تاریخ درخواست؛ تاریخ اعتبار بعد از آن نیست
  const [due, setDue] = useState(request?.delivery_due ? gregorianToJalaliText(request.delivery_due) : '');
  const [reasons, setReasons] = useState(request?.reasons ?? '');
  const [lines, setLines] = useState<Line[]>(() => (request ? fromRequest(request) : []));
  const [docs, setDocs] = useState<Doc[]>([]);
  const [picking, setPicking] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: string, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setErrs((e) => ({ ...e, lines: '' })); };
  const total = lines.reduce((a, l) => a + n(l.qty) * (n(l.price) - n(l.disc) + n(l.tax)), 0);

  const addPicked = (rows: PickedItem[]) => setLines((ls) => [...ls, ...rows.filter((r) => !ls.some((l) => l.item_id === r.item_id)).map((r) => ({
    key: nextKey(), item_id: r.item_id, temp_name: '', temp_category_id: null, temp_unit_id: null, code: r.code, name: r.name, unit_name: r.unit_name,
    qty: '1', price: r.last_price != null ? String(r.last_price) : '', disc: '0', tax: '0', days: '',
  }))]);
  const addTemp = (t: TempItem) => setLines((ls) => [...ls, {
    key: nextKey(), item_id: null, temp_name: t.temp_name, temp_category_id: t.temp_category_id, temp_unit_id: t.temp_unit_id, code: '', name: t.temp_name, unit_name: t.unit_name,
    qty: '1', price: t.unit_price, disc: '0', tax: '0', days: '',
  }]);

  const pickDocs = (files: FileList | null) => {
    if (!files) return;
    const add: Doc[] = []; const bad: string[] = [];
    [...files].forEach((f) => { if (!DOC_TYPES.includes(f.type) || f.size > MAX_DOC_BYTES) bad.push(f.name); else add.push({ file: f, title: f.name.replace(FILE_EXT, '') }); });
    setDocs((d) => [...d, ...add].slice(0, MAX_DOCS));
    setErrs((e) => ({ ...e, docs: bad.length ? `این فایل‌ها پذیرفته نشدند (فقط PDF، JPEG، PNG یا WebP تا ۵ مگابایت): ${bad.join('، ')}` : '' }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const gd = requestDate;
    const gv = valid.trim() ? jalaliTextToGregorian(valid) : null;
    if (valid.trim() && !gv) e.valid = 'تاریخ اعتبار معتبر نیست.';
    if (gv && gv < gd) e.valid = 'تاریخ اعتبار نمی‌تواند پیش از تاریخ درخواست تأمین باشد.';
    const gdue = due.trim() ? jalaliTextToGregorian(due) : null;
    if (!due.trim()) e.due = 'موعد تحویل را وارد کنید.';
    else if (!gdue) e.due = 'موعد تحویل معتبر نیست.';
    else if (gdue < gd) e.due = 'موعد تحویل نمی‌تواند پیش از تاریخ درخواست تأمین باشد.';
    if (gv && gdue && gv > gdue) e.valid = 'تاریخ اعتبار نمی‌تواند بعد از موعد تحویل باشد.';
    if (!lines.length) e.lines = 'دست‌کم یک کالا به سفارش اضافه کنید.';
    const bad = lines.find((l) => n(l.qty) < 1 || n(l.disc) > n(l.price) || l.days === '' || n(l.days) < 1 || n(l.days) > TARGET_MAX);
    if (bad) {
      const problems: [boolean, string][] = [
        [n(bad.qty) < 1, 'تعداد باید دست‌کم ۱ باشد'],
        [n(bad.disc) > n(bad.price) && bad.price === '', 'بدون فی واحد، تخفیف معنا ندارد'],
        [n(bad.disc) > n(bad.price), 'تخفیف واحد از فی بیشتر است'],
        [bad.days === '', 'تارگت فروش را وارد کنید'],
        [true, `تارگت باید بین ۱ و ${toFaDigits(TARGET_MAX)} روز باشد`],
      ];
      e.lines = `ردیف «${bad.name}»: ${problems.find(([hit]) => hit)?.[1] ?? ''}.`;
    }
    setErrs(e);
    return Object.keys(e).length ? null : { gv, gdue: gdue as string };
  };

  const submit = async () => {
    const v = validate(); if (!v) return;
    setTop(null); setBusy(true);
    const body: RequestLineIn[] = lines.map((l) => ({
      ...(l.item_id ? { item_id: l.item_id, temp_name: null } : { temp_name: l.temp_name, temp_category_id: l.temp_category_id, temp_unit_id: l.temp_unit_id }),
      quantity: n(l.qty), unit_price: l.price === '' ? null : n(l.price), unit_discount: n(l.disc), unit_tax_duty: n(l.tax), target_days: n(l.days),
    }));
    try {
      let saved: SupplyRequest;
      if (request) {
        saved = await w.update.mutateAsync({ rid: request.id, body: {
          ...((v.gv ?? null) !== (request.valid_until ?? null) ? { valid_until: v.gv } : {}),
          ...(v.gdue !== (request.delivery_due ?? null) ? { delivery_due: v.gdue } : {}),
          ...(reasons.trim() !== request.reasons ? { reasons: reasons.trim() } : {}),
          lines: body,
        } });
        toast(`درخواست تأمین ${saved.request_no} ویرایش شد.`);
      } else {
        saved = await w.create.mutateAsync({ delivery_due: v.gdue, valid_until: v.gv, reasons: reasons.trim(), lines: body });
        // بارگذاری مستندات پشت سر هم (ترتیب و پیام خطای هر فایل)
        const failed: string[] = [];
        saved = await docs.reduce<Promise<SupplyRequest>>(async (prev, d) => {
          const cur = await prev;
          try { return await w.upload.mutateAsync({ rid: cur.id, file: d.file, title: d.title.trim() || d.file.name }); } catch (ex) { failed.push(`${d.file.name} (${userMessage(ex)})`); return cur; }
        }, Promise.resolve(saved));
        toast(failed.length ? `درخواست تأمین ${saved.request_no} ثبت شد ولی این مستندات بارگذاری نشدند: ${failed.join('، ')}` : `درخواست تأمین ${saved.request_no} ثبت شد.`, failed.length ? 'error' : undefined);
      }
      // onSaved خودش کشو را می‌بندد (مثلاً با رفتن به فهرست و باز کردن جزئیات)؛ بدون آن فقط بسته می‌شود
      if (onSaved) onSaved(saved); else onClose();
    } catch (ex) { setTop(userMessage(ex)); } finally { setBusy(false); }
  };

  const dash = <span className={s.muted}>—</span>;
  const requesterName = request?.requester?.full_name || (user && !request ? fullName(user) : '') || '—';
  const numIn = (l: Line, k: 'qty' | 'price' | 'disc' | 'tax' | 'days', label: string, money = false) => (
    <input className={`${s.cellInput} ${money ? s.cellMoney : ''}`} inputMode="numeric" aria-label={`${label} ${l.name}`}
      value={(money ? groupMoney : toFaDigits)(l[k])} onChange={(e) => set(l.key, { [k]: money ? moneyDigits(e.target.value) : digits(e.target.value) })} />
  );

  return (
    <Drawer open onClose={onClose} busy={busy} width={WIDTH} title={request ? `ویرایش درخواست تأمین ${request.request_no}` : 'ثبت درخواست تأمین'}
      sub={request ? 'ویرایش فقط تا پیش از تصمیم تأمین ممکن است؛ ردیف‌ها به‌طور کامل جایگزین می‌شوند.' : 'درخواست تأمین کالا پیش از خرید قطعی؛ پس از ثبت، شورای تأمین رأی می‌دهد.'}
      footer={<>
        <Button onClick={submit} loading={busy} loadingText="در حال ثبت…">{request ? 'ذخیره‌ی تغییرات' : 'ثبت درخواست تأمین'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>انصراف</Button>
        <span className={s.footSum}>تعداد اقلام: <b>{faNum(lines.length)}</b> · مبلغ کل خرید: <b className="tnum">{faNum(total)}</b> <Rial />{lines.some((l) => l.price === '') ? <span className={s.unpriced} data-tip="دست‌کم یک ردیف فی ندارد و در جمع حساب نشده است؛ فی قطعی در فاکتور خرید تعیین می‌شود.">فی ناقص</span> : null}</span>
      </>}>
      {top ? <div className={s.formErr}><Alert>{top}</Alert></div> : null}
      <div className={s.reqHead}>
        <div className={s.requester}>
          <span className={s.muted}>سفارش‌دهنده</span>
          <b>{requesterName}</b>
          <span className={s.requesterDate}>تاریخ درخواست: <b>{faDate(requestDate)}</b></span>
          {!request ? <small className={s.muted}>سفارش‌دهنده و تاریخ به‌صورت خودکار ثبت می‌شوند.</small> : null}
        </div>
        <JalaliDateInput label="موعد تحویل" required value={due} onChange={(e) => { setDue(e.target.value); setErrs((x) => ({ ...x, due: '' })); }} error={errs.due} hint="کالا تا این تاریخ باید دریافت شود" dir="ltr" maxYear={1500} />
        <JalaliDateInput label="تاریخ اعتبار" value={valid} onChange={(e) => { setValid(e.target.value); setErrs((x) => ({ ...x, valid: '' })); }} error={errs.valid} hint="اختیاری" dir="ltr" maxYear={1500} />
      </div>

      <SectionTitle extra={<Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setPicking(true)}>افزودن آیتم</Button>}>اقلام سفارش</SectionTitle>
      <div className={s.linesWrap}>
        <table className={s.lines}>
          <thead><tr>
            <th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>واحد</th><th>فی واحد<small>(ریال)</small></th><th>تعداد</th><th>مجموع اولیه</th>
            <th>تخفیف واحد</th><th>تخفیف کل</th><th>مالیات و عوارض واحد</th><th>مالیات و عوارض کل</th><th>مبلغ کل</th><th>تارگت فروش<small>(روز، الزامی)</small></th><th />
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const q = n(l.qty);
              return (
                <tr key={l.key}>
                  <td className={s.muted}>{faNum(i + 1)}</td>
                  <td className={s.code}>{l.code ? <span data-latin>{l.code}</span> : dash}</td>
                  <td className={s.nameCell}><b>{l.name}</b>{l.item_id ? null : <Chip tip>موقت</Chip>}</td>
                  <td>{l.unit_name || dash}</td>
                  <td>{numIn(l, 'price', 'فی واحد', true)}</td>
                  <td>{numIn(l, 'qty', 'تعداد')}</td>
                  <td className="tnum">{l.price === '' ? dash : faNum(q * n(l.price))}</td>
                  <td>{numIn(l, 'disc', 'تخفیف واحد', true)}</td>
                  <td className="tnum">{faNum(q * n(l.disc))}</td>
                  <td>{numIn(l, 'tax', 'مالیات و عوارض واحد', true)}</td>
                  <td className="tnum">{faNum(q * n(l.tax))}</td>
                  <td className={`tnum ${s.strong}`}>{l.price === '' ? dash : faNum(q * (n(l.price) - n(l.disc) + n(l.tax)))}</td>
                  <td>{numIn(l, 'days', 'تارگت فروش به روز')}</td>
                  <td><button type="button" className={`${s.iconBtn} ${s.iconDanger}`} aria-label={`حذف ردیف ${l.name}`} data-tip="حذف ردیف" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><IconTrash size={15} /></button></td>
                </tr>
              );
            })}
            {!lines.length ? <tr><td colSpan={14} className={s.linesEmpty}>هنوز آیتمی اضافه نشده است. از «افزودن آیتم» استفاده کنید.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {errs.lines ? <p className={s.fieldErr} role="alert">{errs.lines}</p> : null}
      <p className={s.note}>تارگت فروش: مدت زمانی (به روز) که کالای تأمین‌شده باید به فروش برسد. مبلغ هر ردیف = تعداد × (فی − تخفیف واحد + مالیات و عوارض واحد).</p>

      <div className={s.formNote}>
        <FormGrid cols={1}>
          <Textarea label="دلایل" rows={3} maxLength={REASONS_MAX} value={reasons} onChange={(e) => setReasons(e.target.value)} placeholder="دلیل تأمین، مرجع تقاضا و توضیحات…" />
        </FormGrid>
      </div>
      {!request ? (
        <div className={s.formNote}>
          <div className={s.docsHead}>
            <b>مستندات</b>
            <Button size="sm" variant="secondary" icon={<IconFileUpload size={15} />} onClick={() => fileRef.current?.click()} disabled={docs.length >= MAX_DOCS}>بارگذاری مستندات</Button>
            <input ref={fileRef} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="فایل مستندات" onChange={(e) => pickDocs(e.target.files)} />
          </div>
          {docs.map((d, i) => (
            <div key={`${d.file.name}-${i}`} className={s.docRow}>
              <input className={s.cellInput} value={d.title} aria-label={`عنوان مستند ${d.file.name}`} onChange={(e) => setDocs((ds) => ds.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <span className={s.muted} data-latin>{d.file.name}</span>
              <button type="button" className={s.iconBtn} aria-label={`برداشتن ${d.file.name}`} data-tip="برداشتن" onClick={() => setDocs((ds) => ds.filter((_, j) => j !== i))}><IconX size={15} /></button>
            </div>
          ))}
          {errs.docs ? <p className={s.fieldErr}>{errs.docs}</p> : null}
          {!docs.length ? <p className={s.note}>PDF، JPEG، PNG یا WebP تا ۵ مگابایت؛ حداکثر ۱۰ مستند. بعد از ثبت درخواست تأمین بارگذاری می‌شوند.</p> : null}
        </div>
      ) : (
        <div className={s.formNote}><InfoBanner>مستندات این درخواست تأمین در پنجره‌ی جزئیات بارگذاری یا حذف می‌شوند.</InfoBanner></div>
      )}
      <ItemPickerModal open={picking} onClose={() => setPicking(false)} existing={lines.flatMap((l) => (l.item_id ? [l.item_id] : []))} allowTemp
        onPick={addPicked} onTemp={addTemp} title="افزودن آیتم — از فهرست محصولات انتخاب کنید؛ اگر محصول تعریف نشده است، آیتم موقت ثبت کنید" />
    </Drawer>
  );
}
