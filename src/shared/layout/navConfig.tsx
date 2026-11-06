import type { ComponentType } from 'react';
import {
  IconActivity, IconAdjustmentsHorizontal, IconAward, IconBell, IconBook, IconBox, IconBoxMultiple, IconBriefcase,
  IconBuilding, IconBuildingStore, IconBuildingWarehouse, IconCalendar, IconCashRegister, IconChartBar, IconCreditCard,
  IconDiscount, IconEye, IconGift, IconFileCertificate, IconFileText, IconFolderShare, IconGauge, IconHash,
  IconHelpCircle, IconHistory, IconHome, IconLayoutDashboard, IconListDetails, IconMail, IconMessages, IconPackage, IconPackages,
  IconPercentage, IconPhone, IconPoint, IconReceipt, IconReceipt2, IconReportMoney, IconScale, IconSettings,
  IconShieldCheck, IconSitemap, IconSpeakerphone, IconTag, IconTextSize, IconTicket,
  IconTruck, IconUser, IconUserPlus, IconUserShield, IconUsers, type IconProps, IconLayoutGrid, IconArrowMerge, IconChartLine, IconArrowsExchange, IconTransfer, IconSquarePlus, IconMessageCheck, IconSend, IconShoppingCart, IconShoppingBag, IconDeviceLaptop, IconClipboardList, IconInbox, IconArrowBackUp } from '@tabler/icons-react';
// آیکون‌های اختصاصی «زیره» برای منوی اصلی (انتخاب افشین 2026-11-04)
import { ZiraBranches, ZiraCatalog, ZiraContent, ZiraCustomers, ZiraReports, ZiraSales, ZiraSupport, ZiraUsers, ZiraWarehouse } from './ziraIcons';

export type NavIcon = ComponentType<IconProps>;

/**
 * منوی سطح اول = دقیقاً ۱۵ منوی IA (`IA/admin/ZiraMarket_admin_IA_FINAL.pdf`، ستون Header)، با همان نام و ترتیب.
 * code = کد گروه در بک‌اند (`domains/rbac/admin_menu.py`، ADMIN_MENU)؛ زیرمنوها از `/rbac/me/menu` می‌آیند.
 * notBuilt = دامنه هنوز در بک‌اند صفحه‌ای ندارد ⇐ برای همه «به‌زودی» نمایش داده می‌شود.
 * گروهی که بک‌اند برنمی‌گرداند و notBuilt نیست ⇐ کاربر مجوز ندارد ⇐ پنهان.
 * off = ماژول با تصمیم افشین خاموش است (2026-10-24) ⇐ حتی اگر بک‌اند صفحه داشته باشد «به‌زودی» نمایش داده می‌شود.
 */
export type IaGroup = {
  code: string;
  name: string;
  /** زیرعنوان پنل ماژول (متن رابط، مثل html Fixed) */
  sub: string;
  icon: NavIcon;
  notBuilt?: boolean;
  off?: boolean;
  /** بخش‌بندی پنل ماژول: عنوان بخش ⇐ full_code صفحه‌ها (ترتیب داخل بخش = ترتیب بک‌اند) */
  sections?: { title: string; items: string[] }[];
};

