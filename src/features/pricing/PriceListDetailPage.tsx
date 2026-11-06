import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { IconAdjustmentsDollar, IconBan, IconCheck, IconFileUpload, IconPencil, IconPlus, IconSearch, IconSend, IconTrash, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { useBack } from '@/shared/lib/useBack';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Field, FormGrid, Input, Select } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Badge, Card, Empty, Modal, PageHead, Pagination, SectionTitle, SkeletonRows, UnitHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal, IconButton } from '@/features/catalog/components';
import { downloadXlsx, useAllBrands, useCategoryTree, useItems, usePricesFor, type CategoryNode, type ItemRow } from '@/features/catalog/api';
import { allPriceListLines, usePriceList, usePriceListLines, usePriceListWrite, type PriceListLine } from './api';
import { PL_SOURCE, PL_STATUS } from './labels';
import { BulkPriceModal, type BulkRow } from './BulkPriceModal';
import { ClearFilters, goodsDataColumns, selectColumn } from '@/features/catalog/catalogTables';
import s from '@/features/catalog/catalog.module.css';
import { groupMoney } from '@/shared/lib/money';

/**
 * صفحه‌ی یک لیست قیمت: مشخصات، ردیف‌ها (قیمت فعلی، جدید، تفاوت؛ جست‌وجو در سرور)، و برای پیش‌نویس: ویرایش نام/تاریخ اثر، ویرایش درجای قیمت جدید و حذف ردیف،
 * افزودن کالا، ورود از اکسل (ستون A کد یا بارکد، ستون B قیمت جدید؛ ادغام با ردیف‌های فعلی)، انتشار (pricing.price_lists.approve — تاریخ اثر آینده ⇐ زمان‌بندی) و لغو.
 * ذخیره‌ی ردیف‌ها = PUT /price-lists/{id} با همه‌ی ردیف‌ها (جایگزینی کامل).
 * لیست دستی/اکسل (نه «از قرارداد»): مربع انتخاب ردیف‌ها + «تغییر قیمت جمعی» (BulkPriceModal) — قیمت تکی هر ردیف همچنان درجا ویرایش می‌شود.
 */
const digits = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');

