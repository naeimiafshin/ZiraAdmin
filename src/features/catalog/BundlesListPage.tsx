import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconChevronDown, IconChevronUp, IconDownload, IconArchive, IconPencil, IconPlayerPlay, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { TableFilters } from '@/shared/ui/TableFilters';
import { Badge, Card, Empty, PageHead, Pagination, Segmented, Rial, UnitHead, DiscountedPrice } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { downloadXlsx, useBundle, useBundleMutations, useBundlePrice, useBundlePricesFor, useBundlePolicies, useBundles, type BundlePrice, type BundleRow } from './api';
import { bundleStatus } from './labels';
import { ConfirmModal, IconButton, Kv } from './components';
import s from './catalog.module.css';

/**
 * «لیست باندل‌ها» — مطابق html Fixed V2: Segmented همه/فعال/غیرفعال (`act`)، جست‌وجو + فیلتر سیاست، جدول (کد، نام، اقلام، تعداد کل کالا، قیمت باندل، تاریخ ایجاد)
 * و پنل بازشونده (اقلام با تخفیف و قیمت در باندل، جمع‌بندی قیمت، انتشار/آرشیو/حذف). قیمت ردیف‌های هر صفحه با یک درخواست
 * GET /pricing/bundle-prices?bundle_ids=… (C-21 ✅، effective_price). خروجی اکسل GET /catalog/bundles/export با همان فیلترها، فقط با catalog.bundles.export (C-22 ✅).
 * «آرشیو» به جای «توقف» (C-24 ✅): PATCH /archive؛ باندلی که یک بار منتشر شده حذف نمی‌شود، فقط آرشیو؛ «حذف» فقط برای هرگز‌منتشرنشده.
 */
const ACT: Record<string, boolean | undefined> = { '': undefined, on: true, off: false };

