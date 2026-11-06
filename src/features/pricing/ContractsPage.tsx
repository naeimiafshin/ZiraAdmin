import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconBan, IconChevronDown, IconChevronUp, IconDownload, IconFileInvoice, IconPencil, IconPlus } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { FormGrid, Input, Select, Textarea } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { TableFilters } from '@/shared/ui/TableFilters';
import { Badge, Card, Empty, Modal, PageHead, Pagination, Segmented } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal, IconButton, Kv } from '@/features/catalog/components';
import { downloadXlsx } from '@/features/catalog/api';
import { useContract, useContractWrite, useContracts, type Contract } from './api';
import { PL_STATUS, ROUNDING } from './labels';
import s from '@/features/catalog/catalog.module.css';

/**
 * «قرارداد قیمت‌گذاری» — مطابق html V2: Segmented همه/تخفیفی/افزایشی (`dir` ⇐ direction)، جدول (کد، نام، درصد تعدیل، توضیحات + اعتبار و وضعیت)، پنل بازشونده
 * (گرد کردن، بازه، لیست‌های ساخته‌شده) با «اعمال روی قیمت کالاها» (⇐ صفحه‌ی قیمت کالاها، مودال اعمال قرارداد)، ویرایش و لغو. بعد از ساخت اولین لیست،
 * درصد، گرد کردن و تاریخ‌ها قفل‌اند (بک‌اند). خروجی اکسل با همان فیلترها (P-01، مجوز pricing.contracts.export).
 */
const DIR: Record<string, string | undefined> = { '': undefined, down: 'DECREASE', up: 'INCREASE' };
const sign = (v: string | number) => { const n = Number(v); return `${n > 0 ? '+' : n < 0 ? '−' : ''}${faNum(Math.abs(n))}٪`; };

export default function ContractsPage() {
  const can = usePerm();
  const lp = useListParams({ page_size: 10 });
  const { text, setText, dq } = useSearchState(lp);
  const dir = lp.get('dir');
  const list = useContracts({ page: lp.page, page_size: lp.pageSize, query: dq || undefined, direction: DIR[dir], status: lp.get('st') || undefined });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<Contract | 'new' | null>(null);
  const toast = useToast(); const [exporting, setExporting] = useState(false);
  const exportXlsx = async () => { setExporting(true); try { await downloadXlsx('/pricing/contracts/export', { query: dq || undefined, direction: DIR[dir], status: lp.get('st') || undefined }, 'contracts.xlsx'); } catch (e) { toast(userMessage(e), 'error'); } finally { setExporting(false); } };
  const cols: Column<Contract>[] = [
    { key: 'code', header: 'کد قرارداد', render: (c) => <span className={s.codeChip} data-latin>{c.code}</span> },
    { key: 'name', header: 'نام قرارداد', render: (c) => <span className={s.strong}>{c.name}</span> },
    { key: 'pct', header: 'درصد تعدیل', render: (c) => <b className="tnum" style={{ color: Number(c.adjustment_pct) < 0 ? 'var(--danger)' : 'var(--success)' }}>{sign(c.adjustment_pct)}</b> },
    { key: 'desc', header: 'توضیحات', render: (c) => <span className={`${s.famName} ${s.muted}`} style={{ maxWidth: 260 }} data-tip={c.description}>{c.description || '—'}</span> },
    { key: 'valid', header: 'اعتبار', render: (c) => <span className="tnum">{faDate(c.valid_from)} تا {faDate(c.valid_to)}</span> },
    { key: 'st', header: 'وضعیت', render: (c) => (c.status === 'CANCELLED' ? <Badge tone="danger">لغوشده</Badge> : c.is_expired ? <Badge tone="neutral">منقضی</Badge> : <Badge tone="success">معتبر</Badge>) },
    { key: 'acts', header: '', render: (c) => <span className={s.rowActions}>{can('pricing.contracts.update') && c.status === 'ACTIVE' ? <IconButton label="ویرایش قرارداد" onClick={() => setForm(c)}><IconPencil size={15} /></IconButton> : null}<IconButton label={open === c.id ? 'بستن جزئیات' : 'نمایش جزئیات'} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}</IconButton></span> },
  ];
  return (
    <>
      <PageHead title="قرارداد قیمت‌گذاری" sub="قاعده‌های تعدیل قیمت که روی لیست قیمت اعمال می‌شوند."
        actions={<>
          {can('pricing.contracts.export') ? <Button variant="secondary" icon={<IconDownload size={17} />} onClick={exportXlsx} loading={exporting}>خروجی اکسل</Button> : null}
          {can('pricing.contracts.create') ? <Button icon={<IconPlus size={17} />} onClick={() => setForm('new')}>قرارداد جدید</Button> : null}
        </>} />
      <Card>
        <div className={s.itemsBar}>
          <Segmented value={dir} onChange={(v) => lp.set({ dir: v || null })} options={[{ value: '', label: 'همه' }, { value: 'down', label: 'تخفیفی' }, { value: 'up', label: 'افزایشی' }]} />
          {list.data ? <span className={s.famCount}>{faNum(list.data.results.length)} از {faNum(list.data.total)} قرارداد</span> : null}
        </div>
        <TableFilters search={text} onSearch={setText} placeholder="جستجوی نام یا کد قرارداد…" filters={[{ key: 'st', label: 'وضعیت', value: lp.get('st'), onChange: (v) => lp.set({ st: v }), options: [{ value: 'ACTIVE', label: 'فعال' }, { value: 'CANCELLED', label: 'لغوشده' }] }]} />
        <div className={s.compact}>
          <DataTable columns={cols} rows={list.data?.results} rowKey={(c) => c.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} onRowClick={(c) => setOpen(open === c.id ? null : c.id)} isSelected={(c) => c.id === open}
            expanded={(c) => (c.id === open ? <ContractExpand id={c.id} onEdit={() => setForm(c)} /> : null)}
            empty={<Empty title={dir || dq ? 'قراردادی با این فیلترها پیدا نشد' : 'هنوز قراردادی تعریف نشده است'} text={dir || dq ? undefined : 'قرارداد یک درصد تعدیل است که روی قیمت کالاها اعمال و به لیست قیمت تبدیل می‌شود.'} />} />
        </div>
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[10, 25, 50]} /> : null}
      </Card>
      {form ? <ContractForm c={form === 'new' ? null : form} onClose={() => setForm(null)} /> : null}
    </>
  );
}

