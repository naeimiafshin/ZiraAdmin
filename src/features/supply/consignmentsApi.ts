import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/shared/api/client';
import type { AdminSchemas, Paginated } from '@/shared/api/types';
import type { ListParams } from './api';
import type { Advice } from './advicesApi';

/**
 * خرید امانی (supply.consignments) — /api/v1/admin/supply/consignments. متدها از OpenAPI.
 * کالای امانی وارد موجودی نمی‌شود. «عودت» فقط وضعیت را عوض می‌کند. «تبدیل به فاکتور» یک اعلامیه‌ی رسید انبار می‌سازد (کالا از مسیر
 * عادی انبار وارد می‌شود) و فاکتور بعداً از همان اعلامیه صادر می‌شود.
 */
const P = '/supply';
const CK = ['supply', 'consignments'] as const;

export type Consignment = AdminSchemas['ConsignmentOut'];
export type ConsignmentLine = AdminSchemas['ConsignmentLineOut'];
export type ConsignmentIn = AdminSchemas['ConsignmentIn'];
export type ConsignmentUpdateIn = AdminSchemas['ConsignmentUpdateIn'];
export type ConsignmentLineIn = AdminSchemas['ConsignmentLineIn'];
export type ConsignmentConvertIn = AdminSchemas['ConsignmentConvertIn'];

export const useConsignments = (p: ListParams) =>
  useQuery({ queryKey: [...CK, 'list', p], queryFn: ({ signal }) => adminApi<Paginated<Consignment>>(`${P}/consignments`, { query: p, signal }), placeholderData: keepPreviousData });

export const useConsignment = (id: string | null | undefined) =>
  useQuery({ queryKey: [...CK, 'one', id], queryFn: ({ signal }) => adminApi<Consignment>(`${P}/consignments/${id}`, { signal }), enabled: !!id });

export function useConsignmentWrite() {
  const qc = useQueryClient();
  const done = (x?: Consignment) => {
    if (x) qc.setQueryData([...CK, 'one', x.id], x);
    return qc.invalidateQueries({ queryKey: CK });
  };
  const id = (c: string) => `${P}/consignments/${c}`;
  return {
    create: useMutation({ mutationFn: (body: ConsignmentIn) => adminApi<Consignment>(`${P}/consignments`, { method: 'POST', body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ cid, body }: { cid: string; body: ConsignmentUpdateIn }) => adminApi<Consignment>(id(cid), { method: 'PATCH', body }), onSuccess: done }),
    markReturned: useMutation({ mutationFn: (cid: string) => adminApi<Consignment>(`${id(cid)}/return`, { method: 'PATCH' }), onSuccess: done }),
    convert: useMutation({
      mutationFn: ({ cid, body }: { cid: string; body: ConsignmentConvertIn }) => adminApi<Advice>(`${id(cid)}/convert`, { method: 'PUT', body }),
      onSuccess: () => { void qc.invalidateQueries({ queryKey: ['supply', 'advices'] }); return qc.invalidateQueries({ queryKey: CK }); },
    }),
  };
}
