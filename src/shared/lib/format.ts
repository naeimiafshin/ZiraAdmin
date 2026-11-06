import { toGregorian, toJalaali, isValidJalaaliDate } from 'jalaali-js';
import { toFaDigits, toLatinDigits } from './text';

const dateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' });
const timeFmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' });
const numFmt = new Intl.NumberFormat('fa-IR');

/** تاریخ شمسی «۱۴۰۴/۰۹/۲۸» از ISO؛ null ⇐ «—». */
export function faDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}
/** «۱۴۰۴/۰۹/۲۸ – ۰۹:۱۲» */
export function faDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${dateFmt.format(d)} – ${timeFmt.format(d)}`;
}
export function faTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : timeFmt.format(d);
}
export const faNum = (n: number | string | null | undefined): string => (n === null || n === undefined || n === '' ? '—' : numFmt.format(Number(n)));

/** تاریخ میلادی «YYYY-MM-DD» (فیلد date بک‌اند) ⇐ شمسی «۱۳۷۰/۰۱/۰۱». */
export function gregorianToJalaliText(ymd?: string | null): string {
  if (!ymd) return '—';
  const [gy, gm, gd] = ymd.split('-').map(Number);
  if (!gy || !gm || !gd) return '—';
  const j = toJalaali(gy, gm, gd);
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`.replace(/[0-9]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[Number(c)]!);
}
/** ورودی کاربر «۱۳۷۰/۰۱/۰۱» یا «1370/1/1» ⇐ «1991-03-21»؛ نامعتبر ⇐ null. */
export function jalaliTextToGregorian(text: string): string | null {
  const m = toLatinDigits(text.trim()).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidJalaaliDate(jy, jm, jd)) return null;
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

const AVATAR_COLORS = ['#D88A9B', '#8FB6D6', '#C7A27A', '#8FBF9A', '#B497D6', '#E0A57A', '#7FBFB8', '#D891A0', '#C79A9E', '#8E9BCB'];
/** رنگ ثابت آواتار از شناسه (پالت html Fixed). */
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
export function initialOf(...parts: (string | null | undefined)[]): string {
  const s = parts.find((p) => p && p.trim());
  return s ? s.trim().charAt(0).toUpperCase() : '؟';
}
export const fullName = (u: { first_name?: string | null; last_name?: string | null; username?: string | null; phone_number?: string }) =>
  [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.phone_number || '—';

/** شماره کارت: ارقام فارسی در گروه‌های ۴تایی (۶۱۰۴ ۳۳۷۷ …). */
export const formatCard = (v: string): string =>
  toFaDigits(toLatinDigits(v).replace(/[^0-9]/g, '').slice(0, 16)).replace(/(.{4})(?=.)/g, '$1 ');
/** شبا: «IR» جدا، سپس ۲۴ رقم در گروه‌های ۴تایی (IR ۱۲۳۴ ۵۶۷۸ …). */
export const formatIban = (v: string): string => {
  const digits = toFaDigits(toLatinDigits(v).replace(/^\s*IR/i, '').replace(/[^0-9]/g, '').slice(0, 24)).replace(/(.{4})(?=.)/g, '$1 ');
  return digits || /^\s*IR/i.test(v) ? `IR ${digits}`.trimEnd() : '';
};