export default function PriceListDetailPage() {
  const { id } = useParams();
  const can = usePerm(); const toast = useToast(); const back = useBack('/pricing/price-lists');
  const q = usePriceList(id);
  const [page, setPage] = useState(1); const [ps, setPs] = useState(25); const [qs, setQs] = useState(''); const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => { setDq(qs.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [qs]);
  const lines = usePriceListLines(id, { page, page_size: ps, query: dq || undefined });
  const w = usePriceListWrite();
  const [edits, setEdits] = useState<Record<string, string>>({}); const [removed, setRemoved] = useState<string[]>([]);
  const [modal, setModal] = useState<'edit' | 'add' | 'publish' | 'cancel' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  // تغییر قیمت جمعی (افشین 2026-10-24): انتخاب ردیف‌ها (بین صفحه‌ها می‌ماند) ⇐ «تغییر قیمت جمعی» ⇐ درصد/مبلغ، افزایش/کاهش، گرد کردن ⇐ قیمت جدید ردیف‌ها
  const [sel, setSel] = useState<string[]>([]); const [bulk, setBulk] = useState<BulkRow[] | null>(null); const [busyAll, setBusyAll] = useState<'sel' | 'bulk' | null>(null);
  if (q.isLoading) return <Card><SkeletonRows rows={5} height={60} /></Card>;
  if (q.error || !q.data) return <Card><Empty title="لیست قیمت پیدا نشد" text={q.error ? userMessage(q.error) : undefined} /></Card>;
  const pl = q.data; const draft = pl.status === 'DRAFT'; const editable = draft && can('pricing.price_lists.update');
  const dirty = Object.keys(edits).length + removed.length;
  const saveLines = async () => {
    setErr(null);
    try {
      const all = await allPriceListLines(pl.id);
      const rows = all.filter((l) => !removed.includes(l.item_id)).map((l) => ({ item_id: l.item_id, new_price: edits[l.item_id] ? digits(edits[l.item_id]!) : String(Number(l.new_price)) }));
      if (rows.some((r) => !Number(r.new_price))) { setErr('قیمت جدید همه‌ی ردیف‌ها باید بیشتر از صفر باشد.'); return; }
      await w.update.mutateAsync({ id: pl.id, body: { lines: rows } });
      setEdits({}); setRemoved([]); toast(`ردیف‌های لیست ذخیره شد (${faNum(rows.length)} ردیف).`);
    } catch (e) { setErr(userMessage(e)); }
  };
  // افزودن کالا (افشین 2026-10-24): مستقیم در لیست ثبت می‌شود (بی‌نیاز به «ذخیره ردیف‌ها»)؛ قیمت جدید = قیمت فعلی کالا، سپس درجا یا با «تغییر قیمت جمعی» عوض می‌شود.
  // ردیف‌های ذخیره‌شده با قیمت ذخیره‌شده‌ی خود فرستاده می‌شوند ⇐ تغییرات ذخیره‌نشده‌ی کاربر (edits/removed) در صفحه می‌مانند.
  const addDirect = async (rows: { item_id: string; new_price: string }[]) => {
    const all = await allPriceListLines(pl.id);
    const body = all.map((l) => ({ item_id: l.item_id, new_price: String(Number(l.new_price)) }));
    rows.forEach((r) => { if (!body.some((b) => b.item_id === r.item_id)) body.push(r); });
    await w.update.mutateAsync({ id: pl.id, body: { lines: body } });
    setModal(null); toast(`${faNum(rows.length)} کالا به لیست اضافه شد (قیمت جدید = قیمت فعلی؛ قابل ویرایش).`);
  };
  const onImport = async (f?: File) => { if (!f) return; setErr(null); try { const r = await w.import.mutateAsync({ id: pl.id, file: f }); toast(`فایل وارد شد؛ لیست اکنون ${faNum(r.line_count)} ردیف دارد.`); } catch (e) { setErr(userMessage(e)); } };
  // «امروز» به وقت تهران (همان مبنای بک‌اند)؛ مقایسه‌ی رشته‌ی تاریخ ⇐ بی‌اثر از منطقه‌ی زمانی مرورگر و پارس UTC تاریخ (باگ: لیستِ امروز «آینده» دیده می‌شد)
  const future = pl.effective_from.slice(0, 10) > new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
  const bulkOk = editable && pl.source !== 'CONTRACT';
  const pageRows = (lines.data?.results ?? []).filter((l) => !removed.includes(l.item_id));
  const allOn = pageRows.length > 0 && pageRows.every((l) => sel.includes(l.item_id));
  const selectAllLines = async () => { setBusyAll('sel'); try { const all = await allPriceListLines(pl.id); setSel(all.filter((l) => !removed.includes(l.item_id)).map((l) => l.item_id)); } catch (e) { setErr(userMessage(e)); } finally { setBusyAll(null); } };
  const openBulk = async () => {
    setBusyAll('bulk');
    try {
      const all = await allPriceListLines(pl.id);
      setBulk(all.filter((l) => (!sel.length || sel.includes(l.item_id)) && !removed.includes(l.item_id)).map((l) => ({ item_id: l.item_id, code: l.code, name: l.display_name, current: l.current_price ? Number(l.current_price) : null, listNew: Number(edits[l.item_id] ?? l.new_price) })));
    } catch (e) { setErr(userMessage(e)); } finally { setBusyAll(null); }
  };
  const cols: Column<PriceListLine>[] = [
    ...(bulkOk ? [selectColumn<PriceListLine>({ isOn: (l) => sel.includes(l.item_id), toggle: (l) => setSel((x) => (x.includes(l.item_id) ? x.filter((i) => i !== l.item_id) : [...x, l.item_id])), label: (l) => `انتخاب ${l.code}`, disabled: (l) => removed.includes(l.item_id), allOn,
      toggleAll: () => setSel((x) => (allOn ? x.filter((i) => !pageRows.some((l) => l.item_id === i)) : Array.from(new Set([...x, ...pageRows.map((l) => l.item_id)])))) })] : []),
    { key: 'code', header: 'کد کالا', code: true, render: (l) => <span className="ltr" data-latin>{l.code}</span> },
    { key: 'name', header: 'نام کالا', render: (l) => <span className={`${s.strong} ${s.famName}`} style={{ maxWidth: 300, textDecoration: removed.includes(l.item_id) ? 'line-through' : undefined }} data-tip={l.display_name}>{l.display_name}</span> },
    { key: 'cur', header: <UnitHead>قیمت فعلی</UnitHead>, render: (l) => (l.current_price ? <span className="tnum">{faNum(Number(l.current_price))}</span> : <span className={s.priceMuted}>—</span>) },
    { key: 'new', header: <UnitHead>قیمت جدید</UnitHead>, render: (l) => (editable ? <input className={s.priceIn} aria-label={`قیمت جدید ${l.code}`} inputMode="numeric" value={groupMoney(edits[l.item_id] ?? String(Number(l.new_price)))} data-edited={edits[l.item_id] != null && Number(edits[l.item_id]) !== Number(l.new_price) ? '' : undefined} onChange={(e) => setEdits((x) => ({ ...x, [l.item_id]: digits(e.target.value) }))} /> : <b className="tnum">{faNum(Number(l.new_price))}</b>) },
    { key: 'diff', header: <UnitHead>تفاوت</UnitHead>, render: (l) => { const nv = Number(edits[l.item_id] ?? l.new_price); const d = l.current_price ? nv - Number(l.current_price) : null; return d == null ? <span className={s.priceMuted}>—</span> : <span className="tnum" style={{ color: d < 0 ? 'var(--danger)' : d > 0 ? 'var(--success)' : undefined }}>{d > 0 ? '+' : ''}{faNum(d)}</span>; } },
    ...(editable ? [{ key: 'rm', header: '', render: (l: PriceListLine) => (removed.includes(l.item_id) ? <IconButton label={`بازگرداندن ${l.code}`} onClick={() => setRemoved(removed.filter((x) => x !== l.item_id))}><IconX size={15} /></IconButton> : <IconButton label={`حذف ردیف ${l.code}`} danger onClick={() => setRemoved([...removed, l.item_id])}><IconTrash size={15} /></IconButton>) }] : []),
  ];
  return (
    <>
      <PageHead back={back}
        title={<span className={s.detailTitle}><span className={s.crumb}>لیست‌های قیمت /</span>{pl.name}<Badge tone={PL_STATUS[pl.status]?.tone ?? 'neutral'}>{PL_STATUS[pl.status]?.label ?? pl.status}</Badge></span>}
        sub={<><span data-latin>{pl.code}</span> · {PL_SOURCE[pl.source]}{pl.contract ? <> · قرارداد <span data-latin>{pl.contract.code}</span> ({faNum(Number(pl.contract.adjustment_pct))}٪)</> : null} · تاریخ اثر {faDate(pl.effective_from)}{pl.published_at ? ` · منتشرشده ${faDate(pl.published_at)}` : ''}</>}
        actions={<>
          {editable ? <Button variant="secondary" icon={<IconPencil size={17} />} onClick={() => setModal('edit')}>ویرایش مشخصات</Button> : null}
          {editable ? <Button variant="secondary" icon={<IconFileUpload size={17} />} onClick={() => file.current?.click()} loading={w.import.isPending}>ورود از اکسل</Button> : null}
          {(pl.status === 'DRAFT' || pl.status === 'SCHEDULED') && can('pricing.price_lists.update') ? <Button variant="secondary" icon={<IconBan size={17} />} onClick={() => setModal('cancel')}>لغو لیست</Button> : null}
          {draft && can('pricing.price_lists.approve') ? <Button icon={<IconSend size={17} />} onClick={() => setModal('publish')} disabled={!!dirty || !pl.line_count} data-tip={dirty ? 'ابتدا تغییرات ردیف‌ها را ذخیره کنید' : ''}>{future ? 'زمان‌بندی انتشار' : 'انتشار لیست'}</Button> : null}
        </>} />
      <input ref={file} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="فایل اکسل لیست قیمت" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} />
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={s.statRow} style={{ marginBottom: 14 }}>
        <div className={s.stat}><b className="tnum">{faNum(pl.line_count)}</b><span>ردیف (کالا)</span></div>
        <div className={s.stat}><b>{PL_SOURCE[pl.source]}</b><span>منبع</span></div>
        <div className={s.stat}><b>{faDate(pl.effective_from)}</b><span>تاریخ اثر</span></div>
        <div className={s.stat}><b>{PL_STATUS[pl.status]?.label}</b><span>{pl.status === 'SCHEDULED' ? 'در تاریخ اثر خودکار منتشر می‌شود' : 'وضعیت'}</span></div>
      </div>
      <Card>
        <SectionTitle extra={editable ? <span className={s.rowActions}>{bulkOk ? <Button size="sm" variant="secondary" icon={<IconAdjustmentsDollar size={15} />} onClick={openBulk} disabled={!pl.line_count} loading={busyAll === 'bulk'} data-bulk-open data-tip={!pl.line_count ? 'لیست هنوز ردیفی ندارد' : sel.length ? '' : 'بدون انتخاب ⇐ همه‌ی ردیف‌های لیست'}>{sel.length ? `تغییر قیمت جمعی (${faNum(sel.length)} ردیف)` : 'تغییر قیمت جمعی (همه‌ی ردیف‌ها)'}</Button> : null}<Button size="sm" variant="secondary" icon={<IconPlus size={15} />} onClick={() => setModal('add')}>افزودن کالا</Button></span> : null}>ردیف‌های لیست</SectionTitle>
        {editable ? <p className={s.intro}>قیمت جدید را درجا ویرایش کنید؛ ورود از اکسل: ستون A کد یا بارکد کالا، ستون B قیمت جدید (ریال)، سطر اول عنوان — ردیف‌های فایل با ردیف‌های فعلی ادغام می‌شوند. <button type="button" className={s.linkBtn} onClick={() => downloadXlsx('/pricing/price-lists/import-template', {}, 'price-list-template.xlsx').catch((e) => setErr(userMessage(e)))}>دانلود فایل نمونه</button></p> : null}
        <label className={s.famSearch} style={{ height: 42, marginBottom: 10, maxWidth: 360 }}><IconSearch size={16} className={s.muted} /><input value={qs} onChange={(e) => setQs(e.target.value)} placeholder="کد، نام یا بارکد کالا…" aria-label="جست‌وجوی ردیف‌ها" /></label>
        {bulkOk && sel.length ? (
          <div className={s.selBar} data-sel-bar>
            <span><b className="tnum">{faNum(sel.length)}</b> ردیف انتخاب شده</span>
            {lines.data && sel.length < lines.data.total ? <button type="button" className={s.linkBtn} onClick={selectAllLines} disabled={busyAll === 'sel'}>انتخاب همه‌ی {faNum(lines.data.total)} ردیف{dq ? ' (بدون جست‌وجو)' : ''}</button> : null}
            <button type="button" className={s.linkBtn} onClick={() => setSel([])}>لغو انتخاب</button>
            <span style={{ marginInlineStart: 'auto' }}><Button size="sm" icon={<IconAdjustmentsDollar size={15} />} onClick={openBulk} loading={busyAll === 'bulk'}>تغییر قیمت جمعی</Button></span>
          </div>
        ) : null}
        <div className={s.compact}><DataTable columns={cols} rows={lines.data?.results} rowKey={(l) => l.id} loading={lines.isLoading} error={lines.error} onRetry={() => lines.refetch()} empty={<Empty title={dq ? 'ردیفی پیدا نشد' : 'این لیست هنوز ردیفی ندارد'} text={editable && !dq ? 'با «افزودن کالا» یا «ورود از اکسل» ردیف اضافه کنید.' : undefined} />} /></div>
        {lines.data && lines.data.total > 0 ? <Pagination page={page} pageSize={ps} total={lines.data.total} onPage={setPage} onPageSize={setPs} sizes={[25, 50, 100]} /> : null}
        {dirty ? (
          <div className={s.editBar} data-edit-bar>
            <span><b className="tnum">{faNum(dirty)}</b> تغییر ذخیره‌نشده</span>
            <span className={s.rowActions}><Button variant="ghost" icon={<IconX size={16} />} onClick={() => { setEdits({}); setRemoved([]); }}>لغو تغییرات</Button><Button icon={<IconCheck size={16} />} onClick={saveLines} loading={w.update.isPending}>ذخیره ردیف‌ها</Button></span>
          </div>
        ) : null}
      </Card>
      {bulk ? <BulkPriceModal rows={bulk} onClose={() => setBulk(null)} onApply={(prices) => { setEdits((x) => ({ ...x, ...prices })); setBulk(null); toast(`قیمت جدید ${faNum(Object.keys(prices).length)} ردیف تغییر کرد؛ برای ثبت «ذخیره ردیف‌ها» را بزنید.`); }} /> : null}
      {modal === 'edit' ? <EditListModal pl={pl} onClose={() => setModal(null)} /> : null}
      {modal === 'add' ? <AddItemsModal listId={pl.id} onClose={() => setModal(null)} onAdd={addDirect} /> : null}
      {modal === 'publish' ? <ConfirmModal title={future ? 'زمان‌بندی انتشار لیست' : 'انتشار لیست قیمت'} confirmLabel={future ? 'زمان‌بندی کن' : 'منتشر کن'} onClose={() => setModal(null)}
        text={future ? <>لیست <b>{pl.name}</b> در تاریخ {faDate(pl.effective_from)} خودکار منتشر و قیمت {faNum(pl.line_count)} کالا به‌روز می‌شود.</> : <>با انتشار لیست <b>{pl.name}</b>، قیمت فروش {faNum(pl.line_count)} کالا همین حالا به قیمت جدید تغییر می‌کند. این کار برگشت‌پذیر نیست (برای برگشت، لیست تازه بسازید).</>}
        onConfirm={async () => { const r = await w.publish.mutateAsync(pl.id); toast(r.status === 'SCHEDULED' ? 'انتشار لیست زمان‌بندی شد.' : 'لیست منتشر شد و قیمت‌ها به‌روز شد.'); }} /> : null}
      {modal === 'cancel' ? <ConfirmModal title="لغو لیست قیمت" confirmLabel="لغو کن" danger onClose={() => setModal(null)} text={<>لیست <b>{pl.name}</b> لغو می‌شود و دیگر قابل انتشار نیست.</>}
        onConfirm={async () => { await w.cancel.mutateAsync(pl.id); toast('لیست لغو شد.'); }} /> : null}
    </>
  );
}

