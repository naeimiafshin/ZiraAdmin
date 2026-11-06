import { useState } from 'react';
import { userMessage } from '@/shared/api/errors';
import { faNum, jalaliTextToGregorian } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Modal } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { usePriceListWrite } from './api';
import s from '@/features/catalog/catalog.module.css';

/** «لیست قیمت جدید» (POST /price-lists): نام + تاریخ اثر (خالی = امروز؛ آینده ⇐ با انتشار زمان‌بندی می‌شود) + ردیف‌های اختیاری */
export function NewListModal({ lines = [], onClose, onCreated }: { lines?: { item_id: string; new_price: string }[]; onClose: () => void; onCreated: (id: string) => void }) {
  const w = usePriceListWrite(); const toast = useToast();
  const [name, setName] = useState(''); const [date, setDate] = useState(''); const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr('نام لیست را وارد کنید.'); return; }
    const eff = date ? jalaliTextToGregorian(date) : null; if (date && !eff) { setErr('تاریخ اثر معتبر نیست.'); return; }
    try { const pl = await w.create.mutateAsync({ name: name.trim(), effective_from: eff, lines }); toast(`لیست قیمت «${pl.name}» با ${faNum(pl.line_count)} ردیف ساخته شد.`); onCreated(pl.id); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title="لیست قیمت جدید" width={520} footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={w.create.isPending}>ساخت لیست پیش‌نویس</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <Input label="نام لیست" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="مثال: بازنگری قیمت پاییز" />
        <JalaliDateInput label="تاریخ اثر" value={date} onChange={(e) => setDate(e.target.value)} placeholder="امروز" dir="ltr" maxYear={1500} hint="خالی = امروز؛ تاریخ آینده ⇐ انتشار زمان‌بندی می‌شود" />
      </FormGrid>
      <p className={s.sub} style={{ marginTop: 10 }}>{lines.length ? `${faNum(lines.length)} قیمت تغییرکرده به‌عنوان ردیف‌های لیست ثبت می‌شود.` : 'لیست خالی ساخته می‌شود؛ ردیف‌ها را در صفحه‌ی لیست اضافه کنید یا از اکسل وارد کنید.'} قیمت‌ها تا «انتشار» لیست تغییر نمی‌کنند.</p>
    </Modal>
  );
}
