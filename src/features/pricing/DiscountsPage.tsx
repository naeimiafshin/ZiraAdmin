import { useEffect, useMemo, useRef, useState } from 'react';
import { IconArchive, IconCircleCheck, IconPencil, IconPlayerPause, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faDateTime, faNum, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits } from '@/shared/lib/text';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dropdown } from '@/shared/ui/Dropdown';
import { Input, Toggle } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Card, Empty, PageHead, Pagination, Segmented, UnitHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal, IconButton } from '@/features/catalog/components';
import { useActiveCustomerGroups } from '@/features/catalog/api';
import { dayEnd, dayStart, useDiscount, useDiscountDetails, useDiscounts, useDiscountWrite, type Discount, type DiscountDetail, type DiscountIn, isoToJalaliInput } from './marketingApi';
import { discountBadge } from './marketingLabels';
import { AUDIENCE_TYPES, ScopeField, ITEM_TARGETS, fromAudiences, fromTargets, summarize, toAudiences, toTargets, type Pick } from './ScopePicker';
import { CouponsTab } from './CouponsTab';
import { StateChips, decimal, digits, showValue } from './mkShared';
import { TableFilters } from '@/shared/ui/TableFilters';
import s from '@/features/catalog/catalog.module.css';
import m from './marketing.module.css';
import { groupMoney } from '@/shared/lib/money';

/**
 * «تخفیف‌ساز» — مطابق html V2 (docs/html-ref/pc-10x-mk-ds1..3): سه تب؛ در هر تب فرم ثبت بالا و لیست جاری پایین.
 *  - تخفیف ترکیبی: سه عامل مشتری/گروه، محصول/دسته و زمان ⇐ نوع بک‌اند (kindFor): ITEM، ITEM_CUSTOMER، ITEM_TIME، CUSTOMER_TIME، ALL_THREE (trigger=AUTO).
 *  - تخفیف خرید نقدی: kind=CASH (بک‌اند payment_scope را CASH می‌کند)، درصدی + حداقل مبلغ خرید.
 *  - کدهای تخفیف: CouponsTab (pricing.coupons).
 * هر تخفیف پیش‌نویس ساخته می‌شود و با «تأیید و فعال‌سازی» (approve، مجوز pricing.discounts.approve) فعال می‌شود؛ ویرایش تخفیف فعال آن را به پیش‌نویس برمی‌گرداند (بک‌اند).
 * فیلترهای html: معتبر = status ACTIVE، منقضی شده = validity EXPIRED، پیش‌نویس = status DRAFT.
 * «نوع» تک‌انتخابی؛ «همه انواع» ⇐ هر پنج نوع ترکیبی با kind چندمقداری (P-08، 2026-10-23) ⇐ شمارش و صفحه‌بندی دقیق.
 */
type Tab = 'combo' | 'cash' | 'codes';
/** فیلتر وضعیت (۲۰۲۶-۱۰-۲۴: همه‌ی وضعیت‌های ممکن) ⇐ status + validity بک‌اند؛ «معتبر» = فعال و در بازه */
const STATE_F: Record<string, Record<string, string>> = {
  valid: { status: 'ACTIVE', validity: 'RUNNING' }, scheduled: { status: 'ACTIVE', validity: 'SCHEDULED' }, expired: { validity: 'EXPIRED' },
  draft: { status: 'DRAFT' }, inactive: { status: 'INACTIVE' }, archived: { status: 'ARCHIVED' },
};
const ALL_STATES = [{ value: 'valid', label: 'معتبر' }, { value: 'scheduled', label: 'زمان‌بندی‌شده' }, { value: 'expired', label: 'منقضی شده' }, { value: 'draft', label: 'پیش‌نویس' }, { value: 'inactive', label: 'غیرفعال' }, { value: 'archived', label: 'آرشیو' }];
export const COMBO_KIND: Record<string, string> = { ITEM: 'محصول', ITEM_CUSTOMER: 'محصول + مشتری', ITEM_TIME: 'محصول + زمان', CUSTOMER_TIME: 'مشتری + زمان', ALL_THREE: 'مشتری + محصول + زمان' };
/** عامل‌های انتخاب‌شده ⇐ نوع تخفیف بک‌اند (services/discount.py: TARGET/AUDIENCE/TIME_KINDS)؛ ترکیب بی‌نوع ⇐ null */
export function kindFor(customer: boolean, product: boolean, timed: boolean): string | null {
  if (product && customer) return timed ? 'ALL_THREE' : 'ITEM_CUSTOMER';
  if (product) return timed ? 'ITEM_TIME' : 'ITEM';
  if (customer && timed) return 'CUSTOMER_TIME';
  return null;
}
const dateCell = (d: { start_at?: string | null; end_at?: string | null }, which: 'start' | 'end') => {
  const v = which === 'start' ? d.start_at : d.end_at;
  return v ? <span className="tnum">{faDate(v)}</span> : which === 'end' ? <span className={m.perm}>دائمی</span> : <span className={s.muted}>—</span>;
};
const stateOptions = [{ value: 'valid', label: 'معتبر' }, { value: 'expired', label: 'منقضی شده' }, { value: 'draft', label: 'پیش‌نویس' }];

