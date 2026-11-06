import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { IconBuildingStore, IconEdit } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Button } from '@/shared/ui/Button';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Badge, Card, Empty, ErrorBox, InfoBanner, KeyValue, PageHead, Pagination, SectionTitle, SkeletonRows, UnderlineTabs, UnitHead } from '@/shared/ui/kit';
import { TableFilters } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { ConfirmModal } from '@/features/catalog/components';
import { ReasonModal } from '@/features/customers/components';
import { useSupplier, useSupplierPurchases, useSupplierWrite, type Invoice, type Supplier } from './api';
import { INVOICE_STATUS, labelOf, SUPPLIER_STATUS, toneOf } from './labels';
import { SupplierDrawer } from './SupplierDrawer';
import s from './supply.module.css';

/**
 * پرونده‌ی تأمین‌کننده — GET /supply/suppliers/{id} (+ document_count) و سوابق خرید GET …/purchases.
 * طرح html ندارد؛ الگوی «صفحه‌ی جزئیات» مدیریت کاربران: کارت اصلی، تب‌ها (`tab` در آدرس)، ستون کناری عمل‌ها.
 * قواعد بک‌اند: مسدود کردن دلیل می‌خواهد؛ تأمین‌کننده‌ی مسدود اول باید از مسدودی خارج شود تا فعال/غیرفعال شود؛
 * حذف فقط بدون سند (وگرنه ۴۰۹ با پیام فارسی بک‌اند).
 */
type Tab = 'info' | 'purchases';
const PURCHASES_PAGE_SIZE = 10;

