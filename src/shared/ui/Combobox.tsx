import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import d from './Dropdown.module.css';
import f from './form.module.css';

/**
 * ورودی متنی با فهرست پیشنهاد (جایگزین datalist بومی) — فهرست باز شده دقیقاً همان Dropdown استاندارد پنل است
 * (افشین 2026-10-23: «لیست کشویی فیلد مدل مشابه بقیه‌ی دراپ‌داون‌ها»). مقدار آزاد است: می‌توان از فهرست انتخاب کرد یا مقدار تازه نوشت.
 * فهرست در portal با position: fixed؛ پیمایش با کلیدهای جهت، Enter انتخاب، Esc بستن.
 */
export type ComboboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string; onChange: (v: string) => void; options: string[]; invalid?: boolean;
};

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox({ value, onChange, options, invalid, disabled, className, onKeyDown, onFocus, ...rest }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const q = value.trim().toLowerCase();
  const list = options.filter((o, i) => options.indexOf(o) === i && (!q || o.toLowerCase().includes(q) || o.toLowerCase() === q));
  const place = useCallback(() => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const below = window.innerHeight - r.bottom; const need = Math.min(320, Math.max(1, list.length) * 42 + 16);
    const up = below < need + 12 && r.top > below;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: r.width, up });
  }, [list.length]);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false); };
    const move = () => place();
    document.addEventListener('mousedown', down); window.addEventListener('scroll', move, true); window.addEventListener('resize', move);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('scroll', move, true); window.removeEventListener('resize', move); };
  }, [open, place]);
  useEffect(() => { if (open && active >= 0) menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  const choose = (v: string) => { onChange(v); setOpen(false); };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e); if (disabled || e.defaultPrevented) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(list.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && active >= 0 && list[active]) { e.preventDefault(); choose(list[active]!); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div ref={box} className={d.wrap}>
      <input ref={ref} {...rest} disabled={disabled} value={value} autoComplete="off" role="combobox" aria-expanded={open} aria-autocomplete="list"
        className={`${f.control} ${invalid ? f.invalid : ''} ${className ?? ''}`} style={{ paddingInlineEnd: 36 }}
        onChange={(e) => { onChange(e.target.value); setActive(-1); if (!open) setOpen(true); }}
        onFocus={(e) => { onFocus?.(e); if (!disabled) setOpen(true); }} onClick={() => { if (!disabled) setOpen(true); }} onKeyDown={key} />
      <IconChevronDown size={16} className={d.chev} aria-hidden style={open ? { transform: 'rotate(180deg)', color: 'var(--brand)' } : undefined} />
      {open && pos && !disabled ? createPortal(
        <ul ref={menu} className={d.menu} role="listbox" aria-label={rest['aria-label']} data-dropdown-menu
          style={{ left: pos.left, width: Math.max(pos.width, 160), ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
          {list.map((o, i) => {
            const on = o === value;
            return (
              <li key={o}>
                <button type="button" role="option" aria-selected={on} data-i={i} data-tip="" tabIndex={-1}
                  className={`${d.item} ${on ? d.itemOn : ''} ${i === active ? d.itemActive : ''}`}
                  onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
                  <span>{o}</span>{on ? <IconCheck size={15} /> : null}
                </button>
              </li>
            );
          })}
          {list.length === 0 ? <li className={d.none}>{value.trim() ? `مقدار تازه: «${value.trim()}»` : 'پیشنهادی وجود ندارد'}</li> : null}
        </ul>, document.body) : null}
    </div>
  );
});
