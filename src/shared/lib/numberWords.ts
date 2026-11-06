import { toLatinDigits } from './text';

/**
 * عدد صحیح نامنفی به حروف فارسی («مبلغ قابل پرداخت به حروف» در برگه‌های چاپی).
 * ورودی رشته‌ی رقمی (لاتین یا فارسی) یا عدد است و روی رشته کار می‌کند تا مبلغ‌های ریالی بزرگ دقت از دست ندهند.
 * مثال: «20680000» ⇐ «بیست میلیون و ششصد و هشتاد هزار». مقدار نامعتبر یا خالی ⇐ رشته‌ی خالی.
 */
const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون', 'کوادریلیون', 'کوینتیلیون'];
const GROUP = 3;
const TEN = 10;
const HUNDRED = 100;
const AND = ' و ';

/** یک گروه سه‌رقمی (۰ تا ۹۹۹) به حروف */
function triple(n: number): string {
  const h = Math.floor(n / HUNDRED);
  const t = Math.floor((n % HUNDRED) / TEN);
  const o = n % TEN;
  const tail = t === 1 ? [TEENS[o]] : [TENS[t], ONES[o]];
  return [HUNDREDS[h], ...tail].filter(Boolean).join(AND);
}

/** رشته‌ی رقمی را از راست به گروه‌های سه‌رقمی می‌شکند: «1234567» ⇐ [1, 234, 567] */
const groupsOf = (digits: string): number[] => {
  const pad = (GROUP - (digits.length % GROUP)) % GROUP;
  const padded = '0'.repeat(pad) + digits;
  return Array.from({ length: padded.length / GROUP }, (_, i) => Number(padded.slice(i * GROUP, (i + 1) * GROUP)));
};

export function numberToWordsFa(value: string | number | null | undefined): string {
  // Thousands separators and spaces to strip: matches "," in "20,680,000"; leaves "12a" untouched. https://regex101.com/?regex=%5B%D9%AC%2C%5Cs%5D&testString=20%2C680%2C000
  const digits = toLatinDigits(String(value ?? '')).replace(/[٬,\s]/g, '');
  // Latin digits only: matches "20680000", rejects "12.5" and "-3". https://regex101.com/?regex=%5E%5B0-9%5D%2B%24&testString=20680000
  if (!/^[0-9]+$/.test(digits)) return '';
  const groups = groupsOf(digits);
  const firstNonZero = groups.findIndex((g) => g > 0);
  if (firstNonZero < 0) return 'صفر';
  const used = groups.slice(firstNonZero);
  if (used.length > SCALES.length) return '';
  return used
    .map((g, i) => {
      if (!g) return '';
      const scale = SCALES[used.length - 1 - i] ?? '';
      return scale ? `${triple(g)} ${scale}` : triple(g);
    })
    .filter(Boolean)
    .join(AND);
}
