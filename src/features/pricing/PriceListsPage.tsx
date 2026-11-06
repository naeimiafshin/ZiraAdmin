import { useState } from 'react';
import { userMessage } from '@/shared/api/errors';
import { useToast } from '@/shared/ui/toast';
import { downloadXlsx, useAllBrands, useCategoryTree } from '@/features/catalog/api';
import { FormGrid, Input, Select } from '@/shared/ui/form';
import { useNavigate } from 'react-router';
import { IconChevronLeft, IconDownload, IconPlus, IconFileInvoice } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { TableFilters } from '@/shared/ui/TableFilters';
import { Badge, Card, Empty, Modal, PageHead, Pagination, Segmented } from '@/shared/ui/kit';
import { usePriceLists, type PriceList } from './api';
import { PL_SOURCE, PL_STATUS } from './labels';
import { NewListModal } from './modals';
import s from '@/features/catalog/catalog.module.css';

/**
 * «لیست‌های قیمت» — ظاهر html V2 با مفهوم بک‌اند (افشین 2026-10-22): هر لیست = سند بازنگری قیمت سراسری کالاهای تکی (دستی / از قرارداد / ورود از اکسل).
 * ستون‌های html با معادل بک‌اند: نوع ⇐ منبع، کالا ⇐ تعداد ردیف، بازه اعتبار ⇐ تاریخ اثر، وضعیت ⇐ پیش‌نویس/زمان‌بندی/منتشرشده/لغو. Segmented وضعیت (`st`)؛
 * کلیک ردیف ⇐ صفحه‌ی لیست. خروجی اکسل لیست‌ها با همان فیلترها (P-01، مجوز pricing.price_lists.export)؛ «خروجی قیمت کالاها» ⇐ PriceExportModal (pricing.prices.export).
 */
