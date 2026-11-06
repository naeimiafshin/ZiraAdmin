import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import type { Paginated } from '@/shared/api/types';
import { avatarColor, faNum, initialOf } from '@/shared/lib/format';
import { ErrorBox, SkeletonRows } from '@/shared/ui/kit';
import type { CustomerRow } from '@/features/customers/api';
import { customerBlock } from './components';
import h from './h.module.css';

/**
 * قطعه‌های مشترک ظاهر html «Sales Management» برای همه‌ی صفحه‌های فروش (افشین، ۱۴ آبان ۱۴۰۵: «دقیقاً مطابق html»).
 * جدول‌ها کارت سفید با ردیف‌های grid هستند (نه DataTable پنل)، تب‌ها دکمه‌های قرصی، و کنترل‌های فرم ارتفاع ۴۰ با زمینه‌ی خاکستری.
 */
export type PillTone = 'warn' | 'ok' | 'info' | 'danger' | 'neutral';
export const Pill = ({ tone, children }: { tone: PillTone; children: ReactNode }) => <span className={`${h.pill} ${h[`p_${tone}`]}`}>{children}</span>;

/** جست‌وجوی بالای جدول (html: حداکثر ۳۴۰ پیکسل، آیکن ذره‌بین چپ) */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className={h.search}>
      <input className={h.searchInput} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="جست‌وجو" />
      <IconSearch size={16} stroke={1.9} className={h.searchIcon} />
    </div>
  );
}

