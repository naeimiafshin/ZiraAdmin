import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, apiRequest } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import { fetchAll } from '@/features/users/api';
import { saveBlob } from '@/shared/lib/download';

/**
 * API ادمین «محصولات و کاتالوگ» — پیشوند /api/v1/admin/catalog
 * مرجع: domains/catalog/api/admin.py (کد بک‌اند مرجع است، نه یادداشت‌ها). داده‌ی کاتالوگ شعبه ندارد.
 */
const P = '/catalog';

export type Brand = AdminSchemas['BrandOut'];
export type BrandIn = AdminSchemas['BrandIn'];
export type BrandUpdateIn = AdminSchemas['BrandUpdateIn'];
export type CategoryNode = AdminSchemas['CategoryNodeOut'];
export type Category = AdminSchemas['CategoryOut'];
export type CategoryIn = AdminSchemas['CategoryIn'];
export type CategoryUpdateIn = AdminSchemas['CategoryUpdateIn'];
export type Attribute = AdminSchemas['AttributeOut'];
export type AttributeIn = AdminSchemas['AttributeIn'];
export type AttributeUpdateIn = AdminSchemas['AttributeUpdateIn'];
export type AttributeValue = AdminSchemas['AttributeValueOut'];
export type AttributeValueIn = AdminSchemas['AttributeValueIn'];
export type Size = AdminSchemas['SizeOut'];
export type SizeIn = AdminSchemas['SizeIn'];
export type SizeUpdateIn = AdminSchemas['SizeUpdateIn'];
export type Color = AdminSchemas['ColorOut'];
export type ColorIn = AdminSchemas['ColorIn'];
export type ColorUpdateIn = AdminSchemas['ColorUpdateIn'];
export type SizeSet = AdminSchemas['SizeSetOut'];
export type ColorSet = AdminSchemas['ColorSetOut'];

export type ListParams = { page?: number; page_size?: number; query?: string; [k: string]: string | number | boolean | undefined };
const K = {
  brands: ['catalog', 'brands'] as const,
  categories: ['catalog', 'categories'] as const,
  attributes: ['catalog', 'attributes'] as const,
  sizes: ['catalog', 'sizes'] as const,
  colors: ['catalog', 'colors'] as const,
  sizeSets: ['catalog', 'size-sets'] as const,
  colorSets: ['catalog', 'color-sets'] as const,
};

// ── برندها ──
export const useBrands = (p: ListParams) =>
  useQuery({ queryKey: [...K.brands, p], queryFn: ({ signal }) => adminApi<Paginated<Brand>>(`${P}/brands`, { query: p, signal }), placeholderData: keepPreviousData });
