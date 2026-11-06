import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconBuilding } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { faDateTime } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Textarea } from '@/shared/ui/form';
import { ErrorBox, InfoBanner, PageHead, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useCompany, type Company } from './api';
import { changedKeys, NO_ERRORS, parseErrors, SettingCard, TopErrors, type FormErrors } from './ui';
import s from './settings.module.css';

type Draft = { name: string; national_id: string; economic_code: string; address: string };
const EMPTY: Draft = { name: '', national_id: '', economic_code: '', address: '' };
const toDraft = (c: Company | null): Draft => (c ? { name: c.name, national_id: c.national_id, economic_code: c.economic_code, address: c.address } : EMPTY);
const FIELDS = Object.keys(EMPTY);

/**
 * اطلاعات شرکت (`/organization/company`، دامنه‌ی organization؛ در منوی «تنظیمات ⇐ پایه»).
 * پیش از ثبت اولیه GET ⇐ 404؛ ثبت اولیه با PUT فقط سوپر ادمین (نام، شناسه‌ی ملی و کد اقتصادی الزامی)؛ بعد از آن ویرایش جزئی با PATCH.
 */
export default function CompanyPage() {
  const can = usePerm();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useCompany();
  const [d, setD] = useState<Draft | null>(null);
  useEffect(() => { if (q.data !== undefined) setD(toDraft(q.data)); }, [q.data]);
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  if (q.isLoading || !d) return q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={4} height={70} />;
  const company = q.data ?? null;
  const creating = !company;
  const editable = creating ? !!user?.is_superuser : can('organization.company.update');
  const base = toDraft(company);
  const changed = changedKeys(d, base);
  const local: Partial<Record<keyof Draft, string>> = {};
  if (!d.name.trim()) local.name = 'نام شرکت الزامی است.';
  if (d.national_id && !/^[0-9]{11}$/.test(d.national_id)) local.national_id = 'شناسه‌ی ملی شرکت ۱۱ رقم است.';
  if (creating && !d.national_id) local.national_id = 'برای ثبت اولیه الزامی است.';
  if (!d.economic_code.trim()) local.economic_code = creating ? 'برای ثبت اولیه الزامی است.' : 'کد اقتصادی نباید خالی باشد.';
  const showLocal = changed.length > 0;
  const err = (k: keyof Draft) => errs.fields[k] || (showLocal ? local[k] : '') || undefined;

  const submit = async () => {
    if (Object.keys(local).length) { setErrs({ fields: local as Record<string, string>, general: [] }); return; }
    setBusy(true); setErrs(NO_ERRORS);
    try {
      const body = creating ? { ...d, address: d.address.trim() } : Object.fromEntries(changed.map((k) => [k, d[k]]));
      const res = await adminApi<Company>('/organization/company', { method: creating ? 'PUT' : 'PATCH', body });
      qc.setQueryData(['organization', 'company'], res);
      toast(creating ? 'اطلاعات شرکت ثبت شد.' : 'اطلاعات شرکت ذخیره شد.');
    } catch (e) {
      const p = parseErrors(e, FIELDS); setErrs(p); toast(p.general[0] ?? 'برخی مقادیر معتبر نیستند.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="اطلاعات شرکت" sub={company ? `مشخصات حقوقی شرکت که در اسناد و فاکتورها استفاده می‌شود — آخرین تغییر: ${faDateTime(company.updated_at)}` : 'مشخصات حقوقی شرکت که در اسناد و فاکتورها استفاده می‌شود'} />
      {creating ? (
        <InfoBanner tone="warning">
          اطلاعات شرکت هنوز ثبت نشده است. {user?.is_superuser ? 'نام، شناسه‌ی ملی و کد اقتصادی را وارد و «ثبت اطلاعات شرکت» را بزنید؛ شعبه‌هایی که شرکت ندارند به آن وصل می‌شوند.' : 'ثبت اولیه فقط با سوپر ادمین است.'}
        </InfoBanner>
      ) : !editable ? <InfoBanner>مجوز ویرایش اطلاعات شرکت را ندارید؛ فقط مقدارها نمایش داده می‌شود.</InfoBanner> : null}
      <TopErrors errors={errs} />
      <div className={s.formCard}>
        <SettingCard wide icon={<IconBuilding size={20} />} title="مشخصات شرکت" desc="فیلدهای ستاره‌دار الزامی‌اند">
          <div style={{ paddingTop: 14 }}>
            <FormGrid cols={3}>
              <Input label="نام شرکت" required value={d.name} error={err('name')} disabled={!editable} maxLength={150} onChange={(e) => setD({ ...d, name: e.target.value })} />
              <Input latin label="شناسه‌ی ملی شرکت" required value={d.national_id} error={err('national_id')} disabled={!editable} dir="ltr" inputMode="numeric" placeholder="۱۱ رقم"
                onChange={(e) => setD({ ...d, national_id: toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 11) })} />
              <Input latin label="کد اقتصادی" required value={d.economic_code} error={err('economic_code')} disabled={!editable} dir="ltr" maxLength={50}
                onChange={(e) => setD({ ...d, economic_code: toLatinDigits(e.target.value) })} />
              <Textarea label="آدرس دفتر مرکزی" span={3} value={d.address} error={err('address')} disabled={!editable} onChange={(e) => setD({ ...d, address: e.target.value })} />
            </FormGrid>
          </div>
        </SettingCard>
        {editable ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <Button onClick={submit} loading={busy} disabled={!creating && changed.length === 0}>{creating ? 'ثبت اطلاعات شرکت' : 'ذخیره‌ی تغییرات'}</Button>
            {!creating ? <Button variant="ghost" disabled={changed.length === 0 || busy} onClick={() => { setD(base); setErrs(NO_ERRORS); }}>بازگرداندن تغییرات</Button> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
