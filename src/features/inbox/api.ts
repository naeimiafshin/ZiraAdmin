import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';

/** اعلان‌های خودِ کاربر (زنگوله‌ی هدر) — `/auth/me/notifications*`؛ راهنما: FrontGuidance/NOTIFICATION_SSE_SUMMARY_FOR_ARIAN.md */
export type Delivery = AdminSchemas['NotificationDeliveryOut'];
export type Preference = AdminSchemas['NotificationPreferenceOut'];
export const INBOX_KEY = ['inbox'] as const;
export const isUnread = (d: Delivery) => d.status !== 'SEEN' && d.status !== 'DISMISSED';

export const useInbox = (enabled: boolean) =>
  useQuery({
    queryKey: [...INBOX_KEY, 'list'],
    queryFn: ({ signal }) => adminApi<Paginated<Delivery>>('/auth/me/notifications', { query: { page: 1, page_size: 50 }, signal }),
    enabled,
  });

export const markSeen = (ids: string[]) => adminApi('/auth/me/notifications/seen', { method: 'POST', body: { delivery_ids: ids } });
export const dismiss = (ids: string[]) => adminApi('/auth/me/notifications/dismiss', { method: 'POST', body: { delivery_ids: ids } });
export const fetchUnread = (signal?: AbortSignal) => adminApi<AdminSchemas['UnreadCountResponse']>('/auth/me/notifications/unread-count', { signal }).then((r) => r.count);

export const usePreferences = (enabled: boolean) =>
  useQuery({
    queryKey: [...INBOX_KEY, 'prefs'],
    queryFn: ({ signal }) => adminApi<Paginated<Preference>>('/auth/me/notifications/preferences', { query: { page: 1, page_size: 100 }, signal }).then((r) => r.results),
    enabled,
  });
export const savePreferences = (items: AdminSchemas['NotificationPreferenceItemIn'][]) =>
  adminApi<Preference[]>('/auth/me/notifications/preferences', { method: 'PUT', body: items });
