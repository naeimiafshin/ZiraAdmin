import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, apiRequest } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { fetchAll } from '@/features/users/api';
import { saveBlob } from '@/shared/lib/download';

/**
 * API ادمین «مدیریت مشتریان» — پیشوند /api/v1/admin/customers
 * مرجع: domains/customers/api/admin.py و api/admin_credit.py (کد بک‌اند مرجع است، نه یادداشت‌ها).
 * داده‌ی مشتری شعبه ندارد؛ هر endpoint دقیقاً یک مجوز `customers.…` دارد.
 */
const P = '/customers';

export type CustomerRow = AdminSchemas['CustomerListOut'];
export type CustomerDetail = AdminSchemas['CustomerDetailOut'];
export type CustomerUpdate = AdminSchemas['CustomerUpdateIn'];
export type TierOut = AdminSchemas['CustomerTierOut'];
export type ImageAccessOut = AdminSchemas['CustomerImageAccessOut'];
export type CreditPolicyOut = AdminSchemas['CustomerCreditPolicyOut'];
export type ProfileGroup = AdminSchemas['ProfileGroupOut'];
export type MarketerInfo = AdminSchemas['ProfileMarketerOut'];
export type MarketerAssignment = AdminSchemas['MarketerAssignmentOut'];
export type RegistrationRow = AdminSchemas['RegistrationListOut'];
export type RegistrationDetail = AdminSchemas['RegistrationDetailOut'];
export type RegistrationSubmit = AdminSchemas['RegistrationSubmitIn'];
export type RegistrationUpdate = AdminSchemas['RegistrationUpdateIn'];
export type RegistrationCounts = AdminSchemas['RegistrationCountsOut'];
export type CustomerDocument = AdminSchemas['DocumentOut'];
export type GroupRow = AdminSchemas['GroupListOut'];
export type GroupDetail = AdminSchemas['GroupDetailOut'];
export type GroupMember = AdminSchemas['MemberOut'];
export type CreditSummary = AdminSchemas['CreditSummaryOut'];
export type CreditAccountSummary = AdminSchemas['CreditAccountSummaryOut'];
export type CreditAccount = AdminSchemas['CreditAccountOut'];
export type ChangeRequest = AdminSchemas['ChangeRequestOut'];
export type ChangeQueueItem = AdminSchemas['ChangeRequestQueueItemOut'];
export type Guarantee = AdminSchemas['GuaranteeOut'];
export type GuaranteeRequirement = AdminSchemas['CustomerGuaranteeRequirementOut'];
export type CreditLock = AdminSchemas['CreditLockOut'];
export type MarketerCard = AdminSchemas['MarketerCardOut'];
export type CustomerAddress = AdminSchemas['AdminCustomerAddressOut'];
export type EffectiveMarketer = AdminSchemas['EffectiveMarketerOut'];

export type ListParams = { page?: number; page_size?: number; query?: string; [k: string]: string | number | boolean | undefined };
const K = {
  list: ['customers', 'profiles'] as const,
  one: (id: string) => ['customers', 'profile', id] as const,
};

// ── پرونده‌ها ──
export const useCustomers = (p: ListParams) =>
  useQuery({ queryKey: [...K.list, p], queryFn: ({ signal }) => adminApi<Paginated<CustomerRow>>(`${P}/profiles`, { query: p, signal }), placeholderData: keepPreviousData });
export const useCustomer = (id: string | undefined) =>
  useQuery({ queryKey: K.one(id ?? ''), queryFn: ({ signal }) => adminApi<CustomerDetail>(`${P}/profiles/${id}`, { signal }), enabled: !!id });
export const useCustomerTier = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...K.one(id), 'tier'], queryFn: ({ signal }) => adminApi<TierOut>(`${P}/profiles/${id}/tier`, { signal }), enabled });
export const useCustomerImageAccess = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...K.one(id), 'image-access'], queryFn: ({ signal }) => adminApi<ImageAccessOut>(`${P}/profiles/${id}/image-access`, { signal }), enabled });
export const useCreditPolicy = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...K.one(id), 'credit-policy'], queryFn: ({ signal }) => adminApi<CreditPolicyOut>(`${P}/profiles/${id}/credit-policy`, { signal }), enabled });

