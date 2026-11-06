# سیستم دیزاین و استانداردهای فرانت پنل ادمین زیرا مارکت

**مرجع: ماژول «مدیریت کاربران» (`src/features/users`) — استخراج‌شده از کد واقعی پروژه در 2026-10-26.**
این سند برای ساختن ماژول‌های تازه در یک چت/پروژه‌ی دیگر Claude نوشته شده است. هر عدد، رنگ و نام این سند از خود کد گرفته شده، نه از حافظه. هر جا نوشته «فلان فایل»، منظور مسیر داخل `Front Source/admin-v2/` است.

> **نحوه‌ی استفاده در چت تازه:** این فایل را به پروژه‌ی Claude پیوست کنید و در اولین پیام بنویسید:
> «فرانت ماژول «…» را دقیقاً مطابق `FRONTEND_DESIGN_SYSTEM.md` بساز. بخش ۱ (قرارداد کار) و بخش ۱۱ (چک‌لیست ماژول تازه) الزامی است. پیش از ساخت جدول، فیلترها را از من بپرس.»

---

## فهرست

0. قرارداد کار با Claude (الزامی)
1. فناوری، ساختار پروژه و قراردادهای کد
2. توکن‌های طراحی (رنگ، فونت، اندازه، سایه)
3. قاب برنامه: سایدبار، سربرگ، مگامنو، منو
4. کتابخانه‌ی کامپوننت‌ها (`shared/ui`)
5. ابزارهای مشترک (`shared/lib`)
6. لایه‌ی API، احراز هویت و مجوزها
7. الگوهای صفحه (لیست، جزئیات، ویزارد، فرم درون‌خطی، مودال، تنظیمات)
8. قوانین سراسری (خلاصه‌ی `RULES.md` با تاریخ)
9. متن‌ها و ریزنوشته‌ها (microcopy)
10. تست مرورگر (e2e) و بررسی کیفیت
11. چک‌لیست ساخت یک ماژول تازه
12. پیوست: درخت فایل مرجع و نسخه‌ها

---

## ۰. قرارداد کار با Claude (الزامی)

این قراردادها در `RULES.md` ثبت شده‌اند و در هر ماژول تازه عیناً برقرارند.

1. **Claude فقط فرانت را می‌نویسد** (2026-10-17). بک‌اند فقط با اجازه‌ی صریح افشین. RBAC و هویت (identity) متعلق به پرهام است.
2. **منطق کسب‌وکار از بک‌اند خوانده می‌شود؛ هیچ داده‌ی ساختگی (mock) نیست.** چیزی که بک‌اند ندارد صادقانه با «به‌زودی» یا «ساخته نشده / در دسترس نیست» نمایش داده می‌شود و در `docs/<MODULE>_BACKEND_GAPS.md` ثبت می‌شود (جدول: شماره، طرح/نیاز، وضعیت بک‌اند، رفتار فعلی فرانت، پیشنهاد برای بک‌اند).
3. **فقط دسکتاپ** (2026-10-17). ریسپانسیو و موبایل کنار گذاشته شده؛ حداقل عرض قاب ۱۲۸۰px.
4. **پشتیبان پیش از تغییر:** نسخه‌ی قبلی هر فایل تغییرکرده در `old/<همان مسیر>` (با پسوند `.v2`، `.v3`، …) نگه داشته می‌شود. هیچ فایلی حذف نمی‌شود. دستورهای نوشتنی git اجرا نمی‌شوند؛ خواندن git با `GIT_OPTIONAL_LOCKS=0`. هرگز مقدار `.env` چاپ نمی‌شود.
5. **تصمیم‌های کسب‌وکار، تفسیر IA و فیلترهای هر جدول با افشین است.** Claude پیش از ساخت جدول تازه می‌پرسد، گزینه‌ها را با پیشنهاد خودش می‌دهد و هرگز بی‌صدا تصمیم نمی‌گیرد.
6. **مرجع ظاهر:** اگر ماژول طرح html (پوشه‌ی `html Fixed`) یا IA دارد، همان؛ وگرنه استانداردهای «مدیریت کاربران» (همین سند). مرجع منطق همیشه کد بک‌اند است (`domains/<domain>/permissions.py` برای صفحه‌ها و مجوزها، `schemas/` برای فیلدها، `api/admin.py` برای endpointها).
7. **هر قانون تازه با تاریخ به `RULES.md` اضافه می‌شود** (بخش مرتبط، یا بخش تازه برای ماژول). قانون‌های دیگر جلسه‌ها بازنویسی نمی‌شوند؛ فقط به نسخه‌ی تازه‌ی فایل اضافه می‌شود.
8. **پاسخ‌ها فارسی، شناسه‌های کد انگلیسی.** افشین روی Windows + PyCharm + PowerShell کار می‌کند.
9. **اثبات با اجرا:** هر صفحه با تست e2e روی بک‌اند واقعی (پایگاه داده‌ی تست) بررسی می‌شود، نه با توضیح. `npm run typecheck` پیش از هر تحویل.
10. **کار هم‌زمان چند جلسه (safe-sync):** پیش از نوشتن روی فایل مشترک (`RULES.md`، `router.tsx`، `navConfig.tsx`، `e2e/README.md`) نسخه‌ی فعلی خوانده و تغییر خود به آن اضافه می‌شود؛ فایل جلسه‌ی دیگر بازنویسی نمی‌شود.

---

## ۱. فناوری، ساختار پروژه و قراردادهای کد

### ۱.۱ پشته

| چیز | نسخه / مقدار |
|---|---|
| React / ReactDOM | ^19.1 |
| TypeScript | ~5.9 — `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules` |
| Vite | ^7.1 — alias `@` ⇐ `src/`؛ پورت dev ۵۱۷۳؛ proxy `/api` و `/media` به `VITE_API_PROXY_TARGET` (پیش‌فرض `http://127.0.0.1:8000`) تا کوکی refresh هم‌مبدأ بماند |
| مسیریابی | react-router ^7.9 (`createBrowserRouter`, data router) |
| داده | @tanstack/react-query ^5.90 |
| فرم | react-hook-form ^7.62 + zod ^4.1 (`@hookform/resolvers/zod`) |
| آیکون | `@tabler/icons-react` ^3.49 (همه‌ی آیکون‌ها؛ `stroke` ۱.۵ تا ۱.۸) |
| تاریخ | `jalaali-js` + `Intl.DateTimeFormat('fa-IR-u-ca-persian')` |
| نقشه | leaflet (فقط ماژول شعب) |
| استایل | CSS Modules (`*.module.css`) + توکن‌های سراسری `tokens.css`؛ بدون Tailwind، بدون styled-components |
| تایپ API | تولید خودکار از OpenAPI: `npm run api:sync` ⇐ `src/shared/api/schema/admin.d.ts` و `public.d.ts` |

اسکریپت‌ها: `npm run dev`, `npm run build` (`tsc -b && vite build`), `npm run typecheck`, `npm run api:sync`.

`index.html`: `<html lang="fa" dir="rtl">`، `theme-color #FCF8F7`، عنوان «زیرا مارکت · پنل مدیریت»، فاوآیکون `/favicon.svg`.

### ۱.۲ درخت پوشه‌ها

```
src/
  main.tsx                 بوت: استایل‌های سراسری + startPersianDigits + <App/>
  app/
    App.tsx                QueryClientProvider > AuthProvider > RouterProvider + <TooltipLayer/>
    queryClient.ts         staleTime 30s، refetchOnWindowFocus false، retry: فقط خطای شبکه/5xx یک بار
    router.tsx             همه‌ی مسیرها؛ هر صفحه lazy؛ RequireAuth > AdminLayout > صفحه‌ها (errorElement: RouteError)
  shared/
    styles/  tokens.css · base.css · fonts.css
    ui/      کامپوننت‌های مشترک (بخش ۴)
    lib/     ابزارها و هوک‌ها (بخش ۵)
    api/     client.ts · errors.ts · formErrors.ts · types.ts · schema/
    auth/    AuthProvider.tsx · useAuth.ts · usePerm.ts · guards.tsx · api.ts · messages.ts
    layout/  AdminLayout · Nav · Header · MegaMenu · BranchPicker · navConfig.tsx · useNav.ts · useNavBadges.ts · useBranches.ts
    data/    iranDivisions.ts (استان/شهرستان/شهر رسمی)
    assets/  brand/logo.svg · brand/logo-lockup.svg · fonts/Vazirmatn-*.woff2
  features/<module>/       یک پوشه برای هر ماژول (بخش ۱.۳)
e2e/                       تست‌های مرورگر (*.e2e.cjs) + seedهای پایتون + README.md
docs/                      *_BACKEND_GAPS.md، راهنماهای API برای بک‌اند، screenshots/
api-schema/                admin.openapi.json · public.openapi.json
RULES.md                   قوانین الزامی فرانت (افشین)
```

### ۱.۳ آناتومی یک ماژول (الگوی `features/users`)

| فایل | نقش |
|---|---|
| `api.ts` | نوع‌ها از `AdminSchemas['…Out']`، هوک‌های query/mutation، `fetchAll`؛ هیچ نوع دستی برای پاسخ بک‌اند |
| `labels.ts` | نقشه‌ی enum ⇐ برچسب فارسی + `tone` نشان (`USER_STATUS`, `USER_TYPE`, `GENDER`, …)، `labelOf()` |
| `<Entity>ListPage.tsx` | صفحه‌ی فهرست (بخش ۷.۱) |
| `<Entity>DetailPage.tsx` | صفحه‌ی جزئیات با تب‌ها (بخش ۷.۲) |
| `<Entity>FormPage.tsx` | ویزارد افزودن/ویرایش (بخش ۷.۳) |
| `<entity>FormSchema.ts` | schema زود + `STEP_FIELDS` + `emptyForm()` |
| `<entity>Tabs.tsx` | بخش‌های تب‌های جزئیات (هر بخش یک `Card`) |
| `<entity>.module.css` | استایل‌های همان ماژول؛ فقط با `var(--…)`؛ hex خام ممنوع |
| `components.tsx` (اختیاری) | کامپوننت‌های مشترک داخل ماژول (مودال انتخاب، نشان‌های خاص) |

