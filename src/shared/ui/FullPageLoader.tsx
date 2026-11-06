import { BrandMark } from './BrandMark';
import { Spinner } from './Spinner';
import styles from './FullPageLoader.module.css';

export function FullPageLoader() {
  return (
    <div className={styles.page}>
      <BrandMark size={88} />
      <span className={styles.text}><Spinner size={14} /> در حال بررسی نشست…</span>
    </div>
  );
}
