import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconArchive, IconArrowBackUp, IconCheck, IconPencil, IconPlus, IconSpeakerphone, IconTags } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Textarea } from '@/shared/ui/form';
import { Badge, Card, Empty, InfoBanner, Modal, PageHead, Pagination } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { IconBtn, NO_ERRORS, parseErrors, Stat, type FormErrors } from './ui';
import { DEFAULT_NATURE_COLOR, HEX_COLOR, natureGradient } from './natureColor';
import s from './settings.module.css';

/**
 * ماهیت‌های کمپین (`/settings/campaign-natures`، افشین 2026-10-24): برچسب کمپین (تخفیفی، مناسبتی، …) با توضیح کوتاه و رنگ کارت.
 * کد را سیستم می‌سازد؛ حذف ندارد، فقط آرشیو (DELETE …/archive با مجوز delete) و بازگردانی (PATCH …/restore با مجوز update).
 * ماهیت آرشیوشده در فرم کمپین تازه پیشنهاد نمی‌شود ولی کمپین‌های موجود نگهش می‌دارند. ماهیت در هیچ محاسبه‌ای اثر ندارد.
 */
export type CampaignNature = AdminSchemas['CampaignNatureOut'];
type Params = { page: number; page_size: number; query?: string; is_archived?: boolean };

const KEY = ['settings', 'campaign-natures'] as const;
const useNatures = (p: Params) => useQuery({
  queryKey: [...KEY, p], placeholderData: keepPreviousData,
  queryFn: ({ signal }) => adminApi<Paginated<CampaignNature>>('/settings/campaign-natures', { query: p, signal }),
});
const useCount = (is_archived?: boolean) => useQuery({
  queryKey: [...KEY, 'count', is_archived ?? 'all'],
  queryFn: ({ signal }) => adminApi<Paginated<CampaignNature>>('/settings/campaign-natures', { query: { page: 1, page_size: 1, is_archived }, signal }),
  select: (r) => r.total,
});
/** فهرست گزینه‌های فرم کمپین هم باید تازه شود (GET /pricing/campaign-natures) */
const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ['pricing'] })]);

/** پالت پیشنهادی = رنگ هفت ماهیت اولیه‌ی بک‌اند */
const PALETTE = ['#D64F57', '#5F7FBD', '#D9824A', '#8F6FC0', '#4A9F7F', '#4A90BF', '#BF6290'];
const HEX = HEX_COLOR;

const STATUS = [{ value: 'active', label: 'فعال' }, { value: 'archived', label: 'آرشیوشده' }];

