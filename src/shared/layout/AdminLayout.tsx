import { Outlet, useLocation } from 'react-router';
import { ToastProvider } from '@/shared/ui/toast';
import { Header } from './Header';
import { Nav } from './Nav';
import styles from './AdminLayout.module.css';

/** چیدمان اصلی پنل (فقط دسکتاپ): سایدبار دوکشویی (راست) + سربرگ شناور + محتوا. */
export function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <ToastProvider>
      <div className={styles.shell}>
        <Nav />
        <div className={styles.main}>
          <Header />
          {/* key ⇐ انیمیشن ورود کوتاه با هر تغییر صفحه */}
          <main className={styles.content} key={pathname}>
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
