import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconArchive, IconPencil, IconPlayerPause, IconPlayerPlay, IconPlus } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, Modal, Pagination, UnitHead } from '@/shared/ui/kit';
import { Alert } from '@/shared/ui/Alert';
import { Textarea } from '@/shared/ui/form';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { IconButton } from '@/features/catalog/components';
import { useCoupons, useCouponWrite, type Coupon } from './marketingApi';
import { CouponExport, showValue, useGoNewCoupon } from './mkShared';
import s from '@/features/catalog/catalog.module.css';
import m from './marketing.module.css';

/**
 * تب «کدهای تخفیف» تخفیف‌ساز — html V2 (pc-10x-mk-ds3): فیلتر فعال / منقضی / غیرفعال، جستجوی کد، «کد تخفیف جدید» (⇐ /pricing/discounts/coupons/new)،
 * ویرایش ⇐ صفحه‌ی کامل (/pricing/discounts/coupons/:id/edit؛ همه‌ی فیلدها جز متن کد)؛ ابطال دائمی (آرشیو، P-11 ✅) ⇐ PATCH /coupons/{id}/archive با دلیل اختیاری، برگشت‌ناپذیر.
 * ستون‌ها: کد، نوع، مقدار، دامنه اعمال، حداقل مبلغ خرید، استفاده (استفاده‌شده / سقف)، انقضا، وضعیت.
 * فیلتر وضعیت ⇐ پارامتر `state` بک‌اند (P-11/P-09): ACTIVE، PENDING، DISABLED، EXPIRED، EXHAUSTED، ARCHIVED و INACTIVE (= «منقضی یا غیرفعال» html: هر چیز جز فعال)؛ برچسب ردیف از `state`.
 * CouponOut نوع مقدار و دامنه ندارد (P-07) ⇐ نوع از قالب ثابت value_display (٪ / ریال / ارسال رایگان)، دامنه = عنوان تخفیف.
 * کدی که تخفیفش هنوز تأیید نشده «در انتظار تأیید» است (در فروشگاه کار نمی‌کند).
 */
/** وضعیت‌ها (افشین 2026-10-24: همه در یک فیلتر کشویی) ⇐ `state` بک‌اند (P-11 ✅)؛ «منقضی یا غیرفعال» = INACTIVE (P-09 ✅) */
const STATE_OPTIONS = [
  { value: 'ACTIVE', label: 'فعال' }, { value: 'PENDING', label: 'در انتظار تأیید' }, { value: 'DISABLED', label: 'غیرفعال (موقت)' },
  { value: 'EXPIRED', label: 'منقضی' }, { value: 'EXHAUSTED', label: 'تمام‌شده (سقف استفاده پر)' }, { value: 'ARCHIVED', label: 'آرشیو (ابطال دائمی)' },
  { value: 'INACTIVE', label: 'منقضی یا غیرفعال (همه به جز فعال)' },
];
const STATES: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ACTIVE: { label: 'فعال', tone: 'success' }, PENDING: { label: 'در انتظار تأیید', tone: 'warning' }, DISABLED: { label: 'غیرفعال', tone: 'neutral' },
  EXPIRED: { label: 'منقضی', tone: 'danger' }, EXHAUSTED: { label: 'تمام‌شده', tone: 'warning' }, ARCHIVED: { label: 'آرشیو', tone: 'neutral' },
};
export const valueKind = (v: string) => (v.includes('٪') ? 'درصدی' : v.includes('ارسال') ? 'ارسال رایگان' : v.includes('ریال') ? 'مبلغی' : v);
const couponBadge = (c: Coupon) => { const x = STATES[c.state] ?? { label: c.status_display, tone: 'neutral' as const };
  return <span data-tip={c.state === 'ARCHIVED' && c.archive_reason ? `دلیل ابطال: ${c.archive_reason}` : undefined}><Badge tone={x.tone}>{x.label}</Badge></span>; };

