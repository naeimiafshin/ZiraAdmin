import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconAt, IconMailCog, IconSend, IconServer2, IconShieldLock } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { ApiError, userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Toggle } from '@/shared/ui/form';
import { Badge, ErrorBox, InfoBanner, PageHead, Segmented, SkeletonRows } from '@/shared/ui/kit';
import { Stepper } from '@/shared/ui/Stepper';
import { useToast } from '@/shared/ui/toast';
import { invalidateSettings, useEmailSetting, type EmailSetting } from './api';
import { changedKeys, NO_ERRORS, parseErrors, Row, SaveBar, SettingCard, TextField, TopErrors, useDraft, type FormErrors } from './ui';
import s from './settings.module.css';

type Enc = 'NONE' | 'TLS' | 'SSL';
type Draft = { smtp_host: string; smtp_port: number; smtp_username: string; enc: Enc; default_from_email: string; contact_recipient_email: string; timeout_seconds: number; is_active: boolean };
/** مقدارهای پیش‌فرض مدل بک‌اند (EmailSetting) — فقط برای نمایش فرم تا وقتی API نیامده */
const MODEL_DEFAULTS: EmailSetting = {
  smtp_host: '', smtp_port: 587, smtp_username: '', use_tls: true, use_ssl: false, default_from_email: '', contact_recipient_email: '',
  timeout_seconds: 10, is_active: false, has_password: false,
};
const toDraft = (e: EmailSetting): Draft => ({
  smtp_host: e.smtp_host, smtp_port: e.smtp_port, smtp_username: e.smtp_username, enc: e.use_ssl ? 'SSL' : e.use_tls ? 'TLS' : 'NONE',
  default_from_email: e.default_from_email, contact_recipient_email: e.contact_recipient_email, timeout_seconds: e.timeout_seconds, is_active: e.is_active,
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'use_tls', 'use_ssl', 'default_from_email', 'contact_recipient_email', 'timeout_seconds', 'is_active'];

/**
 * تنظیمات ایمیل (`/settings/email`، پیشنهادی): سرور ارسال (SMTP)، حساب، نشانی فرستنده و گیرنده‌ی پیام‌های «تماس با ما».
 * بک‌اند مدل را دارد ولی API ندارد (کمبود ثبت‌شده) ⇐ تا آمدن آن کل فرم «به‌زودی» و فقط‌نمایش است؛
 * نام فیلدها و مسیرها همان پیشنهاد راهنمای بک‌اند است تا بعد از ساخت API بدون تغییر فرانت کار کند.
 */
export default function EmailSettingsPage() {
  const can = usePerm();
  const toast = useToast();
  const q = useEmailSetting();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const server = q.data ? q.data.data ?? MODEL_DEFAULTS : undefined;
  const [d, setD] = useDraft(server, toDraft);
  const [pwd, setPwd] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  if (q.isLoading || !d || !server) return q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={6} height={80} />;
  const missing = q.data!.missing;
  const editable = !missing && can('settings.email.update');
  const off = !editable;
  const base = toDraft(server);
  const changed = changedKeys(d, base);
  const dirty = changed.length + (pwd !== null ? 1 : 0);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const local: Record<string, string> = {
    default_from_email: d.default_from_email && !EMAIL.test(d.default_from_email) ? 'قالب ایمیل معتبر نیست.' : '',
    contact_recipient_email: d.contact_recipient_email && !EMAIL.test(d.contact_recipient_email) ? 'قالب ایمیل معتبر نیست.' : '',
    is_active: d.is_active && (!d.smtp_host || !d.default_from_email || !d.contact_recipient_email) ? 'برای روشن کردن، نشانی سرور، فرستنده و گیرنده لازم است.' : '',
  };
  const err = (k: string) => errs.fields[k] || local[k] || '';

  const submit = () => {
    const body: Record<string, unknown> = {};
    for (const k of changed) {
      if (k === 'enc') { body.use_tls = d.enc === 'TLS'; body.use_ssl = d.enc === 'SSL'; } else body[k] = d[k];
    }
    if (pwd !== null) body.smtp_password = pwd;
    setErrs(NO_ERRORS);
    setSaving(true);
    adminApi<EmailSetting>('/settings/email', { method: 'PATCH', body })
      .then(async () => { setPwd(null); toast('تنظیمات ایمیل ذخیره شد.'); await invalidateSettings(qc, 'email'); })
      .catch((e) => { const p = parseErrors(e, FIELDS); setErrs(p); toast(p.general[0] ?? 'برخی مقادیر معتبر نیستند.', 'error'); })
      .finally(() => setSaving(false));
  };
  const sendTest = async () => {
    setTesting(true); setTestMsg(null);
    try { await adminApi('/settings/email/test', { method: 'POST', body: { to: testTo.trim() } }); setTestMsg({ ok: true, text: `ایمیل آزمایشی به ${testTo.trim()} فرستاده شد.` }); }
    catch (e) { setTestMsg({ ok: false, text: e instanceof ApiError && (e.status === 404 || e.status === 405) ? 'ارسال ایمیل آزمایشی هنوز در سامانه نیست (به‌زودی).' : userMessage(e) }); }
    finally { setTesting(false); }
  };
  const soon = missing ? <Badge tone="warning">به‌زودی</Badge> : null;

  return (
    <>
      <PageHead title="تنظیمات ایمیل" sub={missing ? 'سرور ارسال ایمیل و نشانی گیرنده‌ی پیام‌های «تماس با ما»' : `سرور ارسال ایمیل و نشانی گیرنده‌ی پیام‌های «تماس با ما» — آخرین تغییر: ${faDateTime(server.updated_at)}`} actions={soon} />
      {missing ? (
        <InfoBanner tone="warning">
          این تنظیمات در سامانه ذخیره می‌شود، ولی هنوز راهی (API) برای دیدن و تغییر آن از پنل ساخته نشده است؛ فرم زیر با مقدارهای پیش‌فرض و فقط برای آشنایی نمایش داده می‌شود و به‌زودی فعال می‌شود.
          تا آن زمان ایمیل‌ها با تنظیمات سرور فرستاده می‌شوند.
        </InfoBanner>
      ) : !editable ? <InfoBanner>مجوز ویرایش تنظیمات ایمیل را ندارید؛ فقط مقدارها نمایش داده می‌شود.</InfoBanner> : null}
      <TopErrors errors={errs} />
      <div className={s.grid2}>
        <SettingCard icon={<IconServer2 size={20} />} title="سرور ارسال (SMTP)" desc="سرویسی که ایمیل‌ها از طریق آن فرستاده می‌شوند؛ مثلاً ایمیل سازمانی یا جیمیل" extra={soon}>
          <Row title="نشانی سرور" desc={<>مثلاً <span data-latin="" className="ltr">smtp.gmail.com</span></>} error={err('smtp_host')} changed={changed.includes('smtp_host')}>
            <TextField latin label="نشانی سرور" value={d.smtp_host} placeholder="smtp.example.com" maxLength={255} disabled={off} onChange={(v) => set('smtp_host', v.trim())} />
          </Row>
          <Row title="درگاه (پورت)" desc="معمولاً ۵۸۷ برای TLS و ۴۶۵ برای SSL" error={err('smtp_port')} changed={changed.includes('smtp_port')}>
            <Stepper label="درگاه" value={d.smtp_port} onChange={(v) => set('smtp_port', v)} min={1} max={65535} disabled={off} />
          </Row>
          <Row title="رمزنگاری اتصال" desc="TLS و SSL با هم روشن نمی‌شوند" error={err('use_tls') || err('use_ssl')} changed={changed.includes('enc')} wideControl>
            <span style={{ pointerEvents: off ? 'none' : undefined, opacity: off ? 0.55 : 1 }} aria-disabled={off || undefined}>
              <Segmented value={d.enc} onChange={(v) => set('enc', v)} options={[{ value: 'NONE', label: 'بدون' }, { value: 'TLS', label: 'TLS' }, { value: 'SSL', label: 'SSL' }]} />
            </span>
          </Row>
          <Row title="مهلت اتصال" desc="اگر سرور در این مدت پاسخ ندهد، ارسال ناموفق است" error={err('timeout_seconds')} changed={changed.includes('timeout_seconds')}>
            <Stepper label="مهلت اتصال" value={d.timeout_seconds} onChange={(v) => set('timeout_seconds', v)} min={1} max={120} unit="ثانیه" disabled={off} />
          </Row>
        </SettingCard>

        <SettingCard icon={<IconShieldLock size={20} />} title="حساب کاربری سرور" desc="نام کاربری و رمز (یا کلید) حساب ایمیل؛ رمز هرگز نمایش داده نمی‌شود" extra={soon}>
          <Row title="نام کاربری" error={err('smtp_username')} changed={changed.includes('smtp_username')}>
            <TextField latin label="نام کاربری سرور ایمیل" value={d.smtp_username} placeholder="no-reply@example.com" maxLength={255} disabled={off} onChange={(v) => set('smtp_username', v.trim())} />
          </Row>
          <Row title="رمز عبور" desc={pwd !== null ? 'خالی بگذارید تا رمز ذخیره‌شده پاک شود.' : server.has_password ? 'رمز ذخیره شده است.' : 'هنوز رمزی ذخیره نشده است.'} error={err('smtp_password')} changed={pwd !== null}>
            {pwd === null ? (
              <Button variant="secondary" size="sm" disabled={off} onClick={() => setPwd('')}>{server.has_password ? 'تغییر رمز' : 'تعیین رمز'}</Button>
            ) : (
              <input className={`${s.textIn} ltr`} type="password" autoComplete="new-password" aria-label="رمز تازه" value={pwd} maxLength={255} onChange={(e) => setPwd(e.target.value)} />
            )}
          </Row>
        </SettingCard>

        <SettingCard icon={<IconAt size={20} />} title="نشانی‌ها" desc="فرستنده‌ی ایمیل‌ها و صندوقی که پیام‌های «تماس با ما» به آن می‌رسد" extra={soon}>
          <Row title="نشانی فرستنده" desc="ایمیل‌ها از طرف این نشانی فرستاده می‌شوند" error={err('default_from_email')} changed={changed.includes('default_from_email')}>
            <TextField latin label="نشانی فرستنده" value={d.default_from_email} placeholder="no-reply@ziramarket.ir" maxLength={255} disabled={off} onChange={(v) => set('default_from_email', v.trim())} />
          </Row>
          <Row title="گیرنده‌ی پیام‌های «تماس با ما»" desc="پیام هر بازدیدکننده‌ای که فرم «تماس با ما» سایت را بفرستد به این نشانی می‌رسد" error={err('contact_recipient_email')} changed={changed.includes('contact_recipient_email')}>
            <TextField latin label="گیرنده‌ی پیام‌های تماس با ما" value={d.contact_recipient_email} placeholder="support@ziramarket.ir" maxLength={255} disabled={off} onChange={(v) => set('contact_recipient_email', v.trim())} />
          </Row>
        </SettingCard>

        <SettingCard icon={<IconMailCog size={20} />} title="وضعیت و آزمایش" desc="تا وقتی خاموش است، ایمیل‌ها با تنظیمات سرور فرستاده می‌شوند" extra={soon}>
          <Row title="استفاده از این تنظیمات" error={err('is_active')} changed={changed.includes('is_active')}>
            <Toggle checked={d.is_active} onChange={(v) => set('is_active', v)} disabled={off} label={d.is_active ? 'روشن' : 'خاموش'} />
          </Row>
          <Row title="ارسال ایمیل آزمایشی" desc={testMsg ? <span style={{ color: testMsg.ok ? 'var(--success)' : 'var(--brand)', fontWeight: 600 }}>{testMsg.text}</span> : 'برای اطمینان از درستی تنظیمات ذخیره‌شده'} wideControl>
            <TextField latin label="نشانی گیرنده‌ی ایمیل آزمایشی" value={testTo} placeholder="you@example.com" disabled={off} onChange={setTestTo} />
            <Button size="sm" icon={<IconSend size={15} />} disabled={off || !EMAIL.test(testTo.trim()) || dirty > 0} loading={testing} onClick={sendTest}
              data-tip={dirty > 0 ? 'اول تغییرات را ذخیره کنید' : 'ارسال'}>ارسال</Button>
          </Row>
        </SettingCard>
      </div>
      {editable ? <SaveBar dirty={dirty} saving={saving} onSave={submit} onReset={() => { setD(base); setPwd(null); setErrs(NO_ERRORS); }} /> : null}
    </>
  );
}