export default function BundlesListPage() {
  const can = usePerm();
  const navigate = useNavigate();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const act = lp.get('act');
  const policies = useBundlePolicies();
  const toast = useToast();
  const filters = { query: dq || undefined, policy: lp.get('policy') || undefined, is_active: ACT[act] };
  const list = useBundles({ page: lp.page, page_size: lp.pageSize, ...filters });
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const canPrice = can('pricing.prices.bundles.read');
  const prices = useBundlePricesFor((list.data?.results ?? []).map((b) => b.id), canPrice);
  const doExport = async () => { setExporting(true); try { await downloadXlsx('/catalog/bundles/export', filters, 'bundles.xlsx'); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); } };
  const cols: Column<BundleRow>[] = [
    { key: 'code', header: 'کد باندل', render: (b) => <span className={s.codeChip} data-latin>{b.code}</span> },
    { key: 'name', header: 'نام باندل', render: (b) => <span className={s.swRow} style={{ gap: 8 }}><span className={`${s.strong} ${s.famName}`} style={{ maxWidth: 260 }} data-tip={b.name}>{b.name}</span><Badge tone={bundleStatus(b).tone}>{bundleStatus(b).label}</Badge></span> },
    { key: 'lines', header: 'اقلام', render: (b) => <span className="tnum"><b>{faNum(b.line_count)}</b> <span className={s.muted}>عدد</span></span> },
    { key: 'qty', header: 'تعداد کل کالا', render: (b) => <span className="tnum"><b>{faNum(Number(b.total_qty))}</b> <span className={s.muted}>عدد</span></span> },
    ...(canPrice ? [{ key: 'price', header: <UnitHead>قیمت باندل</UnitHead>, render: (b: BundleRow) => <BundlePriceCell p={prices.data?.get(b.id)} loading={prices.isLoading} /> }] : []),
    { key: 'created', header: 'تاریخ ایجاد', render: (b) => faDate(b.created_at) },
    {
      key: 'acts', header: '', render: (b) => (
        <span className={s.rowActions}>
          {can('catalog.bundles.update') ? <IconButton label="ویرایش باندل" onClick={() => navigate(`/catalog/bundles/${b.id}/edit`)}><IconPencil size={15} /></IconButton> : null}
          <IconButton label={open === b.id ? 'بستن جزئیات' : 'نمایش جزئیات'} onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}</IconButton>
        </span>
      ),
    },
  ];
  const active = !!dq || !!lp.get('policy') || !!act;
  return (
    <>
      <PageHead title="لیست باندل‌ها" sub="باندل‌های تعریف‌شده، اقلام هر باندل و قیمت نهایی آن."
        actions={<>
          {can('catalog.bundles.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} onClick={doExport} loading={exporting} data-tip="باندل‌های همین فیلترها (بدون قیمت)">خروجی اکسل</Button> : null}
          {can('catalog.bundles.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/catalog/bundles/new')}>تعریف باندل جدید</Button> : null}
        </>} />
      <Card>
        <div className={s.itemsBar}>
          <Segmented value={act} onChange={(v) => lp.set({ act: v || null })} options={[{ value: '', label: 'همه' }, { value: 'on', label: 'فعال' }, { value: 'off', label: 'غیرفعال' }]} />
          {list.data ? <span className={s.famCount}>{faNum(list.data.results.length)} از {faNum(list.data.total)} باندل</span> : null}
        </div>
        <TableFilters search={text} onSearch={setText} placeholder="جستجوی نام یا کد باندل…" filters={[
          { key: 'policy', label: 'سیاست باندل', value: lp.get('policy'), onChange: (v) => lp.set({ policy: v }), options: (policies.data ?? []).map((x) => ({ value: x.code, label: x.name })) },
        ]} />
        <div className={s.compact}>
          <DataTable columns={cols} rows={list.data?.results} rowKey={(b) => b.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
            onRowClick={(b) => setOpen(open === b.id ? null : b.id)} isSelected={(b) => b.id === open}
            expanded={(b) => (b.id === open ? <BundleExpand id={b.id} onEdit={() => navigate(`/catalog/bundles/${b.id}/edit`)} onDeleted={() => setOpen(null)} /> : null)}
            empty={<Empty title={active ? 'باندلی با این فیلترها پیدا نشد' : 'هنوز باندلی تعریف نشده است'} text={active ? undefined : 'با «تعریف باندل جدید» چند کالا یا آیتم را در یک پک با قیمت ویژه بفروشید.'} />} />
        </div>
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      </Card>
    </>
  );
}

function BundlePriceCell({ p, loading }: { p?: BundlePrice; loading: boolean }) {
  if (loading) return <span className={s.priceMuted}>…</span>;
  const v = p?.effective_price;
  return v ? <span className={`${s.price} tnum`} style={{ color: 'var(--brand)' }}>{faNum(Number(v))}</span> : <span className={s.priceMuted} data-tip={p?.unpriced_item_codes?.length ? `بدون قیمت: ${p.unpriced_item_codes.join('، ')}` : ''}>—</span>;
}

/** پنل جزئیات باندل: اقلام با تخفیف و قیمت در باندل، جمع‌بندی قیمت، انتشار/آرشیو/حذف */
function BundleExpand({ id, onEdit, onDeleted }: { id: string; onEdit: () => void; onDeleted: () => void }) {
  const can = usePerm();
  const toast = useToast();
  const d = useBundle(id);
  const pr = useBundlePrice(id, can('pricing.prices.bundles.read'));
  const m = useBundleMutations();
  const [del, setDel] = useState(false);
  if (d.isLoading) return <div className={s.expand}><span className={s.muted}>در حال بارگذاری…</span></div>;
  if (!d.data) return null;
  const b = d.data; const p = pr.data;
  const line = (itemId: string) => p?.lines.find((l) => l.item_id === itemId);
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); } catch (e) { toast(userMessage(e), 'error'); } };
  const disc = p?.items_total && p.effective_price ? Number(p.items_total) - Number(p.effective_price) : 0;
  return (
    <div className={s.expand} onClick={(e) => e.stopPropagation()} data-bundle-expand>
      <div className={s.expandGrid}>
        <Kv k="سیاست باندل" v={b.policy_name || b.policy} />
        <Kv k="وضعیت" v={b.is_active ? `فعال${b.published_at ? ` · از ${faDate(b.published_at)}` : ''}` : bundleStatus(b).label} />
        <Kv k="قابل فروش" v={b.is_available ? 'بله' : 'خیر (قلم غیرفعال یا ناموجود)'} />
        <Kv k="توضیحات" v={b.description || '—'} />
      </div>
      <div className={`${s.compBox} ${s.compCenter}`} data-bundle-lines>{/* هم‌شکل جدول کالاهای پک در جزئیات آیتم؛ همه‌ی سلول‌ها وسط‌چین (افشین 2026-10-24) */}
        <table>
          <thead><tr><th>کد کالا</th><th>نام کالا</th><th>تعداد</th><th><UnitHead>قیمت پایه</UnitHead></th><th><UnitHead unit="٪ یا ریال">تخفیف</UnitHead></th><th><UnitHead>قیمت در باندل</UnitHead></th></tr></thead>
          <tbody>{b.lines.map((l) => { const x = line(l.item_id); return (
            <tr key={l.id}>
              <td className={s.muted} data-latin>{l.item_code}</td>
              <td><span className={s.famName} style={{ maxWidth: 260 }} data-tip={l.item_name}>{l.item_name}</span>{l.item_status !== 'ACTIVE' ? <> <Badge tone="warning">غیرفعال</Badge></> : null}</td>
              <td className="tnum">{faNum(Number(l.quantity))}</td>
              <td className="tnum">{x?.unit_price ? faNum(Number(x.unit_price)) : '—'}</td>
              <td className="tnum">{x?.discount_type ? (x.discount_type === 'PERCENT' ? `${faNum(Number(x.discount_value))}٪` : faNum(Number(x.discount_value))) : '—'}</td>
              <td>{x?.net_total ? <DiscountedPrice original={x.unit_price ? Number(x.unit_price) * Number(l.quantity) : null} discount={x.unit_price ? Number(x.unit_price) * Number(l.quantity) - Number(x.net_total) : 0} final={Number(x.net_total)} fmt={faNum} /> : '—'}</td>
            </tr>
          ); })}</tbody>
        </table>
      </div>
      {p ? (
        <div className={s.expandGrid} style={{ marginTop: 12 }}>
          <Kv k="جمع قیمت پایه" v={p.items_total ? <>{faNum(Number(p.items_total))}<Rial /></> : '—'} />
          <Kv k="قیمت محاسبه‌شده" v={p.computed_price ? <>{faNum(Number(p.computed_price))}<Rial /></> : '—'} />
          <Kv k="قیمت نهایی دستی" v={p.final_price_override ? <>{faNum(Number(p.final_price_override))}<Rial /></> : '—'} />
          <Kv k="قیمت باندل" v={<DiscountedPrice original={p.items_total ? Number(p.items_total) : null} discount={disc > 0 ? disc : 0} final={p.effective_price ? Number(p.effective_price) : null} fmt={faNum} rial />} />
        </div>
      ) : null}
      <div className={s.rowActions} style={{ marginTop: 14, justifyContent: 'flex-start' }}>
        {can('catalog.bundles.update') ? <Button size="sm" icon={<IconPencil size={15} />} onClick={onEdit}>ویرایش باندل</Button> : null}
        {can('catalog.bundles.update') && !b.is_active ? <Button size="sm" variant="secondary" icon={<IconPlayerPlay size={15} />} onClick={() => run(() => m.publish.mutateAsync(id), 'باندل منتشر شد.')} loading={m.publish.isPending}>انتشار</Button> : null}
        {can('catalog.bundles.update') && b.is_active ? <Button size="sm" variant="secondary" icon={<IconArchive size={15} />} onClick={() => run(() => m.archive.mutateAsync(id), 'باندل آرشیو شد.')} loading={m.archive.isPending}>آرشیو</Button> : null}
        {can('catalog.bundles.delete') && !b.is_active && !b.published_at ? <Button size="sm" variant="secondary" icon={<IconTrash size={15} />} onClick={() => setDel(true)}>حذف</Button> : null}
        {!b.is_active && b.published_at ? <span className={s.sub}>باندلی که منتشر شده حذف نمی‌شود؛ فقط آرشیو می‌شود.</span> : null}
      </div>
      {del ? <ConfirmModal title="حذف باندل" confirmLabel="حذف کن" danger onClose={() => setDel(false)} text={<>باندل <b>{b.name}</b> برای همیشه حذف می‌شود.</>}
        onConfirm={async () => { await m.remove.mutateAsync(id); toast('باندل حذف شد.'); onDeleted(); }} /> : null}
    </div>
  );
}
