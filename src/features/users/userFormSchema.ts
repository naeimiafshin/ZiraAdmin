import { z } from 'zod';
import { jalaliTextToGregorian } from '@/shared/lib/format';
import { clean, isCard, isIban, isMobile, isNationalId, isPostal, mobileProblem } from '@/shared/lib/validate';

const req = (m = 'این فیلد الزامی است.') => z.string().trim().min(1, m);
const opt = z.string().trim();
/** موبایل: پیش از رفتن به مرحله‌ی بعد و پیش از ذخیره از نظر ارقام بررسی می‌شود (۱۱ رقم، ۰۹، فقط رقم — افشین 2026-10-25) */
const mobile = (s: z.ZodString) => s.superRefine((v, ctx) => { const m = mobileProblem(v); if (m) ctx.addIssue({ code: 'custom', message: m }); });
// تلفن بستگان هم موبایل است (افشین 2026-10-25)
const kin = z.object({ full_name: req(), relation: req(), phone: mobile(req('موبایل الزامی است.')), address: opt });
/** ایمیل استاندارد (local@domain.tld، بدون فاصله و نقطه‌ی پشت‌سرهم) */
const EMAIL = /^(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/** همه‌ی فیلدهای فرم کارمند (قیدها مطابق StaffRegisterIn و domains/identity/validators.py). */
export const userFormSchema = z
  .object({
    mode: z.enum(['create', 'edit']),
    // ۱. هویتی
    first_name: req(), last_name: req(),
    national_id: req().refine((v) => isNationalId(v), 'کد ملی معتبر نیست.'),
    birth_certificate_no: req(), issue_place: req(), father_name: req(),
    birth_date: req().refine((v) => { const g = jalaliTextToGregorian(v); return !!g && g < new Date().toISOString().slice(0, 10); }, 'تاریخ تولد شمسی معتبر و گذشته وارد کنید (مثل ۱۳۷۰/۰۱/۰۱).'),
    gender: req('جنسیت را انتخاب کنید.'), marital_status: req('وضعیت تأهل را انتخاب کنید.'),
    children_count: z.string().trim().refine((v) => /^[0-9۰-۹]+$/.test(v), 'تعداد فرزند را عدد وارد کنید.'),
    educational_qualification: req('آخرین مدرک تحصیلی را انتخاب کنید.'), social_security_no: opt,
    // ۲. آدرس و تماس
    province: req(), city: req(), full_address: req(),
    postal_code: req().refine(isPostal, 'کد پستی باید ۱۰ رقم باشد.'),
    phone: req(), email: opt.refine((v) => !v || (v.length <= 254 && EMAIL.test(v)), 'ایمیل معتبر نیست (مثل name@example.com).'),
    mobile_1: mobile(req('موبایل شخصی ۱ الزامی است.')), mobile_2: mobile(opt),
    next_of_kin: z.array(kin).length(2, 'اطلاعات ۲ نفر از بستگان الزامی است.'),
    // ۳. بانکی
    bank_name: req(), account_no: req(),
    card_no: req().refine(isCard, 'شماره کارت باید ۱۶ رقم باشد.'),
    iban: req().refine(isIban, 'شماره شبا معتبر نیست (IR + ۲۴ رقم).'),
    // ۴. شغلی
    department_id: opt, primary_branch_id: opt, direct_manager_id: opt, job_title: opt, job_description: opt,
    has_commission_contract: z.boolean(), commission_percent: opt,
    // ۵. مدارک (slot ⇐ مسیر فایل آپلودشده)
    documents: z.record(z.string(), z.object({ file: z.string(), name: z.string() })),
    // ۶. امنیت و نقش
    phone_number: opt, username: opt, password: opt, user_type: opt, role_id: opt, status: opt, account_description: opt,
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.has_commission_contract) {
      const n = Number(clean(v.commission_percent));
      if (!(n > 0 && n <= 100)) add('commission_percent', 'درصد پورسانت باید بین ۰٫۰۱ و ۱۰۰ باشد.');
    }
    if (v.mode === 'create') {
      const mobiles = [v.mobile_1, v.mobile_2].filter(Boolean).map((m) => clean(m));
      if (!isMobile(v.phone_number)) add('phone_number', 'موبایل ورود را انتخاب کنید.');
      else if (!mobiles.includes(clean(v.phone_number))) add('phone_number', 'موبایل ورود باید یکی از موبایل‌های شخصی تب «آدرس و تماس» باشد.');
      if (v.password.length < 8) add('password', 'رمز عبور دست‌کم ۸ نویسه است.');
      if (!v.user_type) add('user_type', 'نوع کاربر را انتخاب کنید.');
      if (!v.role_id) add('role_id', 'نقش را انتخاب کنید.');
      if (!v.status) add('status', 'وضعیت را انتخاب کنید.');
    }
  });

export type UserFormValues = z.infer<typeof userFormSchema>;

export const STEP_FIELDS: (keyof UserFormValues)[][] = [
  ['first_name', 'last_name', 'national_id', 'birth_certificate_no', 'issue_place', 'father_name', 'birth_date', 'gender', 'marital_status', 'children_count', 'educational_qualification', 'social_security_no'],
  ['province', 'city', 'full_address', 'postal_code', 'phone', 'email', 'mobile_1', 'mobile_2', 'next_of_kin'],
  ['bank_name', 'account_no', 'card_no', 'iban'],
  ['department_id', 'primary_branch_id', 'direct_manager_id', 'job_title', 'job_description', 'has_commission_contract', 'commission_percent'],
  ['documents'],
  ['phone_number', 'username', 'password', 'user_type', 'role_id', 'status', 'account_description'],
];

export const emptyKin = () => ({ full_name: '', relation: '', phone: '', address: '' });

export const emptyUserForm = (mode: 'create' | 'edit'): UserFormValues => ({
  mode, first_name: '', last_name: '', national_id: '', birth_certificate_no: '', issue_place: '', father_name: '', birth_date: '',
  gender: '', marital_status: '', children_count: '۰', educational_qualification: '', social_security_no: '',
  province: '', city: '', full_address: '', postal_code: '', phone: '', email: '', mobile_1: '', mobile_2: '', next_of_kin: [emptyKin(), emptyKin()],
  bank_name: '', account_no: '', card_no: '', iban: '',
  department_id: '', primary_branch_id: '', direct_manager_id: '', job_title: '', job_description: '', has_commission_contract: false, commission_percent: '',
  documents: {},
  phone_number: '', username: '', password: '', user_type: 'STAFF', role_id: '', status: 'ACTIVE', account_description: '',
});
