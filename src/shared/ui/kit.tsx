import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconInfoCircle, IconX, IconInbox } from '@tabler/icons-react';
import { avatarColor, faNum, initialOf } from '@/shared/lib/format';
import { userMessage } from '@/shared/api/errors';
import { Button } from './Button';
import s from './kit.module.css';

export const Card = ({ children, className = '', pad = true }: { children: ReactNode; className?: string; pad?: boolean }) => (
  <section className={`${s.card} ${pad ? s.cardPad : ''} ${className}`}>{children}</section>
);

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={s.sectionTitle}>
      <h3><span className={s.sectionBar} />{children}</h3>
      {extra}
    </div>
  );
}

/** عنوان صفحه + اقدام‌ها (مثل «افزودن جدید») */
export function PageHead({ title, sub, back, actions }: { title?: ReactNode; sub?: ReactNode; back?: () => void; actions?: ReactNode }) {
  return (
    <div className={s.pageHead}>
      <div className={s.pageHeadStart}>
        {back ? (
          <button type="button" className={s.back} onClick={back}><IconChevronRight size={16} />بازگشت</button>
        ) : null}
        {title ? <div><h2 className={s.pageTitle}>{title}</h2>{sub ? <p className={s.pageSub}>{sub}</p> : null}</div> : null}
      </div>
      <div className={s.pageActions}>{actions}</div>
    </div>
  );
}

export type Tone = 'success' | 'neutral' | 'warning' | 'danger' | 'info' | 'brand';
export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => <span className={`${s.badge} ${s[`b_${tone}`]}`}>{children}</span>;
/** tip ⇐ متن کامل چیپ در راهنمای شناور (وقتی ممکن است کوتاه شود) */
export const Chip = ({ children, tip }: { children: ReactNode; tip?: boolean }) => (
  <span className={s.chip} data-tip={tip && typeof children === 'string' ? children : undefined}>{children}</span>
);

