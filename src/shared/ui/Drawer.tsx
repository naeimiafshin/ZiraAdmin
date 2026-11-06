import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '@tabler/icons-react';
import s from './Drawer.module.css';

/** عرض پیش‌فرض کشو (px) — هم‌اندازه‌ی کشوی «ثبت انتقال» شعب */
const DEFAULT_DRAWER_WIDTH = 560;

/**
 * کشوی بازشونده از سمت چپ برای فرم‌های ثبت و ویرایش (افشین 2026-10-31، ماژول خرید و تأمین؛
 * هم‌شکل کشوی «ثبت انتقال» مدیریت شعب، ولی فقط با توکن‌ها).
 * Esc یا کلیک روی پرده می‌بندد (مگر `busy`)؛ فوکوس اول روی کشو می‌رود و پس از بستن به عنصر قبلی برمی‌گردد.
 */
export function Drawer({ open, onClose, title, sub, children, footer, width = DEFAULT_DRAWER_WIDTH, busy }: {
  open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode;
  /** عرض کشو به پیکسل (حداکثر ۹۶٪ پنجره) */
  width?: number;
  /** هنگام ذخیره بسته نشود */
  busy?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); prev?.focus?.(); };
  }, [open, onClose, busy]);
  if (!open) return null;
  return createPortal(
    <div className={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} tabIndex={-1} className={s.drawer} style={{ width: `min(${width}px, 96vw)` }} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className={s.head}>
          <div>
            <h3>{title}</h3>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className={s.x} onClick={onClose} aria-label="بستن" disabled={busy}><IconX size={17} /></button>
        </div>
        <div className={s.body}>{children}</div>
        {footer ? <div className={s.foot}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
