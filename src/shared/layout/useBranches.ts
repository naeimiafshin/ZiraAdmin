import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/useAuth';

export type BranchOption = Pick<AdminSchemas['BranchListOut'], 'id' | 'code' | 'name' | 'status' | 'province' | 'city' | 'full_address'>;

/**
 * نام شعب کاربر از GET /organization/branches (selector بک‌اند خودش به شعب کاربر محدود می‌کند).
 * این endpoint مجوز organization.branches.list می‌خواهد؛ کاربر بدون آن فقط شناسه‌ها را دارد
 * (endpoint «شعب من» در بک‌اند نیست — گزارش‌شده).
 */
export function useBranchOptions() {
  const { user } = useAuth();
  const canList = !!user && (user.is_superuser || (user.permission_codes ?? []).includes('organization.branches.list'));
  const q = useQuery({
    queryKey: ['organization', 'branches', 'picker', user?.id],
    enabled: canList,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const all: BranchOption[] = [];
      for (let page = 1; page < 50; page++) {
        const res = await adminApi<Paginated<AdminSchemas['BranchListOut']>>('/organization/branches', {
          query: { page, page_size: 100 },
          signal,
        });
        all.push(...res.results.map(({ id, code, name, status, province, city, full_address }) => ({ id, code, name, status, province, city, full_address })));
        if (all.length >= res.total || res.results.length === 0) break;
      }
      return all;
    },
  });
  return { ...q, canList };
}
