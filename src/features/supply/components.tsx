import type { ReactNode } from 'react';
import s from './supply.module.css';

/** دکمه‌ی فقط‌آیکونی جدول با aria-label و راهنمای شناور (قانون راهنمای شناور؛ هم‌شکل IconButton کاتالوگ) */
export function IconButton({ label, onClick, danger, disabled, children }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={`${s.iconBtn} ${danger ? s.iconDanger : ''}`} aria-label={label} data-tip={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled}>
      {children}
    </button>
  );
}
