import logoUrl from '@/shared/assets/brand/logo.svg';
import styles from './BrandMark.module.css';

/** لوگوی زیرا مارکت (Main_logo.svg، نسبت ۳۱×۲۷). همیشه روی زمینه‌ی روشن. */
export function BrandMark({ size = 40, tile = false }: { size?: number; tile?: boolean }) {
  const img = <img src={logoUrl} width={size} height={Math.round((size * 27) / 31)} alt="" aria-hidden className={styles.img} />;
  if (!tile) return img;
  return (
    <span className={styles.tile} style={{ width: size * 1.45, height: size * 1.45, borderRadius: size * 0.42 }}>
      {img}
    </span>
  );
}
