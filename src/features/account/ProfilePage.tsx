import { useState, type ReactNode } from 'react';
import { IconBell, IconDevicesOff, IconEdit, IconKey } from '@tabler/icons-react';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { fullName } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useBranchOptions } from '@/shared/layout/useBranches';
import { Button } from '@/shared/ui/Button';
import { Avatar, Badge, Card, Chip, ErrorBox, InfoBanner, KeyValue, PageHead, SectionTitle, SkeletonRows, UnderlineTabs } from '@/shared/ui/kit';
import { SoonTag } from '@/features/branches/SoonTag';
import { PrefsModal } from '@/features/inbox/Bell';
import { useAllRoles, useUser } from '@/features/users/api';
import { USER_TYPE } from '@/features/users/labels';
import { AccountSection, BankSection, ContactSection, DocsSection, IdentitySection, JobSection } from '@/features/users/userTabs';
import u from '@/features/users/users.module.css';
import { ChangePasswordModal, LogoutAllModal } from './AccountModals';
import s from './account.module.css';

type Tab = 'identity' | 'contact' | 'bank' | 'job' | 'docs' | 'security';
// همان ۶ تب فرم و صفحه‌ی کاربر (قانون افشین 2026-10-20)
const TABS: { value: Tab; label: string }[] = [
  { value: 'identity', label: 'اطلاعات هویتی' },
  { value: 'contact', label: 'آدرس و تماس' },
  { value: 'bank', label: 'اطلاعات بانکی' },
  { value: 'job', label: 'اطلاعات شغلی' },
  { value: 'docs', label: 'مدارک' },
  { value: 'security', label: 'امنیت و نقش' },
];
const EDIT_SOON = 'ویرایش پروفایل توسط خود کاربر هنوز در بک‌اند نیست';
const VIEW_SOON = 'نمایش کامل پروفایل خودتان هنوز در بک‌اند نیست';
type Modal = 'password' | 'logoutAll' | 'prefs' | null;

/**
 * پروفایل من (2026-10-27، تصمیم افشین: «فعلاً فقط نمایش»).
 * بک‌اند برای کارمند فقط GET /auth/me (بدون نام و اطلاعات پرونده) و تغییر رمز، خروج از همه‌ی دستگاه‌ها و تنظیمات اعلان دارد.
 * پرونده‌ی کامل فقط با مجوز identity.users.read از GET /auth/users/{id} خوانده می‌شود؛ ویرایش همه‌ی بخش‌ها «به‌زودی» است.
 * کمبودها: docs/IDENTITY_BACKEND_GAPS.md
 */
