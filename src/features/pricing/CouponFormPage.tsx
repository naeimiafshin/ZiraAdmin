import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { IconCheck, IconInfoCircle, IconPackage, IconPlus, IconUsers, IconUsersGroup, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { faNum, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useBack } from '@/shared/lib/useBack';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Field, FormGrid, Input, Select, Toggle } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Card, Empty, PageHead, Segmented, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { dayEnd, dayStart, useCoupon, useCouponWrite, useDiscount, type DiscountIn, isoToJalaliInput } from './marketingApi';
import { ITEM_TARGETS, ScopeModal, fromAudiences, fromTargets, summarize, toAudiences, toTargets, type Pick, type PickType } from './ScopePicker';
import { VALUE_TYPE } from './marketingLabels';
import { decimal, digits } from './mkShared';
import s from '@/features/catalog/catalog.module.css';
import m from './marketing.module.css';

/**
 * «ایجاد / ویرایش کد تخفیف» (html V2 pc-10x-mk-cpn؛ بازطراحی افشین 2026-10-24).
 * ساخت: یک تخفیف کددار (trigger=COUPON) + اولین کد در یک درخواست (POST /pricing/coupons).
 * دامنه: دو بخش جدا — «محصولات» (همه / آیتم‌ها و باندل‌های انتخابی) و «مشتریان» (همه / مشتریان انتخابی / گروه مشتریان)؛
 * دکمه‌ی انتخاب بر اساس گزینه‌ی دراپ‌داون نمایان می‌شود و مودال کامل (جدول، جست‌وجو، فیلترها، مربع انتخاب) باز می‌کند.
 * نوع بک‌اند: محصولات همه ⇐ CART (+ مخاطب اگر مشتری انتخابی)، محصولات انتخابی ⇐ ITEM یا ITEM_CUSTOMER. ارسال رایگان فقط برای کل سبد (CART).
 * ویرایش (`/pricing/discounts/coupons/:id/edit`): همه‌ی فیلدها جز متن کد ⇐ PUT /discounts/{discount_id} (محتوا؛ تغییر محتوای تخفیف فعال آن را پیش‌نویس می‌کند)
 * + PUT /coupons/{id} (سقف‌ها و انقضا)؛ اگر کد پیش از ویرایش فعال بود و «فعال‌سازی فوری» روشن است، دوباره تأیید می‌شود.
 */
type Prod = 'ALL' | 'PICK';
type Cust = 'ALL' | 'CUSTOMERS' | 'GROUPS';
const CUST_TYPES: Record<Exclude<Cust, 'ALL'>, PickType[]> = { CUSTOMERS: ['CUSTOMER'], GROUPS: ['GROUP', 'COOPERATION_LEVEL'] };

