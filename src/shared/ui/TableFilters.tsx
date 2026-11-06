import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconCheck, IconChevronDown, IconFilterOff, IconSearch } from '@tabler/icons-react';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import s from './TableFilters.module.css';

export type FilterDef = { key: string; label: string; value: string; /** soon در هر گزینه ⇐ گزینه‌ی بی‌بک‌اند: خاموش با «به‌زودی» */ options: { value: string; label: string; soon?: boolean }[]; onChange: (v: string) => void;
  /** فیلتر طرح (html) که بک‌اند هنوز ندارد ⇐ غیرفعال با «به‌زودی» */ soon?: boolean;
  /** فیلتر بازه‌ی عددی (مثل بازه قیمت): value = «min-max» (هر طرف می‌تواند خالی باشد)؛ onChange('') ⇐ پاک */ range?: { unit?: string } };

/**
 * نوار جست‌وجو و فیلتر مشترک همه‌ی جدول‌ها (قانون RULES.md ۴-۶): جست‌وجو + فیلترهایی که افشین برای هر جدول تعیین می‌کند.
 * مقدار خالی هر فیلتر = «همه».
 */
export function TableFilters({ search = '', onSearch = () => {}, placeholder = '', filters = [], count, extra, stacked, onReset, extraActive, noSearch }: {
  search?: string; onSearch?: (v: string) => void; placeholder?: string;
  /** بدون جعبه‌ی جست‌وجو (وقتی بک‌اند جست‌وجو ندارد؛ 2026-10-25) */
  noSearch?: boolean; filters?: FilterDef[]; count?: ReactNode; extra?: ReactNode;
  /** فیلترهای داخل extra (مثل بازه‌ی تاریخ): «حذف فیلترها» این را هم صدا می‌زند؛ extraActive = آیا فعال‌اند (2026-10-24) */
  onReset?: () => void; extraActive?: boolean;
  /** جست‌وجو یک ردیف تمام‌عرض بالا و فیلترها در ردیف زیر آن (جدول‌های پرفیلتر، مثل پرونده‌ی مشتریان)؛ extra (مثل انتخاب ستون‌ها) کنار جست‌وجو */
  stacked?: boolean;
}) {
  const active = filters.some((f) => f.value) || !!search || !!extraActive;
  const reset = () => { onSearch(''); filters.forEach((f) => { if (!f.soon) f.onChange(''); }); onReset?.(); };
  const searchBox = noSearch ? null : (
    <label className={`${s.search} ${stacked ? s.searchWide : ''}`}>
      <IconSearch size={17} />
      <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label="جست‌وجو" />
    </label>
  );
  if (stacked) {
    return (
      <div className={s.stack}>
        <div className={s.searchRow}>
          {searchBox}
          {extra}
          <button type="button" className={s.reset} onClick={reset} aria-label="حذف فیلترها" data-tip="حذف فیلترها" disabled={!active}>
            <IconFilterOff size={16} />
          </button>
          {count !== undefined ? <span className={s.countInline}>{count}</span> : null}
        </div>
        <div className={s.filterGrid}>
          {filters.map((f) => (f.range ? <RangeFilter key={f.key} f={f} /> : <FilterSelect key={f.key} f={f} />))}
        </div>
      </div>
    );
  }
  return (
    <div className={s.bar}>
      {searchBox}
      {filters.map((f) => (f.range ? <RangeFilter key={f.key} f={f} /> : <FilterSelect key={f.key} f={f} />))}
      {extra}
      <button type="button" className={s.reset} onClick={reset} aria-label="حذف فیلترها" data-tip="حذف فیلترها" disabled={!active}>
        <IconFilterOff size={16} />
      </button>
      {count !== undefined ? <span className={s.count}>{count}</span> : null}
    </div>
  );
}

/** متن قابل مقایسه برای جست‌وجوی سمت فرانت: ارقام لاتین، ی/ک عربی ⇐ فارسی، حروف کوچک، بدون نیم‌فاصله. */
export const searchKey = (...parts: (string | null | undefined)[]) =>
  toLatinDigits(parts.filter(Boolean).join(' ')).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').toLowerCase();

