import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useBack } from '@/shared/lib/useBack';
import { IconEdit } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, fullName } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Avatar, Badge, Card, Empty, ErrorBox, PageHead, SectionTitle, SkeletonRows, UnderlineTabs } from '@/shared/ui/kit';
import { useAllRoles, useUser, useUserActivity } from './api';
import { USER_STATUS, USER_TYPE } from './labels';
import { AccountSection, BankSection, ContactSection, DepartmentsTab, DocsSection, IdentitySection, JobSection, RoleTab, SecurityTab, SessionsTab } from './userTabs';
import { BranchMasterSection } from './BranchMasterSection';
import s from './users.module.css';

type Tab = 'identity' | 'contact' | 'bank' | 'job' | 'docs' | 'security';

export default function UserDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const back = useBack('/identity/users');
  const can = usePerm();
  const [tab, setTab] = useState<Tab>('identity');
  const q = useUser(id);
  const activity = useUserActivity(id, can('events.activity_log.list'));
  const roles = useAllRoles(can('rbac.roles.list'));
  const roleName = (code: string) => roles.data?.find((r) => r.code === code)?.name ?? code;

  if (q.isLoading) return <SkeletonRows rows={5} height={90} />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const u = q.data;
  const st = USER_STATUS[u.status] ?? { label: u.status, tone: 'neutral' as const };
  const type = USER_TYPE[u.user_type];

  // تب‌ها و ترتیب فیلدها = فرم افزودن کاربر (قانون افشین 2026-10-20)
  const tabs: { value: Tab; label: string }[] = [
    { value: 'identity', label: 'اطلاعات هویتی' },
    { value: 'contact', label: 'آدرس و تماس' },
    { value: 'bank', label: 'اطلاعات بانکی' },
    { value: 'job', label: 'اطلاعات شغلی' },
    { value: 'docs', label: 'مدارک' },
    { value: 'security', label: 'امنیت و نقش' },
  ];


  return (
    <>
      <PageHead
        back={back}
        actions={can('identity.users.update') ? <Button icon={<IconEdit size={17} />} onClick={() => navigate(`/identity/users/${id}/edit`)}>ویرایش</Button> : null}
      />
      <Card className={s.heroCard}>
        <div className={s.hero}>
          <Avatar seed={u.id} name={fullName(u)} size={64} />
          <div>
            <div className={s.heroName}>
              <h2>{fullName(u)}</h2>
              <Badge tone={st.tone}>{st.label}</Badge>
              {type ? <Badge tone={type.tone}>{type.label}</Badge> : null}
            </div>
            <div className={s.heroMeta}>
              <span>کد پرسنلی: <b className="ltr">{u.personnel_code ?? '—'}</b></span>
              <span>نقش: <b>{u.roles?.length ? u.roles.map(roleName).join('، ') : 'بدون نقش'}</b></span>
              {u.job_title ? <span>{u.job_title}</span> : null}
              <span>آخرین ورود: {faDateTime(u.last_login_at)}</span>
            </div>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 18 }}>
        <UnderlineTabs value={tab} onChange={setTab} options={tabs} />
      </div>

      <div className={s.grid2}>
        <div className={s.stack}>
          {tab === 'identity' ? <IdentitySection u={u} /> : null}
          {tab === 'contact' ? <ContactSection u={u} /> : null}
          {tab === 'bank' ? <BankSection u={u} /> : null}
          {tab === 'job' ? <><JobSection u={u} />{can('identity.users.department.read') ? <DepartmentsTab userId={u.id} /> : null}</> : null}
          {tab === 'docs' ? <DocsSection u={u} /> : null}
          {tab === 'security' ? <><AccountSection u={u} />{can('rbac.roles.assignments.read') ? <RoleTab userId={u.id} /> : null}<SecurityTab u={u} /><BranchMasterSection u={u} /><SessionsTab userId={u.id} /></> : null}
        </div>
        <Card>
          <SectionTitle>آخرین فعالیت‌ها</SectionTitle>
          {!can('events.activity_log.list') ? (
            <Empty title="دسترسی به لاگ فعالیت ندارید" />
          ) : activity.isLoading ? (
            <SkeletonRows rows={4} height={44} />
          ) : activity.error ? (
            <ErrorBox error={activity.error} />
          ) : !activity.data?.results.length ? (
            <Empty title="فعالیتی ثبت نشده است" />
          ) : (
            <div className={s.feed}>
              {activity.data.results.map((a) => (
                <div key={a.id} className={s.feedItem}>
                  <span className={s.dot} style={{ background: a.result === 'SUCCESS' ? 'var(--success)' : a.result === 'DENIED' ? 'var(--warning)' : 'var(--danger)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div className={s.feedTitle}>{a.event_title}</div>
                    {/[\u0600-\u06FF]/.test(a.summary) ? <div className={s.feedText}>{a.summary}</div> : a.object_label ? <div className={s.feedText}>{a.object_label}</div> : null}
                  </div>
                  <span className={s.feedTime}>{faDate(a.occurred_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
