import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { fetchAll } from '@/features/users/api';

/** رخدادها — دامنه‌ی events (`/api/v1/admin/events/...`): لاگ فعالیت‌ها و کاتالوگ رخدادها. */
export type ActivityLog = AdminSchemas['ActivityLogListOut'];
export type ActivityLogDetail = AdminSchemas['ActivityLogDetailOut'];
export type ActivityChange = AdminSchemas['ActivityLogChangeOut'];
export type EventType = AdminSchemas['EventTypeOut'];

const key = ['events', 'activity'] as const;
export type LogQuery = Record<string, string | number | undefined>;

export const useActivityLogs = (q: LogQuery) =>
  useQuery({
    queryKey: [...key, 'list', q],
    queryFn: ({ signal }) => adminApi<Paginated<ActivityLog>>('/events/activity-log', { query: q, signal }),
    placeholderData: keepPreviousData,
  });

/** شمار هر حالت کارت‌های بالا (هم‌پای جست‌وجو و فیلترها، بدون فیلتر نتیجه): هر کدام یک درخواست page_size=1. بک‌اند endpoint آمار ندارد (E-06). */
export const useActivityCounts = (base: LogQuery, results: string[]) =>
  useQueries({
    queries: ['', ...results].map((r) => ({
      queryKey: [...key, 'count', base, r],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        adminApi<Paginated<ActivityLog>>('/events/activity-log', { query: { ...base, result: r || undefined, page: 1, page_size: 1 }, signal }).then((x) => x.total),
      staleTime: 30_000,
    })),
  });

export const useActivityDetail = (id: string) =>
  useQuery({ queryKey: [...key, 'one', id], queryFn: ({ signal }) => adminApi<ActivityLogDetail>(`/events/activity-log/${id}`, { signal }) });

/** تغییر فیلدها (مقدار قبلی ⇐ جدید)، فقط با `events.activity_log.detail.read`. */
export const useActivityChanges = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...key, 'changes', id], queryFn: () => fetchAll<ActivityChange>(`/events/activity-log/${id}/changes`), enabled });

/** همه‌ی انواع رخداد (برای گزینه‌های فیلتر دامنه و رخداد؛ ~۴۰۰ ردیف، ۴ درخواست، کش ۵ دقیقه). */
export const useAllEventTypes = (enabled = true) =>
  useQuery({ queryKey: ['events', 'event-types', 'all'], queryFn: () => fetchAll<EventType>('/events/event-types'), enabled, staleTime: 5 * 60_000 });

export const useEventTypes = (q: LogQuery) =>
  useQuery({
    queryKey: ['events', 'event-types', 'list', q],
    queryFn: ({ signal }) => adminApi<Paginated<EventType>>('/events/event-types', { query: q, signal }),
    placeholderData: keepPreviousData,
  });

export const useEventType = (id: string) =>
  useQuery({ queryKey: ['events', 'event-types', 'one', id], queryFn: ({ signal }) => adminApi<EventType>(`/events/event-types/${id}`, { signal }) });
