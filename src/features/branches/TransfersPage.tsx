import { useEffect, useMemo, useRef, useState } from 'react';
import { IconInfoCircle, IconListDetails, IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { useListParams } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ErrorBox, PageHead, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { useBranch } from './api';
import { STATE_LABEL, TransferCard, TransferDrawer } from './TransferUI';
import { commonBranch, isInternal, useAllTransfers, type Transfer, type TransferStatus } from './transfers';
import t from './transfers.module.css';

const TABS: { key: string; label: string; st: TransferStatus[] }[] = [
  { key: '', label: 'همه', st: [] },
  { key: 'PENDING', label: STATE_LABEL.internal.PENDING, st: ['PENDING'] },
  { key: 'APPROVED', label: 'تأییدشده', st: ['APPROVED'] },
  { key: 'IN_TRANSIT', label: STATE_LABEL.internal.IN_TRANSIT, st: ['IN_TRANSIT'] },
  { key: 'RECEIVED', label: STATE_LABEL.internal.RECEIVED, st: ['RECEIVED'] },
  { key: 'REJECTED', label: STATE_LABEL.internal.REJECTED, st: ['REJECTED'] },
  { key: 'CANCELLED', label: STATE_LABEL.internal.CANCELLED, st: ['CANCELLED'] },
];

/**
 * انتقال بین شعبه و انبار — html Fixed «Branch Management» (پیگیری انتقال بین انبار؛ افشین 2026-10-25):
 * انتقال داخلی هر شعبه میان خود شعبه (انبار اصلی = فروشگاه) و انبارهای اختصاص‌یافته به آن. ۴ شاخص، انتخاب شعبه و انبار،
 * تب وضعیت با شمارنده، کارت هر انتقال (مسیر، قلم/واحد، وضعیت، مراحل، اقلام، عملیات) و کشوی «ثبت انتقال جدید» از چپ.
 * حالت در URL: branch، wh، status، page، new، open. داده: همه‌ی انتقال‌های wms با دسته‌بندی در مرورگر (B-19).
 */
export default function TransfersPage() {
  const can = usePerm();
  const nav = useNavigate();
  const toast = useToast();
  const lp = useListParams({ page_size: 10 });
  const branch = lp.get('branch'); const wh = lp.get('wh'); const st = lp.get('status'); const open = lp.get('open');
  const all = useAllTransfers();
  const branches = useBranchOptions();
  const bd = useBranch(branch || undefined);
  const [creating, setCreating] = useState(lp.get('new') === '1');
  const scoped = useMemo(() => (all.data ?? []).filter((x) => isInternal(x)
    && (!branch || commonBranch(x)?.id === branch || ((x.source_warehouse?.branches ?? []).some((b) => b.id === branch) && (x.destination_warehouse?.branches ?? []).some((b) => b.id === branch)))
    && (!wh || x.source_warehouse?.id === wh || x.destination_warehouse?.id === wh)), [all.data, branch, wh]);
  const count = (sts: TransferStatus[]) => (sts.length ? scoped.filter((x) => sts.includes(x.status)).length : scoped.length);
  const inFlow = count(['PENDING', 'APPROVED', 'IN_TRANSIT']);
  const units = scoped.filter((x) => x.status === 'IN_TRANSIT').reduce((a, x) => a + Number(x.total_quantity ?? 0), 0);
  const tab = TABS.find((x) => x.key === st) ?? TABS[0]!;
  const rows = scoped.filter((x) => (open ? x.id === open : !tab.st.length || tab.st.includes(x.status)));
  const page = rows.slice((lp.page - 1) * lp.pageSize, lp.page * lp.pageSize);
  return (
    <>
      <PageHead title="انتقال بین شعبه و انبار" sub="چرخه انتقال‌های داخلی هر شعبه، از ثبت درخواست تا قطعی شدن سند"
        actions={<>
          {can('wms.stock_reports.list') ? <Button variant="secondary" icon={<IconListDetails size={16} />} onClick={() => nav('/organization/branches/kardex')}>گردش کالا</Button> : null}
          {can('wms.transfers.create') ? <Button icon={<IconPlus size={16} />} onClick={() => setCreating(true)}>ثبت انتقال جدید</Button> : null}
        </>} />
      <div className={t.bar} style={{ background: '#E8F0FB', borderRadius: 12, padding: '12px 15px', color: '#25559E', fontSize: 12, lineHeight: 1.85, alignItems: 'flex-start', gap: 9 }}>
        <IconInfoCircle size={16} style={{ flex: 'none', marginTop: 2, color: 'var(--info)' }} />
        <span>انتقال‌های در جریان تا زمان قطعی شدن در این صفحه پیگیری می‌شوند؛ منوی <b>گردش کالا</b> فقط فرآیندهای به‌اتمام‌رسیده و اسناد قطعی انبار را نمایش می‌دهد. انتقال میان دو شعبه در «انتقال بین شعب» است.</span>
      </div>
      <div className={t.kpis}>
        <Kpi value={all.data ? faNum(inFlow) : '…'} label="انتقال در جریان" color="#C8841A" />
        <Kpi value={all.data ? faNum(units) : '…'} label="واحد در مسیر (ثبت نشده در گردش کالا)" color="#2A6FDB" />
        <Kpi value={all.data ? faNum(count(['RECEIVED'])) : '…'} label="قطعی شده (در گردش کالا)" color="#1F8A5B" />
        <Kpi value={all.data ? faNum(count(['CANCELLED', 'REJECTED'])) : '…'} label="لغو یا رد شده" color="#D74E54" />
      </div>
      <div className={t.bar}>
        <Drop label="شعبه" value={branch} allLabel="همه‌ی شعب" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name, code: b.code }))}
          onChange={(v) => lp.set({ branch: v || null, wh: null, open: null })} />
        <Drop label="انبار" value={wh} allLabel={branch ? 'همه‌ی انبارهای شعبه' : 'انبار (اول شعبه)'} disabled={!branch}
          options={(bd.data?.warehouses ?? []).map((w) => ({ value: w.warehouse_id, label: w.is_primary ? `${bd.data!.name} (فروشگاه)` : w.name, code: w.code }))}
          onChange={(v) => lp.set({ wh: v || null, open: null })} />
        <div className={t.tabs} role="group" aria-label="وضعیت انتقال">
          {TABS.map((x) => (
            <button key={x.key} type="button" aria-pressed={!open && x.key === tab.key} onClick={() => lp.set({ status: x.key || null, open: null })}>{x.label}<i>{faNum(count(x.st))}</i></button>
          ))}
        </div>
        {open ? <Button size="sm" variant="ghost" onClick={() => lp.set({ open: null }, { keepPage: true })}>نمایش همه‌ی انتقال‌ها</Button> : null}
      </div>
      {all.isLoading ? <SkeletonRows rows={4} /> : all.error ? <ErrorBox error={all.error} onRetry={() => all.refetch()} /> : (
        <div className={t.cards}>
          {page.map((x) => <TransferCard key={x.id} x={x} variant="internal" />)}
          {!rows.length ? <div className={t.empty}>انتقال بین انباری با این فیلترها وجود ندارد.</div> : null}
        </div>
      )}
      {rows.length > lp.pageSize ? <Pagination page={lp.page} pageSize={lp.pageSize} total={rows.length} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      {creating ? <TransferDrawer mode="internal" branchId={branch || undefined} onClose={() => { setCreating(false); if (lp.get('new')) lp.set({ new: null }, { keepPage: true }); }}
        onCreated={(x: Transfer) => { setCreating(false); toast(`انتقال داخلی ${x.transfer_no} ثبت شد و در انتظار تأیید است.`); lp.set({ new: null, status: null, open: null, branch: commonBranch(x)?.id ?? branch ?? null }); }} /> : null}
    </>
  );
}

const Kpi = ({ value, label, color }: { value: string; label: string; color: string }) => (
  <div className={t.kpi}><b style={{ color }}>{value}</b><small>{label}</small></div>
);

/** کشویی html (دکمه + فهرست) */
export function Drop({ label, value, allLabel, options, onChange, disabled }: {
  label: string; value: string; allLabel: string; options: { value: string; label: string; code?: string }[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const cur = options.find((o) => o.value === value);
  return (
    <div className={t.pickWrap} ref={ref}>
      <button type="button" className={t.pick} aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)} style={disabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
        <span>{cur?.label ?? allLabel}</span><span className={t.caret}>▾</span>
      </button>
      {open ? (
        <div className={t.menu} role="listbox" aria-label={label}>
          <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(''); setOpen(false); }}>{allLabel}</button>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}><span>{o.label}</span>{o.code ? <span className={t.code} data-latin>{o.code}</span> : null}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
