import s from './branches.module.css';

/** برچسب «به‌زودی» برای داده‌های وابسته به دامنه‌های فروش و خزانه‌داری که در این فاز نیستند (افشین 2026-10-24) */
export const FIN_SOON = 'به‌زودی — بعد از ساخت دامنه‌های فروش و خزانه‌داری (خارج از این فاز)';
export const SoonTag = ({ tip = FIN_SOON }: { tip?: string }) => <span className={s.soonTag} data-tip={tip}>به‌زودی</span>;
