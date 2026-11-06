import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconColumns3 } from '@tabler/icons-react';
import { faNum } from '@/shared/lib/format';
import type { ColumnOption } from '@/shared/lib/useColumnPrefs';
import s from './ColumnPicker.module.css';

/** دکمه‌ی «انتخاب ستون‌ها» + فهرست تیک‌دار (html Fixed، Customer Management). ستون fixed قابل برداشتن نیست. */
export function ColumnPicker({ options, isVisible, toggle, reset, visibleCount }: {
  options: ColumnOption[]; isVisible: (k: string) => boolean; toggle: (k: string) => void; reset: () => void; visibleCount: number;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className={s.wrap} ref={wrap}>
      <button type="button" className={`${s.btn} ${open ? s.btnOn : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} aria-label="انتخاب ستون‌ها" data-tip="">
        <IconColumns3 size={17} />
        <span>انتخاب ستون‌ها</span>
        <span className={s.count}>{faNum(visibleCount)}</span>
      </button>
      {open ? (
        <div className={s.pop} role="dialog" aria-label="ستون‌های جدول">
          <div className={s.head}>
            <b>ستون‌های جدول</b>
            <button type="button" className={s.reset} onClick={reset}>بازنشانی</button>
          </div>
          <ul className={s.list}>
            {options.map((o) => {
              const on = isVisible(o.key);
              return (
                <li key={o.key}>
                  <label className={`${s.item} ${o.fixed || o.soon ? s.fixed : ''}`}>
                    <input type="checkbox" checked={on} disabled={o.fixed || o.soon} onChange={() => toggle(o.key)} />
                    <span className={`${s.box} ${on ? s.boxOn : ''}`} aria-hidden>{on ? <IconCheck size={12} stroke={3} /> : null}</span>
                    <span className={s.label}>{o.label}</span>
                    {o.fixed ? <span className={s.tag}>ثابت</span> : null}
                    {o.soon ? <span className={s.soon}>به‌زودی</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className={s.foot}>تنظیم ستون‌ها برای حساب شما در همین مرورگر ذخیره می‌شود.</div>
        </div>
      ) : null}
    </div>
  );
}
