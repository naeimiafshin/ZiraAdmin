import { useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate } from 'react-router';
import { ApiError } from '@/shared/api/errors';
import type { StaffLoginResponse } from '@/shared/auth/api';
import type { LoginOutcome } from '@/shared/auth/AuthProvider';
import { useAuth } from '@/shared/auth/useAuth';
import { loginErrorMessage } from '@/shared/auth/messages';
import { Alert } from '@/shared/ui/Alert';
import logoUrl from '@/shared/assets/brand/logo.svg';
import { BrandLockup } from '@/shared/ui/BrandLockup';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, LockIcon, ShieldIcon, UserIcon } from '@/shared/ui/icons';
import { loginSchema, type LoginFormInput, type LoginFormValues } from './loginSchema';
import { ForgotPassword } from './ForgotPassword';
import { PasswordChangeStep, TwoFactorStep } from './LoginSteps';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const { login, verifyTwoFactor, changeExpiredPassword, notice } = useAuth();
  /** مرحله‌ی دوم ورود (2026-10-25): کد پیامکی یا رمز جدید؛ null = فرم نام کاربری و رمز. */
  const [step, setStep] = useState<StaffLoginResponse | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<{ text: string; requestId: string | null } | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  /** بازیابی رمز (2026-10-27): کارت ورود جای خود را به گام‌های بازیابی می‌دهد. */
  const [forgot, setForgot] = useState(false);
  const [resetDone, setResetDone] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    resetField,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput, unknown, LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onOutcome = (o: LoginOutcome) => {
    if (o.step !== 'TOKENS') { setError(null); setStep(o.response); return; }
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/login' ? from : '/', { replace: true });
  };
  const restart = (message?: string) => {
    setStep(null);
    setError(message ? { text: message, requestId: null } : null);
    resetField('password');
    if (message) setShakeKey((k) => k + 1);
  };

  const exitForgot = (result?: { message: string; username: string }) => {
    setForgot(false);
    setError(null);
    if (result) {
      setResetDone(result.message);
      setValue('username', result.username);
      resetField('password');
    }
  };

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(null);
    setResetDone(null);
    try {
      onOutcome(await login(username, password));
    } catch (e) {
      const requestId = e instanceof ApiError && e.status >= 500 ? e.requestId : null;
      setError({ text: loginErrorMessage(e), requestId });
      setShakeKey((k) => k + 1);
      resetField('password');
      setFocus('password');
    }
  });

  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel} aria-hidden="true">
        <div className={styles.pattern} />
        <img src={logoUrl} alt="" className={styles.watermark} />
        <div className={styles.brandTop}>
          <BrandLockup height={64} />
        </div>
        <div className={styles.brandCopy}>
          <h2 className={styles.brandTitle}>
            پنل مدیریت
            <br />
            عمده‌فروشی <span className={styles.accent}>زیرا مارکت</span>
          </h2>
          <p className={styles.brandText}>کاتالوگ، قیمت‌گذاری، مشتریان، شعب و محتوای فروشگاه — همه در یک پنل.</p>
        </div>
        <div className={styles.brandFoot}>
          <ShieldIcon size={16} />
          <span>ورود فقط برای کارکنان مجاز است و همه‌ی تلاش‌های ورود ثبت می‌شوند.</span>
        </div>
      </aside>

      <main className={styles.formSide}>
        <div className={styles.formWrap}>
          <div key={shakeKey} className={`${styles.card} ${shakeKey ? styles.shake : ''}`}>
            {forgot ? (
              <ForgotPassword initialUsername={getValues('username')} onExit={exitForgot} />
            ) : step?.step === 'TWO_FACTOR' && step.two_factor ? (
              <TwoFactorStep challenge={step.two_factor} verify={verifyTwoFactor} onOutcome={onOutcome} onRestart={restart} />
            ) : step?.step === 'PASSWORD_CHANGE' && step.password_change ? (
              <PasswordChangeStep key={step.password_change.change_token} response={step} change={changeExpiredPassword} onOutcome={onOutcome} onRestart={restart} />
            ) : (
              <>
              <header className={styles.header}>
                <h1 className={styles.title}>ورود به پنل مدیریت</h1>
                <p className={styles.subtitle}>با نام کاربری و رمز عبور سازمانی خود وارد شوید.</p>
              </header>

              {resetDone && !error ? <Alert tone="info">{resetDone}</Alert> : null}
              {notice && !error && !resetDone ? <Alert tone="info">{notice}</Alert> : null}
              {error ? (
                <Alert footer={error.requestId ? <span className="ltr">Request ID: {error.requestId}</span> : null}><span className={styles.lines}>{error.text}</span></Alert>
              ) : null}

              <form className={styles.form} onSubmit={onSubmit} noValidate>
                <TextField
                  label="نام کاربری"
                  icon={<UserIcon />}
                  placeholder="نام کاربری سازمانی"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  dir="ltr"
                  autoFocus={!resetDone}
                  error={errors.username?.message}
                  {...register('username')}
                />

                <TextField
                  label="رمز عبور"
                  icon={<LockIcon />}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="رمز عبور"
                  autoComplete="current-password"
                  autoFocus={!!resetDone}
                  dir="ltr"
                  onKeyUp={trackCaps}
                  onKeyDown={trackCaps}
                  error={errors.password?.message}
                  hint={capsLock ? <span className={styles.caps}>Caps Lock روشن است.</span> : undefined}
                  trailing={
                    <button
                      type="button"
                      className={styles.eye}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  }
                  {...register('password')}
                />

                <Button type="submit" size="lg" block loading={isSubmitting} loadingText="در حال ورود…" icon={<ArrowLeftIcon />} className={styles.submit}>
                  ورود به پنل
                </Button>
              </form>

              <p className={styles.help}>
                رمز عبور را فراموش کرده‌اید؟{' '}
                <button type="button" className={styles.link} onClick={() => { setError(null); setForgot(true); }}>
                  بازیابی رمز با کد پیامکی
                </button>
              </p>
              </>
            )}
          </div>

          <footer className={styles.footer}>© زیرا مارکت · پنل مدیریت</footer>
        </div>
      </main>
    </div>
  );
}
