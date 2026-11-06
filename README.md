# پنل مدیریت زیرا مارکت — فرانت‌اند (ZiraAdmin)

> **قوانین الزامی فرانت (افشین): [`RULES.md`](RULES.md)** — پیش از هر کار فرانت خوانده و رعایت می‌شود.

React 19 · TypeScript · Vite · React Router 7 · TanStack Query 5 · React Hook Form + Zod
مالک کد فرانت: Claude (تصمیم افشین، 2026-10-17). مخزن بک‌اند (`ZiraMarketBackEnd`، مخزن جدا) مرجع منطق کسب‌وکار است و از این مخزن فقط خوانده می‌شود.

## اجرا (Windows / PowerShell)

```powershell
# ۱) بک‌اند (در پوشه‌ی مخزن بک‌اند)
cd D:\E-COMMERCE\ZiraClaude\ziramarket_backend\ZiraMarketBackEnd
python manage.py runserver 8000

# ۲) فرانت (در پوشه‌ی همین مخزن، در پنجره‌ی دیگر PowerShell)
cd D:\E-COMMERCE\ZiraClaude\ziramarket_front\ZiraAdmin
Copy-Item .env.example .env      # فقط بار اول
npm install                      # فقط بار اول یا بعد از تغییر package.json
npm run dev                      # http://localhost:5173
```

ورود آزمایشی: یک کاربر سوپر ادمین با `python manage.py seed_superadmin --username <name> --password <pass>`.
سرور توسعه‌ی Vite مسیرهای `/api` و `/media` را به جنگو proxy می‌کند تا کوکی refresh (HttpOnly) هم‌مبدأ بماند؛ CORS لازم نیست.

| دستور | کار |
|---|---|
| `npm run build` | چک نوع (tsc) + ساخت production در `dist/` |
| `npm run typecheck` | فقط چک نوع |
| `npm run api:sync` | OpenAPI را از بک‌اند در حال اجرا می‌گیرد و نوع‌های `src/shared/api/schema/*.d.ts` را می‌سازد |

## قواعد کدنویسی (الزامی)

1. **بدون داده‌ی ساختگی.** هر عدد، لیست و برچسب داده‌ای از API واقعی می‌آید. حالت خالی و خطا طراحی می‌شود، با داده‌ی ساختگی پر نمی‌شود.
2. **منطق کسب‌وکار از بک‌اند.** قبل از هر صفحه: endpointها، schema، سرویس و قواعد `BR-*` دامنه خوانده می‌شود. HTMLهای `html Fixed/` فقط مرجع ظاهرند؛ هر جا با بک‌اند فرق دارند، بک‌اند درست است.
3. **نوع‌ها از OpenAPI.** نوع دستی برای پاسخ بک‌اند نوشته نمی‌شود؛ از `AdminSchemas[...]` / `PublicSchemas[...]` (`src/shared/api/types.ts`). بعد از هر تغییر بک‌اند `npm run api:sync`.
4. **قیود فرم = قیود schema بک‌اند** (طول، الگو، enum). اعتبارسنجی سمت سرور همیشه مرجع نهایی است و خطای 400/409/422 آن نمایش داده می‌شود.
5. **همه‌ی درخواست‌ها از `src/shared/api/client.ts`.** توکن فقط در حافظه است؛ refresh خودکار روی 401؛ هدر `X-Branch-ID` خودکار (ADR 0004).
6. **لیست‌ها:** پاکت `{total, page, page_size, results}` و پارامترهای `page`، `page_size`، `query` (R-API-01).
7. **دسترسی:** نمایش دکمه/صفحه بر اساس `permission_codes` کاربر (`/auth/me`)؛ تصمیم نهایی همیشه با guard بک‌اند است.
8. **پیام‌ها فارسی.** پیام فارسی بک‌اند همان‌طور نمایش داده می‌شود؛ پیام انگلیسی با نگاشت (`shared/auth/messages.ts`، `shared/api/errors.ts`) فارسی می‌شود.
9. **ظاهر:** رنگ، فاصله و سایه فقط از `src/shared/styles/tokens.css` (برگرفته از `html Fixed/` + رنگ‌های لوگو)؛ CSS Modules؛ RTL؛ فعلاً فقط دسکتاپ (قاعده‌ی ۱۰الف).
   - **فونت (تصمیم افشین 2026-10-20):** همه‌ی متن‌ها و عددها **Vazirmatn (وزیرمتن)**، variable ۱۰۰…۹۰۰، مجوز OFL (از `@fontsource-variable/vazirmatn`؛ فایل‌ها در `src/shared/assets/fonts/`) زیر خانواده‌ی `Zira` (`src/shared/styles/fonts.css`)؛ در CSS فقط `var(--font-body)` / `var(--font-display)`. فونت دیگری اضافه نشود (فایل‌های Digi Hamishe، Yekan Bakh و IRANSans در 2026-10-20 حذف شدند).
   - **دو لوگو (افشین 2026-10-17):** هر جا لوگو و نام «زیرا مارکت» کنار هم می‌آیند ⇐ **لوگوی دوم** `src/shared/assets/brand/logo-lockup.svg` (= `Second_Logo.svg`) با کامپوننت `BrandLockup`؛ هر جا فقط نشان لازم است ⇐ **لوگوی اول** `logo.svg` (= `Main_logo.svg`) با `BrandMark`. نام برند کنار نشان با متن ساخته نمی‌شود. هر دو گرادیان صورتی تا زرشکی دارند ⇐ **همیشه روی زمینه‌ی روشن** (سفید یا blush)، هرگز روی قرمز یا تیره.