نام‌گذاری: فایل کامپوننت `PascalCase.tsx`، هوک `useX.ts`، ثابت‌ها `UPPER_SNAKE`، کلاس CSS `camelCase`. هر صفحه `export default`؛ کامپوننت‌های داخلی `export function`. کامنت‌های کد فارسی، کوتاه، با تاریخ تصمیم و نام تصمیم‌گیرنده («افشین 2026-10-24»). علامت «⇐» برای «نتیجه/پس» در کامنت‌ها.

### ۱.۴ مسیرها (routes)

- مسیر هر صفحه = `route` همان صفحه در منوی بک‌اند (`domains/<domain>/permissions.py`)، مثلاً `/identity/users`، `/rbac/roles`. صفحه‌ی ساخت `…/new`، ویرایش `…/:id/edit`، جزئیات `…/:id`.
- همه‌ی صفحه‌ها `lazy(() => import(...))` و داخل `inner()` (= `Suspense fallback={null}`).
- پیوند قدیمی که جابه‌جا شده ⇐ `<Navigate to="…" replace />` (هیچ پیوندی نمی‌شکند).
- بعد از ذخیره‌ی فرم ⇐ `navigate(target, { replace: true })`.

---

## ۲. توکن‌های طراحی

### ۲.۱ `tokens.css` (متن کامل؛ تنها منبع رنگ و اندازه)

```css
:root{
  --font-body:'Zira',Tahoma,system-ui,sans-serif;
  --font-display:'Zira',Tahoma,system-ui,sans-serif;

  --brand:#D74E54; --brand-strong:#b93d43; --brand-soft:#DF6F73;
  --brand-tint:#FBEDED; --brand-tint-2:#FFF7F7;
  --brand-gradient:linear-gradient(140deg,#E0666B 0%,#D74E54 50%,#C8444A 100%);

  --logo-gradient:linear-gradient(135deg,#DA9999 0%,#D87F7D 20%,#C66A69 45%,#BE4849 65%,#904649 80%,#6D2F32 100%);
  --logo-ink:#6D2F32; --logo-wine:#904649;
  --blush-50:#FCF8F7; --blush-100:#F7EFEE; --blush-200:#EFE2E1; --blush-line:#EADBDA;

  --ink-900:#23232d; --ink-800:#3a3a42; --ink-700:#484649; --ink-600:#5a5a64;
  --ink-500:#6a6a73; --ink-400:#8a8a93; --ink-300:#9a9aa5; --ink-200:#a0a0a9;

  --line-strong:#dcdce2; --line:#e6e6ea; --line-soft:#ececef;
  --surface:#fff; --surface-2:#fcfafa; --surface-3:#f6f4f5; --canvas:#f5f2f3;
  --panel-frame:#f3f1f2; --frame-line:#efe8e9;
  --shadow-frame:0 1px 2px rgba(109,47,50,.04),0 12px 32px rgba(109,47,50,.06);
  --shadow-card:0 1px 2px rgba(109,47,50,.04),0 6px 20px rgba(109,47,50,.045);
  --shadow-card-hover:0 2px 4px rgba(109,47,50,.05),0 14px 32px rgba(109,47,50,.09);

  --success:#1F8A5B; --success-tint:#E3F5EC;
  --purple:#8E6CB0; --purple-tint:#F1ECF7;
  --info:#2A6FDB; --info-tint:#EAF1FB;
  --warning:#B7791F; --warning-tint:#FDF3E2;
  --danger:var(--brand); --danger-tint:var(--brand-tint);
  --tier-bronze:#94582A; --tier-bronze-tint:#F5E9DF; --tier-bronze-line:#E6CDB7;
  --tier-silver:#5F6873; --tier-silver-tint:#EDEFF2; --tier-silver-line:#D3D8DE;
  --tier-gold:#8A6A00; --tier-gold-tint:#FBF2D3; --tier-gold-line:#EBD78F;

  --radius-sm:9px; --radius:12px; --radius-lg:18px; --radius-xl:24px;
  --shadow-sm:0 1px 2px rgba(20,20,40,.05);
  --shadow:0 8px 24px rgba(20,20,40,.08);
  --shadow-lg:0 24px 60px rgba(20,20,40,.12);
  --shadow-brand:0 6px 16px rgba(215,78,84,.26);
  --focus-ring:0 0 0 3px rgba(215,78,84,.18);
}
```

### ۲.۲ معنای توکن‌ها

| توکن | کاربرد |
|---|---|
| `--brand` | قرمز اصلی: دکمه‌ی اصلی (گرادیان)، متن فعال، خطای فرم، ستاره‌ی الزامی، حاشیه‌ی فوکوس |
| `--brand-tint` / `--brand-tint-2` | زمینه‌ی انتخاب‌شده (ردیف، گزینه، تب، ماژول فعال) / زمینه‌ی فیلد نامعتبر |
| `--blush-50..200`, `--blush-line`, `--logo-wine` | رنگ‌های نرم لوگو: چیپ (`Chip`)، hover ملایم، حالت خالی، کادر ثانویه |
| `--ink-900` … `--ink-200` | متن: ۹۰۰ عنوان و مقدار؛ ۸۰۰ سلول جدول؛ ۷۰۰ متن بدنه و برچسب فیلد؛ ۵۰۰/۶۰۰ متن ثانویه؛ ۴۰۰ متن کم‌رنگ، سرستون، کد؛ ۳۰۰ آیکون کم‌رنگ؛ ۲۰۰ placeholder |
| `--line-strong` / `--line` / `--line-soft` | حاشیه‌ی hover / حاشیه‌ی پیش‌فرض فیلد و دکمه‌ی ثانویه / جداکننده‌ها و حاشیه‌ی سلول |
| `--surface` / `-2` / `-3` / `--canvas` | سفید کارت / سربرگ جدول و پاورقی مودال / زمینه‌ی ورودی غیرفعال، جست‌وجو، Segmented / زمینه‌ی کل صفحه |
| `--panel-frame`, `--frame-line`, `--shadow-frame` | قاب سایدبار و سربرگ (طرح «1») |
| `--success/-tint`, `--info/-tint`, `--warning/-tint`, `--danger/-tint`, `--purple/-tint` | نشان‌ها (`Badge`)، بنرها، نقطه‌ی وضعیت. بنفش فقط «اعتبار چکی» و «درصد بازاریاب» |
| `--tier-*` | فقط سطح همکاری مشتری (برنزی/نقره‌ای/طلایی)؛ برای چیز دیگری استفاده نمی‌شود |
| `--focus-ring` | هر `:focus-visible` (در `base.css` سراسری) |

**قانون:** رنگ یا اندازه‌ی تازه فقط به `tokens.css` اضافه می‌شود؛ hex خام در `*.module.css` ماژول ممنوع. استثنای تاریخی: رنگ‌های آواتار در `format.ts` و رنگ‌های مگامنو.

### ۲.۳ فونت و متن

- **فقط Vazirmatn** (OFL، variable ۱۰۰…۹۰۰) با نام خانواده‌ی `'Zira'`؛ دو فایل `Vazirmatn-Arabic-Variable.woff2` و `Vazirmatn-Latin-Variable.woff2` با `unicode-range` جدا (`fonts.css`). هیچ فونت دیگری اضافه نمی‌شود. در CSS فقط `var(--font-body)` / `var(--font-display)`.
- `body`: ۱۴px، `line-height 1.6`، رنگ `--ink-700`، زمینه `--canvas`، `-webkit-font-smoothing:antialiased`.
- `h1,h2,h3`: `--ink-900`، `line-height 1.35`.
- **مقیاس اندازه‌ی متن به‌کاررفته:** ۱۰ (واحد زیر سرستون)، ۱۰.۵ (برچسب «به‌زودی»)، ۱۱ (زیرنویس ریل)، ۱۱.۵ (خطا/راهنمای فیلد، برچسب KeyValue، سرستون flat)، ۱۲ (سرستون جدول، نشان، چیپ، ستون کد)، ۱۲.۵ (برچسب فیلد، متن کم‌رنگ، دکمه‌ی sm/داخل جدول)، ۱۳ (سلول جدول، گزینه‌ی فهرست، Segmented، تب)، ۱۳.۵ (ورودی، دکمه‌ی md، نام ماژول)، ۱۴ (بدنه، مقدار KeyValue)، ۱۵ (عنوان بخش، دکمه‌ی lg)، ۱۶ (عنوان مودال)، ۱۸ (عنوان سربرگ)، ۲۰ (عنوان صفحه و نام در hero).
- وزن‌ها: ۴۰۰ متن عادی، ۵۰۰ کد/واحد، ۶۰۰ برچسب و دکمه‌ی فرعی، ۷۰۰ عنوان، نشان، دکمه، مقدار.
- کلاس‌های کمکی `base.css`: `.tnum` (ارقام هم‌عرض برای ستون‌های عددی)، `.ltr` (`direction:ltr; unicode-bidi:isolate` برای کد، شبا، IP، ایمیل)، `.sr-only`.
- `::-webkit-scrollbar` ۹px با thumb `#d8d8df`.

