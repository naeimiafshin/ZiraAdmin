/**
 * موضوع و خلاصه‌ی خوانای فارسی برای هر ردیف لاگ فعالیت (افشین 2026-10-25: «خلاصه باشند، مفهوم را برسانند، تا جای ممکن فارسی»).
 *
 * بک‌اند برای بخشی از رخدادها متن انگلیسی یا فنی ثبت می‌کند (`Security event: identity.auth.login_failed`،
 * `SessionRule(USER:<uuid>, …)`، `Role x assigned to user <uuid>` …؛ کمبود E-08). تا وقتی بک‌اند متن فارسی ثبت کند،
 * فرانت این متن‌ها را با الگوهای زیر به یک عبارت کوتاه فارسی برمی‌گرداند. متن اصلی بک‌اند در مودال جزئیات می‌ماند.
 * قاعده: شناسه‌ی UUID هرگز نمایش داده نمی‌شود؛ کد لاتین (IP، کد نقش/مجوز) به‌صورت تکه‌ی `latin` (بدون فارسی‌سازی ارقام).
 */

/** تکه‌ی متن: رشته‌ی فارسی، یا تکه‌ی لاتین که ارقامش لاتین می‌ماند (IP، کد). */
export type Part = string | { latin: string };
export type Described = { noun: string; name: Part[]; summary: Part[] };

