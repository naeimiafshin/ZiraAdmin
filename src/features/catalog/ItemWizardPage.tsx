import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { IconCheck, IconChevronLeft, IconChevronRight, IconDeviceFloppy, IconFilterOff, IconPhotoPlus, IconSearch, IconX } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { adminApi } from '@/shared/api/client';
import { faNum, gregorianToJalaliText, jalaliTextToGregorian } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { useBack } from '@/shared/lib/useBack';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Field, FormGrid, Input, Select, Textarea, Toggle } from '@/shared/ui/form';
import { JalaliDateInput } from '@/shared/ui/JalaliDateInput';
import { Stepper } from '@/shared/ui/Stepper';
import { Badge, Card, Empty, Modal, PageHead, Pagination, Segmented, SectionTitle, SkeletonRows, UnitHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import {
  itemUnitOptions, previewItemName, useActiveCustomerGroups, useAllBrands, useAttributesByRole, useCategoryTree, useItem, useItemMutations, useItemPolicy, useItems, usePriceDetail, usePricesFor, useProducts,
  type CategoryNode, type ImageRowIn, type ItemCreateIn, type ItemRow, type ItemUnitOptions, type ProductRow,
} from './api';
import { AttributeFields, listToRows, rowsToList, type AttrRows } from './attributeFields';
import { Kv, Swatch, thumbColor } from './components';
import { IMAGE_KINDS, ITEM_PATTERN, LINK_MODE } from './labels';
import { ItemPreviewCarousel, RatioWarningModal, ratioOk, useImageDims, type GalleryImg } from './itemImages';
import s from './catalog.module.css';

/**
 * «ساخت آیتم (واحد فروش)» و «ویرایش آیتم» — مطابق html Fixed V2، پنج مرحله: ۱) ترکیب و قیمت‌گذاری (خانواده، الگوی تنوع، کالاها و تعداد، درصد تعدیل)
 * ۲) اطلاعات پایه (عنوان، کد برند، وضعیت نمایش، توضیحات، ویژگی‌ها، مشخصات خانواده، دامنه‌ی نمایش) ۳) انبار و سفارش (سیاست سفارش؛ انبار «به‌زودی»)
 * ۴) گالری (سه دسته تصویر؛ آپلود بعد از ثبت با PUT /items/{id}/images) ۵) تنظیمات تکمیلی (سئو، فروش مکمل، تارگت).
 * ثبت = POST /items یک‌جا (تصمیم 2026-10-15). قیمت (افشین 2026-10-22): جمع قیمت کالاها + درصد تعدیل؛ «قیمت دستی» به‌زودی؛ تخفیف حذف.
 * «ذخیره پیش‌نویس» = ساخت آیتم با status=DRAFT (افشین 2026-10-22). ویرایش: ترکیب قفل (بک‌اند تغییر اجزا ندارد)، بقیه با endpointهای جدا.
 * اصلاحات افشین 2026-10-23: تب «ترکیب و قیمت‌گذاری» در ویرایش عین html (همان چهار کارت و ستون کناری ساخت آیتم) با بخش‌های قفل خاموش
 * (خانواده، الگو، کالاها و تعداد) و فقط درصد تعدیل قابل ویرایش؛ مرحله‌ی گذشته = دایره‌ی سبز با عدد؛ زیرعنوان در ویرایش حذف؛ «ریال» کنار قیمت کارت‌ها.
 */
type Pattern = 'FIXED_COLOR' | 'FIXED_SIZE' | 'FREE';
type Status = 'ACTIVE' | 'HIDDEN' | 'DRAFT';
type NewImg = { key: string; file: File; url: string; kind: ImageRowIn['kind'] };
type OldImg = { id: string; url: string; kind: ImageRowIn['kind']; is_primary: boolean };
const STEPS = ['ترکیب و قیمت‌گذاری', 'اطلاعات پایه', 'انبار و سفارش', 'گالری', 'تنظیمات تکمیلی'];
const Rial = () => <span className={s.rial}>ریال</span>;
const digits = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, '');
const pct = (v: string) => toLatinDigits(v).replace(/[^0-9.-]/g, '');
const flatten = (nodes: CategoryNode[], out = new Map<string, CategoryNode>()) => { for (const n of nodes) { out.set(n.id, n); flatten(n.children ?? [], out); } return out; };
const pathOf = (byId: Map<string, CategoryNode>, id?: string) => { const p: string[] = []; for (let n = id ? byId.get(id) : undefined; n; n = n.parent_id ? byId.get(n.parent_id) : undefined) p.unshift(n.name); return p.join(' › ') || '—'; };