10الف. **فعلاً فقط دسکتاپ (قانون افشین 2026-10-17، برای سرعت و کاهش هزینه):** طراحی و تست فقط در عرض دسکتاپ (۱۴۴۰px، حداقل ۱۲۸۰px)؛ media query و نسخه‌ی موبایل/تبلت ساخته نمی‌شود تا افشین بگوید.
10. **ساختار:** هر دامنه یک پوشه در `src/features/<domain>/`؛ کد مشترک در `src/shared/`؛ صفحه‌ها lazy و زیر `AdminLayout` در `src/app/router.tsx` با **همان route منوی بک‌اند** (`/catalog/brands` و …) ثبت می‌شوند.
    - **منو (دوکشویی با عرض ثابت، قاب مطابق طرح «1» افشین):** قاب سفید ⇐ نوار ماژول‌ها (راست) + قاب خاکستری با کارت سفید زیرمنو. کشوی منوی اصلی به چپ باز می‌شود و زیرمنو بسته می‌شود؛ انتخاب ماژول یا دکمه‌ی کشو ⇐ زیرمنو به راست باز و منوی اصلی جمع می‌شود (حالت کشو برای هر کاربر در localStorage). سربرگ زیرمنو ⇐ مگامنو؛ بخش‌بندی پنل = `navConfig.sections`؛
    - **فقط یک داشبورد:** «داشبورد» منوی اصلی؛ داشبورد داخل ماژول‌ها (`*.dashboard`، مثل cms.dashboard) در منو نمی‌آید (`isModuleDashboard`).
    - **راهنمای شناور (TooltipLayer):** سراسری برای هر دکمه/لینک/گزینه/تب و هر عنصر با `data-tip`؛ متن = `data-tip` ⇐ `aria-label` ⇐ متن دکمه. دکمه‌ی فقط‌آیکونی حتماً `aria-label` می‌گیرد؛ `title` بومی استفاده نشود؛ `data-tip=""` یعنی بدون راهنما.
    - **Effect:** بدنه‌ی `useEffect` همیشه آکولاد دارد (`() => { … }`)؛ برگرداندن مقدار (مثل `window.scrollTo` که در Chrome جدید Promise است) React را با «destroy is not a function» می‌شکند.
    - **سربرگ شناور:** آیکون ماژول + مسیر (پنل مدیریت › ماژول) + عنوان صفحه، تاریخ امروز (شمسی)، شعبه‌ی فعال (منو هم‌تراز لبه‌ی چپ، داخل صفحه)، حساب کاربر و خروج. ماژول‌ها = ۱۵ منوی IA با نام و ترتیب IA (`navConfig.tsx`)؛ زیرمنو فقط از `/rbac/me/menu` (مجوزدار)؛ منوی بی‌صفحه در بک‌اند ⇐ «به‌زودی»؛ گروهی که کاربر مجوزش را ندارد ⇐ پنهان. منوی دستی/ساختگی ممنوع.
11. **پیش از تحویل هر صفحه:** `npm run build` سبز، و تست مرورگر دسکتاپ روی بک‌اند واقعی (موفق، خطا، خالی، بدون مجوز).

## ساختار