export function useBrandWrite() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: K.brands });
  return {
    /** JSON یا multipart (`payload` JSON + فایل `logo`؛ لوگو اختیاری — افشین 2026-10-22) */
    create: useMutation({ mutationFn: (body: BrandIn | FormData) => adminApi<Brand>(`${P}/brands`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: BrandUpdateIn | FormData }) => adminApi<Brand>(`${P}/brands/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    deactivate: useMutation({ mutationFn: (id: string) => adminApi<Brand>(`${P}/brands/${id}/deactivate`, { method: 'PATCH' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/brands/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}

// ── دسته‌بندی‌ها (درخت ۳ سطحی، بدون صفحه‌بندی — استثنای R-API-01 با تأیید افشین) ──
export const useCategoryTree = (includeInactive = true) =>
  useQuery({ queryKey: [...K.categories, includeInactive], queryFn: ({ signal }) => adminApi<CategoryNode[]>(`${P}/categories`, { query: { include_inactive: includeInactive }, signal }) });
export function useCategoryWrite() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: K.categories });
  return {
    create: useMutation({ mutationFn: (body: CategoryIn) => adminApi<Category>(`${P}/categories`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: CategoryUpdateIn }) => adminApi<Category>(`${P}/categories/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    rename: useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => adminApi<Category>(`${P}/categories/${id}/rename`, { method: 'PATCH', body: { name } }), onSuccess: done }),
    move: useMutation({ mutationFn: ({ id, parent_id }: { id: string; parent_id: string | null }) => adminApi<Category>(`${P}/categories/${id}/move`, { method: 'PATCH', body: { parent_id } }), onSuccess: done }),
    deactivate: useMutation({ mutationFn: (id: string) => adminApi<Category>(`${P}/categories/${id}/deactivate`, { method: 'PATCH' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/categories/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}

// ── ویژگی‌ها ──
export const useAttributes = (p: ListParams) =>
  useQuery({ queryKey: [...K.attributes, p], queryFn: ({ signal }) => adminApi<Paginated<Attribute>>(`${P}/attributes`, { query: p, signal }), placeholderData: keepPreviousData });
export function useAttributeWrite() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: K.attributes });
  return {
    create: useMutation({ mutationFn: (body: AttributeIn) => adminApi<Attribute>(`${P}/attributes`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: AttributeUpdateIn }) => adminApi<Attribute>(`${P}/attributes/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    /** جایگزینی کامل مقدارها (BR-CAT-057)؛ مقدار استفاده‌شده را نمی‌توان حذف کرد (409) */
    setValues: useMutation({ mutationFn: ({ id, values }: { id: string; values: AttributeValueIn[] }) => adminApi<AttributeValue[]>(`${P}/attributes/${id}/values`, { method: 'PUT', body: { values } }), onSuccess: done }),
    deactivate: useMutation({ mutationFn: (id: string) => adminApi<Attribute>(`${P}/attributes/${id}/deactivate`, { method: 'PATCH' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/attributes/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}

// ── سایزها و رنگ‌ها (مجوز همان attributes) ──
export const useSizes = (p: ListParams) =>
  useQuery({ queryKey: [...K.sizes, p], queryFn: ({ signal }) => adminApi<Paginated<Size>>(`${P}/sizes`, { query: p, signal }), placeholderData: keepPreviousData });
export const useColors = (p: ListParams) =>
  useQuery({ queryKey: [...K.colors, p], queryFn: ({ signal }) => adminApi<Paginated<Color>>(`${P}/colors`, { query: p, signal }), placeholderData: keepPreviousData });
/** همه‌ی سایزها/رنگ‌های فعال (برای انتخاب در مجموعه‌ها و فرم ماتریس) */
export const useAllSizes = (enabled = true) => useQuery({ queryKey: [...K.sizes, 'all'], queryFn: () => fetchAll<Size>(`${P}/sizes`, { is_active: true }), enabled });
export const useAllColors = (enabled = true) => useQuery({ queryKey: [...K.colors, 'all'], queryFn: () => fetchAll<Color>(`${P}/colors`, { is_active: true }), enabled });
export function useSizeWrite() {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: K.sizes }); qc.invalidateQueries({ queryKey: K.sizeSets }); };
  return {
    create: useMutation({ mutationFn: (body: SizeIn) => adminApi<Size>(`${P}/sizes`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: SizeUpdateIn }) => adminApi<Size>(`${P}/sizes/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/sizes/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}
export function useColorWrite() {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: K.colors }); qc.invalidateQueries({ queryKey: K.colorSets }); };
  return {
    create: useMutation({ mutationFn: (body: ColorIn) => adminApi<Color>(`${P}/colors`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: ColorUpdateIn }) => adminApi<Color>(`${P}/colors/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/colors/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}

// ── مجموعه‌های سایز و رنگ (حذف واقعی: افشین 2026-10-22) ──
export const useSizeSets = (p: ListParams) =>
  useQuery({ queryKey: [...K.sizeSets, p], queryFn: ({ signal }) => adminApi<Paginated<SizeSet>>(`${P}/size-sets`, { query: p, signal }), placeholderData: keepPreviousData });
export const useColorSets = (p: ListParams) =>
  useQuery({ queryKey: [...K.colorSets, p], queryFn: ({ signal }) => adminApi<Paginated<ColorSet>>(`${P}/color-sets`, { query: p, signal }), placeholderData: keepPreviousData });
export function useSetWrite() {
  const qc = useQueryClient();
  const doneS = () => qc.invalidateQueries({ queryKey: K.sizeSets });
  const doneC = () => qc.invalidateQueries({ queryKey: K.colorSets });
  return {
    createSizeSet: useMutation({ mutationFn: (body: { name: string; size_ids: string[] }) => adminApi<SizeSet>(`${P}/size-sets`, { method: 'POST', body }), onSuccess: doneS }),
    updateSizeSet: useMutation({ mutationFn: ({ id, body }: { id: string; body: { name?: string; size_ids?: string[] } }) => adminApi<SizeSet>(`${P}/size-sets/${id}`, { method: 'PATCH', body }), onSuccess: doneS }),
    createColorSet: useMutation({ mutationFn: (body: { name: string; color_ids: string[] }) => adminApi<ColorSet>(`${P}/color-sets`, { method: 'POST', body }), onSuccess: doneC }),
    updateColorSet: useMutation({ mutationFn: ({ id, body }: { id: string; body: { name?: string; color_ids?: string[] } }) => adminApi<ColorSet>(`${P}/color-sets/${id}`, { method: 'PATCH', body }), onSuccess: doneC }),
    removeSizeSet: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/size-sets/${id}`, { method: 'DELETE' }), onSuccess: doneS }),
    removeColorSet: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/color-sets/${id}`, { method: 'DELETE' }), onSuccess: doneC }),
  };
}

// ── خانواده‌های کالا (Product = ماتریس سایز × رنگ) ──
export type ProductRow = AdminSchemas['ProductListOut'];
export type ProductDetail = AdminSchemas['ProductDetailOut'];
export type ProductCreateIn = AdminSchemas['ProductCreateIn'];
export type ProductUpdateIn = AdminSchemas['ProductUpdateIn'];
export type ProductNamePreviewIn = AdminSchemas['ProductNamePreviewIn'];
export type ProductNamePreviewOut = AdminSchemas['ProductNamePreviewOut'];
export type CellIn = AdminSchemas['CellIn'];
export type AttributeRowIn = AdminSchemas['AttributeRowIn'];
export type AttributeRowOut = AdminSchemas['AttributeRowOut'];
export type ItemBrief = AdminSchemas['ItemBriefOut'];
export type ItemRow = AdminSchemas['ItemListOut'];
export type DraftRow = AdminSchemas['DraftListOut'];
export type Draft = AdminSchemas['DraftOut'];
export type UnitBrief = AdminSchemas['ItemUnitBriefOut'];
const KP = { list: ['catalog', 'products'] as const, one: (id: string) => ['catalog', 'product', id] as const, drafts: ['catalog', 'product-drafts'] as const };

export const useProducts = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: [...KP.list, p], queryFn: ({ signal }) => adminApi<Paginated<ProductRow>>(`${P}/products`, { query: p, signal }), placeholderData: keepPreviousData, enabled });
export const useProduct = (id: string | undefined) =>
  useQuery({ queryKey: KP.one(id ?? ''), queryFn: ({ signal }) => adminApi<ProductDetail>(`${P}/products/${id}`, { signal }), enabled: !!id });
/** کالاها/آیتم‌های یک خانواده (GET /items?product_id) */
export const useProductItems = (productId: string | undefined, p: ListParams) =>
  useQuery({ queryKey: ['catalog', 'items', { product_id: productId, ...p }], queryFn: ({ signal }) => adminApi<Paginated<ItemRow>>(`${P}/items`, { query: { product_id: productId, ...p }, signal }), enabled: !!productId, placeholderData: keepPreviousData });
export function useProductWrite() {
  const qc = useQueryClient();
  const done = (d?: ProductDetail) => { qc.invalidateQueries({ queryKey: KP.list }); qc.invalidateQueries({ queryKey: ['catalog', 'items'] }); if (d) qc.setQueryData(KP.one(d.id), d); };
  return {
    create: useMutation({ mutationFn: (body: ProductCreateIn) => adminApi<AdminSchemas['ProductCreateOut']>(`${P}/products`, { method: 'POST', body }), onSuccess: (d) => { done(d); qc.invalidateQueries({ queryKey: KP.drafts }); } }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: ProductUpdateIn }) => adminApi<ProductDetail>(`${P}/products/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    addCells: useMutation({ mutationFn: ({ id, cells }: { id: string; cells: CellIn[] }) => adminApi<ItemBrief[]>(`${P}/products/${id}/cells`, { method: 'PATCH', body: { cells } }), onSuccess: (_r, v) => { done(); qc.invalidateQueries({ queryKey: KP.one(v.id) }); } }),
    setAttributes: useMutation({ mutationFn: ({ id, values }: { id: string; values: AttributeRowIn[] }) => adminApi<ProductDetail>(`${P}/products/${id}/attributes`, { method: 'PUT', body: { values } }), onSuccess: done }),
    activate: useMutation({ mutationFn: (id: string) => adminApi<ProductDetail>(`${P}/products/${id}/activate`, { method: 'PATCH' }), onSuccess: done }),
    archive: useMutation({ mutationFn: (id: string) => adminApi<ProductDetail>(`${P}/products/${id}/archive`, { method: 'DELETE' }), onSuccess: done }),
    restore: useMutation({ mutationFn: (id: string) => adminApi<ProductDetail>(`${P}/products/${id}/restore`, { method: 'PATCH' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/products/${id}`, { method: 'DELETE' }), onSuccess: () => done() }),
  };
}
/** پیش‌نمایش نام خانواده و سلول‌ها؛ چیزی ذخیره نمی‌شود */
export const previewProductNames = (body: ProductNamePreviewIn, signal?: AbortSignal) => adminApi<ProductNamePreviewOut>(`${P}/products/name-preview`, { method: 'POST', body, signal });

// ── پیش‌نویس‌های ماتریس (فقط پیش‌نویس‌های خود کاربر؛ سوپر ادمین همه) ──
export const useDrafts = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: [...KP.drafts, p], queryFn: ({ signal }) => adminApi<Paginated<DraftRow>>(`${P}/product-drafts`, { query: p, signal }), enabled, placeholderData: keepPreviousData });
export const useDraft = (id: string | null) =>
  useQuery({ queryKey: ['catalog', 'product-draft', id], queryFn: ({ signal }) => adminApi<Draft>(`${P}/product-drafts/${id}`, { signal }), enabled: !!id, retry: false });
export function useDraftWrite() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KP.drafts });
  return {
    create: useMutation({ mutationFn: (body: { label: string; data: Record<string, unknown> }) => adminApi<Draft>(`${P}/product-drafts`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: { label: string; data: Record<string, unknown> } }) => adminApi<Draft>(`${P}/product-drafts/${id}`, { method: 'POST', body }), onSuccess: done }),
    discard: useMutation({ mutationFn: (id: string) => adminApi<void>(`${P}/product-drafts/${id}/discard`, { method: 'POST' }), onSuccess: done }),
  };
}

// ── فهرست‌های کمکی فرم ماتریس ──
export const useAllBrands = (enabled = true) => useQuery({ queryKey: [...K.brands, 'all-active'], queryFn: () => fetchAll<Brand>(`${P}/brands`, { status: 'ACTIVE' }), enabled });
/** واحدهای اصلی فعال (settings از راه catalog؛ بی‌نیاز از مجوز settings) */
export const useUnits = (enabled = true) => useQuery({ queryKey: ['catalog', 'units'], queryFn: () => fetchAll<UnitBrief>(`${P}/units`), enabled });
/** ویژگی‌های فعال یک نقش (COMMON روی خانواده؛ ITEM/DESCRIPTIVE روی آیتم) */
export const useAttributesByRole = (role: string, enabled = true) =>
  useQuery({ queryKey: [...K.attributes, 'role', role], queryFn: () => fetchAll<Attribute>(`${P}/attributes`, { role, is_active: true }), enabled });
/** همه‌ی مقدارهای پیشنهادی یک ویژگی متنی (مثل «مدل/طرح» برای فیلتر model_line، C-25) */
export const useAttributeSuggestionsAll = (attributeId?: string) =>
  useQuery({ queryKey: [...K.attributes, 'suggestions', attributeId], queryFn: () => fetchAll<{ value: string }>(`${P}/attributes/${attributeId}/suggestions`), enabled: !!attributeId });
export const attributeSuggestions = (attributeId: string, query: string, signal?: AbortSignal) =>
  adminApi<Paginated<{ value: string }>>(`${P}/attributes/${attributeId}/suggestions`, { query: { query, page_size: 10 }, signal });
export async function downloadXlsx(path: string, query: Record<string, string | number | boolean | undefined>, filename: string) {
  const blob = await apiRequest<Blob>('admin', path, { raw: true, query });
  saveBlob(blob, filename);
}

// ── قیمت کالا (pricing) و فهرست کالاها/آیتم‌ها ──
export type PriceDetail = AdminSchemas['PriceDetailOut'];
export type PriceRow = AdminSchemas['PriceRowOut'];
/** قیمت یک صفحه از جدول کالاها در یک درخواست (C-12: `item_ids` تکراری، حداکثر ۱۰۰). کالای بی‌قیمت در پاسخ نیست. */
export const usePricesFor = (itemIds: string[], enabled: boolean) =>
  useQuery({
    queryKey: ['pricing', 'prices', 'of', itemIds],
    queryFn: async ({ signal }) => {
      const r = await adminApi<Paginated<PriceRow>>('/pricing/prices', { query: { item_ids: itemIds, page_size: itemIds.length }, signal });
      return new Map(r.results.map((x) => [x.item_id, x]));
    },
    enabled: enabled && itemIds.length > 0 && itemIds.length <= 100, staleTime: 60_000, placeholderData: keepPreviousData,
  });
export const setPricesBulk = (rows: { item_id: string; sale_price: string }[]) => adminApi<unknown>('/pricing/prices/bulk', { method: 'PUT', body: { rows } });
// بعد از ثبت قیمت، کش قیمت‌ها باید باطل شود (صدا زننده: qc.invalidateQueries({ queryKey: ['pricing'] }))
export const useItems = (p: ListParams, enabled = true) =>
  useQuery({ queryKey: ['catalog', 'items', p], queryFn: ({ signal }) => adminApi<Paginated<ItemRow>>(`${P}/items`, { query: p, signal }), placeholderData: keepPreviousData, enabled });
export function useItemWrite() {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: ['catalog', 'items'] }); qc.invalidateQueries({ queryKey: KP.list }); };
  return {
    archive: useMutation({ mutationFn: (id: string) => adminApi<unknown>(`${P}/items/${id}/archive`, { method: 'DELETE' }), onSuccess: done }),
    restore: useMutation({ mutationFn: (id: string) => adminApi<unknown>(`${P}/items/${id}/restore`, { method: 'PATCH' }), onSuccess: done }),
  };
}

// ── آیتم‌ها (واحد فروش) — POST /items ویزارد یک‌جا، تصاویر جدا (PUT /items/{id}/images، multipart) ──
export type ItemDetail = AdminSchemas['ItemDetailOut'];
export type ItemCreateIn = AdminSchemas['ItemCreateIn'];
export type ItemUpdateIn = AdminSchemas['ItemUpdateIn'];
export type ItemPolicy = AdminSchemas['ItemPolicyOut'];
export type ItemPolicyIn = AdminSchemas['ItemPolicyIn'];
export type ItemUnitOptions = AdminSchemas['ItemUnitOptionsOut'];
export type ImageRowIn = { id?: string; file_index?: number; kind: 'MANNEQUIN' | 'DIGIKALA' | 'HUMAN'; sort_order?: number; is_primary?: boolean };
const KI = { all: ['catalog', 'items'] as const, one: (id: string) => ['catalog', 'item', id] as const };
export const useItem = (id: string | undefined) =>
  useQuery({ queryKey: KI.one(id ?? ''), queryFn: ({ signal }) => adminApi<ItemDetail>(`${P}/items/${id}`, { signal }), enabled: !!id });
export const useItemPolicy = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: [...KI.one(id ?? ''), 'policy'], queryFn: ({ signal }) => adminApi<ItemPolicy>(`${P}/items/${id}/policy`, { signal }), enabled: !!id && enabled, retry: false });
/** قیمت یک کالا/آیتم با اجزا و جمع پایه (pricing.prices.read) */
export const usePriceDetail = (itemId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['pricing', 'price', itemId], queryFn: ({ signal }) => adminApi<PriceDetail>(`/pricing/prices/${itemId}`, { signal }), enabled: !!itemId && enabled, retry: false });
/** واحد آیتم پیش از ساخت: تطابق‌ها، انتخاب خودکار یا پیشنهاد واحد فرعی تازه */
export const itemUnitOptions = (body: { product_id: string; components: { item_id: string; quantity: number }[] }, signal?: AbortSignal) =>
  adminApi<ItemUnitOptions>(`${P}/items/unit-options`, { method: 'POST', body, signal });
/** گروه‌های فعال مشتری برای «نمایش به گروهی از مشتریان» (customers.groups.list) */
export const useActiveCustomerGroups = (enabled: boolean) =>
  useQuery({ queryKey: ['customers', 'groups', 'active-all'], queryFn: () => fetchAll<{ id: string; name: string; code?: string }>('/customers/groups', { is_active: true }), enabled, staleTime: 60_000 });
export function useItemMutations() {
  const qc = useQueryClient();
  const done = (it?: ItemDetail) => { qc.invalidateQueries({ queryKey: KI.all }); qc.invalidateQueries({ queryKey: KP.list }); qc.invalidateQueries({ queryKey: ['pricing'] }); if (it) qc.setQueryData(KI.one(it.id), it); };
  const one = (id: string) => () => qc.invalidateQueries({ queryKey: KI.one(id) });
  return {
    create: useMutation({ mutationFn: (body: ItemCreateIn) => adminApi<ItemDetail>(`${P}/items`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: ItemUpdateIn }) => adminApi<ItemDetail>(`${P}/items/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    visibility: useMutation({ mutationFn: ({ id, audience, group_ids }: { id: string; audience: 'ALL' | 'GROUPS'; group_ids: string[] }) => adminApi<ItemDetail>(`${P}/items/${id}/visibility`, { method: 'PATCH', body: { audience, group_ids } }), onSuccess: done }),
    policy: useMutation({ mutationFn: ({ id, body }: { id: string; body: ItemPolicyIn }) => adminApi<ItemPolicy>(`${P}/items/${id}/policy`, { method: 'PATCH', body }), onSuccess: (_r, v) => one(v.id)() }),
    attributes: useMutation({ mutationFn: ({ id, values }: { id: string; values: AttributeRowIn[] }) => adminApi<ItemDetail>(`${P}/items/${id}/attributes`, { method: 'PUT', body: { values } }), onSuccess: done }),
    relations: useMutation({ mutationFn: ({ id, kind, item_ids }: { id: string; kind: 'RELATED' | 'SIMILAR'; item_ids: string[] }) => adminApi<ItemDetail>(`${P}/items/${id}/relations/${kind}`, { method: 'PUT', body: { item_ids } }), onSuccess: done }),
    images: useMutation({ mutationFn: ({ id, rows, files }: { id: string; rows: ImageRowIn[]; files: File[] }) => { const fd = new FormData(); fd.append('rows', JSON.stringify(rows)); files.forEach((f) => fd.append('files', f)); return adminApi<ItemDetail>(`${P}/items/${id}/images`, { method: 'PUT', body: fd }); }, onSuccess: done }),
    activate: useMutation({ mutationFn: (id: string) => adminApi<ItemDetail>(`${P}/items/${id}/activate`, { method: 'PATCH' }), onSuccess: done }),
    hide: useMutation({ mutationFn: (id: string) => adminApi<ItemDetail>(`${P}/items/${id}/hide`, { method: 'PATCH' }), onSuccess: done }),
    archive: useMutation({ mutationFn: (id: string) => adminApi<ItemDetail>(`${P}/items/${id}/archive`, { method: 'DELETE' }), onSuccess: done }),
    restore: useMutation({ mutationFn: (id: string) => adminApi<ItemDetail>(`${P}/items/${id}/restore`, { method: 'PATCH' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<unknown>(`${P}/items/${id}`, { method: 'DELETE' }), onSuccess: () => done() }),
  };
}

// ── باندل‌ها (پک کالا) — catalog/bundles + قیمت در pricing/bundle-prices ──
export type BundleRow = AdminSchemas['BundleListOut'];
export type BundleDetail = AdminSchemas['BundleDetailOut'];
export type BundleCreateIn = AdminSchemas['BundleCreateIn'];
export type BundleUpdateIn = AdminSchemas['BundleUpdateIn'];
export type BundlePrice = AdminSchemas['BundlePriceOut'];
export type BundlePriceIn = AdminSchemas['BundlePriceIn'];
const KB = { list: ['catalog', 'bundles'] as const, one: (id: string) => ['catalog', 'bundle', id] as const, price: (id: string) => ['pricing', 'bundle-price', id] as const };
/** سیاست‌های فعال باندل (تعریف در تنظیمات ⇐ سیاست‌های باندل، C-28 ✅): GET /catalog/bundle-policies، به ترتیب نمایش؛ مجوز catalog.bundles.list */
export type BundlePolicyOption = AdminSchemas['BundlePolicyOptionOut'];
export const useBundlePolicies = () => useQuery({ queryKey: [...KB.list, 'policies'], staleTime: 5 * 60_000, queryFn: () => fetchAll<BundlePolicyOption>(`${P}/bundle-policies`) });
export const useBundles = (p: ListParams) =>
  useQuery({ queryKey: [...KB.list, p], queryFn: ({ signal }) => adminApi<Paginated<BundleRow>>(`${P}/bundles`, { query: p, signal }), placeholderData: keepPreviousData });
export const useBundle = (id: string | undefined) =>
  useQuery({ queryKey: KB.one(id ?? ''), queryFn: ({ signal }) => adminApi<BundleDetail>(`${P}/bundles/${id}`, { signal }), enabled: !!id });
/** قیمت محاسبه‌شده‌ی باندل‌های یک صفحه با یک درخواست (C-21 ✅): GET /pricing/bundle-prices?bundle_ids=… (حداکثر ۱۰۰، حتی بی‌تنظیم قیمت) ⇐ Map بر اساس bundle_id */
export const useBundlePricesFor = (ids: string[], enabled: boolean) =>
  useQuery({
    queryKey: ['pricing', 'bundle-prices', 'of', ids],
    queryFn: async ({ signal }) => {
      const r = await adminApi<Paginated<BundlePrice>>('/pricing/bundle-prices', { query: { bundle_ids: ids, page_size: ids.length }, signal });
      return new Map(r.results.map((x) => [x.bundle_id, x]));
    },
    enabled: enabled && ids.length > 0 && ids.length <= 100, staleTime: 30_000, placeholderData: keepPreviousData, retry: false,
  });
/** قیمت محاسبه‌شده/نهایی یک باندل (pricing.prices.bundles.read) — پنل جزئیات و فرم */
export const useBundlePrice = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: KB.price(id ?? ''), queryFn: ({ signal }) => adminApi<BundlePrice>(`/pricing/bundle-prices/${id}`, { signal }), enabled: !!id && enabled, staleTime: 30_000, retry: false });
export function useBundleMutations() {
  const qc = useQueryClient();
  const done = (b?: BundleDetail) => { qc.invalidateQueries({ queryKey: KB.list }); qc.invalidateQueries({ queryKey: ['pricing'] }); if (b) qc.setQueryData(KB.one(b.id), b); };
  return {
    create: useMutation({ mutationFn: (body: BundleCreateIn) => adminApi<BundleDetail>(`${P}/bundles`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: BundleUpdateIn }) => adminApi<BundleDetail>(`${P}/bundles/${id}`, { method: 'PATCH', body }), onSuccess: done }),
    publish: useMutation({ mutationFn: (id: string) => adminApi<BundleDetail>(`${P}/bundles/${id}/publish`, { method: 'PATCH' }), onSuccess: done }),
    /** آرشیو (C-24 ✅، افشین: «آرشیو» نه «توقف»): is_active=false؛ با publish دوباره منتشر می‌شود؛ باندل منتشرشده فقط آرشیو می‌شود، حذف نه */
    archive: useMutation({ mutationFn: (id: string) => adminApi<BundleDetail>(`${P}/bundles/${id}/archive`, { method: 'PATCH' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => adminApi<unknown>(`${P}/bundles/${id}`, { method: 'DELETE' }), onSuccess: () => done() }),
    price: useMutation({ mutationFn: ({ id, body }: { id: string; body: BundlePriceIn }) => adminApi<BundlePrice>(`/pricing/bundle-prices/${id}`, { method: 'PUT', body }), onSuccess: () => done() }),
  };
}
/** پیش‌نمایش نام آیتم پیش از ساخت (C-18) — چیزی ذخیره نمی‌شود */
export const previewItemName = (body: { product_id: string; variation_pattern: string; components: { item_id: string; quantity: number }[] }, signal?: AbortSignal) =>
  adminApi<{ display_name: string; goods_count: number }>(`${P}/items/name-preview`, { method: 'POST', body, signal });