/** هر نوشتن روی پرونده detail تازه برمی‌گرداند؛ همان را در کش می‌گذاریم و لیست را تازه می‌کنیم. */
function useProfileWrite<TVars>(id: string, fn: (v: TVars) => Promise<CustomerDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (d) => {
      qc.setQueryData(K.one(id), d);
      qc.invalidateQueries({ queryKey: K.one(id) });
      qc.invalidateQueries({ queryKey: K.list });
    },
  });
}
export const useUpdateCustomer = (id: string) => useProfileWrite(id, (body: CustomerUpdate) => adminApi<CustomerDetail>(`${P}/profiles/${id}`, { method: 'PATCH', body }));
export const useChangeStatus = (id: string) => useProfileWrite(id, (body: { status: 'ACTIVE' | 'INACTIVE'; reason: string; expected_version: number }) => adminApi<CustomerDetail>(`${P}/profiles/${id}/status`, { method: 'PATCH', body }));
export const useArchiveCustomer = (id: string) => useProfileWrite(id, (body: { reason: string; expected_version: number }) => adminApi<CustomerDetail>(`${P}/profiles/${id}/archive`, { method: 'DELETE', body }));
export const useBlacklist = (id: string) => useProfileWrite(id, (body: { flag: boolean; reason: string; expected_version: number }) => adminApi<CustomerDetail>(`${P}/profiles/${id}/blacklist`, { method: 'PATCH', body }));
export type CustomerAttribute = AdminSchemas['CustomerAttributeOut'];
/** level یا clear=true (پاک کردن مقدار پرونده ⇐ از گروه/پیش‌فرض؛ BR-CUS-052) */
export const useSetTier = (id: string) => useProfileWrite(id, (body: { level?: string; clear?: boolean; reason: string; expected_version: number }) => adminApi<CustomerDetail>(`${P}/profiles/${id}/tier`, { method: 'PUT', body }));
export const useSetImageAccess = (id: string) => useProfileWrite(id, (body: { level?: string; clear?: boolean; reason: string; expected_version: number }) => adminApi<CustomerDetail>(`${P}/profiles/${id}/image-access`, { method: 'PUT', body }));
export const useSetPaymentDueDays = (id: string) => useProfileWrite(id, (body: { payment_due_days: number | null; expected_version: number }) => adminApi<CustomerDetail>(`${P}/profiles/${id}/credit-policy`, { method: 'PUT', body }));

/**
 * ویرایش هویت مشتری (نام، نام خانوادگی، کد ملی، جنسیت) — PUT /admin/auth/users/{user_id} (identity، پرهام). جنسیت در identity.UserIdentity ذخیره می‌شود.
 * سرویس identity ویرایش کاربر CUSTOMER توسط کارمند با مجوز identity.users.update را پشتیبانی می‌کند (update_user_profile).
 */
export function useUpdateCustomerIdentity(customerId: string, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { first_name?: string; last_name?: string; national_id?: string; gender?: string | null; email?: string | null; phone_number?: string; change_reason?: string }) => adminApi(`/auth/users/${userId}`, { method: 'PUT', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.one(customerId) }); qc.invalidateQueries({ queryKey: K.list }); },
  });
}

/** دروازه‌ی بارگذاری پروانه‌ی کسب در پنل مشتری (باز/بسته؛ وضعیت فعلی در detail نیست) */
export function useLicenseGate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { open: boolean; reason: string; expected_version: number }) =>
      adminApi<AdminSchemas['CustomerBusinessLicenseGateStatusOut']>(`${P}/profiles/${id}/business-license/${v.open ? 'open-upload' : 'close-upload'}`, { method: 'PATCH', body: { reason: v.reason, expected_version: v.expected_version } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.one(id) }),
  });
}