export default function PriceListsPage() {
  const can = usePerm(); const navigate = useNavigate();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const st = lp.get('st');
  const list = usePriceLists({ page: lp.page, page_size: lp.pageSize, query: dq || undefined, status: st || undefined, source: lp.get('src') || undefined });
  const [create, setCreate] = useState(false); const [priceExp, setPriceExp] = useState(false);
  const toast = useToast(); const [exporting, setExporting] = useState(false);
  const exportXlsx = async () => { setExporting(true); try { await downloadXlsx('/pricing/price-lists/export', { query: dq || undefined, status: st || undefined, source: lp.get('src') || undefined }, 'price-lists.xlsx'); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); } };
  const cols: Column<PriceList>[] = [
    { key: 'name', header: 'نام لیست', render: (r) => <span className={s.itemText} style={{ alignItems: 'flex-start' }}><span className={s.strong}>{r.name}</span><span className={s.itemSub} data-latin>{r.code}</span></span> },
    { key: 'src', header: 'نوع', render: (r) => <>{PL_SOURCE[r.source] ?? r.source}{r.contract_code ? <span className={s.muted} data-latin> · {r.contract_code}</span> : null}</> },
    { key: 'lines', header: 'کالا', render: (r) => <span className="tnum"><b>{faNum(r.line_count)}</b> <span className={s.muted}>عدد</span></span> },
    { key: 'eff', header: 'تاریخ اثر', render: (r) => faDate(r.effective_from) },
    { key: 'st', header: 'وضعیت', render: (r) => <Badge tone={PL_STATUS[r.status]?.tone ?? 'neutral'}>{PL_STATUS[r.status]?.label ?? r.status}</Badge> },
    { key: 'pub', header: 'انتشار', render: (r) => (r.published_at ? faDate(r.published_at) : '—') },
    { key: 'go', header: '', render: () => <IconChevronLeft size={16} className={s.muted} /> },
  ];
  return (
    <>
      <PageHead title="لیست‌های قیمت" sub="بازنگری قیمت فروش کالاهای تکی — دستی، از قرارداد قیمت‌گذاری یا با فایل اکسل؛ قیمت‌ها با انتشار لیست (فوری یا در تاریخ اثر) تغییر می‌کنند."
        actions={<>
          {can('pricing.price_lists.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} onClick={exportXlsx} loading={exporting}>خروجی اکسل لیست‌ها</Button> : null}
          {can('pricing.prices.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} onClick={() => setPriceExp(true)}>خروجی قیمت کالاها</Button> : null}
          {can('pricing.contracts.update') ? <Button variant="secondary" icon={<IconFileInvoice size={17} />} onClick={() => navigate('/pricing/price-lists/apply')}>اعمال قرارداد</Button> : null}
          {can('pricing.price_lists.create') ? <Button icon={<IconPlus size={17} />} onClick={() => setCreate(true)}>لیست قیمت جدید</Button> : null}
        </>} />
      <Card>
        <div className={s.itemsBar}>
          <Segmented value={st} onChange={(v) => lp.set({ st: v || null })} options={[{ value: '', label: 'همه' }, { value: 'PUBLISHED', label: 'منتشرشده' }, { value: 'SCHEDULED', label: 'زمان‌بندی‌شده' }, { value: 'DRAFT', label: 'پیش‌نویس' }, { value: 'CANCELLED', label: 'لغوشده' }]} />
          {list.data ? <span className={s.famCount}>{faNum(list.data.results.length)} از {faNum(list.data.total)} لیست</span> : null}
        </div>
        <TableFilters search={text} onSearch={setText} placeholder="جستجوی نام یا کد لیست…" filters={[{ key: 'src', label: 'نوع', value: lp.get('src'), onChange: (v) => lp.set({ src: v }), options: Object.entries(PL_SOURCE).map(([value, label]) => ({ value, label })) }]} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} onRowClick={(r) => navigate(`/pricing/price-lists/${r.id}`)}
          empty={<Empty title={st || dq ? 'لیستی با این فیلترها پیدا نشد' : 'هنوز لیست قیمتی ساخته نشده است'} text={st || dq ? undefined : 'از «لیست قیمت جدید»، از صفحه‌ی «قیمت کالاها» (ویرایش قیمت‌ها) یا با «اعمال قرارداد» بسازید.'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      </Card>
      {priceExp ? <PriceExportModal onClose={() => setPriceExp(false)} /> : null}
      {create ? <NewListModal onClose={() => setCreate(false)} onCreated={(id) => navigate(`/pricing/price-lists/${id}`)} /> : null}
    </>
  );
}

/**
 * «خروجی قیمت کالاها» (افشین 2026-10-25: از صفحه‌ی حذف‌شده‌ی «قیمت کالاها» به لیست‌های قیمت منتقل شد) ⇐ GET /pricing/prices/export
 * (مجوز pricing.prices.export، سقف ۵۰٬۰۰۰ ردیف): قیمت فعلی فروش با فیلترهای همان endpoint — نوع، دسته (با زیرشاخه‌ها)، برند، وضعیت، جست‌وجو.
 */
function PriceExportModal({ onClose }: { onClose: () => void }) {
  const toast = useToast(); const tree = useCategoryTree(true); const brands = useAllBrands();
  const [kind, setKind] = useState(''); const [cat, setCat] = useState(''); const [brand, setBrand] = useState(''); const [st, setSt] = useState(''); const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await downloadXlsx('/pricing/prices/export', { kind: kind || undefined, category_id: cat || undefined, brand_id: brand || undefined, item_status: st || undefined, query: q.trim() || undefined }, 'prices.xlsx'); toast('فایل قیمت کالاها آماده شد.'); onClose(); }
    catch (e) { toast(userMessage(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="خروجی قیمت کالاها" width={560}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button icon={<IconDownload size={17} />} onClick={go} loading={busy}>دریافت فایل</Button></>}>
      <p className={s.sub} style={{ margin: '0 0 14px' }}>قیمت فعلی فروش کالاها و آیتم‌ها در یک فایل اکسل؛ فیلتر خالی = همه (به جز آرشیوشده‌ها).</p>
      <FormGrid cols={2}>
        <Select label="نوع" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: '', label: 'همه' }, { value: 'GOOD', label: 'کالای تکی' }, { value: 'ITEM', label: 'آیتم' }]} />
        <Select label="وضعیت" value={st} onChange={(e) => setSt(e.target.value)} options={[{ value: '', label: 'همه به جز آرشیوشده' }, { value: 'ACTIVE', label: 'فعال' }, { value: 'DRAFT', label: 'پیش‌نویس' }, { value: 'ARCHIVED', label: 'آرشیوشده' }]} />
        <Select label="دسته اصلی" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="همه" options={(tree.data ?? []).map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="برند" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="همه" options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
        <Input label="جست‌وجو (نام یا کد)" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اختیاری" span={2} />
      </FormGrid>
    </Modal>
  );
}