export default function DiscountsPage({ initialTab }: { initialTab?: Tab }) {
  const can = usePerm();
  const lp = useListParams({ page_size: 10 });
  const canD = can('pricing.discounts.list'), canC = can('pricing.coupons.list');
  const raw = (lp.get('tab') || initialTab || (canD ? 'combo' : 'codes')) as Tab;
  const tab: Tab = raw === 'codes' ? (canC ? 'codes' : 'combo') : canD ? raw : 'codes';
  return (
    <>
      <PageHead title="تخفیف‌ساز" sub="تخفیف ترکیبی (مشتری، محصول و زمان)، تخفیف خرید نقدی و کدهای تخفیف — در هر بخش فرم ثبت در بالا و لیست جاری در پایین قرار دارد." />
      <div className={m.tabsBar}>
        <Segmented value={tab} onChange={(v) => lp.set({ tab: v, f: null, query: null, kind: null })}
          options={[{ value: 'combo', label: 'تخفیف ترکیبی', disabled: !canD }, { value: 'cash', label: 'تخفیف خرید نقدی', disabled: !canD }, { value: 'codes', label: 'کدهای تخفیف', disabled: !canC }]} />
      </div>
      {tab === 'combo' ? <ComboTab key="combo" /> : tab === 'cash' ? <CashTab key="cash" /> : <CouponsTab key="codes" />}
    </>
  );
}

function useDiscountRowActions() {
  const can = usePerm(); const w = useDiscountWrite(); const toast = useToast();
  const [confirm, setConfirm] = useState<{ d: Discount; act: 'delete' | 'archive' | 'deactivate' } | null>(null);
  const approve = async (d: Discount) => { try { await w.approve.mutateAsync(d.id); toast('تخفیف تأیید و فعال شد.'); } catch (e) { toast(userMessage(e), 'error'); } };
  const actions = (d: Discount, onEdit: (d: Discount) => void) => (
    <span className={s.rowActions}>
      {can('pricing.discounts.approve') && (d.status === 'DRAFT' || d.status === 'INACTIVE') && d.validity !== 'EXPIRED' ? <IconButton label="تأیید و فعال‌سازی" onClick={() => approve(d)}><IconCircleCheck size={15} /></IconButton> : null}
      {can('pricing.discounts.update') && d.status === 'ACTIVE' ? <IconButton label="غیرفعال کردن" onClick={() => setConfirm({ d, act: 'deactivate' })}><IconPlayerPause size={15} /></IconButton> : null}
      {can('pricing.discounts.update') && d.status !== 'ARCHIVED' ? <IconButton label="ویرایش" onClick={() => onEdit(d)}><IconPencil size={15} /></IconButton> : null}
      {can('pricing.discounts.delete') && d.status !== 'ARCHIVED' ? (d.used_count > 0
        ? <IconButton label="آرشیو" onClick={() => setConfirm({ d, act: 'archive' })}><IconArchive size={15} /></IconButton>
        : <IconButton label="حذف" danger onClick={() => setConfirm({ d, act: 'delete' })}><IconTrash size={15} /></IconButton>) : null}
    </span>
  );
  const modal = confirm ? (
    <ConfirmModal title={confirm.act === 'delete' ? 'حذف تخفیف' : confirm.act === 'archive' ? 'آرشیو تخفیف' : 'غیرفعال کردن تخفیف'} danger={confirm.act !== 'deactivate'}
      confirmLabel={confirm.act === 'delete' ? 'حذف کن' : confirm.act === 'archive' ? 'آرشیو کن' : 'غیرفعال کن'} onClose={() => setConfirm(null)}
      text={confirm.act === 'delete' ? <>تخفیف <b>{confirm.d.title}</b> برای همیشه حذف می‌شود.</> : confirm.act === 'archive' ? <>تخفیف <b>{confirm.d.title}</b> استفاده شده و حذف نمی‌شود؛ آرشیو می‌شود و دیگر قابل ویرایش یا فعال‌سازی نیست.</> : <>تخفیف <b>{confirm.d.title}</b> تا تأیید دوباره اعمال نمی‌شود.</>}
      onConfirm={async () => {
        const { d, act } = confirm;
        if (act === 'delete') await w.remove.mutateAsync(d.id); else if (act === 'archive') await w.archive.mutateAsync(d.id); else await w.deactivate.mutateAsync(d.id);
        toast(act === 'delete' ? 'تخفیف حذف شد.' : act === 'archive' ? 'تخفیف آرشیو شد.' : 'تخفیف غیرفعال شد.');
      }} />
  ) : null;
  return { actions, modal };
}