### ۲.۴ گردی، سایه، حرکت

| چیز | مقدار |
|---|---|
| ورودی/دکمه/فیلتر/دکمه‌ی بازگشت | ۴۲px ارتفاع، گردی ۱۳px (`Field` control، `Button md`، `TableFilters`) |
| کارت (`Card`) | گردی ۲۲px، حاشیه `--frame-line`، سایه `--shadow-card`، padding ۲۲px |
| مودال | گردی ۲۴px، سایه `--shadow-lg`، overlay `rgba(42,30,34,.36)` + `blur(3px)` |
| فهرست کشویی باز | گردی ۱۶px، padding ۶px، سایه `0 14px 34px rgba(109,47,50,.12)`، حداکثر ارتفاع ۳۲۰px |
| سلول جدول | گردی ۱۶px روی اولین/آخرین سلول ردیف؛ سربرگ ۱۲px |
| نشان/چیپ | قرص کامل (`999px`)، ارتفاع ۲۶px |
| سایدبار | گردی ۲۸px؛ قاب زیرمنو ۲۲px؛ کاشی آیکون ۱۳px |
| سربرگ | کاشی عنوان ۴۶px با گردی ۱۵px و `--brand-gradient` |
| انیمیشن‌ها (`base.css`) | `fadeUp .3–.35s` (ورود صفحه و ردیف‌ها)، `fadeIn .15s` (overlay)، `pop .18s` (مودال)، `shimmer 1.3s` (اسکلت)، `spin`، `shake`؛ `prefers-reduced-motion` همه را خاموش می‌کند |
| انتقال‌ها | `.15s` برای رنگ/حاشیه، `.2s` برای چرخش فلش، `.34s cubic-bezier(.32,.72,.24,1)` کشوی سایدبار |

---

## ۳. قاب برنامه

### ۳.۱ چیدمان (`AdminLayout`)

`display:flex; gap:16px; padding:16px; min-width:1280px`. پس‌زمینه‌ی زنده با سه هاله‌ی محو رنگ لوگو (`::before` با `position:fixed`). ستون محتوا: `gap:20px`؛ `<main>` با `padding:4px 6px 24px` و `animation:fadeUp .35s` که با `key={pathname}` با هر تغییر صفحه تکرار می‌شود. `ToastProvider` دور کل چیدمان.

### ۳.۲ سایدبار دوکشویی (`Nav`)

- عرض ثابت `312 + 22 = 334px`، `position:sticky; top:16px; height:calc(100vh - 32px)`، قاب سفید گرد ۲۸px با `--shadow-frame`.
- دو کشو: **منوی اصلی** (ریل ۵۲px بسته / ۳۱۲px باز) و **زیرمنوی ماژول فعال** (قاب خاکستری `--panel-frame` با کارت سفید داخلی). باز شدن یکی، دیگری را می‌بندد؛ حالت کشو برای هر کاربر در `localStorage` (`zm.admin.navDrawer.<userId>`).
- هر ماژول یک دکمه‌ی ۴۶px با کاشی آیکون ۴۰×۴۰ (گردی ۱۳)، نام (۱۳.۵/۷۰۰) و زیرعنوان (۱۱). ماژول فعال: کاشی `--brand-tint` و متن `--brand`؛ در حالت باز، کادر برجسته با سایه‌ی قرمز. ماژول خاموش/ساخته‌نشده: کم‌رنگ با زیرنویس «به‌زودی» و کلیک ⇐ پیام «این ماژول هنوز در سامانه ساخته نشده است.».
- «تنظیمات» همیشه پایین ریل، جدا با خط‌چین.
- زیرمنو: سربرگ ماژول (کاشی + نام + زیرعنوان + آیکون grid ⇐ کلیک = مگامنو) و بخش‌ها (`sections` با عنوان) و صفحه‌ها (`NavLink`، زیرصفحه با «└» و آیکون کوچک‌تر، صفحه‌ی «به‌زودی» غیرفعال با برچسب). نشان عددی خوانده‌نشده (`useNavBadges`: گفت‌وگوها) کنار صفحه و نقطه روی کاشی ماژول.

### ۳.۳ سربرگ (`Header`)

۷۶px، sticky `top:16px`. راست: کاشی آیکون ماژول (۴۶px گرادیان برند) + مسیر «پنل مدیریت › ماژول» (crumb) + عنوان صفحه (`h1` ۱۸px). چپ: تاریخ امروز شمسی با نام روز («شنبه ۲۵ مهر ۱۴۰۵»؛ چیپ ۴۴px)، زنگوله‌ی اعلان (`features/inbox/Bell`)، انتخاب شعبه‌ی فعال (`BranchPicker` ⇐ هدر `X-Branch-ID`)، جداکننده، منوی کاربر (آواتار + نام + نوع کاربر؛ گزینه‌ها: تغییر رمز عبور، خروج از همه‌ی دستگاه‌ها، خروج از حساب).

عنوان صفحه از منو می‌آید (`findCurrent(groups, pathname)`)؛ صفحه‌ها عنوان جدا در سربرگ نمی‌گذارند. داخل محتوا عنوان با `PageHead` یا عنوان خود کارت می‌آید.

### ۳.۴ مگامنو (`MegaMenu`)

تمام‌صفحه (Esc می‌بندد)، پس‌زمینه‌ی جنگل بلور (`layout/assets/forest-blur.webp` + لایه‌ی تیره)، ۱۵ قرص شیشه‌ای عمودی (یک رنگ پاستلی برای هر ماژول از `PALETTE`؛ خط نور تصادفی روی قرص‌های بسته)، با hover/فوکوس/کلید جهت باز می‌شود؛ کارت باز: نام بزرگ ماژول، زیرعنوان، و صفحه‌ها به‌شکل موزاییک کاشی‌های شیشه‌ای از گوشه‌ی پایین‌چپ (`packMosaic`؛ شلوغ‌ترین ماژول دقیقاً ۲/۳ کارت). جست‌وجو، «اینجا هستید»، شمارنده‌ی «۰۴ / ۱۵». رنگ‌های مگامنو فقط در مگامنو.

### ۳.۵ پیکربندی منو (`navConfig.tsx`) — برای ماژول تازه مهم است

- `IA_GROUPS`: دقیقاً ۱۵ ماژول IA با `code` (= کد گروه در `domains/rbac/admin_menu.py`)، `name`، `sub`، `icon`، و اختیاری `sections` (عنوان بخش ⇐ `full_code` صفحه‌ها به ترتیب)، `notBuilt` (دامنه هنوز در بک‌اند نیست)، `off` (خاموش با تصمیم افشین؛ فعلاً داشبورد، محتوا، انبار، مالی، فروش).
- زیرمنوها از `GET /rbac/me/menu` می‌آیند (هر صفحه با `full_code`, `name`, `route`, `icon`). گروهی که بک‌اند برنگرداند و `notBuilt` نباشد ⇐ کاربر مجوز ندارد ⇐ پنهان.
- `EXTRA_PAGES`: صفحه‌هایی که در بک‌اند منبع منوی جدا ندارند (ویزارد ساخت، تب‌های یک resource، صفحه‌های `is_menu_item=False`): `{ group, key, name, route, icon, perm, after, sub?, soon? }`؛ فقط با `perm` نمایش داده می‌شوند و بعد از `after` می‌نشینند. `soon:true` ⇐ غیرفعال با «به‌زودی».
- `MERGED_INTO`: صفحه‌ی بک‌اند که تب صفحه‌ی دیگری است (در منو نمی‌آید). `HIDDEN_PAGES`: صفحه‌های بک‌اند که در منو نمی‌آیند. `NAME_OVERRIDES`: نام html به‌جای نام بک‌اند. `ICONS`: نام آیکون بک‌اند ⇐ آیکون Tabler (نام ناشناخته ⇐ نقطه).
- قانون «هر صفحه فقط یک جا» (افشین 2026-10-25) و «فقط یک داشبورد» (2026-10-17؛ داشبورد ماژول‌ها حذف).

---

## ۴. کتابخانه‌ی کامپوننت‌ها (`shared/ui`)

همه‌ی صفحه‌ها فقط از این‌ها ساخته می‌شوند. کامپوننت تازه‌ی مشترک فقط وقتی ساخته می‌شود که در دو ماژول لازم باشد و همین‌جا بیاید.

### ۴.۱ `kit.tsx`

