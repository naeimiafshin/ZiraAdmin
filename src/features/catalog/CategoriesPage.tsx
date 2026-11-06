import { useMemo, useState } from 'react';
import { IconArrowsMove, IconBan, IconCircleCheck, IconEyeOff, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { usePerm } from '@/shared/auth/usePerm';
import { userMessage } from '@/shared/api/errors';
import { faNum } from '@/shared/lib/format';
import { toLatinDigits } from '@/shared/lib/text';
import { useListParams, useSearchState } from '@/shared/lib/useListParams';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormGrid, Input, Select, Textarea, Toggle } from '@/shared/ui/form';
import { Badge, Card, Empty, ErrorBox, Modal, SectionTitle, Segmented, SkeletonRows } from '@/shared/ui/kit';
import { TableFilters, searchKey } from '@/shared/ui/TableFilters';
import { useToast } from '@/shared/ui/toast';
import { useCategoryTree, useCategoryWrite, type CategoryNode } from './api';
import { ConfirmModal, IconButton } from './components';
import { CATEGORY_LEVEL } from './labels';
import s from './catalog.module.css';

/**
 * دسته‌بندی کالا — درخت سه‌سطحی (GET /catalog/categories، بدون صفحه‌بندی). سه ستون سطحی مثل html Fixed V2؛
 * ایجاد در کادر بالا، جست‌وجو در همه‌ی سطوح، تغییر نام/جابه‌جایی/غیرفعال/حذف روی هر ردیف.
 * قاعده‌ی بک‌اند (نه html): حذف فقط دسته‌ی بی‌زیردسته و بی‌خانواده (۴۰۹ ⇐ غیرفعال کنید)؛ غیرفعال‌سازی کل زیردرخت را می‌گیرد.
 * دسته‌ی انتخاب‌شده در URL (`cat`) تا «بازگشت» همان حالت را برگرداند.
 */
type Flat = CategoryNode & { path: string[]; descendants: number };

function flatten(nodes: CategoryNode[], path: string[] = [], out: Flat[] = []): Flat[] {
  for (const n of nodes) {
    const p = [...path, n.name];
    const before = out.length;
    out.push({ ...n, path: p, descendants: 0 });
    const idx = before;
    flatten(n.children ?? [], p, out);
    out[idx]!.descendants = out.length - before - 1;
  }
  return out;
}