// ── گروه و بازاریاب پرونده ──
export const useProfileGroups = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...K.one(id), 'groups'], queryFn: () => fetchAll<ProfileGroup>(`${P}/profiles/${id}/groups`), enabled });
export function useProfileGroupWrite(id: string) {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: K.one(id) }); qc.invalidateQueries({ queryKey: ['customers', 'groups'] }); };
  const add = useMutation({ mutationFn: (groupId: string) => adminApi<ProfileGroup>(`${P}/profiles/${id}/groups/${groupId}`, { method: 'PUT' }), onSuccess: done });
  const remove = useMutation({ mutationFn: (membershipId: string) => adminApi(`${P}/profiles/${id}/groups/${membershipId}/remove`, { method: 'PATCH' }), onSuccess: done });
  return { add, remove };
}
export const useProfileMarketer = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...K.one(id), 'marketer'], queryFn: ({ signal }) => adminApi<MarketerInfo>(`${P}/profiles/${id}/marketer`, { signal }), enabled });
export function useMarketerWrite(id: string) {
  const qc = useQueryClient();
  const done = (m: MarketerInfo) => { qc.setQueryData([...K.one(id), 'marketer'], m); qc.invalidateQueries({ queryKey: K.one(id) }); };
  const assign = useMutation({ mutationFn: (body: { marketer_id: string; percent: string }) => adminApi<MarketerInfo>(`${P}/profiles/${id}/marketer`, { method: 'PUT', body }), onSuccess: done });
  const end = useMutation({ mutationFn: (body: { reason: string }) => adminApi<MarketerInfo>(`${P}/profiles/${id}/marketer/end`, { method: 'PATCH', body }), onSuccess: done });
  return { assign, end };
}

// ── مدارک ──
export const useCustomerDocuments = (id: string, enabled: boolean, p: ListParams) =>
  useQuery({ queryKey: [...K.one(id), 'documents', p], queryFn: ({ signal }) => adminApi<Paginated<CustomerDocument>>(`${P}/profiles/${id}/documents`, { query: p, signal }), enabled, placeholderData: keepPreviousData });
export function useDocumentWrite(customerId: string, requestId?: string) {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: [...K.one(customerId), 'documents'] }); if (requestId) qc.invalidateQueries({ queryKey: ['customers', 'registration', requestId] }); };
  const upload = useMutation({
    mutationFn: ({ doc_type, file }: { doc_type: string; file: File }) => { const fd = new FormData(); fd.append('doc_type', doc_type); fd.append('file', file); return adminApi<CustomerDocument>(`${P}/profiles/${customerId}/documents`, { method: 'POST', body: fd }); },
    onSuccess: done,
  });
  const review = useMutation({ mutationFn: (v: { id: string; approved: boolean; reason?: string; expected_version?: number }) => adminApi<CustomerDocument>(`${P}/documents/${v.id}/review`, { method: 'PATCH', body: { approved: v.approved, reason: v.reason, expected_version: v.expected_version } }), onSuccess: done });
  const remove = useMutation({ mutationFn: (docId: string) => adminApi(`${P}/documents/${docId}`, { method: 'DELETE' }), onSuccess: done });
  /** اصلاح فایل مدرک (پرهام 2026-10-22): PUT /documents/{id}/file؛ تأیید قبلی باطل و نسخه +۱؛ جواز ⇐ استعلام قبلی هم باطل */
  const correct = useMutation({
    mutationFn: (v: { id: string; file: File; expected_version: number; reason?: string; business_license_no?: string }) => {
      const fd = new FormData(); fd.append('file', v.file); fd.append('expected_version', String(v.expected_version));
      if (v.reason) fd.append('reason', v.reason);
      if (v.business_license_no) fd.append('business_license_no', v.business_license_no);
      return adminApi<CustomerDocument>(`${P}/documents/${v.id}/file`, { method: 'PUT', body: fd });
    },
    onSuccess: () => { done(); qc.invalidateQueries({ queryKey: K.one(customerId) }); },
  });
  return { upload, review, remove, correct };
}
/** فایل‌ها هرگز از /media نمی‌آیند؛ فقط با توکن و به‌صورت blob */
export async function openProtectedFile(path: string) {
  const blob = await apiRequest<Blob>('admin', path, { raw: true });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function downloadBlob(path: string, query: Record<string, string | number | boolean | undefined>, filename: string) {
  const blob = await apiRequest<Blob>('admin', path, { raw: true, query });
  saveBlob(blob, filename);
}

// ── درخواست‌های ثبت‌نام ──
export const useRegistrationCounts = (enabled = true) =>
  useQuery({ queryKey: ['customers', 'registration', 'counts'], queryFn: ({ signal }) => adminApi<RegistrationCounts>(`${P}/registration-requests/counts`, { signal }), enabled });
export const useRegistrations = (p: ListParams) =>
  useQuery({ queryKey: ['customers', 'registration', 'list', p], queryFn: ({ signal }) => adminApi<Paginated<RegistrationRow>>(`${P}/registration-requests`, { query: p, signal }), placeholderData: keepPreviousData });
export const useRegistration = (id: string | undefined) =>
  useQuery({ queryKey: ['customers', 'registration', id], queryFn: ({ signal }) => adminApi<RegistrationDetail>(`${P}/registration-requests/${id}`, { signal }), enabled: !!id });
export const useRegistrationDocuments = (id: string, enabled: boolean) =>
  useQuery({ queryKey: ['customers', 'registration', id, 'documents'], queryFn: () => fetchAll<CustomerDocument>(`${P}/registration-requests/${id}/documents`), enabled });
export function useSubmitRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegistrationSubmit) => adminApi<RegistrationDetail>(`${P}/registration-requests`, { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers', 'registration'] }); qc.invalidateQueries({ queryKey: K.list }); },
  });
}
export function useRegistrationWrite(id: string) {
  const qc = useQueryClient();
  const done = (d: RegistrationDetail) => { qc.setQueryData(['customers', 'registration', id], d); qc.invalidateQueries({ queryKey: ['customers', 'registration'] }); qc.invalidateQueries({ queryKey: K.list }); };
  const update = useMutation({ mutationFn: (body: RegistrationUpdate) => adminApi<RegistrationDetail>(`${P}/registration-requests/${id}`, { method: 'PATCH', body }), onSuccess: done });
  const approve = useMutation({ mutationFn: () => adminApi<RegistrationDetail>(`${P}/registration-requests/${id}/approve`, { method: 'POST' }), onSuccess: done });
  const reject = useMutation({ mutationFn: (reason: string) => adminApi<RegistrationDetail>(`${P}/registration-requests/${id}/reject`, { method: 'POST', body: { reason } }), onSuccess: done });
  return { update, approve, reject };
}

