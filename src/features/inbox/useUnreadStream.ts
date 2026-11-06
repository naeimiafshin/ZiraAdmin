import { useEffect, useRef, useState } from 'react';
import { API_BASE, refreshAccessToken, tokenStore } from '@/shared/api/client';
import { fetchUnread } from './api';

type Sync = { unread_count: number; reason: string; refresh_required?: boolean };

/**
 * شمار اعلان‌های خوانده‌نشده با یک اتصال SSE برای کل برنامه (fetch + ReadableStream؛ EventSource هدر Authorization ندارد).
 * قرارداد بک‌اند: notifications.sync / auth.required / stream.error، heartbeat هر ۱۵ ثانیه، عمر اتصال ۲۴۰ ثانیه.
 * اگر استریم در دسترس نبود (503 یا خطا)، هر ۳۰ ثانیه `unread-count` خوانده و هر دقیقه دوباره برای استریم تلاش می‌شود.
 */
export function useUnreadStream(enabled: boolean, onChange: () => void): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let ctl: AbortController | null = null;
    let poll: number | undefined;
    let retry: number | undefined;
    let watchdog: number | undefined;

    const startPolling = () => {
      if (poll) return;
      const tick = () => { fetchUnread().then((n) => { setCount(n); }).catch(() => undefined); };
      tick();
      poll = window.setInterval(tick, 30_000);
    };
    const stopPolling = () => { if (poll) { clearInterval(poll); poll = undefined; } };
    const later = (ms: number) => { if (!stopped) retry = window.setTimeout(connect, ms); };

    async function connect(): Promise<void> {
      if (stopped) return;
      ctl = new AbortController();
      const kick = () => { clearTimeout(watchdog); watchdog = window.setTimeout(() => ctl?.abort(), 35_000); };
      try {
        const res = await fetch(`${API_BASE}/admin/auth/me/notifications/stream`, {
          headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache', ...(tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {}) },
          credentials: 'include', signal: ctl.signal,
        });
        if (res.status === 401) { if (await refreshAccessToken()) return later(0); startPolling(); return later(60_000); }
        if (res.status === 429) { startPolling(); return later(Number(res.headers.get('Retry-After') ?? 5) * 1000); }
        if (!res.ok || !res.body || !(res.headers.get('Content-Type') ?? '').includes('text/event-stream')) { startPolling(); return later(60_000); }
        stopPolling();
        kick();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          kick();
          buf += value;
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i); buf = buf.slice(i + 2);
            let ev = 'message'; let data = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) ev = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (ev === 'notifications.sync' && data) {
              const s = JSON.parse(data) as Sync;
              setCount(s.unread_count);
              if (s.reason !== 'reconcile' || s.refresh_required) cb.current();
            } else if (ev === 'auth.required') {
              ctl.abort(); await refreshAccessToken(); return later(0);
            } else if (ev === 'stream.error') {
              ctl.abort(); return later(4000);
            }
          }
        }
        later(300); // پایان عادی عمر اتصال ⇐ اتصال تازه
      } catch {
        if (stopped) return;
        startPolling(); later(5000);
      } finally {
        clearTimeout(watchdog);
      }
    }
    void connect();
    return () => { stopped = true; ctl?.abort(); stopPolling(); clearTimeout(retry); clearTimeout(watchdog); };
  }, [enabled]);

  // پس از seen/dismiss: اگر استریم وصل باشد خودش sync می‌فرستد؛ این برای حالت polling است
  const refresh = () => { if (enabled) fetchUnread().then(setCount).catch(() => undefined); };
  return { count, refresh };
}