| کامپوننت | props | ظاهر/رفتار |
|---|---|---|
| `Card` | `children, className?, pad=true` | `<section>` سفید، گردی ۲۲، حاشیه `--frame-line`، سایه‌ی کارت، padding ۲۲. `pad={false}` برای کارتی که خودش سربرگ/پاورقی دارد (ویزارد) |
| `SectionTitle` | `children, extra?` | `h3` ۱۵px/۷۰۰ با میله‌ی قرمز گرادیان ۵×۱۸ در راست؛ `extra` سمت چپ (شمارنده، دکمه). `margin-bottom:18px` |
| `PageHead` | `title?, sub?, back?, actions?` | سطر بالای صفحه (`min-height:44px`): راست دکمه‌ی «بازگشت» (۴۲px، آیکون `IconChevronRight`) + عنوان ۲۰px + زیرعنوان؛ چپ `actions`. `back` همیشه `useBack(...)` |
| `Badge` | `tone: success/neutral/warning/danger/info/brand`, `children` | قرص ۲۶px با نقطه‌ی ۶px قبل از متن؛ رنگ متن = رنگ، زمینه = tint. برای **وضعیت‌ها** |
| `Chip` | `children, tip?` | قرص ۲۶px، زمینه `--blush-50`، حاشیه `--blush-line`، متن `--logo-wine`؛ با `tip` متن کامل در راهنمای شناور. برای **نقش، برچسب، شمارنده‌ی کارت** |
| `Avatar` | `seed, name, size=34` | دایره با رنگ ثابت از `avatarColor(seed)` و حرف اول؛ **فقط در hero صفحه‌ی جزئیات و منوی کاربر؛ در جدول ممنوع** |
| `Segmented` | `value, onChange, options[{value,label,disabled?,tip?}]` | دکمه‌های ۳۶px داخل کادر خاکستری ۱۵px؛ گزینه‌ی فعال سفید با متن قرمز. برای **حالت‌های نما** (همه/فعال/غیرفعال) |
| `UnderlineTabs` | `value, onChange, options` | تب با خط زیر گرادیان ۳px؛ برای **تب‌های صفحه‌ی جزئیات** |
| `InfoBanner` | `children, tone=info/warning` | بنر توضیحی آبی/نارنجی با آیکون، گردی ۱۴ |
| `Empty` | `title, text?, icon?, action?` | حالت خالی وسط‌چین: کاشی آیکون ۵۶px، عنوان ۷۰۰، متن ۱۲.۵ |
| `ErrorBox` | `error, onRetry?` | کادر قرمز روشن با `userMessage(error)` و دکمه‌ی «تلاش دوباره» |
| `SkeletonRows` | `rows=6, height=52` | ردیف‌های shimmer هنگام بارگذاری |
| `Pagination` | `page, pageSize, total, onPage, onPageSize?, sizes=[10,50,100]` | «۱–۱۰ از ۷۳» + فلش‌ها + دکمه‌های اندازه (انتخاب‌شده قرمز گرادیان با متن «۱۰ ردیف»). فقط وقتی `total > 0` رندر شود |
| `Modal` | `open, onClose, title, children, footer?, width=520` | portal، Esc و کلیک بیرون می‌بندد، `role=dialog`؛ سربرگ با دکمه‌ی × ، بدنه اسکرول‌شونده، پاورقی خاکستری با دکمه‌ها از راست. عرض‌های رایج: ۵۲۰ (تأیید/فرم کوتاه)، ۷۲۰–۹۶۰ (جدول انتخابی) |
| `KeyValue` | `label, children, ltr?` | برچسب ۱۱.۵ کم‌رنگ + مقدار ۱۴/۷۰۰؛ خالی ⇐ «—» |
| `Rial` | — | «ریال» کوچک کم‌رنگ کنار مبلغ (بیرون از جدول) |
| `UnitHead` | `children, unit='ریال'` | سرستون «عنوان» + «(ریال)» کوچک در سطر دوم (در جدول واحد فقط این‌جا) |
| `DiscountedPrice` | `original, discount, final, rial?, fmt` | سه سطر وسط‌چین: «پایه:» خط‌خورده‌ی قرمز نازک، «تخفیف:» سبز، «قیمت نهایی:» سبز پررنگ |

### ۴.۲ `form.tsx` — فرم‌ها

- `Field({label, required, error, hint, htmlFor, span, children})`: ستون `gap:7px`؛ برچسب ۱۲.۵/۶۰۰ `--ink-700` با ستاره‌ی قرمز؛ زیر فیلد یا خطا (۱۱.۵ قرمز) یا راهنما (۱۱.۵ کم‌رنگ). `span` = تعداد ستون grid.
- `Input`: `InputHTMLAttributes + {label, required?, error?, hint?, span?, latin?, format?}`؛ `forwardRef` ⇐ با `register()` کار می‌کند. کنترل ۴۲px، گردی ۱۳، حاشیه `--line`، hover `--line-strong`، فوکوس حاشیه‌ی قرمز + `--focus-ring`، نامعتبر زمینه `--brand-tint-2`، غیرفعال/فقط‌خواندنی زمینه `--surface-3` و متن `--ink-400`. **هر رقم تایپ‌شده خودکار فارسی می‌شود** مگر `latin` (کد، نام کاربری، ایمیل، IP) یا `type="password"`. `format` قالب هنگام تایپ (کارت، شبا، موبایل، مبلغ).
- `Select`: همان API `<select>` بومی ولی با `Dropdown` رندر می‌شود (`options[{value,label}]`, `placeholder`). `<select>` خام ممنوع.
- `Textarea`: `min-height 96px`، `line-height 1.8`، `resize:vertical`.
- `Toggle({checked,onChange,label?,disabled?})`: سوییچ ۴۰×۲۲، روشن = گرادیان سبز؛ `role=switch`.
- `PickerField({label,value,placeholder,onOpen,onClear?,icon?,…})`: فیلد انتخاب از فهرست (باز کردن مودال جدولی)؛ هم‌شکل Input با آیکون، مقدار، × پاک‌کردن و فلش. **به‌جای «دکمه‌ی انتخاب» کنار فیلدها.**
- `FormGrid({cols=4, children})`: `grid` با `gap:18px`. فرم‌های ویزارد ۴ ستونه؛ فیلد پهن با `span`.

### ۴.۳ `Button.tsx`

`variant: primary | secondary | ghost | danger`، `size: sm | md | lg`، `loading`, `loadingText`, `block`, `icon`.

| | ارتفاع | گردی | ظاهر |
|---|---|---|---|
| `md` (پیش‌فرض) | ۴۲ | ۱۳ | padding ۱۸، ۱۳.۵px |
| `sm` | ۲۶ | قرص | ۱۲px — هم‌اندازه‌ی `Badge` برای داخل جدول |
| `lg` | ۵۰ | ۱۴ | ۱۵px — فقط ورود |
| `primary` | — | — | `--brand-gradient` سفید با `--shadow-brand`؛ hover کمی بالا |
| `secondary` | — | — | سفید با حاشیه `--line`؛ hover حاشیه‌ی بلاش و متن قرمز |
| `ghost` | — | — | بی‌زمینه؛ hover `--blush-50` |
| `danger` | — | — | سفید با **کادر و متن قرمز** (قانون دکمه‌ی عملیات خطرناک) |

`loading` ⇐ Spinner به‌جای آیکون و `aria-busy`. آیکون‌ها ۱۷px. دکمه داخل سلول جدول خودکار ۳۰px می‌شود.

### ۴.۴ `DataTable.tsx`

```ts
type Column<T> = { key; header: ReactNode; render(row, index); align?: 'center'; code?: boolean };
<DataTable columns rows rowKey onRowClick? isSelected? loading error onRetry empty? minWidth? variant='cards'|'flat' expanded? />
```

- یک `<table>` واقعی ⇐ سربرگ دقیقاً روی داده. `rows === undefined` ⇐ اسکلت؛ آرایه‌ی خالی ⇐ `empty` (پیش‌فرض «موردی یافت نشد»)؛ `error` ⇐ `ErrorBox`.
- `cards` (پیش‌فرض پنل): ردیف‌کارتی با `border-spacing:0 8px`، سربرگ ۳۸px خاکستری ۱۲px، سلول ۴۶px سفید با حاشیه‌ی نرم و گردی ۱۶ در دو سر، **همه‌چیز وسط‌چین، `white-space:nowrap`، بدون قید عرض** (اسکرول افقی در صورت نیاز)، ردیف با `fadeUp`. hover ردیف کلیک‌پذیر: `--blush-50`؛ انتخاب‌شده: `--brand-tint` + خط ۳px قرمز.
- `flat`: فقط جایی که html عیناً خواسته (اعلان‌های ارسال‌شده): سربرگ نواری ۴۴px راست‌چین، ردیف ۶۶px با جداکننده.
- `code:true` روی ستون کد ⇐ خاکستری `--ink-400`، ۱۲px، وزن ۵۰۰ (قانون سراسری).
- `onRowClick` ⇐ ردیف `role=link`، `tabIndex=0`، Enter. `expanded(row)` ⇐ پنل بازشونده‌ی زیر ردیف.
- ردیف اول معمولاً ستون «ردیف» با شماره‌ی `faNum((page-1)*pageSize+i+1)` کم‌رنگ.

### ۴.۵ `TableFilters.tsx`

```ts
type FilterDef = { key; label; value; options[{value,label,soon?}]; onChange(v); soon?; range?: { unit? } };
<TableFilters search onSearch placeholder filters count? extra? stacked? onReset? extraActive? noSearch? />
```

- نوار: جست‌وجو (`flex:2`, min ۲۴۰، زمینه `--surface-3`، آیکون ذره‌بین) + هر فیلتر (`flex:1`, min ۱۵۰) + `extra` + دکمه‌ی «حذف فیلترها» (`IconFilterOff`، ۴۲×۴۲ خط‌چین؛ همیشه دیده می‌شود، بدون فیلتر فعال خاموش) + `count` (مثل «۷ کاربر») در انتهای چپ. **کل عرض جدول را می‌پوشاند.**
- فیلتر کشویی: کادر ۴۲px با «برچسب: مقدار»؛ مقدار خالی = «همه» (اولین گزینه خودکار). فعال ⇐ زمینه‌ی بلاش و مقدار قرمز. فهرست باز شده = استاندارد پنل (گردی ۱۶، گزینه‌ی انتخاب‌شده قرمز با تیک، جداکننده‌ی نرم بین گزینه‌ها).
- `soon` روی فیلتر یا گزینه ⇐ غیرفعال با «به‌زودی» و راهنمای «این فیلتر هنوز در سامانه نیست».
- `range` ⇐ کادر «از / تا» (دو فیلد زیر هم) با «اعمال» و «پاک کردن»؛ مقدار `"min-max"`.
- `stacked` ⇐ جست‌وجو یک ردیف تمام‌عرض (۴۶px) بالا و فیلترها در grid ۴ستونه زیر آن (جدول‌های پرفیلتر مثل مشتریان). `extra` (مثل `ColumnPicker`، فیلتر تاریخ) کنار جست‌وجو.
- `searchKey(...parts)`: متن قابل مقایسه برای جست‌وجوی سمت فرانت (ارقام لاتین، ی/ک فارسی، بدون نیم‌فاصله، حروف کوچک).