export default function ProfilePage() {
  const { user } = useAuth();
  const can = usePerm();
  const back = useBack('/');
  const [tab, setTab] = useState<Tab>('identity');
  const [modal, setModal] = useState<Modal>(null);
  const canReadFull = can('identity.users.read');
  const full = useUser(canReadFull ? user?.id : undefined);
  const roles = useAllRoles(can('rbac.roles.list'));
  const { data: branches } = useBranchOptions();
  if (!user) return null;

  const d = full.data;
  const name = d ? fullName(d) : user.username ?? user.phone_number;
  const type = USER_TYPE[user.user_type];
  const branchName = branches?.find((b) => b.id === user.work_branch_id)?.name;
  const roleNames = (d?.roles ?? []).map((code) => roles.data?.find((r) => r.code === code)?.name ?? code);
  const editBtn = (
    <Button variant="secondary" size="sm" icon={<IconEdit size={15} />} disabled data-tip={EDIT_SOON}>
      ویرایش <SoonTag tip={EDIT_SOON} />
    </Button>
  );

  /** بدون مجوز دیدن پرونده: فقط آنچه /auth/me می‌دهد، بقیه «به‌زودی». */
  const limited = (
    <Card>
      <SectionTitle extra={<SoonTag tip={VIEW_SOON} />}>{TABS.find((t) => t.value === tab)?.label}</SectionTitle>
      <InfoBanner>نمایش این بخش از پرونده‌ی خودتان هنوز در بک‌اند نیست و به‌زودی اضافه می‌شود. اطلاعاتی که الان در دسترس است در بخش «امنیت و نقش» آمده است.</InfoBanner>
    </Card>
  );

  const section = () => {
    if (tab === 'security') return null;
    if (!canReadFull) return limited;
    if (full.isLoading) return <SkeletonRows rows={4} height={70} />;
    if (full.error || !d) return <ErrorBox error={full.error} onRetry={() => full.refetch()} />;
    const map: Record<Exclude<Tab, 'security'>, ReactNode> = {
      identity: <IdentitySection u={d} />,
      contact: <ContactSection u={d} />,
      bank: <BankSection u={d} />,
      job: <JobSection u={d} />,
      docs: <DocsSection u={d} readOnly />,
    };
    return map[tab];
  };

  return (
    <>
      <PageHead back={back} title="پروفایل من" sub="اطلاعات حساب و پرونده‌ی شما. ویرایش اطلاعات پرونده به‌زودی از همین صفحه ممکن می‌شود." actions={editBtn} />
      <Card className={u.heroCard}>
        <div className={u.hero}>
          <Avatar seed={user.id} name={name} size={64} />
          <div>
            <div className={u.heroName}>
              <h2 className={d ? undefined : 'ltr'}>{name}</h2>
              {type ? <Badge tone={type.tone}>{type.label}</Badge> : null}
              {user.is_branch_master ? <Badge tone="info">Branch Master</Badge> : null}
            </div>
            <div className={u.heroMeta}>
              {d ? <span>کد پرسنلی: <b className="ltr">{d.personnel_code ?? '—'}</b></span> : null}
              {d ? <span>نقش: <b>{roleNames.length ? roleNames.join('، ') : 'بدون نقش'}</b></span> : null}
              {d?.job_title ? <span>{d.job_title}</span> : null}
              <span>شعبه‌ی محل کار: <b>{user.all_branches ? 'همه‌ی شعب' : branchName ?? (user.work_branch_id ? 'شعبه‌ی شما' : 'ندارد')}</b></span>
            </div>
          </div>
        </div>
      </Card>

      <div className={s.tabs}>
        <UnderlineTabs value={tab} onChange={setTab} options={TABS} />
      </div>

      <div className={`${u.stack} ${s.body}`} data-profile-tab={tab}>
        {section()}
        {tab === 'security' ? (
          <>
            {d ? <AccountSection u={d} /> : (
              <Card>
                <SectionTitle>حساب ورود</SectionTitle>
                <div className={u.kvGrid}>
                  <KeyValue label="موبایل ورود">{user.phone_number}</KeyValue>
                  <KeyValue label="نام کاربری" ltr>{user.username}</KeyValue>
                  <KeyValue label="ایمیل" ltr>{user.email}</KeyValue>
                  <KeyValue label="نوع کاربر">{type?.label ?? user.user_type}</KeyValue>
                </div>
              </Card>
            )}
            <Card>
              <SectionTitle>دپارتمان‌ها و دسترسی</SectionTitle>
              <div className={u.kvGrid}>
                <KeyValue label="دپارتمان‌ها">
                  {user.departments.length ? <span className={s.chips}>{user.departments.map((x) => <Chip key={x.id}>{x.name}</Chip>)}</span> : null}
                </KeyValue>
                <KeyValue label="تعداد مجوزهای شما">{user.is_superuser ? 'همه (مدیر ارشد سامانه)' : user.permission_codes.length.toLocaleString('fa-IR')}</KeyValue>
              </div>
            </Card>
            <Card>
              <SectionTitle>امنیت حساب</SectionTitle>
              <div className={s.actions}>
                <div className={s.actionRow}>
                  <div><div className={u.strong}>رمز عبور</div><div className={u.sub}>رمز فعلی را وارد کنید و رمز تازه بگذارید. بعد از تغییر، همه‌ی نشست‌ها بسته می‌شوند.</div></div>
                  <Button variant="secondary" icon={<IconKey size={16} />} onClick={() => setModal('password')}>تغییر رمز عبور</Button>
                </div>
                <div className={s.actionRow}>
                  <div><div className={u.strong}>اعلان‌ها</div><div className={u.sub}>برای هر موضوع تعیین کنید اعلان در پنل بیاید و پیامک فرستاده شود یا نه.</div></div>
                  <Button variant="secondary" icon={<IconBell size={16} />} onClick={() => setModal('prefs')}>تنظیمات اعلان‌ها</Button>
                </div>
                <div className={s.actionRow}>
                  <div><div className={u.strong}>نشست‌ها</div><div className={u.sub}>اگر فکر می‌کنید کسی دیگر وارد حساب شما شده، از همه‌ی دستگاه‌ها خارج شوید.</div></div>
                  <Button variant="danger" icon={<IconDevicesOff size={16} />} onClick={() => setModal('logoutAll')}>خروج از همه‌ی دستگاه‌ها</Button>
                </div>
              </div>
            </Card>
          </>
        ) : null}
      </div>
      {modal === 'password' ? <ChangePasswordModal onClose={() => setModal(null)} /> : null}
      {modal === 'logoutAll' ? <LogoutAllModal onClose={() => setModal(null)} /> : null}
      {modal === 'prefs' ? <PrefsModal onClose={() => setModal(null)} /> : null}
    </>
  );
}
