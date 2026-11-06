import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { IconCheck, IconDiscount, IconInfoCircle, IconPhoto, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits } from '@/shared/lib/text';
import { useBack } from '@/shared/lib/useBack';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, PickerField, Select, Textarea, Toggle } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Card, Modal, PageHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useActiveCustomerGroups } from '@/features/catalog/api';
import { CHANNEL } from './labels';
import { dayEnd, dayStart, useCampaign, useCampaignNatures, useCampaignWrite, useDiscounts, type CampaignIn, isoToJalaliInput } from './marketingApi';
import { CAMPAIGN_STATUS, discountBadge } from './marketingLabels';
import { AUDIENCE_TYPES, ScopeField, TARGET_TYPES, fromAudiences, fromTargets, toAudiences, toTargets, type Pick } from './ScopePicker';
import { digits, showValue } from './mkShared';
import s from '@/features/catalog/catalog.module.css';
import m from './marketing.module.css';
import { groupMoney } from '@/shared/lib/money';

/**
 * «کمپین جدید / ویرایش کمپین» — html V2 (pc-10x-mk-cpnew): مشخصات (نام، ماهیت، کانال، بودجه)، زمان‌بندی و هدف، دامنه (محصول، مشتری)،
 * قوانین تخفیف (حداقل مبلغ/تعداد، سقف تخفیف، سقف استفاده، هم‌پوشانی) + تخفیف‌های مرتبط (discount_ids)، بنر و توضیحات، خلاصه‌ی کنار صفحه.
 * «ذخیره به عنوان پیش‌نویس» ⇐ POST/PUT؛ «ثبت و انتشار» ⇐ همان + publish (مجوز pricing.campaigns.approve). بنر بعد از ذخیره با PUT banner (حداکثر ۲MB، JPEG/PNG/WebP).
 * تاریخ‌ها روزانه‌اند (شروع ۰۰:۰۰، پایان ۲۳:۵۹:۵۹ به وقت تهران). دامنه‌ی خالی = همه.
 */
type Link = { id: string; title: string };

