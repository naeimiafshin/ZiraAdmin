import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconLogout2 } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import s from './account.module.css';

/** تغییر رمز خودم — PUT /auth/me/password (قواعد پیچیدگی را بک‌اند طبق «سیاست‌های امنیتی» بررسی می‌کند). */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [oldPw, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = !!pw2 && pw !== pw2;
  const submit = async () => {
    setErr(null);
    if (!oldPw || !pw) return setErr('رمز فعلی و رمز تازه را وارد کنید.');
    if (pw !== pw2) return setErr('تکرار رمز تازه با خودش یکی نیست.');
    if (pw === oldPw) return setErr('رمز تازه باید با رمز فعلی فرق داشته باشد.');
    setBusy(true);
    try {
      await adminApi('/auth/me/password', { method: 'PUT', body: { old_password: oldPw, new_password: pw } });
      // بک‌اند با تغییر رمز همه‌ی توکن‌ها را باطل می‌کند (token_version) ⇐ ورود دوباره با رمز تازه
      toast('رمز عبور تغییر کرد؛ با رمز تازه دوباره وارد شوید.');
      onClose();
      await logout().catch(() => undefined);
      navigate('/login', { replace: true });
    } catch (e) {
      setErr(userMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="تغییر رمز عبور" width={460}
      footer={<><Button onClick={submit} loading={busy}>تغییر رمز</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {err ? <Alert>{err}</Alert> : null}
        <p className={s.text}>پس از تغییر رمز، از همه‌ی دستگاه‌ها (از جمله همین‌جا) خارج می‌شوید و باید با رمز تازه وارد شوید.</p>
        <Input label="رمز فعلی" type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOld(e.target.value)} required autoFocus />
        <Input label="رمز تازه" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required
          hint="حداقل طول و پیچیدگی طبق «سیاست‌های امنیتی» سامانه بررسی می‌شود." />
        <Input label="تکرار رمز تازه" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required error={mismatch ? 'با رمز تازه یکی نیست.' : undefined} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** خروج از همه‌ی دستگاه‌ها — POST /auth/me/tokens/revoke-all (همه‌ی نشست‌ها، از جمله همین مرورگر، بسته می‌شوند). */
export function LogoutAllModal({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      await adminApi('/auth/me/tokens/revoke-all', { method: 'POST' });
      await logout().catch(() => undefined);
      navigate('/login', { replace: true });
    } catch (e) {
      setErr(userMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="خروج از همه‌ی دستگاه‌ها" width={460}
      footer={<><Button variant="danger" icon={<IconLogout2 size={17} />} onClick={run} loading={busy}>خروج از همه</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      {err ? <Alert>{err}</Alert> : null}
      <p className={s.text}>همه‌ی نشست‌های شما در همه‌ی مرورگرها و دستگاه‌ها، از جمله همین‌جا، بسته می‌شود و باید دوباره وارد شوید. اگر فکر می‌کنید کسی دیگر وارد حساب شما شده، بعد از این کار رمز عبور را هم عوض کنید.</p>
    </Modal>
  );
}
