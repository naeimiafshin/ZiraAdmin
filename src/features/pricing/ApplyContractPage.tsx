import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { IconFileInvoice, IconSearch } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useColumnPrefs } from '@/shared/lib/useColumnPrefs';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ColumnPicker } from '@/shared/ui/ColumnPicker';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Select } from '@/shared/ui/form';
import { Card, Empty, Modal, PageHead, Pagination, SectionTitle, UnitHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { fetchAll } from '@/features/users/api';
import { useCategoryTree, useItems, usePricesFor, type CategoryNode, type ItemRow } from '@/features/catalog/api';
import { ClearFilters, clearGoodsFilters, GOODS_COLUMNS, goodsDataColumns, GoodsFilters, goodsFiltersActive, goodsFilterParams, selectColumn, useLocalFilters, type FP } from '@/features/catalog/catalogTables';
import { previewContract, useContractWrite, useContracts, type ContractPreview } from './api';
import { ROUNDING } from './labels';
import s from '@/features/catalog/catalog.module.css';

/**
 * «اعمال قرارداد» — از صفحه‌ی «لیست‌های قیمت» (افشین 2026-10-24؛ صفحه‌ی «قیمت کالاها» حذف شد).
 * قرارداد فقط قاعده است (درصد تعدیل + گرد کردن)؛ کالاها این‌جا انتخاب می‌شوند: جدول و فیلترهای «لیست کالاها» با مربع انتخاب
 * (انتخاب در صفحه‌های مختلف می‌ماند؛ «انتخاب همه‌ی نتیجه‌ها» تا ۱۰۰۰ کالا — سقف بک‌اند) و دو ستون «قیمت فعلی» و «قیمت جدید» با درصد و گرد کردن همان قرارداد.
 * «پیش‌نمایش و ساخت لیست» ⇐ PUT /contracts/{id}/preview (item_ids) ⇐ تأیید ⇐ PUT /contracts/{id}/apply ⇐ لیست قیمت پیش‌نویس (منبع «از قرارداد»)؛
 * قیمت‌ها با انتشار همان لیست عوض می‌شوند. آیتم‌ها مستقیم انتخاب نمی‌شوند: قیمت آیتم = جمع کالاها × تعدیل آیتم ⇐ خودکار دوباره محاسبه می‌شود (افشین: گزینه‌ی ۱).
 */
const MAX = 1000;
const STEP: Record<string, number> = { NONE: 1, R1000: 1000, R10000: 10000, R100000: 100000 };
/** همان قاعده‌ی بک‌اند (contract_new_price): قیمت × (۱ + درصد/۱۰۰)، گرد نیمه‌به‌بالا به گام گرد کردن */
export const contractPrice = (cur: number, pct: number, rounding: string) => { const step = STEP[rounding] ?? 1; return Math.round((cur * (1 + pct / 100)) / step) * step; };
const flatten = (nodes: CategoryNode[], out = new Map<string, CategoryNode>()) => { for (const n of nodes) { out.set(n.id, n); flatten(n.children ?? [], out); } return out; };

export default function ApplyContractPage() {
  const can = usePerm(); const navigate = useNavigate(); const toast = useToast();
  const back = useBack('/pricing/price-lists');
  const [sp] = useSearchParams();
  const contracts = useContracts({ page: 1, page_size: 100, status: 'ACTIVE', expired: false });
  const w = useContractWrite();
  const [cid, setCid] = useState(sp.get('contract') ?? '');
  const c = contracts.data?.results.find((x) => x.id === cid);
  const tree = useCategoryTree(true); const byId = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const gf = useLocalFilters();
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const fp: FP = useMemo(() => ({ get: gf.get, set: (x) => { gf.set(x); setPage(1); } }), [gf]);
  const filt = { kind: 'GOOD', query: dq || undefined, ...goodsFilterParams(gf) };
  const list = useItems({ ...filt, page, page_size: pageSize });
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const canPrice = can('pricing.prices.list');
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const prices = usePricesFor(ids, canPrice);
  const [sel, setSel] = useState<string[]>([]);
  const [busyAll, setBusyAll] = useState(false);
  const [pv, setPv] = useState<ContractPreview | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const pickable = rows.filter((r) => r.status !== 'ARCHIVED');
  const allOn = pickable.length > 0 && pickable.every((r) => sel.includes(r.id));
  const toggle = (r: ItemRow) => { if (r.status === 'ARCHIVED') return; setSel((x) => (x.includes(r.id) ? x.filter((i) => i !== r.id) : [...x, r.id])); };
  const pct = c ? Number(c.adjustment_pct) : 0;
  const newCol: Column<ItemRow> = {
    key: 'new', header: <UnitHead>{c ? 'قیمت جدید (قرارداد)' : 'قیمت جدید'}</UnitHead>, render: (g) => {
      const cur = Number(prices.data?.get(g.id)?.sale_price || 0);
      if (!c) return <span className={s.priceMuted} data-tip="ابتدا قرارداد را انتخاب کنید">—</span>;
      if (!cur) return <span className={s.priceMuted} data-tip="قیمت ثبت نشده؛ تغییر نمی‌کند">—</span>;
      const nv = contractPrice(cur, pct, c.rounding);
      return <span className="tnum" data-new-price><b style={{ color: nv < cur ? 'var(--danger)' : 'var(--success)' }}>{faNum(nv)}</b></span>;
    },
  };
  const prefs = useColumnPrefs('pricing.applyContract.goods', [...GOODS_COLUMNS.filter((x) => x.key !== 'acts'), { key: 'new', label: 'قیمت جدید', fixed: true }], ['sku', 'barcode', 'buy', 'margin']);
  const data = goodsDataColumns(prices, canPrice).map((col) => (col.key === 'sale' ? { ...col, header: <UnitHead>قیمت فعلی</UnitHead> } : col));
  const cols: Column<ItemRow>[] = [
    selectColumn<ItemRow>({ isOn: (r) => sel.includes(r.id), toggle, label: (r) => `انتخاب ${r.code}`, disabled: (r) => r.status === 'ARCHIVED', allOn,
      toggleAll: () => setSel((x) => (allOn ? x.filter((i) => !pickable.some((r) => r.id === i)) : Array.from(new Set([...x, ...pickable.map((r) => r.id)])))) }),
    ...data.filter((col) => prefs.isVisible(col.key)), newCol,
  ];
  const selectAll = async () => {
    setBusyAll(true);
    try {
      const all = await fetchAll<ItemRow>('/catalog/items', filt as Record<string, string | undefined>);
      const got = all.filter((r) => r.status !== 'ARCHIVED').map((r) => r.id);
      setSel((x) => Array.from(new Set([...x, ...got])).slice(0, MAX));
      if (got.length + sel.length > MAX) toast(`حداکثر ${faNum(MAX)} کالا در هر بار اعمال؛ فقط ${faNum(MAX)} کالای اول انتخاب شد.`, 'error');
    } catch (e) { toast(userMessage(e), 'error'); } finally { setBusyAll(false); }
  };
  const doPreview = async () => {
    setErr(null); if (!cid) { setErr('قرارداد را انتخاب کنید.'); return; }
    if (!sel.length) { setErr('دست‌کم یک کالا انتخاب کنید.'); return; }
    if (sel.length > MAX) { setErr(`حداکثر ${faNum(MAX)} کالا در هر بار اعمال مجاز است.`); return; }
    setBusy(true); try { setPv(await previewContract(cid, { item_ids: sel })); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  const apply = async () => {
    try { const pl = await w.apply.mutateAsync({ id: cid, sel: { item_ids: sel } }); toast(`لیست قیمت پیش‌نویس «${pl.name}» با ${faNum(pl.line_count)} ردیف ساخته شد.`); navigate(`/pricing/price-lists/${pl.id}`); }
    catch (e) { setErr(userMessage(e)); setPv(null); }
  };
  const active = !!dq || goodsFiltersActive(gf);
  return (
    <>
      <PageHead title="اعمال قرارداد قیمت‌گذاری" back={back} sub="قرارداد فقط درصد تعدیل را تعیین می‌کند؛ کالاها را این‌جا انتخاب کنید. نتیجه یک لیست قیمت پیش‌نویس است و قیمت‌ها با انتشار آن لیست تغییر می‌کنند." />
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <Card>
        <SectionTitle>۱. قرارداد</SectionTitle>
        <div className={s.filterRow} style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', alignItems: 'center' }}>
          <Select label="قرارداد" required value={cid} onChange={(e) => setCid(e.target.value)} placeholder={contracts.data?.results.length === 0 ? 'قرارداد فعالی نیست' : 'انتخاب کنید'}
            options={(contracts.data?.results ?? []).map((x) => ({ value: x.id, label: `${x.code} · ${x.name} (${Number(x.adjustment_pct) > 0 ? '+' : ''}${faNum(Number(x.adjustment_pct))}٪)` }))} />
          {c ? <p className={s.sub} style={{ margin: 0 }} data-contract-info>تعدیل <b className="tnum" dir="ltr">{pct > 0 ? '+' : ''}{faNum(pct)}٪</b> · {ROUNDING[c.rounding] ?? c.rounding} · تاریخ اثر {faDate(c.valid_from)} · معتبر تا {faDate(c.valid_to)}</p> : <p className={s.sub} style={{ margin: 0 }}>قرارداد را از «قرارداد قیمت‌گذاری» تعریف کنید.</p>}
        </div>
        <p className={s.intro} style={{ margin: 0 }}>قیمت آیتم‌هایی که این کالاها را دارند (جمع کالاها × درصد تعدیل آیتم) پس از انتشار لیست خودکار دوباره محاسبه می‌شود.</p>
      </Card>
      <Card>
        <div className={s.famHead}>
          <SectionTitle extra={list.data ? <span className={s.famCount} data-sel-count>{faNum(sel.length)} کالا انتخاب شده · {faNum(list.data.total)} کالا با این فیلترها</span> : null}>۲. انتخاب کالاها</SectionTitle>
          <div className={s.famTools}>
            <label className={s.famSearch}><IconSearch size={16} className={s.muted} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، کد یا بارکد کالا…" aria-label="جست‌وجو" /></label>
            <ColumnPicker {...prefs} />
            <ClearFilters onClick={() => { setQ(''); clearGoodsFilters(fp); }} disabled={!active} />
          </div>
        </div>
        <GoodsFilters fp={fp} mains={tree.data ?? []} byId={byId} />
        <div className={s.compact} data-apply-goods>
          <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
            onRowClick={toggle} isSelected={(r) => sel.includes(r.id)} empty={<Empty title="کالایی با این فیلترها پیدا نشد" />} />
        </div>
        {list.data && list.data.total > 0 ? <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} sizes={[25, 50, 100]} /> : null}
      </Card>
      {can('pricing.contracts.update') ? (
        <div className={s.editBar} data-apply-bar>
          <span><b className="tnum">{faNum(sel.length)}</b> کالا انتخاب شده{sel.length ? <> · <button type="button" className={s.linkBtn} onClick={() => setSel([])}>پاک کردن انتخاب</button></> : null}</span>
          <span className={s.rowActions}>
            <Button variant="secondary" size="sm" onClick={selectAll} loading={busyAll} disabled={!list.data?.total}>انتخاب همه‌ی {list.data ? faNum(Math.min(list.data.total, MAX)) : ''} کالای این فیلتر</Button>
            <Button size="sm" icon={<IconFileInvoice size={15} />} onClick={doPreview} loading={busy} disabled={!cid || !sel.length}>پیش‌نمایش و ساخت لیست قیمت</Button>
          </span>
        </div>
      ) : null}
      {pv ? (
        <Modal open onClose={() => setPv(null)} title="پیش‌نمایش اعمال قرارداد" width={680}
          footer={<><Button variant="secondary" onClick={() => setPv(null)}>بازگشت</Button><Button onClick={apply} disabled={!pv.priced} loading={w.apply.isPending}>ساخت لیست قیمت پیش‌نویس</Button></>}>
          <div data-preview>
            <div className={s.expandGrid}>
              <div className={s.kv}><span>کالای انتخاب‌شده</span><b>{faNum(pv.matched)}</b></div>
              <div className={s.kv}><span>دارای قیمت (ردیف لیست)</span><b>{faNum(pv.priced)}</b></div>
              <div className={s.kv}><span>بدون قیمت (تغییر نمی‌کند)</span><b>{faNum(pv.unpriced_count)}</b></div>
              <div className={s.kv}><span>قیمت صفر بعد از تعدیل</span><b>{faNum(pv.zero_price_codes.length)}</b></div>
            </div>
            <div className={`${s.compBox} ${s.compCenter}`} style={{ maxHeight: 280, overflow: 'auto' }}>
              <table><thead><tr><th>کد</th><th>نام کالا</th><th><UnitHead>قیمت فعلی</UnitHead></th><th><UnitHead>قیمت جدید</UnitHead></th><th><UnitHead>تفاوت</UnitHead></th></tr></thead>
                <tbody>{pv.rows.slice(0, 100).map((r) => <tr key={r.item_id}><td className={s.muted} data-latin>{r.code}</td><td><span className={s.famName} style={{ maxWidth: 220 }} data-tip={r.display_name}>{r.display_name}</span></td><td className="tnum">{faNum(Number(r.current_price))}</td><td className="tnum"><b>{faNum(Number(r.new_price))}</b></td><td className="tnum" style={{ color: Number(r.difference) < 0 ? 'var(--danger)' : 'var(--success)' }}>{faNum(Number(r.difference))}</td></tr>)}</tbody></table>
            </div>
            {pv.truncated || pv.rows.length > 100 ? <p className={s.sub}>فقط بخشی از ردیف‌ها نمایش داده شد؛ همه‌ی ردیف‌ها در لیست ساخته می‌شوند.</p> : null}
            <p className={s.sub}>یک لیست قیمت پیش‌نویس با تاریخ اثر قرارداد ساخته می‌شود؛ ردیف‌ها را در صفحه‌ی لیست بازبینی و سپس منتشر کنید.</p>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
