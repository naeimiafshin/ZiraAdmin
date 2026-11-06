import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/useAuth';
import { EXTRA_PAGES, HIDDEN_PAGES, IA_GROUPS, MERGED_INTO, NAME_OVERRIDES, SOON_PAGES, isModuleDashboard, toAppRoute, type NavIcon } from './navConfig';

type MenuItem = AdminSchemas['MenuItemOut'];

export type NavLeaf = { key: string; name: string; route: string; icon: string; /** زیرصفحه (└) مثل «تعریف ماتریسی کالا» زیر «کالاها» */ sub?: boolean; /** صفحه‌ی html بدون بک‌اند ⇐ غیرفعال با «به‌زودی» */ soon?: boolean };
export type NavSection = { title: string; items: NavLeaf[] };
export type NavGroup = {
  code: string; name: string; sub: string; icon: NavIcon;
  route: string | null; items: NavLeaf[]; sections: NavSection[]; notBuilt: boolean; firstRoute: string | null;
};

/** GET /rbac/me/menu — منوی مجاز کاربر (فیلترشده با مجوزها در بک‌اند). */
export function useMenuQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rbac', 'me', 'menu', user?.id],
    queryFn: ({ signal }) => adminApi<MenuItem[]>('/rbac/me/menu', { signal }),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

/** ۱۵ منوی IA (نام و ترتیب) + صفحه‌های واقعی بک‌اند + بخش‌بندی پنل. */
export function useNav() {
  const q = useMenuQuery();
  const { user } = useAuth();
  const groups = useMemo<NavGroup[]>(() => {
    const has = (code: string) => !!user && (user.is_superuser || (user.permission_codes ?? []).includes(code));
    const byCode = new Map((q.data ?? []).map((g) => [g.code, g]));
    const out: NavGroup[] = [];
    for (const ia of IA_GROUPS) {
      if (ia.off) {
        // خاموش با تصمیم افشین (2026-10-24): بدون صفحه و بدون مسیر، «به‌زودی» برای همه
        out.push({ code: ia.code, name: ia.name, sub: ia.sub, icon: ia.icon, route: null, items: [], sections: [], notBuilt: true, firstRoute: null });
        continue;
      }
      const g = byCode.get(ia.code);
      const codes = new Set((g?.children ?? []).map((c) => c.full_code));
      const merged = (code: string) => { const host = MERGED_INTO[code]; return !!host && codes.has(host); };
      const items: NavLeaf[] = (g?.children ?? [])
        .filter((c) => c.route && !isModuleDashboard(c.full_code, c.route) && !merged(c.full_code) && !HIDDEN_PAGES.has(c.full_code))
        .map((c) => ({ key: c.full_code, name: NAME_OVERRIDES[c.full_code] ?? c.name, route: toAppRoute(c.route), icon: c.icon, soon: SOON_PAGES.has(c.full_code) || undefined }));
      for (const x of EXTRA_PAGES.filter((e) => e.group === ia.code && has(e.perm))) {
        const at = items.findIndex((i) => i.key === x.after);
        items.splice(at >= 0 ? at + 1 : items.length, 0, { key: x.key, name: x.name, route: x.route, icon: x.icon, sub: x.sub, soon: x.soon });
      }
      if (!g && items.length === 0 && !ia.notBuilt) continue;
      const route = g && items.length === 0 && g.route ? toAppRoute(g.route) : null;
      let sections: NavSection[];
      if (ia.sections) {
        const used = new Set<string>();
        sections = ia.sections
          .map((sec) => ({ title: sec.title, items: sec.items.map((k) => items.find((i) => i.key === k)).filter((i): i is NavLeaf => !!i) }))
          .filter((sec) => sec.items.length > 0);
        sections.forEach((sec) => sec.items.forEach((i) => used.add(i.key)));
        const rest = items.filter((i) => !used.has(i.key));
        if (rest.length) sections.push({ title: 'سایر', items: rest });
      } else {
        sections = items.length ? [{ title: ia.name, items }] : [];
      }
      out.push({
        code: ia.code, name: ia.name, sub: ia.sub, icon: ia.icon, route, items, sections,
        notBuilt: !g && items.length === 0 && !!ia.notBuilt,
        firstRoute: route ?? items.find((i) => !i.soon)?.route ?? null,
      });
    }
    return out;
  }, [q.data, user]);
  return { ...q, groups };
}

/** گروه و صفحه‌ی فعلی (برای سربرگ و پنل). */
export function findCurrent(groups: NavGroup[], pathname: string): { group: NavGroup; leaf: NavLeaf | null } | null {
  let best: { group: NavGroup; leaf: NavLeaf | null; len: number } | null = null;
  for (const g of groups) {
    if (g.route && g.route === pathname) return { group: g, leaf: null };
    for (const i of g.items) {
      if (i.soon) continue;
      if ((pathname === i.route || pathname.startsWith(`${i.route}/`)) && (!best || i.route.length > best.len)) best = { group: g, leaf: i, len: i.route.length };
    }
  }
  return best ? { group: best.group, leaf: best.leaf } : null;
}
