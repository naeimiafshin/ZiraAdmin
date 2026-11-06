import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconBuildingCommunity, IconBuildingStore, IconCheck, IconChevronDown } from '@tabler/icons-react';
import { branchStore } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/useAuth';
import { toFaDigits } from '@/shared/lib/text';
import { useBranchOptions } from './useBranches';
import styles from './Header.module.css';

/**
 * شعبه‌ی فعال (هدر X-Branch-ID، ADR 0004). شعبه‌ی فعال فقط زمینه‌ی کار است، نه مرز دسترسی.
 * سوپر ادمین «همه‌ی شعب» (بدون هدر) هم دارد.
 */
export function BranchPicker() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: options, canList, isLoading } = useBranchOptions();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const isSuper = user.is_superuser;
  const userBranchIds = user.branch_ids ?? [];
  const activeId = branchStore.get() ?? user.active_branch_id ?? null;
  const list = (options ?? []).filter((b) => isSuper || userBranchIds.includes(b.id));
  const active = list.find((b) => b.id === activeId) ?? null;

  // کاربری که شعبه‌ای ندارد و سوپر ادمین نیست
  if (!isSuper && userBranchIds.length === 0) {
    return (
      <div className={`${styles.picker} ${styles.pickerStatic}`} data-tip="هیچ شعبه‌ای به حساب شما داده نشده است">
        <span className={styles.pickerIcon}><IconBuildingStore size={19} stroke={1.7} /></span>
        <span className={styles.pickerMuted}>بدون شعبه</span>
      </div>
    );
  }

  // نام شعب در دسترس نیست (مجوز organization.branches.list ندارد)
  if (!canList) {
    return (
      <div className={`${styles.picker} ${styles.pickerStatic}`} data-tip="نام شعب برای حساب شما قابل دریافت نیست">
        <span className={styles.pickerIcon}><IconBuildingStore size={19} stroke={1.7} /></span>
        <span>{userBranchIds.length === 1 ? 'شعبه‌ی شما' : `${toFaDigits(userBranchIds.length)} شعبه`}</span>
      </div>
    );
  }

  const label = isLoading ? 'در حال دریافت…' : active ? active.name : isSuper ? 'همه‌ی شعب' : 'انتخاب شعبه';

  const choose = async (id: string | null) => {
    setOpen(false);
    if (id === activeId) return;
    setSwitching(true);
    branchStore.set(id);
    try {
      await refreshUser();
      await queryClient.invalidateQueries();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className={styles.pickerWrap} ref={ref}>
      <button
        type="button"
        className={styles.picker}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching}
        aria-label="شعبه‌ی فعال"
      >
        <span className={styles.pickerIcon}><IconBuildingStore size={19} stroke={1.7} /></span>
        <span className={styles.pickerLabel}>
          <span className={styles.pickerCaption}><span className={styles.pulse} aria-hidden />شعبه‌ی فعال</span>
          <span className={styles.pickerValue}>{switching ? 'در حال تغییر…' : label}</span>
        </span>
        <IconChevronDown size={16} className={styles.pickerChev} />
      </button>
      {open ? (
        <div className={styles.menu} role="listbox" aria-label="شعبه‌ی فعال">
          <div className={styles.menuHead}>انتخاب شعبه‌ی فعال</div>
          {isSuper ? (
            <button type="button" role="option" data-tip="همه‌ی شعب" aria-selected={activeId === null} className={styles.option} onClick={() => choose(null)}>
              <span className={styles.optionIcon}><IconBuildingCommunity size={18} stroke={1.7} /></span>
              <span className={styles.optionText}>
                <span>همه‌ی شعب</span>
                <span className={styles.optionSub}>بدون محدود کردن به یک شعبه</span>
              </span>
              {activeId === null ? <IconCheck size={16} className={styles.check} /> : null}
            </button>
          ) : null}
          {list.length === 0 ? <div className={styles.menuEmpty}>شعبه‌ای ثبت نشده است.</div> : null}
          {list.map((b) => (
            <button key={b.id} type="button" role="option" data-tip={b.name} aria-selected={b.id === activeId} className={styles.option} onClick={() => choose(b.id)}>
              <span className={styles.optionIcon}><IconBuildingStore size={18} stroke={1.7} /></span>
              <span className={styles.optionText}>
                <span>{b.name}</span>
                <span className={`${styles.optionSub} ltr`}>{b.code}</span>
              </span>
              {b.id === activeId ? <IconCheck size={16} className={styles.check} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
