import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { IconChevronDown, IconUserSearch, IconX } from '@tabler/icons-react';
import { toFaDigits } from '@/shared/lib/text';
import { Dropdown } from './Dropdown';
import s from './form.module.css';

/** فیلد فشرده‌ی فرم‌های پنل (ارتفاع ۴۲، مطابق html Fixed). */
export function Field({ label, required, error, hint, children, htmlFor, span }: {
  label: string; required?: boolean; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; span?: number;
}) {
  return (
    <div className={s.field} style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label className={s.label} htmlFor={htmlFor}>{label}{required ? <span className={s.req}> *</span> : null}</label>
      {children}
      {error ? <div className={s.error}>{error}</div> : hint ? <div className={s.hint}>{hint}</div> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string; required?: boolean; error?: string; hint?: ReactNode; span?: number;
  /** ارقام لاتین بماند (کد، نام کاربری، ایمیل). پیش‌فرض: هر رقم تایپ‌شده فارسی نمایش داده می‌شود (رمز عبور هرگز). */
  latin?: boolean;
  /** قالب نمایش هنگام تایپ (مثل گروه‌های ۴ رقمی کارت)؛ مقدار پیش از ارسال با clean/حذف فاصله عادی می‌شود. */
  format?: (v: string) => string;
};
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, required, error, hint, span, id, className, latin, format, onChange, ...rest }, ref) {
  const auto = useId();
  const iid = id ?? auto;
  const fa = !latin && rest.type !== 'password';
  const handle: React.ChangeEventHandler<HTMLInputElement> = (ev) => {
    const el = ev.target;
    if (fa || format) {
      const before = el.value;
      let next = fa ? toFaDigits(before) : before;
      if (format) next = format(next);
      if (next !== before) {
        const atEnd = el.selectionStart === before.length;
        const pos = el.selectionStart ?? next.length;
        el.value = next;
        const caret = atEnd || format ? next.length : pos;
        try { el.setSelectionRange(caret, caret); } catch { /* نوع ورودی بدون caret */ }
      }
    }
    onChange?.(ev);
  };
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={iid} span={span}>
      <input ref={ref} id={iid} className={`${s.control} ${error ? s.invalid : ''} ${className ?? ''}`} aria-invalid={error ? true : undefined} onChange={handle} {...rest} />
    </Field>
  );
});

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { label: string; required?: boolean; error?: string; hint?: ReactNode; span?: number; placeholder?: string; options: { value: string; label: string }[] };
/** فهرست کشویی فرم — ظاهر فهرست باز شده استاندارد «مدیریت کاربران» (Dropdown؛ قانون سراسری افشین 2026-10-23) */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, required, error, hint, span, id, options, placeholder, ...rest }, ref) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={iid} span={span}>
      <Dropdown ref={ref} id={iid} options={options} placeholder={placeholder} invalid={!!error} {...rest} />
    </Field>
  );
});

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; required?: boolean; error?: string; hint?: ReactNode; span?: number };
export const Textarea = forwardRef<HTMLTextAreaElement, AreaProps>(function Textarea({ label, required, error, hint, span, id, ...rest }, ref) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={iid} span={span}>
      <textarea ref={ref} id={iid} className={`${s.control} ${s.area} ${error ? s.invalid : ''}`} aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
});

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={s.toggleRow}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={`${s.toggle} ${checked ? s.toggleOn : ''}`} onClick={() => onChange(!checked)}>
        <span className={s.knob} />
      </button>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

/**
 * فیلد انتخاب از فهرست (مثل انتخاب کارمند با مودال جدول): هم‌قد و هم‌شکل Input/Select، با برچسب، آیکن، مقدار یا placeholder،
 * دکمه‌ی پاک‌کردن و فلش. کلیک ⇐ onOpen (مودال انتخاب). به‌جای «دکمه‌ی انتخاب» کنار فیلدها استفاده شود.
 */
export function PickerField({ label, required, error, hint, span, value, placeholder = 'انتخاب کنید', onOpen, onClear, disabled, icon }: {
  label: string; required?: boolean; error?: string; hint?: ReactNode; span?: number;
  value?: string | null; placeholder?: string; onOpen: () => void; onClear?: () => void; disabled?: boolean; icon?: ReactNode;
}) {
  const iid = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} htmlFor={iid} span={span}>
      <div className={s.pickWrap}>
        <button id={iid} type="button" disabled={disabled} onClick={onOpen} aria-haspopup="dialog" aria-invalid={error ? true : undefined}
          className={`${s.control} ${s.pick} ${error ? s.invalid : ''} ${value ? '' : s.pickEmpty}`}>
          <span className={s.pickIcon} aria-hidden>{icon ?? <IconUserSearch size={17} />}</span>
          <span className={s.pickValue}>{value || placeholder}</span>
          <IconChevronDown size={16} className={s.pickChev} aria-hidden />
        </button>
        {value && onClear && !disabled ? <button type="button" className={s.pickClear} onClick={onClear} aria-label={`پاک کردن ${label}`}><IconX size={14} /></button> : null}
      </div>
    </Field>
  );
}

export const FormGrid = ({ cols = 4, children }: { cols?: number; children: ReactNode }) => (
  <div className={s.grid} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{children}</div>
);
