import { IconCash, IconChartBar, IconReceipt2, IconReportAnalytics, IconUsersGroup } from '@tabler/icons-react';
import { Card, PageHead } from '@/shared/ui/kit';
import { SoonTag } from './SoonTag';
import s from './branches.module.css';

const DEPS: { icon: typeof IconChartBar; title: string; text: string; module: string }[] = [
  { icon: IconChartBar, title: 'فروش و کارکرد شعب', text: 'فروش روزانه و ماهانه هر شعبه، مقایسه‌ی شعب، کالاهای پرفروش و گزارش کارکرد شعب.', module: 'ماژول فروش' },
  { icon: IconCash, title: 'صندوق و دریافت‌ها', text: 'گردش صندوق‌ها و دستگاه‌های POS، دریافت نقدی و کارتی و موجودی نقد هر شعبه.', module: 'ماژول خزانه‌داری' },
  { icon: IconReceipt2, title: 'سود و زیان شعبه', text: 'ارزش ریالی فروش، بهای تمام‌شده، هزینه‌ها و سود ناخالص هر شعبه در بازه‌ی انتخابی.', module: 'ماژول حسابداری' },
  { icon: IconUsersGroup, title: 'عملکرد کارکنان شعبه', text: 'فروش و عملکرد فروشندگان و صندوق‌داران هر شعبه.', module: 'ماژول‌های فروش و حقوق و دستمزد' },
];

/**
 * گزارش‌ها (افشین 2026-10-25): کل صفحه به‌زودی؛ گزارش‌های مدیریتی شعب به ماژول‌هایی وابسته‌اند که هنوز ساخته نشده‌اند.
 * گزارش موجودی و حرکت کالا همین حالا در «موجودی شعب و انبارها» و «گردش کالا» هست.
 */
export default function ReportsPage() {
  return (
    <>
      <PageHead title={<>گزارش‌ها <SoonTag tip="به‌زودی — بعد از ساخت ماژول‌های فروش، خزانه‌داری و حسابداری" /></>} sub="گزارش‌های مدیریتی شعب" />
      <Card className={s.soonPage}>
        <span className={s.soonPageIcon}><IconReportAnalytics size={30} stroke={1.5} /></span>
        <h3>گزارش‌های شعب به‌زودی</h3>
        <p>این گزارش‌ها از داده‌ی فروش، صندوق و حسابداری ساخته می‌شوند و بعد از توسعه‌ی آن ماژول‌ها همین‌جا فعال می‌شوند. گزارش موجودی و حرکت کالا همین حالا در «موجودی شعب و انبارها» و «گردش کالا» در دسترس است.</p>
        <div className={s.soonDeps}>
          {DEPS.map((d) => (
            <div key={d.title} className={s.soonDep}>
              <span className={s.resIcon}><d.icon size={20} /></span>
              <div><b>{d.title}</b><small>{d.text}</small><em>وابسته به: {d.module}</em></div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