function ContractExpand({ id, onEdit }: { id: string; onEdit: () => void }) {
  const can = usePerm(); const navigate = useNavigate(); const toast = useToast();
  const d = useContract(id); const w = useContractWrite();
  const [cancel, setCancel] = useState(false);
  if (!d.data) return <div className={s.expand}><span className={s.muted}>در حال بارگذاری…</span></div>;
  const c = d.data; const usable = c.status === 'ACTIVE' && !c.is_expired;
  return (
    <div className={s.expand} onClick={(e) => e.stopPropagation()} data-contract-expand>
      <div className={s.expandGrid}>
        <Kv k="درصد تعدیل" v={sign(c.adjustment_pct)} /><Kv k="گرد کردن" v={ROUNDING[c.rounding] ?? c.rounding} />
        <Kv k="بازه‌ی اعتبار" v={`${faDate(c.valid_from)} تا ${faDate(c.valid_to)}`} /><Kv k="لیست‌های ساخته‌شده" v={faNum(c.price_list_count)} />
      </div>
      {c.price_lists.length ? <div className={s.pickGrid} style={{ marginTop: 12 }}>{c.price_lists.map((pl) => <button key={pl.id} type="button" className={s.pick} data-tip="" onClick={() => navigate(`/pricing/price-lists/${pl.id}`)}><span data-latin>{pl.code}</span> · {pl.name} <Badge tone={PL_STATUS[pl.status]?.tone ?? 'neutral'}>{PL_STATUS[pl.status]?.label}</Badge></button>)}</div> : null}
      <div className={s.rowActions} style={{ marginTop: 14, justifyContent: 'flex-start' }}>
        {usable && can('pricing.contracts.update') ? <Button size="sm" icon={<IconFileInvoice size={15} />} onClick={() => navigate(`/pricing/price-lists/apply?contract=${c.id}`)}>اعمال قرارداد</Button> : null}
        {c.status === 'ACTIVE' && can('pricing.contracts.update') ? <Button size="sm" variant="secondary" icon={<IconPencil size={15} />} onClick={onEdit}>ویرایش</Button> : null}
        {c.status === 'ACTIVE' && can('pricing.contracts.update') ? <Button size="sm" variant="secondary" icon={<IconBan size={15} />} onClick={() => setCancel(true)}>لغو قرارداد</Button> : null}
        {c.is_expired ? <span className={s.sub}>قرارداد منقضی است و قابل اعمال نیست.</span> : null}
      </div>
      {cancel ? <ConfirmModal title="لغو قرارداد" confirmLabel="لغو کن" danger onClose={() => setCancel(false)} text={<>قرارداد <b>{c.name}</b> لغو می‌شود و دیگر قابل اعمال نیست؛ لیست‌های ساخته‌شده تغییری نمی‌کنند.</>}
        onConfirm={async () => { await w.cancel.mutateAsync(c.id); toast('قرارداد لغو شد.'); }} /> : null}
      {cancel === false && w.cancel.error ? <p className={s.warnText}>{userMessage(w.cancel.error)}</p> : null}
    </div>
  );
}

