import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { IconCheck, IconChevronLeft, IconFileInvoice, IconHash, IconInfoCircle, IconLock, IconPlus, IconUser, IconUserSearch } from '@tabler/icons-react';
import { ApiError, userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { avatarColor, faNum, gregorianToJalaliText, initialOf, jalaliTextToGregorian } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { useBack } from '@/shared/lib/useBack';
import { Dropdown } from '@/shared/ui/Dropdown';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { ErrorBox, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { SoonTag } from '@/features/branches/SoonTag';
import { useBranchWarehouses } from '@/features/branches/api';
import { useCustomer, useCustomerAddresses, type CustomerRow } from '@/features/customers/api';
import { money, staffName, useItemTraits, useStaffOptions, useStockLookup } from '../api/common';
import { useInvoice, useInvoiceWrite, type Invoice, type InvoiceIn, type LineIn } from '../api/invoices';
import fx from './form.module.css';
import { ItemPickerModal, type PickedItem } from '../ItemPicker';
import { DELIVERY_TYPE, keysOf, SETTLEMENT_METHOD, type DeliveryType, type SettlementMethod } from '../labels';
import { EditLinesTable, FormTotals, itemTraits, lineStock, type EditLine, type WarehouseOption } from '../lines';
import { CustomerSelect } from '../ui';
import { TierBadge } from '@/features/customers/components';

/**
 * «فاکتور فروش جدید» و ویرایش پیش‌نویس (html «INVOICE FORM PAGE»، ظاهر دقیقاً همان)، و «اصلاحیه»ی فاکتور صادرشده (فقط سوپر ادمین، `?amend=1`).
 * - دو کادر html: «اطلاعات فاکتور» (شماره، تاریخ، نوع تحویل، صادرکننده) و «طرف حساب و انبار» (کد و نام مشتری، کد و نام انبار — هر جفت
 *   هم‌بسته)، نوار اطلاعات مشتری انتخاب‌شده، کادر «اقلام فاکتور» با جدول html، توضیحات و جمع‌ها، و دکمه‌های انصراف، جدید و ثبت.
 * - افزوده‌های بک‌اند که html ندارد (افشین ۱۴ آبان ۱۴۰۵: بمانند): نحوه تسویه، فروشنده، کدهای تخفیف؛ شعبه فقط برای سوپر ادمین.
 * - فرم فقط کالا، تعداد و انبار می‌فرستد؛ ستون‌های مبلغ پیش از ثبت «پس از ثبت»اند و بعد از ذخیره از پاسخ خوانده می‌شوند.
 * - زیر هر تعداد «موجودی: …» انبار همان ردیف (استعلام موجودی انبار)؛ بیش از موجودی ⇐ قرمز و نشان «… ردیف بیش از موجودی انبار».
 *   ثبت با تعداد بیش از موجودی بسته نیست (خروج کالا با انبار است؛ بک‌اند هم رد نمی‌کند).
 * - مشتری غیرفعال یا در لیست سیاه قابل انتخاب نیست؛ نحوه‌ی تسویه‌ی چکی/اعتباری را بک‌اند می‌سنجد (۴۰۰ زیر همان فیلد).
 * - بعد از ذخیره به برگه‌ی همان فاکتور در فهرست (`?open=`) با replace؛ «تایید و صدور» آن‌جاست.
 */
const HEADER_FIELDS = ['customer_id', 'date', 'delivery_type', 'delivery_warehouse_id', 'settlement_method', 'salesperson_id', 'coupon_codes', 'note', 'branch_id', 'reason', 'lines'] as const;
// Row error key from the backend: matches "lines[2].quantity" (row 2), rejects "lines". https://regex101.com/?regex=%5Elines%5C%5B(%5Cd%2B)%5C%5D&testString=lines%5B2%5D.quantity
const LINE_KEY = /^lines\[(\d+)\]/;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
// Coupon list separators: matches "," or spaces in "AB12, CD34"; "AB12" alone is one code. https://regex101.com/?regex=%5B%2C%D8%8C%5Cs%5D%2B&testString=AB12%2C%20CD34
const COUPON_SPLIT = /[,،\s]+/;
const ADDRESS_PAGE = 20;
let seq = 0;
const nextKey = () => { seq += 1; return `l${seq}`; };

export default function InvoiceFormPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const q = useInvoice(id);
  const back = useBack('/sales/invoices');
  if (id && q.isLoading) return <div className={fx.page}><SkeletonRows rows={6} height={60} /></div>;
  if (id && q.error) {
    const nf = q.error instanceof ApiError && q.error.status === HTTP_NOT_FOUND;
    return (
      <div className={fx.page}>
        {nf ? <div className={fx.alert}>این فاکتور پیدا نشد؛ شاید مال شعبه‌ای است که به آن دسترسی ندارید.</div> : <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
        <div><button type="button" className={fx.back} onClick={back}>بازگشت به لیست<IconChevronLeft size={16} /></button></div>
      </div>
    );
  }
  return <InvoiceForm key={q.data?.id ?? `new-${sp.get('n') ?? ''}`} inv={q.data ?? null} amend={sp.get('amend') === '1'} />;
}

const toEditLine = (l: NonNullable<Invoice['lines']>[number]): EditLine => ({
  key: nextKey(), item_id: l.item?.id ?? '', code: l.item?.code ?? '', name: l.item?.display_name ?? '—', traits: itemTraits(l.item),
  unit: l.item?.unit_name ?? '', quantity: Math.trunc(Number(l.quantity)) || 1, warehouse_id: l.warehouse?.id ?? '', saved: l,
});

type Cust = { id: string; code: string; name: string; national_id: string; mobile: string };
const fromRow = (c: CustomerRow): Cust => ({ id: c.id, code: c.code, name: c.store_name || c.full_name, national_id: c.national_id ?? '', mobile: c.mobile ?? '' });

function InvoiceForm({ inv, amend }: { inv: Invoice | null; amend: boolean }) {
  const can = usePerm();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const back = useBack('/sales/invoices');
  const w = useInvoiceWrite();
  const isNew = !inv;
  const superuser = !!user?.is_superuser;

  const [date, setDate] = useState(inv ? gregorianToJalaliText(inv.date) : gregorianToJalaliText(todayIso()));
  const [dateTouched, setDateTouched] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryType>(inv?.delivery_type ?? 'WAREHOUSE_PICKUP');
  const [method, setMethod] = useState<SettlementMethod>(inv?.settlement_method ?? 'CASH');
  const [seller, setSeller] = useState(inv?.salesperson?.id ?? '');
  const [coupons, setCoupons] = useState((inv?.coupon_codes ?? []).join('، '));
  const [note, setNote] = useState(inv?.note ?? '');
  const [reason, setReason] = useState('');
  const [branchId, setBranchId] = useState(inv?.branch?.id ?? user?.work_branch_id ?? '');
  const [warehouseId, setWarehouseId] = useState(inv?.delivery_warehouse?.id ?? '');
  const [customer, setCustomer] = useState<Cust | null>(inv?.customer ? { id: inv.customer.id, code: inv.customer.code, name: inv.customer.store_name || inv.customer.full_name, national_id: inv.customer.national_id, mobile: inv.customer.mobile } : null);
  const [lines, setLines] = useState<EditLine[]>(() => (inv?.lines ?? []).map(toEditLine));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [top, setTop] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);

  const branches = useBranchOptions();
  const whq = useBranchWarehouses(branchId, !!branchId);
  const whOptions: WarehouseOption[] = useMemo(() => (whq.data?.results ?? []).filter((x) => x.is_active).map((x) => ({ value: x.warehouse_id, label: x.warehouse_name, code: x.warehouse_code })), [whq.data]);
  const staff = useStaffOptions('', can('identity.users.list'));
  const canStock = can('wms.stock_lookup.read');
  const itemIds = useMemo(() => [...new Set(lines.map((l) => l.item_id))], [lines]);
  const stock = useStockLookup(itemIds, canStock);
  const traits = useItemTraits(itemIds, can('catalog.items.read'));
  const detail = useCustomer(customer && can('customers.profiles.read') ? customer.id : undefined);
  const addresses = useCustomerAddresses(customer?.id ?? '', { page: 1, page_size: ADDRESS_PAGE }, isNew && !!customer && can('customers.profiles.addresses.read'));

  const status = inv?.status;
  const lockedWhy = useMemo(() => {
    if (!inv) return null;
    if (amend) {
      if (!can('sales.invoices.amend.approve')) return 'اصلاحیه‌ی فاکتور صادرشده فقط با مجوز اصلاحیه (مدیر ارشد) ممکن است.';
      return status === 'ISSUED' ? null : 'فقط فاکتور صادرشده اصلاحیه می‌گیرد.';
    }
    if (!can('sales.invoices.update')) return 'مجوز ویرایش فاکتور را ندارید.';
    return status === 'DRAFT' ? null : 'فقط پیش‌نویس ویرایش می‌شود؛ فاکتور صادرشده فقط با «اصلاحیه» (مدیر ارشد) تغییر می‌کند.';
  }, [inv, amend, status, can]);
  if (isNew && !can('sales.invoices.create')) return <div className={fx.page}><div className={fx.alert}>مجوز ثبت فاکتور فروش را ندارید.</div></div>;

  const dirtyLines = !!inv && (lines.length !== (inv.lines?.length ?? 0) || lines.some((l) => !l.saved || Math.trunc(Number(l.saved.quantity)) !== l.quantity || (l.saved.warehouse?.id ?? '') !== l.warehouse_id));
  const clearErr = (k: string) => setErrs((x) => (x[k] ? { ...x, [k]: '' } : x));
  const addItems = (rows: PickedItem[]) => {
    setLines((cur) => [...cur, ...rows.filter((r) => !cur.some((l) => l.item_id === r.item.id)).map((r): EditLine => ({
      key: nextKey(), item_id: r.item.id, code: r.item.code, name: r.item.display_name, quantity: r.quantity, warehouse_id: warehouseId, unit: r.unitName,
      traits: { brand: r.item.brand_name ?? '', sizes: r.item.sizes.map((x) => x.name), colors: r.item.colors.map((x) => x.name) },
    }))]);
    setPicking(false); clearErr('lines'); setRowErrors({});
  };
  const setLine = (key: string, patch: Partial<EditLine>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const overCount = canStock ? lines.filter((l) => { const s = lineStock(l, stock); return s !== null && l.quantity > s; }).length : 0;

  const applyServerErrors = (e: unknown) => {
    if (!(e instanceof ApiError)) { setTop([userMessage(e)]); return; }
    if (e.status === HTTP_CONFLICT) { setTop([e.detailText || userMessage(e)]); return; }
    if (e.status !== HTTP_BAD_REQUEST || !e.detail || typeof e.detail !== 'object' || Array.isArray(e.detail)) { setTop([userMessage(e)]); return; }
    const next: Record<string, string> = {};
    const rows: Record<number, string> = {};
    const rest: string[] = [];
    Object.entries(e.detail as Record<string, unknown>).forEach(([k, v]) => {
      const msg = Array.isArray(v) ? String(v[0]) : String(v);
      const m = LINE_KEY.exec(k);
      if (m) rows[Number(m[1])] = msg;
      else if ((HEADER_FIELDS as readonly string[]).includes(k)) next[k] = msg;
      else rest.push(msg);
    });
    setErrs(next); setRowErrors(rows); setTop(rest);
    if (!Object.keys(next).length && !Object.keys(rows).length && !rest.length) setTop([userMessage(e)]);
  };

  const save = async () => {
    setTop([]); setRowErrors({});
    const fe: Record<string, string> = {};
    if (isNew && !customer) fe.customer_id = 'مشتری را انتخاب کنید.';
    if (isNew && superuser && !branchId) fe.branch_id = 'شعبه‌ی سند را انتخاب کنید.';
    if (!lines.length) fe.lines = 'حداقل یک کالا به فاکتور اضافه کنید.';
    const greg = jalaliTextToGregorian(date);
    if (!greg) fe.date = 'تاریخ نامعتبر است.';
    if (amend && !reason.trim()) fe.reason = 'دلیل اصلاحیه الزامی است.';
    setErrs(fe);
    if (Object.keys(fe).length) return;
    const lineBody: LineIn[] = lines.map((l) => ({ item_id: l.item_id, quantity: String(l.quantity), warehouse_id: l.warehouse_id || null }));
    const codes = toLatinDigits(coupons).split(COUPON_SPLIT).map((x) => x.trim().toUpperCase()).filter(Boolean);
    const header = {
      delivery_type: delivery, delivery_warehouse_id: warehouseId || null, settlement_method: method, salesperson_id: seller || null,
      coupon_codes: codes, note: note.trim(),
    };
    try {
      let saved: Invoice;
      if (isNew && customer) {
        const body: InvoiceIn = { ...header, customer_id: customer.id, date: dateTouched ? greg : null, lines: lineBody, ...(superuser && branchId ? { branch_id: branchId } : {}) };
        saved = await w.create.mutateAsync(body);
        toast('پیش‌نویس فاکتور ثبت شد؛ پس از بررسی، «تایید و صدور» را بزنید.');
      } else if (inv && amend) {
        saved = await w.amend.mutateAsync({ id: inv.id, body: { ...header, date: greg, lines: lineBody, reason: reason.trim() } });
        toast(`اصلاحیه‌ی فاکتور ${saved.invoice_number ?? ''} ثبت شد.`);
      } else if (inv) {
        saved = await w.update.mutateAsync({ id: inv.id, body: { ...header, date: greg, lines: lineBody } });
        toast('پیش‌نویس فاکتور ذخیره شد.');
      } else return;
      navigate(`/sales/invoices?open=${saved.id}`, { replace: true });
    } catch (e) { applyServerErrors(e); }
  };

  const busy = w.create.isPending || w.update.isPending || w.amend.isPending;
  const disabled = !!lockedWhy;
  let title = 'فاکتور فروش جدید';
  if (inv) title = amend ? `اصلاحیه‌ی فاکتور ${inv.invoice_number ?? ''}` : 'ویرایش پیش‌نویس فاکتور';
  let saveLabel = 'ثبت فاکتور';
  if (inv) saveLabel = amend ? 'ثبت اصلاحیه' : 'ذخیره تغییرات';
  const dash = '—';
  const warehouseHint = () => {
    if (!branchId) return 'اول شعبه را انتخاب کنید.';
    if (whq.error) return 'فهرست انبارهای شعبه در دسترس نیست (مجوز شعب)؛ بدون انبار هم ثبت می‌شود.';
    return null;
  };
  const pickCustomer = (c: CustomerRow) => { setCustomer(fromRow(c)); clearErr('customer_id'); };
  const pickWarehouse = (v: string) => { setWarehouseId(v); setLines((cur) => cur.map((l) => ({ ...l, warehouse_id: v }))); clearErr('delivery_warehouse_id'); };
  const custLocked = !isNew || disabled;
  const allowCust = can('customers.profiles.list');
  const defaultAddress = (addresses.data?.results ?? []).find((a) => a.is_default) ?? addresses.data?.results?.[0];
  const ci = inv?.customer;
  const cinfo: { k: string; v: React.ReactNode; wide?: boolean }[] = customer ? [
    { k: 'کد اقتصادی', v: ci?.economic_code || detail.data?.economic_code || dash },
    { k: 'شناسه ملی', v: <span data-latin>{customer.national_id || dash}</span> },
    { k: 'تلفن', v: <span data-latin>{ci?.phone || detail.data?.phone || customer.mobile || dash}</span> },
    { k: 'مانده حساب', v: <SoonTag tip="به‌زودی — مانده‌ی حساب مشتری با حسابداری" /> },
    { k: 'نشانی', v: ci ? [ci.province, ci.city, ci.address].filter(Boolean).join('، ') || dash : defaultAddress?.full_address || dash, wide: true },
  ] : [];
  const fieldErr = (k: string) => errs[k] || undefined;

  const custDetail = detail.data;
  let stateCls = fx.stNew;
  let stateLabel = 'پیش‌نویس تازه';
  if (inv) { stateCls = amend ? fx.stAmend : fx.stDraft; stateLabel = amend ? 'اصلاحیه' : 'پیش‌نویس'; }
  const grandReady = !!inv && !dirtyLines;
  const openPicker = () => setPicking(true);

  return (
    <div className={fx.page}>
      <div className={fx.head}>
        <div className={fx.headStart}>
          <div className={fx.mark}><IconFileInvoice size={24} stroke={1.7} /></div>
          <div>
            <div className={fx.titleRow}><h1 className={fx.title}>{title}</h1><span className={`${fx.state} ${stateCls}`}>{stateLabel}</span></div>
            <div className={fx.sub}>اطلاعات سند و طرف حساب را تکمیل کنید و اقلام را از کاتالوگ بیفزایید؛ مبالغ را بک‌اند پس از ثبت حساب می‌کند.</div>
          </div>
        </div>
        <button type="button" className={fx.back} onClick={back}>بازگشت به لیست<IconChevronLeft size={16} /></button>
      </div>

      {lockedWhy ? <div className={fx.lock}><IconLock size={18} stroke={1.8} />{lockedWhy}</div> : null}
      {top.length ? <div className={fx.alert} role="alert">{top.map((t) => <span key={t}>{t}</span>)}</div> : null}

      <div className={fx.top}>
        <section className={`${fx.card} ${fx.cardPad}`} aria-label="اطلاعات فاکتور">
          <Sec title="اطلاعات فاکتور" />
          <div className={fx.grid2}>
            <Field label="شماره فاکتور">
              {inv?.invoice_number ? <div dir="ltr" className={`${fx.ro} ${fx.roNo}`}><span data-latin>{inv.invoice_number}</span></div> : <div className={fx.ro}><IconHash size={16} className={fx.roIcon} /><span className={fx.roPh}>پس از «تایید و صدور»</span></div>}
            </Field>
            <Field label="تاریخ" error={fieldErr('date')}>
              <div className={fx.noLbl}><JalaliDateInput label="" aria-label="تاریخ" className={`${fx.ctl} ${errs.date ? fx.bad : ''}`} value={date} onChange={(e) => { setDate(e.target.value); setDateTouched(true); clearErr('date'); }} dir="ltr" maxYear={1500} disabled={disabled} /></div>
            </Field>
            <Field label="نوع تحویل" error={fieldErr('delivery_type')}>
              <Dropdown aria-label="نوع تحویل" buttonClassName={fx.dd} value={delivery} disabled={disabled} options={keysOf(DELIVERY_TYPE).map((v) => ({ value: v, label: DELIVERY_TYPE[v] }))} onChange={(e) => { setDelivery(e.target.value as DeliveryType); clearErr('delivery_type'); }} />
            </Field>
            <Field label="نحوه تسویه" error={fieldErr('settlement_method')} tip="چکی و اعتباری به سطح همکاری مشتری و مجوز شعبه بستگی دارد؛ بک‌اند هنگام ثبت می‌سنجد.">
              <Dropdown aria-label="نحوه تسویه" buttonClassName={`${fx.dd} ${errs.settlement_method ? fx.bad : ''}`} value={method} disabled={disabled} options={keysOf(SETTLEMENT_METHOD).map((v) => ({ value: v, label: SETTLEMENT_METHOD[v] }))} onChange={(e) => { setMethod(e.target.value as SettlementMethod); clearErr('settlement_method'); }} />
            </Field>
            <Field label="فروشنده" error={fieldErr('salesperson_id')}>
              {staff.data ? (
                <Dropdown aria-label="فروشنده" buttonClassName={fx.dd} value={seller} disabled={disabled} placeholder="خود ثبت‌کننده" options={[{ value: '', label: 'خود ثبت‌کننده' }, ...staff.data.results.map((u) => ({ value: u.id, label: staffName(u) }))]} onChange={(e) => { setSeller(e.target.value); clearErr('salesperson_id'); }} />
              ) : <div className={fx.ro}>{inv?.salesperson?.full_name || 'خود ثبت‌کننده'}</div>}
            </Field>
            <Field label="صادرکننده"><div className={fx.ro}><IconUser size={16} className={fx.roIcon} />{inv?.issuer?.full_name || user?.username || dash}</div></Field>
          </div>
        </section>

        <section className={`${fx.card} ${fx.cardPad}`} aria-label="طرف حساب و انبار">
          <Sec title="طرف حساب و انبار" />
          <div className={fx.pair}>
            <Field label="کد مشتری" required>
              <CustomerSelect show="code" label="کد مشتری" placeholder="انتخاب" value={customer} onPick={pickCustomer} invalid={!!errs.customer_id} disabled={custLocked} allowed={allowCust} buttonClassName={fx.cs} invalidClassName={fx.bad} />
            </Field>
            <Field label="نام مشتری" required error={fieldErr('customer_id')}>
              <CustomerSelect show="name" label="نام مشتری" placeholder="جست‌وجو و انتخاب مشتری…" value={customer} onPick={pickCustomer} invalid={!!errs.customer_id} disabled={custLocked} allowed={allowCust} buttonClassName={fx.cs} invalidClassName={fx.bad} />
            </Field>
            {isNew && superuser ? (
              <Field label="شعبه" required error={fieldErr('branch_id')} span tip="فقط سوپر ادمین شعبه‌ی سند را انتخاب می‌کند؛ برای بقیه شعبه‌ی محل کار است.">
                <Dropdown aria-label="شعبه" buttonClassName={`${fx.dd} ${errs.branch_id ? fx.bad : ''}`} value={branchId} placeholder="انتخاب شعبه" options={(branches.data ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
                  onChange={(e) => { setBranchId(e.target.value); setWarehouseId(''); setLines((c) => c.map((l) => ({ ...l, warehouse_id: '' }))); clearErr('branch_id'); }} />
              </Field>
            ) : null}
            <Field label="کد انبار">
              <Dropdown aria-label="کد انبار" buttonClassName={fx.dd} value={warehouseId} disabled={disabled || !branchId || !!whq.error} placeholder="انتخاب" options={whOptions.map((x) => ({ value: x.value, label: x.code }))} onChange={(e) => pickWarehouse(e.target.value)} />
            </Field>
            <Field label="انبار تحویل" error={fieldErr('delivery_warehouse_id')} hint={warehouseHint()}>
              <Dropdown aria-label="انبار تحویل" buttonClassName={`${fx.dd} ${errs.delivery_warehouse_id ? fx.bad : ''}`} value={warehouseId} disabled={disabled || !branchId || !!whq.error} placeholder="انتخاب انبار" options={whOptions} onChange={(e) => pickWarehouse(e.target.value)} />
            </Field>
            <Field label="کدهای تخفیف" error={fieldErr('coupon_codes')} span tip="اختیاری؛ چند کد را با «،» جدا کنید. تخفیف را فقط قیمت‌گذاری و همین کدها تعیین می‌کنند.">
              <input className={`${fx.inp} ${errs.coupon_codes ? fx.bad : ''}`} dir="ltr" data-latin aria-label="کدهای تخفیف" placeholder="SUMMER10، VIP5" value={coupons} disabled={disabled} onChange={(e) => { setCoupons(e.target.value); clearErr('coupon_codes'); }} />
            </Field>
          </div>
        </section>
      </div>

      {customer ? (
        <section className={`${fx.card} ${fx.cust}`} aria-label="مشخصات مشتری">
          <div className={fx.custId}>
            <span className={fx.custAva} style={{ background: avatarColor(customer.code || customer.name) }} aria-hidden>{initialOf(customer.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div className={fx.custName} title={customer.name}>{customer.name}</div>
              <div className={fx.custMeta}>
                <span className={fx.code} dir="ltr" data-latin>{customer.code}</span>
                {custDetail?.cooperation_level ? <TierBadge level={custDetail.cooperation_level} /> : null}
              </div>
            </div>
          </div>
          <div className={fx.custKv}>
            {cinfo.map((p) => <div key={p.k} className={p.wide ? fx.kvWide : undefined}><div className={fx.kvK}>{p.k}</div><div className={fx.kvV}>{p.v}</div></div>)}
          </div>
        </section>
      ) : (
        <div className={fx.custEmpty}>
          <div className={fx.custEmptyMark}><IconUserSearch size={22} stroke={1.7} /></div>
          <div><div className={fx.custEmptyT}>هنوز مشتری انتخاب نشده است</div><div className={fx.custEmptyS}>با انتخاب مشتری، کد اقتصادی، شناسه ملی، تلفن و نشانی او این‌جا نمایش داده می‌شود.</div></div>
        </div>
      )}

      <section className={`${fx.card} ${fx.items}`} aria-label="اقلام فاکتور">
        <div className={fx.itemsHead}>
          <div className={fx.sec}>
            <div className={fx.secStart}>
              <span className={fx.secBar} />
              <h2 className={fx.secT}>اقلام فاکتور</h2>
              <span className={fx.chip}>{faNum(lines.length)} قلم</span>
              {overCount ? <span className={`${fx.chip} ${fx.chipWarn}`}>{faNum(overCount)} ردیف بیش از موجودی انبار</span> : null}
            </div>
          </div>
          <button type="button" className={fx.add} disabled={disabled} onClick={openPicker}><IconPlus size={17} stroke={2} />افزودن کالا</button>
        </div>
        {errs.lines ? <div className={`${fx.alert} ${fx.itemsErr}`}>{errs.lines}</div> : null}
        <EditLinesTable traits={traits} rows={lines} warehouses={whOptions} stock={stock} showStock={canStock} rowErrors={rowErrors} disabled={disabled}
          onQty={(k, n) => setLine(k, { quantity: n })} onWarehouse={(k, v) => setLine(k, { warehouse_id: v })}
          onRemove={(k) => { setLines((c) => c.filter((l) => l.key !== k)); setRowErrors({}); }} />
      </section>

      <div className={fx.bottom}>
        <section className={`${fx.card} ${fx.cardPad} ${fx.notes}`} aria-label="توضیحات">
          <Sec title="توضیحات" />
          <Field label="توضیحات فاکتور">
            <textarea className={fx.ta} aria-label="توضیحات فاکتور" value={note} disabled={disabled} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: ارسال در کارتن‌های تفکیک‌شده بر اساس سایز" />
          </Field>
          {amend ? (
            <Field label="دلیل اصلاحیه" required error={fieldErr('reason')}>
              <textarea className={`${fx.ta} ${errs.reason ? fx.bad : ''}`} aria-label="دلیل اصلاحیه" value={reason} disabled={disabled} onChange={(e) => { setReason(e.target.value); clearErr('reason'); }} />
            </Field>
          ) : null}
        </section>
        <section className={`${fx.card} ${fx.cardPad}`} aria-label="جمع فاکتور">
          <Sec title="جمع فاکتور" />
          <FormTotals inv={inv} stale={dirtyLines} />
        </section>
      </div>

      <div className={fx.bar}>
        <div className={fx.barActs}>
          <button type="button" className={fx.save} disabled={disabled || busy} onClick={save}><IconCheck size={17} stroke={2} />{busy ? 'در حال ثبت…' : saveLabel}</button>
          {isNew ? <button type="button" className={fx.ghost} onClick={() => navigate(`/sales/invoices/new?n=${Date.now()}`, { replace: true })}>جدید</button> : null}
          <button type="button" className={fx.ghost} onClick={back}>انصراف</button>
        </div>
        <div className={fx.barSum}>
          <span>{faNum(lines.length)} قلم</span>
          <span className={fx.barSep} />
          <span>مبلغ کل: {grandReady ? <b className="tnum">{money(inv?.total_amount)} <span className={fx.sumK}>ریال</span></b> : <span className={fx.pending}>پس از ثبت</span>}</span>
        </div>
      </div>

      <ItemPickerModal open={picking} onClose={() => setPicking(false)} docLabel="فاکتور" docNo={inv?.invoice_number ?? ''} existing={lines.map((l) => l.item_id)}
        warehouses={whOptions} warehouseId={warehouseId || null} onAdd={addItems} />
    </div>
  );
}

/** عنوان بخش سیستم دیزاین: میله‌ی گرادیان + عنوان ۱۵ */
const Sec = ({ title }: { title: string }) => (
  <div className={fx.sec}><div className={fx.secStart}><span className={fx.secBar} /><h2 className={fx.secT}>{title}</h2></div></div>
);

/** فیلد فرم: برچسب ۱۲.۵ (ستاره‌ی الزامی، آیکون راهنما با data-tip)، کنترل، و خطا یا راهنما زیر آن */
function Field({ label, required, error, hint, tip, span, children }: { label: string; required?: boolean; error?: string; hint?: React.ReactNode; tip?: string; span?: boolean; children: React.ReactNode }) {
  return (
    <div className={`${fx.field} ${span ? fx.span : ''}`}>
      <span className={fx.lbl}>{label}{required ? <span className={fx.req}>*</span> : null}{tip ? <span className={fx.tipIcon} data-tip={tip}><IconInfoCircle size={14} stroke={1.8} /></span> : null}</span>
      {children}
      {error ? <div className={fx.err}>{error}</div> : null}
      {!error && hint ? <div className={fx.hint}>{hint}</div> : null}
    </div>
  );
}
