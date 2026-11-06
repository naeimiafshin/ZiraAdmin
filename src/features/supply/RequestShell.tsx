import { useEffect, type ReactNode } from 'react';
import { Badge, ErrorBox, Modal, SkeletonRows } from '@/shared/ui/kit';
import { LIFECYCLE_TONE } from './labels';
import { useRequest, type SupplyRequest } from './requestsApi';
import s from './supply.module.css';

/** قاب مشترک مودال‌های ستون‌های فهرست درخواست‌های تأمین: جزئیات تازه‌ی درخواست + نشان مرحله */
const WIDTH = 640;

export function Shell({ id, title, onClose, width = WIDTH, children }: { id: string; title: string; onClose: () => void; width?: number; children: (r: SupplyRequest) => ReactNode }) {
  const q = useRequest(id);
  // داده‌ی تازه در هر باز شدن: مرحله ممکن است بیرون از این صفحه عوض شده باشد (واریز مشتری، تصمیم دیگران)
  const { refetch } = q;
  useEffect(() => { void refetch(); }, [refetch]);
  return (
    <Modal open onClose={onClose} width={width} title={q.data ? `${title} — ${q.data.request_no}` : title}>
      {q.isLoading ? <SkeletonRows rows={4} /> : null}
      {q.error ? <ErrorBox error={q.error} onRetry={() => { void q.refetch(); }} /> : null}
      {q.data ? (
        <div className={s.stack}>
          <div className={s.badges}><Badge tone={LIFECYCLE_TONE[q.data.lifecycle] ?? 'neutral'}>{q.data.lifecycle_display}</Badge></div>
          {children(q.data)}
        </div>
      ) : null}
    </Modal>
  );
}