function ContractForm({ c, onClose }: { c: Contract | null; onClose: () => void }) {
  const w = useContractWrite(); const toast = useToast();
  const locked = !!c && c.price_list_count > 0;
  const [name, setName] = useState(c?.name ?? ''); const [pct, setPct] = useState(c ? String(Number(c.adjustment_pct)) : ''); const [rounding, setRounding] = useState(c?.rounding ?? 'R1000');
  const [from, setFrom] = useState(c ? gregorianToJalaliText(c.valid_from) : ''); const [to, setTo] = useState(c ? gregorianToJalaliText(c.valid_to) : ''); const [desc, setDesc] = useState(c?.description ?? '');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    const vf = jalaliTextToGregorian(from), vt = jalaliTextToGregorian(to); const p = Number(pct);
    if (!name.trim()) { setErr('نام قرارداد را وارد کنید.'); return; }
    if (!pct.trim() || Number.isNaN(p) || p === 0 || p <= -100) { setErr('درصد تعدیل باید عددی غیرصفر و بیشتر از −۱۰۰ باشد (منفی = تخفیفی).'); return; }
    if (!vf || !vt) { setErr('تاریخ اثر و انقضا را وارد کنید.'); return; }
    if (vt < vf) { setErr('تاریخ انقضا باید بعد از تاریخ اثر باشد.'); return; }
    try {
      if (c) await w.update.mutateAsync({ id: c.id, body: locked ? { name: name.trim(), description: desc } : { name: name.trim(), adjustment_pct: pct, rounding, valid_from: vf, valid_to: vt, description: desc } });
      else await w.create.mutateAsync({ name: name.trim(), adjustment_pct: pct, rounding, valid_from: vf, valid_to: vt, description: desc });
      toast(c ? 'قرارداد ذخیره شد.' : `قرارداد «${name.trim()}» ساخته شد.`); onClose();
    } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={c ? 'ویرایش قرارداد' : 'قرارداد جدید'} width={620} footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={w.create.isPending || w.update.isPending}>{c ? 'ذخیره' : 'ثبت قرارداد'}</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      {locked ? <p className={s.warnText} style={{ marginTop: 0 }}>از این قرارداد لیست قیمت ساخته شده؛ فقط نام و توضیحات قابل ویرایش است.</p> : null}
      <FormGrid cols={2}>
        <Input label="نام قرارداد" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="مثال: قیمت همکار عمده" />
        <Input label="درصد تعدیل (٪)" required dir="ltr" inputMode="decimal" value={toFaDigits(pct)} onChange={(e) => setPct(toLatinDigits(e.target.value).replace(/[^0-9.-]/g, ''))} disabled={locked} hint="منفی = تخفیفی (کاهش قیمت)، مثبت = افزایشی" />
        <Select label="گرد کردن قیمت" value={rounding} onChange={(e) => setRounding(e.target.value as never)} disabled={locked} options={Object.entries(ROUNDING).map(([value, label]) => ({ value, label }))} />
        <span />
        <JalaliDateInput label="تاریخ اثر" required value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" maxYear={1500} disabled={locked} />
        <JalaliDateInput label="تاریخ انقضا" required value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" maxYear={1500} disabled={locked} />
      </FormGrid>
      <div style={{ marginTop: 12 }}><Textarea label="توضیحات" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={4000} /></div>
    </Modal>
  );
}