export default function SupplierDetailPage() {
  const { id } = useParams();
  const q = useSupplier(id);
  const back = useBack('/supply/suppliers');
  const can = usePerm();
  const lp = useListParams({ page_size: PURCHASES_PAGE_SIZE });
  const tab: Tab = lp.tab === 'purchases' ? 'purchases' : 'info';
  const [editing, setEditing] = useState(false);

  if (q.isLoading) return <><PageHead back={back} /><SkeletonRows rows={5} height={90} /></>;
  if (q.error || !q.data) return <><PageHead back={back} /><ErrorBox error={q.error} onRetry={() => q.refetch()} /></>;
  const x = q.data;

  return (
    <>
      <PageHead back={back} actions={can('supply.suppliers.update') ? <Button icon={<IconEdit size={17} />} onClick={() => setEditing(true)}>ویرایش</Button> : null} />
      <Card className={s.heroCard}>
        <div className={s.hero}>
          <span className={s.heroMark} aria-hidden><IconBuildingStore size={30} stroke={1.6} /></span>
          <div>
            <div className={s.heroName}>
              <h2>{x.name}</h2>
              <Badge tone={toneOf(SUPPLIER_STATUS, x.status)}>{labelOf(SUPPLIER_STATUS, x.status, x.status_display)}</Badge>
            </div>
            <div className={s.heroMeta}>
              <span>کد: <b data-latin>{x.code}</b></span>
              {x.contact_name ? <span>رابط: <b>{x.contact_name}</b></span> : null}
              {x.phone ? <span>تلفن: <b className="ltr">{x.phone}</b></span> : null}
              <span>اسناد ثبت‌شده: <b>{faNum(x.document_count ?? 0)}</b></span>
              <span>ثبت: {faDate(x.created_at)}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className={s.tabs}>
        <UnderlineTabs value={tab} onChange={(v) => lp.setTab(v === 'info' ? '' : v)} options={[{ value: 'info', label: 'مشخصات' }, { value: 'purchases', label: 'سوابق خرید' }]} />
      </div>

      <div className={s.grid2}>
        <div className={s.stack}>
          {tab === 'info' ? <InfoSection x={x} /> : <PurchasesSection supplierId={x.id} lp={lp} />}
        </div>
        <ActionsCard x={x} onEdit={() => setEditing(true)} />
      </div>
      {editing ? <SupplierDrawer supplier={x} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function InfoSection({ x }: { x: Supplier }) {
  return (
    <Card>
      <SectionTitle>مشخصات تأمین‌کننده</SectionTitle>
      {x.status === 'BLOCKED' ? <div className={s.blockNote}><InfoBanner tone="warning">این تأمین‌کننده مسدود است و در سند تازه انتخاب نمی‌شود. دلیل: {x.block_reason || '—'}</InfoBanner></div> : null}
      <div className={s.kvGrid}>
        <KeyValue label="نام">{x.name}</KeyValue>
        <KeyValue label="کد" ltr>{x.code}</KeyValue>
        <KeyValue label="شناسه‌ی ملی" ltr>{x.national_id}</KeyValue>
        <KeyValue label="کد اقتصادی" ltr>{x.economic_code}</KeyValue>
        <KeyValue label="تلفن" ltr>{x.phone}</KeyValue>
        <KeyValue label="نام رابط">{x.contact_name}</KeyValue>
        <div className={s.kvWide}><KeyValue label="نشانی">{x.address}</KeyValue></div>
        <div className={s.kvWide}><KeyValue label="یادداشت">{x.notes ? <span className={s.pre}>{x.notes}</span> : ''}</KeyValue></div>
        <KeyValue label="ثبت">{faDateTime(x.created_at)}</KeyValue>
        <KeyValue label="آخرین تغییر">{faDateTime(x.updated_at)}</KeyValue>
      </div>
    </Card>
  );
}

function PurchasesSection({ supplierId, lp }: { supplierId: string; lp: ReturnType<typeof useListParams> }) {
  const { text, setText, dq } = useSearchState(lp);
  const list = useSupplierPurchases(supplierId, { page: lp.page, page_size: lp.pageSize, query: dq || undefined });
  const cols: Column<Invoice>[] = [
    { key: 'row', header: 'ردیف', render: (_, i) => <span className={s.muted}>{faNum((lp.page - 1) * lp.pageSize + i + 1)}</span> },
    { key: 'no', header: 'شماره', code: true, render: (r) => <span data-latin>{r.invoice_no}</span> },
    { key: 'date', header: 'تاریخ', render: (r) => faDate(r.invoice_date) },
    { key: 'sno', header: 'شماره فاکتور تأمین‌کننده', render: (r) => (r.supplier_invoice_no ? <span data-latin>{r.supplier_invoice_no}</span> : <span className={s.muted}>—</span>) },
    { key: 'delivery', header: 'نوع تحویل', render: (r) => r.delivery_type_display },
    { key: 'settle', header: 'نحوه تسویه', render: (r) => r.settlement_method_display },
    { key: 'total', header: <UnitHead>مبلغ کل</UnitHead>, render: (r) => <span className="tnum">{faNum(Math.trunc(Number(r.total_amount)))}</span> },
    { key: 'status', header: 'وضعیت', render: (r) => <Badge tone={toneOf(INVOICE_STATUS, r.status)}>{labelOf(INVOICE_STATUS, r.status, r.status_display)}</Badge> },
  ];
  return (
    <Card>
      <SectionTitle>سوابق خرید</SectionTitle>
      <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو: شماره فاکتور یا کالا" count={list.data ? `${faNum(list.data.total)} فاکتور` : undefined} />
      <DataTable columns={cols} rows={list.data?.results} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
        empty={<Empty title={dq ? 'فاکتوری با این جست‌وجو پیدا نشد' : 'هنوز فاکتور خریدی برای این تأمین‌کننده ثبت نشده است'} />} />
      {list.data && list.data.total > 0 ? <Pagination page={lp.page} pageSize={lp.pageSize} total={list.data.total} onPage={lp.setPage} onPageSize={lp.setPageSize} /> : null}
    </Card>
  );
}

/** عمل‌های وضعیت: هر ردیف عنوان + پیامد در راست، دکمه در چپ (الگوی کارت عمل‌های حساب) */
function ActionsCard({ x, onEdit }: { x: Supplier; onEdit: () => void }) {
  const can = usePerm();
  const w = useSupplierWrite();
  const toast = useToast();
  const navigate = useNavigate();
  const [modal, setModal] = useState<'block' | 'unblock' | 'active' | 'delete' | null>(null);
  const blocked = x.status === 'BLOCKED';
  const hasDocs = (x.document_count ?? 0) > 0;
  const canUpdate = can('supply.suppliers.update');
  const canDelete = can('supply.suppliers.delete');
  if (!canUpdate && !canDelete) return <span />;
  return (
    <Card>
      <SectionTitle>عملیات</SectionTitle>
      <div className={s.acts}>
        {canUpdate ? (
          <div className={s.act}>
            <div><b>ویرایش مشخصات</b><p>نام، شناسه‌ها، تلفن، رابط، نشانی و یادداشت.</p></div>
            <Button variant="secondary" size="sm" onClick={onEdit}>ویرایش</Button>
          </div>
        ) : null}
        {canUpdate && blocked ? (
          <div className={s.act}>
            <div><b>رفع مسدودی</b><p>تأمین‌کننده فعال می‌شود و دوباره در اسناد تازه انتخاب‌شدنی است.</p></div>
            <Button variant="secondary" size="sm" onClick={() => setModal('unblock')}>رفع مسدودی</Button>
          </div>
        ) : null}
        {canUpdate && !blocked ? (
          <div className={s.act}>
            <div><b>مسدود کردن</b><p>با ثبت دلیل؛ در سند تازه انتخاب نمی‌شود. اسناد قبلی دست نمی‌خورند.</p></div>
            <Button variant="danger" size="sm" onClick={() => setModal('block')}>مسدود کردن</Button>
          </div>
        ) : null}
        {canUpdate ? (
          <div className={s.act}>
            <div><b>{x.status === 'INACTIVE' ? 'فعال کردن' : 'غیرفعال کردن'}</b><p>{x.status === 'INACTIVE' ? 'تأمین‌کننده دوباره در اسناد تازه انتخاب‌شدنی می‌شود.' : 'در سند تازه انتخاب نمی‌شود؛ برخلاف مسدودی دلیل نمی‌خواهد.'}</p></div>
            <span data-tip={blocked ? 'تأمین‌کننده‌ی مسدود را اول از مسدودی خارج کنید.' : ''}>
              <Button variant="secondary" size="sm" disabled={blocked} onClick={() => setModal('active')}>{x.status === 'INACTIVE' ? 'فعال کردن' : 'غیرفعال کردن'}</Button>
            </span>
          </div>
        ) : null}
        {canDelete ? (
          <div className={s.act}>
            <div><b>حذف تأمین‌کننده</b><p>فقط وقتی هیچ سندی ندارد. در غیر این صورت مسدود یا غیرفعالش کنید.</p></div>
            <span data-tip={hasDocs ? `این تأمین‌کننده ${faNum(x.document_count ?? 0)} سند دارد و حذف نمی‌شود.` : ''}>
              <Button variant="danger" size="sm" disabled={hasDocs} onClick={() => setModal('delete')}>حذف</Button>
            </span>
          </div>
        ) : null}
      </div>

      <ReasonModal open={modal === 'block'} onClose={() => setModal(null)} title="مسدود کردن تأمین‌کننده" confirmText="مسدود کن" danger busy={w.block.isPending}
        intro={<>تأمین‌کننده‌ی <b>{x.name}</b> مسدود می‌شود و در درخواست تأمین، اعلامیه، فاکتور و امانی تازه انتخاب نمی‌شود.</>}
        label="دلیل مسدودی" onConfirm={async (reason) => { await w.block.mutateAsync({ id: x.id, reason }); toast(`تأمین‌کننده‌ی «${x.name}» مسدود شد.`); setModal(null); }} />
      {modal === 'unblock' ? (
        <ConfirmModal title="رفع مسدودی" confirmLabel="رفع مسدودی" onClose={() => setModal(null)}
          text={<>مسدودی تأمین‌کننده‌ی <b>{x.name}</b> برداشته می‌شود و وضعیتش «فعال» می‌شود.</>}
          onConfirm={async () => { await w.unblock.mutateAsync(x.id); toast(`مسدودی تأمین‌کننده‌ی «${x.name}» برداشته شد.`); }} />
      ) : null}
      {modal === 'active' ? (
        <ConfirmModal title={x.status === 'INACTIVE' ? 'فعال کردن تأمین‌کننده' : 'غیرفعال کردن تأمین‌کننده'} confirmLabel={x.status === 'INACTIVE' ? 'فعال کن' : 'غیرفعال کن'} onClose={() => setModal(null)}
          text={x.status === 'INACTIVE' ? <>تأمین‌کننده‌ی <b>{x.name}</b> فعال می‌شود.</> : <>تأمین‌کننده‌ی <b>{x.name}</b> غیرفعال می‌شود و در سند تازه انتخاب نمی‌شود. اسناد قبلی دست نمی‌خورند.</>}
          onConfirm={async () => { await w.setActive.mutateAsync({ id: x.id, is_active: x.status === 'INACTIVE' }); toast(`تأمین‌کننده‌ی «${x.name}» ${x.status === 'INACTIVE' ? 'فعال' : 'غیرفعال'} شد.`); }} />
      ) : null}
      {modal === 'delete' ? (
        <ConfirmModal title="حذف تأمین‌کننده" confirmLabel="حذف تأمین‌کننده" danger onClose={() => setModal(null)}
          text={<>تأمین‌کننده‌ی <b>{x.name}</b> برای همیشه حذف می‌شود.</>}
          onConfirm={async () => { await w.remove.mutateAsync(x.id); toast(`تأمین‌کننده‌ی «${x.name}» حذف شد.`); navigate('/supply/suppliers', { replace: true }); }} />
      ) : null}
    </Card>
  );
}
