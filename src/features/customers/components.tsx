import { useEffect, useState, type ReactNode } from 'react';
import { IconClockPause } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { ApiError, userMessage } from '@/shared/api/errors';
import { faDate, faNum, jalaliTextToGregorian } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Input, Textarea } from '@/shared/ui/form';
import { Alert } from '@/shared/ui/Alert';
import { Badge, Empty, Modal, Pagination } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import type { StaffUser } from '@/features/users/api';
import { useDebounced } from '@/shared/lib/useDebounced';
import { useCustomers, useMarketers, type CustomerAttribute, type CustomerRow, type MarketerCard } from './api';
import { COOPERATION, CUSTOMER_STATUS } from './labels';
import s from './customers.module.css';
import { groupMoney } from '@/shared/lib/money';

/** مبلغ ریالی: «۱۲۳٬۴۵۶ ریال»؛ رشته‌ی اعشاری بک‌اند («50000000» یا «50000000.000») را هم می‌پذیرد. */
export const rial = (v: string | number | null | undefined): string => (v === null || v === undefined || v === '' ? '—' : `${faNum(Math.trunc(Number(v)))} ریال`);
/** متن عددی تایپ‌شده ⇐ رقم‌های لاتین بدون جداکننده */
export const digitsOnly = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');
/** قالب نمایش مبلغ هنگام تایپ: سه‌رقم سه‌رقم با ارقام فارسی */
/** مبلغ هنگام تایپ با جداکننده‌ی هزارگان «٬» (قانون سراسری قیمت، 2026-10-25) */
export const formatAmount = (v: string) => groupMoney(v);
export const staffName = (u: Pick<StaffUser, 'first_name' | 'last_name' | 'username' | 'phone_number'>) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.phone_number;

/** مودال «دلیل» برای کارهایی که بک‌اند دلیل الزامی می‌خواهد (وضعیت، لیست سیاه، سطح، قفل، …) */
export function ReasonModal({ open, onClose, title, intro, label = 'دلیل', confirmText = 'ثبت', danger, busy, onConfirm, children, minLength = 1, extraValid = true, noReason }: {
  open: boolean; onClose: () => void; title: ReactNode; intro?: ReactNode; label?: string; confirmText?: string; danger?: boolean; busy?: boolean;
  onConfirm: (reason: string) => Promise<unknown> | void; children?: ReactNode; minLength?: number; extraValid?: boolean;
  /** فقط تأیید (بدون فیلد دلیل) */
  noReason?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const close = () => { setReason(''); setErr(null); onClose(); };
  const submit = async () => {
    if (!noReason && reason.trim().length < minLength) { setErr(`${label} الزامی است.`); return; }
    try { await onConfirm(reason.trim()); setReason(''); setErr(null); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open={open} onClose={close} title={title} width={520}
      footer={<><Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy} disabled={!extraValid}>{confirmText}</Button><Button variant="ghost" onClick={close}>انصراف</Button></>}>
      {intro ? <p className={s.intro}>{intro}</p> : null}
      {children}
      {noReason ? null : <Textarea label={label} required={minLength > 0} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />}
      {err ? <div style={{ marginTop: 12 }}><Alert>{err}</Alert></div> : null}
    </Modal>
  );
}

/**
 * جدول انتخابی «بازاریاب» (RULES ۴-۷) — GET /customers/marketers (G-06): کارمندان فعال، فقط نام و کد پرسنلی،
 * صفحه‌بندی و جست‌وجو سمت سرور؛ مجوز customers.profiles.marketer.read (دیگر به «فهرست کاربران» نیاز نیست).
 */
export function MarketerPickerModal({ open, onClose, onPick, title = 'انتخاب بازاریاب' }: { open: boolean; onClose: () => void; onPick: (m: MarketerCard) => void; title?: string }) {
  const can = usePerm();
  const allowed = can('customers.profiles.marketer.read');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300);
  const pageSize = 8;
  const list = useMarketers({ page, page_size: pageSize, query: dq || undefined }, open && allowed);
  const cols: Column<MarketerCard>[] = [
    { key: 'code', header: 'کد پرسنلی', code: true, render: (m) => <span className="ltr">{m.personnel_code || '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (m) => <b>{m.full_name}</b> },
    { key: 'pick', header: '', render: (m) => <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onPick(m); }}>انتخاب</Button> },
  ];
  return (
    <Modal open={open} onClose={onClose} title={title} width={640}>
      {!allowed ? <Empty title="فهرست بازاریاب‌ها برای حساب شما در دسترس نیست" text="برای انتخاب بازاریاب به مجوز «مشاهده‌ی بازاریاب مشتری» نیاز است." /> : (
        <>
          <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام یا کد پرسنلی" count={list.data ? `${faNum(list.data.total)} کارمند` : undefined} />
          <DataTable columns={cols} rows={list.data?.results} rowKey={(m) => m.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} onRowClick={onPick}
            empty={<Empty title="کارمندی با این جست‌وجو پیدا نشد" />} />
          {list.data && list.data.total > pageSize ? <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} /> : null}
        </>
      )}
    </Modal>
  );
}