export const IA_GROUPS: IaGroup[] = [
  { code: 'dashboard', name: 'داشبورد', sub: 'نمای کلی سامانه', icon: IconLayoutDashboard, off: true },
  {
    code: 'orders',
    name: 'مدیریت سفارشات',
    sub: 'سفارش‌ها، فاکتورها و تأمین',
    icon: IconShoppingCart,
    sections: [
      { title: 'سفارش‌ها', items: ['orders.orders', 'orders.orders.new'] },
      { title: 'فاکتورها', items: ['orders.invoices'] },
      { title: 'درخواست‌های مشتریان', items: ['orders.supply_requests'] },
    ],
  },
  { code: 'customers', name: 'مدیریت مشتریان', sub: 'مشتریان، گروه‌ها و درخواست‌ها', icon: ZiraCustomers },
  {
    code: 'catalog', name: 'محصولات و کاتالوگ', sub: 'کاتالوگ فروشگاه و قیمت‌گذاری', icon: ZiraCatalog,
    sections: [
      // ترتیب و نام‌ها مطابق html Fixed «Product and Catalog_V2» (افشین 2026-10-22)
      { title: 'کاتالوگ', items: ['catalog.products', 'catalog.products.new', 'catalog.items', 'catalog.items.new', 'catalog.bundles', 'catalog.bundles.new', 'catalog.categories', 'catalog.brands', 'catalog.attributes'] },
      // ترتیب html V2 + صفحه‌های اضافه‌ی بک‌اند بعد از آن‌ها (افشین 2026-10-22)
      // تخفیف‌ساز مثل html زیر قیمت‌گذاری؛ «کدهای تخفیف» تب تخفیف‌ساز است (فقط وقتی مجوز تخفیف‌ها نیست، جدا با نام تخفیف‌ساز) — 2026-10-22
      { title: 'قیمت‌گذاری', items: ['pricing.price_lists', 'pricing.contracts', 'pricing.discounts', 'pricing.coupons', 'pricing.tax_rules'] },
      { title: 'بازاریابی', items: ['pricing.campaigns', 'marketing.reports'] },
    ],
  },
  { code: 'content', name: 'مدیریت محتوا', sub: 'محتوای سایت و صفحه‌ی اصلی', icon: ZiraContent, off: true },
  { code: 'wms', name: 'مدیریت انبار', sub: 'انبارها و موجودی', icon: ZiraWarehouse, off: true },
  {
    code: 'branches', name: 'مدیریت شعب', sub: 'شعب و اطلاعات آن‌ها', icon: ZiraBranches,
    // IA «Branch Management» با جزئیات html Fixed (افشین 2026-10-23): داشبورد شعب (قانون یک داشبورد) و قیمت‌گذاری مجدد (تصمیم 2026-09-29) حذف
    sections: [
      { title: 'شعب', items: ['organization.branches', 'organization.branches.new'] },
      { title: 'مدیریت موجودی', items: ['branches.stock', 'branches.transfers', 'branches.inter_transfers', 'branches.kardex'] },
      { title: 'گزارش‌ها', items: ['branches.reports'] },
    ],
  },
  { code: 'finance', name: 'حسابداری و مالی', sub: 'صندوق‌ها و دستگاه‌های پوز', icon: IconReportMoney, off: true },
  {
    code: 'sales', name: 'فروش', sub: 'پیش‌فاکتور تا تسویه', icon: ZiraSales,
    // روشن از ۱۳ آبان ۱۴۰۵ (افشین)؛ سه بخش با تأیید افشین. صفحه‌های ساخته‌نشده در SOON_PAGES «به‌زودی» می‌مانند.
    sections: [
      { title: 'اسناد فروش', items: ['sales.proformas', 'sales.invoices', 'sales.invoices.new', 'sales.sales_returns', 'sales.consignment_sales', 'sales.presale'] },
      { title: 'گزارش‌ها', items: ['sales.reports', 'sales.customer_accounts'] },
      { title: 'درخواست‌ها', items: ['sales.sales_requests'] },
    ],
  },
  {
    code: 'procurement', name: 'خرید و تأمین', sub: 'درخواست تأمین، اسناد خرید و تأمین‌کنندگان', icon: IconTruck,
    // نام بک‌اند و html؛ بخش‌بندی مطابق html Fixed «Supply Management» و IA (افشین 2026-10-31)
    sections: [
      { title: 'تأمین', items: ['supply.supply_requests', 'supply.supply_council', 'supply.suppliers'] },
      { title: 'خرید', items: ['supply.receipt_advices', 'supply.purchase_invoices', 'supply.consignments', 'supply.purchase_returns'] },
      { title: 'مرور', items: ['supply.reports', 'supply.account_review'] },
    ],
  },
  {
    code: 'users', name: 'مدیریت کاربران', sub: 'کاربران و نقش‌های سیستم', icon: ZiraUsers,
    sections: [
      { title: 'مدیریت کاربران', items: ['identity.users', 'rbac.roles', 'identity.branch_access', 'identity.departments'] },
      { title: 'سامانه', items: ['identity.security', 'rbac.access_log', 'identity.notifications', 'chat.conversations'] },
    ],
  },
  {
    code: 'support', name: 'پشتیبانی و ارتباطات', sub: 'تیکت‌ها و پیام‌ها', icon: ZiraSupport,
    // سه منوی IA «Ticketing» + منابع بک‌اند که IA ندارد (افشین 2026-10-24: کد بک‌اند مرجع، IA راهنما)
    sections: [
      { title: 'تیکت‌ها', items: ['support.tickets', 'support.answered', 'support.outbound', 'support.outbound.new'] },
      { title: 'ارتباطات', items: ['support.contact_submissions'] },
      { title: 'تنظیمات', items: ['support.calendar'] },
    ],
  },
  { code: 'reports', name: 'گزارشات', sub: 'گزارش‌های مدیریتی', icon: ZiraReports, notBuilt: true },
  {
    code: 'settings', name: 'تنظیمات', sub: 'تنظیمات پایه‌ی سامانه', icon: IconSettings,
    // طرح html و IA ندارد؛ نام‌ها و ترتیب از بک‌اند (settings/permissions.py و ADMIN_MENU)، سه بخش با تأیید افشین 2026-10-24
    sections: [
      { title: 'پایه', items: ['organization.company', 'settings.units', 'settings.numbering', 'settings.email'] },
      { title: 'فروش و مشتری', items: ['settings.commerce_policy', 'settings.score_formula', 'settings.campaign_natures'] },
      { title: 'کاتالوگ', items: ['settings.catalog_display', 'settings.naming_rule', 'settings.catalog_config', 'settings.grade_policy', 'settings.bundle_policies'] },
      { title: 'امنیت', items: ['settings.session_limits', 'settings.security_policy'] },
      // مدیریت شورای تأمین در تنظیمات (افشین 2026-10-31)
      { title: 'خرید و تأمین', items: ['settings.supply_council'] },
    ],
  },
  // هر صفحه فقط یک جا (افشین 2026-10-25): رخدادها = لاگ فعالیت‌ها + کاتالوگ رخدادها؛ نشست‌ها در «مدیریت کاربران ⇐ سامانه»،
  // خط‌مشی امنیتی و محدودیت نشست در تنظیمات ⇐ events.security_policy از منوی رخدادها پنهان (HIDDEN_PAGES)
  { code: 'events', name: 'رخدادها', sub: 'لاگ فعالیت و امنیت', icon: IconActivity },
];