// ── گروه‌ها ──
export const useGroups = (p: ListParams) =>
  useQuery({ queryKey: ['customers', 'groups', p], queryFn: ({ signal }) => adminApi<Paginated<GroupRow>>(`${P}/groups`, { query: p, signal }), placeholderData: keepPreviousData });
/** انتخاب بازاریاب (G-06): کارمندان فعال، فقط نام و کد پرسنلی — مجوز customers.profiles.marketer.read */
export const useMarketers = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: ['customers', 'marketers', p], queryFn: ({ signal }) => adminApi<Paginated<MarketerCard>>(`${P}/marketers`, { query: p, signal }), enabled, placeholderData: keepPreviousData });
export const useAllMarketers = (enabled = true) =>
  useQuery({ queryKey: ['customers', 'marketers', 'all'], queryFn: () => fetchAll<MarketerCard>(`${P}/marketers`), enabled, staleTime: 60_000 });

/** آدرس‌های تحویل مشتری (G-14) — فعلاً فقط فهرست؛ نوشتن بعد از اصلاح سرویس آدرس (پرهام) */
export const useCustomerAddresses = (customerId: string, p: ListParams & { include_inactive?: boolean }, enabled = true) =>
  useQuery({ queryKey: [...K.one(customerId), 'addresses', p], queryFn: ({ signal }) => adminApi<Paginated<CustomerAddress>>(`${P}/profiles/${customerId}/addresses`, { query: p, signal }), enabled, placeholderData: keepPreviousData });
export type CustomerAddressIn = AdminSchemas['CustomerAddressIn'];
/** نوشتن آدرس تحویل (پرهام 2026-10-22): POST، PATCH (بدون نسخه)، PATCH …/default، DELETE (غیرفعال‌سازی) */
export function useAddressWrite(customerId: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: [...K.one(customerId), 'addresses'] });
  const base = `${P}/profiles/${customerId}/addresses`;
  const create = useMutation({ mutationFn: (body: CustomerAddressIn) => adminApi(base, { method: 'POST', body }), onSuccess: done });
  const update = useMutation({ mutationFn: (v: { id: string; body: Partial<CustomerAddressIn> }) => adminApi(`${base}/${v.id}`, { method: 'PATCH', body: v.body }), onSuccess: done });
  const makeDefault = useMutation({ mutationFn: (id: string) => adminApi(`${base}/${id}/default`, { method: 'PATCH' }), onSuccess: done });
  const remove = useMutation({ mutationFn: (id: string) => adminApi(`${base}/${id}`, { method: 'DELETE' }), onSuccess: done });
  return { create, update, makeDefault, remove };
}

