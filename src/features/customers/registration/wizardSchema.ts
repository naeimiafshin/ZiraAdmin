import { z } from 'zod';
import { isMobileNo, isPhoneNo, MOBILE_MSG, PHONE_MSG } from '../phone';
import { clean, isNationalId, isPostal } from '@/shared/lib/validate';

const req = (m = 'این فیلد الزامی است.') => z.string().trim().min(1, m);
const opt = z.string().trim();

/** یک ضمانت در مرحله‌ی ۳ (فقط یادداشت برای بررسی؛ در submitted_data ذخیره می‌شود) */
export const guaranteeNote = z.object({
  type: z.enum(['cheque', 'promissory_note']),
  credit: z.enum(['CHEQUE', 'GOLDEN']),
  amount: opt,
  cheque_no: opt, bank: opt, branch: opt, owner: opt,
  serial: opt, guarantor: opt, guarantor_nid: opt,
  due: opt,
});
export type GuaranteeNote = z.infer<typeof guaranteeNote>;

/**
 * ویزارد ۴ مرحله‌ای «ثبت مشتری جدید» (html Fixed). قیدهای مرحله‌ی ۱ و ۲ = RegistrationSubmitIn بک‌اند.
 * مرحله‌ی ۳ و ۴ فقط «یادداشت برای بررسی» است (تصمیم افشین 2026-10-21): بک‌اند آن‌ها را در submitted_data نگه می‌دارد و روی پرونده اعمال نمی‌کند.
 */
export const wizardSchema = z.object({
  // ۱. اطلاعات هویتی
  first_name: req('نام الزامی است.'), last_name: req('نام خانوادگی الزامی است.'), gender: opt,
  national_id: req('کد ملی الزامی است.').refine(isNationalId, 'کد ملی معتبر نیست.'),
  business_license_no: opt,
  // ۲. تماس و آدرس
  // شماره‌ها قبل از رفتن به مرحله‌ی بعد اعتبارسنجی می‌شوند (افشین 2026-10-25؛ ../phone.ts)
  mobile_1: req('موبایل ۱ الزامی است.').refine(isMobileNo, MOBILE_MSG),
  mobile_2: opt.refine((v) => !v || isMobileNo(v), MOBILE_MSG),
  phone: opt.refine((v) => !v || isPhoneNo(v), PHONE_MSG), referrer_name: opt, referrer_phone: opt.refine((v) => !v || isPhoneNo(v), PHONE_MSG),
  address: opt, province: opt, city: opt, postal_code: opt.refine((v) => !v || isPostal(v), 'کد پستی باید ۱۰ رقم باشد.'),
  store_name: opt, manager_name: opt, economic_code: opt, guild: opt, description: opt,
  // ۳. بازاریاب و اعتبار (یادداشت)
  marketer_id: opt, marketer_name: opt, marketer_percent: opt.refine((v) => !v || (Number(clean(v)) >= 0 && Number(clean(v)) <= 100), 'درصد بین ۰ و ۱۰۰ باشد.'),
  cheque_credit: opt, cheque_max_due_months: opt.refine((v) => !v || (Number(clean(v)) >= 1 && Number(clean(v)) <= 24), 'بین ۱ و ۲۴ ماه.'),
  golden_credit: opt, stepwise_increase: z.boolean(),
  guarantees: z.array(guaranteeNote),
  // ۴. حساب کاربری و سطح‌بندی (یادداشت)
  username: opt, customer_type: z.enum(['WHOLESALE', 'RETAIL', '']) /* '' = تعیین‌نشده ⇐ از گروه/پیش‌فرض (BR-CUS-052) */, cooperation_level: z.enum(['BRONZE', 'SILVER', 'GOLD']), image_access_level: z.enum(['NORMAL', 'PROFESSIONAL', 'SPECIAL']),
});
export type WizardValues = z.infer<typeof wizardSchema>;

export const STEP_FIELDS: (keyof WizardValues)[][] = [
  ['first_name', 'last_name', 'gender', 'national_id', 'business_license_no'],
  ['mobile_1', 'mobile_2', 'phone', 'referrer_name', 'referrer_phone', 'address', 'province', 'city', 'postal_code', 'store_name', 'manager_name', 'economic_code', 'guild', 'description'],
  ['marketer_id', 'marketer_name', 'marketer_percent', 'cheque_credit', 'cheque_max_due_months', 'golden_credit', 'stepwise_increase', 'guarantees'],
  ['username', 'customer_type', 'cooperation_level', 'image_access_level'],
];
export const STEPS = ['اطلاعات هویتی', 'تماس و آدرس', 'اعتبار و ضمانت', 'حساب کاربری'];

export const emptyWizard = (): WizardValues => ({
  first_name: '', last_name: '', gender: '', national_id: '', business_license_no: '',
  mobile_1: '', mobile_2: '', phone: '', referrer_name: '', referrer_phone: '', address: '', province: '', city: '', postal_code: '',
  store_name: '', manager_name: '', economic_code: '', guild: '', description: '',
  marketer_id: '', marketer_name: '', marketer_percent: '', cheque_credit: '', cheque_max_due_months: '', golden_credit: '', stepwise_increase: true, guarantees: [],
  username: '', customer_type: '', cooperation_level: 'BRONZE', image_access_level: 'NORMAL',
});
export const emptyGuarantee = (): GuaranteeNote => ({ type: 'cheque', credit: 'CHEQUE', amount: '', cheque_no: '', bank: '', branch: '', owner: '', serial: '', guarantor: '', guarantor_nid: '', due: '' });
