import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { IconArchive, IconEye, IconEyeOff, IconExternalLink, IconPencil, IconRestore, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { adminApi } from '@/shared/api/client';
import { userMessage } from '@/shared/api/errors';
import { faDate, faNum } from '@/shared/lib/format';
import { useBack } from '@/shared/lib/useBack';
import { Button } from '@/shared/ui/Button';
import { Badge, Card, Empty, PageHead, Segmented, SectionTitle, SkeletonRows, UnitHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useActiveCustomerGroups, useCategoryTree, useItem, useItemMutations, useItemPolicy, usePriceDetail, type CategoryNode, type ItemDetail } from './api';
import { ConfirmModal, Kv, Swatch, thumbColor } from './components';
import { IMAGE_KINDS, ITEM_PATTERN, itemDisplay } from './labels';
import s from './catalog.module.css';

/**
 * «پرونده آیتم» — مطابق html Fixed V2: سربرگ (تصویر، برند، نام، قیمت، توضیح)، چهار کارت آماری، پنج تب
 * (ترکیب و قیمت | نمایش و سفارش | کاردکس | تصاویر | انبار و گرید) و ستون کناری «اطلاعات کلی» + «سئو».
 * کالای تکی (kind GOOD) هم همین صفحه را دارد (ترکیب = مشخصات کالا؛ تصویر ندارد). موجودی، کاردکس، انبار و تغییر گرید تا ماژول انبار «به‌زودی»؛
 * قیمت خرید و حاشیه تا ماژول خرید «—». تب در URL (`tab`).
 * اصلاحات افشین 2026-10-23: سطر اول بازگشت + مسیر + نام (راست‌چین)، سطر دوم دکمه‌ها (چپ‌چین)؛ «ریال» کوچک کنار قیمت کارت‌ها؛
 * جدول کالاهای تشکیل‌دهنده وسط‌چین؛ «تعداد به تفکیک رنگ/سایز» در دو سطر؛ ترتیب تب تصاویر دیجی‌کالایی، مانکنی، انسانی (IMAGE_KINDS).
 */
const Rial = () => <span className={s.rial}>ریال</span>;
const TABS = [{ value: 'compose', label: 'ترکیب و قیمت' }, { value: 'display', label: 'نمایش و سفارش' }, { value: 'kardex', label: 'کاردکس' }, { value: 'images', label: 'تصاویر' }, { value: 'stock', label: 'انبار و گرید' }];
const flatten = (nodes: CategoryNode[], out = new Map<string, CategoryNode>()) => { for (const n of nodes) { out.set(n.id, n); flatten(n.children ?? [], out); } return out; };
const n0 = (v?: string | number | null) => (v == null ? null : Number(v));

export default function ItemDetailPage() {
  const { id } = useParams();
  const can = usePerm();
  const navigate = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'compose';
  const q = useItem(id);
  const it = q.data;
  const back = useBack(it?.kind === 'GOOD' ? `/catalog/products?fam=${it.product_id}` : '/catalog/items');
  const policy = useItemPolicy(id, can('catalog.items.policy.read'));
  const price = usePriceDetail(id, can('pricing.prices.read'));
  const tree = useCategoryTree(true);
  const byId = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const groups = useActiveCustomerGroups(!!it && it.audience === 'GROUPS' && can('customers.groups.list'));
  const m = useItemMutations();
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  if (q.isLoading) return <Card><SkeletonRows rows={6} height={60} /></Card>;
  if (q.error || !it) return <Card><Empty title="آیتم پیدا نشد" text={q.error ? userMessage(q.error) : undefined} /></Card>;
  // کالای تکی صفحه‌ی خودش را زیر «کالاها» دارد (افشین 2026-10-23)
  if (it.kind === 'GOOD') return <Navigate to={`/catalog/products/goods/${it.id}`} replace />;

  const isItem = it.kind === 'ITEM';
  const disp = itemDisplay(it.status, it.audience);
  const cat = (() => { const c = [...byId.values()].find((x) => x.name === it.category_name && !x.children?.length); const p: string[] = []; for (let n = c; n; n = n.parent_id ? byId.get(n.parent_id) : undefined) p.unshift(n.name); return p.join(' › ') || it.category_name; })();
  const sale = n0(price.data?.sale_price);
  const cover = it.images.find((i) => i.is_primary) ?? it.images[0];
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); } catch (e) { toast(userMessage(e), 'error'); } };
  const activate = () => run(async () => { if (!it.barcode) await adminApi(`/catalog/items/${it.id}/barcode`, { method: 'PATCH', body: { value: null } }); await m.activate.mutateAsync(it.id); }, 'آیتم در فروشگاه نمایش داده می‌شود.');

  return (
    <>
      <PageHead back={back}
        title={<span className={s.detailTitle}><span className={s.crumb}>{isItem ? 'آیتم‌ها' : 'کالاها'} /</span>{it.display_name}<Badge tone={disp.tone}>{disp.label}</Badge></span>} />
      <div className={s.detailActions}>
          {it.status === 'ACTIVE' && can('catalog.items.update') ? <Button variant="secondary" icon={<IconEyeOff size={17} />} onClick={() => run(() => m.hide.mutateAsync(it.id), 'آیتم از فروشگاه پنهان شد.')}>عدم نمایش</Button> : null}
          {(it.status === 'HIDDEN' || it.status === 'DRAFT') && can('catalog.items.update') ? <Button variant="secondary" icon={<IconEye size={17} />} onClick={activate}>نمایش در فروشگاه</Button> : null}
          {it.status === 'ARCHIVED' && can('catalog.items.update') ? <Button variant="secondary" icon={<IconRestore size={17} />} onClick={() => run(() => m.restore.mutateAsync(it.id), 'آیتم بازگردانی شد.')}>بازگردانی</Button> : null}
          {it.status !== 'ARCHIVED' && can('catalog.items.delete') ? <Button variant="secondary" icon={<IconArchive size={17} />} onClick={() => setConfirm('archive')}>آرشیو</Button> : null}
          {it.status === 'DRAFT' && can('catalog.items.delete') ? <Button variant="secondary" icon={<IconTrash size={17} />} onClick={() => setConfirm('delete')}>حذف</Button> : null}
          <Button variant="secondary" icon={<IconExternalLink size={17} />} disabled data-tip="به‌زودی (فروشگاه)">مشاهده در فروشگاه</Button>
          {isItem && it.status !== 'ARCHIVED' && can('catalog.items.update') ? <Button icon={<IconPencil size={17} />} onClick={() => navigate(`/catalog/items/${it.id}/edit`)}>ویرایش آیتم</Button> : null}
      </div>
      <div className={s.wizard}>
        <div className={s.stack}>
          <Card>
            <div className={s.hero}>
              <div className={s.heroThumb} style={cover ? { backgroundImage: `url(${cover.url})` } : { background: thumbColor(it.code) }}>{cover ? null : it.display_name.slice(0, 1)}</div>
              <div className={s.heroText}>
                <div className={s.sub}>{it.brand_name}</div>
                <h2 className={s.heroName}>{it.display_name}</h2>
                <div className={s.sub}>{it.category_name} · <span data-latin>{it.code}</span></div>
                <div className={`${s.price} tnum`} style={{ fontSize: 22, margin: '10px 0' }}>{sale ? <>{faNum(sale)}<Rial /></> : '—'}</div>
                <p className={s.heroDesc}>{it.description || 'برای این آیتم توضیحاتی ثبت نشده است.'}</p>
              </div>
            </div>
          </Card>
          <div className={s.statRow}>
            <Stat label="موجودی کل" value={<span className={s.muted} data-tip="از ماژول انبار (به‌زودی)">—</span>} />
            <Stat label={isItem ? 'تعداد متغیر' : 'گرید'} value={faNum(isItem ? it.components.length : it.grade)} />
            <Stat label="قیمت فروش" value={sale ? <>{faNum(sale)}<Rial /></> : '—'} />
            <Stat label="حاشیه سود" value={<span className={s.muted} data-tip="نیازمند قیمت خرید">—</span>} />
          </div>
          <Segmented value={tab} onChange={(v) => setSp((p) => { const n = new URLSearchParams(p); if (v === 'compose') n.delete('tab'); else n.set('tab', v); return n; }, { replace: true })} options={TABS} />
          {tab === 'compose' ? (isItem ? <ComposeTab it={it} price={price.data} canPrice={can('pricing.prices.read')} /> : <GoodTab it={it} sale={sale} />) : null}
          {tab === 'display' ? <DisplayTab it={it} policy={policy.data} groupNames={(groups.data ?? []).filter((g) => it.visible_group_ids.includes(g.id)).map((g) => g.name)} /> : null}
          {tab === 'kardex' ? <Card><SectionTitle>کاردکس آیتم</SectionTitle><Empty title="به‌زودی" text="ورود و خروج و مانده‌ی موجودی از ماژول انبار نمایش داده می‌شود." /></Card> : null}
          {tab === 'images' ? <ImagesTab it={it} onEdit={isItem && can('catalog.items.update') ? () => navigate(`/catalog/items/${it.id}/edit?step=3`) : undefined} /> : null}
          {tab === 'stock' ? <>
            <Card><SectionTitle>انبارها و آدرس نگه‌داری</SectionTitle><Empty title="به‌زودی" text="موجودی هر انبار، آدرس قفسه و تخفیف انبار از ماژول انبار می‌آید." /></Card>
            <Card><SectionTitle extra={<span className={s.sub}>گرید فعلی <Badge tone={it.grade === 1 ? 'success' : it.grade === 2 ? 'warning' : 'neutral'}>گرید {faNum(it.grade)}</Badge></span>}>تغییر گرید آیتم</SectionTitle><p className={s.sub}>تغییر گرید (انتخاب انبار، تعداد و گرید جدید با درصد تعدیل قیمت) با تأیید انبار انجام می‌شود — به‌زودی از ماژول انبار.</p></Card>
          </> : null}
        </div>
        <aside className={s.wizardSide}>
          <Card>
            <SectionTitle>اطلاعات کلی</SectionTitle>
            <div className={s.kvList}>
              <Kv k={isItem ? 'کد آیتم' : 'کد کالا'} v={<span data-latin>{it.code}</span>} />
              <Kv k="SKU" v={<span data-latin>{it.sku}</span>} />
              <Kv k="بارکد" v={it.barcode ? <span data-latin>{it.barcode}</span> : '—'} />
              <Kv k="برند" v={it.brand_name} />
              <Kv k="مسیر دسته‌بندی" v={cat} />
              <Kv k="طرح و مدل" v={it.model_line_name || '—'} />
              <Kv k="جنس" v={it.material_name || '—'} />
              {isItem ? <Kv k="تعداد کالا در آیتم" v={`${faNum(Number(it.goods_count))} عدد`} /> : null}
              <Kv k="گرید" v={`گرید ${faNum(it.grade)}`} />
              <Kv k="حداقل سفارش" v={policy.data ? `حداقل ${faNum(Number(policy.data.min_order_qty))} ${isItem ? 'آیتم' : 'عدد'}` : '—'} />
              <Kv k="آستانه خرید" v={policy.data?.reorder_threshold != null ? `${faNum(Number(policy.data.reorder_threshold))} عدد` : '—'} />
              <Kv k="سقف انباشت" v={policy.data?.max_stock_cap != null ? `حداکثر ${faNum(Number(policy.data.max_stock_cap))} عدد` : '—'} />
              <Kv k="تاریخ ایجاد" v={faDate(it.created_at)} />
            </div>
          </Card>
          <Card>
            <SectionTitle>سئو</SectionTitle>
            <div className={s.segLabel}>Slug</div><div className={s.readBox} data-latin style={{ margin: '6px 0 12px' }}>{it.slug || '—'}</div>
            <div className={s.segLabel}>Meta Title</div><div style={{ marginTop: 6 }}>{it.meta_title || '—'}</div>
          </Card>
        </aside>
      </div>
      {confirm === 'archive' ? <ConfirmModal title="آرشیو آیتم" confirmLabel="آرشیو کن" danger onClose={() => setConfirm(null)} text={<>آیتم <b>{it.display_name}</b> آرشیو می‌شود و در فروشگاه و لیست‌های فعال دیده نمی‌شود. اگر موجودی یا سفارش باز داشته باشد، آرشیو رد می‌شود.</>}
        onConfirm={async () => { await m.archive.mutateAsync(it.id); toast('آیتم آرشیو شد.'); }} /> : null}
      {confirm === 'delete' ? <ConfirmModal title="حذف پیش‌نویس آیتم" confirmLabel="حذف کن" danger onClose={() => setConfirm(null)} text={<>پیش‌نویس <b>{it.display_name}</b> برای همیشه حذف می‌شود.</>}
        onConfirm={async () => { await m.remove.mutateAsync(it.id); toast('پیش‌نویس آیتم حذف شد.'); navigate('/catalog/items', { replace: true }); }} /> : null}
    </>
  );
}

