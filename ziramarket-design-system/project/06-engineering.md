# مهندسی فرانت

ساختار کدی که این سیستم را پیاده می‌کند. مخزن: `ZiraAdmin` (Gitea، شاخه‌ی `master`)، منتشرشده روی `admin.ziramarket.ir`.

## پشته

| چیز | مقدار |
|---|---|
| React / TypeScript | React 19، TS سخت‌گیر (`strict`، `noUncheckedIndexedAccess`، `noUnusedLocals`، `verbatimModuleSyntax`) |
| ساخت | Vite 7؛ alias `@` ⇐ `src/`؛ پورت ۵۱۷۳؛ proxy `/api` و `/media` به بک‌اند تا کوکی تازه‌سازی هم‌مبدأ بماند |
| مسیریابی | React Router 7 (data router)؛ هر صفحه `lazy` |
| داده | TanStack Query 5 |
| فرم | react-hook-form + zod 4 |
| آیکون | Tabler (`@tabler/icons-react`) |
| تاریخ | `jalaali-js` + `Intl` با تقویم فارسی، منطقه‌ی تهران |
| استایل | CSS Modules + توکن‌های سراسری `tokens.css`؛ بدون Tailwind و بدون CSS-in-JS |
| نوع‌های API | تولید خودکار از OpenAPI بک‌اند: `npm run api:sync` |

دستورها: `npm run dev`، `npm run build` (چک نوع + ساخت)، `npm run typecheck`، `npm run api:sync`. `index.html` با `lang="fa" dir="rtl"`.

## درخت پوشه

```
src/
  app/        App (QueryClient > Auth > Router + TooltipLayer)، router، queryClient
  shared/
    styles/   tokens.css · base.css · fonts.css
    ui/       کامپوننت‌های این سیستم
    lib/      text · persianDigits · format · validate · money · useListParams · useBack · useColumnPrefs
    api/      client · errors · formErrors · types · schema/ (تولیدی)
    auth/     AuthProvider · useAuth · usePerm · guards · api · messages
    layout/   AdminLayout · Nav · Header · MegaMenu · BranchPicker · navConfig · useNav · useNavBadges
    data/     iranDivisions (تقسیمات کشوری رسمی)
    assets/   brand/ · fonts/
  features/<module>/   یک پوشه برای هر ماژول
e2e/   تست‌های مرورگر + seedهای پایتون
docs/  *_BACKEND_GAPS.md (کمبودهای بک‌اند هر دامنه)
old/   نسخه‌ی پیشین هر فایل تغییرکرده
```

## آناتومی یک ماژول (الگوی `features/users`)

| فایل | نقش |
|---|---|
| `api.ts` | نوع‌ها از `AdminSchemas['…Out']`، هوک‌های query و mutation؛ هیچ نوع دستی برای پاسخ بک‌اند |
| `labels.ts` | نگاشت enum بک‌اند ⇐ برچسب فارسی + `tone` (`USER_STATUS`، `USER_TYPE`، `GENDER`…) |
| `<Entity>ListPage.tsx` | فهرست |
| `<Entity>DetailPage.tsx` | جزئیات با تب‌ها |
| `<Entity>FormPage.tsx` + `<entity>FormSchema.ts` | ویزارد ساخت و ویرایش + schema زود + `STEP_FIELDS` |
| `<entity>Tabs.tsx` | بخش‌های تب‌ها (هر بخش یک `Card`) |
| `<entity>.module.css` | فقط با `var(--…)`؛ hex خام ممنوع |

نام‌گذاری: کامپوننت `PascalCase.tsx`، هوک `useX.ts`، ثابت `UPPER_SNAKE`، کلاس CSS `camelCase`. صفحه `export default`. کامنت‌ها فارسی و کوتاه با تاریخ و نام تصمیم‌گیرنده.

## لایه‌ی API

