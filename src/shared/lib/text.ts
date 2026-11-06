/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند (هم‌راستا با core/text.py در بک‌اند). */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** ارقام لاتین را برای نمایش فارسی می‌کند. */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
}