/**
 * صفحه‌هایی که در html Fixed هست ولی در بک‌اند منبع منوی جدا ندارد (مودال یک resource دیگر است).
 * فقط با مجوز همان resource نمایش داده می‌شود.
 */
export const EXTRA_PAGES: { group: string; key: string; name: string; route: string; icon: string; perm: string; after: string; sub?: boolean; soon?: boolean }[] = [
  { group: 'users', key: 'identity.branch_access', name: 'تخصیص شعب', route: '/identity/branch-access', icon: 'building-store', perm: 'identity.users.branch_access.read', after: 'rbac.roles' },
  { group: 'users', key: 'identity.security', name: 'نشست‌ها', route: '/identity/security', icon: 'shield-check', perm: 'events.sessions.active.list', after: 'identity.departments' },
  // صفحه‌ی بک‌اند با is_menu_item=False ⇐ این‌جا در «سامانه» (افشین 2026-10-24: کاتالوگ اندپوینت‌ها نه)
  { group: 'users', key: 'rbac.access_log', name: 'گزارش دسترسی‌ها', route: '/rbac/access-log', icon: 'list-details', perm: 'rbac.access_log.list', after: 'identity.security' },
  // تاریخچه‌ی تغییرات سقف اعتبار همه‌ی مشتریان (افشین 2026-10-25)؛ صفحه‌ی منوی بک‌اند ندارد
  { group: 'customers', key: 'customers.credit_history', name: 'تاریخچه‌ی تغییرات اعتبار', route: '/customers/credit-history', icon: 'history', perm: 'customers.profiles.credit_policy.approve', after: 'customers.groups' },
  // زیرصفحه‌های html کاتالوگ (└ زیر صفحه‌ی والد)
  { group: 'catalog', key: 'catalog.products.new', name: 'تعریف ماتریسی کالا', route: '/catalog/products/new', icon: 'matrix', perm: 'catalog.products.create', after: 'catalog.products', sub: true },
  { group: 'catalog', key: 'catalog.items.new', name: 'ساخت آیتم', route: '/catalog/items/new', icon: 'merge', perm: 'catalog.items.create', after: 'catalog.items', sub: true },
  { group: 'catalog', key: 'catalog.bundles.new', name: 'تعریف باندل جدید', route: '/catalog/bundles/new', icon: 'bundle-add', perm: 'catalog.bundles.create', after: 'catalog.bundles' },
  // مدیریت شعب (IA + html Fixed، افشین 2026-10-23)؛ صفحه‌های ساخته‌نشده «به‌زودی» تا نوبت ساختشان
  { group: 'branches', key: 'organization.branches.new', name: 'شعبه جدید', route: '/organization/branches/new', icon: 'square-plus', perm: 'organization.branches.create', after: 'organization.branches', sub: true },
  { group: 'branches', key: 'branches.stock', name: 'موجودی شعب و انبارها', route: '/organization/branches/stock', icon: 'boxes', perm: 'wms.stock.list', after: 'organization.branches.new' },
  { group: 'branches', key: 'branches.transfers', name: 'انتقال بین شعبه و انبار', route: '/organization/branches/transfers', icon: 'arrows-exchange', perm: 'wms.transfers.list', after: 'branches.stock' },
  { group: 'branches', key: 'branches.inter_transfers', name: 'انتقال بین شعب', route: '/organization/branches/inter-transfers', icon: 'transfer', perm: 'wms.transfers.list', after: 'branches.transfers' },
  { group: 'branches', key: 'branches.kardex', name: 'گردش کالا', route: '/organization/branches/kardex', icon: 'list-details', perm: 'wms.stock_reports.list', after: 'branches.inter_transfers' },
  { group: 'branches', key: 'branches.reports', name: 'گزارش‌ها', route: '/organization/branches/reports', icon: 'chart-bar', perm: 'wms.stock_reports.list', after: 'branches.kardex' },
  // پشتیبانی (IA Ticketing): منبع بک‌اند یکی است (support.tickets)؛ سه صفحه‌ی IA فیلترهای همان فهرست‌اند
  { group: 'support', key: 'support.answered', name: 'تیکت‌های پاسخ داده شده', route: '/support/answered', icon: 'message-check', perm: 'support.tickets.list', after: 'support.tickets' },
  { group: 'support', key: 'support.outbound', name: 'ثبت تیکت', route: '/support/outbound', icon: 'send', perm: 'support.tickets.list', after: 'support.answered' },
  { group: 'support', key: 'support.outbound.new', name: 'ارسال پیام جدید', route: '/support/outbound/new', icon: 'square-plus', perm: 'support.tickets.create', after: 'support.outbound', sub: true },
  // خرید و تأمین: «مرور جامع طرف حساب» مال دامنه‌ی حسابداری است ⇐ به‌زودی
  // افشین ۱۴ آبان ۱۴۰۵: همه‌ی زیرمنوهای دوم «خرید و تأمین» (ثبت درخواست تأمین، ثبت اعلامیه، ثبت فاکتور خرید، ثبت برگشت، ثبت امانی) حذف شد؛
  // ثبت از دکمه‌ی بالای هر فهرست انجام می‌شود و مسیرهای /new همچنان کار می‌کنند.
  { group: 'procurement', key: 'supply.account_review', name: 'مرور جامع طرف حساب', route: '/supply/account-review', icon: 'scale', perm: 'supply.reports.read', after: 'supply.reports', soon: true },
  // فروش (افشین ۱۳ آبان ۱۴۰۵): «فاکتور فروش جدید» زیر فاکتورها؛ «پیش‌فروش» مال مدیریت سفارشات است و API ندارد ⇐ به‌زودی
  { group: 'sales', key: 'sales.invoices.new', name: 'فاکتور فروش جدید', route: '/sales/invoices/new', icon: 'square-plus', perm: 'sales.invoices.create', after: 'sales.invoices', sub: true },
  { group: 'sales', key: 'sales.presale', name: 'پیش‌فروش', route: '/sales/presale', icon: 'calendar', perm: 'sales.invoices.list', after: 'sales.consignment_sales', soon: true },
  // html «گزارشات پیشرفته» — بک‌اند گزارش کمپین ندارد (P-10) ⇐ غیرفعال با «به‌زودی»
  { group: 'catalog', key: 'marketing.reports', name: 'گزارشات پیشرفته', route: '/marketing/reports', icon: 'chart-line', perm: 'pricing.campaigns.list', after: 'pricing.campaigns', soon: true },
  // تنظیمات ایمیل: مدل در بک‌اند هست ولی API و مجوز ندارد (docs/SETTINGS_BACKEND_GAPS.md)؛ مجوز = نام پیشنهادی ⇐ فعلاً فقط سوپر ادمین می‌بیند (افشین 2026-10-24: صفحه‌ی کامل با «به‌زودی»)
  { group: 'settings', key: 'settings.email', name: 'تنظیمات ایمیل', route: '/settings/email', icon: 'mail', perm: 'settings.email.read', after: 'settings.numbering' },
  // منتقل‌شده از «مدیریت کاربران ⇐ امنیت و نشست‌ها» (افشین 2026-10-25)
  { group: 'settings', key: 'settings.session_limits', name: 'محدودیت نشست', route: '/settings/session-limits', icon: 'gauge', perm: 'events.sessions.limits.list', after: 'settings.email' },
  { group: 'settings', key: 'settings.security_policy', name: 'سیاست‌های امنیتی', route: '/settings/security-policy', icon: 'shield-check', perm: 'events.security_policy.read', after: 'settings.session_limits' },
  // شورای تأمین: اعضا، عنوان‌ها و قواعد رأی‌گیری در تنظیمات (افشین 2026-10-31)؛ منبع منوی بک‌اند ندارد
  { group: 'settings', key: 'settings.supply_council', name: 'شورای تأمین', route: '/settings/supply-council', icon: 'users', perm: 'supply.supply_council.list', after: 'settings.security_policy' },
  // مدیریت سفارشات (افشین ۱۵ آبان ۱۴۰۵)
  { group: 'orders', key: 'orders.orders', name: 'سفارش‌ها', route: '/orders/orders', icon: 'shopping-bag', perm: 'orders.orders.list', after: '' },
  { group: 'orders', key: 'orders.orders.new', name: 'ثبت سفارش جدید', route: '/orders/orders/new', icon: 'square-plus', perm: 'orders.orders.create', after: 'orders.orders', sub: true },
  { group: 'orders', key: 'orders.invoices', name: 'فاکتورهای سفارش', route: '/orders/invoices', icon: 'receipt', perm: 'orders.orders.list', after: 'orders.orders.new' },
  { group: 'orders', key: 'orders.supply_requests', name: 'درخواست‌های تأمین', route: '/orders/supply-requests', icon: 'clipboard-list', perm: 'orders.supply.list', after: 'orders.invoices' },
];

