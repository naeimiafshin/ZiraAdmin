import type { ReactNode } from 'react';
import { AlertIcon, InfoIcon } from './icons';
import styles from './Alert.module.css';

export function Alert({ tone = 'danger', children, footer }: { tone?: 'danger' | 'info'; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {tone === 'danger' ? <AlertIcon size={18} /> : <InfoIcon size={18} />}
      <div className={styles.body}>
        <div>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}