export default function ItemWizardPage() {
  const { id: editId } = useParams();
  const isEdit = !!editId;
  const can = usePerm();
  const navigate = useNavigate();
  const back = useBack(isEdit ? `/catalog/items/${editId}` : '/catalog/items');
  const toast = useToast();
  const m = useItemMutations();
  const qc = useQueryClient();
  const tree = useCategoryTree(true);
  const byId = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const itemAttrs = useAttributesByRole('ITEM'); const descAttrs = useAttributesByRole('DESCRIPTIVE');
  const groups = useActiveCustomerGroups(can('customers.groups.list'));
  const edit = useItem(editId); const editPolicy = useItemPolicy(editId, can('catalog.items.policy.read')); const editPrice = usePriceDetail(editId, isEdit && can('pricing.prices.read'));

  const [sp] = useSearchParams();
  const [step, setStep] = useState(() => Math.min(4, Math.max(0, Number(sp.get('step')) || 0)));
  const [err, setErr] = useState<string | null>(null);
  const [fam, setFam] = useState<ProductRow | null>(null);
  const [pattern, setPattern] = useState<Pattern>('FIXED_COLOR');
  const [fixed, setFixed] = useState('');
  const [members, setMembers] = useState<Record<string, number>>({});
  const [adj, setAdj] = useState('');
  const [unitOpt, setUnitOpt] = useState<ItemUnitOptions | null>(null);
  const [unitId, setUnitId] = useState(''); const [createUnit, setCreateUnit] = useState(false);
  const [autoName, setAutoName] = useState('');
  const [title, setTitle] = useState(''); const [baseCode, setBaseCode] = useState(''); const [status, setStatus] = useState<Status>('ACTIVE');
  const [desc, setDesc] = useState(''); const [attrRows, setAttrRows] = useState<AttrRows>({});
  const [audience, setAudience] = useState<'ALL' | 'GROUPS'>('ALL'); const [groupIds, setGroupIds] = useState<string[]>([]); const [isPublic, setIsPublic] = useState(true);
  const [pol, setPol] = useState({ min_order_qty: '1', max_order_qty: '', max_preorder_qty: '', reorder_threshold: '', max_stock_cap: '' });
  const [preorder, setPreorder] = useState(false);
  const [newImgs, setNewImgs] = useState<NewImg[]>([]); const [oldImgs, setOldImgs] = useState<OldImg[]>([]); const [cover, setCover] = useState<string>('');
  /** قانون نسبت ۲:۳ تصویر آیتم (افشین 2026-11-04): هشدار در بارگذاری و با «مرحله بعد» از گالری، با امکان ادامه (ذخیره هشدار نمی‌دهد) */
  const galleryImgs: GalleryImg[] = useMemo(() => IMAGE_KINDS.flatMap(({ kind, label }) => [
    ...oldImgs.filter((x) => x.kind === kind).map((x) => ({ key: x.id, url: x.url, kindLabel: label })),
    ...newImgs.filter((x) => x.kind === kind).map((x) => ({ key: x.key, url: x.url, kindLabel: label })),
  ]), [oldImgs, newImgs]);
  const dims = useImageDims(galleryImgs);
  const badImgs = galleryImgs.filter((g) => { const d = dims[g.key]; return !!d && !ratioOk(d); });
  const badSig = badImgs.map((b) => b.key).join('|');
  const [ratioAck, setRatioAck] = useState('');
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [ratioWarn, setRatioWarn] = useState<null | { mode: 'upload'; keys: string[] } | { mode: 'continue'; then: () => void }>(null);
  useEffect(() => {
    if (!pendingKeys.length || !pendingKeys.every((k) => k in dims)) return;
    const bad = pendingKeys.filter((k) => { const d = dims[k]; return !!d && !ratioOk(d); });
    setPendingKeys([]);
    if (bad.length) setRatioWarn({ mode: 'upload', keys: bad });
  }, [pendingKeys, dims]);
  const guardRatio = (then: () => void) => { if (badSig && badSig !== ratioAck) setRatioWarn({ mode: 'continue', then }); else then(); };
  const [metaTitle, setMetaTitle] = useState(''); const [slug, setSlug] = useState(''); const [metaDesc, setMetaDesc] = useState('');
  const [related, setRelated] = useState<'AUTO' | 'MANUAL' | 'OFF'>('AUTO'); const [similar, setSimilar] = useState<'AUTO' | 'MANUAL' | 'OFF'>('AUTO');
  const [relIds, setRelIds] = useState<{ id: string; name: string }[]>([]); const [simIds, setSimIds] = useState<{ id: string; name: string }[]>([]);
  const [picker, setPicker] = useState<'RELATED' | 'SIMILAR' | null>(null);
  const [target, setTarget] = useState(''); const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const d = edit.data; if (!d || loaded.current) return; loaded.current = true;
    setPattern((d.variation_pattern || 'FREE') as Pattern);
    setFixed(d.variation_pattern === 'FIXED_COLOR' ? d.colors[0]?.id ?? '' : d.variation_pattern === 'FIXED_SIZE' ? d.sizes[0]?.id ?? '' : '');
    setMembers(Object.fromEntries(d.components.map((c) => [c.component_id, Number(c.quantity)])));
    setTitle(d.display_name); setBaseCode(d.base_code); setStatus((d.status === 'ARCHIVED' ? 'HIDDEN' : d.status) as Status); setDesc(d.description);
    setAttrRows(listToRows(d.attribute_values)); setAudience(d.audience as 'ALL' | 'GROUPS'); setGroupIds(d.visible_group_ids); setIsPublic(d.show_in_public); setPreorder(d.allow_preorder);
    setOldImgs(d.images.map((i) => ({ id: i.id, url: i.url, kind: i.kind as ImageRowIn['kind'], is_primary: i.is_primary }))); setCover(d.images.find((i) => i.is_primary)?.id ?? '');
    setMetaTitle(d.meta_title); setSlug(d.slug); setMetaDesc(d.meta_description); setRelated(d.related_mode as never); setSimilar(d.similar_mode as never);
    setRelIds(d.relations.filter((r) => r.kind === 'RELATED').map((r) => ({ id: r.related_item_id, name: r.related_item_name })));
    setSimIds(d.relations.filter((r) => r.kind === 'SIMILAR').map((r) => ({ id: r.related_item_id, name: r.related_item_name })));
  }, [edit.data]);
  useEffect(() => { const p = editPolicy.data; if (!p) return; const n = (v?: string | number | null) => (v == null ? '' : String(Number(v)));
    setPol({ min_order_qty: n(p.min_order_qty) || '1', max_order_qty: n(p.max_order_qty), max_preorder_qty: n(p.max_preorder_qty), reorder_threshold: n(p.reorder_threshold), max_stock_cap: n(p.max_stock_cap) });
    setTarget(n(p.sales_target)); setDeadline(p.target_deadline ? gregorianToJalaliText(p.target_deadline) : ''); }, [editPolicy.data]);
  useEffect(() => { const p = editPrice.data; if (p?.adjustment_pct != null) setAdj(String(Number(p.adjustment_pct))); }, [editPrice.data]);
  const famQ = useProducts({ page: 1, page_size: 5, query: edit.data?.product_code || undefined }, isEdit && !!edit.data);
  useEffect(() => { if (isEdit && edit.data && famQ.data && !fam) setFam(famQ.data.results.find((p) => p.id === edit.data!.product_id) ?? null); }, [isEdit, edit.data, famQ.data, fam]);

  const goods = useItems({ product_id: fam?.id, kind: 'GOOD', page_size: 100 }, !!fam);
  const canPrice = can('pricing.prices.list');
  const goodIds = useMemo(() => (goods.data?.results ?? []).map((g) => g.id), [goods.data]);
  const prices = usePricesFor(goodIds, canPrice);
  const priceOf = (gid: string) => Number(prices.data?.get(gid)?.sale_price ?? 0);
  // در ویرایش کالاهای عضو حتی اگر بعداً آرشیو شده باشند دیده می‌شوند
  const pool = (goods.data?.results ?? []).filter((g) => !!members[g.id] || (g.status !== 'ARCHIVED' && (pattern === 'FREE' || (pattern === 'FIXED_COLOR' ? g.colors[0]?.id === fixed : g.sizes[0]?.id === fixed))));
  // C-27 ✅ (2026-10-24، افشین «همیشه، با نگهبان»): در ویرایش خانواده ثابت است؛ الگو، کالاها و تعداد قابل تغییرند ⇐ PUT /items/{id}/components.
  // بک‌اند اگر آیتم موجودی/رزرو یا سند باز انبار داشته باشد ۴۰۹ با دلیل‌ها برمی‌گرداند؛ قیمت با همان درصد تعدیل دوباره محاسبه می‌شود.
  const canComp = can('catalog.items.update') && edit.data?.status !== 'ARCHIVED';
  const lk = isEdit && !canComp;
  const origComp = useMemo(() => (edit.data ? JSON.stringify({ p: edit.data.variation_pattern, c: [...edit.data.components].map((c) => [c.component_id, Number(c.quantity)]).sort() }) : ''), [edit.data]);
  const compChanged = isEdit && !!edit.data && JSON.stringify({ p: pattern, c: Object.entries(members).map(([k, v]) => [k, v]).sort() }) !== origComp;
  const chosen = (goods.data?.results ?? []).filter((g) => members[g.id]);
  const comps = chosen.map((g) => ({ item_id: g.id, quantity: members[g.id]! }));
  const pieces = comps.reduce((a, c) => a + c.quantity, 0);
  const sumSale = chosen.reduce((a, g) => a + priceOf(g.id) * members[g.id]!, 0);
  const adjN = Number(pct(adj)) || 0;
  const finalPrice = Math.round(sumSale * (1 + adjN / 100));
  const unpriced = chosen.filter((g) => !prices.data?.get(g.id)?.sale_price);
  const grades = new Set(chosen.map((g) => g.grade)); const unitsSet = new Set(chosen.map((g) => g.unit_id));
  const oneVar = pattern === 'FREE' ? true : pattern === 'FIXED_COLOR' ? new Set(chosen.map((g) => g.colors[0]?.id)).size <= 1 : new Set(chosen.map((g) => g.sizes[0]?.id)).size <= 1;

  const compKey = JSON.stringify(comps);
  useEffect(() => {
    if ((isEdit && !compChanged) || !fam || !comps.length) { setUnitOpt(null); setUnitId(''); setAutoName(''); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      itemUnitOptions({ product_id: fam.id, components: comps }, ctl.signal).then((o) => { setUnitOpt(o); setUnitId(o.selected_unit_id ?? ''); setCreateUnit(false); }).catch(() => setUnitOpt(null));
      previewItemName({ product_id: fam.id, variation_pattern: pattern, components: comps }, ctl.signal).then((r) => setAutoName(r.display_name)).catch(() => setAutoName(''));
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [compKey, fam?.id, isEdit, compChanged, pattern]); // eslint-disable-line react-hooks/exhaustive-deps

  const composeError = (): string | null => {
    if (isEdit && !compChanged) return null;
    if (!fam) return 'ابتدا خانواده کالا را انتخاب کنید.';
    if (pattern !== 'FREE' && !fixed) return pattern === 'FIXED_COLOR' ? 'رنگ ثابت آیتم را انتخاب کنید.' : 'سایز ثابت آیتم را انتخاب کنید.';
    if (!comps.length) return 'دست‌کم یک کالا برای آیتم انتخاب کنید.';
    if (grades.size > 1) return 'همه‌ی کالاهای آیتم باید گرید یکسان داشته باشند.';
    if (unitOpt?.needs_choice && !unitId) return 'واحد فروش آیتم را انتخاب کنید.';
    if (unitOpt?.needs_creation && !createUnit) return `واحد «${unitOpt.suggestion?.name ?? ''}» وجود ندارد؛ ساخت آن را تأیید کنید.`;
    return null;
  };
  const goNow = (i: number) => { const e = i > 0 ? composeError() : null; if (e) { toast(e, 'error'); setStep(0); return; } setErr(null); setStep(i); window.scrollTo({ top: 0 }); };
  const go = (i: number) => { if (step === 3 && i > step) guardRatio(() => goNow(i)); else goNow(i); };

  const policyBody = () => {
    const n = (v: string) => (digits(v) ? digits(v) : null);
    return { min_order_qty: n(pol.min_order_qty) ?? '1', max_order_qty: n(pol.max_order_qty), max_preorder_qty: n(pol.max_preorder_qty), reorder_threshold: n(pol.reorder_threshold), max_stock_cap: n(pol.max_stock_cap), sales_target: n(target), target_deadline: deadline ? jalaliTextToGregorian(deadline) : null };
  };
  const imageRows = (): { rows: ImageRowIn[]; files: File[] } => {
    const rows: ImageRowIn[] = []; const files: File[] = [];
    const coverKey = cover || oldImgs[0]?.id || newImgs[0]?.key || '';
    IMAGE_KINDS.forEach(({ kind }) => {
      oldImgs.filter((i) => i.kind === kind).forEach((i) => rows.push({ id: i.id, kind, sort_order: rows.length, is_primary: i.id === coverKey }));
      newImgs.filter((i) => i.kind === kind).forEach((i) => { rows.push({ file_index: files.length, kind, sort_order: rows.length, is_primary: i.key === coverKey }); files.push(i.file); });
    });
    return { rows, files };
  };
  const validateAll = (): string | null => {
    const e = composeError(); if (e) { setStep(0); return e; }
    if (audience === 'GROUPS' && !groupIds.length) { setStep(1); return 'برای «نمایش به گروهی از مشتریان» دست‌کم یک گروه انتخاب کنید.'; }
    if (deadline && !jalaliTextToGregorian(deadline)) { setStep(4); return 'تاریخ ددلاین تارگت معتبر نیست.'; }
    return null;
  };
  const submit = async (asDraft = false) => {
    setErr(null);
    const v = validateAll(); if (v) { setErr(v); return; }
    setBusy(true);
    try {
      if (isEdit) { await saveEdit(); return; }
      const body = {
        product_id: fam!.id, variation_pattern: pattern, components: comps, unit_id: unitId || null, create_unit: createUnit,
        display_name: title.trim() || null, base_code: baseCode.trim() || null, description: desc || null, slug: slug.trim() || null, meta_title: metaTitle.trim() || null, meta_description: metaDesc || null,
        show_in_public: isPublic, allow_preorder: preorder, related_mode: related, similar_mode: similar,
        visibility: { audience, group_ids: audience === 'GROUPS' ? groupIds : [] }, policy: policyBody(),
        related_item_ids: related === 'MANUAL' ? relIds.map((x) => x.id) : null, similar_item_ids: similar === 'MANUAL' ? simIds.map((x) => x.id) : null,
        attributes: rowsToList(attrRows), adjustment_pct: adj.trim() ? pct(adj) : null, status: asDraft ? 'DRAFT' : status,
      } as unknown as ItemCreateIn;
      const it = await m.create.mutateAsync(body);
      const { rows, files } = imageRows();
      if (rows.length) { try { await m.images.mutateAsync({ id: it.id, rows, files }); } catch (e) { toast(`آیتم ساخته شد ولی ذخیره‌ی تصاویر ناموفق بود: ${userMessage(e)}`, 'error'); } }
      toast(asDraft ? `پیش‌نویس آیتم «${it.display_name}» ذخیره شد.` : `آیتم «${it.display_name}» با ${faNum(pieces)} عدد کالا ثبت شد.`);
      navigate(`/catalog/items/${it.id}`, { replace: true });
    } catch (e) { setErr(userMessage(e)); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };
  const saveEdit = async () => {
    const d = edit.data!; const id = d.id;
    if (compChanged) {
      await adminApi(`/catalog/items/${id}/components`, { method: 'PUT', body: { product_id: d.product_id, variation_pattern: pattern, components: comps, unit_id: unitId || null, create_unit: createUnit } });
      await qc.invalidateQueries({ queryKey: ['pricing'] }); await qc.invalidateQueries({ queryKey: ['catalog'] });
    }
    await m.update.mutateAsync({ id, body: { display_name: title.trim() || d.display_name, base_code: baseCode.trim(), description: desc, slug: slug.trim() || null, meta_title: metaTitle.trim(), meta_description: metaDesc, show_in_public: isPublic, allow_preorder: preorder, related_mode: related, similar_mode: similar } as never });
    await m.visibility.mutateAsync({ id, audience, group_ids: audience === 'GROUPS' ? groupIds : [] });
    if (can('catalog.items.policy.update')) await m.policy.mutateAsync({ id, body: policyBody() as never });
    await m.attributes.mutateAsync({ id, values: rowsToList(attrRows) });
    if (related === 'MANUAL') await m.relations.mutateAsync({ id, kind: 'RELATED', item_ids: relIds.map((x) => x.id) });
    if (similar === 'MANUAL') await m.relations.mutateAsync({ id, kind: 'SIMILAR', item_ids: simIds.map((x) => x.id) });
    const { rows, files } = imageRows();
    const imgChanged = files.length > 0 || rows.length !== d.images.length || rows.some((r) => r.id && r.is_primary !== d.images.find((i) => i.id === r.id)?.is_primary);
    if (imgChanged) await m.images.mutateAsync({ id, rows, files });
    const oldAdj = editPrice.data?.adjustment_pct != null ? String(Number(editPrice.data.adjustment_pct)) : '';
    if (adj.trim() && adj.trim() !== oldAdj && can('pricing.prices.update')) await adminApi(`/pricing/prices/${id}`, { method: 'PUT', body: { adjustment_pct: pct(adj) } });
    if (status !== d.status) {
      const ensureBarcode = async () => { if (!d.barcode) await adminApi(`/catalog/items/${id}/barcode`, { method: 'PATCH', body: { value: null } }); };
      if (status === 'ACTIVE') { await ensureBarcode(); await m.activate.mutateAsync(id); }
      else if (status === 'HIDDEN') { if (d.status === 'DRAFT') { await ensureBarcode(); await m.activate.mutateAsync(id); } await m.hide.mutateAsync(id); }
    }
    toast('تغییرات آیتم ذخیره شد.');
    navigate(`/catalog/items/${id}`, { replace: true });
  };

  if (isEdit && (edit.isLoading || (!fam && famQ.isLoading))) return <Card><SkeletonRows rows={6} height={60} /></Card>;
  if (isEdit && edit.error) return <Card><Empty title="آیتم پیدا نشد" text={userMessage(edit.error)} /></Card>;
  const famPath = pathOf(byId, fam?.category_id);
  const homog: [string, boolean][] = [
    ['برند همه کالاها یکسان', chosen.length > 0], ['مدل و طرح یکسان', chosen.length > 0], ['جنس پارچه یکسان', chosen.length > 0],
    ['فقط یک متغیر (سایز یا رنگ) تغییر می‌کند', chosen.length > 0 && oneVar], ['گرید همه کالاها یکسان', chosen.length > 0 && grades.size === 1], ['واحد اصلی یکسان', chosen.length > 0 && unitsSet.size === 1],
  ];
  const statusLabel = { ACTIVE: 'نمایش در فروشگاه', HIDDEN: 'عدم نمایش', DRAFT: 'پیش‌نویس' }[status];
  const fixedOpts: { id: string; label: ReactNode; hex?: string | null }[] = !fam ? [] : pattern === 'FIXED_COLOR' ? (fam.colors ?? []).map((c) => ({ id: c.id, label: c.name, hex: c.hex_code })) : (fam.sizes ?? []).map((z) => ({ id: z.id, label: <span data-latin>{z.code}</span> }));

  return (
    <>
      <PageHead title={isEdit ? 'ویرایش آیتم (واحد فروش)' : 'ساخت آیتم (واحد فروش)'} back={back}
        sub={isEdit ? undefined : 'آیتم واحد فروش است و از ترکیب چند کالای یک خانواده ساخته می‌شود؛ ابتدا ترکیب و قیمت آیتم را مشخص و سپس اطلاعات نمایش، انبار و فروش آن را تکمیل کنید.'} />
      <div className={s.steps} role="tablist" aria-label="مراحل ساخت آیتم">
        {STEPS.map((l, i) => (
          <span key={l} className={s.stepWrap}>
            <button type="button" role="tab" aria-selected={i === step} className={`${s.step} ${i === step ? s.stepOn : ''}`} onClick={() => go(i)}>
              <span className={`${s.stepNum} ${i < step ? s.stepDone : i === step ? s.stepCur : ''}`}>{faNum(i + 1)}</span>{l}
            </button>
            {i < STEPS.length - 1 ? <span className={s.stepSep} aria-hidden>—</span> : null}
          </span>
        ))}
      </div>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={s.wizard}>
        <div className={s.stack}>
          {step === 0 ? <>
            {isEdit ? <p className={s.warnText} style={{ marginTop: 0 }} data-locked-note>{lk ? 'ترکیب این آیتم قابل ویرایش نیست (آرشیو یا بدون مجوز ویرایش).' : 'خانواده‌ی آیتم ثابت است؛ الگوی تنوع، کالاها و تعداد را می‌توانید تغییر دهید. اگر آیتم موجودی، رزرو یا سند باز انبار داشته باشد، تغییر ترکیب رد می‌شود و دلیلش نمایش داده می‌شود. پس از ذخیره، قیمت آیتم با همان درصد تعدیل دوباره محاسبه می‌شود.'}</p> : null}
            <FamilyPicker byId={byId} tree={tree.data ?? []} value={fam} locked={isEdit} onPick={(f) => { if (isEdit) return; if (f.id !== fam?.id) { setFam(f); setFixed(''); setMembers({}); } }} />
            {fam ? <>
              <Card>
                <SectionTitle>۲. الگوی تنوع آیتم</SectionTitle>
                <p className={s.intro}>معمولاً یکی از دو متغیر سایز و رنگ ثابت است و دیگری تغییر می‌کند.</p>
                <Segmented value={pattern} onChange={(v) => { if (lk) return; setPattern(v); setFixed(''); setMembers({}); }} options={(['FIXED_COLOR', 'FIXED_SIZE', 'FREE'] as Pattern[]).map((p) => ({ value: p, label: ITEM_PATTERN[p], disabled: lk }))} />
                {pattern !== 'FREE' ? <>
                  <div className={s.segLabel} style={{ margin: '14px 0 8px' }}>{pattern === 'FIXED_COLOR' ? 'رنگ ثابت آیتم' : 'سایز ثابت آیتم'}</div>
                  <div className={s.pickGrid} data-fixed={pattern}>
                    {fixedOpts.map((o) => <button key={o.id} type="button" disabled={lk} className={`${s.pick} ${fixed === o.id ? s.pickOn : ''}`} aria-pressed={fixed === o.id} data-tip="" onClick={() => { setFixed(o.id); setMembers({}); }}>{o.hex !== undefined ? <Swatch hex={o.hex} /> : null}{o.label}</button>)}
                  </div>
                </> : null}
              </Card>
              <Card>
                <SectionTitle extra={<span className={s.famCount}>{faNum(chosen.length)} کالا انتخاب شده · {faNum(pieces)} عدد در آیتم</span>}>۳. کالاهای تشکیل‌دهنده آیتم</SectionTitle>
                {pattern !== 'FREE' && !fixed ? <div className={s.colEmpty}>ابتدا {pattern === 'FIXED_COLOR' ? 'رنگ' : 'سایز'} ثابت آیتم را انتخاب کنید.</div> : goods.isLoading ? <SkeletonRows rows={4} /> : !pool.length ? <div className={s.colEmpty}>کالای فعالی با این شرط در خانواده نیست.</div> : (
                  <div className={s.goodsPick} data-goods>
                    <table>
                      <thead><tr><th /><th>کد کالا</th><th>نام کالا</th><th>سایز</th><th>رنگ</th><th><UnitHead>قیمت فروش</UnitHead></th><th>موجودی</th><th>تعداد در آیتم</th><th><UnitHead>جمع</UnitHead></th></tr></thead>
                      <tbody>
                        {pool.map((g) => { const on = !!members[g.id]; const q = members[g.id] ?? 1; const pr = prices.data?.get(g.id)?.sale_price; return (
                          <tr key={g.id} className={on ? s.goodOn : ''} style={g.status === 'HIDDEN' && !on ? { opacity: 0.55 } : undefined} data-hidden-good={g.status === 'HIDDEN' ? '' : undefined}>
                            <td><button type="button" role="checkbox" aria-checked={on} aria-label={`انتخاب ${g.code}`} disabled={lk || (g.status === 'HIDDEN' && !on)} data-tip={g.status === 'HIDDEN' && !on ? 'کالا در حالت «عدم نمایش» است و در آیتم به کار نمی‌رود' : undefined} className={`${s.cb} ${on ? s.cbOn : ''}`} onClick={() => setMembers((x) => { const n = { ...x }; if (n[g.id]) delete n[g.id]; else n[g.id] = 1; return n; })}>{on ? <IconCheck size={13} /> : null}</button></td>
                            <td className={s.muted} data-latin>{g.code}</td>
                            <td><span className={s.famName} style={{ maxWidth: 90 }} data-tip={g.display_name}>{g.display_name}</span>{g.status === 'HIDDEN' ? <> <Badge tone="neutral">عدم نمایش</Badge></> : null}</td>
                            <td><span className={s.sizeChip} data-latin>{g.sizes[0]?.code ?? '—'}</span></td>
                            <td><span className={s.swRow} style={{ gap: 6 }}><Swatch hex={g.colors[0]?.hex_code} big />{g.colors[0]?.name ?? '—'}</span></td>
                            <td className="tnum">{pr ? faNum(Number(pr)) : <span className={s.muted}>—</span>}</td>
                            <td><span className={s.muted} data-tip="از ماژول انبار (به‌زودی)">—</span></td>
                            <td><Stepper label={`تعداد ${g.code}`} value={q} min={1} max={100000} onChange={(v) => setMembers((x) => ({ ...x, [g.id]: v }))} disabled={!on || lk} /></td>
                            <td className={`${s.price} tnum`}>{on && pr ? faNum(Number(pr) * q) : '—'}</td>
                          </tr>
                        ); })}
                      </tbody>
                    </table>
                  </div>
                )}
                {unitOpt ? (
                  <div className={s.unitBox} data-unit>
                    <b>واحد فروش آیتم:</b>
                    {unitOpt.selected_unit_id ? <span>{unitOpt.matches.find((u) => u.id === unitOpt.selected_unit_id)?.name} <span className={s.muted}>(انتخاب خودکار)</span></span>
                      : unitOpt.needs_choice ? <span className={s.unitSel}><Select label="" aria-label="واحد فروش آیتم" value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="انتخاب کنید" options={unitOpt.matches.map((u) => ({ value: u.id, label: `${u.name} (${faNum(u.factor)} ${unitOpt.main_unit.name})` }))} /></span>
                        : unitOpt.needs_creation ? <Toggle checked={createUnit} onChange={setCreateUnit} label={`واحد «${unitOpt.suggestion?.name ?? ''}» (${faNum(unitOpt.goods_count)} ${unitOpt.main_unit.name}) هنوز تعریف نشده؛ با ثبت آیتم ساخته شود`} /> : null}
                  </div>
                ) : null}
              </Card>
              <PriceCard sum={sumSale} adj={adj} setAdj={setAdj} final={finalPrice} unpriced={unpriced.length} canPrice={canPrice} disabled={lk && !can('pricing.prices.update')} />
            </> : null}
          </> : null}

          {step === 1 ? <>
            <Card>
              <SectionTitle>اطلاعات پایه آیتم</SectionTitle>
              <FormGrid cols={2}>
                <Input label="عنوان آیتم" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} placeholder={autoName || 'خالی ⇐ نام خودکار'} hint="در صورت خالی بودن، نام خودکار آیتم استفاده می‌شود" />
                <Input label="کد برند" latin dir="ltr" value={baseCode} onChange={(e) => setBaseCode(e.target.value)} maxLength={50} hint={isEdit ? `کد آیتم: ${edit.data?.code ?? ''}` : 'کد یکتای آیتم پس از ثبت خودکار ساخته می‌شود'} />
                <Select label="وضعیت نمایش" value={status} onChange={(e) => setStatus(e.target.value as Status)} options={[{ value: 'ACTIVE', label: 'نمایش در فروشگاه' }, { value: 'HIDDEN', label: 'عدم نمایش' }, ...(!isEdit || edit.data?.status === 'DRAFT' ? [{ value: 'DRAFT', label: 'پیش‌نویس' }] : [])]} />
              </FormGrid>
              <div style={{ marginTop: 12 }}><Textarea label="توضیحات آیتم" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="توضیح آیتم برای صفحه فروشگاه" rows={3} /></div>
              {(itemAttrs.data?.length || descAttrs.data?.length) ? <div style={{ marginTop: 12 }}><div className={s.segLabel} style={{ marginBottom: 8 }}>ویژگی‌ها و برچسب‌های آیتم</div><AttributeFields attrs={[...(itemAttrs.data ?? []), ...(descAttrs.data ?? [])]} rows={attrRows} onChange={setAttrRows} cols={3} /></div> : null}
            </Card>
            <Card>
              <SectionTitle>مشخصات به ارث رسیده از خانواده</SectionTitle>
              <div className={s.inheritGrid}><Kv k="مسیر دسته‌بندی" v={famPath} /><Kv k="برند" v={fam?.brand_name || '—'} /><Kv k="طرح و مدل" v={fam?.model_line_name || '—'} /><Kv k="جنس" v={fam?.material_name || '—'} /></div>
              <p className={s.sub} style={{ marginTop: 8 }}>این مقادیر از خانواده انتخاب‌شده در مرحله ۱ خوانده می‌شوند و در آیتم قابل ویرایش نیستند.</p>
            </Card>
            <Card>
              <SectionTitle>دامنه نمایش</SectionTitle>
              <div className={s.radioRow}>
                <Radio on={audience === 'ALL'} onClick={() => setAudience('ALL')} title="نمایش به همه مشتریان" hint="همه کاربران این آیتم را می‌بینند" />
                <Radio on={audience === 'GROUPS'} onClick={() => setAudience('GROUPS')} title="نمایش به گروهی از مشتریان" hint="فقط گروه‌های انتخابی" />
              </div>
              {audience === 'GROUPS' ? (
                <div style={{ marginTop: 12 }}>
                  <div className={s.segLabel} style={{ marginBottom: 8 }}>گروه مشتریان</div>
                  {!can('customers.groups.list') ? <p className={s.sub}>مجوز دیدن گروه‌های مشتری را ندارید.</p> : !groups.data?.length ? <p className={s.sub}>گروه فعالی تعریف نشده است.</p> : (
                    <div className={s.pickGrid} data-groups>{groups.data.map((g) => { const on = groupIds.includes(g.id); return <button key={g.id} type="button" className={`${s.pick} ${on ? s.pickOn : ''}`} aria-pressed={on} data-tip="" onClick={() => setGroupIds(on ? groupIds.filter((x) => x !== g.id) : [...groupIds, g.id])}>{g.name}</button>; })}</div>
                  )}
                </div>
              ) : null}
              <div className={s.switchBox}><div><b>نمایش در پابلیک</b><div className={s.sub}>این آیتم برای کاربران مهمان و موتورهای جستجو قابل مشاهده باشد</div></div><Toggle checked={isPublic} onChange={setIsPublic} label="" /></div>
            </Card>
          </> : null}

          {step === 2 ? <>
            <Card>
              <SectionTitle>انبار و گرید</SectionTitle>
              <FormGrid cols={2}>
                <Input label="انبار" value="" readOnly disabled placeholder="به‌زودی (ماژول انبار)" />
                <Input label="آدرس در انبار" value="" readOnly disabled placeholder="به‌زودی (ماژول انبار)" />
              </FormGrid>
              <div className={s.sumRow} style={{ marginTop: 12, borderBottom: 0 }}><span>گرید آیتم</span><b>{isEdit ? `گرید ${faNum(edit.data!.grade)}` : grades.size === 1 ? `گرید ${faNum([...grades][0]!)}` : '—'} <span className={s.muted}>(از کالاهای آیتم؛ تغییر گرید از ماژول انبار)</span></b></div>
            </Card>
            <Card>
              <SectionTitle>تنظیمات سفارش</SectionTitle>
              {isEdit && !can('catalog.items.policy.update') ? <p className={s.sub}>مجوز ویرایش سیاست سفارش را ندارید.</p> : null}
              <FormGrid cols={3}>
                <NumIn label="حداقل تعداد سفارش" unit="آیتم" value={pol.min_order_qty} onChange={(v) => setPol({ ...pol, min_order_qty: v })} hint="کمتر از این تعداد قابل ثبت سفارش نیست" />
                <NumIn label="حداکثر تعداد سفارش" unit="آیتم" value={pol.max_order_qty} onChange={(v) => setPol({ ...pol, max_order_qty: v })} hint="خالی = بدون محدودیت" />
                <NumIn label="حداکثر پیش‌سفارش" unit="آیتم" value={pol.max_preorder_qty} onChange={(v) => setPol({ ...pol, max_preorder_qty: v })} />
                <NumIn label="آستانه خرید" unit="عدد" value={pol.reorder_threshold} onChange={(v) => setPol({ ...pol, reorder_threshold: v })} hint="آستانه تأمین مجدد آیتم" />
                <NumIn label="سقف انباشت" unit="عدد" value={pol.max_stock_cap} onChange={(v) => setPol({ ...pol, max_stock_cap: v })} hint="حداکثر موجودی نگه‌داری" />
              </FormGrid>
              <div className={s.switchBox}><div><b>امکان پیش‌سفارش</b><div className={s.sub}>سفارش این آیتم وقتی موجودی ندارد پذیرفته شود</div></div><Toggle checked={preorder} onChange={setPreorder} label="" /></div>
            </Card>
          </> : null}

          {step === 3 ? (
            <Card>
              <SectionTitle>گالری تصاویر آیتم</SectionTitle>
              {IMAGE_KINDS.map((t) => <GalleryTier key={t.kind} tier={t} olds={oldImgs.filter((i) => i.kind === t.kind)} news={newImgs.filter((i) => i.kind === t.kind)} cover={cover || oldImgs[0]?.id || newImgs[0]?.key || ''}
                onAdd={(files) => { const room = 20 - oldImgs.length - newImgs.length; const add = files.slice(0, room).map((f, i) => ({ key: `n${Date.now()}${i}`, file: f, url: URL.createObjectURL(f), kind: t.kind })); setPendingKeys((x) => [...x, ...add.map((a) => a.key)]); if (files.length > room) toast('هر آیتم حداکثر ۲۰ تصویر دارد.', 'error'); setNewImgs((x) => [...x, ...add]); }}
                onRemoveOld={(id) => setOldImgs((x) => x.filter((i) => i.id !== id))} onRemoveNew={(k) => setNewImgs((x) => x.filter((i) => i.key !== k))} onCover={setCover} bad={new Set(badImgs.map((b) => b.key))} />)}
              <p className={s.sub}>تصاویر کارت آیتم، مارکت‌پلیس و صفحه آیتم · <b>نسبت ۲ به ۳</b> (عرض ۲، ارتفاع ۳؛ مثلاً ۸۰۰ × ۱۲۰۰ پیکسل) · JPEG، PNG یا WebP تا ۵ مگابایت · حداکثر ۲۰ تصویر · تصویر «کاور» تصویر اصلی آیتم است.</p>
              {badImgs.length ? <p className={s.warnText} data-ratio-note>{faNum(badImgs.length)} تصویر نسبت ۲ به ۳ ندارد (با کادر قرمز مشخص شده است).</p> : null}
            </Card>
          ) : null}

          {step === 4 ? <>
            <Card>
              <SectionTitle>سئو</SectionTitle>
              <FormGrid cols={2}>
                <Input label="Meta Title" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={255} />
                <Input label="Slug" latin dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={255} hint="خالی ⇐ خودکار" />
              </FormGrid>
              <div style={{ marginTop: 12 }}><Textarea label="Meta Description" value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} placeholder="توضیح کوتاه برای موتورهای جستجو" rows={2} /></div>
            </Card>
            <Card>
              <SectionTitle>فروش مکمل</SectionTitle>
              <FormGrid cols={2}>
                <Select label="آیتم‌های مرتبط" value={related} onChange={(e) => setRelated(e.target.value as never)} options={Object.entries(LINK_MODE).map(([value, label]) => ({ value, label }))} hint="آیتم‌هایی که همراه این آیتم پیشنهاد می‌شوند" />
                <Select label="آیتم‌های مشابه" value={similar} onChange={(e) => setSimilar(e.target.value as never)} options={Object.entries(LINK_MODE).map(([value, label]) => ({ value, label }))} />
              </FormGrid>
              {related === 'MANUAL' ? <PickedList title="آیتم‌های مرتبط (دستی)" list={relIds} onRemove={(x) => setRelIds(relIds.filter((y) => y.id !== x))} onPick={() => setPicker('RELATED')} /> : null}
              {similar === 'MANUAL' ? <PickedList title="آیتم‌های مشابه (دستی)" list={simIds} onRemove={(x) => setSimIds(simIds.filter((y) => y.id !== x))} onPick={() => setPicker('SIMILAR')} /> : null}
            </Card>
            <Card>
              <SectionTitle>تارگت فروش</SectionTitle>
              <FormGrid cols={2}>
                <NumIn label="تارگت فروش" unit="آیتم" value={target} onChange={setTarget} hint="هدف فروش برای پایش عملکرد آیتم" />
                <JalaliDateInput label="ددلاین تارگت" value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="۱۴۰۵/۱۲/۲۹" dir="ltr" maxYear={1500} />
              </FormGrid>
            </Card>
          </> : null}

          <div className={s.wizFoot}>
            {step > 0 ? <Button variant="secondary" icon={<IconChevronRight size={17} />} onClick={() => go(step - 1)}>مرحله قبل</Button> : <span />}
            <span className={s.rowActions}>
              {!isEdit ? <Button variant="secondary" icon={<IconDeviceFloppy size={17} />} onClick={() => submit(true)} disabled={busy}>ذخیره پیش‌نویس</Button> : null}
              {step < STEPS.length - 1 ? <Button onClick={() => go(step + 1)}>مرحله بعد <IconChevronLeft size={17} /></Button> : null}
              {step === STEPS.length - 1 || isEdit ? <Button icon={<IconCheck size={17} />} onClick={() => submit(false)} loading={busy} loadingText="در حال ذخیره…">{isEdit ? 'ذخیره تغییرات آیتم' : 'ثبت آیتم'}</Button> : null}
            </span>
          </div>
        </div>

        <aside className={s.wizardSide}>
          {step === 0 ? <>
            <Card>
              <SectionTitle>خلاصه آیتم</SectionTitle>
              <div className={s.sampleName} style={{ marginBottom: 10 }} data-auto-name><div className={s.segLabel}>{title.trim() ? 'نام آیتم' : 'نام پیشنهادی آیتم'}</div>{title.trim() || autoName || edit.data?.display_name || (chosen.length ? '…' : '—')}</div>
              <div className={s.sumRow}><span>برند / جنس</span><b>{fam ? [fam.brand_name, fam.material_name].filter(Boolean).join(' · ') : '—'}</b></div>
              <div className={s.sumRow}><span>تعداد کالا در آیتم</span><b className="tnum" data-pieces>{faNum(pieces)} عدد</b></div>
              <div className={s.sumRow}><span>جمع قیمت فروش کالاها</span><b className="tnum">{faNum(sumSale)}<Rial /></b></div>
              <div className={s.sumRow}><span>جمع قیمت خرید</span><b className={s.muted} data-tip="از ماژول خرید (به‌زودی)">—</b></div>
              <div className={s.sumRow}><span>حاشیه سود</span><b className={s.muted} data-tip="نیازمند قیمت خرید">—</b></div>
              <div className={s.sumRow} style={{ borderBottom: 0 }}><span>قیمت آیتم</span><b className={`${s.price} tnum`} style={{ fontSize: 18 }} data-final>{chosen.length ? <>{faNum(finalPrice)}<Rial /></> : '—'}</b></div>
              {!fam ? <div className={s.warnBox}>ابتدا خانواده کالا را انتخاب کنید.</div> : null}
            </Card>
            <Card>
              <SectionTitle>شرط‌های همگنی کالاهای آیتم</SectionTitle>
              <div className={s.stack} style={{ gap: 8 }}>{homog.map(([l, ok]) => <div key={l} className={`${s.homog} ${ok ? s.homogOk : ''}`}><span aria-hidden>{ok ? '✓' : '!'}</span>{l}</div>)}</div>
            </Card>
          </> : (
            <Card>
              <SectionTitle>پیش‌نمایش آیتم</SectionTitle>
              {(() => { const ck = cover || oldImgs[0]?.id || newImgs[0]?.key || ''; const ordered = [...galleryImgs.filter((g) => g.key === ck), ...galleryImgs.filter((g) => g.key !== ck)];
                return <ItemPreviewCarousel images={ordered.map((g) => g.url)} fallbackBg={thumbColor(fam?.code ?? 'x') ?? 'var(--surface-2)'} fallbackText={(title || fam?.name || 'آ').slice(0, 1)} />; })()}
              <div className={s.strong} style={{ margin: '10px 0 2px' }}>{title.trim() || edit.data?.display_name || autoName || 'نام خودکار پس از ثبت'}</div>
              <div className={s.sub}>{fam?.brand_name ?? '—'}{isEdit ? <> · <span data-latin>{edit.data?.code}</span></> : null}</div>
              <div className={`${s.price} tnum`} style={{ fontSize: 18, margin: '8px 0' }}>{isEdit ? (editPrice.data?.sale_price ? <>{faNum(Number(editPrice.data.sale_price))}<Rial /></> : '—') : chosen.length ? <>{faNum(finalPrice)}<Rial /></> : '—'}</div>
              <div className={s.sumRow}><span>دسته</span><b>{fam ? byId.get(fam.category_id)?.name ?? fam.category_name : '—'}</b></div>
              <div className={s.sumRow}><span>کالا در آیتم</span><b className="tnum">{faNum(isEdit ? Number(edit.data?.goods_count ?? 0) : pieces)} عدد</b></div>
              <div className={s.sumRow}><span>الگوی تنوع</span><b>{ITEM_PATTERN[pattern]}</b></div>
              <div className={s.sumRow} style={{ borderBottom: 0 }}><span>وضعیت</span><b>{statusLabel}</b></div>
            </Card>
          )}
        </aside>
      </div>
      {ratioWarn ? <RatioWarningModal mode={ratioWarn.mode === 'upload' ? 'upload' : 'continue'} dims={dims}
        images={ratioWarn.mode === 'upload' ? galleryImgs.filter((g) => ratioWarn.keys.includes(g.key)) : badImgs}
        onClose={() => setRatioWarn(null)}
        onRemove={() => { if (ratioWarn.mode === 'upload') { const ks = ratioWarn.keys; setNewImgs((x) => x.filter((i) => !ks.includes(i.key))); } setRatioWarn(null); }}
        onFix={() => { setRatioWarn(null); setStep(3); window.scrollTo({ top: 0 }); }}
        onContinue={() => { const w0 = ratioWarn; setRatioAck(badSig); setRatioWarn(null); if (w0.mode === 'continue') w0.then(); }} /> : null}
      {picker ? <ItemPicker title={picker === 'RELATED' ? 'انتخاب آیتم‌های مرتبط' : 'انتخاب آیتم‌های مشابه'} exclude={editId} initial={picker === 'RELATED' ? relIds : simIds} onClose={() => setPicker(null)}
        onDone={(list) => { if (picker === 'RELATED') setRelIds(list); else setSimIds(list); setPicker(null); }} /> : null}
    </>
  );
}