### ۴.۶ سایر کامپوننت‌ها

| کامپوننت | نکته‌های الزامی |
|---|---|
| `Dropdown` | فهرست کشویی استاندارد (قانون 2026-10-23): `<select>` بومی پنهان مقدار را نگه می‌دارد (react-hook-form و `select()` تست‌ها کار می‌کنند)؛ فهرست در portal با `position:fixed` (داخل مودال/جدول بریده نمی‌شود؛ اگر پایین جا نباشد بالا باز می‌شود)؛ Esc/Tab/کلیک بیرون می‌بندد؛ کلیدهای جهت. `placeholder` گزینه‌ی خاکستری `value=''` |
| `Combobox` | ورودی متنی با فهرست پیشنهاد (مثل «مدل»)؛ فهرست همان Dropdown؛ `datalist` بومی ممنوع |
| `JalaliDateInput` | همان props `Input` + `minYear/maxYear`؛ مقدار متنی «۱۳۷۰/۰۵/۱۲» با ارقام فارسی؛ تقویم در portal، هم‌تراز لبه‌ی راست فیلد؛ تایپ دستی ممکن؛ با `register` کار می‌کند. تبدیل با `jalaliTextToGregorian` / `gregorianToJalaliText` |
| `Stepper` | «− مقدار +» ۳۲px، عدد فارسی، `min/max/step/unit/label`؛ برای عدد صحیح کوچک (تعداد، روز، تلاش) |
| `ColumnPicker` + `useColumnPrefs(table, options, defaultHidden)` | دکمه‌ی «انتخاب ستون‌ها» ۴۶px با شمارنده؛ فهرست تیک‌دار؛ ستون `fixed` قابل برداشتن نیست، `soon` پنهان و غیرفعال؛ ذخیره در `localStorage` با کلید `zm.admin.table.<table>.hidden.<userId>` (فقط ستون‌های پنهان) |
| `toast` | `const toast = useToast(); toast('… ثبت شد.')` / `toast(userMessage(e), 'error')`؛ پایین وسط، تیره، ۴.۲ ثانیه؛ `role=status/alert` |
| `TooltipLayer` | سراسری؛ برای هر `button`, `a[href]`, `[role=option/tab/menuitem]` و هر `[data-tip]`؛ متن = `data-tip` ⇐ `aria-label` ⇐ متن دکمه؛ `data-tip=""` یعنی بدون راهنما؛ `data-tip-pos="left/right/bottom/top"`؛ متن بلندتر از ۴۸ نویسه و ردیف جدول راهنما نمی‌گیرند؛ تأخیر ۳۲۰ms |
| `Alert`, `TextField` | فقط صفحه‌ی ورود (طرح قدیمی‌تر)؛ در پنل از `InfoBanner`/`ErrorBox` و `Input` استفاده می‌شود. `Alert` برای خطای کلی فرم ویزارد هم به کار می‌رود |
| `Spinner`, `FullPageLoader` | لودر دکمه / صفحه‌ی کامل هنگام بررسی نشست |
| `BrandMark(size, tile?)`, `BrandLockup(height)` | نشان (`logo.svg`، نسبت ۳۱×۲۷) / لوگو + نام (`logo-lockup.svg`، ۱۹۲×۴۰). قانون: نام کنار لوگو ⇐ lockup؛ فقط نشان ⇐ BrandMark |

### ۴.۷ کامپوننت‌های ماژولی که الگوی سراسری شده‌اند

- `features/settings/ui.tsx` — **الگوی صفحه‌های تنظیمی** (مثل «سیاست‌های امنیتی»): `SettingCard({icon,title,desc,wide,extra})` کارت با کاشی آیکون؛ `Row({title,desc,error,changed,wideControl})` ردیف عنوان/توضیح + کنترل (نقطه‌ی نارنجی = تغییرکرده)؛ `SubBox` کادر خاکستری تنظیم وابسته زیر کلید والد؛ `NumField({decimals,min,max,group,unit})` ورودی عددی با دقت/بازه‌ی schema؛ `SaveBar({dirty,saving,onSave,onReset})` نوار پایین با شمار تغییرهای ذخیره‌نشده؛ `useDraft`, `changedKeys` (PATCH فقط فیلدهای تغییرکرده)؛ `parseErrors`/`TopErrors` (خطای ۴۰۰/۴۲۲ کنار همان ردیف + بالای فرم)؛ `ConfirmModal`؛ `IconBtn`؛ `Stat` (کارت شاخص).
- `features/customers/components.tsx`: `TierBadge/TierText` (رنگ سطح همکاری)، `ComingSoon({title,text})` (تب/کارت بدون API)، `AmountInput` (مبلغ ریالی با جداکننده و میان‌برهای «N میلیون ریال»)، `ReasonModal` (تأیید با دلیل اجباری)، `CustomerPickerModal`/`MarketerPickerModal` (انتخاب از جدول کامل)، `UrlDateFilter` (فیلتر تاریخ شمسی در URL).
- `features/branches/SoonTag.tsx`: برچسب «به‌زودی» کوچک با راهنمای دلیل.
- کارت‌های هم‌سطر همیشه هم‌ارتفاع و پویا (`align-items:stretch`؛ قانون امنیت ۴).

---

## ۵. ابزارهای مشترک (`shared/lib`)

| فایل | API | قانون |
|---|---|---|
| `text.ts` | `toLatinDigits(s)`, `toFaDigits(s|n)` | پایه‌ی همه‌ی تبدیل‌ها |
| `persianDigits.ts` | `startPersianDigits(root)` | `MutationObserver` سراسری که هر رقم لاتین/عربی در متن DOM را فارسی می‌کند؛ استثنا: داخل `[data-latin]`, `script`, `style`, `textarea`. ⇐ **هیچ عددی در هیچ جا لاتین نمایش داده نمی‌شود مگر عمداً** |
| `format.ts` | `faDate(iso)` «۱۴۰۴/۰۹/۲۸»، `faDateTime(iso)` «۱۴۰۴/۰۹/۲۸ – ۰۹:۱۲»، `faTime`, `faNum(n)` (Intl fa-IR با جداکننده‌ی هزارگان؛ null ⇐ «—»)، `gregorianToJalaliText('YYYY-MM-DD')`, `jalaliTextToGregorian(text)` (نامعتبر ⇐ null)، `avatarColor(seed)`, `initialOf`, `fullName(u)`, `formatCard(v)` (گروه ۴تایی)، `formatIban(v)` («IR» + گروه ۴تایی) | منطقه‌ی زمانی `Asia/Tehran` |
| `validate.ts` | `isNationalId` (الگوریتم بک‌اند)، `isIban` (IR + ۲۴ رقم)، `isCard` (۱۶ رقم)، `isPostal` (۱۰ رقم)، `isMobile`, `clean(v)` (لاتین + trim)، `mobileProblem(v)` ⇐ پیام دقیق خطا یا null، `formatMobileInput(v)` (فقط رقم، +۹۸ ⇐ ۰، حداکثر ۱۱) | |
| `money.ts` | `groupMoney(raw)` «۱٬۲۵۰٬۰۰۰» برای `value` ورودی مبلغ؛ `moneyDigits(text)` فقط رقم لاتین برای state/ارسال | قانون جداکننده‌ی هزارگان (2026-10-25) |
| `useListParams({page_size})` | `{ page, pageSize, q, get(k), set(patch,{keepPage}), setPage, setPageSize, setQ, setFilter(k), tab, setTab }` | حالت لیست در URL با `replace`؛ هر تغییر غیر از صفحه، صفحه را ۱ می‌کند. `useSearchState(lp, 350)` ⇐ `{ text, setText, dq }` برای جعبه‌ی جست‌وجو با تأخیر |
| `useBack(fallback)` | تابع بازگشت | تاریخچه‌ی پنل ⇐ `navigate(-1)`؛ ورود مستقیم ⇐ `fallback` با replace |
| `useColumnPrefs` | (بخش ۴.۶) | |
| `useDebounced(value, ms)` | | |
| `layout/useBranches.ts` | `useBranchOptions()` ⇐ `{ data: BranchOption[], canList }` | فهرست شعب برای کشویی‌ها |
| `data/iranDivisions.ts` | استان ⇐ شهرستان ⇐ شهر | **استان، شهرستان و شهر همیشه کشویی و از همین فهرست** (قانون افشین 2026-10-23) |

---

## ۶. لایه‌ی API، احراز هویت و مجوزها

### ۶.۱ کلاینت (`shared/api/client.ts`)

- `adminApi<T>(path, opts)` ⇐ `/api/v1/admin<path>`؛ `publicApi<T>` ⇐ `/api/v1/public<path>`. `opts: { method, query, body, auth=true, signal, headers, raw }`.
- `query`: مقدار `undefined/null/''` فرستاده نمی‌شود؛ آرایه ⇐ تکرار کلید. `body` شیء ⇐ JSON؛ `FormData` ⇐ multipart. `raw:true` ⇐ `Blob` (دانلود فایل). `204` ⇐ `undefined`.
- access token فقط در حافظه (`tokenStore`)؛ refresh token کوکی HttpOnly؛ روی ۴۰۱ یک بار refresh (`navigator.locks` بین تب‌ها) و تکرار؛ ۴۰۱ دوم ⇐ `onSessionExpired` ⇐ صفحه‌ی ورود با پیام.
- شعبه‌ی فعال (`branchStore`, `localStorage zm.admin.activeBranchId`) در هدر `X-Branch-ID` همه‌ی درخواست‌های admin.

