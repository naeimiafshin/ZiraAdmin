import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faNum } from '@/shared/lib/format';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, PageHead, Pagination } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal, IconButton } from '@/features/catalog/components';
import { useTaxRules, useTaxWrite, type TaxRule } from './api';
import s from '@/features/catalog/catalog.module.css';

/**
 * «قواعد مالیات» (P-13 ✅، 2026-10-24): فهرست قانون‌ها با دامنه، نوع، نرخ، بازه‌ی اعتبار و وضعیت «در حال اجرا»؛ جست‌وجو + فیلتر دامنه / نوع / وضعیت.
 * «قانون جدید» و ویرایش ⇐ فرم کامل (/pricing/tax-rules/new، /:id/edit)؛ حذف فقط قانون شروع‌نشده (deletable)، بقیه با «پایان اعتبار» بسته می‌شوند.
 * اولویت اعمال: کالا (۳) > دسته‌بندی (۲) > همه‌ی کالاها (۱).
 */
const IN_FORCE: Record<string, boolean | undefined> = { on: true, off: false };
const rate = (t: TaxRule) => (t.kind === 'PERCENT' ? <b className="tnum">{faNum(Number(t.vat_percent) + Number(t.duty_percent))}٪ <span className={s.muted}>({faNum(Number(t.vat_percent))} + {faNum(Number(t.duty_percent))})</span></b>
  : t.kind === 'FIXED_PER_UNIT' ? <span className="tnum">{faNum(Number(t.fixed_amount ?? 0))} ریال / {t.fixed_unit}</span>
    : <Badge tone="neutral">{t.kind === 'EXEMPT' ? 'معاف' : 'نرخ صفر'}</Badge>);

export default function TaxRulesPage() {
  const can = usePerm(); const navigate = useNavigate(); const toast = useToast(); const w = useTaxWrite();
  const lp = useListParams({ page_size: 25 });
  const { text, setText, dq } = useSearchState(lp);
  const list = useTaxRules({ page: lp.page, page_size: lp.pageSize, query: dq || undefined, scope: lp.get('scope') || undefined, kind: lp.get('kind') || undefined, in_force: IN_FORCE[lp.get('st')] });
  const [del, setDel] = useState<TaxRule | null>(null);
  const cols: Column<TaxRule>[] = [
    { key: 'name', header: 'نام قانون', render: (t) => <span className={`${s.strong} ${s.famName}`} style={{ maxWidth: 240 }} data-tip={t.legal_basis || t.name}>{t.name}</span> },
    { key: 'scope', header: 'دامنه', render: (t) => <span className={s.famName} style={{ maxWidth: 200 }} data-tip={t.targets.map((x) => x.label).join('، ')}>{t.scope_display}{t.targets.length ? ` (${faNum(t.targets.length)})` : ''}</span> },
    { key: 'kind', header: 'نوع', render: (t) => t.kind_display },
    { key: 'rate', header: 'نرخ', render: rate },
    { key: 'from', header: 'شروع اعتبار', render: (t) => faDate(t.valid_from) },
    { key: 'to', header: 'پایان اعتبار', render: (t) => (t.valid_to ? faDate(t.valid_to) : <span className={s.muted}>تا قانون بعدی</span>) },
    { key: 'st', header: 'وضعیت', render: (t) => (t.in_force ? <Badge tone="success">در حال اجرا</Badge> : t.deletable ? <Badge tone="info">آینده</Badge> : <Badge tone="neutral">پایان‌یافته</Badge>) },
    {
      key: 'acts', header: '', render: (t) => (
        <span className={s.rowActions}>
          {can('pricing.tax_rules.update') ? <IconButton label="ویرایش قانون" onClick={() => navigate(`/pricing/tax-rules/${t.id}/edit`)}><IconPencil size={15} /></IconButton> : null}
          {can('pricing.tax_rules.delete') && t.deletable ? <IconButton label="حذف قانون" danger onClick={() => setDel(t)}><IconTrash size={15} /></IconButton> : null}
        </span>
      ),
    },
  ];
  return (
    <>
      <PageHead title="قواعد مالیات" sub="نرخ مالیات بر ارزش افزوده و عوارض، معافیت‌ها و قانون‌های اختصاصی دسته‌ها و کالاها؛ برای هر کالا قانون اختصاصی‌تر اولویت دارد."
        actions={can('pricing.tax_rules.create') ? <Button icon={<IconPlus size={17} />} onClick={() => navigate('/pricing/tax-rules/new')}>قانون جدید</Button> : null} />
      <Card>
        <TableFilters search={text} onSearch={setText} placeholder="جستجوی نام یا مبنای قانونی…" filters={[
          { key: 'scope', label: 'دامنه', value: lp.get('scope'), onChange: (v) => lp.set({ scope: v }), options: [{ value: 'ALL', label: 'همه‌ی کالاها' }, { value: 'CATEGORY', label: 'دسته‌بندی' }, { value: 'ITEM', label: 'کالا' }] },
          { key: 'kind', label: 'نوع', value: lp.get('kind'), onChange: (v) => lp.set({ kind: v }), options: [{ value: 'PERCENT', label: 'درصدی' }, { value: 'EXEMPT', label: 'معاف' }, { value: 'ZERO_RATED', label: 'نرخ صفر' }, { value: 'FIXED_PER_UNIT', label: 'مبلغ ثابت' }] },
          { key: 'st', label: 'وضعیت', value: lp.get('st'), onChange: (v) => lp.set({ st: v }), options: [{ value: 'on', label: 'در حال اجرا' }, { value: 'off', label: 'غیر جاری (آینده یا پایان‌یافته)' }] },
        ]} count={list.data ? `${faNum(list.data.total)} قانون` : undefined} />
        <div className={s.compact}>
          <DataTable columns={cols} rows={list.data?.results} rowKey={(t) => t.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
            onRowClick={can('pricing.tax_rules.update') ? (t) => navigate(`/pricing/tax-rules/${t.id}/edit`) : undefined}
            empty={<Empty title={dq || lp.get('scope') || lp.get('kind') || lp.get('st') ? 'قانونی با این فیلترها پیدا نشد' : 'قاعده‌ی مالیاتی تعریف نشده است'} />} />
        </div>
        {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} sizes={[25, 50, 100]} /> : null}
      </Card>
      {del ? <ConfirmModal title="حذف قانون مالیاتی" confirmLabel="حذف کن" danger onClose={() => setDel(null)} text={<>قانون <b>{del.name}</b> حذف می‌شود.</>}
        onConfirm={async () => { await w.remove.mutateAsync(del.id); toast('قانون حذف شد.'); }} /> : null}
    </>
  );
}
