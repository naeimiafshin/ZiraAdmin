import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, userMessage } from './errors';

/**
 * خطای 422 (اسکیما) یا 400 (اعتبارسنجی دامنه) بک‌اند را روی فیلدهای فرم می‌نشاند.
 * map: نام فیلد بک‌اند ⇐ نام فیلد فرم (اگر فرق دارد). خروجی: پیام‌هایی که فیلد نداشتند.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: string[], map: Record<string, string> = {}): string[] {
  if (!(error instanceof ApiError)) return [userMessage(error)];
  const rest: string[] = [];
  // 409 تکراری بودن (مثل «User with national ID ... already exists») ⇐ روی همان فیلد
  if (error.status === 409) {
    const dup: [RegExp, string][] = [
      [/national/i, 'national_id'], [/phone|mobile/i, 'phone_number'], [/username/i, 'username'],
      [/card/i, 'card_no'], [/iban|sheba/i, 'iban'], [/account/i, 'account_no'], [/code/i, 'code'], [/email/i, 'email'],
    ];
    const hit = dup.find(([r, f]) => r.test(error.detailText) && fields.includes(map[f] ?? f));
    if (hit) {
      setError((map[hit[1]] ?? hit[1]) as Path<T>, { type: 'server', message: 'این مقدار قبلاً برای کاربر دیگری ثبت شده است.' });
      return ['برخی مقادیر تکراری است؛ فیلد مشخص‌شده را اصلاح کنید.'];
    }
    return [userMessage(error)];
  }
  // فقط خطاهای اعتبارسنجی روی فیلدها می‌نشینند؛ بقیه (404، 403، 5xx) پیام عمومی فارسی
  if (error.status !== 400 && error.status !== 422) return [userMessage(error)];
  const put = (field: string, msg: string) => {
    const f = map[field] ?? field;
    if (fields.includes(f)) setError(f as Path<T>, { type: 'server', message: faMsg(msg) });
    else rest.push(faMsg(msg));
  };
  const d = error.detail;
  if (Array.isArray(d)) {
    for (const e of d as { loc?: (string | number)[]; msg?: string }[]) {
      const loc = (e.loc ?? []).filter((x) => typeof x === 'string' && !['body', 'payload', 'query', 'path'].includes(x as string)) as string[];
      put(loc[0] ?? '', e.msg ?? '');
    }
  } else if (d && typeof d === 'object') {
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) put(k, Array.isArray(v) ? String(v[0]) : String(v));
  } else if (typeof d === 'string') {
    rest.push(faMsg(d));
  }
  return rest;
}

/** پیام‌های انگلیسی رایج اعتبارسنجی ⇐ فارسی (پیام فارسی همان می‌ماند). */
function faMsg(m: string): string {
  if (/[؀-ۿ]/.test(m)) return m;
  const rules: [RegExp, string][] = [
    [/National ID/i, 'کد ملی معتبر نیست.'],
    [/IBAN/i, 'شماره شبا معتبر نیست.'],
    [/Card number/i, 'شماره کارت باید ۱۶ رقم باشد.'],
    [/Postal code/i, 'کد پستی باید ۱۰ رقم باشد.'],
    [/Birth date/i, 'تاریخ تولد معتبر نیست.'],
    [/Phone number|mobile/i, 'شماره موبایل معتبر نیست.'],
    [/already exists|unique|duplicate/i, 'این مقدار قبلاً ثبت شده است.'],
    [/password/i, 'رمز عبور با سیاست امنیتی سامانه سازگار نیست.'],
    [/document slot/i, 'مدارک الزامی کامل نیست.'],
    [/Commission/i, 'درصد پورسانت باید بین ۰٫۰۱ و ۱۰۰ باشد.'],
    [/required|missing/i, 'این فیلد الزامی است.'],
    [/empty/i, 'این فیلد نباید خالی باشد.'],
  ];
  return rules.find(([r]) => r.test(m))?.[1] ?? 'مقدار واردشده معتبر نیست.';
}