// ───────────────────────────── تخفیف ترکیبی ─────────────────────────────
function ComboTab() {
  const can = usePerm();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const f = lp.get('f'); const kind = lp.get('kind');
  const list = useDiscounts({ page: lp.page, page_size: lp.pageSize, query: dq || undefined, trigger: 'AUTO', kind: (kind || Object.keys(COMBO_KIND)) as never, ...(STATE_F[f] ?? {}) });
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const details = useDiscountDetails(rows.map((d) => d.id), rows.length > 0);
  const detail = new Map(details.map((q) => q.data).filter((x): x is DiscountDetail => !!x).map((x) => [x.id, x]));
  const groups = useActiveCustomerGroups(true);
  const [editId, setEditId] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const { actions, modal } = useDiscountRowActions();
  const onEdit = (d: Discount) => { setEditId(d.id); top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const cols: Column<Discount>[] = [
    { key: 'cus', header: 'مشتری', render: (d) => { const x = detail.get(d.id); return <span className={`${s.strong} ${m.cellClip}`}>{x ? summarize(fromAudiences(x.audiences, groups.data), 'همه مشتریان') : '…'}</span>; } },
    { key: 'prd', header: 'محصول', render: (d) => { const x = detail.get(d.id); return <span className={m.cellClip}>{x ? summarize(fromTargets(x.targets), 'همه محصولات') : '…'}</span>; } },
    { key: 'val', header: 'تخفیف', render: (d) => <span className={`${m.val} tnum`}>{showValue(d.value_display)}</span> },
    { key: 'qty', header: 'حداقل تعداد', render: (d) => <span className="tnum">{d.min_qty ? faNum(d.min_qty) : '—'}</span> },
    { key: 'from', header: 'تاریخ شروع', render: (d) => dateCell(d, 'start') },
    { key: 'to', header: 'تاریخ اتمام', render: (d) => dateCell(d, 'end') },
    { key: 'st', header: 'وضعیت', render: (d) => { const b = discountBadge(d); return <Badge tone={b.tone}>{b.label}</Badge>; } },
    { key: 'acts', header: '', render: (d) => actions(d, onEdit) },
  ];
  const filtered = !!(f || dq || kind);
  return (
    <>
      <div ref={top} />
      {can('pricing.discounts.create') || editId ? <ComboForm key={editId ?? 'new'} editId={editId} onDone={() => setEditId(null)} /> : null}
      <Card>
        <div className={m.listHead}>
          <h3 className={m.cardTitle}>لیست تخفیفات ترکیبی جاری</h3>
          {list.data ? <span className={s.famCount}>{faNum(list.data.total)} مورد</span> : null}
          <span className={m.grow} />
          <input className={`${m.search} ${m.listSearch}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="جستجو…" aria-label="جستجوی تخفیف" />
          <Dropdown value={kind} onChange={(e) => lp.set({ kind: e.target.value || null })} aria-label="نوع تخفیف" style={{ width: 190 }}
            options={[{ value: '', label: 'همه انواع' }, ...Object.entries(COMBO_KIND).map(([k, l]) => ({ value: k, label: l }))]} />
          <StateChips value={f} onChange={(v) => lp.set({ f: v })} options={stateOptions} />
        </div>
        <div className={s.compact}>
          <DataTable columns={cols} rows={list.data ? rows : undefined} rowKey={(d) => d.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} isSelected={(d) => d.id === editId}
            empty={<Empty title={filtered ? 'تخفیفی با این فیلترها پیدا نشد' : 'هنوز تخفیف ترکیبی ثبت نشده است'} text={filtered ? undefined : 'از فرم بالا مشتری، محصول و زمان را انتخاب و تخفیف را ثبت کنید.'} />} />
        </div>
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      </Card>
      {modal}
    </>
  );
}

function ComboForm({ editId, onDone }: { editId: string | null; onDone: () => void }) {
  const w = useDiscountWrite(); const toast = useToast();
  const ed = useDiscount(editId ?? undefined); const groups = useActiveCustomerGroups(true);
  const [cus, setCus] = useState<Pick[]>([]); const [prd, setPrd] = useState<Pick[]>([]);
  const [permanent, setPermanent] = useState(false); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [vt, setVt] = useState<'PERCENT' | 'AMOUNT'>('PERCENT'); const [val, setVal] = useState(''); const [minQty, setMinQty] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const loaded = useRef(false);
  useEffect(() => {
    const d = ed.data; if (!d || loaded.current || groups.isLoading) return;
    loaded.current = true;
    const a0 = fromAudiences(d.audiences, groups.data); setCus(a0); setPrd(fromTargets(d.targets));
    setPermanent(!d.start_at && !d.end_at); setFrom(isoToJalaliInput(d.start_at)); setTo(isoToJalaliInput(d.end_at));
    setVt(d.value_type === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'); setVal(d.value_type === 'AMOUNT' ? String(Number(d.fixed_amount ?? '')) : String(Number(d.percent ?? '')));
    setMinQty(d.min_qty ? String(Number(d.min_qty)) : '');
  }, [ed.data, groups.data, groups.isLoading]);
  const kind = kindFor(cus.length > 0, prd.length > 0, !permanent);
  useEffect(() => { setErr(null); }, [cus, prd, permanent, vt]);
  const reset = () => { setCus([]); setPrd([]); setPermanent(false); setFrom(''); setTo(''); setVt('PERCENT'); setVal(''); setMinQty(''); setErr(null); };
  const submit = async () => {
    setErr(null);
    if (!kind) { setErr(prd.length === 0 && !cus.length ? 'حداقل یک آیتم/باندل (یا مشتری همراه با بازه‌ی زمانی) انتخاب کنید؛ تخفیف روی همه‌ی محصولات و همه‌ی مشتریان را با «کد تخفیف» یا «خرید نقدی» بسازید.' : 'تخفیف مشتری روی همه‌ی محصولات فقط با بازه‌ی زمانی ممکن است؛ «دائمی» را خاموش کنید یا محصول/دسته انتخاب کنید.'); return; }
    const n = Number(val);
    if (!val || Number.isNaN(n) || n <= 0) { setErr(vt === 'PERCENT' ? 'درصد تخفیف را وارد کنید.' : 'مبلغ تخفیف را وارد کنید.'); return; }
    if (vt === 'PERCENT' && n > 100) { setErr('درصد تخفیف حداکثر ۱۰۰ است.'); return; }
    const gf = permanent ? null : jalaliTextToGregorian(from), gt = permanent ? null : jalaliTextToGregorian(to);
    if (!permanent && (!gf || !gt)) { setErr('تاریخ شروع و اتمام را وارد کنید یا «دائمی» را روشن کنید.'); return; }
    if (gf && gt && gt < gf) { setErr('تاریخ اتمام باید بعد از تاریخ شروع باشد.'); return; }
    const body: DiscountIn = {
      kind: kind as DiscountIn['kind'], trigger: 'AUTO', value_type: vt,
      percent: vt === 'PERCENT' ? val : null, fixed_amount: vt === 'AMOUNT' ? val : null, min_qty: minQty || null,
      start_at: gf ? dayStart(gf) : null, end_at: gt ? dayEnd(gt) : null, targets: toTargets(prd), audiences: toAudiences(cus),
    };
    try {
      if (editId) { await w.update.mutateAsync({ id: editId, body }); toast(ed.data?.status === 'ACTIVE' ? 'تخفیف ذخیره شد و برای اعمال دوباره باید تأیید شود.' : 'تخفیف ذخیره شد.'); onDone(); }
      else { await w.create.mutateAsync(body); toast('تخفیف به‌صورت پیش‌نویس ثبت شد؛ برای اعمال، آن را تأیید کنید.'); reset(); }
    } catch (e) { setErr(userMessage(e)); }
  };
  if (editId && !ed.data) return <Card className={m.formCard}><span className={s.muted}>در حال بارگذاری تخفیف…</span></Card>;
  return (
    <Card className={m.formCard}>
      <div className={m.cardHead}><h3 className={m.cardTitle}>{editId ? `ویرایش تخفیف — ${ed.data?.title ?? ''}` : 'ثبت تخفیف جدید — تخفیف ترکیبی'}</h3>{editId ? <Button size="sm" variant="secondary" onClick={onDone}>انصراف از ویرایش</Button> : null}</div>
      <p className={m.cardSub}>مشتری، محصول و زمان را در یک فرم مشخص کنید؛ هر عامل را می‌توانید روی «همه» بگذارید یا با انتخاب پیشرفته محدود کنید.</p>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={m.factors}>
        <div className={m.factor}>
          <div className={m.factorHead}><b><span className={m.num}>۱</span>مشتری / گروه مشتریان</b></div>
          <ScopeField label="مشتری / گروه مشتریان" all="همه مشتریان" types={AUDIENCE_TYPES} value={cus} onChange={setCus} />
        </div>
        <div className={m.factor}>
          {/* سیاست (افشین 2026-10-24): تخفیف روی آیتم (واحد فروش در پنل عمومی و مشتریان) یا باندل؛ دسته‌بندی کنار رفت */}
          <div className={m.factorHead}><b><span className={m.num}>۲</span>انتخاب آیتم</b></div>
          <ScopeField label="انتخاب آیتم / باندل" all="همه آیتم‌ها" types={ITEM_TARGETS} value={prd} onChange={setPrd} hint={prd.some((x) => x.type === 'CATEGORY') ? 'این تخفیف یک دسته‌بندی قدیمی دارد؛ دسته‌ها در این فرم دیگر انتخاب نمی‌شوند.' : undefined} />
        </div>
        <div className={m.factor}>
          <div className={m.factorHead}><b><span className={m.num}>۳</span>زمان</b><Toggle checked={permanent} onChange={setPermanent} label="دائمی" /></div>
          <div className={m.valueGrid} style={{ gridTemplateColumns: '1fr 1fr' }}>
            <JalaliDateInput label="تاریخ شروع" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" maxYear={1500} disabled={permanent} />
            <JalaliDateInput label="تاریخ اتمام" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" maxYear={1500} disabled={permanent} />
          </div>
          <p className={m.hint}>{permanent ? 'تخفیف بدون محدودیت زمانی اعمال می‌شود.' : 'تخفیف فقط در بازه تاریخ شروع تا اتمام اعمال می‌شود.'}</p>
        </div>
      </div>
      <div className={`${m.factor} ${m.factorWide}`}>
        <div className={m.factorHead}><b><span className={m.num}>۴</span>مقدار تخفیف</b></div>
        <div className={m.valueGrid}>
          <div><div className={m.label}>نوع تخفیف</div><Segmented value={vt} onChange={(v) => { setVt(v); setVal(''); }} options={[{ value: 'PERCENT', label: 'درصدی' }, { value: 'AMOUNT', label: 'مبلغی' }]} /></div>
          <Input label={vt === 'PERCENT' ? 'درصد تخفیف (٪)' : 'مبلغ تخفیف هر واحد (ریال)'} required dir="ltr" inputMode="decimal" value={vt === 'PERCENT' ? toFaDigits(val) : groupMoney(val)} onChange={(e) => setVal(vt === 'PERCENT' ? decimal(e.target.value) : digits(e.target.value))} placeholder="۰" />
          <Input label="حداقل تعداد خرید" dir="ltr" inputMode="numeric" value={toFaDigits(minQty)} onChange={(e) => setMinQty(digits(e.target.value))} placeholder="عدد" />
        </div>
      </div>
      <div className={m.formFoot}>
        <Button onClick={submit} loading={w.create.isPending || w.update.isPending} icon={editId ? undefined : <IconPlus size={17} />}>{editId ? 'ذخیره تغییرات' : 'ثبت تخفیف'}</Button>
        <span className={m.kindNote}>{kind ? <>نوع تخفیف: <b>{COMBO_KIND[kind]}</b> · پس از ثبت، پیش‌نویس است تا تأیید شود.</> : 'ترکیب انتخاب‌شده نوع تخفیف معتبری ندارد.'}</span>
      </div>
    </Card>
  );
}

// ───────────────────────────── تخفیف خرید نقدی ─────────────────────────────
function CashTab() {
  const can = usePerm();
  const lp = useListParams({ page_size: 10 });
  const f = lp.get('f');
  const { text, setText, dq } = useSearchState(lp);
  const list = useDiscounts({ page: lp.page, page_size: lp.pageSize, kind: 'CASH', query: dq || undefined, ...(STATE_F[f] ?? {}) });
  const [editId, setEditId] = useState<string | null>(null);
  const { actions, modal } = useDiscountRowActions();
  const cols: Column<Discount>[] = [
    { key: 'val', header: 'میزان تخفیف', render: (d) => <span className={`${m.val} tnum`}>{showValue(d.value_display)}</span> },
    { key: 'min', header: <UnitHead>حداقل مبلغ خرید</UnitHead>, render: (d) => <span className="tnum">{d.min_amount ? faNum(d.min_amount) : '—'}</span> },
    { key: 'from', header: 'تاریخ شروع', render: (d) => dateCell(d, 'start') },
    { key: 'to', header: 'تاریخ پایان', render: (d) => dateCell(d, 'end') },
    { key: 'upd', header: 'تاریخ آخرین بروزرسانی', render: (d) => <span className="tnum">{faDateTime(d.updated_at)}</span> },
    { key: 'st', header: 'وضعیت', render: (d) => { const b = discountBadge(d); return <Badge tone={b.tone}>{b.label}</Badge>; } },
    { key: 'acts', header: '', render: (d) => actions(d, (x) => setEditId(x.id)) },
  ];
  return (
    <>
      {can('pricing.discounts.create') || editId ? <CashForm key={editId ?? 'new'} editId={editId} onDone={() => setEditId(null)} /> : null}
      <Card>
        <div className={m.listHead}>
          <h3 className={m.cardTitle}>لیست تخفیفات خرید نقدی جاری</h3>
          {list.data ? <span className={s.famCount}>{faNum(list.data.total)} مورد</span> : null}
        </div>
        {/* ۲۰۲۶-۱۰-۲۴: میان‌برهای وضعیت راست و زیر تیتر؛ جست‌وجو + فیلتر همه‌ی وضعیت‌ها */}
        <div style={{ marginBottom: 10 }}><StateChips value={f} onChange={(v) => lp.set({ f: v })} options={stateOptions} /></div>
        <TableFilters search={text} onSearch={setText} placeholder="جستجوی عنوان یا میزان تخفیف…" filters={[{ key: 'f', label: 'وضعیت', value: f, onChange: (v) => lp.set({ f: v }), options: ALL_STATES }]} />
        <div className={s.compact}>
          <DataTable columns={cols} rows={list.data?.results} rowKey={(d) => d.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} isSelected={(d) => d.id === editId}
            empty={<Empty title={f ? 'تخفیفی با این فیلتر پیدا نشد' : 'هنوز تخفیف خرید نقدی ثبت نشده است'} />} />
        </div>
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      </Card>
      {modal}
    </>
  );
}

function CashForm({ editId, onDone }: { editId: string | null; onDone: () => void }) {
  const w = useDiscountWrite(); const toast = useToast(); const ed = useDiscount(editId ?? undefined);
  const [pct, setPct] = useState(''); const [min, setMin] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null); const loaded = useRef(false);
  useEffect(() => {
    const d = ed.data; if (!d || loaded.current) return; loaded.current = true;
    setPct(String(Number(d.percent ?? ''))); setMin(d.min_amount ? String(Number(d.min_amount)) : '');
    setFrom(isoToJalaliInput(d.start_at)); setTo(isoToJalaliInput(d.end_at));
  }, [ed.data]);
  const submit = async () => {
    setErr(null); const n = Number(pct);
    if (!pct || Number.isNaN(n) || n <= 0 || n > 100) { setErr('میزان تخفیف باید درصدی بین ۰ و ۱۰۰ باشد.'); return; }
    if (!min || Number(min) <= 0) { setErr('حداقل مبلغ خرید را وارد کنید.'); return; }
    const gf = from ? jalaliTextToGregorian(from) : null, gt = to ? jalaliTextToGregorian(to) : null;
    if ((from && !gf) || (to && !gt)) { setErr('تاریخ واردشده معتبر نیست.'); return; }
    if (gf && gt && gt < gf) { setErr('تاریخ پایان باید بعد از تاریخ شروع باشد.'); return; }
    const body: DiscountIn = { kind: 'CASH', trigger: 'AUTO', value_type: 'PERCENT', percent: pct, min_amount: min, start_at: gf ? dayStart(gf) : null, end_at: gt ? dayEnd(gt) : null, targets: [], audiences: [] };
    try {
      if (editId) { await w.update.mutateAsync({ id: editId, body }); toast('تخفیف ذخیره شد.'); onDone(); }
      else { await w.create.mutateAsync(body); toast('تخفیف خرید نقدی به‌صورت پیش‌نویس ثبت شد؛ برای اعمال، آن را تأیید کنید.'); setPct(''); setMin(''); setFrom(''); setTo(''); }
    } catch (e) { setErr(userMessage(e)); }
  };
  if (editId && !ed.data) return <Card className={m.formCard}><span className={s.muted}>در حال بارگذاری تخفیف…</span></Card>;
  return (
    <Card className={m.formCard}>
      <div className={m.cardHead}><h3 className={m.cardTitle}>{editId ? 'ویرایش تخفیف خرید نقدی' : 'ثبت تخفیف جدید — تخفیف خرید نقدی'}</h3>{editId ? <Button size="sm" variant="secondary" onClick={onDone}>انصراف از ویرایش</Button> : null}</div>
      <p className={m.cardSub}>این تخفیف زمانی اعمال می‌شود که مشتری کل مبلغ سفارش را نقدی پرداخت کند.</p>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={m.valueGrid} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Input label="میزان تخفیف (٪)" required dir="ltr" inputMode="decimal" value={toFaDigits(pct)} onChange={(e) => setPct(decimal(e.target.value))} placeholder="۰" />
        <Input label="حداقل مبلغ خرید (ریال)" required dir="ltr" inputMode="numeric" value={min ? faNum(Number(min)) : ''} onChange={(e) => setMin(digits(e.target.value))} placeholder="۰"  />
        <JalaliDateInput label="تاریخ شروع اعتبار" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" maxYear={1500} />
        <JalaliDateInput label="تاریخ پایان اعتبار" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" maxYear={1500} />
      </div>
      <div className={m.formFoot}><Button onClick={submit} loading={w.create.isPending || w.update.isPending} icon={editId ? undefined : <IconPlus size={17} />}>{editId ? 'ذخیره تغییرات' : 'ثبت تخفیف'}</Button></div>
    </Card>
  );
}
