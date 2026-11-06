import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';

/** گفت‌وگوهای خصوصی — دامنه‌ی chat (`/api/v1/admin/chat`)؛ راهنمای بک‌اند: FrontGuidance/ADMIN_CHAT_API_NOTES_FOR_FRONTEND.md */
export type Conversation = AdminSchemas['ConversationOut'];
export type ChatMessage = AdminSchemas['ChatMessageOut'];
export type MessagePage = AdminSchemas['ChatMessagePageOut'];
export type Contact = AdminSchemas['ChatContactOut'];
export type InspectionPage = AdminSchemas['ChatInspectionPageOut'];
export type ChatSummary = AdminSchemas['ChatSummaryOut'];

export const CHAT_KEY = ['chat'] as const;
/** بازه‌های polling طبق راهنمای بک‌اند */
export const POLL = { messages: 5_000, list: 15_000, summary: 30_000 } as const;

export const useConversations = (query: string, enabled = true) =>
  useQuery({
    queryKey: [...CHAT_KEY, 'conversations', query],
    queryFn: ({ signal }) => adminApi<Paginated<Conversation>>('/chat/conversations', { query: { page: 1, page_size: 100, query: query || undefined }, signal }),
    refetchInterval: POLL.list,
    enabled,
  });

export const useChatSummary = (enabled = true) =>
  useQuery({
    queryKey: [...CHAT_KEY, 'summary'],
    queryFn: ({ signal }) => adminApi<ChatSummary>('/chat/summary', { signal }),
    refetchInterval: POLL.summary,
    enabled,
  });

export const useContacts = (query: string, page: number, pageSize: number, enabled = true) =>
  useQuery({
    queryKey: [...CHAT_KEY, 'contacts', query, page, pageSize],
    queryFn: ({ signal }) => adminApi<Paginated<Contact>>('/chat/contacts', { query: { page, page_size: pageSize, query: query || undefined }, signal }),
    enabled,
  });

export const openDirect = (peer_user_id: string) => adminApi<Conversation>('/chat/conversations/direct', { method: 'POST', body: { peer_user_id } });
export const fetchMessages = (id: string, q: { before_sequence?: number; after_sequence?: number; page_size?: number }, signal?: AbortSignal) =>
  adminApi<MessagePage>(`/chat/conversations/${id}/messages`, { query: { page: 1, page_size: q.page_size ?? 40, before_sequence: q.before_sequence, after_sequence: q.after_sequence }, signal });
export const sendMessage = (id: string, body: string, client_message_id: string) =>
  adminApi<ChatMessage>(`/chat/conversations/${id}/messages`, { method: 'POST', body: { body, client_message_id } });
export const markRead = (id: string, through_message_id: string) =>
  adminApi<AdminSchemas['ConversationReadOut']>(`/chat/conversations/${id}/read`, { method: 'PUT', body: { through_message_id } });
export const fetchInspection = (a: string, b: string, q: { before_sequence?: number; page_size?: number }, signal?: AbortSignal) =>
  adminApi<InspectionPage>('/chat/supervision/messages', { query: { user_a_id: a, user_b_id: b, page: 1, page_size: q.page_size ?? 40, before_sequence: q.before_sequence }, signal });
