import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconPencil } from '@tabler/icons-react';
import { adminApi } from '@/shared/api/client';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input } from '@/shared/ui/form';
import { Card, Empty, InfoBanner, Modal, PageHead, Pagination } from '@/shared/ui/kit';
import { Stepper } from '@/shared/ui/Stepper';
import { searchKey, TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { invalidateSettings, useSequences, type Sequence } from './api';
import { IconBtn, NO_ERRORS, parseErrors, type FormErrors } from './ui';
import s from './settings.module.css';

/** نام فارسی توالی و دامنه از بک‌اند (`key_display`، `domain`، `domain_display`، 2026-10-24؛ کلید ناشناخته = خود کلید) */
type Row = Sequence & { key_display?: string; domain?: string; domain_display?: string };
const nameOf = (r: Row) => r.key_display || r.key;
const domainOf = (r: Row) => r.domain || r.key.split('.')[0] || '';
const domainName = (r: Row) => r.domain_display || domainOf(r);
/** توالی بارکد: پیشوند خالی و ۹ رقم (قاعده‌ی بک‌اند؛ پیشوند بارکد در «پیش‌فرض‌های کاتالوگ» است) */
const isBarcode = (r: Row) => r.key === 'catalog.barcode';
const preview = (prefix: string, next: number, padding: number) => `${prefix}${String(next).padStart(padding, '0')}`;

/** شماره‌گذاری (`/settings/sequences`): ردیف‌ها را سیستم می‌سازد؛ ساخت و حذف ندارد. فهرست کوچک ⇐ یک‌جا گرفته و در فرانت فیلتر و صفحه‌بندی می‌شود. */
export default function NumberingPage() {
  const can = usePerm();
  const lp = useListParams();
  const search = useSearchState(lp);
  const dom = lp.get('domain');
  const q = useSequences();
  const [edit, setEdit] = useState<Row | null>(null);
  const rows = useMemo(() => {
    const k = searchKey(lp.q);
    return ((q.data ?? []) as Row[]).filter((r) => (!dom || domainOf(r) === dom) && (!k || searchKey(nameOf(r), r.key, r.prefix, domainName(r)).includes(k)));
  }, [q.data, lp.q, dom]);
  const page = rows.slice((lp.page - 1) * lp.pageSize, lp.page * lp.pageSize);
  const domains = [...new Map(((q.data ?? []) as Row[]).map((r) => [domainOf(r), domainName(r)])).entries()].map(([value, label]) => ({ value, label }));
  const editable = can('settings.numbering.update');

  const cols: Column<Row>[] = [
    { key: 'name', header: 'شماره‌ی سند / کد', render: (r) => <span className={s.strong}>{nameOf(r)}</span> },
    { key: 'domain', header: 'بخش', render: (r) => domainName(r) },
    { key: 'key', header: 'کلید', code: true, render: (r) => <span className="ltr" data-latin="">{r.key}</span> },
    { key: 'prefix', header: 'پیشوند', render: (r) => (r.prefix ? <span className="ltr" data-latin="">{r.prefix}</span> : '—') },
    { key: 'pad', header: 'تعداد رقم', render: (r) => faNum(r.padding) },
    { key: 'next', header: 'شماره‌ی بعدی', render: (r) => faNum(r.next_value) },
    { key: 'pv', header: 'نمونه‌ی کد بعدی', render: (r) => <span className="ltr" data-latin="" style={{ fontWeight: 800 }}>{r.preview}</span> },
    ...(editable ? [{ key: 'act', header: 'عملیات', render: (r: Row) => <IconBtn label={`ویرایش ${nameOf(r)}`} onClick={() => setEdit(r)}><IconPencil size={16} /></IconBtn> }] : []),
  ];
  return (
    <>
      <PageHead title="شماره‌گذاری" sub="قالب کدها و شماره‌ی سندهایی که سامانه خودکار می‌سازد؛ شماره‌ی بعدی فقط بزرگ‌تر می‌شود." />
      <Card>
        <TableFilters search={search.text} onSearch={(v) => { search.setText(v); if (!v) lp.setQ(''); }} placeholder="جست‌وجو: نام، کلید یا پیشوند"
          count={q.data ? `${faNum(rows.length)} توالی` : undefined}
          filters={[{ key: 'domain', label: 'بخش', value: dom, onChange: lp.setFilter('domain'), options: domains }]} />
        <DataTable columns={cols} rows={q.data ? page : undefined} rowKey={(r) => r.id} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}
          empty={<Empty title={lp.q || dom ? 'توالی‌ای با این جست‌وجو و فیلتر پیدا نشد' : 'توالی‌ای ثبت نشده است'} />} />
        {rows.length > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={rows.length} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
      </Card>
      {edit ? <SequenceModal row={edit} onClose={() => setEdit(null)} /> : null}
    </>
  );
}

function SequenceModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ prefix: row.prefix, padding: row.padding, next_value: row.next_value });
  const [errs, setErrs] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const lock = isBarcode(row);
  const save = async () => {
    const body: Record<string, unknown> = {};
    if (v.prefix !== row.prefix) body.prefix = v.prefix;
    if (v.padding !== row.padding) body.padding = v.padding;
    if (v.next_value !== row.next_value) body.next_value = v.next_value;
    if (!Object.keys(body).length) { onClose(); return; }
    setBusy(true); setErrs(NO_ERRORS);
    try { await adminApi(`/settings/sequences/${row.id}`, { method: 'PATCH', body }); toast('شماره‌گذاری ذخیره شد.'); await invalidateSettings(qc, 'sequences'); onClose(); }
    catch (e) { setErrs(parseErrors(e, ['prefix', 'padding', 'next_value'])); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`شماره‌گذاری: ${nameOf(row)}`} width={620}
      footer={<><Button onClick={save} loading={busy}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className={s.modalBody}>
        {errs.general.length ? <InfoBanner tone="warning">{errs.general.join(' ')}</InfoBanner> : null}
        {lock ? <InfoBanner>این توالی سریال ۹ رقمی بارکد داخلی است؛ پیشوند و تعداد رقم آن قفل است (سه رقم اول بارکد در «پیش‌فرض‌های کاتالوگ» تعیین می‌شود).</InfoBanner> : null}
        <FormGrid cols={3}>
          <Input latin label="پیشوند" value={v.prefix} disabled={lock} dir="ltr" maxLength={10} error={errs.fields.prefix || undefined} hint="حروف بزرگ لاتین، رقم و -"
            onChange={(e) => setV({ ...v, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 7 }}>تعداد رقم</div>
            <Stepper label="تعداد رقم" value={v.padding} onChange={(x) => setV({ ...v, padding: x })} min={0} max={12} disabled={lock} />
            {errs.fields.padding ? <div className={s.settingErr}>{errs.fields.padding}</div> : null}
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 7 }}>شماره‌ی بعدی</div>
            <Stepper label="شماره‌ی بعدی" value={v.next_value} onChange={(x) => setV({ ...v, next_value: x })} min={row.next_value} max={999_999_999} />
            {errs.fields.next_value ? <div className={s.settingErr}>{errs.fields.next_value}</div> : <div className={s.settingDesc}>کمتر از {faNum(row.next_value)} نمی‌شود.</div>}
          </div>
        </FormGrid>
        <div className={s.preview}>نمونه‌ی کد بعدی: <span className={`${s.previewVal} ltr`} data-latin="">{preview(v.prefix, v.next_value, v.padding)}</span></div>
      </div>
    </Modal>
  );
}