### ۶.۲ خطاها (`errors.ts`, `formErrors.ts`)

- `ApiError { status, code, detail, detailText, requestId, body, isNetwork }`؛ شکل یکسان بک‌اند `{detail, code, status_code, request_id}`.
- `userMessage(error)`: پیام فارسی بک‌اند همان‌طور؛ انگلیسی ⇐ پیام عمومی وضعیت (۴۰۰ «درخواست معتبر نیست.»، ۴۰۱ نشست پایان‌یافته، ۴۰۳ «به این بخش دسترسی ندارید.»، ۴۰۴ «مورد درخواستی پیدا نشد.»، ۴۰۹ تداخل، ۴۲۲ مقادیر نامعتبر، ۴۲۹، ۵xx + «کد پیگیری»). **همه‌ی toastهای خطا و `ErrorBox` از همین.**
- `applyServerErrors(error, setError, fields, map?)`: خطای ۴۲۲ (آرایه‌ی `loc/msg`) و ۴۰۰ (`{field:[msg]}`) را روی فیلدهای react-hook-form می‌نشاند، ۴۰۹ تکراری را روی فیلد مربوط (کد ملی، موبایل، نام کاربری، کارت، شبا، حساب، کد، ایمیل)؛ خروجی = پیام‌های بی‌فیلد برای نمایش بالای فرم. پیام‌های انگلیسی رایج ⇐ فارسی (`faMsg`).

### ۶.۳ نوع‌ها و React Query

- `AdminSchemas['XOut']` از `shared/api/types.ts`؛ `Paginated<T> = { total, page, page_size, results }` (R-API-01؛ `page_size` حداکثر ۱۰۰).
- `fetchAll<T>(path, query)` (در `features/users/api.ts`؛ هر ماژول می‌تواند import کند) همه‌ی صفحه‌ها را با `page_size=100` می‌گیرد — برای pickerها و فهرست‌های کوچک که بک‌اند فیلتر ندارد.
- کلید query: `['<domain>', '<resource>', params]` (مثل `['identity','staff',p]`, `['rbac','role',id,'matrix']`). لیست صفحه‌بندی‌شده: `placeholderData: keepPreviousData`. فهرست‌های picker: `staleTime: 60_000`. `enabled` وابسته به مجوز/شناسه.
- mutation: `onSuccess` ⇐ `qc.setQueryData` برای همان موجودیت + `invalidateQueries` کلید لیست. بعد از چند عملیات زنجیره‌ای ⇐ `await qc.invalidateQueries()`.
- `signal` از `queryFn` به `adminApi` داده می‌شود.

### ۶.۴ مجوزها

- `const can = usePerm(); can('identity.users.create')` ⇐ `user.is_superuser || permission_codes.includes(code)`. **فقط برای نمایش**؛ تصمیم نهایی با guard بک‌اند. کد مجوز = `<domain>.<resource>.<action>` از `permissions.py`.
- دکمه/ستون/فیلتر/تب بدون مجوز **پنهان** می‌شود (نه غیرفعال)؛ query وابسته با `enabled: can(...)`. ۴۰۳ بک‌اند صادقانه با `ErrorBox` نمایش داده می‌شود.
- مدل دسترسی (ADR 0004): نقش = «چه کاری»، شعبه = «کجا» (`X-Branch-ID`)؛ سوپر ادمین همه‌چیز. HR (BranchEmployee) جداست. هیچ مفهوم «HQ» نیست.

---

## ۷. الگوهای صفحه

### ۷.۱ صفحه‌ی فهرست (الگو: `UsersListPage`)

```tsx
export default function XListPage() {
  const can = usePerm(); const navigate = useNavigate();
  const lp = useListParams();                       // حالت در URL (قانون ۵-۵)
  const search = useSearchState(lp);
  const list = useXList({ page: lp.page, page_size: lp.pageSize, query: search.dq, status: lp.get('status') || undefined });
  const cols: Column<X>[] = [
    { key: 'i', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'code', header: 'کد', code: true, render: (x) => <span className="ltr">{x.code}</span> },
    { key: 'name', header: 'نام', render: (x) => <span className={s.strong}>{x.name}</span> },
    { key: 'status', header: 'وضعیت', render: (x) => { const st = X_STATUS[x.status] ?? { label: x.status, tone: 'neutral' as const }; return <Badge tone={st.tone}>{st.label}</Badge>; } },
    { key: 'at', header: 'آخرین تغییر', render: (x) => <span className={s.muted}>{faDateTime(x.updated_at)}</span> },
  ];
  return (
    <>
      <PageHead actions={can('d.x.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/d/x/new')}>افزودن … جدید</Button> : null} />
      <Card>
        <TableFilters search={search.text} onSearch={search.setText} placeholder="جست‌وجو: نام، کد یا …"
          count={list.data ? `${faNum(list.data.total)} مورد` : undefined}
          filters={[{ key: 'status', label: 'وضعیت', value: lp.get('status'), onChange: lp.setFilter('status'), options: Object.entries(X_STATUS).map(([value, v]) => ({ value, label: v.label })) }]} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(x) => x.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          onRowClick={can('d.x.read') ? (x) => navigate(`/d/x/${x.id}`) : undefined}
          empty={<Empty title={lp.q || lp.get('status') ? 'موردی با این جست‌وجو و فیلترها پیدا نشد' : 'هنوز موردی ثبت نشده است'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
    </>
  );
}
```

قواعد: عنوان صفحه در سربرگ است (PageHead فقط `actions`، یا `back` در صفحه‌های فرعی). اگر بک‌اند فیلتر/جست‌وجو ندارد و فهرست کوچک است ⇐ `useAllX()` + فیلتر و صفحه‌بندی در فرانت با `searchKey` (کامنت بالای صفحه علت را می‌گوید). دو متن خالی: با فیلتر / بدون داده. هر `enum` بک‌اند به `labels.ts` می‌رود.

### ۷.۲ صفحه‌ی جزئیات (الگو: `UserDetailPage`)

1. `PageHead back={useBack('/d/x')} actions={ویرایش با مجوز update}`.
2. **کارت hero** (`heroCard`: گرادیان بلاش محو در گوشه): آواتار ۶۴ (فقط برای شخص) یا نشان، نام ۲۰px + `Badge`های وضعیت/نوع در یک سطر، زیر آن `heroMeta` (کد، نقش، عنوان شغلی، آخرین ورود) ۱۲.۵px.
3. `UnderlineTabs` با **همان تب‌ها، همان ترتیب و همان فیلدهای فرم افزودن** (قانون ۶-۴). بخش‌های اضافه در تب مرتبط می‌نشینند.
4. بدنه `grid2`: ستون اصلی (کارت‌های بخش، هر بخش `Card` + `SectionTitle` + `kvGrid` دوستونه از `KeyValue`) + ستون کناری ثابت ۳۶۰px (مثلاً «آخرین فعالیت‌ها» از activity-log با نقطه‌ی رنگی نتیجه).
5. بارگذاری ⇐ `SkeletonRows rows={5} height={90}`؛ خطا ⇐ `ErrorBox`؛ مقدار خالی ⇐ «—».
6. عملیات داخل تب (تغییر نقش، وضعیت، بازنشانی رمز، حذف مدرک) با `Card` جدا، `InfoBanner` توضیح قاعده، فرم درون‌خطی یا مودال تأیید، `toast` نتیجه، و `invalidateQueries`.

### ۷.۳ ویزارد افزودن/ویرایش (الگو: `UserFormPage` + `userFormSchema.ts`)

- یک کامپوننت `XFormPage` برای هر دو حالت (`mode = id ? 'edit' : 'create'`)؛ در ویرایش داده با `fromX(detail)` به مقادیر فرم (ارقام فارسی، تاریخ شمسی، کارت/شبا قالب‌دار) تبدیل می‌شود؛ `key={id ?? 'new'}`.
- `Card pad={false}` با: نوار مراحل بالا (`role=tablist`؛ هر مرحله شماره‌ی دایره‌ای ۲۲px، فعال قرمز، انجام‌شده سبز با تیک؛ کلیک فقط روی مرحله‌های قبلی/انجام‌شده)، بدنه‌ی `padding 22px 24px`، پاورقی خاکستری (`surface-2`) با دکمه‌ها.
- `useForm({ resolver: zodResolver(schema), defaultValues, mode: 'onTouched' })`؛ **پیش از رفتن به مرحله‌ی بعد `trigger(STEP_FIELDS[step])`**؛ خطای مرحله مانع رفتن می‌شود. `window.scrollTo({top:0})` با تغییر مرحله.
- schema زود: `req()`, `opt`, `refine` با پیام فارسی؛ قیدها مطابق schema بک‌اند؛ قواعد بین‌فیلدی در `superRefine` (مثلاً فقط در `create`).
- فیلدها در `FormGrid cols={4}` (`Textarea` با `span`). کشویی‌ها `Select` با `placeholder` («انتخاب …» یا «در حال دریافت…»). تاریخ `JalaliDateInput`. موبایل با `format={formatMobileInput}` + `mobileProblem` در schema. مبلغ `value={groupMoney(v)}` + `moneyDigits`. کد ملی/کارت/شبا `dir="ltr" inputMode="numeric"` + `formatCard/formatIban`.
- فیلدهای غیرقابل ویرایش در حالت ویرایش ⇐ `disabled`/`readOnly` با `hint` علت («از این فرم قابل تغییر نیست.»).
- ارسال: مقادیر با `clean`/`toLatinDigits`/`jalaliTextToGregorian` نرمال می‌شوند؛ خالی ⇐ `null`؛ کلیدی که بک‌اند null را رد می‌کند فرستاده نمی‌شود. عملیات جانبی با endpoint جدا (نقش، وضعیت، دپارتمان) فقط اگر تغییر کرده باشد. موفقیت ⇐ `toast('… ثبت شد.')` + `navigate(detail, { replace: true })`. خطا ⇐ `applyServerErrors` ⇐ پرش به اولین مرحله‌ی خطادار + `Alert` بالای فرم.
- پاورقی (از راست به چپ در RTL): [ثبت/ذخیره‌ی تغییرات (فقط مرحله‌ی آخر یا در ویرایش همیشه)] [مرحله بعد: نام مرحله ← ] [→ مرحله قبل] [انصراف (ghost ⇐ `back`)] … «مرحله ۲ از ۶» در انتهای چپ. در ویرایش «مرحله بعد» ثانویه است.
- آپلود فایل: کارت خط‌چین (`.doc`) با `<input type=file>` نامرئی؛ بعد از آپلود سبز با نام فایل؛ مدارک الزامی پیش از مرحله‌ی بعد بررسی می‌شوند.