const Stat = ({ label, value }: { label: string; value: ReactNode }) => <div className={s.stat}><b className="tnum">{value}</b><span>{label}</span></div>;

function ComposeTab({ it, price, canPrice }: { it: ItemDetail; price?: ReturnType<typeof usePriceDetail>['data']; canPrice: boolean }) {
  const pc = (cid: string) => price?.components?.find((c) => c.item_id === cid);
  const fixedName = it.variation_pattern === 'FIXED_COLOR' ? it.colors[0]?.name : it.variation_pattern === 'FIXED_SIZE' ? it.sizes[0]?.code : '';
  const bySize = new Map<string, number>(); const byColor = new Map<string, number>();
  it.components.forEach((c) => { if (c.size_code) bySize.set(c.size_code, (bySize.get(c.size_code) ?? 0) + Number(c.quantity)); if (c.color_code) byColor.set(c.color_code, (byColor.get(c.color_code) ?? 0) + Number(c.quantity)); });
  const colorOf = (code: string) => it.colors.find((c) => c.code === code);
  const sizeCodes = it.sizes.map((x) => x.code).filter((c) => bySize.has(c)); const colorCodes = it.colors.map((x) => x.code).filter((c) => byColor.has(c));
  return <>
    <Card>
      <SectionTitle>کالاهای تشکیل‌دهنده آیتم</SectionTitle>
      <div className={s.boxRow}>
        <div className={s.box}><span>الگوی تنوع</span><b>{ITEM_PATTERN[it.variation_pattern] ?? '—'}</b></div>
        <div className={s.box}><span>متغیر ثابت</span><b>{fixedName || '—'}</b></div>
        <div className={`${s.box} ${s.boxBrand}`}><span>تعداد کل کالا در آیتم</span><b>{faNum(Number(it.goods_count))} عدد</b></div>
      </div>
      <div className={`${s.goodsPick} ${s.centerTable}`} style={{ marginTop: 12 }} data-components>
        <table>
          <thead><tr><th>کد کالا</th><th>سایز</th><th>رنگ</th><th>تعداد در آیتم</th><th><UnitHead>قیمت واحد</UnitHead></th><th><UnitHead>جمع در آیتم</UnitHead></th><th>موجودی کالا</th></tr></thead>
          <tbody>{it.components.map((c) => { const p = pc(c.component_id); const cl = c.color_code ? colorOf(c.color_code) : undefined; return (
            <tr key={c.component_id}>
              <td className={s.muted} data-latin>{c.code}</td>
              <td><span className={s.sizeChip} data-latin>{c.size_code ?? '—'}</span></td>
              <td><span className={s.swRow} style={{ gap: 6 }}><Swatch hex={cl?.hex_code} big />{cl?.name ?? c.color_code ?? '—'}</span></td>
              <td className={`${s.price} tnum`}>{faNum(Number(c.quantity))} عدد</td>
              <td className="tnum">{canPrice && p?.sale_price ? faNum(Number(p.sale_price)) : '—'}</td>
              <td className="tnum"><b>{canPrice && p?.line_total ? faNum(Number(p.line_total)) : '—'}</b></td>
              <td><span className={s.muted} data-tip="از ماژول انبار (به‌زودی)">—</span></td>
            </tr>
          ); })}</tbody>
        </table>
      </div>
      <div className={s.dimTotals}>
        <div className={s.dimLine}><span className={s.segLabel}>تعداد به تفکیک رنگ</span>{colorCodes.map((c) => <span key={c} className={s.totChip}><Swatch hex={colorOf(c)?.hex_code} big />{colorOf(c)?.name} <b>{faNum(byColor.get(c)!)} عدد</b></span>)}</div>
        <div className={s.dimLine}><span className={s.segLabel}>تعداد به تفکیک سایز</span>{sizeCodes.map((c) => <span key={c} className={s.totChip}><span data-latin>{c}</span> <b>{faNum(bySize.get(c)!)} عدد</b></span>)}</div>
      </div>
    </Card>
    <Card>
      <SectionTitle>قیمت آیتم</SectionTitle>
      <div className={s.boxRow} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className={s.box}><span>قیمت فروش آیتم</span><b className={s.price}>{canPrice && price?.sale_price ? <>{faNum(Number(price.sale_price))}<Rial /></> : '—'}</b></div>
        <div className={s.box}><span>جمع قیمت کالاهای آیتم</span><b>{canPrice && price?.base_price ? <>{faNum(Number(price.base_price))}<Rial /></> : '—'}</b></div>
        <div className={s.box}><span>قیمت خرید</span><b className={s.muted} data-tip="از ماژول خرید (به‌زودی)">—</b></div>
        <div className={s.box}><span>حاشیه سود</span><b className={s.muted}>—</b></div>
      </div>
      <p className={s.sub} style={{ marginTop: 8 }}>مبنای قیمت: جمع قیمت کالاهای آیتم{price?.adjustment_pct != null && Number(price.adjustment_pct) !== 0 ? ` · تعدیل ${faNum(Number(price.adjustment_pct))}٪` : ''}{price?.unpriced_component_codes?.length ? ` · بدون قیمت: ${price.unpriced_component_codes.join('، ')}` : ''}</p>
    </Card>
    {sizeCodes.length && colorCodes.length ? (
      <Card>
        <SectionTitle>قیمت کالاهای آیتم به تفکیک سایز و رنگ</SectionTitle>
        <p className={s.intro}>قیمت هر سایز به ازای هر رنگ در این آیتم — سلول خالی یعنی آن ترکیب عضو این آیتم نیست.</p>
        <div className={s.matrix}><table>
          <thead><tr><th className={s.sub}>(ریال)</th> {colorCodes.map((c) => <th key={c}><span className={s.swRow} style={{ gap: 6 }}><Swatch hex={colorOf(c)?.hex_code} big />{colorOf(c)?.name}</span></th>)}</tr></thead>
          <tbody>{sizeCodes.map((sz) => <tr key={sz}><th data-latin>{sz}</th>{colorCodes.map((cl) => { const c = it.components.find((x) => x.size_code === sz && x.color_code === cl); const p = c ? pc(c.component_id) : undefined; return <td key={cl}><div className={`${s.cell} ${c ? '' : s.cellOff}`}><b className="tnum">{c && canPrice && p?.sale_price ? faNum(Number(p.sale_price)) : '—'}</b><span className={s.sub}>{c ? `${faNum(Number(c.quantity))} عدد` : '—'}</span></div></td>; })}</tr>)}</tbody>
        </table></div>
      </Card>
    ) : null}
  </>;
}

