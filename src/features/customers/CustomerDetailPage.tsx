import { useParams, useSearchParams } from 'react-router';
import { useBack } from '@/shared/lib/useBack';
import { IconLock, IconUserOff } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { Badge, Card, ErrorBox, SkeletonRows, UnderlineTabs, PageHead } from '@/shared/ui/kit';
import { useCustomer } from './api';
import { ComingSoon, TierBadge } from './components';
import { COOPERATION, CUSTOMER_STATUS, CUSTOMER_TYPE } from './labels';
import { InfoTab } from './tabs/InfoTab';
import { CreditTab } from './tabs/CreditTab';
import { GroupMarketerTab } from './tabs/GroupMarketerTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import s from './customers.module.css';

type Tab = 'info' | 'credit' | 'group' | 'docs' | 'orders' | 'dash' | 'ledger';
const TABS: { value: Tab; label: string }[] = [
  { value: 'info', label: 'اطلاعات' },
  { value: 'credit', label: 'اعتبارات' },
  { value: 'group', label: 'گروه و بازاریاب' },
  { value: 'docs', label: 'مدارک' },
  { value: 'orders', label: 'تاریخچه سفارشات' },
  { value: 'dash', label: 'داشبورد' },
  { value: 'ledger', label: 'معین' },
];

/** پروفایل مشتری — تب‌ها مطابق html Fixed (+ گروه/بازاریاب و مدارک که بک‌اند دارد)؛ تب‌های بدون API «به‌زودی». */
export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const back = useBack('/customers/profiles');
  const can = usePerm();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.find((t) => t.value === sp.get('tab'))?.value ?? 'info') as Tab;
  const setTab = (t: Tab) => setSp(t === 'info' ? {} : { tab: t }, { replace: true });
  const q = useCustomer(id);

  if (q.isLoading) return <SkeletonRows rows={5} height={90} />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const fullName = [c.identity.first_name, c.identity.last_name].filter(Boolean).join(' ') || c.manager_name || c.store_name || '—';
  const st = CUSTOMER_STATUS[c.status] ?? { label: c.status_display, tone: 'neutral' as const };

  return (
    <>
      <PageHead back={back} />
      <Card className={s.heroCard}>
        <div className={s.hero}>
          <div className={s.heroMain}>
            <div className={s.heroName}>
              <h2>{fullName}</h2>
              <span className={`${s.heroCode} ltr`}>{c.code}</span>
              <TierBadge level={c.cooperation_level} />
              <Badge tone={st.tone}>{st.label}</Badge>
              {c.is_locked ? <Badge tone="danger"><IconLock size={12} />مسدود به دلایل مالی</Badge> : null}
              {c.is_blacklisted ? <Badge tone="danger"><IconUserOff size={12} />لیست سیاه</Badge> : null}
            </div>
            <div className={s.heroMeta}>
              <span>فروشگاه: <b>{c.store_name || '—'}</b></span>
              <span>نوع: <b>{CUSTOMER_TYPE[c.customer_type] ?? c.customer_type}</b></span>
              <span>موبایل: <b className="tnum">{c.identity.mobile ?? '—'}</b></span>
              {c.group_names.length ? <span>گروه: <b>{c.group_names.join('، ')}</b></span> : null}
              {c.effective_marketer ? <span>بازاریاب: <b>{c.effective_marketer.full_name || '—'}</b>{c.effective_marketer.percent ? <span className="tnum"> (٪{faNum(Number(c.effective_marketer.percent))}{c.effective_marketer.source === 'GROUP' ? '، از گروه' : ''})</span> : null}</span> : null}
            </div>
          </div>
          <div className={s.heroStats}>
            <div className={s.heroStat}><div className={s.heroStatValue}>{COOPERATION[c.cooperation_level]?.label ?? c.cooperation_level}</div><div className={s.heroStatLabel}>سطح همکاری · سطح {faNum(c.verification_level)} از ۳</div></div>
            <div className={s.heroStat}><div className={s.heroStatValue}>{faDate(c.approved_at ?? c.created_at)}</div><div className={s.heroStatLabel}>{c.approved_at ? 'تاریخ تأیید' : 'تاریخ ثبت'}</div></div>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 18 }}>
        <UnderlineTabs value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === 'info' ? <InfoTab c={c} /> : null}
      {tab === 'credit' ? (can('customers.profiles.credit_policy.read') ? <CreditTab c={c} /> : <Card><ComingSoon title="اعتبارات" text="برای دیدن حساب‌های اعتباری به مجوز «سیاست اعتباری مشتری» نیاز دارید." /></Card>) : null}
      {tab === 'group' ? <GroupMarketerTab c={c} /> : null}
      {tab === 'docs' ? <DocumentsTab customerId={c.id} /> : null}
      {tab === 'orders' ? <Card><ComingSoon title="تاریخچه سفارشات" text="سفارش‌ها، تاریخ تسویه و نحوه‌ی تسویه از ماژول فروش می‌آیند که هنوز ساخته نشده است." /></Card> : null}
      {tab === 'dash' ? <Card><ComingSoon title="داشبورد مشتری" text="امتیاز خوش‌حسابی، میانگین زمان پرداخت، وضعیت چک‌ها و مرجوعی از ماژول‌های فروش و حسابداری می‌آیند که هنوز ساخته نشده‌اند." /></Card> : null}
      {tab === 'ledger' ? <Card><ComingSoon title="معین مشتری" text="دفتر معین (عادی، تجمیعی ماهانه، به تفصیل فاکتور) و مانده‌ی اعتبار از ماژول حسابداری می‌آید که هنوز ساخته نشده است." /></Card> : null}
    </>
  );
}