/**
 * صفحه‌های منوی بک‌اند که هنوز در فرانت ساخته نشده‌اند ⇐ در منو غیرفعال با «به‌زودی» (افشین ۱۳ آبان ۱۴۰۵: ماژول فروش صفحه‌به‌صفحه
 * ساخته می‌شود). با ساخته شدن هر صفحه، کدش از این فهرست برداشته می‌شود.
 */
export const SOON_PAGES = new Set<string>([
  'sales.proformas', 'sales.sales_returns', 'sales.consignment_sales', 'sales.reports', 'sales.customer_accounts', 'sales.sales_requests',
]);

/** صفحه‌ای که با وجود صفحه‌ی میزبان در منو نمی‌آید (تب آن صفحه است): کلید ⇐ صفحه‌ی میزبان */
export const MERGED_INTO: Record<string, string> = { 'pricing.coupons': 'pricing.discounts' };
/** صفحه‌های بک‌اند که در منو نمی‌آیند: «قیمت کالاها» (افشین 2026-10-24؛ اعمال قرارداد ⇐ لیست‌های قیمت، ویرایش تکی قیمت ⇐ مودال کالا) */
export const HIDDEN_PAGES = new Set<string>(['pricing.prices', 'events.security_policy']);

/** نام‌های html Fixed برای صفحه‌هایی که نام بک‌اندشان فرق دارد (افشین 2026-10-22: زیرمنوی کاتالوگ مطابق html) */
export const NAME_OVERRIDES: Record<string, string> = {
  'catalog.products': 'کالاها (کوچک‌ترین واحد)', 'catalog.items': 'آیتم‌ها (واحد فروش)', 'catalog.bundles': 'باندل‌ها (دسته‌بندی فروش)',
  'catalog.categories': 'دسته‌بندی کالا', 'catalog.attributes': 'ویژگی‌ها و متغیرها', 'pricing.coupons': 'تخفیف‌ساز',
  'organization.branches': 'لیست شعب',
  'support.tickets': 'تیکت‌های در انتظار',
  // افشین ۱۲ آبان ۱۴۰۵: «لیست پیش‌سفارشات» ⇐ «درخواست‌های تأمین»
  'supply.supply_requests': 'درخواست‌های تأمین',
};

