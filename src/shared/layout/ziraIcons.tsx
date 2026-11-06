import type { ReactNode } from 'react';
import type { IconProps } from '@tabler/icons-react';

/**
 * آیکون‌های اختصاصی منوی اصلی، طرح «زیره» (انتخاب افشین 2026-11-04).
 * شبکه‌ی ۲۴ و خط هم‌وزن Tabler تا کنار بقیه‌ی آیکون‌ها یکدست بماند؛ دانه‌ی زیره رنگ جدا دارد:
 * var(--nav-seed) و در نبودش var(--brand). منوی فعال، کاشی ماژول و منوی خاموش این متغیر را عوض می‌کنند.
 * امضا مثل آیکون‌های Tabler است (size، stroke، className) تا در navConfig جای آن‌ها بنشیند.
 */
const SEED = { fill: 'var(--nav-seed, var(--brand))', stroke: 'none' } as const;

function Base({ size = 24, stroke = 2, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export const ZiraCustomers = (p: IconProps) => <Base {...p}><circle cx="9.5" cy="8.3" r="3.1"/><path d="M3.8 19.5c0-3.4 2.6-5.8 5.7-5.8s5.7 2.4 5.7 5.8"/><path d="M15.4 5.4a3 3 0 0 1 0 5.8M17.6 14c1.7.7 2.8 2.6 2.8 5"/><path {...SEED} transform="translate(19.4 4.6) rotate(35)" d="M0 -2.03C1.26 -0.9135 1.26 0.9135 0 2.03C-1.26 0.9135 -1.26 -0.9135 0 -2.03Z"/></Base>;

export const ZiraCatalog = (p: IconProps) => <Base {...p}><path d="M12 6.3v-.8c0-.7.6-1.2 1.3-1.2a1.5 1.5 0 1 0-1.5-1.6"/><path d="M12 6.3L3.6 9.8h16.8z"/><path d="M6.4 9.8v2.6M17.6 9.8v2.6"/><path d="M6.4 12.4c-1.6 3.2-.2 6.6 2.7 6.6 1.7 0 2.9-1.3 2.9-3 0 1.7 1.2 3 2.9 3 2.9 0 4.3-3.4 2.7-6.6-2.3.1-4.5 1.3-5.6 3.6-1.1-2.3-3.3-3.5-5.6-3.6z"/><path {...SEED} transform="translate(12 17.3) rotate(90)" d="M0 -1.74C1.08 -0.783 1.08 0.783 0 1.74C-1.08 0.783 -1.08 -0.783 0 -1.74Z"/></Base>;

export const ZiraContent = (p: IconProps) => <Base {...p}><path d="M6.5 4.5h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z"/><path d="M3.7 16.3l4.6-4.6 3.9 3.9 2.3-2.3 5.6 5.4"/><path {...SEED} transform="translate(15.6 8.9) rotate(45)" d="M0 -2.755C1.71 -1.23975 1.71 1.23975 0 2.755C-1.71 1.23975 -1.71 -1.23975 0 -2.755Z"/></Base>;

export const ZiraWarehouse = (p: IconProps) => <Base {...p}><path d="M3 9.6L12 4l9 5.6"/><path d="M5 8.4V20h14V8.4"/><path d="M8.2 15.6h3.7V20H8.2zM12.1 15.6h3.7V20h-3.7zM10.15 11.2h3.7v4.4h-3.7z"/><path {...SEED} transform="translate(12 7.5) rotate(90)" d="M0 -2.03C1.26 -0.9135 1.26 0.9135 0 2.03C-1.26 0.9135 -1.26 -0.9135 0 -2.03Z"/></Base>;

export const ZiraBranches = (p: IconProps) => <Base {...p}><path d="M3.5 9l1.6-4.5h13.8L20.5 9"/><path d="M3.5 9a2.12 2.12 0 0 0 4.25 0 2.12 2.12 0 0 0 4.25 0 2.12 2.12 0 0 0 4.25 0 2.12 2.12 0 0 0 4.25 0"/><path d="M5 11.3V20h14v-8.7"/><path d="M10 20v-4.2h4V20"/><path d="M2.8 20h18.4"/><path {...SEED} transform="translate(12 13.1) rotate(90)" d="M0 -2.03C1.26 -0.9135 1.26 0.9135 0 2.03C-1.26 0.9135 -1.26 -0.9135 0 -2.03Z"/></Base>;

export const ZiraSales = (p: IconProps) => <Base {...p}><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M8.6 13.6l2.3-2.4 2 1.8 2.1-2.4"/><path d="M8.6 16.4h6.8"/><path {...SEED} transform="translate(15.9 8.9) rotate(45)" d="M0 -2.32C1.4400000000000002 -1.044 1.4400000000000002 1.044 0 2.32C-1.4400000000000002 1.044 -1.4400000000000002 -1.044 0 -2.32Z"/></Base>;

export const ZiraUsers = (p: IconProps) => <Base {...p}><path d="M12 3.5l7 2.6v5.2c0 4.4-3 7.7-7 9.2-4-1.5-7-4.8-7-9.2V6.1z"/><circle cx="12" cy="10.6" r="2.2"/><path d="M8.4 16.5c.6-1.9 2-3 3.6-3s3 1.1 3.6 3"/><path {...SEED} transform="translate(12 6.2) rotate(90)" d="M0 -1.45C0.9 -0.6525 0.9 0.6525 0 1.45C-0.9 0.6525 -0.9 -0.6525 0 -1.45Z"/></Base>;

export const ZiraSupport = (p: IconProps) => <Base {...p}><path d="M4.6 13v-1.6a7.4 7.4 0 0 1 14.8 0V13"/><path d="M5 12.5h.6a1.4 1.4 0 0 1 1.4 1.4v2.2a1.4 1.4 0 0 1-1.4 1.4H5a1.5 1.5 0 0 1-1.5-1.5v-2a1.5 1.5 0 0 1 1.5-1.5zM18.4 12.5h.6a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-.6a1.4 1.4 0 0 1-1.4-1.4v-2.2a1.4 1.4 0 0 1 1.4-1.4z"/><path d="M19 17.5c0 1.8-1.5 3-3.4 3h-1.2"/><path {...SEED} transform="translate(12.6 20.5) rotate(90)" d="M0 -2.175C1.35 -0.9787499999999999 1.35 0.9787499999999999 0 2.175C-1.35 0.9787499999999999 -1.35 -0.9787499999999999 0 -2.175Z"/></Base>;

export const ZiraReports = (p: IconProps) => <Base {...p}><path d="M4 4v16h16"/><path d="M7.6 13.2h2.4v4.3H7.6zM11.6 10.2h2.4v7.3h-2.4zM15.6 7.6H18v9.9h-2.4z"/><path {...SEED} transform="translate(8.8 9.8) rotate(30)" d="M0 -2.175C1.35 -0.9787499999999999 1.35 0.9787499999999999 0 2.175C-1.35 0.9787499999999999 -1.35 -0.9787499999999999 0 -2.175Z"/></Base>;