export default function CategoriesPage() {
  const can = usePerm();
  const lp = useListParams();
  const { text, setText, dq } = useSearchState(lp, 250);
  const tree = useCategoryTree(true);
  const w = useCategoryWrite();
  const toast = useToast();
  const flat = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const byId = useMemo(() => new Map(flat.map((n) => [n.id, n])), [flat]);
  const selId = lp.get('cat');
  const sel = selId ? byId.get(selId) : undefined;
  // زنجیره‌ی انتخاب: دسته‌ی انتخاب‌شده و والدهایش
  const chain: (Flat | undefined)[] = [undefined, undefined, undefined];
  for (let n = sel; n; n = n.parent_id ? byId.get(n.parent_id) : undefined) chain[n.level - 1] = n;
  const [main, mid, sub] = chain;
  const mains = tree.data ?? [];
  const mids = main?.children ?? [];
  const subs = mid?.children ?? [];
  const counts = [1, 2, 3].map((l) => flat.filter((n) => n.level === l).length);
  const status = lp.get('status');
  const visible = (n: CategoryNode) => !status || (status === 'active' ? n.is_active : !n.is_active);
  const q = dq;
  const results = q ? flat.filter((n) => visible(n) && searchKey(n.name, n.code, n.slug).includes(searchKey(q))) : [];

  const [edit, setEdit] = useState<Flat | null>(null);
  const [move, setMove] = useState<Flat | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'deactivate' | 'delete'; n: Flat } | null>(null);
  const select = (n: CategoryNode) => lp.set({ cat: n.id, query: null });

  const nodeRow = (n: CategoryNode, on: boolean) => {
    const f = byId.get(n.id)!;
    const kids = n.children?.length ?? 0;
    return (
      <div key={n.id} role="button" tabIndex={0} className={`${s.node} ${on ? s.nodeOn : ''} ${n.is_active ? '' : s.nodeOff}`}
        onClick={() => select(n)} onKeyDown={(e) => { if (e.key === 'Enter') select(n); }} aria-pressed={on}>
        <span className={s.nodeMain}>
          <span className={s.nodeName}>{n.name}</span>
          <span className={s.nodeMeta}>
            {n.level < 3 ? <span>{faNum(kids)} {CATEGORY_LEVEL[n.level]}</span> : <span>{faNum(n.product_count)} خانواده‌ی کالا</span>}
            {n.code ? <span className="ltr" data-latin>{n.code}</span> : null}
            {!n.is_active ? <Badge tone="danger">غیرفعال</Badge> : !n.is_visible ? <Badge tone="neutral"><IconEyeOff size={11} />پنهان</Badge> : null}
          </span>
        </span>
        <span className={s.nodeActs}>
          {can('catalog.categories.update') ? <IconButton label="ویرایش" onClick={() => setEdit(f)}><IconPencil size={15} /></IconButton> : null}
          {can('catalog.categories.update') ? <IconButton label="جابه‌جایی" onClick={() => setMove(f)}><IconArrowsMove size={15} /></IconButton> : null}
          {can('catalog.categories.update') ? (n.is_active
            ? <IconButton label="غیرفعال‌سازی" onClick={() => setConfirm({ kind: 'deactivate', n: f })}><IconBan size={15} /></IconButton>
            : <IconButton label="فعال‌سازی" onClick={async () => { try { await w.update.mutateAsync({ id: n.id, body: { is_active: true } }); toast('دسته فعال شد.'); } catch (e) { toast(userMessage(e), 'error'); } }}><IconCircleCheck size={15} /></IconButton>) : null}
          {can('catalog.categories.delete') ? <IconButton label="حذف" danger onClick={() => setConfirm({ kind: 'delete', n: f })}><IconTrash size={15} /></IconButton> : null}
        </span>
      </div>
    );
  };

  return (
    <div className={s.stack}>
      <Card>
        <p className={s.intro}>سه سطح: دسته اصلی، دسته میانی و دسته فرعی. خانواده‌ی کالا فقط به دسته‌ی فرعی وصل می‌شود و نام کالا از همین سه سطح ساخته می‌شود. برای ساختن زیردسته، اول والد را در ستون‌های پایین انتخاب کنید تا در کادر ایجاد پیش‌پر شود.</p>
        <div className={s.catStats}>
          {CATEGORY_LEVEL.map((l, i) => <div key={l} className={s.catStat}><div className={s.catStatLabel}>{l}</div><div className={`${s.catStatValue} tnum`}>{tree.data ? faNum(counts[i]!) : '—'}</div></div>)}
          <div className={s.catStat}><div className={s.catStatLabel}>مسیر انتخاب‌شده</div><div className={s.catStatPath}>{[main, mid, sub].map((n) => n?.name ?? '—').join(' › ')}</div></div>
        </div>
      </Card>
      {can('catalog.categories.create') ? <CreateCategory mains={mains} byId={byId} preMain={main} preMid={mid} onCreated={(id) => lp.set({ cat: id })} /> : null}
      <Card>
        <SectionTitle>لیست دسته‌بندی‌ها</SectionTitle>
        <TableFilters search={text} onSearch={setText} placeholder="جست‌وجو در همه‌ی سطوح: نام، کد یا slug"
          filters={[{ key: 'status', label: 'وضعیت', value: status, onChange: lp.setFilter('status'), options: [{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }] }]}
          count={q ? `${faNum(results.length)} نتیجه` : undefined} />
        {tree.isLoading ? <SkeletonRows rows={4} height={60} /> : tree.error ? <ErrorBox error={tree.error} onRetry={() => tree.refetch()} /> : q ? (
          results.length === 0 ? <Empty title="دسته‌ای با این جست‌وجو پیدا نشد" /> : (
            <div className={s.results}>
              {results.map((n) => (
                <button key={n.id} type="button" className={s.resultRow} onClick={() => select(n)}>
                  <Badge tone={n.level === 1 ? 'danger' : n.level === 2 ? 'info' : 'success'}>{CATEGORY_LEVEL[n.level - 1]}</Badge>
                  <span className={s.strong}>{n.name}</span>
                  <span className={s.resultPath}>{n.path.join(' › ')}</span>
                  {!n.is_active ? <Badge tone="neutral">غیرفعال</Badge> : null}
                </button>
              ))}
            </div>
          )
        ) : mains.length === 0 ? (
          <Empty title="هنوز دسته‌ای تعریف نشده است" text="با کادر بالا اولین دسته‌ی اصلی را بسازید." />
        ) : (
          <div className={s.cols}>
            {[mains, mids, subs].map((list, i) => (
              <div key={i} className={s.col}>
                <div className={s.colHead}><span>{faNum(i + 1)}. {CATEGORY_LEVEL[i]}</span><Badge tone="neutral">{faNum(list.filter(visible).length)} دسته</Badge></div>
                <div className={s.colBody}>
                  {i > 0 && !chain[i - 1] ? <div className={s.colEmpty}>ابتدا یک {CATEGORY_LEVEL[i - 1]} را از ستون کناری انتخاب کنید.</div>
                    : list.filter(visible).length === 0 ? <div className={s.colEmpty}>{i === 0 ? 'دسته‌ای نیست.' : `«${chain[i - 1]!.name}» ${CATEGORY_LEVEL[i]} ندارد.`}</div>
                    : list.filter(visible).map((n) => nodeRow(n, chain[i]?.id === n.id))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {edit ? <EditCategoryModal n={edit} onClose={() => setEdit(null)} /> : null}
      {move ? <MoveCategoryModal n={move} flat={flat} onClose={() => setMove(null)} /> : null}
      {confirm?.kind === 'deactivate' ? (
        <ConfirmModal title="غیرفعال‌سازی دسته" confirmLabel="غیرفعال کن" onClose={() => setConfirm(null)}
          text={<>دسته‌ی <b>{confirm.n.name}</b>{confirm.n.descendants ? <> و {faNum(confirm.n.descendants)} زیردسته‌اش</> : null} غیرفعال می‌شود و در تعریف کالای تازه انتخاب‌شدنی نیست. خانواده‌های موجود دست نمی‌خورند.</>}
          onConfirm={async () => { await w.deactivate.mutateAsync(confirm.n.id); toast('دسته غیرفعال شد.'); }} />
      ) : null}
      {confirm?.kind === 'delete' ? (
        <ConfirmModal title="حذف دسته" confirmLabel="حذف کن" danger onClose={() => setConfirm(null)}
          text={confirm.n.descendants || confirm.n.product_count
            ? <>دسته‌ی <b>{confirm.n.name}</b> {confirm.n.descendants ? `${faNum(confirm.n.descendants)} زیردسته` : ''}{confirm.n.descendants && confirm.n.product_count ? ' و ' : ''}{confirm.n.product_count ? `${faNum(confirm.n.product_count)} خانواده‌ی کالا` : ''} دارد و حذف‌شدنی نیست؛ به‌جای حذف، غیرفعالش کنید.</>
            : <>دسته‌ی <b>{confirm.n.name}</b> برای همیشه حذف می‌شود.</>}
          onConfirm={async () => { await w.remove.mutateAsync(confirm.n.id); if (selId === confirm.n.id) lp.set({ cat: confirm.n.parent_id ?? null }); toast('دسته حذف شد.'); }} />
      ) : null}
    </div>
  );
}

/** کادر «ایجاد دسته‌بندی جدید»: سطح + والد(ها) + نام + کد اختیاری؛ فرم درون‌خطی (RULES ۳-۵) */
function CreateCategory({ mains, byId, preMain, preMid, onCreated }: { mains: CategoryNode[]; byId: Map<string, Flat>; preMain?: Flat; preMid?: Flat; onCreated: (id: string) => void }) {
  const w = useCategoryWrite();
  const toast = useToast();
  const [level, setLevel] = useState<'1' | '2' | '3'>('1');
  const [mainId, setMainId] = useState('');
  const [midId, setMidId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const curMain = mainId || preMain?.id || '';
  const curMid = midId || (preMid && preMid.parent_id === curMain ? preMid.id : '') || '';
  const midOpts = (curMain ? byId.get(curMain)?.children ?? [] : []).filter((n) => n.is_active);
  const parentId = level === '1' ? null : level === '2' ? curMain : curMid;
  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr('نام دسته را وارد کنید.'); return; }
    if (level !== '1' && !parentId) { setErr(level === '2' ? 'ابتدا دسته‌ی اصلی والد را انتخاب کنید.' : 'ابتدا دسته‌ی اصلی و میانی والد را انتخاب کنید.'); return; }
    const c = code.trim().toUpperCase();
    if (c && !/^[A-Z0-9_-]+$/.test(c)) { setErr('کد فقط حروف بزرگ لاتین، رقم، خط تیره و زیرخط.'); return; }
    try {
      const r = await w.create.mutateAsync({ name: name.trim(), parent_id: parentId, code: c || null, sort_order: 0, is_visible: true, description: '' });
      toast(`${CATEGORY_LEVEL[Number(level) - 1]} «${name.trim()}» ساخته شد.`); setName(''); setCode(''); onCreated(r.id);
    } catch (e) { setErr(userMessage(e)); }
  };
  const ph = ['مثال: لباس زیر زنانه', 'مثال: شورت و تانگا', 'مثال: شورت زنانه'][Number(level) - 1];
  return (
    <Card>
      <SectionTitle extra={<span className={s.sub}>{level === '1' ? 'بالاترین سطح گروه‌بندی کالا' : level === '2' ? (curMain ? `زیرمجموعه‌ی «${byId.get(curMain)?.name}»` : 'دسته‌ی اصلی والد را انتخاب کنید') : (curMid ? `زیرمجموعه‌ی «${byId.get(curMain)?.name} › ${byId.get(curMid)?.name}»` : 'دسته‌ی اصلی و میانی والد را انتخاب کنید')}</span>}>ایجاد دسته‌بندی جدید</SectionTitle>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <div className={s.inlineForm} style={{ gridTemplateColumns: level === '1' ? 'minmax(300px, 1.4fr) 2fr 1fr auto' : level === '2' ? 'minmax(300px, 1.4fr) 1fr 2fr 1fr auto' : 'minmax(300px, 1.4fr) 1fr 1fr 1.6fr 1fr auto' }}>
        <div className={s.segRow}><span className={s.segLabel}>سطح دسته <span style={{ color: 'var(--danger)' }}>*</span></span>
          <Segmented value={level} onChange={(v) => { setLevel(v); setErr(null); }} options={CATEGORY_LEVEL.map((l, i) => ({ value: String(i + 1) as '1' | '2' | '3', label: l }))} /></div>
        {level !== '1' ? <Select label="دسته‌ی اصلی" required value={curMain} onChange={(e) => { setMainId(e.target.value); setMidId(''); }} placeholder="انتخاب دسته‌ی اصلی" options={mains.filter((n) => n.is_active).map((n) => ({ value: n.id, label: n.name }))} /> : null}
        {level === '3' ? <Select label="دسته‌ی میانی" required value={curMid} onChange={(e) => setMidId(e.target.value)} placeholder={curMain ? 'انتخاب دسته‌ی میانی' : 'ابتدا دسته‌ی اصلی'} disabled={!curMain} options={midOpts.map((n) => ({ value: n.id, label: n.name }))} /> : null}
        <Input label="نام دسته" required value={name} onChange={(e) => setName(e.target.value)} placeholder={ph} maxLength={100} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <Input label="کد (اختیاری)" latin value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WOMEN-UNDER" dir="ltr" maxLength={20} />
        <Button icon={<IconPlus size={17} />} onClick={submit} loading={w.create.isPending}>ایجاد دسته</Button>
      </div>
    </Card>
  );
}

/** ویرایش: نام (endpoint تغییر نام جدا)، کد، slug، ترتیب، نمایش در سایت، توضیحات */
function EditCategoryModal({ n, onClose }: { n: Flat; onClose: () => void }) {
  const w = useCategoryWrite();
  const toast = useToast();
  const [f, setF] = useState({ name: n.name, code: n.code ?? '', slug: n.slug ?? '', sort_order: String(n.sort_order), is_visible: n.is_visible, description: n.description ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const busy = w.update.isPending || w.rename.isPending;
  const submit = async () => {
    setErr(null);
    if (!f.name.trim()) { setErr('نام دسته نمی‌تواند خالی باشد.'); return; }
    const c = f.code.trim().toUpperCase();
    if (c && !/^[A-Z0-9_-]+$/.test(c)) { setErr('کد فقط حروف بزرگ لاتین، رقم، خط تیره و زیرخط.'); return; }
    const body: Record<string, unknown> = {};
    if (c !== (n.code ?? '')) body.code = c;
    if (f.slug.trim() !== (n.slug ?? '')) body.slug = f.slug.trim();
    if (Number(f.sort_order || 0) !== n.sort_order) body.sort_order = Number(f.sort_order || 0);
    if (f.is_visible !== n.is_visible) body.is_visible = f.is_visible;
    if (f.description !== (n.description ?? '')) body.description = f.description;
    try {
      if (f.name.trim() !== n.name) await w.rename.mutateAsync({ id: n.id, name: f.name.trim() });
      if (Object.keys(body).length) await w.update.mutateAsync({ id: n.id, body });
      toast('دسته ذخیره شد.'); onClose();
    } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`ویرایش ${CATEGORY_LEVEL[n.level - 1]}`} width={600}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={busy}>ذخیره‌ی تغییرات</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={2}>
        <Input label="نام دسته" required value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} maxLength={100} hint={n.path.length > 1 ? n.path.slice(0, -1).join(' › ') : undefined} />
        <Input label="کد" latin value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} dir="ltr" maxLength={20} />
        <Input label="slug (نشانی در سایت)" latin value={f.slug} onChange={(e) => setF((x) => ({ ...x, slug: e.target.value }))} dir="ltr" maxLength={255} hint="خالی ⇐ از نام ساخته می‌شود" />
        <Input label="ترتیب نمایش" inputMode="numeric" value={f.sort_order} onChange={(e) => setF((x) => ({ ...x, sort_order: toLatinDigits(e.target.value).replace(/[^0-9]/g, '') }))} />
        <div className={s.segRow}><span className={s.segLabel}>نمایش در فروشگاه</span><Toggle checked={f.is_visible} onChange={(v) => setF((x) => ({ ...x, is_visible: v }))} label={f.is_visible ? 'در منوی سایت و پنل مشتری دیده می‌شود' : 'پنهان'} /></div>
        <div />
        <Textarea label="توضیحات" span={2} rows={3} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />
      </FormGrid>
    </Modal>
  );
}

/** جابه‌جایی: والد تازه از میان دسته‌های سطح ۱ و ۲ (به‌جز خودش و زیردرختش) یا ریشه؛ عمق نهایی ≤ ۳ را بک‌اند چک می‌کند */
function MoveCategoryModal({ n, flat, onClose }: { n: Flat; flat: Flat[]; onClose: () => void }) {
  const w = useCategoryWrite();
  const toast = useToast();
  const [parent, setParent] = useState<string>(n.parent_id ?? '');
  const [err, setErr] = useState<string | null>(null);
  const isDesc = (c: Flat) => c.path.length > n.path.length && n.path.every((p, i) => c.path[i] === p);
  const depth = n.descendants ? (flat.filter(isDesc).reduce((m, c) => Math.max(m, c.level), n.level) - n.level) : 0;
  const options = flat.filter((c) => c.is_active && c.id !== n.id && !isDesc(c) && c.level + 1 + depth <= 3).map((c) => ({ value: c.id, label: `${CATEGORY_LEVEL[c.level - 1]}: ${c.path.join(' › ')}` }));
  const submit = async () => {
    setErr(null);
    if ((parent || null) === (n.parent_id ?? null)) { onClose(); return; }
    try { await w.move.mutateAsync({ id: n.id, parent_id: parent || null }); toast('دسته جابه‌جا شد.'); onClose(); } catch (e) { setErr(userMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`جابه‌جایی «${n.name}»`} width={560}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={w.move.isPending}>جابه‌جا کن</Button></>}>
      {err ? <div className={s.formErr}><Alert>{err}</Alert></div> : null}
      <FormGrid cols={1}>
        <Select label="والد تازه" value={parent} onChange={(e) => setParent(e.target.value)} placeholder={depth === 0 ? 'ریشه (دسته‌ی اصلی)' : 'ریشه (دسته‌ی اصلی)'} options={options}
          hint={n.descendants ? `${faNum(n.descendants)} زیردسته همراهش جابه‌جا می‌شوند؛ اگر دسته‌های زیردرخت خانواده‌ی کالا داشته باشند، جابه‌جایی رد می‌شود.` : 'دسته‌ی هم‌نام در مقصد مجاز نیست.'} />
      </FormGrid>
    </Modal>
  );
}