function EditListModal({ pl, onClose }: { pl: { id: string; name: string; effective_from: string }; onClose: () => void }) {
  const w = usePriceListWrite(); const toast = useToast();
  const [name, setName] = useState(pl.name); const [date, setDate] = useState(gregorianToJalaliText(pl.effective_from)); const [err, setErr] = useState<string | null>(null);
  const submit = async () => { setErr(null); const eff = jalaliTextToGregorian(date); if (!name.trim() || !eff) { setErr(!name.trim() ? 'نام لیست را وارد کنید.' : 'تاریخ اثر معتبر نیست.'); return; } try { await w.update.mutateAsync({ id: pl.id, body: { name: name.trim(), effective_from: eff } }); toast('مشخصات لیست ذخیره شد.'); onClose(); } catch (e) { setErr(userMessage(e)); } };
  return (
    <Modal open onClose={onClose} title="ویرایش مشخصات لیست" width={520} footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={w.update.isPending}>ذخیره</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}><Input label="نام لیست" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /><JalaliDateInput label="تاریخ اثر" required value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" maxYear={1500} /></FormGrid>
    </Modal>
  );
}

/**
 * افزودن کالای تکی به لیست (افشین 2026-10-24): جست‌وجو + دسته اصلی/میانی/فرعی + برند، جدول با مشخصات کامل کالا (کد، نام، برند، طرح، جنس، سایز، رنگ، قیمت فعلی)
 * و مربع انتخاب؛ ردیف انتخاب‌شده «قیمت جدید» می‌گیرد (پیش‌فرض = قیمت فعلی، قابل ویرایش). انتخاب‌ها بین صفحه‌ها می‌ماند؛ کالاهای موجود در لیست خاموش‌اند.
 */
