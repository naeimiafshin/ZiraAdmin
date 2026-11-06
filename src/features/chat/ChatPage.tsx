import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { IconAlertCircle, IconCheck, IconChecks, IconClock, IconEye, IconMessagePlus, IconMessages, IconRefresh, IconSearch, IconSend } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/useAuth';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum, faTime, fullName } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Card, Empty, InfoBanner, Modal, Pagination, Segmented, SkeletonRows } from '@/shared/ui/kit';
import { searchKey, TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useAllStaff, type StaffUser } from '@/features/users/api';
import {
  CHAT_KEY, POLL, fetchInspection, fetchMessages, markRead, openDirect, sendMessage, useChatSummary, useContacts, useConversations,
  type ChatMessage, type Contact, type Conversation,
} from './api';
import s from './chat.module.css';

type Tab = 'mine' | 'supervision';
/** پیام در صفحه: پیام سرور، یا پیام در حال ارسال/ناموفق (ارسال امن با client_message_id) */
type Msg = ChatMessage & { local?: 'pending' | 'failed' };

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
const dayKey = (iso: string) => new Date(iso).toDateString();
const dayFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' });
function dayLabel(iso: string): string {
  const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'امروز';
  if (d.toDateString() === y.toDateString()) return 'دیروز';
  return dayFmt.format(d);
}
/** زمان کوتاه در فهرست: امروز ⇐ ساعت، وگرنه روز */
const listTime = (iso?: string | null) => (!iso ? '' : new Date(iso).toDateString() === new Date().toDateString() ? faTime(iso) : dayLabel(iso));

/** گفت‌وگوهای خصوصی (دامنه‌ی chat): گفت‌وگوی متنی دونفره‌ی پرسنل + نظارت سوپر ادمین. طرح html ندارد؛ هم‌خوان با بقیه‌ی پنل. */
export default function ChatPage() {
  const can = usePerm();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const canSupervise = !!user && user.user_type === 'SUPERADMIN' && can('chat.supervision.read');
  const tab: Tab = params.get('tab') === 'supervision' && canSupervise ? 'supervision' : 'mine';
  const summary = useChatSummary(can('chat.conversations.read'));
  const unread = summary.data?.unread_messages ?? 0;
  return (
    <>
      <div className={s.head}>
        <h2 className={s.title}>گفت‌وگوهای خصوصی</h2>
        {canSupervise ? (
          <Segmented value={tab} onChange={(v) => setParams(v === 'mine' ? {} : { tab: v }, { replace: true })}
            options={[{ value: 'mine', label: unread ? `گفت‌وگوهای من (${faNum(unread)})` : 'گفت‌وگوهای من' }, { value: 'supervision', label: 'نظارت بر گفت‌وگوها' }]} />
        ) : null}
      </div>
      {tab === 'mine' ? <Inbox /> : <Supervision />}
    </>
  );
}

