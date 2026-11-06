import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import { ApiError, userMessage } from '@/shared/api/errors';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { ERROR_TEXT } from './labels';
import { saveBlob } from '@/shared/lib/download';

/**
 * فیلدهای پیشنهادی که بک‌اند هنوز ندارد (docs/SUPPORT_API_GUIDE.md): فرانت با همین نام‌ها نوشته شده
 * و به محض آمدن فیلد در پاسخ، بدون تغییر نمایش داده می‌شود.
 */
export type TicketExtra = { last_message_preview?: string | null; assigned_to_name?: string | null; received_files_count?: number | null; sent_files_count?: number | null };
export type TicketRow = AdminSchemas['TicketAdminListItemOut'] & TicketExtra;
export type TicketDetail = AdminSchemas['TicketAdminDetailOut'];
export type TicketMessage = AdminSchemas['MessageOut'];
export type Attachment = AdminSchemas['AttachmentOut'];
export type Calendar = AdminSchemas['CalendarOut'];
export type ContactRow = AdminSchemas['ContactSubmissionListItemOut'];
export type ContactDetail = AdminSchemas['ContactSubmissionDetailOut'];
export type Department = AdminSchemas['DepartmentChoiceOut'];
export type Assignee = AdminSchemas['EligibleAssigneeOut'];

/** پارامترهای فهرست تیکت ادمین (GET /support/tickets؛ همان نام‌های بک‌اند) */
export type TicketQuery = {
  status?: string; department_id?: string; priority?: string; channel?: string; direction?: string; contact_role?: string;
  unassigned?: boolean; assigned_to_id?: string; branch_id?: string; date_from?: string; date_to?: string; query?: string;
  ordering?: string; page?: number; page_size?: number;
};

const P = '/support';

/** پیام خطای فارسی: کد پشتیبانی ⇐ متن ثابت؛ بقیه ⇐ userMessage */
export function supportError(e: unknown): string {
  if (e instanceof ApiError && ERROR_TEXT[e.code]) return ERROR_TEXT[e.code]!;
  return userMessage(e);
}

/** فاصله‌ی به‌روزرسانی خودکار (بک‌اند پشتیبانی SSE ندارد؛ راهنما polling می‌خواهد ولی فاصله را تعیین نکرده) */
export const LIST_POLL = 60_000;
export const THREAD_POLL = 15_000;

/** فهرست تیکت‌ها؛ sla=true ⇐ GET /sla-breaches (فقط status، department_id، priority، query) */
export const useTickets = (q: TicketQuery, opts: { sla?: boolean; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ['support', 'tickets', opts.sla ? 'sla' : 'list', q],
    queryFn: ({ signal }) => adminApi<Paginated<TicketRow>>(opts.sla ? `${P}/sla-breaches` : `${P}/tickets`, {
      query: opts.sla ? { status: q.status, department_id: q.department_id, priority: q.priority, query: q.query, page: q.page, page_size: q.page_size } : q, signal,
    }),
    placeholderData: keepPreviousData,
    refetchInterval: LIST_POLL,
    enabled: opts.enabled ?? true,
  });

/** فقط total (کارت آمار و عدد منو): page_size=1 */
export const useTicketCount = (q: TicketQuery, opts: { sla?: boolean; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ['support', 'tickets', 'count', opts.sla ? 'sla' : 'list', q],
    queryFn: ({ signal }) => adminApi<Paginated<TicketRow>>(opts.sla ? `${P}/sla-breaches` : `${P}/tickets`, { query: { ...q, page: 1, page_size: 1 }, signal }).then((r) => r.total),
    refetchInterval: LIST_POLL,
    enabled: opts.enabled ?? true,
  });

export const useTicket = (id: string | undefined) =>
  useQuery({ queryKey: ['support', 'ticket', id], queryFn: ({ signal }) => adminApi<TicketDetail>(`${P}/tickets/${id}`, { signal }), enabled: !!id, refetchInterval: THREAD_POLL });

/** همه‌ی پیام‌های تیکت: صفحه‌ها پشت سر هم تا total (راهنما: snapshot ندارد ⇐ هر بار از صفحه‌ی ۱ و ادغام با id) */
export const useMessages = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['support', 'ticket', id, 'messages'],
    queryFn: async ({ signal }) => {
      const all = new Map<string, TicketMessage>();
      for (let page = 1; page < 200; page++) {
        const r = await adminApi<Paginated<TicketMessage>>(`${P}/tickets/${id}/messages`, { query: { page, page_size: 100 }, signal });
        r.results.forEach((m) => all.set(m.id, m));
        if (r.results.length < 100 || all.size >= r.total) break;
      }
      return [...all.values()].sort((a, b) => a.sequence - b.sequence);
    },
    enabled: !!id && enabled,
    refetchInterval: THREAD_POLL,
  });

export const useDepartments = (enabled = true) =>
  useQuery({
    queryKey: ['support', 'departments'],
    queryFn: ({ signal }) => adminApi<Paginated<Department>>(`${P}/departments`, { query: { page_size: 100 }, signal }).then((r) => r.results),
    staleTime: 5 * 60_000, enabled,
  });