export function CouponsTab() {
  const can = usePerm(); const toast = useToast(); const navigate = useNavigate(); const w = useCouponWrite(); const goNew = useGoNewCoupon();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const f = lp.get('f');
  const q = { query: dq || undefined, state: f || undefined };
  const [arch, setArch] = useState<Coupon | null>(null);
  const list = useCoupons({ page: lp.page, page_size: lp.pageSize, ...q });
  const toggle = async (c: Coupon) => { try { await (c.status === 'ACTIVE' ? w.disable : w.enable).mutateAsync(c.id); toast(c.status === 'ACTIVE' ? 'کد تخفیف غیرفعال شد.' : 'کد تخفیف فعال شد.'); } catch (e) { toast(userMessage(e), 'error'); } };
  const cols: Column<Coupon>[] = [
    { key: 'code', header: 'کد', render: (c) => <span className={s.codeChip} data-latin>{c.code_text}</span> },
    { key: 'type', header: 'نوع', render: (c) => <span className={s.muted}>{valueKind(c.value_display)}</span> },
    { key: 'val', header: 'مقدار', render: (c) => <span className={`${m.val} tnum`}>{valueKind(c.value_display) === 'ارسال رایگان' ? '—' : showValue(c.value_display)}</span> },
    { key: 'scope', header: 'دامنه اعمال', render: (c) => <span className={m.cellClip} data-tip={c.discount_title}>{c.discount_title}</span> },
    { key: 'min', header: <UnitHead>حداقل مبلغ خرید</UnitHead>, render: (c) => <span className="tnum">{c.min_amount ? faNum(c.min_amount) : '—'}</span> },
    { key: 'use', header: 'استفاده', render: (c) => <span className="tnum">{faNum(c.used_count)} / {c.usage_limit ? faNum(c.usage_limit) : '∞'}</span> },
    { key: 'exp', header: 'انقضا', render: (c) => <span className="tnum">{c.expires_at ? faDate(c.expires_at) : '—'}</span> },
    { key: 'st', header: 'وضعیت', render: couponBadge },
    { key: 'acts', header: '', render: (c) => (can('pricing.coupons.update') ? <span className={s.rowActions}>
      {c.state !== 'ARCHIVED' && !c.is_expired ? <IconButton label={c.status === 'ACTIVE' ? 'غیرفعال کردن کد' : 'فعال کردن کد'} onClick={() => toggle(c)}>{c.status === 'ACTIVE' ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}</IconButton> : null}
      {c.state !== 'ARCHIVED' ? <IconButton label="ویرایش کد" onClick={() => navigate(`/pricing/discounts/coupons/${c.id}/edit`)}><IconPencil size={15} /></IconButton> : null}
      {c.state !== 'ARCHIVED' ? <IconButton label="ابطال دائمی (آرشیو)" danger onClick={() => setArch(c)}><IconArchive size={15} /></IconButton> : null}</span> : null) },
  ];
  return (
    <Card>
      <div className={m.listHead}>
        <h3 className={m.cardTitle}>کدهای تخفیف</h3>
        {list.data ? <span className={s.famCount}>{faNum(list.data.total)} کد</span> : null}
        <span className={m.grow} />
        {can('pricing.coupons.export') ? <CouponExport query={q} /> : null}
        {can('pricing.coupons.create') ? <Button icon={<IconPlus size={17} />} onClick={goNew}>کد تخفیف جدید</Button> : null}
      </div>
      <TableFilters search={text} onSearch={setText} placeholder="جستجوی کد یا دامنه…" filters={[{ key: 'f', label: 'وضعیت', value: f, onChange: (v) => lp.set({ f: v }), options: STATE_OPTIONS }]} />
      <div className={s.compact}>
        <DataTable columns={cols} rows={list.data?.results} rowKey={(c) => c.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={f || dq ? 'کدی با این فیلترها پیدا نشد' : 'هنوز کد تخفیفی ساخته نشده است'} text={f || dq ? undefined : 'کد تخفیف قابل‌اشتراک با سقف استفاده و تاریخ انقضا بسازید.'} />} />
      </div>
      {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      {arch ? <ArchiveCouponModal c={arch} onClose={() => setArch(null)} onDone={() => { setArch(null); toast(`کد ${arch.code_text} برای همیشه باطل شد.`); }} archive={(reason) => w.archive.mutateAsync({ id: arch.id, reason })} /> : null}
    </Card>
  );
}

/** ابطال دائمی کد (P-11): برگشت‌ناپذیر — کد دیگر نه فعال می‌شود نه ویرایش؛ دلیل اختیاری (حداکثر ۵۰۰ نویسه) در `archive_reason` می‌ماند */
function ArchiveCouponModal({ c, archive, onClose, onDone }: { c: Coupon; archive: (reason: string) => Promise<unknown>; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async () => { setBusy(true); setErr(null); try { await archive(reason.trim()); onDone(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} title="ابطال دائمی کد تخفیف" width={480}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button variant="danger" onClick={go} loading={busy}>باطل کن</Button></>}>
      {err ? <div style={{ marginBottom: 10 }}><Alert>{err}</Alert></div> : null}
      <p style={{ margin: '0 0 12px', lineHeight: 1.9 }}>کد <b data-latin>{c.code_text}</b> برای همیشه باطل می‌شود و دیگر قابل فعال‌سازی یا ویرایش نیست. این کار برگشت‌پذیر نیست؛ برای توقف موقت از «غیرفعال کردن» استفاده کنید.</p>
      <Textarea label="دلیل ابطال (اختیاری)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} rows={3} />
    </Modal>
  );
}
