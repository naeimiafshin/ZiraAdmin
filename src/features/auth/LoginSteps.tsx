import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@/shared/api/errors';
import type { StaffLoginResponse, TwoFactorChallenge } from '@/shared/auth/api';
import { staffResendTwoFactor } from '@/shared/auth/api';
import type { LoginOutcome } from '@/shared/auth/AuthProvider';
import { loginErrorMessage, RESTART_LOGIN_CODES } from '@/shared/auth/messages';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, LockIcon, ShieldIcon } from '@/shared/ui/icons';
import styles from './LoginPage.module.css';

/** شمارش معکوس ثانیه‌ای (مهلت کد پیامکی یا مهلت تغییر رمز). */
export function useCountdown(seconds: number | null | undefined, resetKey: unknown) {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    setLeft(seconds ?? 0);
    if (!seconds) return undefined;
    const end = Date.now() + seconds * 1000;
    const t = window.setInterval(() => {
      const v = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(v);
      if (v === 0) window.clearInterval(t);
    }, 1000);
    return () => { window.clearInterval(t); };
  }, [seconds, resetKey]);
  return left;
}
export const mmss = (sec: number) => toFaDigits(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);

type StepError = { text: string };
type Props = {
  /** مرحله‌ی بعد (TWO_FACTOR ⇐ PASSWORD_CHANGE) یا ورود کامل. */
  onOutcome: (o: LoginOutcome) => void;
  /** بازگشت به فرم نام کاربری و رمز، با پیام اختیاری. */
  onRestart: (message?: string) => void;
};

/** مرحله‌ی دوم ورود: کد پیامکی (نقش‌هایی که ورود دو مرحله‌ای دارند؛ 2026-10-25). */
export function TwoFactorStep({ challenge, verify, onOutcome, onRestart }: Props & {
  challenge: TwoFactorChallenge;
  verify: (challengeId: string, code: string) => Promise<LoginOutcome>;
}) {
  const [current, setCurrent] = useState(challenge);
  const [code, setCode] = useState('');
  const [error, setError] = useState<StepError | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(0);
  const left = useCountdown(current.expires_in, sent);
  const input = useRef<HTMLInputElement>(null);
  const clean = toLatinDigits(code).replace(/\D/g, '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (clean.length < 4) { setError({ text: 'کد پیامکی را کامل وارد کنید.' }); input.current?.focus(); return; }
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      onOutcome(await verify(current.challenge_id, clean));
    } catch (err) {
      if (err instanceof ApiError && RESTART_LOGIN_CODES.has(err.code)) { onRestart(loginErrorMessage(err)); return; }
      setError({ text: loginErrorMessage(err) });
      setCode('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      const c = await staffResendTwoFactor(current.challenge_id);
      setCurrent(c);
      setSent((n) => n + 1);
      setCode('');
      setInfo('کد تازه فرستاده شد.');
      input.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && RESTART_LOGIN_CODES.has(err.code)) { onRestart(loginErrorMessage(err)); return; }
      setError({ text: loginErrorMessage(err) });
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>ورود دو مرحله‌ای</h1>
        <p className={styles.subtitle}>
          کد پیامکی فرستاده‌شده به <bdi className={styles.phone} dir="ltr" data-latin="">{current.masked_phone}</bdi> را وارد کنید.
        </p>
      </header>
      {error ? <Alert><span className={styles.lines}>{error.text}</span></Alert> : info ? <Alert tone="info">{info}</Alert> : null}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          ref={input}
          label="کد پیامکی"
          icon={<ShieldIcon />}
          autoComplete="one-time-code"
          inputMode="numeric"
          dir="ltr"
          maxLength={10}
          autoFocus
          className={styles.code}
          value={toFaDigits(code)}
          onChange={(e) => setCode(toLatinDigits(e.target.value).replace(/\D/g, ''))}
          hint={left > 0 ? <>اعتبار کد: <span className={styles.timer}>{mmss(left)}</span></> : <span className={styles.expired}>مهلت این کد تمام شد؛ کد تازه بگیرید.</span>}
        />
        <Button type="submit" size="lg" block loading={busy} loadingText="در حال بررسی…" icon={<ArrowLeftIcon />} className={styles.submit} disabled={left === 0}>
          تأیید و ورود
        </Button>
      </form>
      <div className={styles.stepActions}>
        <Button variant="ghost" onClick={resend} loading={resending} loadingText="در حال ارسال…">ارسال دوباره‌ی کد</Button>
        <Button variant="ghost" onClick={() => onRestart()}>بازگشت به ورود</Button>
      </div>
      <p className={styles.help}>هر کد اشتباه یک تلاش ناموفق ورود حساب می‌شود. هر شماره در ۱۰ دقیقه حداکثر ۳ پیامک می‌گیرد.</p>
    </>
  );
}