type LogLike = {
  domain_code: string; event_code: string; event_title: string; object_type: string; object_label: string;
  summary: string; actor_name?: string | null; payload?: Record<string, unknown> | null;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const FA = /[؀-ۿ]/;
const L = (latin: string): Part => ({ latin });

/** نام فارسی نوع موضوع (نام کلاس مدل بک‌اند). نوع ناشناخته ⇐ خالی (فقط نام موضوع). */
const OBJECT: Record<string, string> = {
  // identity / rbac / events
  User: 'کاربر', Department: 'دپارتمان', Notification: 'اعلان', Session: 'نشست', UserBranchAccess: 'دسترسی شعبه', UserDepartment: 'دپارتمان کاربر',
  UserDocument: 'مدرک کاربر', Credential: 'رمز عبور', Role: 'نقش', UserRole: 'نقش کاربر', RolePermission: 'مجوز نقش', Permission: 'مجوز',
  SecurityPolicy: 'سیاست امنیتی', IpRule: 'قانون IP', SessionRule: 'تنظیم نشست', AccountLock: 'قفل حساب', TwoFactorRule: 'ورود دو مرحله‌ای',
  SecurityEvent: 'حساب',
  // organization
  Company: 'شرکت', Branch: 'شعبه', Warehouse: 'انبار', BranchEmployee: 'کارمند شعبه', BranchPermit: 'مجوز شعبه', BranchAllowedItem: 'کالای مجاز شعبه',
  BranchWarehouse: 'انبار شعبه', CashBox: 'صندوق', PosDevice: 'کارتخوان', BranchBankAccount: 'حساب بانکی شعبه',
  // catalog
  Product: 'خانواده کالا', ProductDraft: 'پیش‌نویس کالا', Item: 'کالا', ItemImage: 'تصویر کالا', ItemPolicy: 'سیاست سفارش کالا', Brand: 'برند',
  Category: 'دسته‌بندی', Attribute: 'ویژگی', AttributeValue: 'مقدار ویژگی', Size: 'سایز', Color: 'رنگ', SizeSet: 'مجموعه سایز', ColorSet: 'مجموعه رنگ',
  Bundle: 'باندل',
  // pricing
  ItemPrice: 'قیمت کالا', BundlePrice: 'قیمت باندل', PriceList: 'لیست قیمت', PricingContract: 'قرارداد قیمت‌گذاری', Discount: 'تخفیف', Coupon: 'کد تخفیف',
  Campaign: 'کمپین', TaxRule: 'قانون مالیات',
  // customers
  Customer: 'مشتری', CustomerGroup: 'گروه مشتری', CustomerAddress: 'آدرس مشتری', CustomerDocument: 'مدرک مشتری', CustomerGuarantee: 'ضمانت',
  CreditAccount: 'حساب اعتباری', CreditChangeRequest: 'درخواست تغییر اعتبار', CustomerCreditLock: 'قفل مالی', CustomerRegistrationRequest: 'درخواست ثبت‌نام',
  GroupMarketerAssignment: 'بازاریاب گروه', MarketerAssignment: 'بازاریاب',
  // settings
  UnitOfMeasure: 'واحد', NumberSequence: 'شماره‌گذاری', CommercePolicy: 'سیاست فروش', CatalogDisplayPolicy: 'نمایش کاتالوگ', CatalogConfig: 'پیش‌فرض کاتالوگ',
  GradePricePolicy: 'تخفیف گرید', NamingRulePart: 'قاعده‌ی نام‌گذاری', GoodPayerScoreFactor: 'فرمول خوش‌حسابی', BundlePolicy: 'سیاست باندل',
  CampaignNature: 'ماهیت کمپین', EmailSetting: 'تنظیمات ایمیل',
  // support / cms / wms / sales / chat
  Ticket: 'تیکت', TicketMessage: 'پیام تیکت', TicketCategory: 'دپارتمان تیکت', ContactSubmission: 'پیام فرم تماس', SupportCalendar: 'تقویم پشتیبانی',
  BlogPost: 'نوشته‌ی وبلاگ', BlogCategory: 'دسته‌ی وبلاگ', Banner: 'بنر', Slide: 'اسلاید', StaticPage: 'صفحه', PageSection: 'بخش صفحه', FaqItem: 'پرسش متداول',
  FaqCategory: 'دسته‌ی پرسش‌ها', HomeBlock: 'بلوک صفحه‌ی اصلی', BrandShowcase: 'معرفی برند', Certificate: 'گواهی', CallToAction: 'فراخوان', SocialLink: 'شبکه‌ی اجتماعی',
  ContactInfo: 'اطلاعات تماس', PromoMessage: 'پیام تبلیغاتی',
  StockTransfer: 'انتقال کالا', GoodsReceipt: 'رسید ورود کالا', StockCount: 'انبارگردانی', ScrapRecord: 'ضایعات', StockOpening: 'موجودی اول دوره',
  ItemBreak: 'شکستن آیتم', ItemAssembly: 'ساخت آیتم', GradeChangeRequest: 'تغییر گرید', WarehouseZone: 'ناحیه‌ی انبار', BinLocation: 'آدرس انبار',
  ItemStockPolicy: 'سیاست موجودی', Cart: 'سبد خرید', Conversation: 'گفت‌وگو', ChatMessage: 'پیام',
};

/** رخدادهای امنیتی ورود (`Security event: <code>`) ⇐ عبارت کوتاه فارسی */
const SECURITY: Record<string, string> = {
  'identity.auth.login_succeeded': 'ورود موفق به پنل',
  'identity.auth.login_failed': 'تلاش ناموفق برای ورود',
  'identity.auth.logout': 'خروج از پنل',
  'identity.token.rotated': 'تمدید خودکار نشست',
  'identity.token.reused': 'استفاده‌ی دوباره از توکن (مشکوک)',
  'identity.auth.two_factor_challenged': 'ارسال کد پیامکی ورود',
  'identity.auth.two_factor_passed': 'تأیید کد پیامکی ورود',
  'identity.auth.two_factor_failed': 'کد پیامکی اشتباه',
  'identity.auth.password_change_required': 'رمز منقضی؛ درخواست تغییر رمز',
  'identity.auth.expired_password_changed': 'تعیین رمز تازه پس از انقضا',
};
const FAIL_REASON: Record<string, string> = {
  INVALID_CREDENTIALS: 'رمز یا نام کاربری اشتباه', WRONG_PASSWORD: 'رمز اشتباه', USER_NOT_FOUND: 'کاربر ناموجود', RATE_LIMIT_LOCKED: 'حساب موقتاً قفل',
  ACCOUNT_LOCKED: 'حساب قفل', IP_BLOCKED: 'IP مسدود', SUSPENDED: 'حساب تعلیق', TWO_FACTOR_FAILED: 'کد پیامکی اشتباه',
};
const LOCK_REASON: Record<string, string> = { AUTOMATIC_ATTEMPTS: 'تلاش‌های ناموفق ورود', MANUAL_ADMIN: 'قفل دستی مدیر', SUSPICIOUS_ACTIVITY: 'فعالیت مشکوک' };
const minutes = (m: string) => { const n = Number(m); return n % 60 === 0 && n >= 60 ? `${n / 60} ساعت` : `${n} دقیقه`; };
/** «شعبه کرج» یا «کرج» ⇐ همیشه با نوع، بدون تکرار («شعبه شعبه کرج») */
const pref = (noun: string, name: string) => (name.trim().startsWith(noun) ? name.trim() : `${noun} ${name.trim()}`);
const ipMode = (m: string) => (/ALLOW/.test(m) ? 'فهرست مجاز (Whitelist)' : 'فهرست مسدود (Blacklist)');

/** الگوهای متن انگلیسی بک‌اند (سرویس‌های events، identity، rbac، organization، customers) ⇐ خلاصه‌ی فارسی کوتاه. */
const RULES: [RegExp, (m: RegExpMatchArray) => Part[]][] = [
  [/^Updated system-wide security policy configuration$/, () => ['تغییر سیاست‌های امنیتی']],
  [/^Added IP rule: (\S+) (\S+)/, (m) => ['افزودن ', L(m[2]!), ` به ${ipMode(m[1]!)}`]],
  [/^Deleted IP rule: (\S+)/, (m) => ['حذف ', L(m[1]!), ' از فهرست IP']],
  [/^Account \S+ locked \(reason=(\w+)\)/, (m) => [`قفل حساب: ${LOCK_REASON[m[1]!] ?? m[1]}`]],
  [/^Account \S+ unlocked by admin/, () => ['باز کردن قفل حساب توسط مدیر']],
  [/^Set session limit for (?:\S*\.)?(USER|ROLE):\S+ to (\d+)/, (m) => [`سقف نشست هم‌زمان ${m[1] === 'ROLE' ? 'نقش' : 'کاربر'}: ${m[2]}`]],
  [/^Set session timeout for (?:\S*\.)?(USER|ROLE):\S+ to (\d+)m/, (m) => [`مهلت نشست ${m[1] === 'ROLE' ? 'نقش' : 'کاربر'}: ${minutes(m[2]!)}`]],
  [/^Cleared session limit for (?:\S*\.)?(USER|ROLE)/, (m) => [`برگشت سقف نشست ${m[1] === 'ROLE' ? 'نقش' : 'کاربر'} به پیش‌فرض`]],
  [/^Cleared session timeout for (?:\S*\.)?(USER|ROLE)/, (m) => [`برگشت مهلت نشست ${m[1] === 'ROLE' ? 'نقش' : 'کاربر'} به پیش‌فرض`]],
  [/^Session \S+ terminated by admin/, () => ['پایان دادن به نشست توسط مدیر']],
  [/^Session \S+ evicted due to concurrency limit/, () => ['بستن قدیمی‌ترین نشست به‌خاطر سقف نشست هم‌زمان']],
  [/^Created (\d+) activity log archive partitions/, (m) => [`بایگانی ${m[1]} بخش از لاگ فعالیت`]],
  [/^Purged (\d+) expired activity log archive records/, (m) => [`پاک‌سازی ${m[1]} بایگانی منقضی`]],
  // identity
  [/^Superadmin (\S+) seeded/, (m) => ['ساخت سوپر ادمین ', L(m[1]!)]],
  [/^Customer (\S+) seeded/, (m) => ['ساخت مشتری آزمایشی ', L(m[1]!)]],
  [/^Staff user (\S+) onboarded with personnel code (\S+)/, (m) => ['ثبت کارمند با کد پرسنلی ', L(m[2]!)]],
  [/^User (\S+) created/, () => ['ثبت کاربر']],
  [/^User (\S+) suspended: (.*)/, (m) => [`تعلیق کاربر: ${m[2]}`]],
  [/^Customer identity filled/, () => ['تکمیل هویت مشتری']],
  [/^Customer user created/, () => ['ساخت حساب کاربری مشتری']],
  [/^Department (\S+) \((.+)\) created/, (m) => [`ثبت دپارتمان ${m[2]}`]],
  [/^Department (\S+) deactivated/, (m) => ['غیرفعال کردن دپارتمان ', L(m[1]!)]],
  [/^Department (\S+) activated/, (m) => ['فعال کردن دپارتمان ', L(m[1]!)]],
  [/^Department (\S+) updated/, (m) => ['ویرایش دپارتمان ', L(m[1]!)]],
  [/^Departments updated for user/, () => ['تغییر دپارتمان‌های کاربر']],
  [/^Branch Master scope extended/, () => ['افزودن شعبه به قلمرو Branch Master']],
  [/^Branch Master scope reduced/, () => ['کم کردن شعبه از قلمرو Branch Master']],
  [/is_branch_master set to (True|False)/, (m) => [m[1] === 'True' ? 'فعال کردن Branch Master' : 'برداشتن Branch Master']],
  // rbac
  [/^Role (\S+) created/, (m) => ['ثبت نقش ', L(m[1]!)]],
  [/^Role (\S+) updated/, (m) => ['ویرایش نقش ', L(m[1]!)]],
  [/^Role (\S+) deactivated/, (m) => ['غیرفعال کردن نقش ', L(m[1]!)]],
  [/^Role (\S+) inherited permissions from (\S+)/, (m) => ['ارث‌بری مجوزها از نقش ', L(m[2]!)]],
  [/^Permission (\S+) granted to role/, (m) => ['دادن مجوز ', L(m[1]!)]],
  [/^Permission (\S+) revoked from role/, (m) => ['گرفتن مجوز ', L(m[1]!)]],
  [/^Role (\S+) assigned to user/, (m) => ['دادن نقش ', L(m[1]!), ' به کاربر']],
  [/^Role (\S+) replaced for user/, (m) => ['جایگزینی نقش ', L(m[1]!), ' کاربر']],
  [/^Role (\S+) revoked from user/, (m) => ['گرفتن نقش ', L(m[1]!), ' از کاربر']],
  // organization
  [/^Branch (.+) \((\S+)\) created/, (m) => [`ثبت ${pref('شعبه', m[1]!)}`]],
  [/^Primary warehouse (.+) created for branch (.+)/, (m) => [`ساخت انبار اصلی برای ${pref('شعبه', m[2]!)}`]],
  [/^Linked primary warehouse (.+) to (.+)/, (m) => [`اتصال ${pref('انبار', m[1]!)} (انبار اصلی) به ${pref('شعبه', m[2]!)}`]],
  [/^Linked warehouse (.+) to branch (.+)/, (m) => [`اتصال ${pref('انبار', m[1]!)} به ${pref('شعبه', m[2]!)}`]],
  [/^Unlinked warehouse (.+) from branch (.+)/, (m) => [`جدا کردن ${pref('انبار', m[1]!)} از ${pref('شعبه', m[2]!)}`]],
  [/^Branch (.+) settings updated/, (m) => [`تغییر تنظیمات حساس ${pref('شعبه', m[1]!)}`]],
  [/^Branch (.+) updated/, (m) => [`ویرایش ${pref('شعبه', m[1]!)}`]],
  [/^Branch (.+) closed/, (m) => [`بستن ${pref('شعبه', m[1]!)}`]],
  [/^Assigned user \S+ as '(.+)' to branch (.+)/, (m) => [`استخدام در ${pref('شعبه', m[2]!)} با سمت ${m[1]}`]],
  [/^Updated employment of user/, () => ['ویرایش سمت یا شیفت کارمند']],
  [/^Unassigned employee \S+ from branch (.+)/, (m) => [`پایان اشتغال در ${pref('شعبه', m[1]!)}`]],
  [/^Employment of \S+ ended/, () => ['پایان اشتغال (آزادسازی از شعبه)']],
  [/^Updated assortment for branch (.+)/, (m) => [`تغییر کالاهای مجاز ${pref('شعبه', m[1]!)}`]],
  [/^Updated permits for branch (.+)/, (m) => [`تغییر مجوزهای ${pref('شعبه', m[1]!)}`]],
  [/^Warehouse (.+) \((\S+)\) created/, (m) => [`ثبت ${pref('انبار', m[1]!)}`]],
  [/^Warehouse (.+) updated/, (m) => [`ویرایش ${pref('انبار', m[1]!)}`]],
  [/^Warehouse (.+) deactivated/, (m) => [`غیرفعال کردن ${pref('انبار', m[1]!)}`]],
  [/^Cash box (\S+) assigned to branch (\S+)/, (m) => ['تخصیص صندوق ', L(m[1]!), ' به شعبه ', L(m[2]!)]],
  [/^Cash box (\S+) unassigned from branch (\S+)/, (m) => ['لغو تخصیص صندوق ', L(m[1]!)]],
  [/^Cash box (\S+) settings changed/, (m) => ['تغییر تنظیمات صندوق ', L(m[1]!)]],
  [/^Cash box (.+?)(?: \((\S+)\))? opened/, (m) => [`باز کردن ${pref('صندوق', m[1]!)}`]],
  [/^Cash box (.+) updated/, (m) => [`ویرایش ${pref('صندوق', m[1]!)}`]],
  [/^Cash box (.+) closed/, (m) => [`بستن ${pref('صندوق', m[1]!)}`]],
  [/^POS (\S+) assigned to branch (\S+)/, (m) => ['تخصیص کارتخوان ', L(m[1]!), ' به شعبه ', L(m[2]!)]],
  [/^POS (\S+) unassigned from branch/, (m) => ['لغو تخصیص کارتخوان ', L(m[1]!)]],
  [/^POS (\S+) settings changed/, (m) => ['تغییر تنظیمات کارتخوان ', L(m[1]!)]],
  [/^POS terminal (\S+) registered/, (m) => ['ثبت کارتخوان ', L(m[1]!)]],
  [/^POS terminal (\S+) updated/, (m) => ['ویرایش کارتخوان ', L(m[1]!)]],
  [/^POS terminal (\S+) deactivated/, (m) => ['غیرفعال کردن کارتخوان ', L(m[1]!)]],
  [/^Company profile (.+) registered/, (m) => [`ثبت اطلاعات شرکت ${m[1]}`]],
  [/^Company profile (.+) updated/, () => ['ویرایش اطلاعات شرکت']],
  // customers
  [/^Customer commercial registration submitted/, () => ['ثبت درخواست پرونده‌ی تجاری مشتری']],
  [/^Customer profile created \(ACTIVE\)/, () => ['ساخت پرونده‌ی فعال مشتری']],
  [/^Address '(.+)' created/, (m) => [`ثبت آدرس «${m[1]}»`]],
  [/^Address '(.+)' updated/, (m) => [`ویرایش آدرس «${m[1]}»`]],
  [/^Address '(.+)' set as default/, (m) => [`پیش‌فرض کردن آدرس «${m[1]}»`]],
  [/^Customer address \S+ soft-deleted/, () => ['حذف آدرس مشتری']],
  [/^Customer document corrected/, () => ['اصلاح مدرک مشتری (نیاز به بررسی دوباره)']],
  [/^Customer business license number updated/, () => ['تغییر شماره‌ی پروانه‌ی کسب']],
  [/^Active guarantee released and replaced/, () => ['جایگزینی ضمانت فعال با مدرک تازه']],
  // cms
  [/^cms\.block\.(hidden|shown)$/, (m) => [m[1] === 'hidden' ? 'پنهان کردن بلوک صفحه‌ی اصلی' : 'نمایش بلوک صفحه‌ی اصلی']],
];


/** نام موضوع: برچسب بک‌اند بدون شناسه، repr پایتون و پسوند نوع کاربر. */
function nameOf(l: LogLike): Part[] {
  const raw = (l.object_label || '').trim();
  if (l.object_type === 'SecurityEvent') {
    const u = l.actor_name || (typeof l.payload?.username === 'string' ? l.payload.username : '');
    return u ? (FA.test(u) ? [u] : [L(u)]) : ['ناشناس'];
  }
  if (!raw) return [];
  if (l.object_type === 'IpRule') { const ip = raw.match(/\d{1,3}(?:\.\d{1,3}){3}(?:\/\d+)?|[0-9a-f:]+\/\d+/i); return ip ? [L(ip[0])] : []; }
  if (l.object_type === 'UserRole') { const r = raw.match(/->\s*(\S+)/); return r ? [L(r[1]!)] : []; }
  UUID.lastIndex = 0;
  if (/^[A-Z]\w*\(.*\)$/.test(raw) || /^\w+\.\w+\.\w+$/.test(raw) || /^Session /.test(raw)) return [];
  const clean = raw.replace(UUID, '').replace(/\s*\((STAFF|SUPERADMIN|CUSTOMER)\)$/, '').replace(/\s*\([a-z0-9_.-]+\)$/, '').trim();
  if (!clean) return [];
  return FA.test(clean) ? [clean] : [L(clean)];
}

function summaryOf(l: LogLike): Part[] {
  const s = (l.summary || '').trim();
  const full = `${l.domain_code}.${l.event_code}`;
  if (/^Security event:/.test(s) || l.object_type === 'SecurityEvent') {
    const base = SECURITY[full] ?? l.event_title;
    const reason = typeof l.payload?.reason === 'string' ? FAIL_REASON[l.payload.reason] : undefined;
    return [reason ? `${base} (${reason})` : base];
  }
  // اول الگوهای متن انگلیسی (بعضی متن‌ها نام فارسی را داخل جمله‌ی انگلیسی دارند: «Branch شعبه کرج (KRJ-01) created»)
  for (const [re, fn] of RULES) { const m = s.match(re); if (m) return fn(m); }
  // متن فارسی بک‌اند (بدون واژه‌ی انگلیسی بیرون از پرانتز و گیومه) ⇐ همان، بدون شناسه
  if (FA.test(s) && !/[A-Za-z]{3,}/.test(s.replace(/\(.*?\)|«.*?»/g, ''))) return [s.replace(UUID, '').replace(/\s{2,}/g, ' ').trim()];
  // ناشناخته ⇐ عنوان فارسی رخداد از کاتالوگ
  return [l.event_title || s.replace(UUID, '')];
}

export function describe(l: LogLike): Described {
  const name = nameOf(l);
  let noun = OBJECT[l.object_type] ?? '';
  // «شعبه شعبه کرج» / «انبار انبار شعبه کرج» ⇐ وقتی نام خودش با نوع شروع می‌شود، نوع تکرار نمی‌شود
  if (noun && typeof name[0] === 'string' && name[0].startsWith(noun)) noun = '';
  return { noun, name, summary: summaryOf(l) };
}

/** آیا خلاصه‌ی نمایش‌داده‌شده با متن ثبت‌شده‌ی بک‌اند فرق دارد (تا متن اصلی در مودال نشان داده شود) */
export const differsFromRaw = (l: LogLike, parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : p.latin)).join('') !== (l.summary || '').trim();
