import { usePerm } from '@/shared/auth/usePerm';
import { useAllBrands, useCategoryTree } from '@/features/catalog/api';

/**
 * گزینه‌های فیلتر «برند» و «دسته اصلی» جدول‌های موجودی (wms `brand_id` و `category_id` — دسته با زیرشاخه‌ها؛ B-10).
 * بدون مجوز فهرست برند/دسته گزینه‌ای نمی‌آید (فیلتر خالی می‌ماند).
 */
export function useStockFilterOptions() {
  const can = usePerm();
  const brands = useAllBrands(can('catalog.brands.list'));
  const tree = useCategoryTree(false);
  return {
    brands: (brands.data ?? []).map((b) => ({ value: b.id, label: b.name })),
    mainCategories: can('catalog.categories.list') ? (tree.data ?? []).map((c) => ({ value: c.id, label: c.name })) : [],
  };
}
