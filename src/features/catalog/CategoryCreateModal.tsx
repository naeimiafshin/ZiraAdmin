import { useState } from 'react';
import { userMessage } from '@/shared/api/errors';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select } from '@/shared/ui/form';
import { Modal, Segmented } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useCategoryWrite, type CategoryNode } from './api';
import { CATEGORY_LEVEL } from './labels';
import s from './catalog.module.css';

type Level = '1' | '2' | '3';
/** مسیر دسته‌ی ساخته‌شده تا فرم صدازننده هر سه کشو را پر کند */
export type CreatedCategory = { id: string; name: string; level: 1 | 2 | 3; mainId: string; midId: string };

/**
 * مودال «دسته‌بندی جدید» (افشین 2026-11-04، از تعریف ماتریسی کالا): همان قواعد کادر «ایجاد دسته‌بندی جدید» صفحه‌ی دسته‌ها —
 * سطح (اصلی/میانی/فرعی)، والد(ها)، نام، کد اختیاری (حروف بزرگ لاتین، رقم، خط تیره، زیرخط) ⇐ POST /catalog/categories.
 * پیش‌فرض سطح ۳ با والدهای انتخاب‌شده در فرم صدازننده (کالا فقط به دسته‌ی فرعی وصل می‌شود). بستن، انصراف یا ذخیره فقط مودال را می‌بندد
 * و داده‌های فرم زیرین دست نمی‌خورد؛ درخت دسته‌ها بعد از ساخت خودکار تازه می‌شود.
 */
export function CategoryCreateModal({ mains, preMain, preMid, onClose, onCreated }: {
  mains: CategoryNode[]; preMain?: string; preMid?: string; onClose: () => void; onCreated: (c: CreatedCategory) => void;
}) {
  const w = useCategoryWrite();
  const toast = useToast();
  const activeMains = mains.filter((n) => n.is_active);
  const [level, setLevel] = useState<Level>('3');
  const [mainId, setMainId] = useState(preMain && activeMains.some((n) => n.id === preMain) ? preMain : '');
  const midsOf = (id: string) => (activeMains.find((n) => n.id === id)?.children ?? []).filter((n) => n.is_active);
  const [midId, setMidId] = useState(preMid && midsOf(mainId).some((n) => n.id === preMid) ? preMid : '');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const parentId = level === '1' ? null : level === '2' ? mainId : midId;
  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr('نام دسته را وارد کنید.'); return; }
    if (level !== '1' && !parentId) { setErr(level === '2' ? 'دسته‌ی اصلی والد را انتخاب کنید.' : 'دسته‌ی اصلی و میانی والد را انتخاب کنید.'); return; }
    const c = code.trim().toUpperCase();
    if (c && !/^[A-Z0-9_-]+$/.test(c)) { setErr('کد فقط حروف بزرگ لاتین، رقم، خط تیره و زیرخط.'); return; }
    try {
      const r = await w.create.mutateAsync({ name: name.trim(), parent_id: parentId, code: c || null, sort_order: 0, is_visible: true, description: '' });
      toast(`${CATEGORY_LEVEL[Number(level) - 1]} «${name.trim()}» ساخته شد.`);
      onCreated({ id: r.id, name: name.trim(), level: Number(level) as 1 | 2 | 3, mainId: level === '1' ? r.id : mainId, midId: level === '3' ? midId : level === '2' ? r.id : '' });
    } catch (e) { setErr(userMessage(e)); }
  };
  const ph = ['مثال: لباس زیر زنانه', 'مثال: شورت و تانگا', 'مثال: شورت زنانه'][Number(level) - 1];
  return (
    <Modal open onClose={onClose} title="دسته‌بندی جدید" width={560}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={w.create.isPending}>ایجاد دسته</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={s.segRow} style={{ marginBottom: 14 }}><span className={s.segLabel}>سطح دسته <span style={{ color: 'var(--danger)' }}>*</span></span>
        <Segmented value={level} onChange={(v) => { setLevel(v); setErr(null); }} options={CATEGORY_LEVEL.map((l, i) => ({ value: String(i + 1) as Level, label: l }))} /></div>
      <FormGrid cols={2}>
        {level !== '1' ? <Select label="دسته‌ی اصلی" required value={mainId} onChange={(e) => { setMainId(e.target.value); setMidId(''); }} placeholder="انتخاب دسته‌ی اصلی" options={activeMains.map((n) => ({ value: n.id, label: n.name }))} /> : null}
        {level === '3' ? <Select label="دسته‌ی میانی" required value={midId} onChange={(e) => setMidId(e.target.value)} placeholder={mainId ? 'انتخاب دسته‌ی میانی' : 'ابتدا دسته‌ی اصلی'} disabled={!mainId} options={midsOf(mainId).map((n) => ({ value: n.id, label: n.name }))} /> : null}
        <Input label="نام دسته" required value={name} onChange={(e) => setName(e.target.value)} placeholder={ph} maxLength={100} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <Input label="کد (اختیاری)" latin value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WOMEN-UNDER" dir="ltr" maxLength={20} />
      </FormGrid>
    </Modal>
  );
}