export function Avatar({ seed, name, size = 34 }: { seed: string; name: string; size?: number }) {
  return (
    <span className={s.avatar} style={{ width: size, height: size, background: avatarColor(seed), fontSize: size * 0.4 }} aria-hidden>
      {initialOf(name)}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; disabled?: boolean; tip?: string }[] }) {
  return (
    <div className={s.segmented} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? s.segOn : ''} onClick={() => onChange(o.value)} disabled={o.disabled} data-tip={o.tip}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function UnderlineTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className={s.utabs} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? s.utabOn : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const InfoBanner = ({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) => (
  <div className={`${s.banner} ${tone === 'warning' ? s.bannerWarn : ''}`}>
    {tone === 'warning' ? <IconAlertTriangle size={17} /> : <IconInfoCircle size={17} />}
    <div>{children}</div>
  </div>
);

export function Empty({ title, text, icon, action }: { title: string; text?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>{icon ?? <IconInbox size={26} stroke={1.5} />}</span>
      <div className={s.emptyTitle}>{title}</div>
      {text ? <div className={s.emptyText}>{text}</div> : null}
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className={s.errorBox} role="alert">
      <IconAlertTriangle size={20} />
      <span>{userMessage(error)}</span>
      {onRetry ? <Button variant="secondary" onClick={onRetry}>تلاش دوباره</Button> : null}
    </div>
  );
}

export const SkeletonRows = ({ rows = 6, height = 52 }: { rows?: number; height?: number }) => (
  <div className={s.skelWrap}>{Array.from({ length: rows }, (_, i) => <div key={i} className={s.skel} style={{ height }} />)}</div>
);

export function Pagination({ page, pageSize, total, onPage, onPageSize, sizes = [10, 50, 100] }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (n: number) => void; sizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={s.pager}>
      <div className={s.pagerNav}>
        <button type="button" aria-label="صفحه‌ی قبل" disabled={page <= 1} onClick={() => onPage(page - 1)}><IconChevronRight size={16} /></button>
        <button type="button" aria-label="صفحه‌ی بعد" disabled={page >= pages} onClick={() => onPage(page + 1)}><IconChevronLeft size={16} /></button>
        <span className={s.pagerText}>{faNum(from)}–{faNum(to)} از {faNum(total)}</span>
      </div>
      {onPageSize ? (
        <div className={s.pagerSizes}>
          {sizes.map((n) => (
            <button key={n} type="button" className={n === pageSize ? s.pagerOn : ''} onClick={() => onPageSize(n)}>
              {n === pageSize ? `${faNum(n)} ردیف` : faNum(n)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** لایه‌های باز (مودال، برگه‌ی تمام‌صفحه) به ترتیب باز شدن؛ Escape فقط بالاترین را می‌بندد (مثل تسویه روی برگه‌ی فاکتور). */
const openLayers: symbol[] = [];

/** ثبت یک لایه‌ی باز برای Escape؛ هر پوشش تمام‌صفحه‌ی خارج از Modal هم باید از همین استفاده کند تا ترتیب درست بماند */
export function useEscapeLayer(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const me = Symbol('layer');
    openLayers.push(me);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && openLayers[openLayers.length - 1] === me) closeRef.current(); };
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('keydown', k);
      openLayers.splice(openLayers.indexOf(me), 1);
    };
  }, [open]);
}

export function Modal({ open, onClose, title, children, footer, width = 520 }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEscapeLayer(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} style={{ width }} role="dialog" aria-modal="true">
        <div className={s.modalHead}>
          <h3>{title}</h3>
          <button type="button" className={s.modalX} onClick={onClose} aria-label="بستن"><IconX size={18} /></button>
        </div>
        <div className={s.modalBody}>{children}</div>
        {footer ? <div className={s.modalFoot}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function KeyValue({ label, children, ltr }: { label: string; children: ReactNode; ltr?: boolean }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={s.kv}>
      <div className={s.kvLabel}>{label}</div>
      <div className={s.kvValue}>{empty ? '—' : ltr ? <span className="ltr">{children}</span> : children}</div>
    </div>
  );
}

/** واحد پول کنار مبلغ (خارج از جدول؛ در جدول فقط سرستون «(ریال)» — قاعده‌ی سراسری 2026-10-23) */
export const Rial = () => <span className={s.rial}>ریال</span>;
/** سرستون مبلغ: «عنوان» + «(ریال)» کوچک در سطر دوم تا جدول پهن نشود */
export const UnitHead = ({ children, unit = 'ریال' }: { children: ReactNode; unit?: string }) => <>{children}<span className={s.thUnit}> ({unit})</span></>;

/**
 * نمایش مبلغ تخفیف‌خورده — قانون سراسری (افشین 2026-10-24): سه سطر وسط‌چین:
 * ۱) «پایه: » + قیمت بدون تخفیف (خاکستری، هم‌اندازه‌ی مبلغ‌های عادی، خط قرمز نازک افقی فقط روی عدد)، ۲) «تخفیف: …» سبز، ۳) «قیمت نهایی: …» سبز (افشین 2026-10-24).
 * بی‌تخفیف ⇐ فقط مبلغ. rial ⇐ «ریال» کنار هر مبلغ (بیرون از جدول؛ در جدول واحد فقط در سرستون).
 */
export function DiscountedPrice({ original, discount, final, rial = false, fmt }: { original: number | null | undefined; discount: number | null | undefined; final: number | null | undefined; rial?: boolean; fmt: (n: number) => string }) {
  const u = rial ? <Rial /> : null;
  if (final == null) return <span className={s.dpFinalOnly}>—</span>;
  if (!discount || original == null || original === final) return <span className={`${s.dpFinalOnly} tnum`}>{fmt(final)}{u}</span>;
  return (
    <span className={`${s.dp} tnum`} data-discounted>
      <span className={s.dpOld} data-original>پایه: <s>{fmt(original)}</s>{u}</span>
      <span className={s.dpLine} data-discount>تخفیف: {fmt(discount)}{u}</span>
      <span className={s.dpLine} data-final><span className={s.dpFinalLabel}>قیمت نهایی:</span> <b>{fmt(final)}</b>{u}</span>
    </span>
  );
}