type Pick = { code: string; v: string };
function AddItemsModal({ listId, onClose, onAdd }: { listId: string; onClose: () => void; onAdd: (rows: { item_id: string; new_price: string }[]) => Promise<void> }) {
  const can = usePerm();
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [page, setPage] = useState(1);
  const [main, setMain] = useState(''); const [mid, setMid] = useState(''); const [sub, setSub] = useState(''); const [brand, setBrand] = useState('');
  const [picked, setPicked] = useState<Record<string, Pick>>({}); const [err, setErr] = useState<string | null>(null);
  const [inList, setInList] = useState<Set<string>>(new Set());
  useEffect(() => { allPriceListLines(listId).then((ls) => setInList(new Set(ls.map((l) => l.item_id)))).catch(() => undefined); }, [listId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const tree = useCategoryTree(true); const brands = useAllBrands();
  const byId = useMemo(() => { const m = new Map<string, CategoryNode>(); const walk = (ns: CategoryNode[]) => ns.forEach((n) => { m.set(n.id, n); walk(n.children ?? []); }); walk(tree.data ?? []); return m; }, [tree.data]);
  const list = useItems({ kind: 'GOOD', page, page_size: 10, query: dq || undefined, category_id: sub || mid || main || undefined, brand_id: brand || undefined });
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const canPrice = can('pricing.prices.list');
  const pr = usePricesFor(rows.map((r) => r.id), canPrice);
  const curOf = (id: string) => pr.data?.get(id)?.sale_price;
  // بی‌قیمت ⇐ قیمت جدید ندارد (بک‌اند > ۰ می‌خواهد) ⇐ خاموش؛ از «ورود از اکسل» با قیمت اضافه شود
  const blocked = (r: ItemRow) => r.status === 'ARCHIVED' || inList.has(r.id) || (!pr.isLoading && !curOf(r.id));
  const toggle = (r: ItemRow) => { if (blocked(r)) return; setPicked((x) => { const n = { ...x }; if (n[r.id]) delete n[r.id]; else n[r.id] = { code: r.code, v: String(Number(curOf(r.id))) }; return n; }); };
  const pickable = rows.filter((r) => !blocked(r));
  const allOn = pickable.length > 0 && pickable.every((r) => !!picked[r.id]);
  const keep = new Set(['code', 'name', 'brand', 'model', 'material', 'size', 'color', 'sale']);
  const cols: Column<ItemRow>[] = [
    selectColumn<ItemRow>({ isOn: (r) => !!picked[r.id] || inList.has(r.id), toggle, label: (r) => `انتخاب ${r.code}`, disabled: blocked, allOn,
      toggleAll: () => (allOn ? setPicked((x) => { const n = { ...x }; pickable.forEach((r) => delete n[r.id]); return n; }) : pickable.forEach((r) => { if (!picked[r.id]) toggle(r); })) }),
    ...goodsDataColumns(pr, canPrice).filter((c) => keep.has(c.key)).map((c) => (c.key === 'sale' ? { ...c, header: <UnitHead>قیمت فعلی</UnitHead> } : c)),
    { key: 'st', header: 'وضعیت در لیست', render: (r) => (inList.has(r.id) ? <span className={s.muted}>در لیست</span> : !pr.isLoading && !curOf(r.id) ? <span className={s.priceMuted} data-tip="قیمت فعلی ندارد؛ با «ورود از اکسل» و قیمت اضافه کنید">بی‌قیمت</span> : picked[r.id] ? <span className={s.price}>انتخاب شد</span> : <span className={s.muted}>—</span>) },
  ];
  const sel = Object.entries(picked);
  const [busy, setBusy] = useState(false);
  const submit = async () => { setErr(null); setBusy(true); try { await onAdd(sel.map(([item_id, v]) => ({ item_id, new_price: v.v }))); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); } };
  const active = !!(q || main || brand);
  return (
    <Modal open onClose={onClose} title="افزودن کالا به لیست" width={1080}
      footer={<><span className={s.sub} style={{ marginInlineEnd: 'auto' }} data-add-count>{faNum(sel.length)} کالا انتخاب شده</span><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} disabled={!sel.length} loading={busy} data-add-submit>افزودن {faNum(sel.length)} کالا</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={s.filterRow} style={{ gridTemplateColumns: 'minmax(0, 2fr) repeat(4, minmax(0, 1fr)) auto', margin: '0 0 10px' }}>
        <Field label="جست‌وجو"><label className={s.famSearch} style={{ height: 42 }}><IconSearch size={16} className={s.muted} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="کد، نام یا بارکد کالا…" aria-label="جست‌وجوی کالا برای لیست" /></label></Field>
        <Select label="دسته اصلی" value={main} onChange={(e) => { setMain(e.target.value); setMid(''); setSub(''); setPage(1); }} placeholder="همه" options={(tree.data ?? []).map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="دسته میانی" value={mid} disabled={!main} onChange={(e) => { setMid(e.target.value); setSub(''); setPage(1); }} placeholder="همه" options={(byId.get(main)?.children ?? []).map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="دسته فرعی" value={sub} disabled={!mid} onChange={(e) => { setSub(e.target.value); setPage(1); }} placeholder="همه" options={(byId.get(mid)?.children ?? []).map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="برند" value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }} placeholder="همه" options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
        <div style={{ alignSelf: 'end' }}><ClearFilters onClick={() => { setQ(''); setMain(''); setMid(''); setSub(''); setBrand(''); setPage(1); }} disabled={!active} /></div>
      </div>
      <p className={s.sub} style={{ margin: '0 0 8px' }}>مربع کنار هر کالا را بزنید و «افزودن» را بزنید؛ کالاها با قیمت فعلی‌شان مستقیم در لیست ثبت می‌شوند و قیمت جدید را در جدول ردیف‌ها (درجا یا با «تغییر قیمت جمعی») تعیین کنید.</p>
      <div className={s.compact} data-add-goods>
        <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={toggle} isSelected={(r) => !!picked[r.id]} empty={<Empty title="کالایی با این فیلترها پیدا نشد" />} />
      </div>
      {list.data && list.data.total > 10 ? <Pagination page={page} pageSize={10} total={list.data.total} onPage={setPage} onPageSize={() => undefined} sizes={[10]} /> : null}
    </Modal>
  );
}
