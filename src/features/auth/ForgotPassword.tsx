import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@/shared/api/errors';
import {
  staffConfirmPasswordReset,
  staffRequestPasswordReset,
  staffVerifyPasswordReset,
  type PasswordResetRequestOut,
} from '@/shared/auth/api';
import { RECOVERY_RESTART_CODE, recoveryErrorMessage } from '@/shared/auth/messages';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, LockIcon, ShieldIcon, UserIcon } from '@/shared/ui/icons';
import { mmss, useCountdown } from './LoginSteps';
import styles from './LoginPage.module.css';

/**
 * بازیابی رمز کارکنان (2026-10-27): نام کاربری ⇐ کد ۶ رقمی پیامکی ⇐ رمز تازه.
 * پاسخ گام اول برای هر نام کاربری یکسان است؛ پس صفحه هرگز نمی‌گوید حساب هست یا نیست.
 * بعد از تغییر رمز، بک‌اند همه‌ی نشست‌های کاربر را می‌بندد ⇐ بازگشت به فرم ورود با پیام.
 */
/** قیدهای schema بک‌اند (domains/identity/schemas/password_reset_challenge.py). */
const USERNAME_MIN = 3;
const USERNAME_MAX = 150;
const CODE_LENGTH = 6;
const PASSWORD_MAX = 128;

/** فقط رقم‌ها: «۱۲-۳a4» ⇐ "1234" (ارقام فارسی اول لاتین می‌شوند، بقیه حذف). */
const NON_DIGIT = /\D/g;
const onlyDigits = (v: string) => toLatinDigits(v).replace(NON_DIGIT, '');

type Stage =
  | { kind: 'request' }
  | { kind: 'verify'; challenge: PasswordResetRequestOut; sentAt: number }
  | { kind: 'reset'; challengeId: string; resetToken: string; expiresIn: number };

type Props = {
  initialUsername: string;
  /** بازگشت به فرم ورود؛ `done` = رمز تغییر کرد (پیام موفقیت + نام کاربری). */
  onExit: (result?: { message: string; username: string }) => void;
};

export function ForgotPassword({ initialUsername, onExit }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'request' });
  const [username, setUsername] = useState(initialUsername);
  /** پیام خطایی که با برگشتن به گام اول نشان داده می‌شود (مثلاً مهلت تمام شد). */
  const [restartNote, setRestartNote] = useState<string | null>(null);

  const restart = (note?: string) => {
    setRestartNote(note ?? null);
    setStage({ kind: 'request' });
  };

  if (stage.kind === 'verify') {
    return (
      <VerifyStep
        key={stage.sentAt}
        username={username}
        challenge={stage.challenge}
        onVerified={(challengeId, resetToken, expiresIn) => setStage({ kind: 'reset', challengeId, resetToken, expiresIn })}
        onResent={(challenge) => setStage({ kind: 'verify', challenge, sentAt: Date.now() })}
        onRestart={restart}
      />
    );
  }
  if (stage.kind === 'reset') {
    return (
      <ResetStep
        challengeId={stage.challengeId}
        resetToken={stage.resetToken}
        expiresIn={stage.expiresIn}
        onDone={(message) => onExit({ message, username })}
        onRestart={restart}
      />
    );
  }
  return (
    <RequestStep
      username={username}
      setUsername={setUsername}
      note={restartNote}
      onSent={(challenge) => { setRestartNote(null); setStage({ kind: 'verify', challenge, sentAt: Date.now() }); }}
      onBack={() => onExit()}
    />
  );
}