### ۷.۴ فرم درون‌خطی (داخل کارت)

فیلدها و دکمه‌ی ثبت در یک ردیف `display:flex; gap:12; align-items:flex-end`؛ همه برچسب‌دار و ۴۲px؛ دکمه `md` هم‌تراز پایین فیلدها. پیام خطا/راهنما زیر فیلد از جریان بیرون است (settings `.inline`) تا ردیف جابه‌جا نشود. انتخاب از فهرست ⇐ `PickerField` + مودال جدولی.

### ۷.۵ مودال‌ها

- تأیید عملیات خطرناک: `Modal width=520` با متن کوتاه و پاورقی `[Button variant="danger"] [Button variant="secondary" انصراف]`؛ عملیات با دلیل اجباری ⇐ `ReasonModal`.
- جدول انتخابی (انتخاب کارمند/مشتری/کالا): مودال پهن با `TableFilters` + `DataTable isSelected` + `Pagination`؛ ردیف انتخاب‌شده رنگی؛ تأیید در پاورقی.
- فرم کوتاه ساخت/ویرایش (سیاست باندل، ماهیت کمپین، دپارتمان): مودال ۵۲۰–۶۴۰ با `FormGrid cols={2}`.

### ۷.۶ صفحه‌ی تنظیمی (الگوی «سیاست‌های امنیتی» و ماژول تنظیمات)

`SettingCard` با کاشی آیکون + `Row`ها (عنوان/توضیح + کنترل: `Toggle`, `Stepper`, `NumField`, `Dropdown`) + `SubBox` برای تنظیم وابسته + پیش‌نویس (`useDraft`) + `SaveBar` (ذخیره فقط فیلدهای تغییرکرده، «بازگرداندن تغییرات»، شمار تغییرها) + خطاها کنار ردیف و بالای فرم. کارت‌های هم‌سطر هم‌ارتفاع. صفحه‌ای که فقط یک کارت دارد تمام‌عرض.

### ۷.۷ «به‌زودی» و نبودِ صادقانه

- صفحه‌ی منو بدون فرانت ⇐ `PageNotBuilt` («این صفحه هنوز ساخته نشده است»).
- تب/کارت بدون API ⇐ `ComingSoon({title,text})`؛ فیلد ⇐ `Input readOnly placeholder="به‌زودی (ماژول …)"`؛ ستون/فیلتر ⇐ `soon:true`؛ دکمه ⇐ `SoonTag` با راهنمای دلیل. همه در `docs/<MODULE>_BACKEND_GAPS.md` ثبت می‌شوند.
- قابلیت ناقص هرگز با داده‌ی ساختگی «کامل» نشان داده نمی‌شود.

---

## ۸. قوانین سراسری (خلاصه‌ی `RULES.md`)

### عدد، تاریخ، واحد
1. **همه‌ی عددها فارسی** (سراسری با `persianDigits` + `Input`)؛ ارسال لاتین با `clean`. استثنا: `data-latin` / `latin` (کد، ایمیل، نام کاربری، رمز، IP/CIDR، نام‌های لاتین مثل 2FA).
2. **تاریخ شمسی** همه‌جا؛ فیلد تاریخ = `JalaliDateInput`. زمان «۰۹:۱۲» ۲۴ساعته. تهران.
3. **قیمت/مبلغ همیشه با جداکننده‌ی هزارگان «٬»** هنگام تایپ و نمایش (2026-10-25؛ `groupMoney`/`faNum`). فقط قیمت؛ درصد، تعداد، کد، مهلت جداکننده ندارند.
4. **واحد پول «ریال»** کنار هر مبلغ بیرون از جدول (`Rial`)؛ در جدول فقط در سرستون (`UnitHead`)، سلول عدد خالی. **متراژ** همیشه `m²` انگلیسی.
5. **مبلغ تخفیف‌خورده** فقط با `DiscountedPrice`.
6. **شماره کارت** ۴تایی با فاصله؛ **شبا** «IR» جدا + ۴تایی. **ایمیل** با الگوی استاندارد.
7. **موبایل** (مدیریت کاربران 2026-10-25): فقط رقم، ۱۱ رقم، شروع ۰۹؛ بررسی پیش از مرحله‌ی بعد و ذخیره؛ `formatMobileInput`. در مشتریان: تلفن ثابت هم ۱۱ رقم با ۰ (`features/customers/phone.ts`).
8. **استان/شهرستان/شهر** همیشه کشویی از `iranDivisions.ts`؛ تغییر والد، فرزند را خالی می‌کند.

### جدول‌ها (برای همه‌ی جدول‌های موجود و آینده)
9. فقط `DataTable`؛ سربرگ روی داده؛ **بدون قید عرض، متن نمی‌شکند**، اسکرول افقی در صورت نیاز؛ **همه وسط‌چین**؛ ستون کد `code:true` (خاکستری، ۱۲px).
10. **بدون آواتار** در جدول/فهرست.
11. **هر جدول جست‌وجو + فیلتر** با `TableFilters` و دکمه‌ی حذف فیلترها؛ **فیلترها را افشین تعیین می‌کند** (پرسیده شود). نوار کل عرض جدول (جست‌وجو ۲ سهم، فیلتر ۱ سهم).
12. **ارتفاع سطر ثابت ۴۶px، سربرگ ۳۸px** در هر حالتی؛ دکمه‌ی داخل جدول ۳۰px یا `size="sm"` (= Badge ۲۶).
13. **دکمه‌ی عملیات خطرناک** `variant="danger"` (کادر و متن قرمز).
14. **جدول انتخابی** برای انتخاب از فهرست بلند (`isSelected`).
15. **انتخاب ستون‌ها** (`ColumnPicker`) برای جدول‌های پهن؛ ذخیره برای هر کاربر.
16. استثناهای تأییدشده‌ی افشین (کارت به‌جای جدول): گروه‌های مشتری، لیست شعب، ویژگی‌های کاتالوگ، دسته‌بندی درختی؛ `variant="flat"` فقط اعلان‌های ارسال‌شده.

### فرم و ورودی
17. فهرست کشویی فقط `Dropdown`/`Select`/`Combobox`؛ `<select>` و `datalist` خام ممنوع.
18. فیلد غیرقابل ویرایش ⇐ `disabled`، خاکستری کم‌رنگ (همه‌ی کنترل‌ها).
19. فرم درون‌خطی هم‌قد ۴۲px، دکمه هم‌تراز پایین؛ `PickerField` به‌جای دکمه‌ی انتخاب.
20. **صفحه‌ی جزئیات و فرم ویرایش = همان تب‌ها/فیلدهای فرم افزودن** (قانون ۶-۴، برای همه‌ی دامنه‌ها).
21. رنگ در جدول: دایره‌ی ۱۵px هم‌قد نشان وضعیت؛ چیپ رنگ ۱۲px.

### ناوبری
22. **«بازگشت» = صفحه‌ای که کاربر از آن آمده** (`useBack`)؛ «انصراف» هم همین؛ مسیر ثابت ممنوع. تب/فیلتر/پنل با `replace`. بعد از ذخیره `replace`.
23. **حالت لیست در URL** (`useListParams`): صفحه، اندازه، `query`، فیلترها، `tab`، انتخاب جاری.
24. فقط یک داشبورد؛ هر صفحه فقط یک جا در منو؛ نام و ترتیب ماژول‌ها از IA؛ مسیر = بک‌اند.
25. راهنمای شناور برای همه‌ی دکمه‌ها/آیکون‌ها (`TooltipLayer`)؛ دکمه‌ی فقط‌آیکونی حتماً `aria-label`.

### ظاهر
26. فونت فقط Vazirmatn؛ رنگ فقط توکن‌ها؛ لوگو طبق قانون lockup/mark؛ سطح همکاری با رنگ هم‌نام (`--tier-*`).
27. کارت‌های هم‌سطر هم‌ارتفاع و پویا.
28. حذف واقعی ⇐ پنجره‌ی تأیید؛ عملیات بک‌اند که فقط غیرفعال می‌کند، «حذف» نامیده نمی‌شود (مثل نقش).

---

## ۹. متن‌ها و ریزنوشته‌ها

