import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/shared/auth/useAuth';

/**
 * ستون‌های قابل‌نمایش یک جدول، جدا برای هر کاربر (افشین 2026-10-21).
 * ذخیره در localStorage با کلید «کاربر + جدول» ⇐ بعد از خروج و ورود دوباره (در همان مرورگر) همان تنظیم برمی‌گردد.
 * فقط ستون‌های «پنهان» ذخیره می‌شوند ⇐ ستونی که بعداً به جدول اضافه شود، پیش‌فرض نمایش داده می‌شود.
 * ستون‌های fixed هرگز پنهان نمی‌شوند. خواندن/نوشتن در try/catch (حالت خصوصی مرورگر).
 */
/** fixed ⇐ همیشه دیده می‌شود؛ soon ⇐ ستون طرح (html) که بک‌اند هنوز داده‌اش را نمی‌دهد: در فهرست با «به‌زودی»، غیرفعال و پنهان */
export type ColumnOption = { key: string; label: string; fixed?: boolean; soon?: boolean };

const storageKey = (userId: string, table: string) => `zm.admin.table.${table}.hidden.${userId}`;

function read(key: string | null): string[] | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export function useColumnPrefs(table: string, options: ColumnOption[], defaultHidden: string[] = []) {
  const { user } = useAuth();
  const key = user ? storageKey(user.id, table) : null;
  const [hidden, setHidden] = useState<string[]>(() => read(key) ?? defaultHidden);
  // کاربر عوض شد (خروج و ورود با حساب دیگر) ⇐ تنظیم همان کاربر
  useEffect(() => { setHidden(read(key) ?? defaultHidden); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const fixed = useMemo(() => new Set(options.filter((o) => o.fixed).map((o) => o.key)), [options]);
  const soon = useMemo(() => new Set(options.filter((o) => o.soon).map((o) => o.key)), [options]);
  const save = useCallback((next: string[]) => {
    const clean = next.filter((k) => !fixed.has(k));
    setHidden(clean);
    if (key) {
      try { localStorage.setItem(key, JSON.stringify(clean)); } catch { /* ذخیره نشد؛ فقط همین نشست */ }
    }
  }, [key, fixed]);
  const isVisible = useCallback((k: string) => !soon.has(k) && (fixed.has(k) || !hidden.includes(k)), [hidden, fixed, soon]);
  const toggle = useCallback((k: string) => save(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]), [hidden, save]);
  const reset = useCallback(() => save(defaultHidden), [save, defaultHidden]);
  const visibleCount = options.filter((o) => isVisible(o.key)).length;
  return { isVisible, toggle, reset, visibleCount, options };
}
