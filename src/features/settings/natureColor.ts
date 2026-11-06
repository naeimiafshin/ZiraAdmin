/**
 * رنگ کارت «ماهیت کمپین» (تنظیمات ⇐ ماهیت‌های کمپین، 2026-10-24). مشترک بین صفحه‌ی تنظیمات و کارت‌ها/فرم کمپین‌ها.
 * رنگ خالی یا نامعتبر = رنگ پیش‌فرض فرانت (رنگ ماهیت «تخفیفی»، همان پیش‌فرض قبلی کارت کمپین).
 */
export const DEFAULT_NATURE_COLOR = '#D64F57';
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** سربرگ کارت کمپین: گرادیان ۱۳۵ درجه از نسخه‌ی روشن‌تر رنگ تا خود رنگ */
export function natureGradient(color?: string | null): string {
  const c = color && HEX_COLOR.test(color) ? color : DEFAULT_NATURE_COLOR;
  const n = parseInt(c.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.18);
  const light = `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('')}`;
  return `linear-gradient(135deg,${light},${c})`;
}
