/**
 * شکل خطای یکسان بک‌اند (core/exceptions.py):
 *   { detail, code, status_code, request_id?, ...extra }
 * خطای 422 اسکیما: detail آرایه‌ای از خطاهای فیلد است.
 */
export type ApiErrorBody = {
  detail?: unknown;
  code?: string;
  status_code?: number;
  request_id?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;
  readonly requestId: string | null;
  readonly body: ApiErrorBody | null;
  /** ثانیه‌های انتظار از هدر `Retry-After` (پاسخ ۴۲۹)؛ null اگر نیامده باشد. */
  readonly retryAfter: number | null;

  constructor(status: number, body: ApiErrorBody | null, requestId: string | null, retryAfter: number | null = null) {
    const detail = body?.detail;
    super(typeof detail === 'string' ? detail : `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? (status === 0 ? 'network_error' : `http_${status}`);
    this.detail = detail;
    this.requestId = body?.request_id ?? requestId;
    this.body = body;
    this.retryAfter = retryAfter;
  }

  /**
   * متن detail: رشته همان‌طور؛ خطای فیلدی دامنه‌ها (`{field: [پیام‌ها]}`، ValidationError با ۴۰۰) و آرایه‌ی ۴۲۲ (`[{msg}]`)
   * به یک متن خوانا تبدیل می‌شود تا پیام واقعی بک‌اند به‌جای پیام عمومی نشان داده شود (2026-10-22).
   */
  get detailText(): string {
    return flattenDetail(this.detail);
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

function flattenDetail(d: unknown): string {
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' && typeof (x as { msg?: unknown }).msg === 'string' ? (x as { msg: string }).msg : '')).filter(Boolean).join('؛ ');
  if (d && typeof d === 'object') return Object.values(d as Record<string, unknown>).map(flattenDetail).filter(Boolean).join('؛ ');
  return '';
}

export function networkError(): ApiError {
  return new ApiError(0, { code: 'network_error' }, null);
}

const GENERIC: Record<number, string> = {
  0: 'ارتباط با سرور برقرار نشد. اتصال شبکه یا در دسترس بودن سرور را بررسی کنید.',
  400: 'درخواست معتبر نیست.',
  401: 'نشست شما به پایان رسیده است. دوباره وارد شوید.',
  403: 'به این بخش دسترسی ندارید.',
  404: 'مورد درخواستی پیدا نشد.',
  409: 'این تغییر با وضعیت فعلی داده‌ها تداخل دارد. صفحه را تازه کنید و دوباره تلاش کنید.',
  422: 'برخی مقادیر واردشده معتبر نیستند.',
  429: 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.',
  500: 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.',
  502: 'سرور در دسترس نیست. کمی بعد دوباره تلاش کنید.',
  503: 'سرویس موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.',
};

/**
 * پیام فارسی برای کاربر. پیام‌های فارسی بک‌اند (مثل 409 و ValidationError دامنه‌ها)
 * همان‌طور نمایش داده می‌شوند؛ پیام انگلیسی با پیام عمومی وضعیت جایگزین می‌شود.
 */
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC[0]!;
  const text = error.detailText;
  if (text && /[؀-ۿ]/.test(text)) return text;
  const base = GENERIC[error.status] ?? (error.status >= 500 ? GENERIC[500]! : GENERIC[400]!);
  if (error.status < 500) return base;
  // خطای سرور: کد پیگیری برای یافتن رد خطا در لاگ بک‌اند؛ در محیط توسعه متن خود خطا هم
  const parts = [base];
  if (error.requestId) parts.push(`کد پیگیری: ${error.requestId}`);
  if (import.meta.env.DEV && text) parts.push(`(${text})`);
  return parts.join(' — ');
}
