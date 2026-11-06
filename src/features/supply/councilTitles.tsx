import { useState } from 'react';
import { IconArchive, IconPencil, IconPlus, IconRestore } from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { applyServerErrors } from '@/shared/api/formErrors';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useDebounced } from '@/shared/lib/useDebounced';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Drawer } from '@/shared/ui/Drawer';
import { FormGrid, Input } from '@/shared/ui/form';
import { Badge, Empty, Pagination } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal } from '@/features/catalog/components';
import { useCouncilTitles, useCouncilTitleWrite, type CouncilTitle } from './api';
import { IconButton } from './components';
import { TITLE_STATUS } from './labels';
import s from './supply.module.css';

/**
 * عنوان‌های شورای تأمین — /settings/council-titles (بک‌اند 2026-10-31؛ کمبود S-10 رفع شد). کارت صفحه‌ی تنظیمات «شورای تأمین».
 * کد CT-… را سیستم می‌سازد؛ نام یکتا (≤۸۰). حذف واقعی ندارد: «آرشیو» (عنوان آرشیوشده برای عضو تازه انتخاب نمی‌شود،
 * ولی عضوی که دارد نگهش می‌دارد) و «بازگردانی». جست‌وجو (کد، نام) + فیلتر وضعیت؛ هر دو سمت سرور.
 */
const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;
const NAME_MAX = 80;
const SORT_MAX = 32767;
const DRAWER_WIDTH = 480;
const STATUS_OPTIONS = [{ value: 'false', label: 'فعال' }, { value: 'true', label: 'آرشیوشده' }];

