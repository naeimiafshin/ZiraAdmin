/**
 * انواع قرارداد API، تولیدشده از OpenAPI بک‌اند (npm run api:sync).
 * هیچ نوع دستی برای پاسخ بک‌اند ننویسید؛ از این‌جا بگیرید.
 */
import type { components as AdminComponents } from './schema/admin';
import type { components as PublicComponents } from './schema/public';

export type AdminSchemas = AdminComponents['schemas'];
export type PublicSchemas = PublicComponents['schemas'];

/** پاکت صفحه‌بندی همه‌ی لیست‌ها (R-API-01). */
export type Paginated<T> = { total: number; page: number; page_size: number; results: T[] };
