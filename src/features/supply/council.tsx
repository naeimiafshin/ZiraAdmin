import { useState } from 'react';
import { IconHistory, IconPencil, IconPlus, IconUserMinus, IconUserCheck } from '@tabler/icons-react';
import { applyServerErrors } from '@/shared/api/formErrors';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { useDebounced } from '@/shared/lib/useDebounced';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Drawer } from '@/shared/ui/Drawer';
import { FormGrid, PickerField, Select } from '@/shared/ui/form';
import { Badge, Empty, InfoBanner, KeyValue, Modal, Pagination } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal } from '@/features/catalog/components';
import { useStaffList, type StaffUser } from '@/features/users/api';
import { USER_STATUS } from '@/features/users/labels';
import { useCouncilMembers, useCouncilTitleOptions, useCouncilWrite, useMemberVotes, type CouncilMember, type VoteHistory } from './api';
import { IconButton } from './components';
import { labelOf, MEMBER_STATUS, REQUEST_FINAL, toneOf, VOTE } from './labels';
import s from './supply.module.css';

/**
 * اعضای شورای تأمین — GET/POST/PATCH /supply/council/members.
 * مدیریت (افزودن، ویرایش عنوان، کنار گذاشتن، فعال کردن دوباره) فقط در تنظیمات «شورای تأمین»؛ صفحه‌ی شورای منوی خرید و تأمین
 * همین جدول را فقط‌خواندنی نشان می‌دهد (افشین 2026-10-31). عضو حذف نمی‌شود؛ «کنار گذاشتن» غیرفعالش می‌کند و سوابق رأی می‌ماند.
 */
const MEMBERS_PAGE_SIZE = 10;
const PICKER_PAGE_SIZE = 8;
const VOTES_PAGE_SIZE = 10;
const PICKER_WIDTH = 880;
const VOTES_WIDTH = 900;
const DEBOUNCE_MS = 300;
/** سقف page_size بک‌اند؛ برای علامت زدن اعضای فعال در جدول انتخاب کارمند */
const MAX_PAGE_SIZE = 100;
const STATUS_OPTIONS = [{ value: 'true', label: 'فعال' }, { value: 'false', label: 'کنار گذاشته' }];

const staffName = (u: Pick<StaffUser, 'first_name' | 'last_name' | 'username'>) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '—';

