import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import s from './TooltipLayer.module.css';

/**
 * راهنمای شناور سراسری (یک بار در ریشه‌ی برنامه).
 * برای هر دکمه، لینک، گزینه، تب و هر عنصری با data-tip ظاهر می‌شود.
 * متن = data-tip ⇐ aria-label ⇐ متن خود دکمه. data-tip="" یعنی راهنما نشان داده نشود.
 * data-tip-pos="left|right|bottom|top" جهت را تعیین می‌کند (پیش‌فرض: بالا، و اگر جا نباشد پایین).
 */
const TARGET = '[data-tip],button,a[href],[role=option],[role=tab],[role=menuitem],[role=link]';
type Pos = 'top' | 'bottom' | 'left' | 'right';
type Tip = { text: string; rect: DOMRect; pos: Pos };

function textOf(el: Element): string {
  const own = el.getAttribute('data-tip');
  if (own !== null) return own.trim();
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    let current: Element | null = null;
    let timer: number | undefined;
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.(TARGET) ?? null;
      if (el === current) return;
      window.clearTimeout(timer);
      setTip(null);
      current = el;
      if (!el || el.closest('[data-tip=""]')) return;
      const text = textOf(el);
      // ردیف‌های جدول و متن‌های بلند راهنما نمی‌خواهند
      if (!text || text.length > 48 || el.getAttribute('role') === 'link') return;
      const pos = (el.getAttribute('data-tip-pos') as Pos | null) ?? 'top';
      timer = window.setTimeout(() => {
        if (current === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect(), pos });
      }, 320);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // جای‌گذاری پس از اندازه‌گیری، و ماندن داخل صفحه
  useLayoutEffect(() => {
    if (!tip || !box.current) {
      setStyle(null);
      return;
    }
    const { width: w, height: h } = box.current.getBoundingClientRect();
    const r = tip.rect;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let pos = tip.pos;
    if (pos === 'top' && r.top - h - gap < 6) pos = 'bottom';
    if (pos === 'left' && r.left - w - gap < 6) pos = 'right';
    let left = 0;
    let top = 0;
    if (pos === 'top' || pos === 'bottom') {
      left = r.left + r.width / 2 - w / 2;
      top = pos === 'top' ? r.top - h - gap : r.bottom + gap;
    } else {
      top = r.top + r.height / 2 - h / 2;
      left = pos === 'left' ? r.left - w - gap : r.right + gap;
    }
    left = Math.max(6, Math.min(left, vw - w - 6));
    top = Math.max(6, Math.min(top, vh - h - 6));
    setStyle({ left, top });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className={s.tip}
      style={style ? { left: style.left, top: style.top } : { left: -9999, top: -9999 }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
