import { useMemo, useState } from 'react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { moneyDigits, groupMoney } from '@/shared/lib/money';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Select } from '@/shared/ui/form';
import { Empty, InfoBanner, Modal, Pagination, Segmented, UnitHead } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useAllBrands, useCategoryTree, useItems, useUnits, type ItemRow } from '@/features/catalog/api';
import { usePurchaseInfo } from './requestsApi';
import s from './supply.module.css';

/**
 * انتخاب‌گر کالا برای اسناد خرید (html: «افزودن آیتم» — «از فهرست محصولات انتخاب کنید؛ اگر محصول تعریف نشده است، آیتم موقت ثبت کنید»).
 * تب «کالاهای فهرست»: کالاهای کاتالوگ (GET /catalog/items) با جست‌وجو و فیلتر دسته‌ی اصلی و برند + فی آخرین خرید، آخرین تأمین‌کننده و
 * موجودی از GET /supply/items/purchase-info (S-07 ✅). چندانتخابی؛ کالای موجود در سند خاموش.
 * تب «کالای موقت» (فقط وقتی allowTemp): نام، دسته (اصلی/میانی/فرعی)، واحد از «تعریف واحد» (افشین 2026-10-31) و فی خرید.
 */
export type PickedItem = { item_id: string; code: string; name: string; unit_name: string; category_path: string; last_price: number | null };
export type TempItem = { temp_name: string; temp_category_id: string | null; temp_unit_id: string | null; unit_name: string; category_path: string; unit_price: string };

const PAGE_SIZE = 8;
const DEBOUNCE_MS = 300;
const WIDTH = 1080;
const TEMP_NAME_MAX = 200;
type Tab = 'catalog' | 'temp';

export function ItemPickerModal({ open, onClose, onPick, onTemp, existing, allowTemp = false, title = 'افزودن کالا' }: {
  open: boolean; onClose: () => void; onPick: (rows: PickedItem[]) => void; onTemp?: (t: TempItem) => void;
  existing: string[]; allowTemp?: boolean; title?: string;
}) {
  const [tab, setTab] = useState<Tab>('catalog');
  return (
    <Modal open={open} onClose={onClose} width={WIDTH} title={title}>
      {allowTemp ? (
        <div className={s.pickTabs}>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'catalog', label: 'کالاهای فهرست' }, { value: 'temp', label: '+ ثبت آیتم موقت' }]} />
        </div>
      ) : null}
      {tab === 'catalog' ? <CatalogTab existing={existing} onPick={onPick} onClose={onClose} /> : <TempTab onAdd={(t) => { onTemp?.(t); onClose(); }} />}
    </Modal>
  );
}

function CatalogTab({ existing, onPick, onClose }: { existing: string[]; onPick: (rows: PickedItem[]) => void; onClose: () => void }) {
  const can = usePerm();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const [main, setMain] = useState('');
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Map<string, ItemRow>>(new Map());
  const tree = useCategoryTree(false);
  const brands = useAllBrands();
  const list = useItems({ page, page_size: PAGE_SIZE, kind: 'GOOD', status: 'ACTIVE', query: dq || undefined, category_id: main || undefined, brand_id: brand || undefined });
  const ids = useMemo(() => (list.data?.results ?? []).map((r) => r.id), [list.data]);
  const info = usePurchaseInfo(ids, can('supply.suppliers.list'));
  const units = useUnits();
  const unitName = (id?: string | null) => (units.data ?? []).find((u) => u.id === id)?.name ?? '';
  const taken = new Set(existing);
  const toggle = (r: ItemRow) => setSel((m) => { const n = new Map(m); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r); return n; });
  const dash = <span className={s.muted}>—</span>;

  const cols: Column<ItemRow>[] = [
    { key: 'pick', header: '', render: (r) => <input type="checkbox" aria-label={`انتخاب ${r.display_name}`} checked={sel.has(r.id) || taken.has(r.id)} disabled={taken.has(r.id)} onChange={() => toggle(r)} onClick={(e) => e.stopPropagation()} /> },
    { key: 'code', header: 'کد کالا', code: true, render: (r) => <span data-latin>{r.code}</span> },
    { key: 'name', header: 'نام کالا', render: (r) => <span className={s.strong}>{r.display_name}</span> },
    { key: 'cat', header: 'دسته', render: (r) => r.category_name || dash },
    { key: 'brand', header: 'برند', render: (r) => r.brand_name || dash },
    { key: 'unit', header: 'واحد', render: (r) => unitName(r.unit_id) || dash },
    { key: 'last', header: <UnitHead>فی آخرین خرید</UnitHead>, render: (r) => { const v = info.data?.get(r.id)?.last_unit_price; return v == null ? dash : <span className="tnum">{faNum(v)}</span>; } },
    { key: 'sup', header: 'آخرین تأمین‌کننده', render: (r) => { const x = info.data?.get(r.id); return x?.last_supplier_name ? <span data-tip={x.last_invoice_date ? `آخرین فاکتور: ${faDate(x.last_invoice_date)}` : ''}>{x.last_supplier_name}</span> : dash; } },
    { key: 'stock', header: 'موجودی', render: (r) => { const x = info.data?.get(r.id); return x ? <span className="tnum">{faNum(x.available_quantity)}</span> : dash; } },
  ];
  const confirm = () => {
    onPick([...sel.values()].map((r) => ({
      item_id: r.id, code: r.code, name: r.display_name, unit_name: unitName(r.unit_id), category_path: r.category_name ?? '',
      last_price: info.data?.get(r.id)?.last_unit_price ?? null,
    })));
    onClose();
  };
  return (
    <>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجوی نام، کد یا بارکد کالا"
        filters={[
          { key: 'main', label: 'دسته اصلی', value: main, onChange: (v) => { setMain(v); setPage(1); }, options: (tree.data ?? []).map((n) => ({ value: n.id, label: n.name })) },
          { key: 'brand', label: 'برند', value: brand, onChange: (v) => { setBrand(v); setPage(1); }, options: (brands.data ?? []).map((b) => ({ value: b.id, label: b.name })) },
        ]}
        onReset={() => { setQ(''); setMain(''); setBrand(''); setPage(1); }}
        count={list.data ? `${faNum(list.data.total)} کالا` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(r) => { if (!taken.has(r.id)) toggle(r); }} isSelected={(r) => sel.has(r.id)}
        empty={<Empty title="کالایی با این فیلتر پیدا نشد" text="اگر کالا هنوز در کاتالوگ تعریف نشده است، آیتم موقت ثبت کنید." />} />
      {list.data && list.data.total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}
      <div className={s.pickFoot}>
        <span className={s.muted}>{faNum(sel.size)} کالا انتخاب شده</span>
        <Button onClick={confirm} disabled={!sel.size}>افزودن {sel.size ? faNum(sel.size) : ''} کالا</Button>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
      </div>
    </>
  );
}