/** جدول انتخابی مشتری (چندانتخابی) برای افزودن عضو به گروه */
/**
 * خطای 409 تضاد ویژگی گروه (code=group_attribute_conflict، BR-CUS-053/054/056): کدهای مشتریان مغایر از متن detail.
 * غیر از این خطا ⇐ null.
 */
export function conflictCodes(e: unknown): string[] | null {
  if (!(e instanceof ApiError) || e.code !== 'group_attribute_conflict') return null;
  const t = e.detailText || userMessage(e);
  return [...new Set((t.match(/\b[A-Z]{2,}-[0-9A-Z-]*[0-9][0-9A-Z-]*/g) ?? []).filter((c) => !c.startsWith('CG-')))];
}

export function CustomerPickerModal({ open, onClose, onConfirm, busy, excludeIds = [], error, blockedCodes = [] }: {
  open: boolean; onClose: () => void; onConfirm: (ids: string[]) => void; busy?: boolean; excludeIds?: string[];
  /** پیام خطای آخرین ثبت (مثلاً 409 تضاد ویژگی گروه) */
  error?: string | null;
  /** کد مشتریانی که با ویژگی‌های گروه تضاد دارند: از انتخاب خارج و غیرقابل انتخاب می‌شوند */
  blockedCodes?: string[];
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Map<string, string>>(new Map());
  // مشتریان مغایر از انتخاب خارج می‌شوند تا کاربر بقیه را دوباره ثبت کند
  useEffect(() => {
    if (!blockedCodes.length) return;
    setSel((x) => { const n = new Map([...x].filter(([, code]) => !blockedCodes.includes(code))); return n.size === x.size ? x : n; });
  }, [blockedCodes]);
  const list = useCustomers({ page, page_size: 10, query: q.trim() || undefined, status: status || undefined });
  const toggle = (c: CustomerRow) => setSel((x) => { const n = new Map(x); if (n.has(c.id)) n.delete(c.id); else n.set(c.id, c.code); return n; });
  const blocked = (c: CustomerRow) => excludeIds.includes(c.id) || blockedCodes.includes(c.code);
  const close = () => { setSel(new Map()); onClose(); };
  const cols: Column<CustomerRow>[] = [
    { key: 'pick', header: 'انتخاب', render: (c) => <input type="checkbox" className={s.cb} aria-label={`انتخاب ${c.full_name}`} checked={sel.has(c.id)} disabled={blocked(c)} onChange={() => toggle(c)} onClick={(e) => e.stopPropagation()} /> },
    { key: 'code', header: 'کد', code: true, render: (c) => <span className={s.flags}><span className="ltr">{c.code}</span>{blockedCodes.includes(c.code) ? <Badge tone="danger">مغایر با گروه</Badge> : null}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (c) => <b>{c.full_name}</b> },
    { key: 'store', header: 'نام فروشگاه', render: (c) => c.store_name || '—' },
    { key: 'mobile', header: 'موبایل', render: (c) => <span className="tnum">{c.mobile ?? '—'}</span> },
    { key: 'lvl', header: 'سطح همکاری', render: (c) => <TierBadge level={c.cooperation_level} /> },
    { key: 'st', header: 'وضعیت', render: (c) => <Badge tone={CUSTOMER_STATUS[c.status]?.tone ?? 'neutral'}>{CUSTOMER_STATUS[c.status]?.label ?? c.status}</Badge> },
  ];
  return (
    <Modal open={open} onClose={close} title="افزودن مشتری به گروه" width={900}
      footer={<><Button onClick={() => onConfirm([...sel.keys()])} disabled={!sel.size} loading={busy}>افزودن {sel.size ? faNum(sel.size) : ''} مشتری</Button><Button variant="ghost" onClick={close}>انصراف</Button></>}>
      {error ? <div style={{ marginBottom: 12 }}><Alert>{error}{blockedCodes.length ? ' مشتریان مغایر از انتخاب خارج شدند؛ با بقیه دوباره «افزودن» را بزنید.' : ''}</Alert></div> : null}
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: کد، نام، نام فروشگاه یا موبایل"
        filters={[{ key: 'st', label: 'وضعیت', value: status, onChange: (v) => { setStatus(v); setPage(1); }, options: Object.entries(CUSTOMER_STATUS).filter(([k]) => k !== 'BLOCKED').map(([value, v]) => ({ value, label: v.label })) }]}
        count={list.data ? `${faNum(list.data.total)} مشتری` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(c) => c.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        onRowClick={(c) => { if (!blocked(c)) toggle(c); }} isSelected={(c) => sel.has(c.id)} empty={<Empty title="مشتری‌ای پیدا نشد" />} />
      {list.data && list.data.total > 10 ? <Pagination page={page} pageSize={10} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}

/** نشان سطح همکاری با رنگ هم‌نام خود سطح (برنزی، نقره‌ای، طلایی) — افشین 2026-10-21 */
const TIER_CLASS: Record<string, string> = { BRONZE: s.tierBronze!, SILVER: s.tierSilver!, GOLD: s.tierGold! };
/** سطح همکاری؛ `n` = شماره‌ی سطح (۱ تا ۳، همان «سطح احراز» سابق که جدا نمایش داده نمی‌شود؛ BR-CUS-030) */
export function TierBadge({ level, n }: { level: string; n?: number | null }) {
  return <span className={`${s.tier} ${TIER_CLASS[level] ?? ''}`}>{COOPERATION[level]?.label ?? level}{n ? <span className={s.tierN}> · سطح {faNum(n)}</span> : null}</span>;
}
/** نام سطح به‌صورت متن رنگی (بدون قاب)، برای جمله‌ها و خلاصه‌ها */
export function TierText({ level }: { level: string }) {
  return <span className={`${s.tierText} ${TIER_CLASS[level] ?? ''}`}>{COOPERATION[level]?.label ?? level}</span>;
}

/** بخش‌هایی که بک‌اند هنوز API ندارد (تصمیم افشین: نمایش با برچسب «به‌زودی»، غیرفعال) */
export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className={s.soon}>
      <span className={s.soonIcon}><IconClockPause size={22} stroke={1.6} /></span>
      <div>
        <div className={s.soonTitle}>{title} <Badge tone="neutral">به‌زودی</Badge></div>
        <div className={s.soonText}>{text}</div>
      </div>
    </div>
  );
}

/** فیلد مبلغ ریالی با جداکننده‌ی هزارگان و میان‌برها */
export function AmountInput({ label, value, onChange, error, shortcuts, required, hint }: { label: string; value: string; onChange: (digits: string) => void; error?: string; shortcuts?: number[]; required?: boolean; hint?: ReactNode }) {
  return (
    <div className={s.amountWrap}>
      <Input label={label} required={required} value={formatAmount(value)} onChange={(e) => onChange(digitsOnly(e.target.value))} inputMode="numeric" dir="ltr" placeholder="۰" error={error} hint={hint ?? (value ? `${rial(value)}` : 'مبلغ به ریال')} />
      {shortcuts?.length ? (
        <div className={s.shortcuts}>
          {shortcuts.map((n) => <button type="button" key={n} className={`${s.shortcut} ${value === String(n) ? s.shortcutOn : ''}`} onClick={() => onChange(String(n))}>{faNum(n / 1_000_000)} میلیون ریال</button>)}
        </div>
      ) : null}
    </div>
  );
}

export const dateCell = (iso?: string | null) => <span className={s.muted}>{faDate(iso)}</span>;

/**
 * منبع مقدار مؤثر یک ویژگی پرونده (BR-CUS-050): «از گروه «…»»، «پیش‌فرض سیستم» یا «تعیین‌شده در پرونده».
 * قانون: مقدار پرونده ⇐ گروه فعال ⇐ پیش‌فرض.
 */
export function SourceTag({ a }: { a?: CustomerAttribute | null }) {
  if (!a) return null;
  if (a.source === 'GROUP') return <span className={`${s.srcTag} ${s.srcTagGroup}`} data-tip="این مقدار از گروه مشتری می‌آید؛ تغییرش از صفحه‌ی گروه یا با خروج از گروه">از گروه «{a.group_name}»</span>;
  if (a.source === 'DEFAULT') return <span className={s.srcTag} data-tip="در پرونده و گروه‌ها تعیین نشده؛ پیش‌فرض سیستم">پیش‌فرض سیستم</span>;
  return <span className={s.srcTag} data-tip="مستقیم روی همین پرونده تعیین شده است">تعیین‌شده در پرونده</span>;
}

/**
 * فیلتر تاریخ شمسی که در URL نگه داشته می‌شود (2026-10-25): متن تایپ‌شده محلی است و فقط وقتی کامل و معتبر شد (یا خالی شد)
 * به URL می‌رود؛ وگرنه رفت‌وبرگشت URL با هر کلید، حرف‌ها را گم می‌کرد. پاک شدن از بیرون (حذف فیلترها) ورودی را خالی می‌کند.
 */
export function UrlDateFilter({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [text, setText] = useState(value);
  useEffect(() => { if (value !== text && (value === '' || jalaliTextToGregorian(value))) setText(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (v: string) => {
    setText(v);
    if (!v.trim()) { if (value) onCommit(''); return; }
    if (jalaliTextToGregorian(v) && v !== value) onCommit(v);
  };
  return <div className={s.dateFilter}><JalaliDateInput label="" aria-label={label} value={text} onChange={(e) => change(e.target.value)} placeholder={label} dir="ltr" maxYear={1500} /></div>;
}
