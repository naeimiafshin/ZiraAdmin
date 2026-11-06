import { Fragment, type ReactNode } from 'react';
import { Empty, ErrorBox, SkeletonRows } from './kit';
import s from './DataTable.module.css';

/**
 * ستون جدول (قانون جدول‌ها: RULES.md): عرض بی‌قید و به اندازه‌ی محتوا، متن هرگز نمی‌شکند
 * (جدول در صورت نیاز اسکرول افقی می‌خورد)، همه‌ی ستون‌ها وسط‌چین.
 */
export type Column<T> = {
  key: string; header: ReactNode; render: (row: T, index: number) => ReactNode;
  /** فقط برای variant=flat (پیش‌فرض راست‌چین) */ align?: 'center';
  /** ستون کد (کد مشتری، کد پرسنلی، کد کالا، کد ملی…): متن خاکستری و یک شماره کوچک‌تر از بقیه‌ی سلول‌ها (RULES ۴، افشین 2026-10-21) */
  code?: boolean;
};

/** جدول ردیف‌کارتی؛ سربرگ و سلول‌ها در یک جدول واقعی ⇐ همیشه هم‌راستا. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, isSelected, loading, error, onRetry, empty, minWidth, variant = 'cards', expanded }: {
  columns: Column<T>[]; rows: T[] | undefined; rowKey: (r: T) => string; onRowClick?: (r: T) => void;
  /** ردیف انتخاب‌شده (جدول انتخابی) */
  isSelected?: (r: T) => boolean;
  loading?: boolean; error?: unknown; onRetry?: () => void; empty?: ReactNode; minWidth?: number;
  /** cards: ردیف‌کارتی وسط‌چین (پیش‌فرض پنل). flat: ردیف‌های خطی راست‌چین با سربرگ نواری — فقط جایی که html Fixed عیناً همین را خواسته (مثلاً اعلان‌های ارسال‌شده). */
  variant?: 'cards' | 'flat';
  /** پنل بازشونده‌ی زیر ردیف (html: جزئیات آیتم زیر ردیف لیست آیتم‌ها)؛ null ⇐ بسته */
  expanded?: (r: T) => ReactNode;
}) {
  if (error) return <ErrorBox error={error} onRetry={onRetry} />;
  const busy = loading && !rows;
  const none = !busy && (!rows || rows.length === 0);
  return (
    <div className={s.scroll}>
      <table className={`${s.table} ${variant === 'flat' ? s.flat : ''}`} style={{ minWidth }}>
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} className={c.align === 'center' ? s.center : undefined}>{c.header}</th>)}
          </tr>
        </thead>
        {busy || none ? null : (
          <tbody>
            {rows!.map((r, i) => { const ex = expanded?.(r); return (
              <Fragment key={rowKey(r)}>
              <tr
                className={`${onRowClick ? s.clickable : ''} ${isSelected?.(r) ? s.selected : ''}`}
                aria-selected={isSelected ? isSelected(r) : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'link' : undefined}
              >
                {columns.map((c) => <td key={c.key} className={[c.align === 'center' ? s.center : '', c.code ? s.codeCell : ''].join(' ').trim() || undefined}>{c.render(r, i)}</td>)}
              </tr>
              {ex ? <tr className={s.expandRow}><td colSpan={columns.length}>{ex}</td></tr> : null}
              </Fragment>
            ); })}
          </tbody>
        )}
      </table>
      {busy ? <SkeletonRows rows={6} /> : none ? (empty ?? <Empty title="موردی یافت نشد" />) : null}
    </div>
  );
}