/* ───────────── گفت‌وگوهای من ───────────── */
function Inbox() {
  const can = usePerm();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const list = useConversations(dq);
  const [picking, setPicking] = useState(false);
  const [opened, setOpened] = useState<Conversation | null>(null);
  const items = list.data?.results ?? [];
  const active = items.find((c) => c.id === activeId) ?? (opened?.id === activeId ? opened : null);
  const select = (id: string) => setParams({ c: id }, { replace: true });

  const start = async (c: Contact) => {
    try {
      const conv = await openDirect(c.user_id);
      setOpened(conv);
      setPicking(false);
      select(conv.id);
      await qc.invalidateQueries({ queryKey: [...CHAT_KEY, 'conversations'] });
    } catch (e) {
      toast(userMessage(e), 'error');
    }
  };

  return (
    <Card pad={false} className={s.shell}>
      <aside className={s.side}>
        <div className={s.sideHead}>
          <label className={s.search}>
            <IconSearch size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو: نام همکار یا متن پیام" aria-label="جست‌وجوی گفت‌وگو" />
          </label>
          {can('chat.conversations.create') && can('chat.contacts.list') ? (
            <Button icon={<IconMessagePlus size={17} />} onClick={() => setPicking(true)} aria-label="گفت‌وگوی جدید" data-tip="گفت‌وگوی جدید" className={s.newBtn} />
          ) : null}
        </div>
        <div className={s.list} role="list" aria-label="گفت‌وگوها">
          {list.isLoading ? <div className={s.pad}><SkeletonRows rows={6} height={58} /></div>
            : items.length === 0 ? <Empty icon={<IconMessages size={28} stroke={1.4} />} title={dq ? 'گفت‌وگویی پیدا نشد' : 'هنوز گفت‌وگویی ندارید'} text={dq ? undefined : 'با «گفت‌وگوی جدید» یک همکار را انتخاب کنید.'} />
              : items.map((c) => (
                <button key={c.id} type="button" role="listitem" className={`${s.item} ${c.id === activeId ? s.itemOn : ''}`} onClick={() => select(c.id)} data-tip="">
                  <span className={s.itemTop}>
                    <span className={s.itemName}>{c.peer.display_name}</span>
                    <span className={s.itemTime}>{listTime(c.last_message_at)}</span>
                  </span>
                  <span className={s.itemBottom}>
                    <span className={s.itemPreview}>{c.last_message ? c.last_message.body : <i>بدون پیام</i>}</span>
                    {c.unread_count ? <span className={s.unread}>{faNum(c.unread_count)}</span> : null}
                  </span>
                </button>
              ))}
        </div>
      </aside>
      <section className={s.main}>
        {active ? <Thread key={active.id} conv={active} /> : (
          <div className={s.blank}>
            <span className={s.blankIcon}><IconMessages size={34} stroke={1.4} /></span>
            <div className={s.blankTitle}>یک گفت‌وگو را انتخاب کنید</div>
            <div className={s.blankText}>گفت‌وگوها متنی و دونفره‌اند و بین همه‌ی شعب مشترک‌اند.</div>
          </div>
        )}
      </section>
      {picking ? <ContactPicker onClose={() => setPicking(false)} onPick={start} /> : null}
    </Card>
  );
}

