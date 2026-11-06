import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconBell, IconBellOff, IconChecks, IconSettings, IconX } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { faDate, faNum, faTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Toggle } from '@/shared/ui/form';
import { Empty, Modal, Segmented, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { PRIORITY, TOPIC } from '@/features/users/labels';
import { INBOX_KEY, dismiss, isUnread, markSeen, savePreferences, useInbox, usePreferences, type Delivery } from './api';
import { useUnreadStream } from './useUnreadStream';
import s from './inbox.module.css';

const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
function ago(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'همین حالا';
  if (sec < 3600) return rtf.format(-Math.round(sec / 60), 'minute');
  if (sec < 86400) return rtf.format(-Math.round(sec / 3600), 'hour');
  if (sec < 7 * 86400) return rtf.format(-Math.round(sec / 86400), 'day');
  return `${faDate(iso)} ${faTime(iso)}`;
}

/** زنگوله‌ی هدر: اعلان‌های خودِ کاربر (همان‌هایی که از «اعلان‌ها» ارسال می‌شوند). فقط برای پرسنل و سوپر ادمین. */
export function Bell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const enabled = !!user && (user.user_type === 'STAFF' || user.user_type === 'SUPERADMIN');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useInbox(enabled && open);
  const { count, refresh } = useUnreadStream(enabled, () => { if (open) void qc.invalidateQueries({ queryKey: [...INBOX_KEY, 'list'] }); });

  useEffect(() => {
    if (!open) return;
    const d = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[role=dialog]')) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !prefs) setOpen(false); };
    document.addEventListener('mousedown', d); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', d); document.removeEventListener('keydown', k); };
  }, [open, prefs]);
  if (!enabled) return null;

  const items = (list.data?.results ?? []).filter((d) => tab === 'all' || isUnread(d));
  const unreadIds = (list.data?.results ?? []).filter(isUnread).map((d) => d.id);
  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { toast(userMessage(e), 'error'); }
    await qc.invalidateQueries({ queryKey: [...INBOX_KEY, 'list'] });
    refresh();
  };
  const openItem = (d: Delivery) => {
    setExpanded((x) => (x === d.id ? null : d.id));
    if (isUnread(d)) void act(() => markSeen([d.id]));
  };

  return (
    <div className={s.wrap} ref={wrap}>
      <button type="button" className={`${s.bell} ${open ? s.bellOn : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={count ? `اعلان‌ها (${faNum(count)} خوانده‌نشده)` : 'اعلان‌ها'} data-tip="اعلان‌ها">
        <IconBell size={20} stroke={1.7} />
        {count ? <span className={s.badge}>{count > 99 ? '۹۹+' : faNum(count)}</span> : null}
      </button>
      {open ? (
        <div className={s.pop} role="region" aria-label="اعلان‌های من">
          <div className={s.head}>
            <div className={s.headTitle}>اعلان‌ها{count ? <span className={s.headCount}>{faNum(count)} خوانده‌نشده</span> : null}</div>
            <button type="button" className={s.iconBtn} onClick={() => setPrefs(true)} aria-label="تنظیمات اعلان‌ها" data-tip="تنظیمات اعلان‌ها"><IconSettings size={18} /></button>
          </div>
          <div className={s.tools}>
            <Segmented value={tab} onChange={setTab} options={[{ value: 'all', label: 'همه' }, { value: 'unread', label: 'خوانده‌نشده' }]} />
            <button type="button" className={s.link} disabled={!unreadIds.length} onClick={() => void act(() => markSeen(unreadIds))}><IconChecks size={16} />خواندن همه</button>
          </div>
          <div className={s.list}>
            {list.isLoading ? <div className={s.pad}><SkeletonRows rows={4} height={64} /></div>
              : list.error ? <div className={s.pad}><Empty title="اعلان‌ها بارگذاری نشد" text={userMessage(list.error)} /></div>
                : items.length === 0 ? <Empty icon={<IconBellOff size={28} stroke={1.4} />} title={tab === 'unread' ? 'اعلان خوانده‌نشده‌ای ندارید' : 'اعلانی ندارید'} />
                  : items.map((d) => {
                    const p = PRIORITY[d.priority] ?? { label: d.priority, tone: 'neutral' as const };
                    const un = isUnread(d);
                    const at = d.sent_at ?? d.created_at;
                    return (
                      <div key={d.id} className={`${s.item} ${un ? s.unread : ''} ${expanded === d.id ? s.open : ''}`}>
                        <button type="button" className={s.itemBtn} onClick={() => openItem(d)} aria-expanded={expanded === d.id} data-tip="">
                          <span className={s.dot} aria-label={un ? 'خوانده‌نشده' : undefined} />
                          <span className={s.itemMain}>
                            <span className={s.itemTop}><span className={s.itemTitle}>{d.title || TOPIC[d.topic] || 'اعلان'}</span><span className={s.itemTime}>{ago(at)}</span></span>
                            <span className={s.itemBody}>{d.body}</span>
                            <span className={s.tags}><span className={s.tag}>{TOPIC[d.topic] ?? d.topic}</span>{d.priority !== 'NORMAL' ? <span className={`${s.tag} ${s[`t_${p.tone}`] ?? ''}`}>{p.label}</span> : null}</span>
                          </span>
                        </button>
                        <button type="button" className={s.dismiss} onClick={() => void act(() => dismiss([d.id]))} aria-label="بستن اعلان" data-tip="بستن اعلان"><IconX size={15} /></button>
                      </div>
                    );
                  })}
          </div>
        </div>
      ) : null}
      {prefs ? <PrefsModal onClose={() => setPrefs(false)} /> : null}
    </div>
  );
}

type Row = { topic: string; in_app_enabled: boolean; sms_enabled: boolean };
export function PrefsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = usePreferences(true);
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const base: Row[] = Object.keys(TOPIC).map((t) => {
    const p = q.data?.find((x) => x.topic === t);
    return { topic: t, in_app_enabled: p?.in_app_enabled ?? true, sms_enabled: p?.sms_enabled ?? false };
  });
  const rows = base.map((r) => draft[r.topic] ?? r);
  const changed = Object.values(draft).filter((d) => { const b = base.find((x) => x.topic === d.topic)!; return b.in_app_enabled !== d.in_app_enabled || b.sms_enabled !== d.sms_enabled; });
  const set = (r: Row, k: 'in_app_enabled' | 'sms_enabled', v: boolean) => setDraft((d) => ({ ...d, [r.topic]: { ...r, [k]: v } }));
  const cols: Column<Row>[] = [
    { key: 't', header: 'موضوع', render: (r) => <strong>{TOPIC[r.topic] ?? r.topic}</strong> },
    { key: 'app', header: 'اعلان در پنل', render: (r) => <Toggle checked={r.in_app_enabled} onChange={(v) => set(r, 'in_app_enabled', v)} label={r.in_app_enabled ? 'روشن' : 'خاموش'} /> },
    { key: 'sms', header: 'پیامک', render: (r) => <Toggle checked={r.sms_enabled} onChange={(v) => set(r, 'sms_enabled', v)} label={r.sms_enabled ? 'روشن' : 'خاموش'} /> },
  ];
  const save = async () => {
    setBusy(true);
    try {
      await savePreferences(changed.map((d) => ({ topic: d.topic as never, in_app_enabled: d.in_app_enabled, sms_enabled: d.sms_enabled })));
      toast('تنظیمات اعلان ذخیره شد.');
      await qc.invalidateQueries({ queryKey: [...INBOX_KEY, 'prefs'] });
      setDraft({});
      onClose();
    } catch (e) { toast(userMessage(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="تنظیمات اعلان‌ها" width={560}
      footer={<><Button onClick={save} loading={busy} disabled={!changed.length}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <p className={s.prefsLead}>برای هر موضوع تعیین کنید اعلان در پنل نمایش داده شود و پیامک هم فرستاده شود یا نه.</p>
      <DataTable columns={cols} rows={q.isLoading ? undefined : rows} rowKey={(r) => r.topic} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} />
    </Modal>
  );
}
