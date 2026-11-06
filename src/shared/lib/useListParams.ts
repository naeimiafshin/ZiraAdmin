import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounced } from './useDebounced';
import { useSearchParams } from 'react-router';

/**
 * حالت لیست‌ها (صفحه، اندازه‌ی صفحه، جست‌وجو، فیلترها، تب) در URL نگه داشته می‌شود تا «بازگشت» دقیقاً همان
 * حالت را برگرداند (افشین 2026-10-22؛ RULES ۵-۴). همه‌ی تغییرها با replace تا در تاریخچه نیایند.
 * هر تغییرِ غیر از صفحه، شماره‌ی صفحه را به ۱ برمی‌گرداند.
 */
export function useListParams(defaults: { page_size?: number } = {}) {
  const [sp, setSp] = useSearchParams();
  const defaultSize = defaults.page_size ?? 10;
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = Number(sp.get('page_size')) || defaultSize;
  const q = sp.get('query') ?? '';
  const get = useCallback((k: string) => sp.get(k) ?? '', [sp]);
  // setSearchParams(fn) در React Router مقدار prev را از همان render می‌گیرد؛ چند set پشت سر هم در یک رویداد
  // (مثل «حذف فیلترها» که هر فیلتر را جدا خالی می‌کند) همدیگر را بازنویسی می‌کردند و فقط آخری می‌ماند (2026-10-24).
  // ⇐ آخرین مقدار درخواست‌شده تا render بعدی در ref نگه داشته و مبنای set بعدی می‌شود.
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => { pending.current = null; }, [sp]);
  const set = useCallback(
    (patch: Record<string, string | number | null | undefined>, opts?: { keepPage?: boolean }) => {
      const next = new URLSearchParams(pending.current ?? sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (!opts?.keepPage) next.delete('page');
      pending.current = next;
      setSp(next, { replace: true });
    },
    [setSp, sp],
  );
  return {
    page,
    pageSize,
    q,
    get,
    set,
    setPage: (p: number) => set({ page: p > 1 ? p : null }, { keepPage: true }),
    setPageSize: (n: number) => set({ page_size: n === defaultSize ? null : n }),
    setQ: (v: string) => set({ query: v }),
    /** فیلتر با کلید ثابت؛ مقدار خالی = «همه» */
    setFilter: (k: string) => (v: string) => set({ [k]: v }),
    /** تب صفحه (`tab`)؛ تغییر تب فیلترهای تب قبلی را پاک نمی‌کند */
    tab: sp.get('tab') ?? '',
    setTab: (t: string) => set({ tab: t }),
  };
}

/**
 * متن جست‌وجو: ورودی کنترل‌شده با حالت محلی (تا تایپ سریع با رفت‌وبرگشت URL حرفی را گم نکند) و
 * نسخه‌ی تأخیری (`dq`) که به URL و درخواست می‌رود. پاک شدن `query` از بیرون (مثلاً تغییر تب) ورودی را خالی می‌کند.
 */
export function useSearchState(lp: Pick<ReturnType<typeof useListParams>, 'q' | 'setQ'>, ms = 350) {
  const [text, setText] = useState(lp.q);
  const dq = useDebounced(text.trim(), ms);
  const setQ = lp.setQ;
  useEffect(() => { if (dq !== lp.q) setQ(dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (lp.q !== text.trim() && lp.q !== dq) setText(lp.q); }, [lp.q]); // eslint-disable-line react-hooks/exhaustive-deps
  return { text, setText, dq };
}