/** رمز منقضی کارکنان: تعیین رمز تازه با change_token یک‌بارمصرف (۱۰ دقیقه). */
export function PasswordChangeStep({ response, change, onOutcome, onRestart }: Props & {
  response: StaffLoginResponse;
  change: (changeToken: string, newPassword: string) => Promise<LoginOutcome>;
}) {
  const token = response.password_change?.change_token ?? '';
  const left = useCountdown(response.password_change?.expires_in, token);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ pw?: string; pw2?: string }>({});
  const [error, setError] = useState<StepError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // قید schema بک‌اند (StaffExpiredPasswordChangeInput): ۶ تا ۱۲۸ نویسه؛ قواعد سیاست امنیتی را بک‌اند می‌سنجد.
    const fe: { pw?: string; pw2?: string } = {};
    if (pw.length < 6) fe.pw = 'رمز عبور دست‌کم ۶ نویسه است.';
    else if (pw.length > 128) fe.pw = 'رمز عبور حداکثر ۱۲۸ نویسه است.';
    if (!fe.pw && pw2 !== pw) fe.pw2 = 'تکرار رمز با رمز جدید یکی نیست.';
    setFieldErr(fe);
    if (fe.pw || fe.pw2) return;
    setError(null);
    setBusy(true);
    try {
      onOutcome(await change(token, pw));
    } catch (err) {
      if (err instanceof ApiError && RESTART_LOGIN_CODES.has(err.code)) { onRestart(loginErrorMessage(err)); return; }
      // رمز با قواعد نخواند ⇐ ۴۰۰؛ change_token هنوز معتبر است و کاربر دوباره امتحان می‌کند.
      setError({ text: loginErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const eye = (
    <button type="button" className={styles.eye} onClick={() => setShow((v) => !v)} aria-label={show ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'} aria-pressed={show}>
      {show ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>تغییر رمز عبور</h1>
        <p className={styles.subtitle}>رمز عبور شما منقضی شده است. برای ادامه یک رمز تازه تعیین کنید.</p>
      </header>
      {error ? <Alert><span className={styles.lines}>{error.text}</span></Alert> : null}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="رمز عبور جدید"
          icon={<LockIcon />}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          dir="ltr"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          error={fieldErr.pw}
          hint="نباید با رمز فعلی یا رمزهای اخیر یکی باشد و باید قواعد پیچیدگی سامانه را داشته باشد."
          trailing={eye}
        />
        <TextField
          label="تکرار رمز عبور جدید"
          icon={<LockIcon />}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          dir="ltr"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          error={fieldErr.pw2}
        />
        <Button type="submit" size="lg" block loading={busy} loadingText="در حال ذخیره…" icon={<ArrowLeftIcon />} className={styles.submit} disabled={left === 0}>
          ذخیره و ورود
        </Button>
      </form>
      <div className={styles.stepActions}>
        <span className={styles.stepNote}>
          {left > 0 ? <>مهلت تغییر رمز: <span className={styles.timer}>{mmss(left)}</span></> : <span className={styles.expired}>مهلت تغییر رمز تمام شد؛ دوباره وارد شوید.</span>}
        </span>
        <Button variant="ghost" onClick={() => onRestart()}>بازگشت به ورود</Button>
      </div>
    </>
  );
}
