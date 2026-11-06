import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  loadingText?: string;
  block?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = 'primary', size = 'md', loading, loadingText, block, icon, children, disabled, className, ...rest }: Props) {
  const cls = [styles.btn, styles[variant], styles[size], block ? styles.block : '', className ?? ''].join(' ');
  return (
    <button {...rest} className={cls} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <Spinner size={15} /> : icon}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}