function TempTab({ onAdd }: { onAdd: (t: TempItem) => void }) {
  const tree = useCategoryTree(false);
  const units = useUnits();
  const [name, setName] = useState('');
  const [main, setMain] = useState('');
  const [mid, setMid] = useState('');
  const [sub, setSub] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const mains = tree.data ?? [];
  const mids = mains.find((n) => n.id === main)?.children ?? [];
  const subs = mids.find((n) => n.id === mid)?.children ?? [];
  const path = [mains.find((n) => n.id === main)?.name, mids.find((n) => n.id === mid)?.name, subs.find((n) => n.id === sub)?.name].filter(Boolean).join(' > ');
  const add = () => {
    if (!name.trim()) { setErr('نام کالای موقت را وارد کنید.'); return; }
    if (!price) { setErr('فی واحد خرید را وارد کنید.'); return; }
    onAdd({ temp_name: name.trim(), temp_category_id: sub || mid || main || null, temp_unit_id: unit || null, unit_name: (units.data ?? []).find((u) => u.id === unit)?.name ?? '', category_path: path, unit_price: price });
  };
  return (
    <>
      <InfoBanner>آیتم موقت برای کالایی است که هنوز در کاتالوگ تعریف نشده است. پیش از «تأیید» تأمین، کالا باید در کاتالوگ تعریف و این ردیف به آن وصل شود.</InfoBanner>
      {err ? <div className={s.formErrTop}><Alert>{err}</Alert></div> : null}
      <div className={s.formNote}>
        <FormGrid cols={3}>
          <Input label="نام کالا" required span={3} maxLength={TEMP_NAME_MAX} value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="مثال: تی‌شرت نخی یقه‌گرد مردانه" />
          <Select label="دسته اصلی" value={main} onChange={(e) => { setMain(e.target.value); setMid(''); setSub(''); }} placeholder="انتخاب (اختیاری)" options={mains.map((n) => ({ value: n.id, label: n.name }))} />
          <Select label="دسته میانی" value={mid} disabled={!main} onChange={(e) => { setMid(e.target.value); setSub(''); }} placeholder="انتخاب (اختیاری)" options={mids.map((n) => ({ value: n.id, label: n.name }))} />
          <Select label="دسته فرعی" value={sub} disabled={!mid} onChange={(e) => setSub(e.target.value)} placeholder="انتخاب (اختیاری)" options={subs.map((n) => ({ value: n.id, label: n.name }))} />
          <Select label="واحد اصلی" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="انتخاب (اختیاری)" options={(units.data ?? []).map((u) => ({ value: u.id, label: u.name }))} hint="از «تعریف واحد» تنظیمات" />
          <Input label="فی واحد خرید (ریال)" required inputMode="numeric" value={groupMoney(price)} onChange={(e) => { setPrice(moneyDigits(e.target.value)); setErr(null); }} />
        </FormGrid>
      </div>
      <div className={s.pickFoot}>
        <Button onClick={add}>افزودن به سفارش</Button>
      </div>
    </>
  );
}
