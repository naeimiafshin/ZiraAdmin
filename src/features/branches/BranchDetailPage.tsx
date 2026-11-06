import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  IconBox, IconBoxMultiple, IconBuildingBank, IconBuildingStore, IconBuildingWarehouse, IconCalendar, IconCashRegister, IconChartBar, IconChevronLeft,
  IconClock, IconCreditCard, IconHash, IconMap2, IconMapPin, IconPencil, IconPhone, IconShieldCheck, IconUser, IconUsers, IconAlertTriangle, IconList,
} from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum, gregorianToJalaliText } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useListParams } from '@/shared/lib/useListParams';
import { toFaDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Badge, Card, Empty, ErrorBox, Modal, PageHead, Segmented, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useBins, useBranch, useBranchWrite, useStockDashboard, useZones, type BranchDetail } from './api';
import { BankAccountsModal, CandidatePicker, FinanceSoonModal, PeopleModal, PermitsModal, WarehousesModal, type ResourceKey } from './BranchModals';
import { BRANCH_STATUS, PERMITS, WEEKDAYS, branchMarkColor } from './labels';
import { SoonTag } from './SoonTag';
import { AllowedProductsModal, ProductsTable } from './BranchProducts';
import s from './branches.module.css';


/**
 * نمای شعبه — GET /organization/branches/{id} + منابع شعبه (مودال‌ها) + موجودی انبارهای شعبه از wms.
 * مطابق html Fixed «Branch Management» (نمای شعبه): کارت اطلاعات، «منابع و تنظیمات شعبه»، لیست کالا / نقشه انبار.
 * حالت (مودال باز `res`، تب پایین `tab`، انبار `wh`، جست‌وجو و فیلترها) در URL (RULES ۵-۵).
 */
export default function BranchDetailPage() {
  const { id = '' } = useParams();
  const back = useBack('/organization/branches');
  const nav = useNavigate();
  const can = usePerm();
  const q = useBranch(id);
  const lp = useListParams({ page_size: 10 });
  const res = lp.get('res') as ResourceKey | '';
  const b = q.data;
  if (q.isLoading) return <><PageHead back={back} /><Card><SkeletonRows rows={5} /></Card></>;
  if (q.error || !b) return <><PageHead back={back} /><Card>{q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <Empty title="شعبه پیدا نشد" />}</Card></>;
  const st = BRANCH_STATUS[b.status] ?? { label: b.status_display, tone: 'neutral' as const };
  const open = (k: ResourceKey | '') => lp.set({ res: k || null }, { keepPage: true });
  return (
    <>
      <PageHead back={back}
        title={<span className={s.dHead}><span className={s.markLg} style={{ background: branchMarkColor(b.code) }} aria-hidden><IconBuildingStore size={24} /></span>
          <span><span className={s.dName}>{b.name} <Badge tone={st.tone}>{st.label}</Badge>{b.is_online ? <> <span data-tip="شعبه‌ی سفارش‌های پنل مشتری (تنظیمات «سیاست فروش و پرداخت»)"><Badge tone="info">آنلاین</Badge></span></> : null}</span><span className={s.dCode} data-latin>{b.code}</span></span></span>}
        actions={can('organization.branches.update') ? <Button variant="secondary" icon={<IconPencil size={16} />} onClick={() => nav(`/organization/branches/${b.id}/edit`)}>ویرایش شعبه</Button> : null} />
      <InfoCard b={b} />
      <h3 className={s.secTitle}>منابع و تنظیمات شعبه</h3>
      <Resources b={b} onOpen={open} />
      <StockPanel b={b} lp={lp} />
      {res === 'warehouses' ? <WarehousesModal branch={b} onClose={() => open('')} /> : null}
      {res === 'assortment' ? <AllowedProductsModal branch={b} onClose={() => open('')} /> : null}
      {res === 'bank' ? <BankAccountsModal branch={b} onClose={() => open('')} /> : null}
      {res === 'pos' ? <FinanceSoonModal branch={b} kind="pos" onClose={() => open('')} /> : null}
      {res === 'cash' ? <FinanceSoonModal branch={b} kind="cash" onClose={() => open('')} /> : null}
      {res === 'people' ? <PeopleModal branch={b} onClose={() => open('')} /> : null}
      {res === 'permits' ? <PermitsModal branch={b} onClose={() => open('')} /> : null}
    </>
  );
}