/* ── گام ۱: نام کاربری ─────────────────────────────────────── */
function RequestStep({ username, setUsername, note, onSent, onBack }: {
  username: string;
  setUsername: (v: string) => void;
  note: string | null;
  onSent: (c: PasswordResetRequestOut) => void;
  onBack: () => void;
}) {
  const [fieldErr, setFieldErr] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    // قید schema بک‌اند (StaffPasswordResetRequestIn): ۳ تا ۱۵۰ نویسه
    if (u.length < USERNAME_MIN) { setFieldErr(u ? `نام کاربری دست‌کم ${USERNAME_MIN} نویسه است.` : 'نام کاربری را وارد کنید.'); return; }
    if (u.length > USERNAME_MAX) { setFieldErr(`نام کاربری حداکثر ${USERNAME_MAX} نویسه است.`); return; }
    setFieldErr(undefined);
    setError(null);
    setBusy(true);
    try {
      onSent(await staffRequestPasswordReset(u));
    } catch (err) {
      setError(recoveryErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>بازیابی رمز عبور</h1>
        <p className={styles.subtitle}>نام کاربری خود را وارد کنید تا کد بازیابی به موبایل ثبت‌شده‌ی حساب فرستاده شود.</p>
      </header>
      {error ?? note ? <Alert>{error ?? note}</Alert> : null}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="نام کاربری"
          icon={<UserIcon />}
          placeholder="نام کاربری سازمانی"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          dir="ltr"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErr}
        />
        <Button type="submit" size="lg" block loading={busy} loadingText="در حال ارسال…" icon={<ArrowLeftIcon />} className={styles.submit}>
          ارسال کد بازیابی
        </Button>
      </form>
      <div className={styles.stepActions}>
        <span className={styles.stepNote}>کد فقط به موبایلی می‌رود که در حساب ثبت شده است.</span>
        <Button variant="ghost" onClick={onBack}>بازگشت به ورود</Button>
      </div>
    </>
  );
}