/** ۱. انتخاب خانواده: فیلتر دسته‌ی ۳ سطحی + برند + جست‌وجو، جدول خانواده‌ها با انتخاب رادیویی (html) */
function FamilyPicker({ byId, tree, value, onPick, locked }: { byId: Map<string, CategoryNode>; tree: CategoryNode[]; value: ProductRow | null; onPick: (f: ProductRow) => void; /** ویرایش: فقط خانواده‌ی آیتم، فیلترها خاموش */ locked?: boolean }) {
  const brands = useAllBrands();
  const [main, setMain] = useState(''); const [mid, setMid] = useState(''); const [sub, setSub] = useState(''); const [brand, setBrand] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [dq, setDq] = useState(''); useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const list = useProducts({ page, page_size: 10, query: dq || undefined, category_id: sub || mid || main || undefined, brand_id: brand || undefined });
  const mids = byId.get(main)?.children ?? []; const subs = byId.get(mid)?.children ?? [];
  const rows = locked ? (value ? [value] : []) : (list.data?.results ?? []).filter((p) => p.status !== 'ARCHIVED');
  return (
    <Card>
      <SectionTitle>۱. انتخاب خانواده کالا</SectionTitle>
      <p className={s.intro}>با انتخاب خانواده، برند و مدل و جنس آیتم قطعی می‌شود و فقط کالاهای همان ماتریس قابل انتخاب خواهند بود.</p>
      <div className={s.filterRow} style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1.6fr auto' }}>
        <Select label="دسته اصلی" value={main} disabled={locked} onChange={(e) => { setMain(e.target.value); setMid(''); setSub(''); setPage(1); }} placeholder="همه" options={tree.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="دسته میانی" value={mid} disabled={locked || !main} onChange={(e) => { setMid(e.target.value); setSub(''); setPage(1); }} placeholder="همه" options={mids.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="دسته فرعی" value={sub} disabled={locked || !mid} onChange={(e) => { setSub(e.target.value); setPage(1); }} placeholder="همه" options={subs.map((n) => ({ value: n.id, label: n.name }))} />
        <Select label="برند" value={brand} disabled={locked} onChange={(e) => { setBrand(e.target.value); setPage(1); }} placeholder="همه" options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
        <label className={`${s.famSearch} ${locked ? s.locked : ''}`} style={{ height: 42, alignSelf: 'end' }}><IconSearch size={16} className={s.muted} /><input value={q} disabled={locked} onChange={(e) => setQ(e.target.value)} placeholder="نام، طرح، برند یا کد خانواده…" aria-label="جست‌وجوی خانواده" /></label>
        <button type="button" className={s.clearIcon} style={{ alignSelf: 'end' }} onClick={() => { setMain(''); setMid(''); setSub(''); setBrand(''); setQ(''); }} disabled={locked || (!main && !mid && !sub && !brand && !q)} aria-label="حذف فیلترها" data-tip="حذف فیلترها"><IconFilterOff size={16} /></button>
      </div>
      {locked ? <div className={s.sub} style={{ margin: '4px 0 8px' }}>خانواده‌ی این آیتم</div> : list.data ? <div className={s.sub} style={{ margin: '4px 0 8px' }}>{faNum(rows.length)} خانواده از {faNum(list.data.total)} خانواده</div> : null}
      <div className={s.goodsPick} data-families>
        {list.isLoading && !locked ? <SkeletonRows rows={4} /> : !rows.length ? <div className={s.colEmpty}>خانواده‌ای با این فیلترها پیدا نشد.</div> : (
          <table>
            <thead><tr><th /><th>خانواده کالا</th><th>مسیر دسته‌بندی</th><th>برند</th><th>جنس</th><th>ابعاد ماتریس</th><th>رنگ‌ها</th></tr></thead>
            <tbody>
              {rows.map((f) => { const on = value?.id === f.id; return (
                <tr key={f.id} className={`${on ? s.goodOn : ''} ${locked ? '' : s.clickRow}`} onClick={() => onPick(f)}>
                  <td><span role="radio" aria-checked={on} aria-label={`انتخاب ${f.code}`} className={`${s.radio} ${on ? s.radioOn : ''}`} /></td>
                  <td><div className={s.strong}>{[byId.get(f.category_id)?.name ?? f.category_name, f.model_line_name ? `طرح ${f.model_line_name}` : ''].filter(Boolean).join(' · ')}</div><div className={s.sub} data-latin>{f.code}</div></td>
                  <td><span className={s.famName} style={{ maxWidth: 200 }} data-tip={pathOf(byId, f.category_id)}>{pathOf(byId, f.category_id)}</span></td>
                  <td>{f.brand_name}</td><td>{f.material_name || '—'}</td>
                  <td><bdi dir="ltr" className={`${s.dimsText} tnum`}>{faNum(f.size_count)} × {faNum(f.color_count)} = {faNum(f.size_count * f.color_count)}</bdi></td>
                  <td><span className={s.famSwRow}>{(f.colors ?? []).slice(0, 4).map((c) => <span key={c.id} className={s.famSw} style={{ background: c.hex_code ?? undefined }} aria-hidden />)}</span></td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
      </div>
      {!locked && list.data && list.data.total > 10 ? <Pagination page={page} pageSize={10} total={list.data.total} onPage={setPage} onPageSize={() => undefined} sizes={[10]} /> : null}
    </Card>
  );
}

/** ۴. قیمت‌گذاری: مبنا = جمع قیمت کالاها + درصد تعدیل (± دو رقم اعشار)؛ «قیمت دستی» به‌زودی (افشین 2026-10-22) */
function PriceCard({ sum, adj, setAdj, final, unpriced, canPrice, disabled }: { sum: number; adj: string; setAdj: (v: string) => void; final: number; unpriced: number; canPrice: boolean; disabled?: boolean }) {
  return (
    <Card>
      <SectionTitle>۴. قیمت‌گذاری آیتم</SectionTitle>
      <div className={s.segLabel} style={{ marginBottom: 8 }}>مبنای قیمت آیتم</div>
      <div className={s.radioRow}>
        <Radio on title="جمع قیمت کالاهای آیتم" hint="قیمت به‌صورت خودکار از جمع قیمت کالاهای انتخاب‌شده محاسبه می‌شود" onClick={() => undefined} />
        <Radio on={false} disabled title="قیمت دستی آیتم (به‌زودی)" hint="قیمت آیتم مستقل از جمع کالاها تعیین می‌شود" onClick={() => undefined} />
      </div>
      <div className={s.filterRow} style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 12, alignItems: 'start' }} data-price-row>
        <Input label="درصد تعدیل قیمت (٪)" inputMode="decimal" dir="ltr" value={toFaDigits(adj)} onChange={(e) => setAdj(pct(e.target.value))} placeholder="۰" disabled={disabled} hint="منفی = کاهش؛ روی جمع قیمت کالاها اعمال می‌شود" />
        <Field label="جمع قیمت کالاها"><div className={s.readBox}>{canPrice ? <>{faNum(sum)}<Rial /></> : '—'}</div></Field>
        <Field label="قیمت نهایی آیتم"><div className={`${s.readBox} ${s.price}`} data-final-price>{canPrice ? <>{faNum(final)}<Rial /></> : '—'}</div></Field>
      </div>
      {unpriced ? <p className={s.warnText}>{faNum(unpriced)} کالای انتخاب‌شده قیمت فروش ندارد؛ قیمت آیتم تا ثبت قیمت آن‌ها کامل نیست.</p> : null}
    </Card>
  );
}

function Radio({ on, title, hint, onClick, disabled }: { on: boolean; title: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={on} disabled={disabled} className={`${s.radioCard} ${on ? s.radioCardOn : ''}`} onClick={onClick}>
      <span className={`${s.radio} ${on ? s.radioOn : ''}`} aria-hidden /><span><b>{title}</b><span className={s.sub} style={{ display: 'block' }}>{hint}</span></span>
    </button>
  );
}
function NumIn({ label, unit, value, onChange, hint }: { label: string; unit: string; value: string; onChange: (v: string) => void; hint?: ReactNode }) {
  return <Input label={`${label} (${unit})`} inputMode="numeric" value={toFaDigits(value)} onChange={(e) => onChange(digits(e.target.value))} placeholder="۰" hint={hint} />;
}

function GalleryTier({ tier, olds, news, cover, onAdd, onRemoveOld, onRemoveNew, onCover, bad }: {
  tier: (typeof IMAGE_KINDS)[number]; olds: OldImg[]; news: NewImg[]; cover: string; onAdd: (f: File[]) => void; onRemoveOld: (id: string) => void; onRemoveNew: (k: string) => void; onCover: (k: string) => void; bad: Set<string>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const tiles = [...olds.map((o) => ({ key: o.id, url: o.url, rm: () => onRemoveOld(o.id) })), ...news.map((n) => ({ key: n.key, url: n.url, rm: () => onRemoveNew(n.key) }))];
  return (
    <div className={s.tier} data-kind={tier.kind}>
      <div className={s.dimHead}><span><b>{tier.label}</b><span className={s.sub} style={{ display: 'block' }}>{tier.hint}</span></span><span className={s.muted}>{faNum(tiles.length)} تصویر</span></div>
      <div className={s.tiles}>
        {tiles.map((t, i) => (
          <div key={t.key} className={`${s.tile} ${bad.has(t.key) ? s.tileBad : ''}`} style={{ backgroundImage: `url(${t.url})` }} data-bad-ratio={bad.has(t.key) ? '' : undefined}>
            {bad.has(t.key) ? <span className={s.badRatio} data-tip="نسبت این تصویر ۲ به ۳ نیست">۲:۳ نیست</span> : null}
            {t.key === cover ? <span className={s.coverTag}>کاور</span> : <button type="button" className={s.coverBtn} onClick={() => onCover(t.key)}>کاور شود</button>}
            <span className={s.tileNum}>{faNum(i + 1)}</span>
            <button type="button" className={s.tileRm} aria-label="حذف تصویر" onClick={t.rm}><IconX size={13} /></button>
          </div>
        ))}
        <button type="button" className={s.tileAdd} onClick={() => input.current?.click()}><IconPhotoPlus size={20} />افزودن تصویر</button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label={`افزودن ${tier.label}`} onChange={(e) => { onAdd(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>
    </div>
  );
}

function PickedList({ title, list, onRemove, onPick }: { title: string; list: { id: string; name: string }[]; onRemove: (id: string) => void; onPick: () => void }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className={s.dimHead}><span className={s.segLabel}>{title} ({faNum(list.length)})</span><Button size="sm" variant="secondary" onClick={onPick}>انتخاب از لیست آیتم‌ها</Button></div>
      {list.length ? <div className={s.pickGrid}>{list.map((x) => <span key={x.id} className={`${s.pick} ${s.pickOn}`}>{x.name}<button type="button" className={s.chipX} aria-label={`حذف ${x.name}`} onClick={() => onRemove(x.id)}><IconX size={12} /></button></span>)}</div> : <p className={s.sub}>موردی انتخاب نشده است.</p>}
    </div>
  );
}

/** انتخاب دستی آیتم‌های مرتبط/مشابه از لیست آیتم‌ها (جست‌وجو در سرور) */
function ItemPicker({ title, exclude, initial, onClose, onDone }: { title: string; exclude?: string; initial: { id: string; name: string }[]; onClose: () => void; onDone: (l: { id: string; name: string }[]) => void }) {
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [sel, setSel] = useState(initial);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const list = useItems({ kind: 'ITEM', page_size: 20, query: dq || undefined });
  const rows = (list.data?.results ?? []).filter((r: ItemRow) => r.id !== exclude && r.status !== 'ARCHIVED');
  return (
    <Modal open onClose={onClose} title={title} width={620} footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={() => onDone(sel)}>تأیید ({faNum(sel.length)})</Button></>}>
      <label className={s.famSearch} style={{ height: 42, marginBottom: 10 }}><IconSearch size={16} className={s.muted} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا کد آیتم…" aria-label="جست‌وجوی آیتم" /></label>
      <div className={s.stack} style={{ gap: 6, maxHeight: 360, overflow: 'auto' }}>
        {rows.map((r) => { const on = sel.some((x) => x.id === r.id); return (
          <button key={r.id} type="button" className={`${s.pickRow} ${on ? s.pickOn : ''}`} aria-pressed={on} onClick={() => setSel(on ? sel.filter((x) => x.id !== r.id) : [...sel, { id: r.id, name: r.display_name }])}>
            <span className={`${s.cb} ${on ? s.cbOn : ''}`} aria-hidden>{on ? <IconCheck size={13} /> : null}</span><span>{r.display_name} <span className={s.muted} data-latin>{r.code}</span></span>
          </button>
        ); })}
        {!list.isLoading && !rows.length ? <Empty title="آیتمی پیدا نشد" /> : null}
      </div>
    </Modal>
  );
}