/** تخفیف‌ها و کمپین‌های با مخاطب همین گروه (BR-CUS-059؛ فیلتر customer_group_id در pricing) */
export type GroupDiscount = AdminSchemas['DiscountOut'];
export type GroupCampaign = AdminSchemas['CampaignOut'];
export const useGroupDiscounts = (groupId: string, enabled: boolean) =>
  useQuery({ queryKey: ['pricing', 'discounts', 'group', groupId], queryFn: ({ signal }) => adminApi<Paginated<GroupDiscount>>('/pricing/discounts', { query: { customer_group_id: groupId, page_size: 50 }, signal }), enabled });
export const useGroupCampaigns = (groupId: string, enabled: boolean) =>
  useQuery({ queryKey: ['pricing', 'campaigns', 'group', groupId], queryFn: ({ signal }) => adminApi<Paginated<GroupCampaign>>('/pricing/campaigns', { query: { customer_group_id: groupId, page_size: 50 }, signal }), enabled });

/** دوره‌های بازاریاب گروه (نسخه‌ی ۳: شخص + بازه، بدون درصد) */
export type GroupMarketerPeriod = AdminSchemas['GroupMarketerPeriodOut'];
export const useGroupMarketers = (id: string, p: ListParams) =>
  useQuery({ queryKey: ['customers', 'group', id, 'marketers', p], queryFn: ({ signal }) => adminApi<Paginated<GroupMarketerPeriod>>(`${P}/groups/${id}/marketers`, { query: p, signal }), placeholderData: keepPreviousData });
export function useGroupMarketerWrite(id: string) {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: ['customers', 'group', id] }); qc.invalidateQueries({ queryKey: ['customers', 'groups'] }); qc.invalidateQueries({ queryKey: ['customers', 'profile'] }); };
  const add = useMutation({ mutationFn: (body: { marketer_id: string; starts_on: string; ends_on?: string | null; reason?: string | null }) => adminApi<GroupMarketerPeriod>(`${P}/groups/${id}/marketers`, { method: 'PUT', body }), onSuccess: done });
  const end = useMutation({ mutationFn: ({ periodId, ...body }: { periodId: string; ends_on: string; reason?: string | null }) => adminApi<GroupMarketerPeriod>(`${P}/groups/${id}/marketers/${periodId}/end`, { method: 'PATCH', body }), onSuccess: done });
  const cancel = useMutation({ mutationFn: ({ periodId, reason }: { periodId: string; reason: string }) => adminApi<GroupMarketerPeriod>(`${P}/groups/${id}/marketers/${periodId}/cancel`, { method: 'PATCH', body: { reason } }), onSuccess: done });
  return { add, end, cancel };
}

/** انتخابگر تخفیف/کمپین برای گروه: فقط تخفیف فعال و کمپین منتشرشده؛ قابل‌انتخاب فقط audience_scope=GROUPS */
export const useDiscountPicker = (p: ListParams, enabled: boolean) =>
  useQuery({ queryKey: ['pricing', 'discounts', 'group-picker', p], queryFn: ({ signal }) => adminApi<Paginated<GroupDiscount>>('/pricing/discounts', { query: { ...p, status: 'ACTIVE' }, signal }), enabled, placeholderData: keepPreviousData });
export const useCampaignPicker = (p: ListParams, enabled: boolean) =>
  useQuery({ queryKey: ['pricing', 'campaigns', 'group-picker', p], queryFn: ({ signal }) => adminApi<Paginated<GroupCampaign>>('/pricing/campaigns', { query: { ...p, status: 'PUBLISHED' }, signal }), enabled, placeholderData: keepPreviousData });
/** اختصاص/برداشتن تخفیف و کمپین به گروه — در pricing (فقط ردیف مخاطب گروه) */
export function useGroupOfferWrite(groupId: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['pricing'] });
  const addDiscount = useMutation({ mutationFn: (id: string) => adminApi(`/pricing/discounts/${id}/groups/${groupId}`, { method: 'PUT' }), onSuccess: done });
  const removeDiscount = useMutation({ mutationFn: (id: string) => adminApi(`/pricing/discounts/${id}/groups/${groupId}/remove`, { method: 'PATCH' }), onSuccess: done });
  const addCampaign = useMutation({ mutationFn: (id: string) => adminApi(`/pricing/campaigns/${id}/groups/${groupId}`, { method: 'PUT' }), onSuccess: done });
  const removeCampaign = useMutation({ mutationFn: (id: string) => adminApi(`/pricing/campaigns/${id}/groups/${groupId}/remove`, { method: 'PATCH' }), onSuccess: done });
  return { addDiscount, removeDiscount, addCampaign, removeCampaign };
}

