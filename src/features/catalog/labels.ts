import type { Tone } from '@/shared/ui/kit';

/** برچسب‌های فارسی enumهای کاتالوگ — مرجع: domains/catalog/schemas/enums.py (نام‌ها از html Fixed V2) */
export const BRAND_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'فعال', tone: 'success' },
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  INACTIVE: { label: 'غیرفعال', tone: 'danger' },
};
export const BRAND_ORIGIN: Record<string, string> = { DOMESTIC: 'داخلی', IMPORTED: 'وارداتی', LICENSED: 'لایسنس' };

export const ATTR_KIND: Record<string, string> = {
  SELECT: 'انتخابی', SWATCH: 'انتخابی (سواچ)', MULTI: 'چندانتخابی', TEXT_SUGGEST: 'متنی / انتخابی',
  NUMBER: 'عددی', BOOL: 'بله/خیر', COMPUTED: 'محاسبه‌شده',
};
export const ATTR_ROLE: Record<string, { label: string; tone: Tone; hint: string }> = {
  VARIANT: { label: 'متغیرساز', tone: 'danger', hint: 'سایز و رنگ؛ ابعاد ماتریس کالا' },
  COMMON: { label: 'مشخصه مشترک', tone: 'info', hint: 'روی خانواده‌ی کالا، در فرم تعریف ماتریسی' },
  ITEM: { label: 'مشخصه آیتم', tone: 'success', hint: 'روی هر آیتم، در فرم ساخت آیتم' },
  DESCRIPTIVE: { label: 'توصیفی', tone: 'warning', hint: 'مشخصات فنی و برچسب‌های نمایشی آیتم' },
  SYSTEM: { label: 'سیستمی', tone: 'neutral', hint: 'محاسبه‌شده توسط سامانه' },
};
export const ATTR_CONTROL: Record<string, string> = {
  CHIP_SINGLE: 'چیپ تک‌انتخابی', CHIP_MULTI: 'چیپ چندانتخابی', DROPDOWN: 'لیست کشویی', SWATCH: 'سواچ رنگ',
  TEXT_SUGGEST: 'ورودی متنی با پیشنهاد', NUMBER: 'ورودی عددی', AUTO: 'خودکار',
};
/** نوع‌هایی که مقدار از پیش‌تعریف‌شده دارند (BR-CAT-058): انتخابی/سواچ/چندانتخابی الزامی، متنی اختیاری */
export const KINDS_WITH_VALUES = new Set(['SELECT', 'SWATCH', 'MULTI', 'TEXT_SUGGEST']);
export const KINDS_REQUIRE_VALUES = new Set(['SELECT', 'SWATCH', 'MULTI']);
/** نقش‌هایی که ادمین می‌تواند بسازد (قید CHECK مدل: فقط COMMON/ITEM/DESCRIPTIVE؛ نوع غیر COMPUTED) */
export const CREATABLE_ROLES = ['COMMON', 'ITEM', 'DESCRIPTIVE'];
export const CREATABLE_KINDS = ['SELECT', 'SWATCH', 'MULTI', 'TEXT_SUGGEST', 'NUMBER', 'BOOL'];
export const SYSTEM_KEY: Record<string, string> = { MATERIAL: 'جنس', MODEL_LINE: 'مدل' };
export const CATEGORY_LEVEL = ['دسته اصلی', 'دسته میانی', 'دسته فرعی'];
export const NAME_PART_ORDER = ['MAIN_CATEGORY', 'MID_CATEGORY', 'SUB_CATEGORY', 'BRAND', 'MATERIAL', 'MODEL_LINE', 'COLOR', 'SIZE', 'BASE_CODE'] as const;
export const NAME_PART_LABELS: Record<string, string> = {
  MAIN_CATEGORY: 'دسته اصلی', MID_CATEGORY: 'دسته میانی', SUB_CATEGORY: 'دسته فرعی', BRAND: 'برند', MATERIAL: 'جنس', MODEL_LINE: 'مدل', COLOR: 'رنگ', SIZE: 'سایز', BASE_CODE: 'کد برند',
};
export const PRODUCT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' }, ACTIVE: { label: 'فعال', tone: 'success' }, ARCHIVED: { label: 'آرشیو', tone: 'danger' },
};
export const ITEM_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' }, ACTIVE: { label: 'فعال', tone: 'success' }, HIDDEN: { label: 'عدم نمایش', tone: 'warning' }, ARCHIVED: { label: 'آرشیو', tone: 'danger' },
};
export const DRAFT_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'باز', tone: 'info' }, CONVERTED: { label: 'تبدیل‌شده', tone: 'success' }, DISCARDED: { label: 'کنارگذاشته', tone: 'neutral' },
};
/** الگوی تنوع آیتم (html V2: «رنگ ثابت — چند سایز» …) */
export const ITEM_PATTERN: Record<string, string> = { FIXED_COLOR: 'رنگ ثابت — چند سایز', FIXED_SIZE: 'سایز ثابت — چند رنگ', FREE: 'ترکیب آزاد' };
/** وضعیت نمایش آیتم مطابق html (نمایش عمومی / گروه مشتریان / عدم نمایش) از status + audience */
export const itemDisplay = (status: string, audience: string): { label: string; tone: Tone } =>
  status === 'ARCHIVED' ? { label: 'آرشیو', tone: 'danger' }
    : status === 'DRAFT' ? { label: 'پیش‌نویس', tone: 'neutral' }
      : status === 'HIDDEN' ? { label: 'عدم نمایش', tone: 'neutral' }
        : audience === 'GROUPS' ? { label: 'گروه مشتریان', tone: 'info' } : { label: 'نمایش عمومی', tone: 'success' };
export const IMAGE_KINDS: { kind: 'MANNEQUIN' | 'DIGIKALA' | 'HUMAN'; label: string; hint: string }[] = [
  // ترتیب نمایش (افشین 2026-10-23): دیجی‌کالایی، مانکنی، انسانی
  { kind: 'DIGIKALA', label: 'تصاویر دیجی‌کالایی', hint: 'پس‌زمینه سفید و زوایای استاندارد — برای مارکت‌پلیس‌ها' },
  { kind: 'MANNEQUIN', label: 'تصاویر مانکنی', hint: 'عکس روی مانکن — برای کارت محصول و لیست‌ها' },
  { kind: 'HUMAN', label: 'تصاویر انسانی', hint: 'عکس روی مدل واقعی — برای صفحه محصول' },
];
export const LINK_MODE: Record<string, string> = { AUTO: 'انتخاب خودکار', MANUAL: 'انتخاب دستی', OFF: 'غیرفعال' };
/** سیاست باندل دیگر فهرست ثابت نیست: از تنظیمات (useBundlePolicies در api.ts؛ نام هر باندل در policy_name) — C-28، 2026-10-24 */

/** وضعیت باندل (C-24، افشین 2026-10-25: «آرشیو» به جای «توقف»): فعال · آرشیوشده (یک بار منتشر شده و اکنون غیرفعال؛ حذف‌نشدنی) · غیرفعال (هرگز منتشرنشده) */
export const bundleStatus = (b: { is_active: boolean; published_at?: string | null }) =>
  b.is_active ? { label: 'فعال', tone: 'success' as const } : b.published_at ? { label: 'آرشیوشده', tone: 'neutral' as const } : { label: 'غیرفعال', tone: 'neutral' as const };
