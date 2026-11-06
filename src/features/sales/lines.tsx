import { useEffect, useState } from 'react';
import { IconMinus, IconPlus, IconShoppingCart, IconTrash } from '@tabler/icons-react';
import { faNum } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { Dropdown } from '@/shared/ui/Dropdown';
import { money, qty, type ItemStock, type ItemTraits } from './api/common';
import type { Invoice, InvoiceLine } from './api/invoices';
import h from './h.module.css';
import fx from './invoices/form.module.css';

/**
 * ردیف‌های سند فروش با ظاهر html «اقلام فاکتور» (فرم) و «مشخصات کالا» (برگه‌ی فاکتور).
 * همه‌ی مبلغ‌ها از بک‌اند می‌آیند؛ فرانت هیچ مبلغی حساب نمی‌کند (RULES فروش). پیش از ثبت، ستون‌های مبلغ ردیف تازه یا تغییرکرده
 * «پس از ثبت» است (کمبود SL-01). «مجموع اولیه»ی هر ردیف و «تخفیف واحد» قابل ویرایش html را بک‌اند ندارد: مجموع اولیه‌ی ردیف «—»
 * (کمبود SL-03)، تخفیف واحد فقط نمایش (تخفیف را فقط قیمت‌گذاری و کد تخفیف تعیین می‌کند؛ تخفیف دستی ممنوع است).
 */

/** ردیف در حال ویرایش: کالا + تعداد + انبار؛ `saved` = همان ردیف قیمت‌گذاری‌شده‌ی ذخیره‌شده (برای نمایش مبلغ تا وقتی عوض نشده) */
export type EditLine = {
  key: string; item_id: string; code: string; name: string; traits: ItemTraits; unit: string;
  quantity: number; warehouse_id: string; saved?: InvoiceLine;
};
export type WarehouseOption = { value: string; label: string; code: string };

/** پهنای ستون‌های html برگه‌ی فاکتور */
const SHEET_GRID = '44px 84px minmax(190px,1.6fr) 54px 76px 100px 110px 90px 100px 96px 100px 118px 68px 92px';
const SHEET_MIN_WIDTH = 1330;
const HEAD_SPAN = 6;

/** مبلغ ردیف فقط وقتی معتبر است که تعداد و انبار با نسخه‌ی ذخیره‌شده یکی باشد */
export const fresh = (l: EditLine) => !!l.saved && qty(l.saved.quantity) === l.quantity && (l.saved.warehouse?.id ?? '') === l.warehouse_id;
/** موجودی قابل استفاده‌ی کالا در انبار ردیف (اگر ردیف انبار ندارد ⇐ موجودی کل) */
export const lineStock = (l: Pick<EditLine, 'item_id' | 'warehouse_id'>, stock: Map<string, ItemStock | null>) => {
  const s = stock.get(l.item_id);
  if (!s) return null;
  return l.warehouse_id ? s.byWarehouse.get(l.warehouse_id) ?? 0 : s.total;
};

const PENDING_TIP = 'مبلغ را بک‌اند پس از ثبت حساب می‌کند (با قیمت‌گذاری، تخفیف مشتری، کد تخفیف و مالیات)';
const NO_GROSS_TIP = 'بک‌اند «مجموع اولیه»ی هر ردیف را نمی‌دهد (به‌زودی)؛ جمع آن در جمع کل سند هست.';
// Keep Latin digits only: matches "a" and "." in "12a.5" (removed ⇒ "125"); "125" is left as is. https://regex101.com/?regex=%5B%5E0-9%5D&testString=12a.5
const NON_DIGIT = /[^0-9]/g;

/** ستون‌های جدول اقلام فرم (بازطراحی ۱۴ آبان ۱۴۰۵): کالا (چسبان) | کد کالا | تعداد | واحد | فی | مجموع اولیه | تخفیف واحد | تخفیف کل | مالیات واحد | مالیات کل | مبلغ کل | انبار | حذف (چسبان) */
const EDIT_GRID = 'minmax(300px,2.2fr) 104px 124px 68px 108px 92px 92px 100px 132px 132px 124px 172px 56px';

