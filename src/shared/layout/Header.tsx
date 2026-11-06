import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { IconCalendarEvent, IconChevronDown, IconChevronLeft, IconDevicesOff, IconKey, IconLogout, IconUserCircle } from '@tabler/icons-react';
import { ChangePasswordModal, LogoutAllModal } from '@/features/account/AccountModals';
import { useAuth } from '@/shared/auth/useAuth';
import { Avatar } from '@/shared/ui/kit';
import { BranchPicker } from './BranchPicker';
import { Bell } from '@/features/inbox/Bell';
import { findCurrent, useNav } from './useNav';
import styles from './Header.module.css';

const USER_TYPE_LABEL: Record<string, string> = { SUPERADMIN: 'مدیر ارشد سامانه', STAFF: 'کارمند', CUSTOMER: 'مشتری' };
const dateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
/** «شنبه ۲۵ مهر ۱۴۰۵» — ترتیب بخش‌ها دستی، چون خروجی Intl در مرورگرها یکسان نیست */
function todayText(): string {
  const parts = Object.fromEntries(dateFmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

/** سربرگ شناور: مسیر صفحه (ماژول › صفحه) و عنوان، تاریخ امروز، شعبه‌ی فعال و حساب کاربر. */
export function Header() {
  const { groups } = useNav();
  const { pathname } = useLocation();
  const current = findCurrent(groups, pathname);
  const group = current?.group ?? (pathname === '/' ? groups.find((g) => g.code === 'dashboard') : undefined);
  const title = current?.leaf?.name ?? group?.name ?? '';
  const GroupIcon = group?.icon;

  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        {GroupIcon ? <span className={styles.titleTile} aria-hidden><GroupIcon size={21} stroke={1.7} /></span> : null}
        <div className={styles.titleText}>
          <nav className={styles.crumb} aria-label="مسیر صفحه">
            <span>پنل مدیریت</span>
            {group && current?.leaf ? (
              <>
                <IconChevronLeft size={13} className={styles.crumbSep} aria-hidden />
                <span>{group.name}</span>
              </>
            ) : null}
          </nav>
          <h1 className={styles.title}>{title}</h1>
        </div>
      </div>
      <div className={styles.actions}>
        <span className={styles.date} data-tip="تاریخ امروز">
          <IconCalendarEvent size={17} stroke={1.7} />
          {todayText()}
        </span>
        <Bell />
        <BranchPicker />
        <span className={styles.divider} aria-hidden />
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<'password' | 'logoutAll' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const d = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', d);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', d);
      document.removeEventListener('keydown', k);
    };
  }, [open]);
  if (!user) return null;
  const name = user.username ?? user.phone_number;
  const role = USER_TYPE_LABEL[user.user_type] ?? user.user_type;
  return (
    <div className={styles.userWrap} ref={ref}>
      <button type="button" className={styles.user} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="حساب کاربری">
        <span className={styles.avatarRing}><Avatar seed={user.id} name={name} size={34} /></span>
        <span className={styles.userText}>
          <span className={`${styles.userName} ltr`}>{name}</span>
          <span className={styles.userRole}>{role}</span>
        </span>
        <IconChevronDown size={15} className={styles.userChev} />
      </button>
      {open ? (
        <div className={styles.userMenu} role="menu">
          <div className={styles.userMenuHead}>
            <Avatar seed={user.id} name={name} size={40} />
            <span className={styles.userText}>
              <span className={`${styles.userName} ltr`}>{name}</span>
              <span className={styles.userRole}>{role}</span>
            </span>
          </div>
          <button type="button" role="menuitem" className={`${styles.userMenuItem} ${styles.userMenuPlain}`} onClick={() => { setOpen(false); navigate('/account/profile'); }}>
            <IconUserCircle size={17} />پروفایل من
          </button>
          <button type="button" role="menuitem" className={`${styles.userMenuItem} ${styles.userMenuPlain}`} onClick={() => { setOpen(false); setModal('password'); }}>
            <IconKey size={17} />تغییر رمز عبور
          </button>
          <button type="button" role="menuitem" className={`${styles.userMenuItem} ${styles.userMenuPlain}`} onClick={() => { setOpen(false); setModal('logoutAll'); }}>
            <IconDevicesOff size={17} />خروج از همه‌ی دستگاه‌ها
          </button>
          <span className={styles.userMenuSep} aria-hidden />
          <button
            type="button"
            role="menuitem"
            className={styles.userMenuItem}
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <IconLogout size={17} />خروج از حساب
          </button>
        </div>
      ) : null}
      {modal === 'password' ? <ChangePasswordModal onClose={() => setModal(null)} /> : null}
      {modal === 'logoutAll' ? <LogoutAllModal onClose={() => setModal(null)} /> : null}
    </div>
  );
}