/** نام آیکون بک‌اند (DOMAIN_DECLARATION.icon) ⇐ آیکون Tabler. نام ناشناخته ⇐ نقطه. */
const ICONS: Record<string, NavIcon> = {
  users: IconUsers, 'user-plus': IconUserPlus, 'folder-shared': IconFolderShare, package: IconPackage, tag: IconTag,
  'folder-tree': IconSitemap, award: IconAward, sliders: IconAdjustmentsHorizontal, boxes: IconBoxMultiple,
  price: IconReceipt2, contract: IconFileCertificate, discount: IconDiscount, ticket: IconTicket, camp: IconSpeakerphone,
  percent: IconPercentage, gauge: IconGauge, home: IconHome, 'file-text': IconFileText, 'help-circle': IconHelpCircle,
  'book-open': IconBook, phone: IconPhone, warehouse: IconBuildingWarehouse, 'building-store': IconBuildingStore,
  'cash-register': IconCashRegister, 'credit-card': IconCreditCard, user: IconUser, briefcase: IconBriefcase,
  'user-tag': IconUserShield, bell: IconBell, calendar: IconCalendar, mail: IconMail, building: IconBuilding,
  scale: IconScale, hash: IconHash, receipt: IconReceipt, eye: IconEye, 'chart-bar': IconChartBar, text: IconTextSize,
  box: IconBox, history: IconHistory, 'device-laptop': IconDeviceLaptop, 'shield-check': IconShieldCheck, 'list-details': IconListDetails, 'message-square': IconMessages,
  matrix: IconLayoutGrid, merge: IconArrowMerge, 'bundle-add': IconPackages, 'chart-line': IconChartLine,
  'arrows-exchange': IconArrowsExchange, transfer: IconTransfer, 'square-plus': IconSquarePlus,
  'message-check': IconMessageCheck, send: IconSend, gift: IconGift,
  'clipboard-list': IconClipboardList, inbox: IconInbox, undo: IconArrowBackUp, 'bar-chart': IconChartBar,
  'shopping-bag': IconShoppingBag,
};
export const iconFor = (name: string): NavIcon => ICONS[name] ?? IconPoint;

/** مسیر داشبورد در بک‌اند /dashboard است؛ در فرانت صفحه‌ی اصلی «/». */
export const toAppRoute = (route: string): string => (route === '/dashboard' || route === '' ? '/' : route);

/**
 * قانون پنل: فقط یک داشبورد (منوی اصلی «داشبورد»). داشبوردهای داخل ماژول‌ها (مثل cms.dashboard) در منو نمایش داده نمی‌شوند.
 */
export const isModuleDashboard = (fullCode: string, route: string | null | undefined): boolean =>
  fullCode.endsWith('.dashboard') || /\/dashboard\/?$/.test(route ?? '');
