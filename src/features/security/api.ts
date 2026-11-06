import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { fetchAll } from '@/features/users/api';

/** امنیت و نشست‌ها — دامنه‌ی events (`/api/v1/admin/events/...`). */
export type Session = AdminSchemas['SessionListOut'];
export type SessionLimit = AdminSchemas['SessionLimitOut'];
export type SessionTimeout = AdminSchemas['SessionTimeoutOut'];
export type SecurityPolicy = AdminSchemas['SecurityPolicyOut'];
export type SecurityPolicyPatch = AdminSchemas['SecurityPolicyUpdateIn'];
export type IpRule = AdminSchemas['IpRuleOut'];
export type SessionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type TwoFactorRule = AdminSchemas['TwoFactorRuleOut'];
export type AccountLock = AdminSchemas['AccountLockOut'];

const key = ['events', 'security'] as const;

/**
 * بک‌اند بدون status فقط ACTIVE برمی‌گرداند ⇐ برای «همه» هر سه وضعیت جدا گرفته می‌شود.
 * جست‌وجو (نام، نام کاربری، موبایل، IP، مرورگر) و نقش (`role_id`) سمت سرور (2026-10-25).
 */
export const useSessions = (status: SessionStatus | '', device: string, query = '', roleId = '') =>
  useQuery({
    queryKey: [...key, 'sessions', status, device, query, roleId],
    queryFn: async () => {
      const statuses: SessionStatus[] = status ? [status] : ['ACTIVE', 'EXPIRED', 'REVOKED'];
      const parts = await Promise.all(statuses.map((st) => fetchAll<Session>('/events/sessions/active', {
        status: st, device_type: device || undefined, query: query || undefined, role_id: roleId || undefined,
      })));
      return parts.flat().sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
    },
  });

/** شمار نشست‌ها در یک وضعیت (برای نشان‌های بالای جدول). */
export const useSessionCount = (status: SessionStatus) =>
  useQuery({
    queryKey: [...key, 'sessions', 'count', status],
    queryFn: ({ signal }) => adminApi<Paginated<Session>>('/events/sessions/active', { query: { status, page: 1, page_size: 1 }, signal }).then((r) => r.total),
  });

export function useTerminateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi(`/events/sessions/active/${id}`, { method: 'DELETE', body: { reason: 'administrative_termination' } }),
    onSettled: () => qc.invalidateQueries({ queryKey: [...key, 'sessions'] }),
  });
}

export const usePolicy = () =>
  useQuery({ queryKey: [...key, 'policy'], queryFn: ({ signal }) => adminApi<SecurityPolicy>('/events/security-policy', { signal }) });

export function useSavePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SecurityPolicyPatch) => adminApi<SecurityPolicy>('/events/security-policy', { method: 'PATCH', body: patch }),
    onSuccess: (p) => qc.setQueryData([...key, 'policy'], p),
  });
}

export const useLimits = () => useQuery({ queryKey: [...key, 'limits'], queryFn: () => fetchAll<SessionLimit>('/events/sessions/limits') });
export const useTimeouts = () => useQuery({ queryKey: [...key, 'timeouts'], queryFn: () => fetchAll<SessionTimeout>('/events/sessions/timeouts') });
export const useIpRules = () => useQuery({ queryKey: [...key, 'ip-rules'], queryFn: () => fetchAll<IpRule>('/events/security-policy/ip-rules') });

/** ورود دو مرحله‌ای: نقش‌های تیک‌خورده (فقط پیامک، بدون مهلت؛ 2026-10-25). */
export const useTwoFactorRules = (enabled = true) =>
  useQuery({ queryKey: [...key, 'two-factor'], queryFn: () => fetchAll<TwoFactorRule>('/events/security-policy/two-factor'), enabled });

/** زدن تیک = PUT با `{}`؛ برداشتن = DELETE. هر دو فوری ذخیره می‌شوند (مثل قوانین IP). */
export function useSetTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, on }: { roleId: string; on: boolean }) =>
      adminApi(`/events/security-policy/two-factor/${roleId}`, on ? { method: 'PUT', body: {} } : { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: [...key, 'two-factor'] }),
  });
}

/** حساب‌های قفل‌شده — `active`: true برقرار، false تمام‌شده، '' همه؛ `query`: نام، نام کاربری، موبایل. */
export const useAccountLocks = (p: { active: '' | 'true' | 'false'; query: string; page: number; pageSize: number }, enabled = true) =>
  useQuery({
    queryKey: [...key, 'account-locks', p],
    queryFn: ({ signal }) => adminApi<Paginated<AccountLock>>('/events/security-policy/account-locks', {
      query: { active: p.active || undefined, query: p.query || undefined, page: p.page, page_size: p.pageSize }, signal,
    }),
    enabled,
    placeholderData: (prev) => prev,
  });

export function useUnlockAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi<AccountLock>(`/events/security-policy/account-locks/${id}/unlock`, { method: 'PATCH' }),
    onSettled: () => qc.invalidateQueries({ queryKey: [...key, 'account-locks'] }),
  });
}

export const invalidateSecurity = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: key });
