import { useEffect, useState } from 'react';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import s from './Stepper.module.css';

/** شمارنده‌ی «− مقدار +» (html Fixed، سیاست‌های امنیتی). عدد فارسی نمایش داده می‌شود؛ مقدار تایپ‌شده هنگام خروج از فیلد در بازه‌ی min..max قرار می‌گیرد. */
export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, unit, label, disabled }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; label: string; disabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const [text, setText] = useState(toFaDigits(value));
  useEffect(() => { setText(toFaDigits(value)); }, [value]);
  const commit = () => {
    const n = Number(toLatinDigits(text).replace(/\D/g, ''));
    const v = text.trim() === '' || Number.isNaN(n) ? value : clamp(n);
    setText(toFaDigits(v));
    if (v !== value) onChange(v);
  };
  return (
    <span className={s.wrap} aria-label={label} role="group">
      <button type="button" className={s.btn} onClick={() => onChange(clamp(value - step))} disabled={disabled || value <= min} aria-label={`کاهش ${label}`}><IconMinus size={15} /></button>
      <input className={s.val} inputMode="numeric" value={text} disabled={disabled} aria-label={label}
        onChange={(e) => setText(toFaDigits(toLatinDigits(e.target.value).replace(/\D/g, '')))}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      <button type="button" className={s.btn} onClick={() => onChange(clamp(value + step))} disabled={disabled || value >= max} aria-label={`افزایش ${label}`}><IconPlus size={15} /></button>
      {unit ? <span className={s.unit}>{unit}</span> : null}
    </span>
  );
}
