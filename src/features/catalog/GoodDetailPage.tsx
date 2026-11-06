import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { IconArchive, IconEye, IconEyeOff, IconLayoutGrid, IconPencil, IconRestore, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { Button } from '@/shared/ui/Button';
import { Badge, Card, Empty, PageHead, SectionTitle, SkeletonRows } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useCategoryTree, useItem, useItemMutations, usePriceDetail, useUnits, type CategoryNode } from './api';
import { ConfirmModal, Kv, Swatch } from './components';
import { FamilyModal } from './FamilyModal';
import { GoodEditModal } from './GoodEditModal';
import { ITEM_STATUS } from './labels';
import s from './catalog.module.css';

/**
 * «جزئیات کالا» (کالای تکی، kind=GOOD) — مسیر /catalog/products/goods/:id زیر «کالاها» (افشین 2026-10-23: کلیک روی ردیف لیست کالاها
 * قبلاً پرونده‌ی آیتم را باز می‌کرد و در منو «آیتم‌ها» فعال می‌شد). سطر اول بازگشت + مسیر + نام، سطر دوم دکمه‌ها (چپ‌چین)،
 * کارت معرفی (رنگ، برند، نام، قیمت)، چهار آمار، مشخصات کالا، خانواده، قیمت و موجودی، ویژگی‌ها و ستون «اطلاعات کلی».
 * «ویرایش کالا» ⇐ GoodEditModal. انبار، موجودی، قیمت خرید و حاشیه تا ماژول‌های انبار و خرید «به‌زودی».
 */
const flatten = (nodes: CategoryNode[], out = new Map<string, CategoryNode>()) => { for (const n of nodes) { out.set(n.id, n); flatten(n.children ?? [], out); } return out; };
const Rial = () => <span className={s.rial}>ریال</span>;
const Soon = () => <span className={s.muted} data-tip="به‌زودی (ماژول انبار/خرید)">—</span>;
const Stat = ({ label, value }: { label: string; value: ReactNode }) => <div className={s.stat}><b className="tnum">{value}</b><span>{label}</span></div>;