export default function CampaignFormPage() {
  const { id } = useParams(); const isEdit = !!id;
  const can = usePerm(); const navigate = useNavigate(); const back = useBack('/pricing/campaigns'); const toast = useToast(); const w = useCampaignWrite();
  const ed = useCampaign(id); const groups = useActiveCustomerGroups(true);
  const [name, setName] = useState(''); const [nature, setNature] = useState(''); const [channel, setChannel] = useState('ALL'); const [budget, setBudget] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [goal, setGoal] = useState('');
  const [prd, setPrd] = useState<Pick[]>([]); const [cus, setCus] = useState<Pick[]>([]);
  const [minCart, setMinCart] = useState(''); const [minQty, setMinQty] = useState(''); const [cap, setCap] = useState(''); const [limit, setLimit] = useState('');
  const [stackD, setStackD] = useState(false); const [stackC, setStackC] = useState(true);
  const [discounts, setDiscounts] = useState<Link[]>([]);
  const [banner, setBanner] = useState<File | null>(null); const [desc, setDesc] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const loaded = useRef(false); const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const c = ed.data; if (!c || loaded.current || groups.isLoading) return; loaded.current = true;
    setName(c.name); setNature(c.nature); setChannel(c.channel); setBudget(c.budget ? String(Number(c.budget)) : '');
    setFrom(isoToJalaliInput(c.starts_at)); setTo(isoToJalaliInput(c.ends_at)); setGoal(c.goal);
    setPrd(fromTargets(c.targets)); { const a0 = fromAudiences(c.audiences, groups.data); setCus(a0); }
    setMinCart(c.min_cart_amount ? String(Number(c.min_cart_amount)) : ''); setMinQty(c.min_qty ? String(Number(c.min_qty)) : ''); setCap(c.max_discount_cap ? String(Number(c.max_discount_cap)) : ''); setLimit(c.usage_limit ? String(c.usage_limit) : '');
    setStackD(c.stack_with_discount); setStackC(c.stack_with_coupon); setDiscounts(c.discounts.map((d) => ({ id: d.id, title: d.title }))); setDesc(c.description);
  }, [ed.data, groups.data, groups.isLoading]);
  // ماهیت‌ها از تنظیمات (فقط آرشیونشده)؛ ماهیت آرشیوشده‌ی کمپین در حال ویرایش با nature_display به گزینه‌ها اضافه می‌شود (2026-10-24)
  const naturesQ = useCampaignNatures();
  const natureOpts = useMemo(() => {
    const list = (naturesQ.data ?? []).map((x) => ({ code: x.code, name: x.name, hint: x.description }));
    const cur = ed.data;
    if (cur && cur.nature && !list.some((x) => x.code === cur.nature)) list.push({ code: cur.nature, name: cur.nature_display || cur.nature, hint: 'آرشیوشده؛ برای کمپین تازه پیشنهاد نمی‌شود' });
    return list;
  }, [naturesQ.data, ed.data]);
  useEffect(() => { if (!isEdit && !nature && natureOpts[0]) setNature(natureOpts[0].code); }, [isEdit, nature, natureOpts]);
  const cover = useMemo(() => (banner ? URL.createObjectURL(banner) : ed.data?.banner_url || null), [banner, ed.data?.banner_url]);
  useEffect(() => () => { if (cover?.startsWith('blob:')) URL.revokeObjectURL(cover); }, [cover]);
  const archived = ed.data?.status === 'ARCHIVED';
  const canPublish = can('pricing.campaigns.approve') && (!ed.data || ed.data.status === 'DRAFT' || ed.data.status === 'DISABLED');
  const save = async (publish: boolean) => {
    setErr(null);
    if (!name.trim()) { setErr('نام کمپین را وارد کنید.'); return; }
    if (!nature) { setErr('ماهیت کمپین را انتخاب کنید.'); return; }
    const gf = jalaliTextToGregorian(from), gt = jalaliTextToGregorian(to);
    if (!gf || !gt) { setErr('تاریخ شروع و پایان کمپین را وارد کنید.'); return; }
    if (gt < gf) { setErr('تاریخ پایان باید بعد از تاریخ شروع باشد.'); return; }
    if (!goal.trim()) { setErr('هدف کمپین را بنویسید.'); return; }
    if (banner && banner.size > 2 * 1024 * 1024) { setErr('حجم بنر حداکثر ۲ مگابایت است.'); return; }
    const body: CampaignIn = {
      name: name.trim(), nature: nature as CampaignIn['nature'], channel: channel as CampaignIn['channel'], budget: budget || null,
      starts_at: dayStart(gf), ends_at: dayEnd(gt), goal: goal.trim(), description: desc,
      targets: toTargets(prd), audiences: toAudiences(cus), discount_ids: discounts.map((d) => d.id),
      min_cart_amount: minCart || null, min_qty: minQty || null, max_discount_cap: cap || null, usage_limit: limit ? Number(limit) : null,
      stack_with_discount: stackD, stack_with_coupon: stackC,
    };
    setBusy(publish ? 'publish' : 'draft');
    try {
      const c = isEdit ? await w.update.mutateAsync({ id: id!, body }) : await w.create.mutateAsync(body);
      let bannerErr: string | null = null;
      if (banner) { try { await w.banner.mutateAsync({ id: c.id, file: banner }); } catch (e) { bannerErr = userMessage(e); } }
      if (bannerErr) { toast(`کمپین ذخیره شد ولی بنر بارگذاری نشد: ${bannerErr}`, 'error'); setBanner(null); navigate(`/pricing/campaigns/${c.id}/edit`, { replace: true }); return; }
      if (publish) {
        try { await w.publish.mutateAsync(c.id); toast(`کمپین «${c.name}» ثبت و منتشر شد.`); }
        catch (e) { toast(`کمپین ذخیره شد ولی منتشر نشد: ${userMessage(e)}`, 'error'); navigate(`/pricing/campaigns/${c.id}/edit`, { replace: true }); return; }
      } else toast(isEdit ? 'کمپین ذخیره شد.' : `کمپین «${c.name}» به‌صورت پیش‌نویس ذخیره شد.`);
      navigate('/pricing/campaigns');
    } catch (e) { setErr(userMessage(e)); } finally { setBusy(null); }
  };
  if (isEdit && !ed.data) return <><PageHead title="ویرایش کمپین" back={back} /><Card>{ed.error ? <Alert>{userMessage(ed.error)}</Alert> : <span className={s.muted}>در حال بارگذاری…</span>}</Card></>;
  return (
    <>
      <PageHead title={isEdit ? `ویرایش کمپین «${ed.data?.name}»` : 'کمپین جدید'} sub="کمپین فروش، مناسبتی یا وفاداری را برنامه‌ریزی و پایش کنید." back={back} />
      <div className={m.formPage}>
        <div>
          {err ? <Alert>{err}</Alert> : null}
          {archived ? <Alert>این کمپین آرشیو شده و قابل ویرایش نیست.</Alert> : null}
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>مشخصات کمپین</h3>
            <Input label="نام کمپین" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="مثال: حراج پایان فصل پاییز" />
            <div className={m.label} style={{ marginTop: 14 }}>ماهیت کمپین *</div>
            <div className={m.radios} role="radiogroup" aria-label="ماهیت کمپین">
              {natureOpts.map((o) => (
                <button key={o.code} type="button" role="radio" aria-checked={nature === o.code} className={`${s.radioCard} ${nature === o.code ? s.radioCardOn : ''}`} onClick={() => setNature(o.code)}>
                  <span className={`${s.radio} ${nature === o.code ? s.radioOn : ''}`} /><span><b>{o.name}</b><small>{o.hint}</small></span>
                </button>
              ))}
              {naturesQ.isSuccess && natureOpts.length === 0 ? <span className={m.label}>هیچ ماهیت فعالی تعریف نشده است؛ از «تنظیمات ⇐ ماهیت‌های کمپین» یکی بسازید یا از آرشیو برگردانید.</span> : null}
            </div>
            <div className={m.secGap}><FormGrid cols={2}>
              <Select label="کانال‌ها" value={channel} onChange={(e) => setChannel(e.target.value)} options={Object.entries(CHANNEL).map(([value, label]) => ({ value, label }))} />
              <Input label="بودجه کمپین (ریال)" dir="ltr" inputMode="numeric" value={budget ? faNum(Number(budget)) : ''} onChange={(e) => setBudget(digits(e.target.value))} placeholder="۰"  hint="خالی = بدون سقف بودجه" />
            </FormGrid></div>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>زمان‌بندی</h3>
            <FormGrid cols={2}>
              <JalaliDateInput label="تاریخ شروع" required value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" maxYear={1500} />
              <JalaliDateInput label="تاریخ پایان" required value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" maxYear={1500} />
            </FormGrid>
            <div className={m.secGap}><Textarea label="هدف کمپین" required value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={4000} placeholder="مثال: افزایش فروش به میزان ۴ درصد در ۲۰ روز آینده" hint="هدف را با عبارت خود بنویسید؛ در گزارش عملکرد کمپین نمایش داده می‌شود" /></div>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>دامنه کمپین</h3>
            <FormGrid cols={2}>
              <ScopeField label="انتخاب محصول" all="همه محصولات" types={TARGET_TYPES} value={prd} onChange={setPrd} hint="آیتم، باندل یا دسته‌بندی؛ خالی = همه محصولات" />
              <ScopeField label="انتخاب مشتری" all="همه مشتریان" types={AUDIENCE_TYPES} value={cus} onChange={setCus} hint="مشتری، گروه یا سطح همکاری؛ خالی = همه مشتریان" />
            </FormGrid>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>قوانین تخفیف</h3>
            <FormGrid cols={2}>
              <Input label="حداقل مبلغ خرید (ریال)" dir="ltr" inputMode="numeric" value={groupMoney(minCart)} onChange={(e) => setMinCart(digits(e.target.value))} placeholder="۰" />
              <Input label="حداقل تعداد خرید" dir="ltr" inputMode="numeric" value={toFaDigits(minQty)} onChange={(e) => setMinQty(digits(e.target.value))} placeholder="عدد" />
              <Input label="حداکثر سقف تخفیف (ریال)" dir="ltr" inputMode="numeric" value={groupMoney(cap)} onChange={(e) => setCap(digits(e.target.value))} placeholder="۰" hint="سقف مبلغ تخفیف در هر سفارش" />
              <Input label="محدودیت تعداد استفاده" dir="ltr" inputMode="numeric" value={toFaDigits(limit)} onChange={(e) => setLimit(digits(e.target.value))} placeholder="بار" hint="خالی = نامحدود" />
            </FormGrid>
            <div className={s.switchBox}><b>قابل استفاده همزمان با سایر تخفیف‌ها</b><Toggle checked={stackD} onChange={setStackD} /></div>
            <div className={s.switchBox}><b>قابل استفاده همراه با کد تخفیف</b><Toggle checked={stackC} onChange={setStackC} /></div>
            <div className={m.secGap}><DiscountLinks value={discounts} onChange={setDiscounts} /></div>
          </Card>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 16 }}>بنر و توضیحات</h3>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { setBanner(e.target.files?.[0] ?? null); e.target.value = ''; }} aria-label="فایل بنر" />
            <PickerField label="آپلود بنر کمپین" value={banner?.name ?? (ed.data?.banner_url ? 'بنر فعلی' : null)} placeholder="انتخاب تصویر" icon={<IconPhoto size={17} />} onOpen={() => fileRef.current?.click()} onClear={banner ? () => setBanner(null) : undefined} hint="ابعاد پیشنهادی ۱۶۰۰×۶۰۰ پیکسل؛ JPEG، PNG یا WebP تا ۲ مگابایت" />
            {cover ? <img src={cover} alt="پیش‌نمایش بنر" className={m.banner} /> : null}
            <div className={m.secGap}><Textarea label="توضیحات" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={4000} placeholder="شرح کمپین برای تیم فروش و صفحه فروشگاه" /></div>
          </Card>
          <div className={m.actionsBar}>
            <Button variant="secondary" onClick={() => save(false)} loading={busy === 'draft'} disabled={archived || !!busy}>{isEdit ? 'ذخیره تغییرات' : 'ذخیره به عنوان پیش‌نویس'}</Button>
            {canPublish ? <Button icon={<IconCheck size={17} />} onClick={() => save(true)} loading={busy === 'publish'} disabled={archived || !!busy}>ثبت و انتشار</Button> : null}
            <Button variant="secondary" onClick={back}>انصراف</Button>
          </div>
        </div>
        <aside className={m.side}>
          <Card>
            <h3 className={m.cardTitle} style={{ marginBottom: 8 }}>خلاصه کمپین</h3>
            <div className={m.sumRow}><span>نام</span><b>{name || '—'}</b></div>
            <div className={m.sumRow}><span>نوع</span><b>{natureOpts.find((o) => o.code === nature)?.name ?? '—'}</b></div>
            <div className={m.sumRow}><span>بودجه</span><b className="tnum">{budget ? `${faNum(budget)} ریال` : '—'}</b></div>
            <div className={m.sumRow}><span>کانال</span><b>{CHANNEL[channel]}</b></div>
            <div className={m.sumRow}><span>بازه</span><b className="tnum">{from && to ? `${from} تا ${to}` : '—'}</b></div>
            <div className={m.sumRow}><span>تخفیف‌های مرتبط</span><b>{faNum(discounts.length)}</b></div>
            {ed.data ? <div className={m.sumRow}><span>وضعیت</span><b>{CAMPAIGN_STATUS[ed.data.status]?.label}{ed.data.status === 'PUBLISHED' && ed.data.published_at ? ` · ${faDate(ed.data.published_at)}` : ''}</b></div> : null}
          </Card>
          <div className={m.sumNote}><IconInfoCircle size={15} style={{ verticalAlign: -3 }} /> تخفیف‌های تخفیف‌ساز را در «قوانین تخفیف» به کمپین وصل کنید؛ کمپین تا انتشار در فروشگاه دیده نمی‌شود.</div>
        </aside>
      </div>
    </>
  );
}

