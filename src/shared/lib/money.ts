import { toFaDigits, toLatinDigits } from './text';

/**
 * قانون سراسری قیمت (افشین 2026-10-25): هر جا قیمت/مبلغ تایپ یا نمایش داده می‌شود، جداکننده‌ی هزارگان «٬» با ارقام فارسی.
 * فقط برای قیمت و مبلغ (ریال)؛ درصد، تعداد، کد و شماره‌ها جداکننده نمی‌گیرند.
 * نمایش عدد آماده: `faNum` (Intl fa-IR، همین جداکننده را دارد). ورودی هنگام تایپ: `groupMoney` برای value و `moneyDigits` برای مقدار ارسالی.
 */

/** فقط رقم‌های لاتین (برای state و ارسال به بک‌اند)؛ جداکننده، فاصله و حروف حذف می‌شوند. */
export const moneyDigits = (text: string | number | null | undefined): string => {
  if (text === null || text === undefined) return '';
  let s = toLatinDigits(String(text)).trim();
  // مقدار اعشاری بک‌اند («1500000.00») ⇐ فقط بخش صحیح (ریال اعشار ندارد)
  if (/^\d+\.\d+$/.test(s)) s = s.split('.')[0]!;
  return s.replace(/[^0-9]/g, '');
};

/**
 * نمایش مبلغ هنگام تایپ: «۱۲٬۵۰۰٬۰۰۰». ورودی رشته‌ی رقم (لاتین یا فارسی، با یا بی جداکننده) یا عدد.
 * بدون Number() تا مبلغ‌های خیلی بزرگ دقت از دست ندهند؛ صفرهای اول حذف می‌شوند. خالی ⇐ خالی.
 */
export const groupMoney = (raw: string | number | null | undefined): string => {
  const d = moneyDigits(raw).replace(/^0+(?=\d)/, '');
  return d ? toFaDigits(d.replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) : '';
};