export function CouncilMembersTable({ readOnly = false }: { readOnly?: boolean }) {
  const can = usePerm();
  const toast = useToast();
  const w = useCouncilWrite();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(MEMBERS_PAGE_SIZE);
  const list = useCouncilMembers({ page, page_size: size, query: dq || undefined, is_active: status === '' ? undefined : status === 'true' });
  const [drawer, setDrawer] = useState<CouncilMember | 'new' | null>(null);
  const [removing, setRemoving] = useState<CouncilMember | null>(null);
  const [history, setHistory] = useState<CouncilMember | null>(null);
  const canAdd = !readOnly && can('supply.supply_council.create');
  const canEdit = !readOnly && can('supply.supply_council.update');
  const canHistory = can('supply.supply_council.read');
  const active = !!dq || !!status;

  const reactivate = async (m: CouncilMember) => {
    try { await w.update.mutateAsync({ id: m.id, body: { is_active: true } }); toast(`«${m.full_name}» دوباره عضو فعال شورا شد.`); } catch (e) { toast(userMessage(e), 'error'); }
  };

  const cols: Column<CouncilMember>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((page - 1) * size + i + 1)}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (m) => <span className={s.strong}>{m.full_name || '—'}</span> },
    { key: 'code', header: 'کد پرسنلی', code: true, render: (m) => (m.personnel_code ? <span className="ltr">{m.personnel_code}</span> : '—') },
    { key: 'phone', header: 'شماره تماس', render: (m) => (m.phone_number ? <span className="ltr tnum">{m.phone_number}</span> : <span className={s.muted}>—</span>) },
    { key: 'title', header: 'عنوان در شورا', render: (m) => (m.title ? <>{m.title}{m.title_is_archived ? <span className={s.muted}> (آرشیوشده)</span> : null}</> : <span className={s.muted}>—</span>) },
    { key: 'votes', header: 'سوابق رأی', render: (m) => (canHistory
      ? <button type="button" className={s.linkBtn} onClick={(e) => { e.stopPropagation(); setHistory(m); }}>{faNum(m.vote_count)} رأی</button>
      : <span className="tnum">{faNum(m.vote_count)}</span>) },
    { key: 'status', header: 'وضعیت', render: (m) => { const st = MEMBER_STATUS[m.is_active ? 'active' : 'inactive']; return <Badge tone={st.tone}>{st.label}</Badge>; } },
    { key: 'since', header: 'عضویت از', render: (m) => <span className={s.muted}>{faDate(m.created_at)}</span> },
  ];
  if (canEdit || canHistory) {
    cols.push({
      key: 'acts', header: 'عملیات',
      render: (m) => (
        <span className={s.rowActions}>
          {canHistory ? <IconButton label={`سوابق رأی ${m.full_name}`} onClick={() => setHistory(m)}><IconHistory size={16} /></IconButton> : null}
          {canEdit ? <IconButton label={`ویرایش عنوان ${m.full_name}`} onClick={() => setDrawer(m)}><IconPencil size={16} /></IconButton> : null}
          {canEdit && m.is_active ? <IconButton label={`کنار گذاشتن ${m.full_name}`} danger onClick={() => setRemoving(m)}><IconUserMinus size={16} /></IconButton> : null}
          {canEdit && !m.is_active ? <IconButton label={`فعال کردن دوباره‌ی ${m.full_name}`} onClick={() => reactivate(m)}><IconUserCheck size={16} /></IconButton> : null}
        </span>
      ),
    });
  }

  return (
    <>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام یا عنوان"
        filters={[{ key: 'status', label: 'وضعیت', value: status, onChange: (v) => { setStatus(v); setPage(1); }, options: STATUS_OPTIONS }]}
        onReset={() => { setQ(''); setStatus(''); setPage(1); }}
        extra={canAdd ? <Button icon={<IconPlus size={17} />} onClick={() => setDrawer('new')}>افزودن عضو</Button> : null}
        count={list.data ? `${faNum(list.data.total)} عضو` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(m) => m.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={active ? 'عضوی با این جست‌وجو و فیلتر پیدا نشد' : 'هنوز عضوی برای شورای تأمین تعیین نشده است'}
          text={active || readOnly ? undefined : 'فقط عضو فعال شورا می‌تواند به درخواست‌های تأمین رأی بدهد؛ با «افزودن عضو» از میان کارکنان انتخاب کنید.'} />} />
      {list.data && list.data.total > 0 ? <Pagination page={page} pageSize={size} total={list.data.total} onPage={setPage} onPageSize={(n) => { setSize(n); setPage(1); }} /> : null}

      {drawer ? <MemberDrawer member={drawer === 'new' ? null : drawer} onClose={() => setDrawer(null)} /> : null}
      {removing ? (
        <ConfirmModal title="کنار گذاشتن عضو شورا" confirmLabel="کنار گذاشتن" danger onClose={() => setRemoving(null)}
          text={<><b>{removing.full_name}</b> از شورای تأمین کنار گذاشته می‌شود و دیگر نمی‌تواند به درخواست‌های تأمین رأی بدهد. سوابق رأی او می‌ماند و بعداً می‌توانید دوباره فعالش کنید.</>}
          onConfirm={async () => { await w.remove.mutateAsync(removing.id); toast(`«${removing.full_name}» از شورای تأمین کنار گذاشته شد.`); }} />
      ) : null}
      {history ? <VoteHistoryModal member={history} onClose={() => setHistory(null)} /> : null}
    </>
  );
}