export default function CouponFormPage() {
  const { id: editId } = useParams();
  const isEdit = !!editId;
  const can = usePerm(); const navigate = useNavigate(); const back = useBack('/pricing/discounts?tab=codes'); const toast = useToast(); const w = useCouponWrite();
  const cq = useCoupon(editId); const dq = useDiscount(cq.data?.discount_id);
  const [code, setCode] = useState(''); const [vt, setVt] = useState<'PERCENT' | 'AMOUNT' | 'FREE_SHIPPING'>('PERCENT'); const [val, setVal] = useState('');
  const [minAmount, setMinAmount] = useState(''); const [minQty, setMinQty] = useState('');
  const [prod, setProd] = useState<Prod>('ALL'); const [prodPicks, setProdPicks] = useState<Pick[]>([]);
  const [cust, setCust] = useState<Cust>('ALL'); const [custPicks, setCustPicks] = useState<Pick[]>([]);
  const [modal, setModal] = useState<'prod' | 'cust' | null>(null);
  const [limit, setLimit] = useState(''); const [per, setPer] = useState('1');
  /** تعداد کد (افشین 2026-10-25): ۱ تا ۵۰۰؛ بیش از یکی ⇐ متن کدها را سیستم می‌سازد (فیلد کد خالی و خاموش) */
  const [count, setCount] = useState('1'); const many = Number(count || '1') > 1;
  const [more, setMore] = useState(''); const [issuing, setIssuing] = useState(false);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const canApprove = can('pricing.discounts.approve'); const [instant, setInstant] = useState(true);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    const c = cq.data, d = dq.data; if (!c || !d || loaded.current) return; loaded.current = true;
    setCode(c.code_text); setVt(d.value_type as typeof vt); setVal(d.value_type === 'AMOUNT' ? String(Number(d.fixed_amount ?? '')) : d.value_type === 'PERCENT' ? String(Number(d.percent ?? '')) : '');
    setMinAmount(d.min_amount ? String(Number(d.min_amount)) : ''); setMinQty(d.min_qty ? String(Number(d.min_qty)) : '');
    const t = fromTargets(d.targets); setProd(t.length ? 'PICK' : 'ALL'); setProdPicks(t);
    const a = fromAudiences(d.audiences); setCustPicks(a); setCust(!a.length ? 'ALL' : a.every((x) => x.type === 'CUSTOMER') ? 'CUSTOMERS' : 'GROUPS');
    setLimit(c.usage_limit ? String(c.usage_limit) : ''); setPer(c.per_customer_limit ? String(c.per_customer_limit) : '');
    setFrom(isoToJalaliInput(d.start_at)); setTo(isoToJalaliInput(c.expires_at ?? d.end_at));
    setInstant(d.status === 'ACTIVE');
  }, [cq.data, dq.data]);
  useEffect(() => { setErr(null); }, [prod, cust, vt]);
  const prodLabel = prod === 'ALL' ? 'همه محصولات (کل سبد خرید)' : summarize(prodPicks, 'آیتم/باندل انتخابی');
  const custLabel = cust === 'ALL' ? 'همه مشتریان' : summarize(custPicks, cust === 'CUSTOMERS' ? 'مشتریان انتخابی' : 'گروه مشتریان');
  /** عنوان تخفیف کددار = دامنه (ستون «دامنه اعمال» فهرست کدها) */
  const title = (prod === 'ALL' ? 'کل سبد خرید' : summarize(prodPicks, '')) + (cust === 'ALL' ? '' : ` — ${summarize(custPicks, '')}`);
  const kind = prod === 'ALL' ? 'CART' : cust === 'ALL' ? 'ITEM' : 'ITEM_CUSTOMER';
  const submit = async () => {
    setErr(null);
    const c = code.trim().toUpperCase();
    if (!isEdit && (Number(count || '0') < 1 || Number(count) > 500)) { setErr('تعداد کد باید بین ۱ و ۵۰۰ باشد.'); return; }
    if (!isEdit && !many && !c) { setErr('کد تخفیف را وارد کنید.'); return; }
    if (!isEdit && !many && !/^[A-Z0-9_-]{3,40}$/.test(c)) { setErr('کد تخفیف فقط حروف و اعداد انگلیسی (۳ تا ۴۰ نویسه) است.'); return; }
    if (vt !== 'FREE_SHIPPING') { const n = Number(val); if (!val || Number.isNaN(n) || n <= 0 || (vt === 'PERCENT' && n > 100)) { setErr(vt === 'PERCENT' ? 'درصد تخفیف باید بین ۰ و ۱۰۰ باشد.' : 'مبلغ تخفیف را وارد کنید.'); return; } }
    if (vt === 'FREE_SHIPPING' && prod === 'PICK') { setErr('ارسال رایگان فقط روی کل سبد خرید اعمال می‌شود؛ محصولات را «همه محصولات» بگذارید.'); return; }
    if (prod === 'PICK' && !prodPicks.length) { setErr('حداقل یک آیتم یا باندل انتخاب کنید (یا «همه محصولات»).'); return; }
    if (cust !== 'ALL' && !custPicks.length) { setErr(cust === 'CUSTOMERS' ? 'حداقل یک مشتری انتخاب کنید (یا «همه مشتریان»).' : 'حداقل یک گروه یا سطح همکاری انتخاب کنید.'); return; }
    const gf = from ? jalaliTextToGregorian(from) : null, gt = to ? jalaliTextToGregorian(to) : null;
    if ((from && !gf) || (to && !gt)) { setErr('تاریخ واردشده معتبر نیست.'); return; }
    if (gf && gt && gt < gf) { setErr('پایان بازه باید بعد از شروع باشد.'); return; }
    if (isEdit && limit && Number(limit) < (cq.data?.used_count ?? 0)) { setErr(`سقف کل نمی‌تواند کمتر از تعداد استفاده‌شده (${faNum(cq.data!.used_count)}) باشد.`); return; }
    const discount: DiscountIn = {
      kind: kind as DiscountIn['kind'], trigger: 'COUPON', title: title.slice(0, 200), value_type: vt,
      percent: vt === 'PERCENT' ? val : null, fixed_amount: vt === 'AMOUNT' ? val : null, min_qty: minQty || null, min_amount: minAmount || null,
      start_at: gf ? dayStart(gf) : null, end_at: gt ? dayEnd(gt) : null,
      targets: prod === 'PICK' ? toTargets(prodPicks) : [], audiences: cust === 'ALL' ? [] : toAudiences(custPicks),
    };
    const lim = { usage_limit: limit ? Number(limit) : null, per_customer_limit: per ? Number(per) : null, expires_at: gt ? dayEnd(gt) : null };
    setBusy(true);
    try {
      if (isEdit) {
        const d0 = dq.data!; const wasActive = d0.status === 'ACTIVE';
        const d1 = await adminApi<{ status: string }>(`/pricing/discounts/${d0.id}`, { method: 'PUT', body: discount });
        await w.update.mutateAsync({ id: editId!, body: lim });
        if (d1.status === 'DRAFT' && instant && canApprove) {
          try { await adminApi(`/pricing/discounts/${d0.id}/approve`, { method: 'POST' }); toast(wasActive ? 'تغییرات کد ذخیره و دوباره فعال شد.' : 'تغییرات کد ذخیره و فعال شد.'); }
          catch (e) { toast(`تغییرات ذخیره شد ولی فعال‌سازی انجام نشد: ${userMessage(e)}`, 'error'); }
        } else toast(d1.status === 'DRAFT' ? 'تغییرات کد ذخیره شد؛ تخفیف آن پیش‌نویس است و پس از تأیید قابل استفاده می‌شود.' : 'تغییرات کد ذخیره شد.');
      } else {
        const n = Number(count || '1');
        const made = await w.create.mutateAsync({ discount, coupon: { code_text: many ? '' : c, count: n, ...lim } });
        const what = many ? `${faNum(n)} کد تخفیف` : 'کد تخفیف';
        if (instant && canApprove) {
          try { await adminApi(`/pricing/discounts/${made.discount_id}/approve`, { method: 'POST' }); toast(`${what} ساخته و فعال شد.`); }
          catch (e) { toast(`${what} ساخته شد ولی فعال‌سازی انجام نشد: ${userMessage(e)}`, 'error'); }
        } else toast(`${what} ساخته شد؛ تخفیف آن پیش‌نویس است و پس از تأیید قابل استفاده می‌شود.`);
      }
      navigate('/pricing/discounts?tab=codes', { replace: true });
    } catch (e) { setErr(userMessage(e)); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };
  /** ویرایش ⇐ صدور کد بیشتر برای همین تخفیف (POST /discounts/{id}/coupons، count ۱ تا ۵۰۰، کد خودکار؛ سقف‌ها و انقضا = مقادیر همین فرم) */
  const issueMore = async () => {
    const n = Number(more || '0'); setErr(null);
    if (n < 1 || n > 500) { setErr('تعداد کدهای تازه باید بین ۱ و ۵۰۰ باشد.'); return; }
    const gt = to ? jalaliTextToGregorian(to) : null;
    setIssuing(true);
    try {
      const r = await w.issue.mutateAsync({ discountId: dq.data!.id, body: { count: n, usage_limit: limit ? Number(limit) : null, per_customer_limit: per ? Number(per) : null, expires_at: gt ? dayEnd(gt) : null } });
      toast(`${faNum(r.count)} کد تازه برای همین تخفیف ساخته شد.`); setMore('');
    } catch (e) { setErr(userMessage(e)); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setIssuing(false); }
  };
  if (isEdit && (cq.isLoading || dq.isLoading || (!dq.data && !cq.error && !dq.error))) return <Card><SkeletonRows rows={6} height={56} /></Card>;
  if (isEdit && (cq.error || dq.error)) return <Card><Empty title="کد تخفیف پیدا نشد" text={userMessage(cq.error ?? dq.error)} /></Card>;
  const valueText = vt === 'FREE_SHIPPING' ? 'ارسال رایگان' : val ? (vt === 'PERCENT' ? `${toFaDigits(val)}٪` : `${faNum(val)} ریال`) : '—';
  const shared = (dq.data?.coupon_count ?? 1) > 1;
  return (
    <>
      <PageHead title={isEdit ? <>ویرایش کد تخفیف <span data-latin>{cq.data?.code_text}</span></> : 'ایجاد کد تخفیف'} sub={isEdit ? 'همه‌ی مشخصات جز متن کد قابل ویرایش است.' : 'کد قابل‌اشتراک با سقف استفاده و محدودیت زمانی بسازید.'} back={back} />
      <div className={m.formPage}>
        <div>
          {err ? <Alert>{err}</Alert> : null}
          {isEdit && shared ? <Alert tone="info">این تخفیف {faNum(dq.data!.coupon_count)} کد دارد؛ تغییر مقدار، دامنه و شرط‌ها روی همه‌ی آن کدها اثر می‌گذارد. سقف‌ها و انقضا فقط برای همین کد است.</Alert> : null}
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>مشخصات کد</h3>
            <FormGrid cols={2}>
              <Input label="کد تخفیف" required={!isEdit && !many} latin dir="ltr" value={many ? '' : code} disabled={isEdit || many} onChange={(e) => setCode(toLatinDigits(e.target.value).toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} maxLength={40} placeholder={many ? 'خودکار' : 'WELCOME15'} hint={isEdit ? 'متن کد پس از ساخت تغییر نمی‌کند' : many ? 'برای چند کد، متن کدها را سیستم می‌سازد' : 'فقط حروف و اعداد انگلیسی'} />
              {!isEdit ? <Input label="تعداد کد" dir="ltr" inputMode="numeric" value={toFaDigits(count)} onChange={(e) => setCount(digits(e.target.value).slice(0, 3))} placeholder="۱" hint="۱ تا ۵۰۰ · همه با همین مقدار، دامنه و محدودیت" /> : null}
              <div><div className={m.label}>نوع *</div>
                <Segmented value={vt} onChange={(v) => { setVt(v); setVal(''); }} options={[{ value: 'PERCENT', label: 'درصدی' }, { value: 'AMOUNT', label: 'مبلغی' }, { value: 'FREE_SHIPPING', label: 'ارسال رایگان', disabled: prod === 'PICK', tip: prod === 'PICK' ? 'فقط برای کل سبد خرید' : undefined }]} /></div>
              <Input label={vt === 'AMOUNT' ? 'مقدار (ریال)' : 'مقدار (٪)'} required={vt !== 'FREE_SHIPPING'} dir="ltr" inputMode="decimal" disabled={vt === 'FREE_SHIPPING'} value={vt === 'AMOUNT' ? (val ? faNum(Number(val)) : '') : toFaDigits(val)} onChange={(e) => setVal(vt === 'PERCENT' ? decimal(e.target.value) : digits(e.target.value))} placeholder={vt === 'FREE_SHIPPING' ? 'ارسال رایگان' : '۰'} />
              <Input label="حداقل مبلغ سبد خرید (ریال، اختیاری)" dir="ltr" inputMode="numeric" value={minAmount ? faNum(Number(minAmount)) : ''} onChange={(e) => setMinAmount(digits(e.target.value))} placeholder="بدون حداقل" />
            </FormGrid>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 6 }}>دامنه اعمال و شرط خرید</h3>
            <p className={m.cardSub}>روی چه محصولاتی و برای چه مشتریانی کار کند؛ هر کدام را می‌توانید روی «همه» بگذارید.</p>
            <div className={m.scopeSec} data-scope-products>
              <div className={m.scopeHead}><IconPackage size={18} /><b>محصولات</b></div>
              <div className={m.scopeRow}>
                <Select label="اعمال روی" value={prod} onChange={(e) => { const v = e.target.value as Prod; setProd(v); if (v === 'ALL') setProdPicks([]); }} options={[{ value: 'ALL', label: 'همه محصولات (کل سبد خرید)' }, { value: 'PICK', label: 'آیتم‌ها و باندل‌های انتخابی' }]} />
                {prod === 'PICK' ? <Field label="آیتم / باندل"><Button variant="secondary" icon={<IconPackage size={16} />} onClick={() => setModal('prod')} data-pick-products>{prodPicks.length ? `ویرایش انتخاب (${faNum(prodPicks.length)})` : 'انتخاب آیتم / باندل'}</Button></Field> : null}
              </div>
              {prod === 'PICK' ? <PickChips picks={prodPicks} onChange={setProdPicks} empty="هنوز آیتم یا باندلی انتخاب نشده است." /> : null}
            </div>
            <div className={m.scopeSep} role="separator" />
            <div className={m.scopeSec} data-scope-customers>
              <div className={m.scopeHead}><IconUsers size={18} /><b>مشتریان</b></div>
              <div className={m.scopeRow}>
                <Select label="قابل استفاده برای" value={cust} onChange={(e) => { setCust(e.target.value as Cust); setCustPicks([]); }} options={[{ value: 'ALL', label: 'همه مشتریان' }, { value: 'CUSTOMERS', label: 'مشتریان انتخابی' }, { value: 'GROUPS', label: 'گروه مشتریان' }]} />
                {cust !== 'ALL' ? <Field label={cust === 'CUSTOMERS' ? 'مشتری' : 'گروه'}><Button variant="secondary" icon={cust === 'CUSTOMERS' ? <IconUsers size={16} /> : <IconUsersGroup size={16} />} onClick={() => setModal('cust')} data-pick-customers>{custPicks.length ? `ویرایش انتخاب (${faNum(custPicks.length)})` : cust === 'CUSTOMERS' ? 'انتخاب مشتری' : 'انتخاب گروه مشتریان'}</Button></Field> : null}
              </div>
              {cust !== 'ALL' ? <PickChips picks={custPicks} onChange={setCustPicks} empty={cust === 'CUSTOMERS' ? 'هنوز مشتری‌ای انتخاب نشده است.' : 'هنوز گروهی انتخاب نشده است.'} /> : null}
            </div>
            <div className={m.scopeSep} role="separator" />
            <FormGrid cols={2}>
              <Input label="حداقل تعداد خرید" dir="ltr" inputMode="numeric" value={toFaDigits(minQty)} onChange={(e) => setMinQty(digits(e.target.value))} placeholder="عدد" hint="کمتر از این تعداد، کد اعمال نمی‌شود" />
            </FormGrid>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>محدودیت استفاده</h3>
            <FormGrid cols={2}>
              <Input label="سقف کل استفاده" dir="ltr" inputMode="numeric" value={toFaDigits(limit)} onChange={(e) => setLimit(digits(e.target.value))} placeholder="بار" hint={isEdit ? `خالی = نامحدود · تاکنون ${faNum(cq.data?.used_count ?? 0)} بار استفاده شده` : 'خالی = نامحدود'} />
              <Input label="سقف هر کاربر" dir="ltr" inputMode="numeric" value={toFaDigits(per)} onChange={(e) => setPer(digits(e.target.value))} placeholder="بار" hint="خالی = نامحدود" />
              <JalaliDateInput label="شروع اعتبار" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" maxYear={1500} />
              <JalaliDateInput label="پایان اعتبار (انقضای کد)" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" maxYear={1500} />
            </FormGrid>
            <div className={s.switchBox}>
              <span><b>فعال‌سازی فوری</b><div className={s.sub}>{canApprove ? (isEdit ? 'پس از ذخیره، کد قابل استفاده بماند (تخفیف آن دوباره تأیید می‌شود).' : 'کد بلافاصله قابل استفاده باشد (تخفیف آن تأیید می‌شود).') : 'مجوز تأیید تخفیف را ندارید؛ کد پس از تأیید مدیر فعال می‌شود.'}</div></span>
              <Toggle checked={instant && canApprove} onChange={setInstant} disabled={!canApprove} />
            </div>
          </Card>
          {isEdit && can('pricing.coupons.create') ? (
            <Card>
              <h3 className={m.cardTitle} style={{ marginBottom: 8 }}>صدور کد بیشتر برای همین تخفیف</h3>
              <p className={s.sub} style={{ margin: '0 0 12px' }}>کدهای تازه با متن خودکار ساخته می‌شوند و مقدار، دامنه و شرط‌های همین تخفیف را دارند؛ سقف‌ها و انقضا از «محدودیت استفاده» همین فرم.</p>
              <div className={s.swRow} style={{ gap: 10, alignItems: 'flex-end' }}>
                <div style={{ width: 160 }}><Input label="تعداد کد تازه" dir="ltr" inputMode="numeric" value={toFaDigits(more)} onChange={(e) => setMore(digits(e.target.value).slice(0, 3))} placeholder="۱ تا ۵۰۰" /></div>
                <Button variant="secondary" icon={<IconPlus size={17} />} onClick={issueMore} loading={issuing} disabled={!more}>صدور کدها</Button>
              </div>
            </Card>
          ) : null}
          <div className={m.actionsBar}>
            <Button icon={<IconCheck size={17} />} onClick={submit} loading={busy}>{isEdit ? 'ذخیره تغییرات' : 'ساخت کد'}</Button>
            <Button variant="secondary" onClick={back}>انصراف</Button>
          </div>
        </div>
        <aside className={m.side}>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 8 }}>خلاصه کد</h3>
            <div className={m.sumRow}><span>کد</span><b data-latin style={{ color: 'var(--brand)' }}>{many ? <span style={{ fontFamily: 'inherit' }}>{faNum(Number(count))} کد خودکار</span> : code || '—'}</b></div>
            <div className={m.sumRow}><span>نوع</span><b>{VALUE_TYPE[vt]}</b></div>
            <div className={m.sumRow}><span>مقدار</span><b>{valueText}</b></div>
            <div className={m.sumRow}><span>حداقل سبد</span><b>{minAmount ? `${faNum(Number(minAmount))} ریال` : '—'}</b></div>
            <div className={m.sumRow}><span>محصولات</span><b>{prodLabel}</b></div>
            <div className={m.sumRow}><span>مشتریان</span><b>{custLabel}</b></div>
            <div className={m.sumRow}><span>سقف استفاده</span><b>{limit ? `${faNum(limit)} بار` : 'نامحدود'}</b></div>
            <div className={m.sumRow}><span>انقضا</span><b className="tnum">{to || '—'}</b></div>
          </Card>
          <div className={m.sumNote}><IconInfoCircle size={15} style={{ verticalAlign: -3 }} /> مشتری این کد را هنگام پرداخت وارد می‌کند.</div>
        </aside>
      </div>
      {modal === 'prod' ? <ScopeModal title="انتخاب آیتم / باندل" types={ITEM_TARGETS} value={prodPicks} onClose={() => setModal(null)} onDone={(p) => { setProdPicks(p); setModal(null); }} /> : null}
      {modal === 'cust' && cust !== 'ALL' ? <ScopeModal title={cust === 'CUSTOMERS' ? 'انتخاب مشتری' : 'انتخاب گروه مشتریان'} types={CUST_TYPES[cust]} value={custPicks} onClose={() => setModal(null)} onDone={(p) => { setCustPicks(p); setModal(null); }} /> : null}
    </>
  );
}

function PickChips({ picks, onChange, empty }: { picks: Pick[]; onChange: (p: Pick[]) => void; empty: string }) {
  if (!picks.length) return <p className={m.hint} style={{ margin: '8px 0 0' }}>{empty}</p>;
  return (
    <div className={m.chips} data-picks>
      {picks.map((x) => (
        <span key={`${x.type}:${x.id}`} className={m.chip}>{x.label}
          <button type="button" aria-label={`حذف ${x.label}`} onClick={() => onChange(picks.filter((y) => !(y.type === x.type && y.id === x.id)))}><IconX size={12} /></button>
        </span>
      ))}
    </div>
  );
}
