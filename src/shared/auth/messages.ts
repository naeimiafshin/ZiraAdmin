import { ApiError, userMessage } from '@/shared/api/errors';

/**
 * نگاشت پاسخ‌های identity به فارسی. متن‌ها از
 * domains/identity/services/auth_service.py و core/rbac/auth.py گرفته شده‌اند.
 */
const LOGIN_DETAIL: Record<string, string> = {
  'Invalid username or password.': 'نام کاربری یا رمز عبور اشتباه است.',
  'User account is inactive or suspended.':
    'حساب کاربری شما غیرفعال یا تعلیق شده است. برای پیگیری با مدیر سیستم تماس بگیرید.',
  'Account is temporarily locked. Please try again later.':
    'حساب شما به‌طور موقت قفل شده است. کمی بعد دوباره تلاش کنید.',
  'Account temporarily locked due to multiple failed login attempts.':
    'به‌دلیل چند تلاش ناموفق، ورود به این حساب تا ۱۵ دقیقه قفل شده است.',
  'Customer accounts are not authorized to access administrative endpoints.':
    'این حساب، حساب مشتری است و به پنل مدیریت دسترسی ندارد.',
  'Staff user has multiple active roles. Data resolution required. Multi-role state is fail-closed.':
    'برای حساب شما بیش از یک نقش فعال ثبت شده است. تا اصلاح آن توسط مدیر سیستم، ورود ممکن نیست.',
  // ارسال دوباره‌ی کد ورود (همان سقف OTP مشتری؛ otp_service.py)
  'Too many OTP requests for this phone number. Please wait 10 minutes.':
    'برای این شماره در ۱۰ دقیقه‌ی اخیر بیش از ۳ پیامک فرستاده شده است. ۱۰ دقیقه بعد دوباره تلاش کنید.',
  'Too many requests from this IP address.': 'درخواست‌های این دستگاه زیاد بوده است. کمی بعد دوباره تلاش کنید.',
};

/** خطاهای ورود دو مرحله‌ای و رمز منقضی (2026-10-25)؛ متن فارسی بک‌اند هم هست ولی متن ثابت فرانت پایدارتر است. */
const LOGIN_CODE: Record<string, string> = {
  two_factor_invalid_code: 'کد واردشده درست نیست. هر کد اشتباه یک تلاش ناموفق ورود حساب می‌شود.',
  two_factor_challenge_expired: 'کد ورود منقضی شده یا تعداد تلاش‌ها تمام شده است. دوباره با نام کاربری و رمز وارد شوید.',
  two_factor_phone_missing: 'برای نقش شما ورود دو مرحله‌ای الزامی است ولی شماره‌ی موبایلی برایتان ثبت نشده است. با مدیر سامانه تماس بگیرید.',
  password_change_token_invalid: 'مهلت تغییر رمز تمام شده است. دوباره با نام کاربری و رمز فعلی وارد شوید.',
};

/**
 * قواعد رمز سیاست امنیتی (domains/events/models/security_policy.py ⇐ validate_password) به انگلیسی و با «; » پشت هم می‌آیند؛
 * هر خط جدا فارسی می‌شود. در تغییر رمز منقضی و بازیابی رمز استفاده می‌شود.
 */
const PASSWORD_RULE: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Password must be at least (\d+) characters long\.?$/, (m) => `رمز عبور باید دست‌کم ${m[1]} نویسه باشد.`],
  [/^Password must contain at least one digit/, () => 'رمز عبور باید دست‌کم یک رقم داشته باشد.'],
  [/^Password must contain at least one uppercase letter/, () => 'رمز عبور باید دست‌کم یک حرف بزرگ انگلیسی داشته باشد.'],
  [/^Password must contain at least one special symbol/, () => 'رمز عبور باید دست‌کم یک نشانه (مثل ! یا @) داشته باشد.'],
  [/^New password cannot be the same as a recently used password/, () => 'رمز تازه نباید با رمزهای اخیر شما یکی باشد.'],
];

function passwordPolicyMessage(text: string): string | null {
  const parts = text.split(/;\s*/).map((t) => t.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out: string[] = [];
  for (const part of parts) {
    const rule = PASSWORD_RULE.find(([re]) => re.test(part));
    const m = rule ? part.match(rule[0]) : null;
    if (!rule || !m) return null;
    out.push(rule[1](m));
  }
  // هر قاعده در یک سطر (نمایش با white-space: pre-line)
  return out.join('\n');
}

/** خطاهای بازیابی رمز (password_reset_challenge.py). */
const RECOVERY_CODE: Record<string, string> = {
  password_reset_invalid: 'کد درست نیست یا مهلت آن تمام شده است.',
  password_mismatch: 'تکرار رمز با رمز جدید یکی نیست.',
};

/** درخواست بازیابی دیگر معتبر نیست ⇐ از گام اول (نام کاربری) دوباره. */
export const RECOVERY_RESTART_CODE = 'password_reset_invalid';

const waitText = (sec: number) => (sec >= 90 ? `${Math.ceil(sec / 60)} دقیقه` : `${sec} ثانیه`);

export function recoveryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) return 'بازیابی رمز عبور فعلاً در دسترس نیست. برای بازنشانی رمز با مدیر سیستم تماس بگیرید.';
    if (error.status === 429) {
      const base = /[؀-ۿ]/.test(error.detailText) ? error.detailText : 'درخواست‌ها بیش از حد مجاز بوده است.';
      return error.retryAfter ? `${base} ${waitText(error.retryAfter)} دیگر دوباره تلاش کنید.` : base;
    }
    const byCode = RECOVERY_CODE[error.code];
    if (byCode) return byCode;
    const policy = passwordPolicyMessage(error.detailText);
    if (policy) return policy;
    if (error.status < 500 && /[؀-ۿ]/.test(error.detailText)) return error.detailText;
    if (error.status === 422) return 'مقدار واردشده معتبر نیست.';
  }
  return userMessage(error);
}

/** خطایی که کاربر را به فرم نام کاربری و رمز برمی‌گرداند (چالش یا مهلت تغییر رمز دیگر معتبر نیست). */
export const RESTART_LOGIN_CODES = new Set(['two_factor_challenge_expired', 'password_change_token_invalid']);

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const byCode = LOGIN_CODE[error.code];
    if (byCode) return byCode;
    const mapped = LOGIN_DETAIL[error.detailText];
    if (mapped) return mapped;
    const policy = passwordPolicyMessage(error.detailText);
    if (policy) return policy;
    // پیام فارسی بک‌اند (مثلاً قواعد رمز در تغییر رمز منقضی) همان‌طور
    if (error.status < 500 && /[؀-ۿ]/.test(error.detailText)) return error.detailText;
    if (error.status === 429) return LOGIN_DETAIL['Account temporarily locked due to multiple failed login attempts.']!;
    if (error.status === 401) return LOGIN_DETAIL['Invalid username or password.']!;
    if (error.status === 403) return 'این حساب به پنل مدیریت دسترسی ندارد.';
  }
  return userMessage(error);
}
