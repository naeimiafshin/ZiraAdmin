import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/useAuth';

/**
 * عدد کنار گزینه‌های منو (کلید = full_code صفحه). فعلاً: پیام‌های خوانده‌نشده‌ی «گفت‌وگوهای خصوصی»
 * (GET /chat/summary هر ۳۰ ثانیه، طبق راهنمای بک‌اند؛ همان کلید کش صفحه‌ی گفت‌وگو ⇐ با خواندن پیام فوراً به‌روز می‌شود).
 */
export function useNavBadges(): Record<string, number> {
  const { user } = useAuth();
  const has = (c: string) => !!user && (user.is_superuser || (user.permission_codes ?? []).includes(c));
  const chat = useQuery({
    queryKey: ['chat', 'summary'],
    queryFn: ({ signal }) => adminApi<AdminSchemas['ChatSummaryOut']>('/chat/summary', { signal }),
    refetchInterval: 30_000,
    enabled: has('chat.conversations.read') && has('chat.conversations.list') && has('chat.conversations.messages.read'),
  });
  // تیکت‌های در انتظار پاسخ (همان کلید کش کارت آمار صفحه‌ی پشتیبانی؛ بک‌اند شمارنده‌ی جدا ندارد ⇐ total با page_size=1، هر ۶۰ ثانیه)
  const waiting = useQuery({
    queryKey: ['support', 'tickets', 'count', 'list', { status: 'WAITING' }],
    queryFn: ({ signal }) => adminApi<{ total: number }>('/support/tickets', { query: { status: 'WAITING', page: 1, page_size: 1 }, signal }).then((r) => r.total),
    refetchInterval: 60_000,
    enabled: has('support.tickets.list'),
  });
  return { 'chat.conversations': chat.data?.unread_messages ?? 0, 'support.tickets': waiting.data ?? 0 };
}