| موقعیت | قالب |
|---|---|
| دکمه‌ی ساخت | «افزودن <موجودیت> جدید» با `IconPlus` |
| عنوان ویزارد | «افزودن <موجودیت>» / «ویرایش <موجودیت>» |
| دکمه‌های ویزارد | «ثبت <موجودیت>» / «ذخیره‌ی تغییرات» / «مرحله بعد: <نام>» / «مرحله قبل» / «انصراف» / «در حال ذخیره…» |
| toast موفق | «<موجودیت> با موفقیت ثبت شد.» / «اطلاعات <…> ذخیره شد.» / «<…> حذف شد.» / «نقش کاربر ثبت شد.» |
| toast خطا | همیشه `userMessage(e)` |
| حالت خالی | با فیلتر: «<موجودیت>ی با این جست‌وجو و فیلترها پیدا نشد»؛ بی‌داده: «هنوز <موجودیت>ی ثبت نشده است» |
| مقدار خالی | «—» |
| placeholder جست‌وجو | «جست‌وجو: نام، کد یا موبایل» (فهرست فیلدهای واقعی جست‌وجو) |
| placeholder کشویی | «انتخاب <چیز>»؛ هنگام بارگذاری «در حال دریافت…» |
| شمارنده‌ی نوار فیلتر | «۷ کاربر» / «۱۲ مورد» |
| راهنمای فیلد قفل | «از این فرم قابل تغییر نیست.» / دلیل مجوز |
| برچسب بدون بک‌اند | «به‌زودی» (+ راهنمای «این … هنوز در سامانه نیست») |
| پیام مجوز | «دسترسی به … ندارید» (Empty) یا ۴۰۳ بک‌اند |
| نشان‌ها | فعال (success) · غیرفعال/منقضی/پیش‌نویس (neutral) · در انتظار (info) · قفل/هشدار (warning) · لغوشده/فوری (danger) |

نگارش: نیم‌فاصله در «می‌شود»، «به‌زودی»، «جست‌وجو»؛ کسره‌ی اضافه با «ی» («ذخیره‌ی تغییرات»)؛ علامت‌ها فارسی («،» «؛» «٪»)؛ اعداد فارسی حتی در متن‌ها؛ جملات کوتاه با نقطه‌ی پایانی در پیام‌ها.

---

## ۱۰. تست مرورگر (e2e) و بررسی کیفیت

- فایل `e2e/<module>.e2e.cjs` با `puppeteer-core` + `@sparticuz/chromium` (`headless: 'shell'`, viewport ۱۴۴۰×۹۰۰)، `BASE = http://127.0.0.1:5173`, `API = http://127.0.0.1:8000/api/v1`. ورود `testadmin / Test@12345` (سوپر ادمین)، `teststaff / Staff@12345` (کارمند محدود؛ `seed_layout.py`). بعد از ورود `waitUntil: 'networkidle2'` (زنگوله اتصال SSE باز نگه می‌دارد).
- ساختار: `results[]` + `check(name, ok, extra)`؛ در پایان چاپ همه و «N/M». خطای صفحه (`pageerror`) جمع و بررسی می‌شود. اسکرین‌شات در `~/shots/<module>/`.
- هر تست داده‌ی خودش را با API می‌سازد و در پایان پاک/بازمی‌گرداند؛ **هرگز روی پایگاه داده‌ی واقعی**. seedهای پایتون فقط برای دیتابیس تست.
- پوشش حداقلی هر ماژول: منو و مسیر، ستون‌های جدول، جست‌وجو/فیلتر (و URL)، حالت خالی، ساخت با اعتبارسنجی و خطای فیلدی بک‌اند، جزئیات، ویرایش، عملیات وضعیت/حذف با ۴۰۹، کاربر بی‌مجوز (دکمه‌ها پنهان، ۴۰۳ صادقانه)، بدون خطای صفحه.
- توضیح هر تست به جدول `e2e/README.md` اضافه می‌شود.
- پیش از تحویل: `npm run typecheck` بدون خطا؛ اسکرین‌شات صفحه بررسی شود (هم‌ترازی، عرض جدول با زیرمنوی باز، ارتفاع کارت‌ها).

---

## ۱۱. چک‌لیست ساخت یک ماژول تازه

1. **بک‌اند را بخوان:** `domains/<domain>/permissions.py` (صفحه‌ها، `route`، `actions` ⇐ کد مجوزها)، `schemas/*.py` (فیلدها، enumها، قیدها)، `api/admin.py` (endpointها، پارامترهای فیلتر/جست‌وجو)، `domains/rbac/admin_menu.py` (گروه و ترتیب). اگر html/IA هست، آن را هم.
2. **از افشین بپرس:** ستون‌ها و فیلترهای هر جدول، نام‌ها و ترتیب زیرمنو، هر تفسیر IA/کسب‌وکار. پیشنهاد خودت را با گزینه‌ها بده.
3. **`npm run api:sync`** اگر OpenAPI تازه است؛ نوع‌ها از `AdminSchemas`.
4. **پوشه‌ی ماژول:** `api.ts` (هوک‌ها، کلیدهای query، `fetchAll` در صورت نیاز)، `labels.ts` (enum ⇐ فارسی + tone)، صفحه‌ها طبق بخش ۷، `*.module.css` فقط با توکن.
5. **مسیرها در `router.tsx`** (lazy + `inner()`؛ مسیر = route بک‌اند)؛ **منو در `navConfig.tsx`** (`sections` گروه، `EXTRA_PAGES` برای ویزارد/تب‌ها با `perm` و `after`؛ `NAME_OVERRIDES` اگر نام html فرق دارد).
6. **مجوزها:** هر دکمه/ستون/فیلتر/query با `can(...)`.
7. **قابلیت بدون بک‌اند:** «به‌زودی» صادقانه + ثبت در `docs/<MODULE>_BACKEND_GAPS.md` (+ در صورت نیاز راهنمای قرارداد پیشنهادی برای بک‌اند در `docs/<MODULE>_API_GUIDE.md`).
8. **تست e2e** کامل روی بک‌اند واقعی + ردیف در `e2e/README.md`؛ `npm run typecheck`.
9. **`RULES.md`:** بخش ماژول با تاریخ (فیلترهای تأییدشده، تصمیم‌ها، استثناها) به نسخه‌ی تازه‌ی فایل اضافه شود.
10. **پشتیبان و sync:** فایل‌های تغییرکرده به `old/`؛ فایل‌های مشترک merge شوند نه بازنویسی.
11. **گزارش به افشین:** چه ساخته شد، چه چیزی «به‌زودی» است و چرا، نتیجه‌ی تست‌ها، تصمیم‌های باز.

---

## ۱۲. پیوست

### ۱۲.۱ فایل‌های مرجع برای مطالعه‌ی مستقیم

| موضوع | فایل |
|---|---|
| توکن‌ها، پایه، فونت | `src/shared/styles/tokens.css`, `base.css`, `fonts.css` |
| کیت | `src/shared/ui/kit.tsx` + `kit.module.css` |
| فرم | `src/shared/ui/form.tsx` + `form.module.css`, `Dropdown.tsx`, `JalaliDateInput.tsx`, `Combobox.tsx`, `Stepper.tsx` |
| جدول | `src/shared/ui/DataTable.tsx`, `TableFilters.tsx`, `ColumnPicker.tsx` + `shared/lib/useColumnPrefs.ts` |
| دکمه، توست، راهنما | `Button.tsx`, `toast.tsx`, `TooltipLayer.tsx` |
| ابزار | `src/shared/lib/{text,format,validate,money,useListParams,useBack}.ts` |
| API | `src/shared/api/{client,errors,formErrors,types}.ts` |
| قاب | `src/shared/layout/{AdminLayout,Nav,Header,MegaMenu}.tsx`, `navConfig.tsx`, `useNav.ts` |
| مرجع صفحه‌ها | `src/features/users/{UsersListPage,UserDetailPage,UserFormPage,userFormSchema,userTabs,api,labels}.ts(x)` |
| الگوی تنظیمات | `src/features/settings/ui.tsx`, `CommercePolicyPage.tsx` |
| قوانین کامل | `RULES.md` (۱۳ بخش، ~۹۹ KB) |
| تست‌ها | `e2e/README.md`, `e2e/users.e2e.cjs` |

### ۱۲.۲ پرامپت آغازین پیشنهادی برای چت تازه

```
تو کدنویس فرانت پنل ادمین زیرا مارکت هستی (React 19 + TS + Vite، CSS Modules، react-query، react-hook-form + zod).
فایل FRONTEND_DESIGN_SYSTEM.md پیوست است و الزامی است: قرارداد کار (بخش ۰)، توکن‌ها و کامپوننت‌های مشترک (۲–۵)،
لایه‌ی API (۶)، الگوهای صفحه (۷)، قوانین سراسری (۸)، متن‌ها (۹)، تست (۱۰) و چک‌لیست (۱۱).
ماژول هدف: «<نام ماژول>» (دامنه‌ی بک‌اند: domains/<domain>). مرجع ظاهر: <html Fixed/IA یا «استاندارد مدیریت کاربران»>.
پیش از ساخت هر جدول، ستون‌ها و فیلترها را از من بپرس. چیزی که بک‌اند ندارد را «به‌زودی» نشان بده و در docs/<MODULE>_BACKEND_GAPS.md ثبت کن.
هیچ داده‌ی ساختگی. فقط دسکتاپ. پاسخ فارسی، شناسه‌ها انگلیسی. پیش از تغییر هر فایل، نسخه‌ی قبلی را در old/ نگه دار.
```
