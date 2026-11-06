import { toLatinDigits } from '@/shared/lib/text';

/** مختصات تایپ‌شده (ارقام فارسی، «٫» یا «,» اعشار) ⇐ متن لاتین؛ خالی ⇐ null */
export const normCoord = (v: string): string | null => {
  const t = toLatinDigits(v).replace(/[٫,]/g, '.').trim();
  return t ? t : null;
};
/** عدد مختصات یا null (خالی/نامعتبر) */
export const parseCoord = (v: string): number | null => {
  const t = normCoord(v);
  if (t === null || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};