export const useAllGroups = (enabled = true) =>
  useQuery({ queryKey: ['customers', 'groups', 'all'], queryFn: () => fetchAll<GroupRow>(`${P}/groups`), enabled, staleTime: 60_000 });
export const useGroup = (id: string | null) =>
  useQuery({ queryKey: ['customers', 'group', id], queryFn: ({ signal }) => adminApi<GroupDetail>(`${P}/groups/${id}`, { signal }), enabled: !!id });
export const useGroupMembers = (id: string | null, p: ListParams) =>
  useQuery({ queryKey: ['customers', 'group', id, 'members', p], queryFn: ({ signal }) => adminApi<Paginated<GroupMember>>(`${P}/groups/${id}/members`, { query: p, signal }), enabled: !!id, placeholderData: keepPreviousData });
export function useGroupWrite(id?: string | null) {
  const qc = useQueryClient();
  const done = (g?: GroupDetail) => { if (g) qc.setQueryData(['customers', 'group', g.id], g); qc.invalidateQueries({ queryKey: ['customers', 'groups'] }); if (id) qc.invalidateQueries({ queryKey: ['customers', 'group', id] }); };
  const create = useMutation({ mutationFn: (body: { name: string } & Record<string, unknown>) => adminApi<GroupDetail>(`${P}/groups`, { method: 'POST', body }), onSuccess: (g) => done(g) });
  /** ویژگی‌های گروه (BR-CUS-054): فقط کلیدهای فرستاده‌شده؛ null ⇐ پاک. بعد از ذخیره پرونده‌ی اعضا هم تازه می‌شود. */
  // قانون‌های عضویت (نسخه‌ی ۳): هیچ چیزی روی پرونده‌ها نمی‌نویسد
  const rules = useMutation({ mutationFn: (body: Record<string, unknown> & { expected_version: number }) => adminApi<GroupDetail>(`${P}/groups/${id}/rules`, { method: 'PUT', body }), onSuccess: (g) => done(g) });
  const rename = useMutation({ mutationFn: (body: { name: string; expected_version: number }) => adminApi<GroupDetail>(`${P}/groups/${id}`, { method: 'PATCH', body }), onSuccess: done });
  const deactivate = useMutation({ mutationFn: (expected_version: number) => adminApi<GroupDetail>(`${P}/groups/${id}/deactivate`, { method: 'DELETE', body: { expected_version } }), onSuccess: done });
  const activate = useMutation({ mutationFn: (expected_version: number) => adminApi<GroupDetail>(`${P}/groups/${id}/activate`, { method: 'PATCH', body: { expected_version } }), onSuccess: done });
  const addMembers = useMutation({ mutationFn: (customer_ids: string[]) => adminApi<AdminSchemas['MembersAddOut']>(`${P}/groups/${id}/members`, { method: 'PATCH', body: { customer_ids } }), onSuccess: () => { done(); qc.invalidateQueries({ queryKey: ['customers', 'profile'] }); } });
  const removeMember = useMutation({ mutationFn: (membershipId: string) => adminApi(`${P}/groups/${id}/members/${membershipId}/remove`, { method: 'PATCH' }), onSuccess: () => { done(); qc.invalidateQueries({ queryKey: ['customers', 'profile'] }); } });
  return { create, rename, deactivate, activate, addMembers, removeMember, rules };
}

// ── اعتبار ──
export const useCreditSummary = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...K.one(id), 'credit'], queryFn: ({ signal }) => adminApi<CreditSummary>(`${P}/profiles/${id}/credit`, { signal }), enabled });
export const useAccountHistory = (accountId: string | null, p: ListParams) =>
  useQuery({ queryKey: ['customers', 'credit-account', accountId, 'history', p], queryFn: ({ signal }) => adminApi<Paginated<ChangeRequest>>(`${P}/credit-accounts/${accountId}/change-requests`, { query: p, signal }), enabled: !!accountId, placeholderData: keepPreviousData });