/** فیلتر کشویی: کل کادر کلیک‌پذیر، فهرست هم‌عرض کادر، فقط گزینه‌ی انتخاب‌شده رنگی. */
function FilterSelect({ f }: { f: FilterDef }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const opts: { value: string; label: string; soon?: boolean }[] = [{ value: '', label: 'همه' }, ...f.options];
  const current = opts.find((o) => o.value === f.value) ?? opts[0]!;
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className={s.dd} ref={wrap}>
      <button type="button" className={`${s.filter} ${f.value ? s.on : ''} ${open ? s.open : ''}`} onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox" aria-expanded={open} aria-label={f.label} disabled={f.soon} data-tip={f.soon ? 'این فیلتر هنوز در سامانه نیست (به‌زودی)' : ''}>
        <span className={s.label}>{f.label}</span>
        <span className={s.value}>{f.soon ? 'به‌زودی' : current.label}</span>
        <IconChevronDown size={15} className={s.chev} />
      </button>
      {open ? (
        <ul className={s.menu} role="listbox" aria-label={f.label}>
          {opts.map((o) => {
            const sel = o.value === f.value;
            return (
              <li key={o.value || '__all'}>
                <button type="button" role="option" aria-selected={sel} aria-disabled={o.soon || undefined} disabled={o.soon} data-tip={o.soon ? 'این وضعیت هنوز در سامانه فیلتر نمی‌شود (به‌زودی)' : ''} className={`${s.item} ${sel ? s.itemOn : ''} ${o.soon ? s.itemSoon : ''}`}
                  onClick={() => { if (o.soon) return; f.onChange(o.value); setOpen(false); }}>
                  <span>{o.label}{o.soon ? <small className={s.soonTag}> به‌زودی</small> : null}</span>
                  {sel ? <IconCheck size={15} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

const groupFa = (v: string) => (v ? toFaDigits(Number(v).toLocaleString('en')).replace(/,/g, '٬') : '');
/** فیلتر بازه (افشین 2026-10-23: «بازه قیمت فروش»): دکمه‌ی هم‌شکل فیلترها + کادر «از / تا» با «اعمال» و «پاک کردن» */
function RangeFilter({ f }: { f: FilterDef }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [lo0, hi0] = (f.value || '-').split('-');
  const [lo, setLo] = useState(lo0 ?? ''); const [hi, setHi] = useState(hi0 ?? '');
  useEffect(() => { const [a, b] = (f.value || '-').split('-'); setLo(a ?? ''); setHi(b ?? ''); }, [f.value]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const num = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');
  const apply = () => { const a = num(lo), b = num(hi); const [x, y] = a && b && Number(a) > Number(b) ? [b, a] : [a, b]; f.onChange(x || y ? `${x}-${y}` : ''); setOpen(false); };
  const unit = f.range?.unit ?? '';
  const label = !f.value ? 'همه' : lo0 && hi0 ? `${groupFa(lo0)} تا ${groupFa(hi0)}` : lo0 ? `از ${groupFa(lo0)}` : `تا ${groupFa(hi0 ?? '')}`;
  return (
    <div className={s.dd} ref={wrap}>
      <button type="button" className={`${s.filter} ${f.value ? s.on : ''} ${open ? s.open : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} aria-label={f.label} data-tip="">
        <span className={s.label}>{f.label}</span><span className={s.value}>{label}</span><IconChevronDown size={15} className={s.chev} />
      </button>
      {open ? (
        <div className={`${s.menu} ${s.rangePop}`} role="dialog" aria-label={f.label}>
          <div className={s.rangeRow}>
            <label><span>از{unit ? ` (${unit})` : ''}</span><input autoFocus inputMode="numeric" dir="ltr" value={groupFa(num(lo))} onChange={(e) => setLo(num(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} placeholder="۰" aria-label={`حداقل ${f.label}`} /></label>
            <label><span>تا{unit ? ` (${unit})` : ''}</span><input inputMode="numeric" dir="ltr" value={groupFa(num(hi))} onChange={(e) => setHi(num(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} placeholder="بدون سقف" aria-label={`حداکثر ${f.label}`} /></label>
          </div>
          <div className={s.rangeActs}>
            <button type="button" className={s.rangeClear} onClick={() => { setLo(''); setHi(''); f.onChange(''); setOpen(false); }}>پاک کردن</button>
            <button type="button" className={s.rangeApply} onClick={apply}>اعمال</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
