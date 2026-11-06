import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, apiRequest } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';

export type StaffUser = AdminSchemas['StaffUserOut'];
export type UserDetail = AdminSchemas['UserOut'];
export type StaffRegister = AdminSchemas['StaffRegisterIn'];
export type UserUpdate = AdminSchemas['AdminUserUpdateIn'];
export type Role = AdminSchemas['RoleOut'];
export type RoleAssignment = AdminSchemas['UserRoleOut'];
export type Department = AdminSchemas['DepartmentOut'];
export type DepartmentSummary = AdminSchemas['DepartmentSummaryOut'];
export type UserDepartments = AdminSchemas['UserDepartmentsResponse'];
export type Session = AdminSchemas['SessionOut'];
export type Matrix = AdminSchemas['PermissionMatrixOut'];
export type Notification = AdminSchemas['NotificationOut'];
export type ActivityItem = AdminSchemas['ActivityLogListOut'];

type ListParams = { page?: number; page_size?: number; query?: string; [k: string]: string | number | boolean | undefined };

/** همه‌ی صفحه‌های یک لیست (برای pickerها؛ سقف ۱۰۰ در هر درخواست طبق R-API-01). */
export async function fetchAll<T>(path: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page < 100; page++) {
    const r = await adminApi<Paginated<T>>(path, { query: { ...query, page, page_size: 100 } });
    out.push(...r.results);
    if (out.length >= r.total || r.results.length === 0) break;
  }
  return out;
}

// ── کاربران ──
export const useStaffList = (p: ListParams) =>
  useQuery({ queryKey: ['identity', 'staff', p], queryFn: ({ signal }) => adminApi<Paginated<StaffUser>>('/auth/staff', { query: p, signal }), placeholderData: keepPreviousData });
export const useAllStaff = (enabled = true) =>
  useQuery({ queryKey: ['identity', 'staff', 'all'], queryFn: () => fetchAll<StaffUser>('/auth/staff'), enabled, staleTime: 60_000 });
export const useUser = (id: string | undefined) =>
  useQuery({ queryKey: ['identity', 'user', id], queryFn: ({ signal }) => adminApi<UserDetail>(`/auth/users/${id}`, { signal }), enabled: !!id });

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StaffRegister) => adminApi<StaffUser>('/auth/staff', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['identity', 'staff'] }),
  });
}
export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserUpdate) => adminApi<UserDetail>(`/auth/users/${id}`, { method: 'PUT', body }),
    onSuccess: (u) => {
      qc.setQueryData(['identity', 'user', id], u);
      qc.invalidateQueries({ queryKey: ['identity', 'staff'] });
    },
  });
}
export function useSetStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => adminApi<UserDetail>(`/auth/users/${id}/status`, { method: 'PUT', query: { status } }),
    onSuccess: (u) => {
      qc.setQueryData(['identity', 'user', id], u);
      qc.invalidateQueries({ queryKey: ['identity', 'staff'] });
    },
  });
}
/** بازنشانی رمز: بک‌اند رمز تازه را داخل پیام برمی‌گرداند. */
export const useResetPassword = (id: string) =>
  useMutation({
    mutationFn: async () => {
      const r = await adminApi<{ message: string }>(`/auth/users/${id}/password`, { method: 'PUT' });
      return r.message.split('New password:')[1]?.trim() ?? null;
    },
  });

/** آپلود یک مدرک کارمند ⇐ مسیر فایل برای StaffRegisterIn.documents */
export async function uploadStaffDocument(file: File, slot: string) {
  const fd = new FormData();
  // بک‌اند مسیر را «staged_documents/<uuid>/<hex32>_<نام فایل>» می‌سازد (۸۷ نویسه + نام) ولی ستون
  // UserDocument.file فقط ۱۰۰ نویسه است ⇐ نام بلندتر از ۱۳ نویسه در ثبت نهایی ۵۰۰ می‌دهد.
  // تا اصلاح بک‌اند (identity) نام فایل را کوتاه می‌فرستیم؛ محتوا و نوع فایل دست نمی‌خورد.
  const ext = (file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? '').toLowerCase();
  const short = new File([file], ext ? `doc.${ext}` : 'doc', { type: file.type, lastModified: file.lastModified });
  fd.append('file', short);
  fd.append('slot', slot);
  return adminApi<AdminSchemas['StaffDocumentUploadOut']>('/auth/staff/documents/upload', { method: 'POST', body: fd });
}
/** دانلود مدرک با توکن (مسیر فایل مستقیم در دسترس نیست). */
export async function openUserDocument(userId: string, docId: string) {
  const blob = await apiRequest<Blob>('admin', `/auth/users/${userId}/documents/${docId}/file`, { raw: true });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── نشست‌ها ──
export const useUserSessions = (id: string, page: number) =>
  useQuery({ queryKey: ['identity', 'user', id, 'sessions', page], queryFn: ({ signal }) => adminApi<Paginated<Session>>(`/auth/users/${id}/sessions`, { query: { page, page_size: 10 }, signal }), placeholderData: keepPreviousData });
export function useRevokeSession(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) => adminApi(`/auth/sessions/${sid}/revoke`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['identity', 'user', userId] }),
  });
}