export default function CampaignNaturesPage() {
  const can = usePerm();
  const toast = useToast();
  const qc = useQueryClient();
  const lp = useListParams();
  const search = useSearchState(lp);
  const st = lp.get('st');
  const list = useNatures({ page: lp.page, page_size: lp.pageSize, query: lp.q || undefined, is_archived: st ? st === 'archived' : undefined });
  const total = useCount(); const active = useCount(false); const archived = useCount(true);
  const [edit, setEdit] = useState<CampaignNature | 'new' | null>(null);
  const [arch, setArch] = useState<CampaignNature | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canUpdate = can('settings.campaign_natures.update');
  const canArchive = can('settings.campaign_natures.delete');

  const restore = async (n: CampaignNature) => {
    setBusyId(n.id);
    try { await adminApi(`/settings/campaign-natures/${n.id}/restore`, { method: 'PATCH' }); toast(`ماهیت «${n.name}» بازگردانده شد.`); }
    catch (e) { toast(userMessage(e), 'error'); } finally { setBusyId(null); await invalidate(qc); }
  };

  const cols: Column<CampaignNature>[] = [
    { key: 'order', header: 'ترتیب', render: (n) => faNum(n.sort_order) },
    { key: 'color', header: 'رنگ کارت', render: (n) => <ColorChip color={n.color} /> },
    { key: 'name', header: 'نام', render: (n) => <span className={s.strong}>{n.name}</span> },
    { key: 'code', header: 'کد', code: true, render: (n) => <span className="ltr" data-latin="">{n.code}</span> },
    { key: 'desc', header: 'توضیح در فرم کمپین', render: (n) => <span className={s.desc} data-tip={n.description || ''}>{n.description || '—'}</span> },
    { key: 'st', header: 'وضعیت', render: (n) => <Badge tone={n.is_archived ? 'neutral' : 'success'}>{n.is_archived ? 'آرشیوشده' : 'فعال'}</Badge> },
    { key: 'upd', header: 'آخرین تغییر', render: (n) => <span className={s.muted}>{faDate(n.is_archived && n.archived_at ? n.archived_at : n.updated_at)}</span> },
    ...(canUpdate || canArchive ? [{
      key: 'act', header: 'عملیات', render: (n: CampaignNature) => (
        <span className={s.acts}>
          {canUpdate ? <IconBtn label={`ویرایش ${n.name}`} onClick={() => setEdit(n)}><IconPencil size={16} /></IconBtn> : null}
          {!n.is_archived && canArchive ? <IconBtn label={`آرشیو ${n.name}`} tip="آرشیو" onClick={() => setArch(n)}><IconArchive size={16} /></IconBtn> : null}
          {n.is_archived && canUpdate ? <IconBtn label={`بازگردانی ${n.name}`} tip="بازگردانی از آرشیو" disabled={busyId === n.id} onClick={() => restore(n)}><IconArrowBackUp size={16} /></IconBtn> : null}
        </span>
      ),
    }] : []),
  ];

  return (
    <>
      <PageHead title="ماهیت‌های کمپین" sub="برچسب هر کمپین (مثلاً «تخفیفی» یا «مناسبتی») با توضیح کوتاه و رنگ کارت؛ فقط برای دسته‌بندی و نمایش است و در محاسبه‌ی قیمت و تخفیف اثری ندارد."
        actions={can('settings.campaign_natures.create') ? <Button icon={<IconPlus size={17} />} onClick={() => setEdit('new')}>ماهیت جدید</Button> : null} />
      <div className={s.stats} style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <Stat icon={<IconTags size={20} />} label="همه‌ی ماهیت‌ها" value={total.data} />
        <Stat icon={<IconCheck size={20} />} label="فعال (در فرم کمپین)" value={active.data} tone="success" />
        <Stat icon={<IconArchive size={20} />} label="آرشیوشده" value={archived.data} tone="neutral" />
      </div>
      <Card>
        <TableFilters search={search.text} onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }} placeholder="جست‌وجو: نام، کد یا توضیح"
          count={list.data ? `${faNum(list.data.total)} ماهیت` : undefined}
          filters={[{ key: 'st', label: 'وضعیت', value: st, onChange: lp.setFilter('st'), options: STATUS }]} />
        <DataTable columns={cols} rows={list.data?.results} rowKey={(n) => n.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={<Empty title={lp.q || st ? 'ماهیتی با این جست‌وجو و فیلتر پیدا نشد' : 'هنوز ماهیتی تعریف نشده است'} />} />
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {edit ? <NatureModal nature={edit === 'new' ? null : edit} onClose={() => setEdit(null)} /> : null}
      {arch ? <ArchiveModal nature={arch} onClose={() => setArch(null)} /> : null}
    </>
  );
}

function ColorChip({ color }: { color: string }) {
  const c = color && HEX.test(color) ? color : '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden style={{ width: 15, height: 15, borderRadius: '50%', background: natureGradient(c), boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)' }} />
      {c ? <span className="ltr" data-latin="" style={{ fontSize: 12, color: 'var(--ink-500)' }}>{c.toUpperCase()}</span> : <span className={s.muted}>پیش‌فرض</span>}
    </span>
  );
}