const Kv = ({ icon, label, children, tip }: { icon: ReactNode; label: string; children: ReactNode; tip?: string }) => (
  <div className={s.kv} data-tip={tip}><span className={s.kvLabel}>{icon}{label}</span><span className={s.kvValue}>{children}</span></div>
);

/** خلاصه‌ی ساعت کاری: روزهای باز با بازه‌ی ساعت (بدون شیفت شبانه) */
function hoursText(wh: BranchDetail['working_hours']): string {
  const days = (wh ?? {}) as Record<string, { open?: string | null; close?: string | null; is_closed?: boolean }>;
  const open = WEEKDAYS.filter((d) => days[d.key] && !days[d.key]!.is_closed && days[d.key]!.open);
  if (!open.length) return '';
  const ranges = [...new Set(open.map((d) => `${days[d.key]!.open}–${days[d.key]!.close}`))];
  return toFaDigits(ranges.length === 1 ? `${ranges[0]} (${open.length === 7 ? 'همه‌ی روزها' : `${open.length} روز`})` : open.map((d) => `${d.label} ${days[d.key]!.open}–${days[d.key]!.close}`).join('، '));
}

function InfoCard({ b }: { b: BranchDetail }) {
  const can = usePerm();
  const [mgr, setMgr] = useState(false);
  const whIds = useMemo(() => b.warehouses.map((w) => w.warehouse_id), [b.warehouses]);
  // یک درخواست برای همه‌ی انبارهای شعبه (B-10)؛ اقلام = کالاهای یکتا با موجودی مثبت
  const kpi = useStockDashboard({ branch_id: b.id }, whIds.length > 0 && can('wms.stock.read'));
  const items = kpi.data?.items_in_stock ?? null; const qty = kpi.data ? Number(kpi.data.total_quantity) : null; const low = kpi.data?.below_threshold ?? null;
  const managerName = b.manager_id ? b.manager_name ?? null : null;
  const hours = hoursText(b.working_hours);
  const kpiTip = whIds.length ? 'جمع شاخص‌های موجودی انبارهای وصل به شعبه (wms)' : 'انباری به شعبه وصل نیست';
  return (
    <Card className={s.infoCard}>
      <div className={s.kvGrid}>
        <Kv icon={<IconUser size={14} />} label="مسئول شعبه">
          <span className={s.inlineEdit}>
            {!b.manager_id ? <span className={s.soon}>تعیین نشده</span> : managerName ? <b className={s.brandText}>{managerName}{b.manager_phone ? <small className={`${s.mgrPhone} ltr`}> {b.manager_phone}</small> : null}</b> : <span className={s.soon}>تعیین‌شده</span>}
            {can('organization.branches.settings.update') ? <button type="button" className={s.linkBtn} onClick={() => setMgr(true)} aria-label="تعیین مسئول شعبه" data-tip="تعیین مسئول شعبه"><IconPencil size={14} /></button> : null}
          </span>
        </Kv>
        <Kv icon={<IconPhone size={14} />} label="شماره تماس">{b.phone ? <span className="ltr">{b.phone}</span> : '—'}</Kv>
        <Kv icon={<IconMapPin size={14} />} label="استان / شهر">{[b.province, b.city].filter(Boolean).join(' / ') || '—'}</Kv>
        <Kv icon={<IconMap2 size={14} />} label="نشانی کامل">{[b.full_address, b.address_details].filter(Boolean).join('، ') || '—'}</Kv>
        <Kv icon={<IconHash size={14} />} label="کد پستی">{b.postal_code ? toFaDigits(b.postal_code) : '—'}</Kv>
        <Kv icon={<IconCalendar size={14} />} label="تاریخ شروع فعالیت">{b.activity_start_date ? gregorianToJalaliText(b.activity_start_date) : '—'}</Kv>
        <Kv icon={<IconClock size={14} />} label="ساعات کاری">{hours || '—'}</Kv>
      </div>
      <div className={s.kpiRow}>
        <Kv icon={<IconBox size={14} />} label="تعداد اقلام کالا" tip={kpiTip}>{items !== null ? `${faNum(items)} قلم` : '—'}</Kv>
        <Kv icon={<IconBoxMultiple size={14} />} label="موجودی کل" tip={kpiTip}>{qty !== null ? `${faNum(qty)} عدد` : '—'}</Kv>
        <Kv icon={<IconChartBar size={14} />} label="فروش ماه"><SoonTag /></Kv>
        <Kv icon={<IconUsers size={14} />} label="تعداد کارمندان">{faNum(b.employees.length)} نفر</Kv>
        <Kv icon={<IconBuildingWarehouse size={14} />} label="انبارهای مربوطه">{faNum(b.warehouses.length)} انبار</Kv>
        <Kv icon={<IconAlertTriangle size={14} />} label="کالاهای کم‌موجود" tip={kpiTip}>{low !== null ? <b className={low ? s.warnText : ''}>{faNum(low)} قلم</b> : '—'}</Kv>
      </div>
      {mgr ? <ManagerModal b={b} current={managerName} onClose={() => setMgr(false)} /> : null}
    </Card>
  );
}

