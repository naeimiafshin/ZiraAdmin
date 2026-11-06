import { useEffect, useState } from 'react';
import { IconCalendarOff, IconCalendarStats, IconClock, IconDeviceFloppy, IconPlus, IconX, IconCalendarWeek } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Card, Empty, ErrorBox, InfoBanner, KeyValue, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { supportError, useCalendar, useSaveCalendar } from './api';
import { Stat } from './components';
import s from './support.module.css';

/** ترتیب هفته‌ی ایرانی با شماره‌ی روز پایتون (دوشنبه ۰ … یکشنبه ۶؛ راهنمای بک‌اند) */
const WEEK: { py: number; name: string }[] = [
  { py: 5, name: 'شنبه' }, { py: 6, name: 'یکشنبه' }, { py: 0, name: 'دوشنبه' }, { py: 1, name: 'سه‌شنبه' },
  { py: 2, name: 'چهارشنبه' }, { py: 3, name: 'پنجشنبه' }, { py: 4, name: 'جمعه' },
];
const JS_DAY = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const weekdayOf = (ymd: string) => JS_DAY[new Date(`${ymd}T12:00:00Z`).getUTCDay()] ?? '';
const pad2 = (n: number) => faNum(n).padStart(2, '۰');

/**
 * تقویم پشتیبانی (GET/PUT /support/calendar): مبنای محاسبه‌ی مهلت پاسخ (SLA) به ساعت اداری.
 * ساعات و روزهای کاری در بک‌اند ثابت‌اند و فقط نمایش داده می‌شوند؛ قابل ویرایش: تعطیلات (فهرست جایگزین) و بازه‌ی پوشش.
 */