export function EditLinesTable({ rows, warehouses, stock, showStock, onQty, onWarehouse, onRemove, rowErrors, disabled, traits }: {
  traits: Map<string, ItemTraits>;
  rows: EditLine[]; warehouses: WarehouseOption[]; stock: Map<string, ItemStock | null>; showStock: boolean;
  onQty: (key: string, n: number) => void; onWarehouse: (key: string, wid: string) => void; onRemove: (key: string) => void;
  rowErrors: Record<number, string>; disabled?: boolean;
}) {
  const grid = { gridTemplateColumns: EDIT_GRID };
  const pending = <span className={fx.pending} data-tip={PENDING_TIP}>پس از ثبت</span>;
  const amount = (l: EditLine, v: (x: InvoiceLine) => string, cls = fx.money) => (fresh(l) && l.saved ? <span className={`tnum ${cls}`}>{money(v(l.saved))}</span> : pending);
  const whCode = (id: string) => warehouses.find((w) => w.value === id)?.code ?? '';
  if (!rows.length) {
    return (
      <div className={fx.empty}>
        <div className={fx.emptyMark}><IconShoppingCart size={26} stroke={1.6} /></div>
        <div className={fx.emptyT}>هنوز کالایی به فاکتور اضافه نشده است</div>
        <div className={fx.emptyS}>با دکمه‌ی «افزودن کالا» کاتالوگ باز می‌شود؛ می‌توانید چند کالا را با تعدادشان یک‌جا انتخاب کنید.</div>
      </div>
    );
  }
  const head = (t: string, cls = '') => <div className={cls}>{t}</div>;
  return (
    <div className={fx.scroll}>
      <div className={fx.tbl}>
        <div className={fx.th} style={grid}>
          {head('کالا', fx.stick)}{head('کد کالا')}{head('تعداد', fx.tc)}{head('واحد فروش')}{head('فی واحد', fx.te)}{head('مجموع اولیه', fx.te)}{head('تخفیف واحد', fx.te)}
          {head('تخفیف کل', fx.te)}{head('مالیات و عوارض واحد', fx.te)}{head('مالیات و عوارض کل', fx.te)}{head('مبلغ کل', fx.te)}{head('انبار')}<div className={fx.stickEnd} />
        </div>
        {rows.map((l, i) => {
          const st = showStock ? lineStock(l, stock) : null;
          const over = st !== null && l.quantity > st;
          const code = whCode(l.warehouse_id);
          const meta = traitsText(pickTraits(l.traits, traits.get(l.item_id)));
          return (
            <div key={l.key} className={`${fx.tr} ${rowErrors[i] ? fx.trErr : ''}`} style={grid}>
              <div className={`${fx.td} ${fx.stick}`}>
                <div className={fx.prod}>
                  <span className={fx.rowNo}>{faNum(i + 1)}</span>
                  <div className={fx.prodTxt}>
                    <div className={fx.prodName}>{l.name}</div>
                    {meta ? <div className={fx.prodMeta}>{meta}</div> : null}
                    {rowErrors[i] ? <div className={fx.prodErr}>{rowErrors[i]}</div> : null}
                  </div>
                </div>
              </div>
              <div className={fx.td}><span dir="ltr" data-latin className={fx.prodCode}>{l.code}</span></div>
              <div className={fx.td}>
                <div className={fx.qty}>
                  <QtyStepper value={l.quantity} onChange={(n) => onQty(l.key, n)} label={`تعداد ${l.code}`} disabled={disabled} bad={over} />
                  {showStock ? <span className={`${fx.stock} ${over ? fx.stockOver : ''}`}>{st === null ? 'موجودی: …' : `موجودی: ${faNum(st)}`}</span> : null}
                </div>
              </div>
              <div className={`${fx.td} ${fx.unit}`}>{l.unit || l.saved?.item?.unit_name || '—'}</div>
              <div className={`${fx.td} ${fx.te}`}>{amount(l, (x) => x.unit_price)}</div>
              <div className={`${fx.td} ${fx.te}`}><span className={fx.dash} data-tip={NO_GROSS_TIP}>—</span></div>
              <div className={`${fx.td} ${fx.te}`}>{amount(l, (x) => x.unit_discount)}</div>
              <div className={`${fx.td} ${fx.te}`}>{amount(l, (x) => x.line_discount, `${fx.money} ${fx.disc}`)}</div>
              <div className={`${fx.td} ${fx.te}`}>{amount(l, (x) => x.unit_tax_duty)}</div>
              <div className={`${fx.td} ${fx.te}`}>{amount(l, (x) => x.line_tax_duty)}</div>
              <div className={`${fx.td} ${fx.te}`}>{amount(l, (x) => x.line_total, fx.moneyTotal)}</div>
              <div className={fx.td}>
                <div className={fx.whCell}>
                  <Dropdown aria-label={`انبار ${l.code}`} buttonClassName={fx.whDd} value={l.warehouse_id} placeholder="انتخاب انبار" options={warehouses} disabled={disabled || !warehouses.length} onChange={(e) => onWarehouse(l.key, e.target.value)} />
                  <span className={fx.whCode} dir="ltr" data-latin>{code || ' '}</span>
                </div>
              </div>
              <div className={fx.stickEnd}>
                <span data-tip="حذف ردیف"><button type="button" className={fx.rm} aria-label={`حذف ${l.code}`} disabled={disabled} onClick={() => onRemove(l.key)}><IconTrash size={17} stroke={1.8} /></button></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** تعداد ردیف با دکمه‌های کم و زیاد؛ فقط عدد صحیح مثبت؛ تایپ با خروج از کادر یا Enter ثبت می‌شود */
export function QtyStepper({ value, onChange, label, disabled, bad }: { value: number; onChange: (n: number) => void; label: string; disabled?: boolean; bad?: boolean }) {
  const [text, setText] = useState(faNum(value));
  useEffect(() => setText(faNum(value)), [value]);
  const commit = () => {
    const n = Math.trunc(Number(toLatinDigits(text).replace(NON_DIGIT, '')));
    if (n > 0 && n !== value) onChange(n);
    else setText(faNum(value));
  };
  return (
    <div className={`${fx.step} ${bad ? fx.stepBad : ''}`}>
      <button type="button" className={fx.stepBtn} aria-label={`افزایش ${label}`} disabled={disabled} onClick={() => onChange(value + 1)}><IconPlus size={14} stroke={2} /></button>
      <input className={fx.stepIn} inputMode="numeric" value={text} disabled={disabled} aria-label={label} aria-invalid={bad || undefined}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      <button type="button" className={fx.stepBtn} aria-label={`کاهش ${label}`} disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}><IconMinus size={14} stroke={2} /></button>
    </div>
  );
}

/** ویژگی‌های ردیف سند از خود بک‌اند فروش (برای آیتم چندکالایی رنگ و سایز ممکن است خالی باشد) */
export const itemTraits = (item?: { brand_name?: string; size_name?: string; color_name?: string } | null): ItemTraits => ({
  brand: item?.brand_name ?? '', sizes: item?.size_name ? [item.size_name] : [], colors: item?.color_name ? [item.color_name] : [],
});
/** ویژگی کامل‌تر از کاتالوگ، اگر آمده باشد؛ وگرنه همان ویژگی خود ردیف */
export const pickTraits = (own: ItemTraits, full?: ItemTraits): ItemTraits => (full && (full.sizes.length || full.colors.length) ? { ...full, brand: full.brand || own.brand } : own);
/**
 * متن ریز خاکستری زیر نام کالا (افشین، ۱۴ آبان ۱۴۰۵): فقط «رنگ: … · سایز: …» — همه‌ی رنگ‌ها و همه‌ی سایزها با نام؛ ویژگی دیگری (برند، کد، بارکد) نمی‌آید.
 */
export const traitsText = (t: ItemTraits) =>
  [t.colors.length ? `رنگ: ${t.colors.join('، ')}` : '', t.sizes.length ? `سایز: ${t.sizes.join('، ')}` : ''].filter(Boolean).join(' · ');
export const lineMeta = (item?: { brand_name?: string; size_name?: string; color_name?: string } | null, full?: ItemTraits) => traitsText(pickTraits(itemTraits(item), full));

/** ردیف‌های سند ذخیره‌شده در برگه‌ی فاکتور (html «مشخصات کالا») با ردیف «جمع کل» از جمع‌های خود سند */
export function SheetLines({ inv, traits }: { inv: Pick<Invoice, 'lines' | 'subtotal' | 'total_discount' | 'total_tax_duty' | 'total_amount'>; traits: Map<string, ItemTraits> }) {
  const lines = inv.lines ?? [];
  const grid = { gridTemplateColumns: SHEET_GRID, minWidth: SHEET_MIN_WIDTH };
  const head = (t: string, align?: 'c' | 'l') => <div className={`${h.pgh} ${align ? h[align] : ''}`}>{t}</div>;
  const dash = <span className={h.dim}>—</span>;
  return (
    <div className={h.pgridWrap}>
      <div className={h.pgrid} style={grid}>
        {head('ردیف', 'c')}{head('کد محصول')}{head('نام محصول')}{head('تعداد', 'c')}{head('واحد فروش')}{head('فی واحد', 'l')}{head('مجموع اولیه', 'l')}
        {head('تخفیف واحد', 'l')}{head('تخفیف کل', 'l')}{head('مالیات و عوارض واحد', 'l')}{head('مالیات و عوارض کل', 'l')}{head('مبلغ کل', 'l')}{head('کد انبار')}{head('نام انبار')}
        {lines.map((l) => (
          <div key={l.id} style={{ display: 'contents' }}>
            <div className={`${h.pgc} ${h.c} ${h.idx}`}>{faNum(l.row_no)}</div>
            <div className={h.pgc}>{l.item ? <span dir="ltr" data-latin className={h.faint}>{l.item.code}</span> : dash}</div>
            <div className={h.pgc}><div className={h.pgName}>{l.item?.display_name || '—'}</div><div className={h.pgMeta}>{lineMeta(l.item, traits.get(l.item?.id ?? ''))}</div></div>
            <div className={`${h.pgc} ${h.c} ${h.pgName}`}>{faNum(qty(l.quantity))}</div>
            <div className={`${h.pgc} ${h.muted}`}>{l.item?.unit_name || '—'}</div>
            <div className={`${h.pgc} ${h.l} tnum`}>{money(l.unit_price)}</div>
            <div className={`${h.pgc} ${h.l}`}><span className={h.dim} data-tip={NO_GROSS_TIP}>—</span></div>
            <div className={`${h.pgc} ${h.l} tnum`}>{money(l.unit_discount)}</div>
            <div className={`${h.pgc} ${h.l} tnum ${h.disc}`}>{money(l.line_discount)}</div>
            <div className={`${h.pgc} ${h.l} tnum`}>{money(l.unit_tax_duty)}</div>
            <div className={`${h.pgc} ${h.l} tnum`}>{money(l.line_tax_duty)}</div>
            <div className={`${h.pgc} ${h.l} tnum ${h.pgName}`}>{money(l.line_total)}</div>
            <div className={h.pgc}>{l.warehouse?.code ? <span dir="ltr" data-latin className={h.faint}>{l.warehouse.code}</span> : dash}</div>
            <div className={`${h.pgc} ${h.muted}`}>{l.warehouse?.name || '—'}</div>
          </div>
        ))}
        <div className={h.pgt} style={{ gridColumn: `span ${HEAD_SPAN}` }}>جمع کل</div>
        <div className={`${h.pgt} ${h.l} tnum`}>{money(inv.subtotal)}</div>
        <div className={h.pgt} />
        <div className={`${h.pgt} ${h.l} tnum ${h.disc}`}>{money(inv.total_discount)}</div>
        <div className={h.pgt} />
        <div className={`${h.pgt} ${h.l} tnum`}>{money(inv.total_tax_duty)}</div>
        <div className={`${h.pgt} ${h.l} tnum ${h.pgGrand}`}>{money(inv.total_amount)}</div>
        <div className={h.pgt} style={{ gridColumn: 'span 2' }} />
      </div>
    </div>
  );
}

/**
 * جمع‌های فرم: مجموع اولیه، تخفیف کل، مالیات و عوارض کل و «مبلغ کل» برجسته — همه از بک‌اند.
 * پیش از ثبت یا وقتی ردیف‌ها تغییر کرده‌اند «پس از ثبت» نشان داده می‌شود.
 */
export function FormTotals({ inv, stale }: { inv?: Pick<Invoice, 'subtotal' | 'total_discount' | 'total_tax_duty' | 'total_amount'> | null; stale?: boolean }) {
  const show = !!inv && !stale;
  const v = (x: string | undefined, cls = fx.sumV) => (show ? <b className={`tnum ${cls}`}>{money(x)}</b> : <span className={fx.pending}>پس از ثبت</span>);
  return (
    <div className={fx.sum}>
      <div className={fx.sumRows}>
        <div className={fx.sumRow}><span className={fx.sumK}>مجموع اولیه</span>{v(inv?.subtotal)}</div>
        <div className={fx.sumRow}><span className={fx.sumK}>تخفیف کل</span>{v(inv?.total_discount, `${fx.sumV} ${fx.disc}`)}</div>
        <div className={fx.sumRow}><span className={fx.sumK}>مالیات و عوارض کل</span>{v(inv?.total_tax_duty)}</div>
      </div>
      <div className={fx.grand}>
        <span className={fx.grandK}>مبلغ کل<span className={fx.grandU}>ریال</span></span>
        {show ? <span className={`tnum ${fx.grandV}`}>{money(inv?.total_amount)}</span> : <span className={fx.grandPend}>پس از ثبت</span>}
      </div>
      {stale || !inv ? <div className={fx.sumNote}>مبالغ را بک‌اند پس از ثبت با قیمت‌گذاری، تخفیف و مالیات حساب می‌کند.</div> : null}
    </div>
  );
}