/** تخفیف‌های مرتبط کمپین (discount_ids) — تخفیف آرشیوشده قابل اتصال نیست (بک‌اند) */
function DiscountLinks({ value, onChange }: { value: Link[]; onChange: (v: Link[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={m.scope}>
      <PickerField label="تخفیف‌های مرتبط" value={value.length ? `${faNum(value.length)} تخفیف` : null} placeholder="بدون تخفیف مرتبط" icon={<IconDiscount size={17} />} onOpen={() => setOpen(true)} onClear={() => onChange([])} hint="تخفیف‌های ساخته‌شده در تخفیف‌ساز" />
      {value.length ? <div className={m.chips}>{value.map((d) => <span key={d.id} className={m.chip}>{d.title}<button type="button" aria-label={`حذف ${d.title}`} onClick={() => onChange(value.filter((x) => x.id !== d.id))}><IconX size={12} /></button></span>)}</div> : null}
      {open ? <DiscountLinkModal value={value} onClose={() => setOpen(false)} onDone={(v) => { onChange(v); setOpen(false); }} /> : null}
    </div>
  );
}
function DiscountLinkModal({ value, onClose, onDone }: { value: Link[]; onClose: () => void; onDone: (v: Link[]) => void }) {
  const [sel, setSel] = useState(value); const [q, setQ] = useState(''); const dq = useDebounced(q, 300);
  const list = useDiscounts({ query: dq || undefined, page_size: 30 });
  const rows = (list.data?.results ?? []).filter((d) => d.status !== 'ARCHIVED');
  const has = (id: string) => sel.some((x) => x.id === id);
  return (
    <Modal open onClose={onClose} title="تخفیف‌های مرتبط" width={640} footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={() => onDone(sel)}>تأیید ({faNum(sel.length)})</Button></>}>
      <input className={m.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی تخفیف…" aria-label="جستجوی تخفیف" />
      <div className={m.pickList} role="listbox" aria-multiselectable>
        {list.isLoading ? <div className={m.pickEmpty}>در حال بارگذاری…</div> : rows.length === 0 ? <div className={m.pickEmpty}>تخفیفی پیدا نشد.</div> : rows.map((d) => {
          const b = discountBadge(d);
          return (
            <button key={d.id} type="button" role="option" aria-selected={has(d.id)} className={`${m.pickRow} ${has(d.id) ? m.pickRowOn : ''}`} onClick={() => setSel(has(d.id) ? sel.filter((x) => x.id !== d.id) : [...sel, { id: d.id, title: d.title }])}>
              <span className={m.check} aria-hidden>{has(d.id) ? '✓' : ''}</span><span className={m.pickLabel}>{d.title}</span><small>{showValue(d.value_display)}</small><Badge tone={b.tone}>{b.label}</Badge>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
