import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCalendarEvent, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Dropdown } from './Dropdown';
import { Input } from './form';
import s from './JalaliDateInput.module.css';

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const pad = (n: number) => String(n).padStart(2, '0');
const parse = (v: string) => {
  const m = toLatinDigits(v).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};

type Props = React.ComponentProps<typeof Input> & { minYear?: number; maxYear?: number };

/**
 * فیلد تاریخ شمسی با جدول انتخاب روز. مقدار متنی «۱۳۷۰/۰۵/۱۲» (ارقام فارسی) است و تایپ دستی هم ممکن است.
 * با register از react-hook-form کار می‌کند: انتخاب روز مقدار را مثل تایپ کاربر در input می‌گذارد.
 */
export const JalaliDateInput = forwardRef<HTMLInputElement, Props>(function JalaliDateInput({ minYear, maxYear, ...props }, ref) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // تقویم در portal با position: fixed (افشین 2026-10-24): داخل مودال/کارت بریده نمی‌شود و اسکرول افقی/عمودی نمی‌سازد
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const today = toJalaali(new Date());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: today.jy, m: today.jm });
  const [sel, setSel] = useState<{ y: number; m: number; d: number } | null>(null);
  const hiYear = maxYear ?? today.jy;
  const loYear = minYear ?? today.jy - 100;

  const show = () => {
    const cur = parse(inner.current?.value ?? '');
    setSel(cur);
    setView(cur ? { y: cur.y, m: cur.m } : { y: today.jy, m: today.jm });
    setOpen(true);
  };
  const place = useCallback(() => {
    const r = wrap.current?.querySelector('input')?.getBoundingClientRect() ?? wrap.current?.getBoundingClientRect(); if (!r) return;
    const W = 280, H = pop.current?.offsetHeight || 340;
    const up = window.innerHeight - r.bottom < H + 12 && r.top > H + 12;
    const left = Math.min(Math.max(8, r.right - W), window.innerWidth - W - 8);
    setPos({ top: up ? r.top - H - 6 : r.bottom + 6, left });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place, view]);
  useEffect(() => {
    if (!open) return;
    const move = () => place();
    window.addEventListener('scroll', move, true); window.addEventListener('resize', move);
    return () => { window.removeEventListener('scroll', move, true); window.removeEventListener('resize', move); };
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      // فهرست کشویی ماه/سال در portal است ⇐ کلیک روی آن بیرونِ تقویم حساب نمی‌شود
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !pop.current?.contains(t) && !(e.target as Element).closest?.('[data-dropdown-menu]')) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const pick = (d: number) => {
    const el = inner.current;
    if (!el) return;
    const text = toFaDigits(`${view.y}/${pad(view.m)}/${pad(d)}`);
    // مقدار را مثل تایپ کاربر ست می‌کنیم تا onChange (register) اجرا شود
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
    setOpen(false);
  };
  const move = (delta: number) => {
    let m = view.m + delta;
    let y = view.y;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    if (y >= loYear && y <= hiYear) setView({ y, m });
  };

  const g = toGregorian(view.y, view.m, 1);
  const lead = (new Date(g.gy, g.gm - 1, g.gd).getDay() + 1) % 7; // شنبه = ۰
  const days = jalaaliMonthLength(view.y, view.m);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const years = Array.from({ length: hiYear - loYear + 1 }, (_, i) => hiYear - i);

  return (
    <div className={`${s.wrap} ${props.label ? '' : s.noLabel}`} ref={wrap} style={props.span ? { gridColumn: `span ${props.span}` } : undefined}>
      <Input {...props} span={undefined} ref={inner} onFocus={(e) => { props.onFocus?.(e); show(); }} onClick={() => { if (!open) show(); }} autoComplete="off" />
      <button type="button" className={s.icon} onClick={() => (open ? setOpen(false) : show())} aria-label="انتخاب تاریخ" tabIndex={-1}>
        <IconCalendarEvent size={18} stroke={1.7} />
      </button>
      {open ? createPortal(
        <div ref={pop} className={s.pop} role="dialog" aria-label="انتخاب تاریخ شمسی" data-dropdown-menu style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, right: 'auto', insetInlineStart: 'auto', zIndex: 1000, direction: 'rtl' }}>
          <div className={s.head}>
            <button type="button" className={s.nav} onClick={() => move(-1)} aria-label="ماه قبل"><IconChevronRight size={17} /></button>
            <div className={s.title}>
              <Dropdown value={String(view.m)} onChange={(e) => setView({ ...view, m: Number(e.target.value) })} aria-label="ماه" buttonClassName={s.ddBtn} className={s.dd}
                options={MONTHS.map((n, i) => ({ value: String(i + 1), label: n }))} />
              <Dropdown value={String(view.y)} onChange={(e) => setView({ ...view, y: Number(e.target.value) })} aria-label="سال" buttonClassName={s.ddBtn} className={s.dd}
                options={years.map((y) => ({ value: String(y), label: toFaDigits(y) }))} />
            </div>
            <button type="button" className={s.nav} onClick={() => move(1)} aria-label="ماه بعد"><IconChevronLeft size={17} /></button>
          </div>
          <div className={s.grid}>
            {WEEK.map((w) => <span key={w} className={s.week}>{w}</span>)}
            {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
              <button
                key={d}
                type="button"
                data-tip=""
                className={`${s.day} ${sel && sel.y === view.y && sel.m === view.m && sel.d === d ? s.daySel : ''} ${today.jy === view.y && today.jm === view.m && today.jd === d ? s.dayToday : ''} ${i % 7 === 6 ? s.fri : ''}`}
                onClick={() => pick(d)}
              >
                {toFaDigits(d)}
              </button>
            ))}
          </div>
        </div>, document.body) : null}
    </div>
  );
});
