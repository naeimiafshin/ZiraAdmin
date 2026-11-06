import { useState, type ReactNode } from 'react';
import { userMessage } from '@/shared/api/errors';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Badge, Modal } from '@/shared/ui/kit';
import { ATTR_ROLE } from './labels';
import s from './catalog.module.css';

/** مودال تأیید عمل برگشت‌ناپذیر (حذف، غیرفعال‌سازی): پیام صریح + خطای بک‌اند (مثلاً ۴۰۹ «استفاده شده») همان‌جا */
export function ConfirmModal({ title, text, confirmLabel, danger, onConfirm, onClose }: {
  title: string; text: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<unknown>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(); onClose(); } catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={title} width={460}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button variant={danger ? 'danger' : 'primary'} onClick={go} loading={busy}>{confirmLabel}</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <p style={{ margin: 0, lineHeight: 1.9 }}>{text}</p>
    </Modal>
  );
}

export const RoleBadge = ({ role }: { role: string }) => {
  const r = ATTR_ROLE[role];
  return <Badge tone={r?.tone ?? 'neutral'}>{r?.label ?? role}</Badge>;
};

export const Swatch = ({ hex, big }: { hex?: string | null; big?: boolean }) =>
  hex ? <span className={big ? s.swBig : s.sw} style={{ background: hex }} aria-hidden /> : null;

/** دکمه‌ی فقط‌آیکونی جدول/کارت با aria-label و راهنمای شناور (RULES ۲-۴) */
export function IconButton({ label, onClick, danger, disabled, children }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={`${s.iconBtn} ${danger ? s.iconDanger : ''}`} aria-label={label} data-tip={label} onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled}>
      {children}
    </button>
  );
}

/** رنگ ثابت تصویرک بدون عکس (لیست ItemListOut تصویر ندارد — C-15) */
const THUMB = ['#8fb3d9', '#c9a87a', '#9cc4a0', '#b79bd2', '#e2a27c', '#7fbfbf', '#d6a2b3'];
export const thumbColor = (seed: string) => THUMB[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % THUMB.length];
/** جفت «برچسب / مقدار» پنل‌های جزئیات (html: پنل زیر ردیف و «اطلاعات کلی») */
export const Kv = ({ k, v }: { k: string; v: ReactNode }) => <div className={s.kv}><span>{k}</span><b>{v}</b></div>;
