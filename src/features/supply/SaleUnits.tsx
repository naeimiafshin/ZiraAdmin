import { useState } from 'react';
import { faNum } from '@/shared/lib/format';
import { Modal } from '@/shared/ui/kit';
import type { AdminSchemas } from '@/shared/api/types';
import { int } from './requestsApi';
import s from './supply.module.css';

/**
 * ستون «واحد فروش» کالا در اسناد و گزارش‌های خرید (S-20 رفع شد، ۱۴ آبان ۱۴۰۵).
 * خرید و انبار بر اساس «کالا» است و فروش بر اساس «آیتم» (بسته‌ای از همین کالا). بک‌اند در خروجی هر کالا
 * `sale_unit_count` و `sale_units` (آیتم‌های فعالی که این کالا را دارند) را می‌دهد؛ درخواست جدا لازم نیست.
 * تصمیم افشین: فهرست داخل جدول چیده نمی‌شود؛ یک نشان کوچک با عدد که با کلیک مودال باز می‌کند. شمارنده‌ی صفر ⇐ «—».
 */
type SupplyItem = AdminSchemas['SupplyItemOut'];
const WIDTH = 520;

export function SaleUnits({ item }: { item: SupplyItem | null | undefined }) {
  const [open, setOpen] = useState(false);
  const count = item?.sale_unit_count ?? 0;
  if (!item || count === 0) return <span className={s.muted}>—</span>;
  const rows = item.sale_units ?? [];
  return (
    <>
      <button type="button" className={s.saleBadge} aria-haspopup="dialog" aria-label={`واحدهای فروش ${item.display_name}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        {faNum(count)} واحد
      </button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} width={WIDTH} title={`واحدهای فروش ${item.display_name}`}>
          <p className={s.modalIntro}>آیتم‌های فروشی فعالی که این کالا در آن‌هاست. عدد، تعداد همین کالا در یک آیتم است.</p>
          <ul className={s.saleList}>
            {rows.map((u) => (
              <li key={u.item_id}>
                <b>{u.unit_name || u.display_name}</b>
                <span> — {faNum(int(u.quantity))} {item.unit_name}</span>
                <span className={s.muted}> (<span data-latin>{u.code}</span>)</span>
                {u.unit_name ? <small className={s.muted}>{u.display_name}</small> : null}
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
    </>
  );
}
