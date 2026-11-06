/**
 * حل آدرس‌های رسانه‌ای کاتالوگ، برند و کمپین.
 * - آدرس‌های کامل اینترنتی (https://, http://), blob: یا data: بدون تغییر برمی‌گردند.
 * - در صورت تعیین VITE_MEDIA_BASE_URL (برای استقرار پروداکشن یا CDN)، آدرس نسبی با آن ترکیب می‌شود.
 * - در حالت پیش‌فرض محلی، مسیر نسبی (/media/...) حفظ می‌شود تا سرور Vite آن را مستقیماً از پوشه ریشه ./media بخواند.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // نشانی‌های کامل وب، داده‌ای یا blob بدون تغییر می‌مانند
  if (/^(?:https?:|\/\/|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const envMedia = (typeof import.meta !== 'undefined'
    ? (import.meta.env?.VITE_MEDIA_BASE_URL as string | undefined)
    : undefined)?.trim();

  // اگر کاربر مبدأ رسانه مشخصی تعیین کرده باشد (مثلاً در استقرار پروداکشن)
  if (envMedia) {
    return `${envMedia.replace(/\/+$/, '')}${cleanPath}`;
  }

  // در حالت پیش‌فرض و لوکال، مسیر نسبی حفظ می‌شود تا سرور Vite آن را از پوشه ./media بخواند
  return cleanPath;
}