// ── نقش‌ها ──
export const useRoles = (p: ListParams) =>
  useQuery({ queryKey: ['rbac', 'roles', p], queryFn: ({ signal }) => adminApi<Paginated<Role>>('/rbac/roles', { query: p, signal }), placeholderData: keepPreviousData });
export const useAllRoles = (enabled = true) =>
  useQuery({ queryKey: ['rbac', 'roles', 'all'], queryFn: () => fetchAll<Role>('/rbac/roles'), enabled, staleTime: 60_000 });
export const useRole = (id: string | undefined) =>
  useQuery({ queryKey: ['rbac', 'role', id], queryFn: ({ signal }) => adminApi<Role>(`/rbac/roles/${id}`, { signal }), enabled: !!id });
export const useRoleMatrix = (id: string | undefined) =>
  useQuery({ queryKey: ['rbac', 'role', id, 'matrix'], queryFn: ({ signal }) => adminApi<Matrix>(`/rbac/roles/${id}/matrix`, { signal }), enabled: !!id });
/** user_is_active: true ⇐ فقط کاربران فعالِ حذف‌نشده (بک‌اند 2026-10-25) */
export const useAssignments = (q: { user_id?: string; role_id?: string; user_is_active?: boolean }, enabled = true) =>
  useQuery({
    queryKey: ['rbac', 'assignments', q],
    queryFn: () => fetchAll<RoleAssignment>('/rbac/roles/assignments', { ...q, is_active: true }),
    enabled,
  });

// ── دپارتمان‌ها ──
export const useDepartments = (p: ListParams) =>
  useQuery({ queryKey: ['identity', 'departments', p], queryFn: ({ signal }) => adminApi<Paginated<Department>>('/auth/departments', { query: p, signal }), placeholderData: keepPreviousData });
export const useDepartmentPicker = (enabled = true) =>
  useQuery({ queryKey: ['identity', 'departments', 'picker'], queryFn: () => fetchAll<DepartmentSummary>('/auth/departments/picker'), enabled, staleTime: 60_000 });
export const useUserDepartments = (id: string, enabled = true) =>
  useQuery({ queryKey: ['identity', 'user', id, 'departments'], queryFn: ({ signal }) => adminApi<UserDepartments>(`/auth/users/${id}/departments`, { signal }), enabled });

// ── فعالیت‌ها (events) ──
export const useUserActivity = (userId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['events', 'activity', 'actor', userId],
    queryFn: ({ signal }) => adminApi<Paginated<ActivityItem>>('/events/activity-log', { query: { actor_user_id: userId, page: 1, page_size: 6 }, signal }),
    enabled,
  });

/** نقشه‌ی کاربر ⇐ نام دپارتمان‌ها (StaffUserOut دپارتمان ندارد ⇐ از اعضای هر دپارتمان ساخته می‌شود). */
export const useStaffDepartmentMap = (enabled = true) =>
  useQuery({
    queryKey: ['identity', 'departments', 'members-map'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const depts = await fetchAll<{ id: string; name: string; is_active: boolean }>('/auth/departments/picker');
      const map = new Map<string, string[]>();
      for (const d of depts) {
        const members = await fetchAll<{ id: string }>(`/auth/departments/${d.id}/users`);
        for (const m of members) map.set(m.id, [...(map.get(m.id) ?? []), d.name]);
      }
      return { map, names: depts.map((d) => d.name) };
    },
  });