export function useCreditWrite(customerId: string) {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: K.one(customerId) }); qc.invalidateQueries({ queryKey: ['customers', 'credit-account'] }); };
  const open = useMutation({ mutationFn: (credit_type: 'CHEQUE' | 'GOLDEN') => adminApi<CreditAccount>(`${P}/profiles/${customerId}/credit-accounts/${credit_type}`, { method: 'PUT' }), onSuccess: done });
  const status = useMutation({ mutationFn: (v: { id: string; status: string; reason: string }) => adminApi<CreditAccount>(`${P}/credit-accounts/${v.id}/status`, { method: 'PATCH', body: { status: v.status, reason: v.reason } }), onSuccess: done });
  const term = useMutation({ mutationFn: (v: { id: string; term_months: number | null }) => adminApi<CreditAccount>(`${P}/credit-accounts/${v.id}/term`, { method: 'PUT', body: { term_months: v.term_months } }), onSuccess: done });
  const stepwise = useMutation({
    mutationFn: (v: { id: string; enabled: boolean; reason: string }) => adminApi<CreditAccount>(`${P}/credit-accounts/${v.id}/stepwise/${v.enabled ? 'enable' : 'disable'}`, { method: v.enabled ? 'PATCH' : 'POST', body: { reason: v.reason } }),
    onSuccess: done,
  });
  /** پاک کردن مقدار پله‌ای حساب ⇐ از گروه/پیش‌فرض (BR-CUS-058؛ مجوز credit_policy.approve) */
  const stepwiseReset = useMutation({ mutationFn: (v: { id: string; reason: string }) => adminApi<CreditAccount>(`${P}/credit-accounts/${v.id}/stepwise/reset`, { method: 'POST', body: { reason: v.reason } }), onSuccess: done });
  const limit = useMutation({
    mutationFn: (v: { id: string; direction: 'INCREASE' | 'DECREASE'; amount: string; reason: string; expected_updated_at: string }) =>
      adminApi<CreditAccount>(`${P}/credit-accounts/${v.id}/limit`, { method: 'PATCH', body: { direction: v.direction, amount: v.amount, reason: v.reason, expected_updated_at: v.expected_updated_at } }),
    onSuccess: done,
  });
  return { open, status, term, stepwise, stepwiseReset, limit };
}

// ── ضمانت ──
export const useGuarantees = (id: string, enabled: boolean, p: ListParams) =>
  useQuery({ queryKey: [...K.one(id), 'guarantees', p], queryFn: ({ signal }) => adminApi<Paginated<Guarantee>>(`${P}/profiles/${id}/guarantees`, { query: p, signal }), enabled, placeholderData: keepPreviousData });
/** بانک‌های فعال برای چک ضمانت (BR-CUS-131؛ treasury.Bank، 2026-10-22)؛ logo = فایل در public/banks/ */
export type Bank = AdminSchemas['BankOut'];
export const useBanks = (enabled = true) =>
  useQuery({ queryKey: ['customers', 'banks'], queryFn: ({ signal }) => adminApi<Bank[]>(`${P}/banks`, { signal }), enabled, staleTime: 60 * 60 * 1000 });
/** تاریخچه‌ی تغییرات سقف اعتبار همه‌ی مشتریان (GET /credit-change-requests، مجوز credit_policy.approve) */
export const useCreditChangeQueue = (p: ListParams & { status?: string; credit_type?: string; direction?: string; customer_id?: string; credit_account_id?: string; date_from?: string; date_to?: string }) =>
  useQuery({ queryKey: ['customers', 'credit-change-queue', p], queryFn: ({ signal }) => adminApi<Paginated<ChangeQueueItem>>(`${P}/credit-change-requests`, { query: p, signal }), placeholderData: keepPreviousData });