function GoodTab({ it, sale }: { it: ItemDetail; sale: number | null }) {
  return (
    <Card>
      <SectionTitle>مشخصات کالا</SectionTitle>
      <div className={s.boxRow} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className={s.box}><span>سایز</span><b data-latin>{it.sizes[0]?.code ?? '—'}</b></div>
        <div className={s.box}><span>رنگ</span><b><span className={s.swRow} style={{ gap: 6 }}><Swatch hex={it.colors[0]?.hex_code} big />{it.colors[0]?.name ?? '—'}</span></b></div>
        <div className={s.box}><span>قیمت فروش</span><b className={s.price}>{sale ? <>{faNum(sale)}<Rial /></> : '—'}</b></div>
        <div className={s.box}><span>قیمت خرید</span><b className={s.muted}>—</b></div>
      </div>
      <p className={s.sub} style={{ marginTop: 8 }}>کالای تکی کوچک‌ترین واحد تعریف است؛ برای فروش، آن را با «ساخت آیتم» در یک آیتم قرار دهید. خانواده: <span data-latin>{it.product_code}</span></p>
    </Card>
  );
}

function DisplayTab({ it, policy, groupNames }: { it: ItemDetail; policy?: ReturnType<typeof useItemPolicy>['data']; groupNames: string[] }) {
  const d = itemDisplay(it.status, it.audience);
  const unit = it.kind === 'ITEM' ? 'آیتم' : 'عدد';
  const days = policy?.target_deadline ? Math.ceil((new Date(policy.target_deadline).getTime() - Date.now()) / 86400000) : null;
  return <>
    <Card>
      <SectionTitle>نمایش و موجودی</SectionTitle>
      <div className={s.boxRow} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className={s.box}><span>وضعیت موجودی</span><b className={s.muted} data-tip="از ماژول انبار (به‌زودی)">—</b></div>
        <div className={s.box}><span>وضعیت نمایش</span><b><Badge tone={d.tone}>{d.label}</Badge></b></div>
        <div className={s.box}><span>نمایش در پابلیک</span><b>{it.show_in_public ? 'بله' : 'خیر'}</b><span>{it.audience === 'GROUPS' ? (groupNames.join('، ') || 'گروه‌های انتخابی') : 'همه مشتریان'}</span></div>
        <div className={s.box}><span>آخرین خرید / فروش</span><b className={s.muted} data-tip="از ماژول‌های خرید و فروش (به‌زودی)">—</b></div>
      </div>
    </Card>
    <Card>
      <SectionTitle>تنظیمات سفارش</SectionTitle>
      {!policy ? <p className={s.sub}>سیاست سفارش در دسترس نیست.</p> : (
        <div className={s.inheritGrid} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Kv k="حداقل تعداد سفارش" v={`${faNum(Number(policy.min_order_qty))} ${unit}`} />
          <Kv k="حداکثر تعداد سفارش" v={policy.max_order_qty != null ? `${faNum(Number(policy.max_order_qty))} ${unit}` : 'بدون محدودیت'} />
          <Kv k="حداکثر پیش‌سفارش" v={!it.allow_preorder ? 'پیش‌سفارش ندارد' : policy.max_preorder_qty != null ? `${faNum(Number(policy.max_preorder_qty))} ${unit}` : '—'} />
          <Kv k="آستانه خرید" v={policy.reorder_threshold != null ? `${faNum(Number(policy.reorder_threshold))} عدد` : '—'} />
          <Kv k="سقف انباشت" v={policy.max_stock_cap != null ? `حداکثر ${faNum(Number(policy.max_stock_cap))} عدد` : 'بدون سقف'} />
        </div>
      )}
    </Card>
    <Card>
      <SectionTitle>تارگت فروش</SectionTitle>
      {!policy?.sales_target ? <p className={s.sub}>تارگت فروش تعیین نشده است.</p> : <>
        <div className={s.inheritGrid}>
          <Kv k="تارگت" v={`${faNum(Number(policy.sales_target))} ${unit}`} />
          <Kv k="ددلاین" v={policy.target_deadline ? faDate(policy.target_deadline) : '—'} />
          <Kv k="روز مانده" v={days == null ? '—' : days >= 0 ? `${faNum(days)} روز` : 'گذشته'} />
          <Kv k="تعداد مانده" v={<span className={s.muted} data-tip="نیازمند داده‌ی فروش (به‌زودی)">—</span>} />
        </div>
        <p className={s.sub} style={{ marginTop: 8 }}>درصد تحقق تارگت پس از راه‌اندازی ماژول فروش نمایش داده می‌شود.</p>
      </>}
    </Card>
  </>;
}

function ImagesTab({ it, onEdit }: { it: ItemDetail; onEdit?: () => void }) {
  if (it.kind === 'GOOD') return <Card><SectionTitle>تصاویر</SectionTitle><Empty title="کالای تکی تصویر ندارد" text="تصاویر روی آیتم (واحد فروش) ثبت می‌شوند." /></Card>;
  return <>{IMAGE_KINDS.map((t) => { const imgs = it.images.filter((i) => i.kind === t.kind); return (
    <Card key={t.kind}>
      <SectionTitle extra={<span className={s.muted}>{faNum(imgs.length)} تصویر</span>}>{t.label}</SectionTitle>
      <p className={s.intro}>{t.hint}</p>
      <div className={s.tiles}>
        {imgs.map((i, k) => <div key={i.id} className={s.tile} style={{ backgroundImage: `url(${i.url})` }}>{i.is_primary ? <span className={s.coverTag}>کاور</span> : null}<span className={s.tileNum}>{faNum(k + 1)}</span></div>)}
        {onEdit ? <button type="button" className={s.tileAdd} onClick={onEdit}>+<span>افزودن تصویر</span></button> : null}
      </div>
    </Card>
  ); })}</>;
}
