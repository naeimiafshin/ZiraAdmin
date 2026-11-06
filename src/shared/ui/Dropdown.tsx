import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import s from './Dropdown.module.css';

/**
 * فهرست کشویی استاندارد پنل (افشین 2026-10-23، قانون سراسری): ظاهر فهرست باز شده همان فهرست فیلترهای «مدیریت کاربران» (TableFilters) است.
 * یک <select> بومیِ پنهان مقدار را نگه می‌دارد ⇐ API همان <select> است (value/defaultValue/onChange/name/ref، react-hook-form، تست‌های e2e با select()).
 * فهرست در portal با position: fixed باز می‌شود (داخل مودال و جدول بریده نمی‌شود)؛ بستن با کلیک بیرون، Esc، Tab؛ پیمایش با کلیدهای جهت.
 * گزینه‌ی value='' اگر placeholder باشد، خاکستری نمایش داده می‌شود.
 */
export type DropdownOption = { value: string; label: string };
export type DropdownProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  options: DropdownOption[];
  /** متن حالت خالی (value='') */
  placeholder?: string;
  invalid?: boolean;
  /** کلاس دکمه (پیش‌فرض: هم‌شکل .control فرم‌ها) */
  buttonClassName?: string;
};

const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!;

export const Dropdown = forwardRef<HTMLSelectElement, DropdownProps>(function Dropdown(
  { options, placeholder, invalid, buttonClassName, id, value, defaultValue, onChange, disabled, className, style, ...rest }, ref,
) {
  const sel = useRef<HTMLSelectElement | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const controlled = value !== undefined;
  const [cur, setCur] = useState<string>(String(defaultValue ?? ''));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const all: DropdownOption[] = placeholder !== undefined ? [{ value: '', label: placeholder }, ...options.filter((o) => o.value !== '')] : options;
  const shown = controlled ? String(value ?? '') : cur;
  const current = all.find((o) => o.value === shown);

  // ref بیرونی + گوش دادن به مقداردهی مستقیم (react-hook-form reset/setValue ⇐ el.value = x)
  const setRefs = useCallback((el: HTMLSelectElement | null) => {
    sel.current = el;
    if (typeof ref === 'function') ref(el); else if (ref) ref.current = el;
    if (el && !(el as unknown as { __zm?: boolean }).__zm) {
      Object.defineProperty(el, 'value', { configurable: true, get() { return nativeValue.get!.call(el); }, set(v) { nativeValue.set!.call(el, v); setCur(nativeValue.get!.call(el) as string); } });
      (el as unknown as { __zm?: boolean }).__zm = true;
      setCur(nativeValue.get!.call(el) as string);
    }
  }, [ref]);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const below = window.innerHeight - r.bottom; const need = Math.min(320, all.length * 42 + 16);
    const up = below < need + 12 && r.top > below;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: r.width, up });
  }, [all.length]);
  const show = () => { if (disabled) return; place(); setActive(Math.max(0, all.findIndex((o) => o.value === shown))); setOpen(true); };
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !menu.current?.contains(t)) setOpen(false); };
    const move = () => place();
    document.addEventListener('mousedown', down);
    window.addEventListener('scroll', move, true); window.addEventListener('resize', move);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('scroll', move, true); window.removeEventListener('resize', move); };
  }, [open, place]);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active]);

  const choose = (v: string) => {
    setOpen(false); btn.current?.focus();
    const el = sel.current; if (!el || v === shown) return;
    nativeValue.set!.call(el, v);
    if (!controlled) setCur(v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const onKey = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(all.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = all[active]; if (o) choose(o.value); }
  };
  return (
    <div className={`${s.wrap} ${className ?? ''}`} style={style}>
      <select ref={setRefs} className={s.native} tabIndex={-1} aria-hidden disabled={disabled}
        value={controlled ? shown : undefined} defaultValue={controlled ? undefined : defaultValue}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => { if (!controlled) setCur(e.target.value); onChange?.(e); }} {...rest}>
        {all.map((o) => <option key={o.value || '__empty'} value={o.value}>{o.label}</option>)}
      </select>
      <button ref={btn} id={id} type="button" disabled={disabled} className={`${buttonClassName ?? s.button} ${invalid ? s.invalid : ''} ${open ? s.open : ''}`}
        aria-haspopup="listbox" aria-expanded={open} aria-label={rest['aria-label']} aria-invalid={invalid || undefined}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey} data-tip="">
        <span className={`${s.value} ${!current || (current.value === '' && placeholder !== undefined) ? s.placeholder : ''}`}>{current?.label ?? placeholder ?? ''}</span>
        <IconChevronDown size={16} className={s.chev} aria-hidden />
      </button>
      {open && pos ? createPortal(
        <ul ref={menu} className={s.menu} role="listbox" aria-label={rest['aria-label']} data-dropdown-menu onKeyDown={onKey}
          style={{ left: pos.left, width: Math.max(pos.width, 160), ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
          {all.map((o, i) => {
            const on = o.value === shown;
            return (
              <li key={o.value || '__empty'}>
                <button type="button" role="option" aria-selected={on} data-i={i} data-tip="" tabIndex={-1}
                  className={`${s.item} ${on ? s.itemOn : ''} ${i === active ? s.itemActive : ''} ${o.value === '' && placeholder !== undefined ? s.itemEmpty : ''}`}
                  onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o.value)}>
                  <span>{o.label}</span>{on ? <IconCheck size={15} /> : null}
                </button>
              </li>
            );
          })}
          {all.length === 0 ? <li className={s.none}>موردی وجود ندارد</li> : null}
        </ul>, document.body) : null}
    </div>
  );
});
