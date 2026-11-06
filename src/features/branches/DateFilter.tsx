import { useEffect, useState } from 'react';
import { gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import s from './branches.module.css';

/** فیلتر تاریخ جدول: ورودی شمسی، مقدار میلادی (YYYY-MM-DD) در URL؛ تا تاریخ کامل و معتبر نشده چیزی فرستاده نمی‌شود */
export function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (gregorian: string) => void }) {
  const [txt, setTxt] = useState(value ? gregorianToJalaliText(value) : '');
  useEffect(() => { if (!value) setTxt(''); else if (jalaliTextToGregorian(txt) !== value) setTxt(gregorianToJalaliText(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={s.dateFilter}>
      <JalaliDateInput label="" aria-label={label} placeholder={label} dir="ltr" maxYear={1500} value={txt}
        onChange={(e) => { const v = e.target.value; setTxt(v); if (!v.trim()) onChange(''); else { const g = jalaliTextToGregorian(v); if (g) onChange(g); } }} />
    </div>
  );
}