function ManagerModal({ b, current, onClose }: { b: BranchDetail; current: string | null; onClose: () => void }) {
  const w = useBranchWrite(b.id);
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const clear = async () => {
    setErr(null);
    try { await w.update.mutateAsync({ manager_id: null }); toast('مسئول شعبه برداشته شد.'); onClose(); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title="مسئول شعبه" width={560}
      footer={<><Button variant="secondary" onClick={onClose}>بستن</Button>{b.manager_id ? <Button variant="danger" onClick={clear} loading={w.update.isPending}>برداشتن مسئول</Button> : null}<Button onClick={() => setPicking(true)}>{b.manager_id ? 'تغییر مسئول' : 'انتخاب مسئول'}</Button></>}>
      {err ? <Alert>{err}</Alert> : null}
      <p className={s.hint}>مسئول شعبه باید شعبه‌ی محل کارش همین شعبه باشد و کارمند این شعبه یا مسئول شعبه‌ی دیگری نباشد.</p>
      <p>مسئول فعلی: <b>{b.manager_id ? current ?? 'تعیین‌شده' : 'ندارد'}</b></p>
      {picking ? (
        <CandidatePicker branch={b} kind="manager" onClose={() => setPicking(false)}
          onPick={async (c) => { await w.update.mutateAsync({ manager_id: c.user_id ?? null }); toast(`${c.full_name ?? 'کارمند'} مسئول شعبه شد.`); setPicking(false); onClose(); }} />
      ) : null}
    </Modal>
  );
}

function Resources({ b, onOpen }: { b: BranchDetail; onOpen: (k: ResourceKey) => void }) {
  const can = usePerm();
  const permitsOn = PERMITS.filter((p) => b.permit?.[p.key]).length;
  const cards: { k: ResourceKey; title: string; sub: string; icon: ReactNode; tone?: string; perm: string }[] = [
    { k: 'warehouses', title: 'انبارهای مربوطه', sub: `${faNum(b.warehouses.length)} انبار`, icon: <IconBuildingWarehouse size={20} />, tone: s.tBlue, perm: 'organization.branches.warehouses.read' },
    { k: 'assortment', title: 'محصولات مجاز', sub: 'کالاها و آیتم‌های قابل فروش', icon: <IconList size={20} />, tone: s.tRose, perm: 'organization.branches.assortment.read' },
    { k: 'bank', title: 'حساب‌های بانکی', sub: 'به‌زودی', icon: <IconBuildingBank size={20} />, tone: s.tGreen, perm: 'organization.branches.bank_accounts.read' },
    { k: 'pos', title: 'دستگاه‌های POS', sub: 'به‌زودی', icon: <IconCreditCard size={20} />, tone: s.tAmber, perm: 'organization.branches.pos_devices.read' },
    { k: 'cash', title: 'صندوق‌ها', sub: 'به‌زودی', icon: <IconCashRegister size={20} />, tone: s.tGray, perm: 'organization.branches.cash_boxes.read' },
    { k: 'people', title: 'افراد', sub: `${faNum(b.employees.length)} نفر`, icon: <IconUsers size={20} />, tone: s.tPurple, perm: 'organization.branches.employees.read' },
    { k: 'permits', title: 'مجوزها', sub: `${faNum(permitsOn)} مجوز فعال`, icon: <IconShieldCheck size={20} />, tone: s.tOrange, perm: 'organization.branches.permits.read' },
  ];
  return (
    <div className={s.resGrid}>
      {cards.filter((c) => can(c.perm)).map((c) => (
        <button key={c.k} type="button" className={s.resCard} onClick={() => onOpen(c.k)} data-tip={c.title}>
          <span className={`${s.resIcon} ${c.tone}`}>{c.icon}</span>
          <span className={s.resText}><b>{c.title}</b><small>{c.sub}</small></span>
          <IconChevronLeft size={16} className={s.resChev} />
        </button>
      ))}
    </div>
  );
}

// ── لیست محصولات (کالا / آیتم) / نقشه انبار ───────────────────────────
function StockPanel({ b, lp }: { b: BranchDetail; lp: ReturnType<typeof useListParams> }) {
  const can = usePerm();
  const tab = lp.get('tab') || 'goods';
  const primary = b.warehouses.find((w) => w.is_primary) ?? b.warehouses[0];
  const wh = lp.get('wh') || primary?.warehouse_id || '';
  // تغییر تب فیلترهای تب دیگر را پاک می‌کند (کلیدهای فیلتر کالا و آیتم جدا هستند ولی جست‌وجو و صفحه مشترک است)
  const go = (v: string) => lp.set({ tab: v === 'goods' ? null : v, query: null });
  return (
    <Card className={s.stockCard}>
      <div className={s.stockHead}>
        <Segmented value={tab} onChange={go}
          options={[{ value: 'goods', label: 'کالا' }, { value: 'items', label: 'آیتم' }, { value: 'map', label: 'نقشه انبار' }]} />
        {tab === 'map' && b.warehouses.length > 1 ? (
          <Segmented value={wh} onChange={(v) => lp.set({ wh: v === primary?.warehouse_id ? null : v })}
            options={b.warehouses.map((w) => ({ value: w.warehouse_id, label: w.is_primary ? `${w.name} (اصلی)` : w.name }))} />
        ) : null}
      </div>
      {tab === 'map'
        ? (!b.warehouses.length ? <Empty icon={<IconBuildingWarehouse size={26} stroke={1.5} />} title="انباری به این شعبه وصل نیست" /> : <WarehouseMap warehouseId={wh} />)
        : !can('organization.branches.assortment.read') ? <Empty title="لیست محصولات برای حساب شما در دسترس نیست" text="برای دیدن محصولات مجاز شعبه به مجوز «محصولات مجاز» نیاز است." />
          : <ProductsTable key={tab} b={b} kind={tab === 'items' ? 'ITEM' : 'GOOD'} lp={lp} />}
    </Card>
  );
}

function WarehouseMap({ warehouseId }: { warehouseId: string }) {
  const can = usePerm();
  const zones = useZones(warehouseId, can('wms.bins.list'));
  const [zone, setZone] = useState('');
  const z = zone || zones.data?.results[0]?.id || '';
  const bins = useBins(warehouseId, z, can('wms.bins.list'));
  if (!can('wms.bins.list')) return <Empty title="نقشه انبار برای حساب شما در دسترس نیست" text="برای دیدن نقشه به مجوز «آدرس‌های انبار» نیاز است." />;
  if (zones.isLoading) return <SkeletonRows rows={3} />;
  if (zones.error) return <ErrorBox error={zones.error} onRetry={() => zones.refetch()} />;
  if (!zones.data?.results.length) return <Empty icon={<IconMap2 size={26} stroke={1.5} />} title="نقشه‌ی این انبار هنوز تعریف نشده" text="ناحیه‌ها و آدرس‌ها در «مدیریت انبار ⇐ نقشه و آدرس» تعریف می‌شوند." />;
  return (
    <div className={s.mapWrap}>
      <div className={s.zoneList}>
        {zones.data.results.map((x) => (
          <button key={x.id} type="button" className={`${s.zone} ${x.id === z ? s.zoneOn : ''}`} onClick={() => setZone(x.id)}>
            <b data-latin>{x.prefix}</b><span>{x.name}</span><small>{faNum(x.bin_count)} آدرس</small>
          </button>
        ))}
      </div>
      <div className={s.bins}>
        {bins.isLoading ? <SkeletonRows rows={2} /> : bins.data?.results.length ? bins.data.results.map((bn) => (
          <span key={bn.id} className={`${s.bin} ${bn.item_count ? s.binFull : ''} ${bn.is_active ? '' : s.binOff}`} data-tip={`${bn.full_code} — ${faNum(bn.item_count)} کالا${bn.is_active ? '' : ' (غیرفعال)'}`}>
            <b data-latin>{bn.full_code}</b><small>{faNum(bn.item_count)} کالا</small>
          </span>
        )) : <Empty title="این ناحیه آدرسی ندارد" />}
      </div>
    </div>
  );
}
