import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconChevronDown, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { Alert } from '@/shared/ui/Alert';
import { Textarea } from '@/shared/ui/form';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/kit';
import type { CustomerRow } from '@/features/customers/api';
import s from './sales.module.css';

/** اندازه‌ی آیکن‌ها (هم‌اندازه‌ی بقیه‌ی پنل) */
export const ICON_SM = 15;
export const ICON = 16;

/**
 * فیلتر «انتخاب از فهرست» در پنل فیلترها (مثل کالا): هم‌شکل کشوهای html؛ کلیک ⇐ پنجره‌ی انتخاب، ضربدر ⇐ برداشتن.
 */
export function PickChip({ label, value, icon, onOpen, onClear }: { label: string; value: string; icon: ReactNode; onOpen: () => void; onClear: () => void }) {
  return (
    <span className={s.pickChip}>
      <button type="button" className={`${s.pickChipBtn} ${value ? s.pickChipOn : ''}`} onClick={onOpen} aria-haspopup="dialog" aria-label={label}>
        {icon}<b aria-label={label}>{value || 'همه'}</b>
      </button>
      {value ? <button type="button" className={s.pickChipClear} aria-label={`برداشتن فیلتر ${label}`} onClick={onClear}><IconX size={14} /></button> : null}
    </span>
  );
}

/** فیلتر چندانتخابی (مثل وضعیت تسویه)؛ مقدار = فهرست کدها، خالی = همه */
export function MultiFilter({ label, value, options, onChange }: { label: string; value: string[]; options: { value: string; label: string }[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const picked = options.filter((o) => value.includes(o.value));
  const shown = picked.length === 0 ? 'همه' : picked.map((o) => o.label).join('، ');
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <span className={s.pickChip} ref={wrap}>
      <button type="button" className={`${s.pickChipBtn} ${picked.length ? s.pickChipOn : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={label} data-tip={shown}>
        <b>{shown}</b><IconChevronDown size={ICON} />
      </button>
      {open ? (
        <div className={s.multiPop} role="listbox" aria-multiselectable aria-label={label}>
          {options.map((o) => (
            <label key={o.value} className={s.multiOpt}>
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />{o.label}
            </label>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/** دلیل غیرقابل‌انتخاب بودن مشتری برای سند فروش (بک‌اند همین‌ها را با ۴۰۰ رد می‌کند) */
export const customerBlock = (c: Pick<CustomerRow, 'status' | 'is_blacklisted'>): string | null => {
  if (c.is_blacklisted) return 'در لیست سیاه';
  if (c.status !== 'ACTIVE') return 'پرونده فعال نیست';
  return null;
};

/**
 * مودال «دلیل» برای لغو، ابطال، رد و اصلاحیه: بک‌اند دلیل خالی را ۴۲۲ می‌دهد ⇐ دکمه‌ی تأیید تا نوشتن دلیل خاموش است.
 * خطای بک‌اند (مثلاً ۴۰۹ وضعیت) همان‌جا نمایش داده می‌شود.
 */
export function ReasonModal({ open, onClose, title, intro, label = 'دلیل', confirmText, danger, onConfirm }: {
  open: boolean; onClose: () => void; title: ReactNode; intro?: ReactNode; label?: string; confirmText: string; danger?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!open) { setReason(''); setErr(null); } }, [open]);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(reason.trim()); onClose(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy} disabled={!reason.trim()}>{confirmText}</Button></>}>
      <div className={s.modalStack}>
        {intro ? <p className={s.muted}>{intro}</p> : null}
        <Textarea label={label} required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        {err ? <Alert>{err}</Alert> : null}
      </div>
    </Modal>
  );
}

/** مودال تأیید ساده (مثل «تأیید و صدور») با خطای بک‌اند همان‌جا */
export function ConfirmModal({ open, onClose, title, text, confirmText, danger, onConfirm }: {
  open: boolean; onClose: () => void; title: ReactNode; text: ReactNode; confirmText: string; danger?: boolean; onConfirm: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!open) setErr(null); }, [open]);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(); onClose(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} width={480}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant={danger ? 'danger' : 'primary'} onClick={go} loading={busy}>{confirmText}</Button></>}>
      <div className={s.modalStack}>
        <p className={s.pre}>{text}</p>
        {err ? <Alert>{err}</Alert> : null}
      </div>
    </Modal>
  );
}
