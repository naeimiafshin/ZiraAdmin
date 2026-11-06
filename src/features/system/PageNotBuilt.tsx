import { useLocation } from 'react-router';
import { IconTools } from '@tabler/icons-react';
import { findCurrent, useNav } from '@/shared/layout/useNav';
import styles from './PageNotBuilt.module.css';

/** مسیری که در منوی بک‌اند هست ولی صفحه‌ی فرانتش هنوز ساخته نشده (بدون دیتای ساختگی). */
export default function PageNotBuilt() {
  const { groups, isLoading } = useNav();
  const { pathname } = useLocation();
  if (isLoading) return null;
  const current = findCurrent(groups, pathname);
  return (
    <section className={styles.box}>
      <span className={styles.icon}><IconTools size={26} stroke={1.6} /></span>
      <h2 className={styles.title}>{current ? 'این صفحه هنوز ساخته نشده است' : 'صفحه پیدا نشد'}</h2>
      <p className={styles.text}>
        {current
          ? `«${current.leaf?.name ?? current.group.name}» در مراحل بعدی توسعه‌ی پنل، دامنه‌به‌دامنه ساخته می‌شود.`
          : 'این آدرس در منوی شما وجود ندارد یا به آن دسترسی ندارید.'}
      </p>
    </section>
  );
}
