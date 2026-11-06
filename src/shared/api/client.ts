import { ApiError, networkError, type ApiErrorBody } from './errors';

/**
 * کلاینت HTTP مشترک همه‌ی دامنه‌ها.
 * - access token فقط در حافظه (نه localStorage) نگه داشته می‌شود.
 * - refresh token کوکی HttpOnly است که بک‌اند می‌گذارد؛ JS آن را نمی‌بیند.
 * - روی 401 یک بار refresh و تکرار درخواست؛ refresh بین تب‌ها با Web Locks سریال می‌شود
 *   چون بک‌اند refresh را می‌چرخاند (rotation) و استفاده‌ی دوباره را رد می‌کند.
 * - شعبه‌ی فعال در هدر X-Branch-ID به پنل admin فرستاده می‌شود (ADR 0004).
 */

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export type Panel = 'admin' | 'public';
type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue | QueryValue[]>;
  body?: unknown;
  /** پیش‌فرض: true. برای endpointهای عمومی بدون توکن false بدهید. */
  auth?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** پاسخ را به‌صورت Blob برگردان (دانلود فایل). */
  raw?: boolean;
};

// ── access token ─────────────────────────────────────────────────────────────
let accessToken: string | null = null;
export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
};

// ── active branch (X-Branch-ID) ──────────────────────────────────────────────
const BRANCH_KEY = 'zm.admin.activeBranchId';
function readBranch(): string | null {
  try {
    return localStorage.getItem(BRANCH_KEY);
  } catch {
    return null;
  }
}
let activeBranchId: string | null = readBranch();
export const branchStore = {
  get: () => activeBranchId,
  set: (id: string | null) => {
    activeBranchId = id;
    try {
      if (id) localStorage.setItem(BRANCH_KEY, id);
      else localStorage.removeItem(BRANCH_KEY);
    } catch {
      /* حالت خصوصی مرورگر */
    }
  },
};

// ── session expiry callback ──────────────────────────────────────────────────
let sessionExpiredHandler: (() => void) | null = null;
export function onSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

// ── refresh (single-flight + cross-tab lock) ─────────────────────────────────
type TokenPair = { access_token: string; token_type: string; expires_in: number };
let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/public/auth/token/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      tokenStore.set(null);
      return false;
    }
    const data = (await res.json()) as TokenPair;
    tokenStore.set(data.access_token);
    return true;
  } catch {
    return false;
  }
}

/** توکن تازه از کوکی refresh می‌گیرد. چند فراخوانی هم‌زمان یک درخواست می‌شوند. */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const run = (): Promise<boolean> => doRefresh();
  const locked: Promise<boolean> =
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? navigator.locks.request('zm-admin-refresh', run).then((ok) => ok) // تایپ lib.dom قول تودرتو می‌دهد
      : run();
  const pending = locked.finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = pending;
  return pending;
}

// ── core request ─────────────────────────────────────────────────────────────
function buildUrl(panel: Panel, path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}/${panel}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null || v === '') continue;
      params.append(key, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(panel: Panel, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const token = tokenStore.get();
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  const branch = branchStore.get();
  if (panel === 'admin' && branch) headers['X-Branch-ID'] = branch;

  try {
    return await fetch(buildUrl(panel, path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw networkError();
  }
}

async function toError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const retry = Number(res.headers.get('Retry-After'));
  return new ApiError(res.status, body, res.headers.get('X-Request-ID'), Number.isFinite(retry) && retry > 0 ? retry : null);
}

export async function apiRequest<T>(panel: Panel, path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(panel, path, opts);

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await send(panel, path, opts);
    if (res.status === 401) {
      tokenStore.set(null);
      sessionExpiredHandler?.();
    }
  }

  if (!res.ok) throw await toError(res);
  if (opts.raw) return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const adminApi = <T>(path: string, opts?: RequestOptions) => apiRequest<T>('admin', path, opts);
export const publicApi = <T>(path: string, opts?: RequestOptions) => apiRequest<T>('public', path, opts);
