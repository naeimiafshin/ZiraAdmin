import lockupUrl from '@/shared/assets/brand/logo-lockup.svg';

/**
 * لوگو + نوشته‌ی «زیرا مارکت» (Second_Logo.svg، نسبت ۱۹۲×۴۰).
 * قاعده: هر جا لوگو و نام کنار هم می‌آیند همین؛ فقط نشان ⇐ BrandMark.
 */
export function BrandLockup({ height = 40 }: { height?: number }) {
  return <img src={lockupUrl} height={height} width={Math.round((height * 192) / 40)} alt="زیرا مارکت" style={{ display: 'block', flex: 'none' }} />;
}