export default function GoodDetailPage() {
  const { id } = useParams();
  const can = usePerm(); const navigate = useNavigate(); const toast = useToast();
  const q = useItem(id); const g = q.data;
  const back = useBack(g ? `/catalog/products?fam=${g.product_id}` : '/catalog/products');
  const price = usePriceDetail(id, can('pricing.prices.read'));
  const units = useUnits(); const tree = useCategoryTree(true);
  const byId = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const m = useItemMutations();
  const [edit, setEdit] = useState(false); const [fam, setFam] = useState(false); const [arch, setArch] = useState(false); const [del, setDel] = useState(false);
  if (q.isLoading) return <Card><SkeletonRows rows={6} height={60} /></Card>;
  if (q.error || !g) return <Card><Empty title="کالا پیدا نشد" text={q.error ? userMessage(q.error) : undefined} /></Card>;
  if (g.kind !== 'GOOD') return <Navigate to={`/catalog/items/${g.id}`} replace />;
  const st = ITEM_STATUS[g.status] ?? { label: g.status, tone: 'neutral' as const };
  const size = g.sizes[0]; const color = g.colors[0];
  const sale = price.data?.sale_price ? Number(price.data.sale_price) : null;
  const unit = units.data?.find((u) => u.id === g.unit_id);
  const cat = (() => { const c = [...byId.values()].find((x) => x.name === g.category_name && !x.children?.length); const p: string[] = []; for (let n = c; n; n = n.parent_id ? byId.get(n.parent_id) : undefined) p.unshift(n.name); return p.join(' › ') || g.category_name; })();
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); await q.refetch(); toast(ok); } catch (e) { toast(userMessage(e), 'error'); } };
  const activate = () => run(async () => { if (!g.barcode) await adminApi(`/catalog/items/${g.id}/barcode`, { method: 'PATCH', body: { value: null } }); await m.activate.mutateAsync(g.id); }, 'کالا فعال شد.');
  const attrs = g.attribute_values.filter((a) => a.system_key !== 'MATERIAL' && a.system_key !== 'MODEL_LINE');
  const attrVal = (a: (typeof attrs)[number]) => a.value ?? (a.value_text || (a.value_number != null ? faNum(a.value_number) : a.value_bool != null ? (a.value_bool ? 'بله' : 'خیر') : '—'));
  return (
    <>
      <PageHead back={back} title={<span className={s.detailTitle}><span className={s.crumb}>کالاها /</span>{g.display_name}<Badge tone={st.tone}>{st.label}</Badge></span>} />
      <div className={s.detailActions}>
        {g.status === 'ACTIVE' && can('catalog.items.update') ? <Button variant="secondary" icon={<IconEyeOff size={17} />} onClick={() => run(() => m.hide.mutateAsync(g.id), 'کالا در حالت «عدم نمایش» قرار گرفت.')}>عدم نمایش</Button> : null}
        {(g.status === 'HIDDEN' || g.status === 'DRAFT') && can('catalog.items.update') ? <Button variant="secondary" icon={<IconEye size={17} />} onClick={activate}>{g.status === 'HIDDEN' ? 'نمایش' : 'فعال‌سازی'}</Button> : null}
        {g.status === 'ARCHIVED' && can('catalog.items.update') ? <Button variant="secondary" icon={<IconRestore size={17} />} onClick={() => run(() => m.restore.mutateAsync(g.id), 'کالا بازگردانی شد.')}>بازگردانی</Button> : null}
        {g.status !== 'ARCHIVED' && can('catalog.items.delete') ? <Button variant="secondary" icon={<IconArchive size={17} />} onClick={() => setArch(true)}>آرشیو</Button> : null}
        {can('catalog.items.delete') ? <Button variant="secondary" icon={<IconTrash size={17} />} onClick={() => setDel(true)}>حذف</Button> : null}
        <Button variant="secondary" icon={<IconLayoutGrid size={17} />} onClick={() => navigate(`/catalog/products?fam=${g.product_id}`)}>خانواده در لیست</Button>
        {g.status !== 'ARCHIVED' && can('catalog.items.update') ? <Button icon={<IconPencil size={17} />} onClick={() => setEdit(true)}>ویرایش کالا</Button> : null}
      </div>
      <div className={s.wizard}>
        <div className={s.stack}>
          <Card>
            <div className={s.hero}>
              <div className={s.goodHeroSw} aria-hidden>{color ? <span style={{ background: color.hex_code }} /> : null}</div>
              <div className={s.heroText}>
                <div className={s.sub}>{g.brand_name}</div>
                <h2 className={s.heroName}>{g.display_name}</h2>
                <div className={s.sub}>{g.category_name} · <span data-latin>{g.code}</span></div>
                <div className={`${s.price} tnum`} style={{ fontSize: 22, margin: '10px 0' }}>{sale ? <>{faNum(sale)}<Rial /></> : '—'}</div>
                <p className={s.heroDesc}>کالای تکی کوچک‌ترین واحد تعریف است (یک سایز و یک رنگ از ماتریس خانواده)؛ برای فروش، آن را با «ساخت آیتم» در یک آیتم قرار دهید.</p>
              </div>
            </div>
          </Card>
          <div className={s.statRow}>
            <Stat label="موجودی کل" value={<Soon />} />
            <Stat label="سایز" value={<span data-latin>{size?.code ?? '—'}</span>} />
            <Stat label="رنگ" value={<span className={s.swRow} style={{ gap: 6 }}>{color ? <Swatch hex={color.hex_code} big /> : null}{color?.name ?? '—'}</span>} />
            <Stat label="قیمت فروش" value={sale ? <>{faNum(sale)}<Rial /></> : '—'} />
          </div>
          <Card>
            <SectionTitle>مشخصات کالا</SectionTitle>
            <div className={s.inheritGrid}>
              <Kv k="کد کالا" v={<span data-latin>{g.code}</span>} />
              <Kv k="شناسه کالا (SKU)" v={<span data-latin>{g.sku}</span>} />
              <Kv k="بارکد" v={g.barcode ? <><span data-latin>{g.barcode}</span>{g.barcode_source ? <span className={s.muted}> · {g.barcode_source === 'MANUAL' ? 'دستی' : 'خودکار'}</span> : null}</> : '—'} />
              <Kv k="کد برند" v={g.base_code ? <span data-latin>{g.base_code}</span> : '—'} />
              <Kv k="سایز" v={<><span className={s.sizeChip} data-latin>{size?.code ?? '—'}</span>{size?.name && size.name !== size.code ? <span className={s.muted}> {size.name}</span> : null}</>} />
              <Kv k="رنگ" v={<span className={s.swRow} style={{ gap: 6 }}>{color ? <Swatch hex={color.hex_code} big /> : null}{color?.name ?? '—'}{color?.code ? <span className={s.muted} data-latin> {color.code}</span> : null}</span>} />
              <Kv k="واحد اصلی" v={unit ? `${unit.name}` : '—'} />
              <Kv k="گرید" v={`گرید ${faNum(g.grade)}`} />
            </div>
          </Card>
          <Card>
            <SectionTitle extra={can('catalog.products.read') ? <Button size="sm" variant="secondary" icon={<IconPencil size={15} />} onClick={() => setFam(true)}>ویرایش خانواده</Button> : null}>خانواده کالا</SectionTitle>
            <div className={s.inheritGrid}>
              <Kv k="خانواده" v={<>{g.product_name} <span className={s.muted} data-latin>{g.product_code}</span></>} />
              <Kv k="مسیر دسته‌بندی" v={cat} />
              <Kv k="برند" v={g.brand_name || '—'} />
              <Kv k="طرح و مدل" v={g.model_line_name || '—'} />
              <Kv k="جنس" v={g.material_name || '—'} />
            </div>
            <p className={s.sub} style={{ marginTop: 8 }}>این مشخصات برای همه‌ی کالاهای ماتریس یکسان است و از «ویرایش خانواده» تغییر می‌کند.</p>
          </Card>
          <Card>
            <SectionTitle>قیمت و موجودی</SectionTitle>
            <div className={s.boxRow} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <div className={s.box}><span>قیمت فروش</span><b className={s.price}>{sale ? <>{faNum(sale)}<Rial /></> : '—'}</b>{price.data?.updated_at ? <span>به‌روزرسانی {faDateTime(price.data.updated_at)}</span> : null}</div>
              <div className={s.box}><span>قیمت خرید</span><b><Soon /></b></div>
              <div className={s.box}><span>حاشیه سود</span><b><Soon /></b></div>
              <div className={s.box}><span>موجودی / انبار</span><b><Soon /></b></div>
            </div>
          </Card>
          {attrs.length ? (
            <Card>
              <SectionTitle>ویژگی‌ها</SectionTitle>
              <div className={s.inheritGrid}>{attrs.map((a, i) => <Kv key={`${a.attribute_id}-${i}`} k={a.attribute_name} v={attrVal(a)} />)}</div>
            </Card>
          ) : null}
        </div>
        <aside className={s.wizardSide}>
          <Card>
            <SectionTitle>اطلاعات کلی</SectionTitle>
            <div className={s.kvList}>
              <Kv k="نوع" v="کالای تکی" />
              <Kv k="وضعیت" v={<Badge tone={st.tone}>{st.label}</Badge>} />
              <Kv k="کد کالا" v={<span data-latin>{g.code}</span>} />
              <Kv k="خانواده" v={<span data-latin>{g.product_code}</span>} />
              <Kv k="برند" v={g.brand_name} />
              <Kv k="تاریخ ایجاد" v={faDate(g.created_at)} />
            </div>
          </Card>
        </aside>
      </div>
      {edit ? <GoodEditModal id={g.id} onClose={() => { setEdit(false); void q.refetch(); void price.refetch(); }} /> : null}
      {fam ? <FamilyModal productId={g.product_id} onClose={() => { setFam(false); void q.refetch(); }} /> : null}
      {del ? <ConfirmModal title="حذف کالا" confirmLabel="حذف کن" danger onClose={() => setDel(false)} text={<>کالای <b>{g.display_name}</b> برای همیشه حذف می‌شود. اگر استفاده شده باشد (موجودی، سند انبار، سبد، باندل یا جزء آیتم) حذف رد می‌شود و باید آرشیوش کنید.</>}
        onConfirm={async () => { await m.remove.mutateAsync(g.id); toast('کالا حذف شد.'); navigate(`/catalog/products?fam=${g.product_id}`, { replace: true }); }} /> : null}
      {arch ? <ConfirmModal title="آرشیو کالا" confirmLabel="آرشیو کن" danger onClose={() => setArch(false)} text={<>کالای <b>{g.display_name}</b> آرشیو می‌شود. اگر موجودی یا سفارش باز داشته باشد، آرشیو رد می‌شود.</>}
        onConfirm={async () => { await m.archive.mutateAsync(g.id); await q.refetch(); toast('کالا آرشیو شد.'); }} /> : null}
    </>
  );
}