export function CouncilTitlesTable() {
  const can = usePerm();
  const toast = useToast();
  const w = useCouncilTitleWrite();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useCouncilTitles({ page, page_size: PAGE_SIZE, query: dq || undefined, is_archived: status === '' ? undefined : status === 'true' });
  const [editing, setEditing] = useState<CouncilTitle | 'new' | null>(null);
  const [archiving, setArchiving] = useState<CouncilTitle | null>(null);
  const canCreate = can('settings.council_titles.create');
  const canUpdate = can('settings.council_titles.update');
  const canArchive = can('settings.council_titles.delete');
  const active = !!dq || !!status;

  const restore = async (t: CouncilTitle) => {
    try { await w.restore.mutateAsync(t.id); toast(`عنوان «${t.name}» بازگردانی شد.`); } catch (e) { toast(userMessage(e), 'error'); }
  };

  const cols: Column<CouncilTitle>[] = [
    { key: 'order', header: 'ترتیب', render: (t) => <span className="tnum">{faNum(t.sort_order)}</span> },
    { key: 'code', header: 'کد', code: true, render: (t) => <span data-latin>{t.code}</span> },
    { key: 'name', header: 'نام عنوان', render: (t) => <span className={s.strong}>{t.name}</span> },
    { key: 'members', header: 'اعضا', render: (t) => <span className="tnum">{faNum(t.member_count)}</span> },
    { key: 'status', header: 'وضعیت', render: (t) => { const st = TITLE_STATUS[t.is_archived ? 'archived' : 'active']; return <Badge tone={st.tone}>{st.label}</Badge>; } },
    { key: 'updated', header: 'آخرین تغییر', render: (t) => <span className={s.muted}>{faDate(t.updated_at)}</span> },
  ];
  if (canUpdate || canArchive) {
    cols.push({
      key: 'acts', header: 'عملیات',
      render: (t) => (
        <span className={s.rowActions}>
          {canUpdate ? <IconButton label={`ویرایش عنوان ${t.name}`} onClick={() => setEditing(t)}><IconPencil size={16} /></IconButton> : null}
          {canArchive && !t.is_archived ? <IconButton label={`آرشیو عنوان ${t.name}`} danger onClick={() => setArchiving(t)}><IconArchive size={16} /></IconButton> : null}
          {canUpdate && t.is_archived ? <IconButton label={`بازگردانی عنوان ${t.name}`} onClick={() => restore(t)}><IconRestore size={16} /></IconButton> : null}
        </span>
      ),
    });
  }

  return (
    <>
      <TableFilters search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجو: کد یا نام عنوان"
        filters={[{ key: 'archived', label: 'وضعیت', value: status, onChange: (v) => { setStatus(v); setPage(1); }, options: STATUS_OPTIONS }]}
        onReset={() => { setQ(''); setStatus(''); setPage(1); }}
        extra={canCreate ? <Button icon={<IconPlus size={17} />} onClick={() => setEditing('new')}>عنوان جدید</Button> : null}
        count={list.data ? `${faNum(list.data.total)} عنوان` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(t) => t.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={active ? 'عنوانی با این جست‌وجو و فیلتر پیدا نشد' : 'هنوز عنوانی تعریف نشده است'} />} />
      {list.data && list.data.total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}
      {editing ? <TitleDrawer title={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {archiving ? (
        <ConfirmModal title="آرشیو عنوان شورا" confirmLabel="آرشیو کن" danger onClose={() => setArchiving(null)}
          text={<>عنوان <b>{archiving.name}</b> آرشیو می‌شود و برای عضو تازه یا تغییر عنوان انتخاب نمی‌شود.{archiving.member_count ? <> {faNum(archiving.member_count)} عضوی که این عنوان را دارند آن را نگه می‌دارند.</> : null} بعداً می‌توانید آن را بازگردانی کنید.</>}
          onConfirm={async () => { await w.archive.mutateAsync(archiving.id); toast(`عنوان «${archiving.name}» آرشیو شد.`); }} />
      ) : null}
    </>
  );
}

/** کشوی ثبت/ویرایش عنوان: نام (الزامی، یکتا) + ترتیب نمایش */
function TitleDrawer({ title, onClose }: { title: CouncilTitle | null; onClose: () => void }) {
  const w = useCouncilTitleWrite();
  const toast = useToast();
  const [name, setName] = useState(title?.name ?? '');
  const [order, setOrder] = useState(toFaDigits(title?.sort_order ?? 0));
  const [errs, setErrs] = useState<{ name?: string; sort_order?: string }>({});
  const [top, setTop] = useState<string | null>(null);
  const busy = w.create.isPending || w.update.isPending;

  const submit = async () => {
    const n = name.trim();
    const o = Number(toLatinDigits(order).trim() || '0');
    const e: typeof errs = {};
    if (!n) e.name = 'نام عنوان را وارد کنید.';
    if (!Number.isInteger(o) || o < 0 || o > SORT_MAX) e.sort_order = `ترتیب باید عدد صحیح بین ۰ تا ${toFaDigits(SORT_MAX)} باشد.`;
    setErrs(e); setTop(null);
    if (Object.keys(e).length) return;
    try {
      if (title) {
        const body: { name?: string; sort_order?: number } = {};
        if (n !== title.name) body.name = n;
        if (o !== title.sort_order) body.sort_order = o;
        if (!Object.keys(body).length) { onClose(); return; }
        await w.update.mutateAsync({ id: title.id, body });
        toast(`عنوان «${n}» ویرایش شد.`);
      } else {
        const t = await w.create.mutateAsync({ name: n, sort_order: o });
        toast(`عنوان «${t.name}» با کد ${t.code} تعریف شد.`);
      }
      onClose();
    } catch (ex) {
      const rest = applyServerErrors(ex, (f, m) => setErrs((x) => ({ ...x, [f]: m.message })), ['name', 'sort_order']);
      setTop(rest.join(' ') || null);
    }
  };

  return (
    <Drawer open onClose={onClose} busy={busy} width={DRAWER_WIDTH} title={title ? 'ویرایش عنوان شورا' : 'عنوان جدید شورا'}
      sub={title ? <>کد <span data-latin>{title.code}</span> را سیستم ساخته است و تغییر نمی‌کند.</> : 'کد عنوان پس از ثبت خودکار ساخته می‌شود.'}
      footer={<>
        <Button onClick={submit} loading={busy} loadingText="در حال ذخیره…">{title ? 'ذخیره‌ی تغییرات' : 'ثبت عنوان'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>انصراف</Button>
      </>}>
      {top ? <div className={s.formErr}><Alert>{top}</Alert></div> : null}
      <FormGrid cols={1}>
        <Input label="نام عنوان" required maxLength={NAME_MAX} placeholder="مثال: مدیر بازرگانی" value={name} error={errs.name}
          onChange={(e) => { setName(e.target.value); setErrs((x) => ({ ...x, name: undefined })); }} />
        <Input label="ترتیب نمایش" inputMode="numeric" value={order} error={errs.sort_order} hint="عدد کوچک‌تر بالاتر در فهرست عنوان‌ها می‌آید."
          onChange={(e) => { setOrder(e.target.value); setErrs((x) => ({ ...x, sort_order: undefined })); }} />
      </FormGrid>
    </Drawer>
  );
}