```
src/
  app/            App، router، queryClient
  shared/
    api/          client (توکن، refresh، X-Branch-ID)، errors، types، schema/ (تولیدی)
    auth/         AuthProvider، guards، api (login/me/revoke)، messages
    layout/       AdminLayout، Nav (سایدبار دوکشویی + مگامنو)، Header (مسیر، تاریخ، شعبه، حساب کاربر)، BranchPicker، navConfig (۱۵ ماژول IA + بخش‌بندی)، useNav، useBranches
    ui/           Button، TextField، Alert، Spinner، BrandMark، BrandLockup، icons، kit (Card، Badge، Avatar، Segmented، Modal، Pagination، …)، form (Input، Select، Textarea، Toggle)، DataTable، toast، TooltipLayer (راهنمای شناور سراسری)
    styles/       fonts (Zira = Vazirmatn برای متن و عدد)، tokens، base
    assets/brand/ logo.svg (نشان) و logo-lockup.svg (نشان + نام)
    assets/fonts/ Vazirmatn-Arabic/Latin-Variable.woff2 + Vazirmatn-OFL.txt (تنها فونت پروژه)
    lib/          ابزارها (ارقام فارسی/لاتین)
    data/         داده‌ی مرجع ثابت: iranDivisions (تقسیمات کشوری رسمی ۱۴۰۴: استان › شهرستان › شهر؛ lazy)
  features/
    auth/         صفحه‌ی ورود
    home/         داشبورد موقت (فقط داده‌ی /auth/me تا analytics)
    system/       PageNotBuilt (مسیر منو که صفحه‌اش هنوز ساخته نشده)، RouteError (errorElement مسیرها به‌جای صفحه‌ی پیش‌فرض React Router)
    users/        کاربران: فهرست، جزئیات (تب‌ها)، ویزارد افزودن/ویرایش، api و برچسب‌ها
    roles/        نقش‌ها و ماتریس مجوز
    departments/  دپارتمان‌ها
    branchAccess/ تخصیص شعب
    notifications/ اعلان‌ها
    customers/    مدیریت مشتریان: فهرست (CustomersListPage)، پرونده با تب‌ها (CustomerDetailPage + tabs/)، ویزارد ثبت و درخواست‌ها (registration/)، گروه‌ها (groups/)، api و برچسب‌ها
    branches/     مدیریت شعب: لیست شعب (کارت‌ها)، نمای شعبه (BranchDetailPage) و مودال‌های منابع (BranchModals)، ویزارد ثبت/ویرایش (BranchFormPage)، api و برچسب‌ها
    support/      پشتیبانی و ارتباطات: فهرست تیکت‌ها در سه حالت (TicketsListPage)، جزئیات و گفت‌وگو (TicketDetailPage)، ارسال پیام جدید (TicketNewPage)، فرم تماس، تقویم، api و برچسب‌ها
e2e/              تست‌های مرورگر روی بک‌اند واقعی
api-schema/       OpenAPI خام بک‌اند (ورودی api:types)
docs/screenshots/ تصاویر تست مرورگر
```

## ورود (identity) — قرارداد پیاده‌شده

| کار | endpoint |
|---|---|
| ورود کارمند | `POST /api/v1/public/auth/staff/login` → access token در بدنه، refresh در کوکی HttpOnly |
| بازیابی نشست (بعد از تازه‌سازی صفحه) | `POST /api/v1/public/auth/token/refresh` (کوکی؛ چرخشی؛ بین تب‌ها با Web Locks سریال) |
| پروفایل، شعب، مجوزها | `GET /api/v1/admin/auth/me` (فقط STAFF / SUPERADMIN) |
| خروج | `POST /api/v1/public/auth/token/revoke` |
| بازیابی رمز کارمند (2026-10-27) | `POST /api/v1/public/auth/staff/password/forgot/request` ⇐ `.../forgot/verify` ⇐ `.../staff/password/reset` |

رفتارها: ۵ تلاش ناموفق ⇐ قفل ۱۵ دقیقه (429)؛ حساب مشتری در ورود کارمند با همان پیام عمومی «نام کاربری یا رمز اشتباه» رد می‌شود (بدون افشای وجود حساب)؛ رمز فراموش‌شده را کارمند خودش با کد پیامکی بازیابی می‌کند (اگر سرویس روی سرور روشن باشد؛ وگرنه پیام «با مدیر سیستم تماس بگیرید») یا مدیر سیستم بازنشانی می‌کند.

تست‌شده روی بک‌اند واقعی (2026-10-17): هدایت ناشناس به ورود، خطای فیلدها، رمز اشتباه، حساب مشتری، قفل بعد از ۵ تلاش، ورود موفق، ماندن نشست بعد از تازه‌سازی، کوکی HttpOnly، نبود توکن در localStorage، خروج، فونت متن/عدد، لوگوی دوم، بدون خطای کنسول (فقط دسکتاپ).