/** پنجره‌ی پیام‌ها: تاریخچه‌ی صفحه‌بندی‌شده، polling هر ۵ ثانیه، ارسال امن، رسید خواندن. */
function Thread({ conv }: { conv: Conversation }) {
  const { user } = useAuth();
  const can = usePerm();
  const qc = useQueryClient();
  const me = user?.id;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [peerRead, setPeerRead] = useState(conv.peer_last_read_sequence);
  const [ownRead, setOwnRead] = useState(conv.own_last_read_sequence);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const keepFrom = useRef<number | null>(null);

  const server = msgs.filter((m) => !m.local);
  const maxSeq = server.length ? server[server.length - 1]!.sequence : 0;
  const minSeq = server.length ? server[0]!.sequence : 0;

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMsgs((cur) => {
      const byClient = new Map(incoming.map((m) => [m.client_message_id, m]));
      const kept = cur.filter((m) => !byClient.has(m.client_message_id) || !m.local).filter((m) => !incoming.some((x) => x.id === m.id));
      const all: Msg[] = [...kept, ...incoming];
      const srv = all.filter((m) => !m.local).sort((a, b) => a.sequence - b.sequence);
      return [...srv, ...all.filter((m) => m.local)];
    });
  }, []);

  // بار اول
  useEffect(() => {
    const ctl = new AbortController();
    fetchMessages(conv.id, { page_size: 40 }, ctl.signal).then((p) => {
      merge([...p.results].reverse());
      setHasMore(p.total > p.results.length);
      setPeerRead(p.peer_last_read_sequence); setOwnRead(p.own_last_read_sequence);
      setLoading(false);
    }).catch((e) => { if (!ctl.signal.aborted) { setError(e); setLoading(false); } });
    return () => ctl.abort();
  }, [conv.id, merge]);

  // polling پیام‌های تازه (به ترتیب صعودی)
  useEffect(() => {
    if (loading || error) return;
    const t = setInterval(() => {
      fetchMessages(conv.id, { after_sequence: maxSeq, page_size: 50 }).then((p) => {
        if (p.results.length) merge(p.results);
        setPeerRead(p.peer_last_read_sequence);
      }).catch(() => undefined);
    }, POLL.messages);
    return () => clearInterval(t);
  }, [conv.id, maxSeq, loading, error, merge]);

  // رسید خواندن: آخرین پیام طرف مقابل که هنوز خوانده نشده
  useEffect(() => {
    const lastPeer = [...server].reverse().find((m) => m.sender_id !== me);
    if (!lastPeer || lastPeer.sequence <= ownRead || !can('chat.conversations.update') || document.hidden) return;
    markRead(conv.id, lastPeer.id).then((r) => {
      setOwnRead(r.last_read_sequence); setPeerRead(r.peer_last_read_sequence);
      qc.invalidateQueries({ queryKey: [...CHAT_KEY, 'conversations'] });
      qc.invalidateQueries({ queryKey: [...CHAT_KEY, 'summary'] });
    }).catch(() => undefined);
  }, [maxSeq, ownRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // اسکرول: پایین بماند؛ هنگام بارگذاری قدیمی‌ترها جای فعلی حفظ شود
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    if (keepFrom.current !== null) { el.scrollTop = el.scrollHeight - keepFrom.current; keepFrom.current = null; return; }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const loadOlder = async () => {
    if (older || !hasMore || !minSeq) return;
    setOlder(true);
    try {
      const p = await fetchMessages(conv.id, { before_sequence: minSeq, page_size: 40 });
      keepFrom.current = box.current ? box.current.scrollHeight - box.current.scrollTop : null;
      merge([...p.results].reverse());
      setHasMore(p.results.length > 0 && p.results[p.results.length - 1]!.sequence > 1);
    } catch { /* دکمه دوباره امتحان می‌شود */ } finally { setOlder(false); }
  };

  const deliver = async (m: Msg) => {
    setMsgs((cur) => cur.map((x) => (x.client_message_id === m.client_message_id ? { ...x, local: 'pending' } : x)));
    try {
      const saved = await sendMessage(conv.id, m.body, m.client_message_id);
      merge([saved]);
      qc.invalidateQueries({ queryKey: [...CHAT_KEY, 'conversations'] });
    } catch {
      setMsgs((cur) => cur.map((x) => (x.client_message_id === m.client_message_id ? { ...x, local: 'failed' } : x)));
    }
  };
  const send = () => {
    const body = text.trim();
    if (!body || !me) return;
    const m: Msg = { id: `local-${uuid()}`, conversation_id: conv.id, sequence: Number.MAX_SAFE_INTEGER, sender_id: me, body, client_message_id: uuid(), sent_at: new Date().toISOString(), local: 'pending' };
    setMsgs((cur) => [...cur, m]);
    setText('');
    stick.current = true;
    void deliver(m);
  };

  const canSend = conv.can_send && can('chat.conversations.messages.create');
  return (
    <>
      <header className={s.threadHead}>
        <div>
          <div className={s.threadName}>{conv.peer.display_name}</div>
          <div className={s.threadSub}>{conv.last_message_at ? `آخرین پیام: ${dayLabel(conv.last_message_at)} ${faTime(conv.last_message_at)}` : 'گفت‌وگوی تازه'}</div>
        </div>
      </header>
      <div className={s.messages} ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {loading ? <SkeletonRows rows={5} height={44} /> : error ? <InfoBanner tone="warning">{userMessage(error)}</InfoBanner> : (
          <>
            {hasMore ? <div className={s.moreRow}><Button variant="secondary" size="sm" loading={older} onClick={loadOlder}>پیام‌های قدیمی‌تر</Button></div> : null}
            {msgs.length === 0 ? <div className={s.emptyThread}>هنوز پیامی رد و بدل نشده است. اولین پیام را بفرستید.</div> : null}
            <Bubbles msgs={msgs} isMine={(m) => m.sender_id === me}
              status={(m) => (m.local === 'pending' ? 'pending' : m.local === 'failed' ? 'failed' : m.sender_id !== me ? null : m.sequence <= peerRead ? 'read' : 'sent')}
              onRetry={(m) => void deliver(m)} />
          </>
        )}
      </div>
      {canSend ? (
        <footer className={s.composer}>
          <textarea className={s.input} value={text} rows={1} placeholder="پیام خود را بنویسید… (Enter ارسال، Shift+Enter خط تازه)" aria-label="متن پیام"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <Button icon={<IconSend size={17} />} onClick={send} disabled={!text.trim()}>ارسال</Button>
        </footer>
      ) : <div className={s.readonly}>امکان ارسال پیام در این گفت‌وگو برای شما وجود ندارد.</div>}
    </>
  );
}

/** حباب‌های پیام با جداکننده‌ی روز. پیام خودم سمت چپ (برند)، طرف مقابل سمت راست. */
function Bubbles({ msgs, isMine, status, onRetry, names }: {
  msgs: Msg[]; isMine: (m: Msg) => boolean; status?: (m: Msg) => 'pending' | 'failed' | 'read' | 'sent' | null; onRetry?: (m: Msg) => void;
  names?: (m: Msg) => string | null;
}) {
  const out: ReactNode[] = [];
  let day = '';
  msgs.forEach((m, i) => {
    const dk = dayKey(m.sent_at);
    if (dk !== day) { day = dk; out.push(<div key={`d-${dk}`} className={s.day}><span>{dayLabel(m.sent_at)}</span></div>); }
    const mine = isMine(m);
    const st = status?.(m) ?? null;
    const prev = msgs[i - 1];
    const grouped = prev && isMine(prev) === mine && dayKey(prev.sent_at) === dk;
    const nm = names?.(m);
    out.push(
      <div key={m.client_message_id || m.id} className={`${s.row} ${mine ? s.rowMine : ''} ${grouped ? s.grouped : ''}`}>
        <div className={`${s.bubble} ${mine ? s.mine : s.theirs} ${st === 'failed' ? s.failed : ''}`}>
          {nm && !grouped ? <div className={s.sender}>{nm}</div> : null}
          <div className={s.body}>{m.body}</div>
          <div className={s.meta}>
            <span>{faTime(m.sent_at)}</span>
            {st === 'pending' ? <IconClock size={13} aria-label="در حال ارسال" /> : st === 'read' ? <IconChecks size={14} aria-label="خوانده شد" className={s.readTick} /> : st === 'sent' ? <IconCheck size={14} aria-label="ارسال شد" /> : null}
          </div>
        </div>
        {st === 'failed' ? (
          <button type="button" className={s.retry} onClick={() => onRetry?.(m)} aria-label="ارسال دوباره"><IconAlertCircle size={15} /> ارسال نشد — دوباره <IconRefresh size={14} /></button>
        ) : null}
      </div>,
    );
  });
  return <>{out}</>;
}

/** انتخاب همکار (جدول انتخابی با جست‌وجو؛ RULES ۴-۷). فقط همکارانی که مجوز گفت‌وگو دارند. */
function ContactPicker({ onClose, onPick }: { onClose: () => void; onPick: (c: Contact) => void }) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const contacts = useContacts(dq, page, pageSize);
  const cols: Column<Contact>[] = [
    { key: 'i', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((page - 1) * pageSize + i + 1)}</span> },
    { key: 'name', header: 'نام همکار', render: (c) => <strong>{c.display_name}</strong> },
    { key: 'go', header: '', render: (c) => <Button size="sm" variant="danger" loading={busy === c.user_id} onClick={(e) => { e.stopPropagation(); setBusy(c.user_id); onPick(c); }}>شروع گفت‌وگو</Button> },
  ];
  return (
    <Modal open onClose={onClose} title="گفت‌وگوی جدید" width={620}>
      <TableFilters search={q} onSearch={setQ} placeholder="جست‌وجو: نام یا نام کاربری همکار" filters={[]} />
      <DataTable columns={cols} rows={contacts.data?.results} rowKey={(c) => c.user_id} onRowClick={(c) => { setBusy(c.user_id); onPick(c); }}
        loading={contacts.isLoading} error={contacts.error} onRetry={() => contacts.refetch()} empty={<Empty title={dq ? 'همکاری پیدا نشد' : 'همکاری برای گفت‌وگو نیست'} />} />
      {contacts.data && contacts.data.total > pageSize ? <Pagination page={page} pageSize={pageSize} total={contacts.data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} /> : null}
    </Modal>
  );
}

