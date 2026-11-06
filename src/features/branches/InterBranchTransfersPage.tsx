import { useMemo, useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { useListParams } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { ErrorBox, PageHead, Pagination, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { STATE_LABEL, TransferCard, TransferDetailModal, TransferDrawer } from './TransferUI';
import { isInterBranch, useAllTransfers, type TransferStatus } from './transfers';
import t from './transfers.module.css';

const TABS: { key: string; label: string; st: TransferStatus[] }[] = [
  { key: '', label: 'همه', st: [] },
  ...(['PENDING', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CANCELLED'] as TransferStatus[]).map((k) => ({ key: k, label: STATE_LABEL.inter[k], st: [k] })),
];

/**
 * انتقال بین شعب — html Fixed «Branch Management» (افشین 2026-10-25): تب وضعیت با شمارنده، کارت هر انتقال (مسیر، قلم/واحد، وضعیت،
 * مراحل «ثبت شده ⇐ تأیید ⇐ در انتقال ⇐ دریافت/تکمیل»، دلیل رد، عملیات) که با کلیک جزئیات انتقال را باز می‌کند (`open` در URL)،
 * و کشوی «ثبت انتقال» از چپ (شعبه و انبار مبدا، شعبه و انبار مقصد). انتقالی که دو سرش شعبه‌ی مشترک دارد در «انتقال بین شعبه و انبار» است.
 */
export default function InterBranchTransfersPage() {
  const can = usePerm();
  const toast = useToast();
  const lp = useListParams({ page_size: 10 });
  const st = lp.get('status'); const open = lp.get('open');
  const all = useAllTransfers();
  const [creating, setCreating] = useState(lp.get('new') === '1');
  const scoped = useMemo(() => (all.data ?? []).filter(isInterBranch), [all.data]);
  const count = (sts: TransferStatus[]) => (sts.length ? scoped.filter((x) => sts.includes(x.status)).length : scoped.length);
  const tab = TABS.find((x) => x.key === st) ?? TABS[0]!;
  const rows = scoped.filter((x) => !tab.st.length || tab.st.includes(x.status));
  const page = rows.slice((lp.page - 1) * lp.pageSize, lp.page * lp.pageSize);
  return (
    <>
      <PageHead title="انتقال بین شعب" sub="پیگیری چرخه انتقال کالا بین انبارهای شعب"
        actions={can('wms.transfers.create') ? <Button icon={<IconPlus size={16} />} onClick={() => setCreating(true)}>ثبت انتقال</Button> : null} />
      <div className={t.bar}>
        <div className={t.tabs} role="group" aria-label="وضعیت انتقال">
          {TABS.map((x) => (
            <button key={x.key} type="button" aria-pressed={x.key === tab.key} onClick={() => lp.set({ status: x.key || null })}>{x.label}<i>{faNum(count(x.st))}</i></button>
          ))}
        </div>
      </div>
      {all.isLoading ? <SkeletonRows rows={4} /> : all.error ? <ErrorBox error={all.error} onRetry={() => all.refetch()} /> : (
        <div className={t.cards}>
          {page.map((x) => <TransferCard key={x.id} x={x} variant="inter" onOpen={() => lp.set({ open: x.id }, { keepPage: true })} />)}
          {!rows.length ? <div className={t.empty}>انتقال بین شعبه‌ای با این وضعیت وجود ندارد.</div> : null}
        </div>
      )}
      {rows.length > lp.pageSize ? <Pagination page={lp.page} pageSize={lp.pageSize} total={rows.length} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      {open ? <TransferDetailModal id={open} onClose={() => lp.set({ open: null }, { keepPage: true })} /> : null}
      {creating ? <TransferDrawer mode="inter" onClose={() => { setCreating(false); if (lp.get('new')) lp.set({ new: null }, { keepPage: true }); }}
        onCreated={(x) => { setCreating(false); toast(`انتقال بین شعب ${x.transfer_no} ثبت شد و در انتظار تأیید است.`); lp.set({ new: null, status: null }); }} /> : null}
    </>
  );
}
