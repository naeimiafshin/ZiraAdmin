import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconDownload } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/toast';
import { downloadXlsx } from '@/features/catalog/api';
import m from './marketing.module.css';

/** ابزار مشترک صفحه‌های بازاریابی */
export const digits = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');
export const decimal = (v: string) => toLatinDigits(v).replace(/[^0-9.]/g, '');
export const showValue = (v: string) => toFaDigits(v).replace(/,/g, '٬');

/** دکمه‌های فیلتر html (معتبر / منقضی شده / پیش‌نویس) — تک‌انتخابی، دوباره زدن ⇐ برداشتن */
export function StateChips({ value, onChange, options }: { value: string; onChange: (v: string | null) => void; options: { value: string; label: string }[] }) {
  return <div className={m.chipsF}>{options.map((o) => <button key={o.value} type="button" className={m.chipF} aria-pressed={value === o.value} onClick={() => onChange(value === o.value ? null : o.value)}>{o.label}</button>)}</div>;
}

/** دکمه‌ی خروجی اکسل کدها (مجوز pricing.coupons.export) */
export function CouponExport({ query }: { query: Record<string, string | boolean | undefined> }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  return <Button variant="secondary" icon={<IconDownload size={17} />} loading={busy} onClick={async () => { setBusy(true); try { await downloadXlsx('/pricing/coupons/export', query, 'coupons.xlsx'); } catch (e) { toast(userMessage(e), 'error'); } finally { setBusy(false); } }}>خروجی اکسل</Button>;
}
export const useGoNewCoupon = () => { const navigate = useNavigate(); return () => navigate('/pricing/discounts/coupons/new'); };
