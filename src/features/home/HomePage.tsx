import { useAuth } from '@/shared/auth/useAuth';
import { toFaDigits } from '@/shared/lib/text';
import styles from './HomePage.module.css';

const USER_TYPE_LABEL: Record<string, string> = { SUPERADMIN: 'مدیر ارشد', STAFF: 'کارمند', CUSTOMER: 'مشتری' };

/**
 * داشبورد موقت: فقط داده‌ی واقعی /auth/me.
 * داشبورد IA (KPI، نمودار، هشدار) بعد از دامنه‌ی analytics در بک‌اند ساخته می‌شود.
 */
export default function HomePage() {
  const { user } = useAuth();
  if (!user) return null;

  const branches = user.is_superuser ? 'همه‌ی شعب' : `${toFaDigits(user.branch_ids?.length ?? 0)} شعبه`;
  const perms = user.is_superuser ? 'همه‌ی مجوزها' : `${toFaDigits(user.permission_codes?.length ?? 0)} مجوز`;
  const departments = (user.departments ?? []).map((d) => d.name).filter(Boolean);

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>
        خوش آمدید، <span className="ltr">{user.username ?? user.phone_number}</span>
      </h2>
      <dl className={styles.facts}>
        <div><dt>نوع حساب</dt><dd>{USER_TYPE_LABEL[user.user_type] ?? user.user_type}</dd></div>
        <div><dt>دسترسی شعب</dt><dd>{branches}</dd></div>
        <div><dt>مجوزها</dt><dd>{perms}</dd></div>
        <div><dt>دپارتمان</dt><dd>{departments.length ? departments.join('، ') : '—'}</dd></div>
        {user.is_branch_master ? <div><dt>Branch Master</dt><dd>بله</dd></div> : null}
      </dl>
    </section>
  );
}
