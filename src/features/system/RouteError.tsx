import { isRouteErrorResponse, useRouteError } from 'react-router';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { Button } from '@/shared/ui/Button';
import styles from './PageNotBuilt.module.css';

/** خطای پیش‌بینی‌نشده‌ی صفحه: به‌جای صفحه‌ی پیش‌فرض React Router یک پیام آرام و دکمه‌ی بارگذاری دوباره. */
export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : '';
  if (import.meta.env.DEV) console.error(error);
  return (
    <section className={styles.box} role="alert">
      <span className={styles.icon}><IconAlertTriangle size={26} stroke={1.6} /></span>
      <h2 className={styles.title}>در نمایش این صفحه خطایی رخ داد</h2>
      <p className={styles.text}>صفحه را دوباره بارگذاری کنید. اگر خطا تکرار شد، متن زیر را برای تیم فنی بفرستید.</p>
      {detail ? <code className={`${styles.code} ltr`}>{detail}</code> : null}
      <Button icon={<IconRefresh size={17} />} onClick={() => window.location.reload()}>بارگذاری دوباره</Button>
    </section>
  );
}