/* ───────────── نظارت سوپر ادمین ───────────── */
function Supervision() {
  const staff = useAllStaff();
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [shown, setShown] = useState<[string, string] | null>(null);
  return (
    <>
      <InfoBanner>مشاهده‌ی نظارتی فقط برای سوپر ادمین است: شما عضو گفت‌وگو نمی‌شوید و رسید خواندنِ طرفین تغییر نمی‌کند؛ هر مشاهده در لاگ ثبت می‌شود.</InfoBanner>
      <div className={s.pickGrid}>
        <PersonTable title="نفر اول" people={staff.data} loading={staff.isLoading} value={a} onChange={(v) => { setA(v); setShown(null); }} disabledId={b} />
        <PersonTable title="نفر دوم" people={staff.data} loading={staff.isLoading} value={b} onChange={(v) => { setB(v); setShown(null); }} disabledId={a} />
      </div>
      <div className={s.superBar}>
        <Button icon={<IconEye size={17} />} disabled={!a || !b} onClick={() => a && b && setShown([a, b])}>نمایش گفت‌وگو</Button>
      </div>
      {shown ? <Inspection key={shown.join('-')} a={shown[0]} b={shown[1]} /> : null}
    </>
  );
}

function PersonTable({ title, people, loading, value, onChange, disabledId }: {
  title: string; people: StaffUser[] | undefined; loading: boolean; value: string | null; onChange: (id: string) => void; disabledId: string | null;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    const t = searchKey(q.trim());
    return (people ?? []).filter((p) => p.id !== disabledId && (!t || searchKey(fullName(p), p.username, p.personnel_code).includes(t)));
  }, [people, q, disabledId]);
  const size = 5;
  const cols: Column<StaffUser>[] = [
    { key: 'code', header: 'کد پرسنلی', code: true, render: (p) => <span className="ltr">{p.personnel_code ?? '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (p) => <strong>{fullName(p)}</strong> },
    { key: 'user', header: 'نام کاربری', render: (p) => <span data-latin="">{p.username}</span> },
  ];
  return (
    <Card>
      <div className={s.pickTitle}>{title}{value ? <span className={s.pickVal}>{fullName(people?.find((p) => p.id === value) ?? {})}</span> : null}</div>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام، نام کاربری یا کد پرسنلی" filters={[]} />
      <DataTable columns={cols} rows={people ? rows.slice((page - 1) * size, page * size) : undefined} rowKey={(p) => p.id} loading={loading}
        onRowClick={(p) => onChange(p.id)} isSelected={(p) => p.id === value} empty={<Empty title="کاربری پیدا نشد" />} />
      {rows.length > size ? <Pagination page={page} pageSize={size} total={rows.length} onPage={setPage} sizes={[size]} onPageSize={() => undefined} /> : null}
    </Card>
  );
}

function Inspection({ a, b }: { a: string; b: string }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [meta, setMeta] = useState<{ low: { user_id: string; display_name: string }; high: { user_id: string; display_name: string }; snap: number } | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none' | 'error'>('loading');
  const [err, setErr] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [older, setOlder] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const keepFrom = useRef<number | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetchInspection(a, b, { page_size: 40 }, ctl.signal).then((p) => {
      setMsgs([...p.results].reverse());
      setMeta({ low: p.participant_low, high: p.participant_high, snap: p.snapshot_sequence });
      setHasMore(p.total > p.results.length);
      setState(p.results.length ? 'ok' : 'none');
    }).catch((e) => { if (ctl.signal.aborted) return; const st = (e as { status?: number }).status; if (st === 404) setState('none'); else { setErr(e); setState('error'); } });
    return () => ctl.abort();
  }, [a, b]);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    if (keepFrom.current !== null) { el.scrollTop = el.scrollHeight - keepFrom.current; keepFrom.current = null; } else el.scrollTop = el.scrollHeight;
  }, [msgs]);
  const loadOlder = async () => {
    if (!msgs.length) return;
    setOlder(true);
    try {
      const p = await fetchInspection(a, b, { before_sequence: msgs[0]!.sequence, page_size: 40 });
      keepFrom.current = box.current ? box.current.scrollHeight - box.current.scrollTop : null;
      setMsgs((cur) => [...[...p.results].reverse(), ...cur]);
      setHasMore(p.results.length > 0 && p.results[p.results.length - 1]!.sequence > 1);
    } finally { setOlder(false); }
  };
  const nameOf = (id: string) => (meta ? (meta.low.user_id === id ? meta.low.display_name : meta.high.display_name) : null);
  return (
    <Card pad={false} className={s.inspect}>
      <header className={s.threadHead}>
        <div>
          <div className={s.threadName}>{meta ? `${meta.low.display_name} و ${meta.high.display_name}` : 'گفت‌وگو'}</div>
          <div className={s.threadSub}>نمایش فقط‌خواندنی{meta ? ` · ${faNum(meta.snap)} پیام` : ''}</div>
        </div>
      </header>
      <div className={s.messages} ref={box}>
        {state === 'loading' ? <SkeletonRows rows={5} height={44} /> : state === 'error' ? <InfoBanner tone="warning">{userMessage(err)}</InfoBanner>
          : state === 'none' ? <div className={s.emptyThread}>این دو نفر با هم گفت‌وگویی ندارند.</div> : (
            <>
              {hasMore ? <div className={s.moreRow}><Button variant="secondary" size="sm" loading={older} onClick={loadOlder}>پیام‌های قدیمی‌تر</Button></div> : null}
              <Bubbles msgs={msgs} isMine={(m) => m.sender_id === a} names={(m) => nameOf(m.sender_id)} />
            </>
          )}
      </div>
    </Card>
  );
}
