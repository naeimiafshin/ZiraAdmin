/**
 * دانلود فایل در مرورگر، با تاریخ و ساعت در نام فایل.
 *
 * قانون افشین (۱۲ آبان ۱۴۰۵): هر خروجی اکسل یا هر فایل دیگری که پنل می‌سازد، تاریخ و ساعت ساخت را در ادامه‌ی نام
 * فایل دارد تا خروجی‌های پیاپی روی هم نیفتند و تاریخچه حفظ شود. تاریخ شمسی و ساعت تهران است، با رقم لاتین
 * (نام فایل در ویندوز و ایمیل خواناتر می‌ماند) و بدون «:» که در نام فایل ویندوز مجاز نیست.
 * نمونه: supply-requests_1405-08-12_23-40-05.xlsx
 *
 * فایلی که کاربر بارگذاری کرده (پیوست تیکت، مدرک) با همان نام اصلی‌اش دانلود می‌شود و این قانون شاملش نیست.
 */

const STAMP_PARTS = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
/** مهلت آزاد کردن نشانی blob؛ مرورگر تا آن موقع دانلود را شروع کرده است */
const REVOKE_DELAY_MS = 60_000;

/** «1405-08-12_23-40-05» برای لحظه‌ی داده‌شده */
export const fileStamp = (at: Date = new Date()): string => {
  const p: Record<string, string> = {};
  for (const part of STAMP_PARTS.formatToParts(at)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
};

/** «name.xlsx» ⇐ «name_1405-08-12_23-40-05.xlsx»؛ نام بدون پسوند هم پشتیبانی می‌شود */
export const stampedFileName = (name: string, at: Date = new Date()): string => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}_${fileStamp(at)}`;
  return `${name.slice(0, dot)}_${fileStamp(at)}${name.slice(dot)}`;
};

/** ذخیره‌ی blob با نام مهرخورده (تاریخ و ساعت به نام اضافه می‌شود) */
export const saveBlob = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = stampedFileName(name);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
};