- `adminApi<T>(path, opts)` ⇐ `/api/v1/admin…`؛ `publicApi<T>` ⇐ `/api/v1/public…`. `query` بدون مقدارهای خالی؛ `FormData` ⇐ multipart؛ `raw` ⇐ Blob برای دانلود فایل خصوصی.
- **توکن دسترسی فقط در حافظه**، توکن تازه‌سازی در کوکی HttpOnly؛ روی ۴۰۱ یک بار تازه‌سازی (بین تب‌ها با Web Locks) و تکرار؛ ۴۰۱ دوم ⇐ صفحه‌ی ورود با پیام.
- شعبه‌ی فعال در هدر `X-Branch-ID` همه‌ی درخواست‌های ادمین.
- **فهرست‌ها:** پارامترهای `page`، `page_size` (حداکثر ۱۰۰)، `query`؛ پاسخ `{total, page, page_size, results}`. `fetchAll` همه‌ی صفحه‌ها را برای pickerها می‌گیرد.
- **خطا:** شکل یکسان `{detail, code, status_code, request_id}`. `ApiError` (`status`، `code`، `detailText`، `requestId`، `retryAfter` از هدر `Retry-After`). `userMessage(e)` پیام فارسی برای toast و `ErrorBox`؛ `applyServerErrors` خطای ۴۰۰/۴۰۹/۴۲۲ را روی فیلدهای فرم می‌نشاند.
- متد HTTP را از OpenAPI بخوانید، نه از یادداشت‌ها.

## React Query

- کلید: `['<domain>', '<resource>', params]` (مثل `['identity','staff',p]`، `['rbac','role',id,'matrix']`).
- فهرست صفحه‌بندی‌شده `placeholderData: keepPreviousData`؛ فهرست picker `staleTime: 60s`؛ `enabled` وابسته به مجوز.
- mutation: `setQueryData` برای همان موجودیت + `invalidateQueries` کلید فهرست.
- پیش‌فرض‌ها: `staleTime` ۳۰ ثانیه، بدون refetch با فوکوس پنجره، تکرار فقط برای خطای شبکه یا ۵xx.

## مجوزها

- `const can = usePerm(); can('identity.users.create')` ⇐ سوپرادمین یا داشتن کد در مجوزهای کاربر (از `GET /admin/auth/me`).
- کد مجوز `دامنه.منبع.اکشن` با هشت اکشن: list، read، create، update، delete، export، approve، print.
- بی‌مجوز ⇐ پنهان؛ query وابسته `enabled: can(...)`.

## پایه‌ی سراسری

- `startPersianDigits(document.body)` در `main.tsx`: هر رقم لاتین یا عربی در متن DOM فارسی می‌شود؛ استثنا `[data-latin]`، `script`، `style`، `textarea`.
- `base.css`: بدنه با `var(--font-body)` ۱۴px، `line-height` ۱.۶، رنگ `ink-700`، زمینه `canvas`؛ کلاس‌های `tnum`، `ltr`، `sr-only`؛ انیمیشن‌های fadeUp، fadeIn، pop، shimmer، spin، shake؛ `prefers-reduced-motion`.
- اسکرول‌بار ۹px با `scrollbar-thumb`.

## مصرف این سیستم در یک صفحه‌ی تازه

1. `tokens.css` این سیستم (ساخته‌شده از `tokens.json`) و `components/bundle.css` را بارگذاری کنید.
2. React و ReactDOM 18 (یا 19 در مخزن) و سپس `components/bundle.js` ⇐ همه‌چیز زیر `window.Zira` (مثل `Zira.Button`، `Zira.DataTable`، `Zira.startPersianDigits`).
3. ریشه `dir="rtl" lang="fa"` و یک بار `Zira.startPersianDigits(document.body)`.
4. در مخزن همان کامپوننت‌ها با `import { Button } from '@/shared/ui/Button'` و مانند آن؛ بسته فقط برای پیش‌نمایش و نمونه‌سازی است.