export const useAssignees = (departmentId: string | null | undefined, branchId: string | null | undefined, query: string, page: number, enabled = true) =>
  useQuery({
    queryKey: ['support', 'assignees', departmentId, branchId, query, page],
    queryFn: ({ signal }) => adminApi<Paginated<Assignee>>(`${P}/departments/${departmentId}/assignees`, { query: { branch_id: branchId || undefined, query: query || undefined, page, page_size: 8 }, signal }),
    enabled: !!departmentId && enabled, placeholderData: keepPreviousData,
  });

/** عملیات روی تیکت: پاسخ سرور جزئیات کامل است ⇐ کش جزئیات با آن به‌روز و فهرست‌ها تازه می‌شوند */
export function useTicketAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: '' | '/assign' | '/department' | '/close' | '/reopen'; body: unknown }) =>
      adminApi<TicketDetail>(`${P}/tickets/${id}${path}`, { method: 'PATCH', body }),
    onSuccess: (t) => {
      qc.setQueryData(['support', 'ticket', id], t);
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] });
      qc.invalidateQueries({ queryKey: ['support', 'ticket', id, 'messages'] });
    },
  });
}

export function useReply(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, files }: { body: string; files: File[] }) => {
      const f = new FormData();
      f.append('body', body);
      for (const file of files) f.append('files', file, file.name);
      return adminApi<TicketMessage>(`${P}/tickets/${id}/messages`, { method: 'POST', body: f });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support', 'ticket', id] });
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] });
    },
  });
}

export type NewTicket = {
  subject: string; department_id: string; priority: string; body: string;
  owner_user_id?: string; contact_name?: string; phone?: string; email?: string; branch_id?: string;
};
export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, files }: { data: NewTicket; files: File[] }) => {
      const f = new FormData();
      // FormData تخت؛ فیلد اختیاری خالی اصلاً فرستاده نمی‌شود (راهنمای بک‌اند)
      for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null && String(v).trim() !== '') f.append(k, String(v).trim());
      for (const file of files) f.append('files', file, file.name);
      return adminApi<TicketDetail>(`${P}/tickets`, { method: 'POST', body: f });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support', 'tickets'] }),
  });
}

/** دانلود پیوست با توکن (blob؛ مسیر عمومی ندارد) */
export async function downloadAttachment(a: Attachment) {
  const blob = await adminApi<Blob>(`${P}/attachments/${a.id}/download`, { raw: true });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url; el.download = a.original_name; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** خروجی CSV بک‌اند (status فقط مقدار واقعی؛ active فرستاده نمی‌شود) */
export async function exportTickets(q: TicketQuery) {
  const { page: _p, page_size: _s, ...rest } = q;
  const query = { ...rest, status: rest.status === 'active' ? undefined : rest.status };
  const blob = await adminApi<Blob>(`${P}/tickets/export`, { query, raw: true });
  saveBlob(blob, 'tickets.csv');
}

export const useEvaluateSla = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi<AdminSchemas['SlaEvaluationOut']>(`${P}/sla/evaluate`, { method: 'PATCH', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support', 'tickets'] }),
  });
};

export const useCalendar = () => useQuery({ queryKey: ['support', 'calendar'], queryFn: ({ signal }) => adminApi<Calendar>(`${P}/calendar`, { signal }) });
export function useSaveCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { closed_dates?: string[]; covered_from?: string; covered_through?: string }) => adminApi<Calendar>(`${P}/calendar`, { method: 'PUT', body }),
    onSuccess: (c) => { qc.setQueryData(['support', 'calendar'], c); qc.invalidateQueries({ queryKey: ['support', 'tickets'] }); },
  });
}

export const useContactSubmissions = (q: { page: number; page_size: number; query?: string }) =>
  useQuery({
    queryKey: ['support', 'contact', q],
    queryFn: ({ signal }) => adminApi<Paginated<ContactRow>>(`${P}/contact-submissions`, { query: q, signal }),
    placeholderData: keepPreviousData, refetchInterval: LIST_POLL,
  });
export const useContactSubmission = (id: string | null) =>
  useQuery({ queryKey: ['support', 'contact', 'one', id], queryFn: ({ signal }) => adminApi<ContactDetail>(`${P}/contact-submissions/${id}`, { signal }), enabled: !!id });

/** محدودیت‌های پیوست (بک‌اند) */
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'pdf', 'xlsx'];
export function checkFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return `حداکثر ${MAX_FILES.toLocaleString('fa-IR')} فایل برای هر پیام.`;
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.includes(ext)) return `نوع فایل «${f.name}» مجاز نیست (فقط jpg، png، pdf، xlsx).`;
    if (f.size > MAX_FILE_BYTES) return `حجم «${f.name}» بیش از ۳ مگابایت است.`;
  }
  return null;
}
export const fileSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت` : `${Math.max(1, Math.round(b / 1024)).toLocaleString('fa-IR')} کیلوبایت`);
