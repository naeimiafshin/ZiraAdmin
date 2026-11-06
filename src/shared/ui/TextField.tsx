import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './TextField.module.css';

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  /** دکمه/المان انتهای فیلد (مثل نمایش رمز). */
  trailing?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, icon, trailing, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      <label htmlFor={inputId} className={styles.label}>{label}</label>
      <div className={`${styles.control} ${error ? styles.invalid : ''}`}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          {...rest}
        />
        {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
      </div>
      {error ? (
        <div id={msgId} className={styles.error}>{error}</div>
      ) : hint ? (
        <div id={msgId} className={styles.hint}>{hint}</div>
      ) : null}
    </div>
  );
});