function ArchiveModal({ nature, onClose }: { nature: CampaignNature; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await adminApi(`/settings/campaign-natures/${nature.id}/archive`, { method: 'DELETE' }); toast(`ماهیت «${nature.name}» آرشیو شد.`); await invalidate(qc); onClose(); }
    catch (e) { setErr(userMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="آرشیو ماهیت کمپین" width={480}
      footer={<><Button variant="danger" onClick={go} loading={busy}>آرشیو کن</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.modalBody}>
        {err ? <InfoBanner tone="warning">{err}</InfoBanner> : null}
        <p style={{ margin: 0, lineHeight: 1.9 }}>
          ماهیت «<b>{nature.name}</b>» دیگر برای کمپین تازه پیشنهاد نمی‌شود. کمپین‌هایی که الان این ماهیت را دارند همان را نگه می‌دارند و در گزارش‌ها دیده می‌شود.
          هر وقت لازم شد، از همین صفحه بازگردانده می‌شود.
        </p>
      </div>
    </Modal>
  );
}

/** ساخت و ویرایش: نام، توضیح، رنگ کارت و ترتیب (کد را سیستم می‌سازد) + پیش‌نمایش زنده‌ی کارت و گزینه‌ی فرم کمپین */
function NatureModal({ nature, onClose }: { nature: CampaignNature | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ name: nature?.name ?? '', description: nature?.description ?? '', color: nature?.color ?? '', sort_order: String(nature?.sort_order ?? 0) });
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const colorBad = v.color !== '' && !HEX.test(v.color);
  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'نام الزامی است.';
    if (colorBad) e.color = 'رنگ باید به شکل #RRGGBB باشد.';
    if (Object.keys(e).length) { setErrs({ fields: e, general: [] }); return; }
    const data = { name: v.name.trim(), description: v.description.trim(), color: v.color.toUpperCase(), sort_order: Number(v.sort_order || 0) };
    setBusy(true); setErrs(NO_ERRORS);
    try {
      if (nature) {
        const body = Object.fromEntries(Object.entries(data).filter(([k, x]) => String(x) !== String((nature as Record<string, unknown>)[k] ?? '')));
        if (Object.keys(body).length) await adminApi(`/settings/campaign-natures/${nature.id}`, { method: 'PATCH', body });
      } else {
        await adminApi('/settings/campaign-natures', { method: 'POST', body: data });
      }
      toast(nature ? 'ماهیت کمپین ذخیره شد.' : 'ماهیت کمپین تعریف شد.');
      await invalidate(qc); onClose();
    } catch (err) { setErrs(parseErrors(err, ['name', 'description', 'color', 'sort_order'])); } finally { setBusy(false); }
  };
  const pick = (c: string) => setV({ ...v, color: c });
  return (
    <Modal open onClose={onClose} title={nature ? `ویرایش ماهیت «${nature.name}»` : 'ماهیت کمپین جدید'} width={760}
      footer={<><Button onClick={save} loading={busy}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.modalBody}>
        {errs.general.length ? <InfoBanner tone="warning">{errs.general.join(' ')}</InfoBanner> : null}
        {nature?.is_archived ? <InfoBanner>این ماهیت آرشیو شده است؛ ویرایش آن را به فرم کمپین برنمی‌گرداند (برای آن «بازگردانی» را بزنید).</InfoBanner> : null}
        <div className={s.natureGrid}>
          <div className={s.modalBody}>
            <FormGrid cols={2}>
              <Input label="نام" required value={v.name} maxLength={100} placeholder="مثلاً حراج آخر فصل" error={errs.fields.name || undefined} onChange={(e) => setV({ ...v, name: e.target.value })} />
              <Input label="ترتیب نمایش" value={toFaDigits(v.sort_order)} inputMode="numeric" error={errs.fields.sort_order || undefined} hint="عدد کوچک‌تر بالاتر می‌آید."
                onChange={(e) => setV({ ...v, sort_order: toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 5) })} />
              <Textarea label="توضیح کوتاه" span={2} value={v.description} maxLength={300} placeholder="در فرم کمپین زیر نام این گزینه می‌آید؛ مثلاً «درصدی یا مبلغ ثابت»"
                error={errs.fields.description || undefined} hint={`${faNum(v.description.length)} از ۳۰۰ نویسه`} onChange={(e) => setV({ ...v, description: e.target.value })} />
            </FormGrid>
            <div>
              <div className={s.fieldLabel}>رنگ کارت کمپین</div>
              <div className={s.swatchRow} role="radiogroup" aria-label="رنگ کارت کمپین">
                <button type="button" role="radio" aria-checked={v.color === ''} className={`${s.swatchBtn} ${s.swatchDefault} ${v.color === '' ? s.swatchOn : ''}`} onClick={() => pick('')}
                  data-tip="رنگ پیش‌فرض" aria-label="رنگ پیش‌فرض">پیش‌فرض</button>
                {PALETTE.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={v.color.toUpperCase() === c} aria-label={`رنگ ${c}`} data-tip={c}
                    className={`${s.swatchBtn} ${v.color.toUpperCase() === c ? s.swatchOn : ''}`} style={{ background: natureGradient(c) }} onClick={() => pick(c)} />
                ))}
                <label className={s.swatchCustom} data-tip="رنگ دلخواه">
                  <input type="color" aria-label="انتخاب رنگ دلخواه" value={HEX.test(v.color) ? v.color : DEFAULT_NATURE_COLOR} onChange={(e) => pick(e.target.value.toUpperCase())} />
                </label>
                <input className={`${s.textIn} ltr`} style={{ width: 110 }} dir="ltr" data-latin="" aria-label="کد رنگ" placeholder="#RRGGBB" maxLength={7}
                  value={v.color} onChange={(e) => pick(e.target.value.trim())} />
              </div>
              {errs.fields.color || colorBad ? <div className={s.settingErr}>{errs.fields.color || 'رنگ باید به شکل #RRGGBB باشد.'}</div> : null}
            </div>
          </div>
          <div>
            <div className={s.fieldLabel}>پیش‌نمایش</div>
            <div className={s.natureCard}>
              <div className={s.natureHead} style={{ background: natureGradient(colorBad ? '' : v.color) }}>
                <small>{v.name.trim() || 'نام ماهیت'}</small>
                <b>کمپین نمونه</b>
              </div>
              <div className={s.natureBody}><IconSpeakerphone size={16} /> کارت کمپین در صفحه‌ی «کمپین‌ها»</div>
            </div>
            <div className={s.natureOption}>
              <span className={s.natureRadio} />
              <span><b>{v.name.trim() || 'نام ماهیت'}</b><small>{v.description.trim() || 'توضیح کوتاه'}</small></span>
            </div>
            <div className={s.muted} style={{ marginTop: 6 }}>گزینه‌ی همین ماهیت در فرم کمپین</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