/** تب‌های قرصی html با شمارنده */
export function SegTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number | null }[] }) {
  return (
    <div className={h.seg} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`${h.segBtn} ${o.value === value ? h.segOn : ''}`} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && o.count !== null ? <span className={h.segCount}>{faNum(o.count)}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** ستون جدول html: پهنای grid، تراز و محتوای هر خانه */
export type HCol<T> = { key: string; header: ReactNode; width: string; align?: 'c' | 'l'; tight?: boolean; render: (row: T, i: number) => ReactNode };

/**
 * جدول کارت سفید html (ردیف‌های grid). حالت‌های بارگذاری، خطا و خالی طراحی شده‌اند؛ `foot` نوار پایین کارت است (شمار و جمع).
 * `minWidth` = جمع پهنای ستون‌ها در html تا جدول در عرض ۱۲۸۰ اسکرول افقی بگیرد، نه این‌که فشرده شود.
 */
export function HTable<T>({ cols, rows, rowKey, loading, error, onRetry, empty, onRowClick, rowClass, foot, minWidth }: {
  cols: HCol<T>[]; rows?: T[]; rowKey: (r: T) => string; loading?: boolean; error?: unknown; onRetry?: () => void; empty: string;
  onRowClick?: (r: T) => void; rowClass?: (r: T) => string | undefined; foot?: ReactNode; minWidth?: number;
}) {
  const grid = { gridTemplateColumns: cols.map((c) => c.width).join(' ') };
  const cell = (c: HCol<T>) => `${c.tight ? h.tdTight : h.td} ${c.align ? h[c.align] : ''}`;
  let body: ReactNode = null;
  if (loading) body = <div className={h.loading}><SkeletonRows rows={5} height={44} /></div>;
  else if (error) body = <div className={h.loading}><ErrorBox error={error} onRetry={onRetry} /></div>;
  else if (!rows?.length) body = <div className={h.empty}>{empty}</div>;
  else body = rows.map((r, i) => (
    <div key={rowKey(r)} className={`${h.tr} ${onRowClick ? h.trClick : ''} ${rowClass?.(r) ?? ''}`} style={grid} onClick={onRowClick ? () => onRowClick(r) : undefined}>
      {cols.map((c) => <div key={c.key} className={cell(c)}>{c.render(r, i)}</div>)}
    </div>
  ));
  return (
    <div className={h.card}>
      <div className={h.scroll}>
        <div style={minWidth ? { minWidth } : undefined}>
          <div className={h.thead} style={grid} role="row">
            {cols.map((c) => <div key={c.key} role="columnheader" className={`${h.th} ${c.align ? h[c.align] : ''}`}>{c.header}</div>)}
          </div>
          {body}
        </div>
      </div>
      {foot ? <div className={h.foot}>{foot}</div> : null}
    </div>
  );
}

/** صفحه‌بندی ساده‌ی زیر جدول (قبلی/بعدی) — بک‌اند همه‌ی فهرست‌ها را صفحه‌بندی می‌کند؛ html صفحه‌بندی ندارد */
export function MiniPager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className={h.pkPager}>
      <button type="button" className={h.pgBtn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="صفحه‌ی قبل">‹</button>
      <span className={h.faint}>صفحه‌ی {faNum(page)} از {faNum(pages)}</span>
      <button type="button" className={h.pgBtn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="صفحه‌ی بعد">›</button>
    </div>
  );
}

/** برچسب و پیام فیلد فرم html (۱۲ پیکسل، خاکستری، نیم‌پررنگ) */
export function HField({ label, required, error, hint, children, span }: { label: string; required?: boolean; error?: string; hint?: ReactNode; children: ReactNode; span?: boolean }) {
  return (
    <div className={span ? h.span2 : undefined}>
      <span className={h.lbl}>{label}{required ? <span className={h.req}> *</span> : null}</span>
      {children}
      {error ? <div className={h.err}>{error}</div> : null}
      {!error && hint ? <div className={h.hint}>{hint}</div> : null}
    </div>
  );
}

/** آواتار حرف اول مشتری (html: ۳۰ پیکسل، گوشه‌ی ۹، رنگ از کد مشتری) */
export const CustAvatar = ({ seed, name }: { seed: string; name: string }) => (
  <span className={h.ava} style={{ background: avatarColor(seed || name) }} aria-hidden>{initialOf(name)}</span>
);

const CUST_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const POP_GAP = 6;
const POP_MIN_WIDTH = 340;
const POP_HEIGHT = 360;
const EDGE_GAP = 8;

/**
 * انتخاب مشتری به شکل کشویی html («کد مشتری» و «نام مشتری» دو کشوی هم‌بسته‌اند): با کلیک فهرست جست‌وجودار باز می‌شود
 * (GET /customers/profiles، جست‌وجوی سرور). مشتری غیرفعال یا در لیست سیاه برای سند قابل انتخاب نیست و دلیلش کنار نامش می‌آید؛
 * در فیلتر فهرست (`forFilter`) همه انتخاب‌پذیرند.
 */
export function CustomerSelect({ value, onPick, show, placeholder, label, invalid, disabled, forFilter, allowed, buttonClassName, invalidClassName }: {
  value: { id: string; code: string; name: string } | null; onPick: (c: CustomerRow) => void; show: 'code' | 'name'; placeholder: string; label: string;
  invalid?: boolean; disabled?: boolean; forFilter?: boolean; allowed: boolean;
  /** جایگزین کلاس دکمه (مثل Dropdown)؛ `invalidClassName` حالت نامعتبر همان ظاهر */
  buttonClassName?: string; invalidClassName?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), SEARCH_DEBOUNCE_MS); return () => clearTimeout(t); }, [q]);
  const list = useQuery({
    queryKey: ['customers', 'profiles', 'sales-select', dq, !!forFilter], enabled: open && allowed, placeholderData: keepPreviousData,
    queryFn: ({ signal }) => adminApi<Paginated<CustomerRow>>('/customers/profiles', { query: { page_size: CUST_PAGE, query: dq || undefined }, signal }),
  });
  useLayoutEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const width = Math.max(r.width, POP_MIN_WIDTH);
    const up = window.innerHeight - r.bottom < POP_HEIGHT && r.top > POP_HEIGHT;
    setPos({ top: up ? r.top - POP_HEIGHT - POP_GAP : r.bottom + POP_GAP, left: Math.max(EDGE_GAP, r.right - width), width });
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const blocked = (c: CustomerRow) => (forFilter ? null : customerBlock(c));
  const shownBy = { code: value?.code ?? '', name: value?.name ?? '' };
  const shown = shownBy[show];
  const badClass = invalid ? invalidClassName ?? h.csBad : '';
  const btnClass = buttonClassName ? `${buttonClassName} ${badClass}` : `${h.csBtn} ${open ? h.csOpen : ''} ${badClass}`;
  let content: ReactNode;
  if (!allowed) content = <div className={h.csMsg}>به فهرست مشتریان دسترسی ندارید (مجوز «فهرست مشتریان»).</div>;
  else if (list.isLoading) content = <div className={h.csMsg}>در حال جست‌وجو…</div>;
  else if (list.error) content = <div className={h.csMsg}>فهرست مشتریان در دسترس نیست.</div>;
  else if (!list.data?.results.length) content = <div className={h.csMsg}>مشتری‌ای پیدا نشد.</div>;
  else content = list.data.results.map((c) => {
    const why = blocked(c);
    return (
      <button key={c.id} type="button" role="option" aria-selected={value?.id === c.id} className={`${h.csOpt} ${value?.id === c.id ? h.csOptActive : ''}`} disabled={!!why}
        onClick={() => { onPick(c); setOpen(false); setQ(''); }}>
        <span className={h.csOptCode} data-latin>{c.code}</span>
        <span className={h.csOptName}>{c.store_name || c.full_name}{c.store_name && c.full_name ? <span className={h.faint}> · {c.full_name}</span> : null}</span>
        {why ? <Pill tone="danger">{why}</Pill> : null}
      </button>
    );
  });
  return (
    <div className={h.cs}>
      <button ref={btn} type="button" className={btnClass} disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)} dir={show === 'code' && shown ? 'ltr' : undefined}>
        {shown ? <span data-latin={show === 'code' ? true : undefined}>{shown}</span> : <span className={h.csPh}>{placeholder}</span>}
        <IconChevronDown size={16} className={h.csChev} />
      </button>
      {open && pos ? createPortal(
        <div ref={pop} className={h.csPop} style={{ top: pos.top, left: pos.left, width: pos.width }} data-dropdown-menu>
          {allowed ? <input autoFocus className={h.csSearch} value={q} onChange={(e) => setQ(e.target.value)} placeholder="کد، نام فروشگاه، نام مدیر یا موبایل…" aria-label={`جست‌وجوی ${label}`} /> : null}
          <div className={h.csList} role="listbox" aria-label={label}>{content}</div>
          {list.data && list.data.total > CUST_PAGE ? <div className={h.csMsg}>{faNum(list.data.total)} مشتری؛ برای محدود کردن جست‌وجو کنید.</div> : null}
        </div>, document.body) : null}
    </div>
  );
}
