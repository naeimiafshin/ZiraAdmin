# بسته‌ی شروع فرانت زیرا مارکت — راهنمای استفاده

این بسته برای ساختن یک ماژول تازه‌ی پنل ادمین در یک **پروژه‌ی جدید Claude** است. هیچ ماژول نمونه‌ای ندارد؛ فقط سند استاندارد + فایل‌های مرجع واقعی پروژه (کپی دقیق از `Front Source/admin-v2`، 2026-10-26).

## کجا بگذارم؟

1. در claude.ai پروژه‌ی تازه بسازید (یا پروژه‌ی موجود را باز کنید).
2. از بخش **Project knowledge / فایل‌های پروژه** فایل‌ها را آپلود کنید. ترتیب اهمیت:

| اولویت | فایل‌ها | چرا |
|---|---|---|
| ۱ (الزامی) | `FRONTEND_DESIGN_SYSTEM.md` | کل استاندارد در یک فایل |
| ۲ (الزامی) | `RULES.md` | قوانین کامل افشین با تاریخ (سند بالا خلاصه‌ی آن است) |
| ۳ (بسیار مفید) | `reference/ui/*` و `reference/styles/*` | کد واقعی کامپوننت‌ها و توکن‌ها؛ Claude به‌جای حدس، از همین‌ها کپی می‌کند |
| ۴ | `reference/features/users/*` | ماژول مرجع: لیست، جزئیات، ویزارد، schema، api، labels |
| ۵ | `reference/lib/*`, `reference/api/*`, `reference/auth/*` | ابزارها، کلاینت HTTP، خطاها، مجوزها |
| ۶ | `reference/layout/*`, `reference/app/*` | منو، مسیرها، قاب |
| ۷ | `reference/features/settings/*`, `customers/*`, `branches/*` | الگوهای تنظیمات، «به‌زودی»، مودال‌های انتخاب، مبلغ |
| ۸ | `e2e/*`, `docs-examples/*`, `config/*` | قالب تست، نمونه‌ی سند کمبودهای بک‌اند، تنظیمات ابزار |

اگر سقف تعداد فایل پروژه محدود بود: ردیف ۱ تا ۴ را آپلود کنید؛ بقیه را وقتی لازم شد در همان چت پیوست کنید.

3. در **Project instructions** (دستورالعمل پروژه) متن زیر را بگذارید (همان پرامپت بخش ۱۲.۲ سند):

```
تو کدنویس فرانت پنل ادمین زیرا مارکت هستی (React 19 + TS + Vite، CSS Modules، react-query، react-hook-form + zod).
فایل FRONTEND_DESIGN_SYSTEM.md و RULES.md الزامی‌اند؛ فایل‌های reference/* کد واقعی پروژه‌اند و باید عیناً همان کامپوننت‌ها و الگوها استفاده شوند.
ماژول هدف: «<نام ماژول>» (دامنه‌ی بک‌اند: domains/<domain>). مرجع ظاهر: <html Fixed/IA یا «استاندارد مدیریت کاربران»>.
پیش از ساخت هر جدول، ستون‌ها و فیلترها را از من بپرس. چیزی که بک‌اند ندارد را «به‌زودی» نشان بده و در docs/<MODULE>_BACKEND_GAPS.md ثبت کن.
هیچ داده‌ی ساختگی. فقط دسکتاپ. پاسخ فارسی، شناسه‌ها انگلیسی. پیش از تغییر هر فایل، نسخه‌ی قبلی را در old/ نگه دار.
```

4. در اولین پیام چت، کد بک‌اند دامنه‌ی هدف را هم بدهید (`domains/<domain>/permissions.py`، `schemas/`، `api/admin.py`) — یا مخزن را به چت وصل کنید.

## در خود مخزن

سند اصلی همین حالا در مخزن هم هست: `Front Source/admin-v2/docs/FRONTEND_DESIGN_SYSTEM.md`. فایل‌های `reference/` کپی‌اند؛ منبع حقیقت همیشه خود مخزن است. اگر کد عوض شد، این بسته را دوباره بسازید.

## محتوای بسته

```
00_START_HERE.md                این راهنما
FRONTEND_DESIGN_SYSTEM.md       سند استاندارد (۱۲ بخش)
RULES.md                        قوانین کامل
reference/
  styles/   tokens.css · base.css · fonts.css
  ui/       kit · form · Button · DataTable · TableFilters · Dropdown · Combobox · JalaliDateInput · Stepper · ColumnPicker · toast · TooltipLayer · BrandMark · BrandLockup · Spinner · FullPageLoader · Alert (+ css)
  lib/      text · persianDigits · format · validate · money · useListParams · useBack · useColumnPrefs · useDebounced
  api/      client · errors · formErrors · types
  auth/     usePerm · guards · useAuth
  layout/   navConfig · useNav · useBranches · AdminLayout · Header · Nav.module.css
  app/      App · queryClient · router
  features/users/      ماژول مرجع کامل
  features/settings/   ui.tsx · settings.module.css · CommercePolicyPage.tsx
  features/customers/  components.tsx · phone.ts
  features/branches/   SoonTag.tsx
e2e/            README.md · users.e2e.cjs · money.e2e.cjs
docs-examples/  USER_EDIT_BACKEND_GAPS.md · NOTIFICATIONS_BACKEND_GAPS.md · NOTIFICATION_DETAIL_API_GUIDE.md
config/         package.json · tsconfig.json · vite.config.ts · index.html
```