export const useGuaranteeRequirement = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...K.one(id), 'guarantee-requirement'], queryFn: ({ signal }) => adminApi<GuaranteeRequirement | null>(`${P}/profiles/${id}/guarantees/requirement`, { signal }), enabled });
export function useGuaranteeWrite(customerId: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: K.one(customerId) });
  const create = useMutation({ mutationFn: (fd: FormData) => adminApi<Guarantee>(`${P}/profiles/${customerId}/guarantees`, { method: 'POST', body: fd }), onSuccess: done });
  const update = useMutation({ mutationFn: (v: { id: string; body: Record<string, unknown> }) => adminApi<Guarantee>(`${P}/guarantees/${v.id}`, { method: 'PATCH', body: v.body }), onSuccess: done });
  const replaceFile = useMutation({ mutationFn: (v: { id: string; file: File }) => { const fd = new FormData(); fd.append('file', v.file); return adminApi<Guarantee>(`${P}/guarantees/${v.id}/file`, { method: 'PUT', body: fd }); }, onSuccess: done });
  const activate = useMutation({ mutationFn: (gid: string) => adminApi<Guarantee>(`${P}/guarantees/${gid}/activate`, { method: 'PATCH' }), onSuccess: done });
  const release = useMutation({ mutationFn: (v: { id: string; note: string }) => adminApi<Guarantee>(`${P}/guarantees/${v.id}/release`, { method: 'PATCH', body: { confirm_no_open_balance: true, note: v.note } }), onSuccess: done });
  const requirement = useMutation({ mutationFn: (body: { credit_account_id?: string | null; required_type: string; required_amount: string; reason: string; expected_version: number }) => adminApi<GuaranteeRequirement>(`${P}/profiles/${customerId}/guarantees/requirement`, { method: 'PUT', body }), onSuccess: done });
  const gate = useMutation({ mutationFn: (v: { open: boolean; reason: string; expected_version: number }) => adminApi<AdminSchemas['CustomerGuaranteeGateStatusOut']>(`${P}/profiles/${customerId}/guarantees/${v.open ? 'open-upload' : 'close-upload'}`, { method: 'PATCH', body: { reason: v.reason, expected_version: v.expected_version } }), onSuccess: done });
  const approveSubmission = useMutation({ mutationFn: (v: { guarantee_ids: string[]; expected_version: number }) => adminApi<Guarantee[]>(`${P}/profiles/${customerId}/guarantees/approve-submission`, { method: 'PATCH', body: v }), onSuccess: done });
  /** اصلاح ضمانت فعال (پرهام 2026-10-22): سند قبلی RELEASED، سند جایگزین PENDING_APPROVAL؛ multipart: file، data (JSON)، reason، confirm_no_open_balance */
  const correct = useMutation({
    mutationFn: (v: { id: string; file: File; data: Record<string, unknown>; reason?: string; confirm_no_open_balance: boolean }) => {
      const fd = new FormData(); fd.append('file', v.file); fd.append('data', JSON.stringify(v.data));
      if (v.reason) fd.append('reason', v.reason);
      fd.append('confirm_no_open_balance', String(v.confirm_no_open_balance));
      return adminApi<Guarantee>(`${P}/guarantees/${v.id}/correction`, { method: 'PATCH', body: fd });
    },
    onSuccess: () => { done(); qc.invalidateQueries({ queryKey: ['customers', 'credit-account'] }); },
  });
  return { create, update, replaceFile, activate, release, requirement, gate, approveSubmission, correct };
}

// ── قفل مالی ──
export const useLocks = (id: string, enabled: boolean, p: ListParams) =>
  useQuery({ queryKey: [...K.one(id), 'locks', p], queryFn: ({ signal }) => adminApi<Paginated<CreditLock>>(`${P}/profiles/${id}/locks`, { query: p, signal }), enabled, placeholderData: keepPreviousData });
export function useLockWrite(customerId: string) {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: K.one(customerId) }); qc.invalidateQueries({ queryKey: K.list }); };
  const manual = useMutation({ mutationFn: (note: string) => adminApi<CreditLock>(`${P}/profiles/${customerId}/manual-lock`, { method: 'PUT', body: { note } }), onSuccess: done });
  const suspend = useMutation({ mutationFn: (v: { id: string; until: string; personnel_code: string; note: string }) => adminApi<CreditLock>(`${P}/locks/${v.id}/suspend`, { method: 'PATCH', body: { until: v.until, personnel_code: v.personnel_code, note: v.note } }), onSuccess: done });
  const release = useMutation({ mutationFn: (v: { id: string; note: string }) => adminApi<CreditLock>(`${P}/locks/${v.id}/release`, { method: 'PATCH', body: { note: v.note } }), onSuccess: done });
  return { manual, suspend, release };
}