/** کشوی افزودن عضو (انتخاب کارمند + عنوان) یا ویرایش عنوان عضو موجود */
function MemberDrawer({ member, onClose }: { member: CouncilMember | null; onClose: () => void }) {
  const w = useCouncilWrite();
  const toast = useToast();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [title, setTitle] = useState<string>(member?.title_code ?? '');
  const [picking, setPicking] = useState(false);
  const [errs, setErrs] = useState<{ user?: string; title?: string }>({});
  const [top, setTop] = useState<string | null>(null);
  const busy = w.add.isPending || w.update.isPending;
  const opts = useCouncilTitleOptions();
  // عنوان آرشیوشده‌ی فعلی عضو در گزینه‌ها می‌ماند (بک‌اند نگهش می‌دارد) ولی برای انتخاب تازه نمی‌آید
  const titleOptions = [
    ...(opts.data ?? []).map((t) => ({ value: t.code, label: t.name })),
    ...(member?.title_code && member.title_is_archived ? [{ value: member.title_code, label: `${member.title} (آرشیوشده)` }] : []),
  ];
  const nameOf = (code: string) => titleOptions.find((o) => o.value === code)?.label ?? code;

  const submit = async () => {
    const e: typeof errs = {};
    if (!member && !user) e.user = 'کارمند را انتخاب کنید.';
    if (!title) e.title = 'عنوان در شورا را انتخاب کنید.';
    setErrs(e); setTop(null);
    if (Object.keys(e).length) return;
    try {
      if (member) {
        if (title === member.title_code) { onClose(); return; }
        await w.update.mutateAsync({ id: member.id, body: { title_code: title } });
        toast(`عنوان «${member.full_name}» به «${nameOf(title)}» تغییر کرد.`);
      } else if (user) {
        const m = await w.add.mutateAsync({ user_id: user.id, title_code: title });
        toast(`«${m.full_name || staffName(user)}» با عنوان «${m.title || nameOf(title)}» به شورای تأمین افزوده شد.`);
      }
      onClose();
    } catch (ex) {
      setTop(applyServerErrors(ex, () => undefined, []).join(' '));
    }
  };

  return (
    <Drawer open onClose={onClose} busy={busy} title={member ? 'ویرایش عنوان عضو شورا' : 'افزودن عضو شورای تأمین'}
      sub={member ? 'کاربر عضو قابل تغییر نیست؛ فقط عنوان او در شورا عوض می‌شود.' : 'عضو از میان کارکنان انتخاب می‌شود؛ نام و تلفن از پرونده‌ی کاربر خوانده می‌شود.'}
      footer={<>
        <Button onClick={submit} loading={busy} loadingText="در حال ذخیره…">{member ? 'ذخیره‌ی عنوان' : 'افزودن به شورا'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>انصراف</Button>
      </>}>
      {top ? <div className={s.formErr}><Alert>{top}</Alert></div> : null}
      <FormGrid cols={1}>
        {member ? (
          <div className={s.kvGrid}>
            <KeyValue label="نام و نام خانوادگی">{member.full_name}</KeyValue>
            <KeyValue label="کد پرسنلی" ltr>{member.personnel_code ?? ''}</KeyValue>
          </div>
        ) : (
          <PickerField label="کارمند" required value={user ? `${staffName(user)}${user.personnel_code ? ` — ${user.personnel_code}` : ''}` : null}
            placeholder="انتخاب از فهرست کارکنان" onOpen={() => setPicking(true)} onClear={() => setUser(null)} error={errs.user} />
        )}
        <Select label="عنوان در شورا" required value={title} onChange={(e) => { setTitle(e.target.value); setErrs((x) => ({ ...x, title: undefined })); }}
          placeholder={opts.isLoading ? 'در حال دریافت…' : 'انتخاب عنوان'} options={titleOptions} error={errs.title}
          hint={opts.data && !opts.data.length ? 'هیچ عنوان فعالی نیست؛ اول در کارت «عنوان‌های شورا» عنوان تعریف کنید.' : 'عنوان‌ها در کارت «عنوان‌های شورا» همین صفحه تعریف می‌شوند.'} />
      </FormGrid>
      {!member ? <div className={s.formNote}><InfoBanner>هر کارمند فقط یک بار عضو شورا می‌شود. افزودن کارمندی که قبلاً کنار گذاشته شده، او را دوباره فعال می‌کند.</InfoBanner></div> : null}
      <StaffPickerModal open={picking} onClose={() => setPicking(false)} onPick={(u) => { setUser(u); setErrs((x) => ({ ...x, user: undefined })); setPicking(false); }} />
    </Drawer>
  );
}

/** جدول انتخابی کارکنان (قانون جدول انتخابی) — GET /auth/staff؛ مجوز فهرست کاربران لازم است */
function StaffPickerModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (u: StaffUser) => void }) {
  const can = usePerm();
  const allowed = can('identity.users.list');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const list = useStaffList({ page, page_size: PICKER_PAGE_SIZE, query: dq || undefined });
  const members = useCouncilMembers({ page: 1, page_size: MAX_PAGE_SIZE, is_active: true }, open);
  const memberIds = new Set((members.data?.results ?? []).map((m) => m.user_id));
  const cols: Column<StaffUser>[] = [
    { key: 'code', header: 'کد پرسنلی', code: true, render: (u) => <span className="ltr">{u.personnel_code || '—'}</span> },
    { key: 'name', header: 'نام و نام خانوادگی', render: (u) => <b>{staffName(u)}</b> },
    { key: 'phone', header: 'موبایل', render: (u) => <span className="ltr tnum">{u.phone_number}</span> },
    { key: 'job', header: 'عنوان شغلی', render: (u) => u.job_title || <span className={s.muted}>—</span> },
    { key: 'status', header: 'وضعیت کاربر', render: (u) => <Badge tone={USER_STATUS[u.status]?.tone ?? 'neutral'}>{USER_STATUS[u.status]?.label ?? u.status}</Badge> },
    { key: 'pick', header: '', render: (u) => (memberIds.has(u.id)
      ? <span className={s.muted}>عضو فعال شورا</span>
      : <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onPick(u); }}>انتخاب</Button>) },
  ];
  return (
    <Modal open={open} onClose={onClose} title="انتخاب کارمند برای شورای تأمین" width={PICKER_WIDTH}>
      {!allowed ? <Empty title="فهرست کارکنان برای حساب شما در دسترس نیست" text="برای انتخاب عضو شورا به مجوز «فهرست کاربران» نیاز است." /> : (
        <>
          <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: نام، نام کاربری، موبایل یا کد پرسنلی" count={list.data ? `${faNum(list.data.total)} کارمند` : undefined} />
          <DataTable columns={cols} rows={list.data?.results} rowKey={(u) => u.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
            onRowClick={(u) => { if (!memberIds.has(u.id)) onPick(u); }} empty={<Empty title="کارمندی با این جست‌وجو پیدا نشد" />} />
          {list.data && list.data.total > PICKER_PAGE_SIZE ? <Pagination page={page} pageSize={PICKER_PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}
        </>
      )}
    </Modal>
  );
}

/** سوابق رأی یک عضو (html: «سوابق رای — نام») */
export function VoteHistoryModal({ member, onClose }: { member: CouncilMember; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const list = useMemberVotes(member.id, { page, page_size: VOTES_PAGE_SIZE, query: dq || undefined });
  const cols: Column<VoteHistory>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((page - 1) * VOTES_PAGE_SIZE + i + 1)}</span> },
    { key: 'no', header: 'شماره درخواست تأمین', code: true, render: (v) => <span data-latin>{v.request_no}</span> },
    { key: 'by', header: 'سفارش‌دهنده', render: (v) => v.requester?.full_name ?? '—' },
    { key: 'vote', header: 'رأی', render: (v) => <Badge tone={toneOf(VOTE, v.vote)}>{labelOf(VOTE, v.vote, v.vote_display)}</Badge> },
    { key: 'reason', header: 'توضیح', render: (v) => v.reason || <span className={s.muted}>—</span> },
    { key: 'final', header: 'وضعیت نهایی', render: (v) => <Badge tone={toneOf(REQUEST_FINAL, v.final_status)}>{labelOf(REQUEST_FINAL, v.final_status, v.final_status_display)}</Badge> },
    { key: 'at', header: 'زمان رأی', render: (v) => <span className={s.muted}>{faDateTime(v.voted_at)}</span> },
  ];
  return (
    <Modal open onClose={onClose} width={VOTES_WIDTH} title={`سوابق رأی — ${member.full_name}`}>
      <p className={s.modalIntro}>{member.title ? `${member.title} · ` : ''}{faNum(member.vote_count)} رأی ثبت‌شده</p>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: شماره درخواست تأمین" />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(v) => `${v.request_id}`} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={dq ? 'رأیی با این جست‌وجو پیدا نشد' : 'این عضو هنوز رأیی ثبت نکرده است'} />} />
      {list.data && list.data.total > VOTES_PAGE_SIZE ? <Pagination page={page} pageSize={VOTES_PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}
    </Modal>
  );
}