export default function CalendarPage() {
  const can = usePerm();
  const toast = useToast();
  const back = useBack('/');
  const cal = useCalendar();
  const save = useSaveCalendar();
  const editable = can('support.calendar.update');
  const [from, setFrom] = useState('');
  const [through, setThrough] = useState('');
  const [closed, setClosed] = useState<string[]>([]);
  const [newDay, setNewDay] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const reset = () => {
    if (!cal.data) return;
    setFrom(cal.data.covered_from ? gregorianToJalaliText(cal.data.covered_from) : '');
    setThrough(cal.data.covered_through ? gregorianToJalaliText(cal.data.covered_through) : '');
    setClosed([...(cal.data.closed_dates ?? [])].sort());
  };
  useEffect(reset, [cal.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cal.isLoading) return <><PageHead back={back} title="تقویم پشتیبانی" /><Card><SkeletonRows rows={5} /></Card></>;
  if (cal.error || !cal.data) return <><PageHead back={back} title="تقویم پشتیبانی" /><Card><ErrorBox error={cal.error} onRetry={() => cal.refetch()} /></Card></>;
  const c = cal.data;
  const gFrom = from.trim() ? jalaliTextToGregorian(from) : null;
  const gThrough = through.trim() ? jalaliTextToGregorian(through) : null;
  const dirty = (gFrom ?? null) !== (c.covered_from ?? null) || (gThrough ?? null) !== (c.covered_through ?? null)
    || JSON.stringify(closed) !== JSON.stringify([...(c.closed_dates ?? [])].sort());
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
  const expired = !c.covered_through || c.covered_through < today;
  const futureClosed = (c.closed_dates ?? []).filter((d) => d >= today).length;

  const addDay = () => {
    const g = jalaliTextToGregorian(newDay);
    if (!g) { setErr('تاریخ تعطیلی معتبر نیست.'); return; }
    if (closed.includes(g)) { setErr('این روز از قبل در فهرست تعطیلات است.'); return; }
    setErr(null); setClosed([...closed, g].sort()); setNewDay('');
  };
  const submit = async () => {
    if (from.trim() && !gFrom) { setErr('تاریخ شروع پوشش معتبر نیست.'); return; }
    if (through.trim() && !gThrough) { setErr('تاریخ پایان پوشش معتبر نیست.'); return; }
    if (!gFrom || !gThrough) { setErr('هر دو تاریخ بازه‌ی پوشش لازم است؛ بدون آن مهلت پاسخ محاسبه نمی‌شود.'); return; }
    if (gFrom > gThrough) { setErr('تاریخ شروع پوشش باید پیش از تاریخ پایان باشد.'); return; }
    setErr(null);
    try { await save.mutateAsync({ closed_dates: closed, covered_from: gFrom, covered_through: gThrough }); toast('تقویم پشتیبانی ذخیره شد.'); } catch (e) { setErr(supportError(e)); }
  };

  return (
    <>
      <PageHead back={back} title="تقویم پشتیبانی" sub="ساعات اداری، تعطیلات و بازه‌ی پوشش؛ مبنای محاسبه‌ی مهلت پاسخ تیکت‌ها" />
      <div className={s.stats}>
        <Stat icon={<IconClock size={20} />} tone="brand" label="ساعات کاری" text={`${pad2(c.work_start_hour)}:۰۰ تا ${pad2(c.work_end_hour)}:۰۰`} sub={c.timezone === 'Asia/Tehran' ? 'به وقت تهران' : c.timezone} />
        <Stat icon={<IconCalendarWeek size={20} />} tone="success" label="روزهای کاری در هفته" value={c.weekdays.length} sub={`غیرکاری: ${WEEK.filter((w) => !c.weekdays.includes(w.py)).map((w) => w.name).join('، ') || '—'}`} />
        <Stat icon={<IconCalendarOff size={20} />} tone="warning" label="تعطیلات آینده" value={futureClosed} sub={`از ${faNum(c.closed_dates.length)} روز ثبت‌شده`} />
        <Stat icon={<IconCalendarStats size={20} />} tone={expired ? 'danger' : 'info'} label="پوشش تقویم تا"
          text={c.covered_through ? gregorianToJalaliText(c.covered_through) : 'تعیین نشده'} sub={expired ? 'بازه‌ی پوشش تمام شده است' : c.covered_from ? `از ${gregorianToJalaliText(c.covered_from)}` : '—'} />
      </div>
      {expired ? <div className={s.bar}><InfoBanner tone="warning">بازه‌ی پوشش تقویم تعیین نشده یا تمام شده است؛ تا تعیین آن، ثبت و پاسخ تیکت‌ها با خطای «تقویم ناقص» روبه‌رو می‌شود.</InfoBanner></div> : null}

      <div className={s.calGrid}>
        <Card>
          <div className={s.cardTitle}>ساعات و روزهای کاری</div>
          <div className={s.kv}>
            <KeyValue label="شروع کار">{pad2(c.work_start_hour)}:۰۰</KeyValue>
            <KeyValue label="پایان کار">{pad2(c.work_end_hour)}:۰۰</KeyValue>
            <KeyValue label="منطقه‌ی زمانی" ltr>{c.timezone}</KeyValue>
            <KeyValue label="نسخه‌ی تقویم">{faNum(c.revision)}</KeyValue>
          </div>
          <div style={{ marginTop: 16 }} className={s.weekdays}>
            {WEEK.map((w) => <span key={w.py} className={`${s.wd} ${c.weekdays.includes(w.py) ? s.wdOn : ''}`}>{w.name}</span>)}
          </div>
          <p className={s.muted} style={{ marginTop: 14 }}>ساعات و روزهای کاری در سامانه ثابت‌اند و از این صفحه قابل تغییر نیستند.</p>
        </Card>
        <Card>
          <div className={s.cardTitle}>بازه‌ی پوشش</div>
          <div className={s.kv}>
            <JalaliDateInput label="از تاریخ" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!editable} dir="ltr" maxYear={1500} />
            <JalaliDateInput label="تا تاریخ" value={through} onChange={(e) => setThrough(e.target.value)} disabled={!editable} dir="ltr" maxYear={1500} />
          </div>
          <p className={s.muted} style={{ marginTop: 14 }}>مهلت پاسخ فقط در روزهای داخل این بازه محاسبه می‌شود؛ پیش از پایان آن، بازه را تمدید کنید.</p>
        </Card>
      </div>

      <Card className={s.bar}>
        <div className={s.cardTitle}>تعطیلات رسمی <span className={s.muted}>{faNum(closed.length)} روز</span></div>
        {editable ? (
          <div className={s.inlineForm}>
            <JalaliDateInput label="افزودن روز تعطیل" value={newDay} onChange={(e) => setNewDay(e.target.value)} dir="ltr" maxYear={1500}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDay(); } }} />
            <Button variant="secondary" icon={<IconPlus size={17} />} onClick={addDay} disabled={!newDay.trim()}>افزودن</Button>
          </div>
        ) : null}
        {closed.length ? (
          <div className={s.closed}>
            {closed.map((d) => (
              <span key={d} className={s.closedChip}>{gregorianToJalaliText(d)} <small>{weekdayOf(d)}</small>
                {editable ? <button type="button" aria-label={`حذف ${gregorianToJalaliText(d)}`} data-tip="حذف از تعطیلات" onClick={() => setClosed(closed.filter((x) => x !== d))}><IconX size={13} /></button> : null}
              </span>
            ))}
          </div>
        ) : <Empty title="روز تعطیلی ثبت نشده است" text="پنجشنبه و جمعه همیشه غیرکاری‌اند؛ تعطیلات رسمی را این‌جا اضافه کنید." />}
      </Card>

      {editable ? (
        <div className={s.saveBar}>
          {err ? <Alert>{err}</Alert> : null}
          {dirty ? <span className={s.dirty}>تغییرات ذخیره نشده است</span> : null}
          <Button variant="ghost" onClick={() => { reset(); setErr(null); }} disabled={!dirty}>بازگرداندن</Button>
          <Button icon={<IconDeviceFloppy size={17} />} loading={save.isPending} onClick={submit} disabled={!dirty}>ذخیره‌ی تقویم</Button>
        </div>
      ) : null}
    </>
  );
}