/* ── گام ۲: کد ۶ رقمی ──────────────────────────────────────── */
function VerifyStep({ username, challenge, onVerified, onResent, onRestart }: {
  username: string;
  challenge: PasswordResetRequestOut;
  onVerified: (challengeId: string, resetToken: string, expiresIn: number) => void;
  onResent: (c: PasswordResetRequestOut) => void;
  onRestart: (note?: string) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const left = useCountdown(challenge.expires_in, challenge.challenge_id);
  const resendLeft = useCountdown(challenge.resend_after, challenge.challenge_id);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // قید schema بک‌اند (PasswordResetVerifyIn): دقیقاً ۶ رقم
    if (code.length !== CODE_LENGTH) { setError('کد ۶ رقمی را کامل وارد کنید.'); input.current?.focus(); return; }
    setError(null);
    setBusy(true);
    try {
      const r = await staffVerifyPasswordReset(challenge.challenge_id, code);
      onVerified(challenge.challenge_id, r.reset_token, r.expires_in);
    } catch (err) {
      // کد اشتباه، کد منقضی و تمام‌شدن تلاش‌ها همه یک پاسخ دارند (password_reset_invalid) ⇐ کاربر در همین گام می‌ماند و می‌تواند کد تازه بگیرد.
      setError(err instanceof ApiError && err.code === RECOVERY_RESTART_CODE
        ? 'کد درست نیست یا مهلت آن تمام شده است. دوباره وارد کنید یا کد تازه بگیرید.'
        : recoveryErrorMessage(err));
      setCode('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setResending(true);
    try {
      onResent(await staffRequestPasswordReset(username.trim()));
    } catch (err) {
      setError(recoveryErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>کد بازیابی</h1>
        <p className={styles.subtitle}>{challenge.message} کد ۶ رقمی پیامک را وارد کنید.</p>
      </header>
      {error ? <Alert><span className={styles.lines}>{error}</span></Alert> : null}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          ref={input}
          label="کد بازیابی"
          icon={<ShieldIcon />}
          autoComplete="one-time-code"
          inputMode="numeric"
          dir="ltr"
          maxLength={CODE_LENGTH}
          autoFocus
          className={styles.code}
          value={toFaDigits(code)}
          onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, CODE_LENGTH))}
          hint={left > 0
            ? <>اعتبار کد: <span className={styles.timer}>{mmss(left)}</span></>
            : <span className={styles.expired}>مهلت این کد تمام شد؛ کد تازه بگیرید.</span>}
        />
        <Button type="submit" size="lg" block loading={busy} loadingText="در حال بررسی…" icon={<ArrowLeftIcon />} className={styles.submit} disabled={left === 0}>
          تأیید کد
        </Button>
      </form>
      <div className={styles.stepActions}>
        <Button
          variant="ghost"
          onClick={resend}
          loading={resending}
          loadingText="در حال ارسال…"
          disabled={resendLeft > 0}
          data-tip={resendLeft > 0 ? `ارسال دوباره تا ${mmss(resendLeft)} دیگر ممکن است` : undefined}
        >
          {resendLeft > 0 ? <>ارسال دوباره (<span className={styles.timer}>{mmss(resendLeft)}</span>)</> : 'ارسال دوباره‌ی کد'}
        </Button>
        <Button variant="ghost" onClick={() => onRestart()}>تغییر نام کاربری</Button>
      </div>
      <p className={styles.help}>هر کد چند بار امتحان می‌شود و بعد باطل می‌شود. کد تازه، کدهای قبلی را باطل می‌کند.</p>
    </>
  );
}

/* ── گام ۳: رمز تازه ───────────────────────────────────────── */
function ResetStep({ challengeId, resetToken, expiresIn, onDone, onRestart }: {
  challengeId: string;
  resetToken: string;
  expiresIn: number;
  onDone: (message: string) => void;
  onRestart: (note?: string) => void;
}) {
  const left = useCountdown(expiresIn, resetToken);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ pw?: string; pw2?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // قید schema بک‌اند (PasswordResetConfirmIn): ۱ تا ۱۲۸ نویسه؛ قواعد پیچیدگی را سیاست امنیتی بک‌اند می‌سنجد.
    const fe: { pw?: string; pw2?: string } = {};
    if (!pw) fe.pw = 'رمز عبور جدید را وارد کنید.';
    else if (pw.length > PASSWORD_MAX) fe.pw = `رمز عبور حداکثر ${PASSWORD_MAX} نویسه است.`;
    if (!fe.pw && pw2 !== pw) fe.pw2 = 'تکرار رمز با رمز جدید یکی نیست.';
    setFieldErr(fe);
    if (fe.pw || fe.pw2) return;
    setError(null);
    setBusy(true);
    try {
      const r = await staffConfirmPasswordReset(challengeId, resetToken, pw, pw2);
      onDone(r.message);
    } catch (err) {
      if (err instanceof ApiError && err.code === RECOVERY_RESTART_CODE) {
        onRestart('مهلت تعیین رمز تمام شده یا درخواست باطل شده است. دوباره کد بگیرید.');
        return;
      }
      // رمز با قواعد سیاست امنیتی نخواند ⇐ ۴۰۰؛ reset_token هنوز معتبر است و کاربر دوباره امتحان می‌کند.
      setError(recoveryErrorMessage(err));
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
        <h1 className={styles.title}>رمز عبور تازه</h1>
        <p className={styles.subtitle}>کد تأیید شد. رمز تازه‌ی حساب را تعیین کنید.</p>
      </header>
      {error ? <Alert><span className={styles.lines}>{error}</span></Alert> : null}
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
          hint="نباید با رمزهای اخیر یکی باشد و باید قواعد پیچیدگی سامانه را داشته باشد."
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
          ذخیره‌ی رمز تازه
        </Button>
      </form>
      <div className={styles.stepActions}>
        <span className={styles.stepNote}>
          {left > 0
            ? <>مهلت تعیین رمز: <span className={styles.timer}>{mmss(left)}</span></>
            : <span className={styles.expired}>مهلت تمام شد؛ دوباره کد بگیرید.</span>}
        </span>
        <Button variant="ghost" onClick={() => onRestart()}>از اول</Button>
      </div>
      <p className={styles.help}>بعد از ذخیره، همه‌ی نشست‌های این حساب در همه‌ی دستگاه‌ها بسته می‌شوند و باید با رمز تازه وارد شوید.</p>
    </>
  );
}
