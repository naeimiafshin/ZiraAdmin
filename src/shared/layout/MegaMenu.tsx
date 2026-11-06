import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { IconArrowUpLeft, IconSearch, IconX } from '@tabler/icons-react';
import { toFaDigits } from '@/shared/lib/text';
import { BrandMark } from '@/shared/ui/BrandMark';
import { iconFor } from './navConfig';
import type { NavGroup } from './useNav';
import s from './MegaMenu.module.css';

/** رنگ هر ماژول (افشین 2026-10-25: «رنگین‌کمان پاستلی»): ۱۵ رنگ هم‌روشنایی OKLCH(L .86, C .075, h = 25 + i×24)، به ترتیب IA، بدون تکرار. */
const PALETTE = ["#ffbfb8", "#fbc3a6", "#f0ca9b", "#dfd299", "#c9d9a2", "#b3dfb3", "#a0e1c9", "#95e1de", "#97def1", "#a5d8fe", "#b9d1ff", "#cfcaff", "#e2c3f5", "#f2bfe3", "#fcbdce"] as const;
/** خط نور تصادفی و غیرتکراری برای هر کارت بسته: زاویه و جا از بازه‌های پخش‌شده‌ی برزده انتخاب می‌شوند تا دو کارت شبیه هم نباشند. */
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };
function makeGlare(n: number) {
  const step = (lo: number, hi: number) => shuffle(Array.from({ length: n }, (_, i) => lo + ((hi - lo) * (i + Math.random() * 0.8)) / n));
  const angles = step(95, 165); const spots = step(12, 82);
  return Array.from({ length: n }, (_, i) => ({ '--ga': `${angles[i]!.toFixed(1)}deg`, '--gp': `${spots[i]!.toFixed(1)}%`, '--gw': `${(4 + Math.random() * 9).toFixed(1)}%`, '--gi': (0.18 + Math.random() * 0.3).toFixed(2) }));
}
/* ── موزاییک زیرمنوها (افشین 2026-10-25) ──
   هر صفحه یک کاشی با اندازه‌ی تصادفی (۱×۱، ۲×۱، ۱×۲، ۲×۲) و ترتیب تصادفی؛ چیدمان «خط افق» از گوشه‌ی پایین‌چپ کارت.
   یک واحد کاشی برای همه‌ی ماژول‌ها یکسان است و طوری حساب می‌شود که در شلوغ‌ترین ماژول مجموع کاشی‌ها دقیقاً ۲/۳ مساحت کارت باز باشد. */
type Shape = { w: number; h: number };
const SHAPES: (Shape & { p: number })[] = [{ w: 1, h: 1, p: 0.42 }, { w: 2, h: 1, p: 0.22 }, { w: 1, h: 2, p: 0.2 }, { w: 2, h: 2, p: 0.16 }];
const randomShape = (): Shape => { let r = Math.random(); for (const x of SHAPES) { if ((r -= x.p) <= 0) return { w: x.w, h: x.h }; } return { w: 1, h: 1 }; };
type Placed = Shape & { key: string; x: number; y: number };
/** چیدمان خط افق: هر کاشی در پایین‌ترین جای ممکن (و در تساوی چپ‌ترین) از پایین‌چپ؛ کاشی مستطیلی اگر چرخیده‌اش پایین‌تر بنشیند می‌چرخد. */
function packMosaic(order: { key: string; shape: Shape }[], cols: number): { tiles: Placed[]; height: number } {
  const sky = new Array<number>(cols).fill(0);
  const tiles: Placed[] = [];
  for (const { key, shape } of order) {
    let best: Placed | null = null;
    for (const sh of shape.w === shape.h ? [shape] : [shape, { w: shape.h, h: shape.w }]) {
      const w = Math.min(sh.w, cols);
      for (let x = 0; x + w <= cols; x++) {
        const y = Math.max(...sky.slice(x, x + w));
        if (!best || y < best.y || (y === best.y && x < best.x)) best = { key, x, y, w, h: sh.h };
      }
    }
    for (let i = best!.x; i < best!.x + best!.w; i++) sky[i] = best!.y + best!.h;
    tiles.push(best!);
  }
  return { tiles, height: Math.max(0, ...sky) };
}
const pad2 = (n: number) => toFaDigits(String(n).padStart(2, '0'));

/**
 * مگامنو به شکل «آکاردئون افقی» (مرجع: codepen.io/emanuelbento/pen/ByWYrNm):
 * هر ماژول یک قرص عمودی رنگی با نام چرخیده؛ با رفتن ماوس (یا کلید جهت/فوکوس) قرص باز می‌شود و
 * نام بزرگ ماژول + صفحه‌هایش را نشان می‌دهد. پایین: راهنما و شمارنده‌ی «۰۲ / ۱۵».
 */
export function MegaMenu({ groups, activeCode, onClose }: { groups: NavGroup[]; activeCode: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const glare = useMemo(() => makeGlare(groups.length), [groups.length]);
  const [q, setQ] = useState('');
  const term = q.trim();
  const list = useMemo(() => {
    if (!term) return groups;
    return groups
      .map((g) => (g.name.includes(term) ? g : { ...g, items: g.items.filter((i) => i.name.includes(term)), sections: g.sections.map((sec) => ({ ...sec, items: sec.items.filter((i) => i.name.includes(term)) })).filter((sec) => sec.items.length) }))
      .filter((g) => g.name.includes(term) || g.items.length);
  }, [groups, term]);
  const startIdx = Math.max(0, list.findIndex((g) => g.code === activeCode));
  const [idx, setIdx] = useState(startIdx);
  const cur = Math.min(idx, Math.max(0, list.length - 1));
  useEffect(() => { setIdx(term ? 0 : startIdx); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  // عرض پنل باز ثابت است تا متن هنگام باز شدن جابه‌جا نشود (مثل --arco-open)
  const wrap = useRef<HTMLUListElement>(null);
  const [openW, setOpenW] = useState(600);
  const [cardH, setCardH] = useState(600);
  const [pill, setPill] = useState(52);
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth; const n = list.length; const gap = 8;
      const p = Math.max(40, Math.min(64, Math.floor((w * 0.55) / Math.max(1, n - 1)) - gap));
      setPill(p);
      setOpenW(Math.max(280, w - (n - 1) * (p + gap)));
      setCardH(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [list.length]);

  const hover = useRef<number | null>(null);
  const activate = (i: number, delay = 70) => {
    if (hover.current) window.clearTimeout(hover.current);
    hover.current = window.setTimeout(() => setIdx(i), delay);
  };
  const go = (route: string | null) => { if (!route) return; navigate(route); onClose(); };

  // اندازه‌ی ناحیه‌ی کاشی‌ها (زیر عنوان) در کارت باز؛ برای همه‌ی کارت‌ها یکسان است
  const [field, setField] = useState({ w: 0, h: 0 });
  const fieldRO = useRef<ResizeObserver | null>(null);
  const fieldRef = (el: HTMLDivElement | null) => {
    fieldRO.current?.disconnect();
    if (!el) return;
    fieldRO.current = new ResizeObserver(() => setField((f) => (f.w === el.clientWidth && f.h === el.clientHeight ? f : { w: el.clientWidth, h: el.clientHeight })));
    fieldRO.current.observe(el);
  };
  // اندازه و ترتیب تصادفی کاشی‌ها، یک بار برای هر باز شدن مگامنو
  const plan = useMemo(() => new Map(groups.map((g) => [g.code, shuffle(g.items.map((it) => ({ key: it.key, shape: randomShape() })))])), [groups]);
  const mosaic = useMemo(() => {
    if (!field.w || !field.h) return null;
    type Order = { key: string; shape: Shape }[];
    const area = (o: Order) => o.reduce((n, x) => n + x.shape.w * x.shape.h, 0);
    /** چیدمان یک ماژول: پهنای خوشه متناسب با مساحت خودش (هم‌نسبت با ناحیه) تا از گوشه‌ی پایین‌چپ مثل یک تکه رشد کند؛ اگر جا نشد پهن‌تر */
    const layout = (o: Order, u: number) => {
      const maxCols = Math.max(2, Math.floor(field.w / u));
      const start = Math.min(maxCols, Math.max(2, Math.ceil(Math.sqrt(area(o) * (field.w / field.h)))));
      let best = packMosaic(o, start);
      for (let c = start + 1; c <= maxCols && best.height * u > field.h; c++) best = packMosaic(o, c);
      return best;
    };
    const fits = (o: Order, u: number) => layout(o, u).height * u <= field.h;
    const reroll = (o: Order): Order => shuffle(o.map((x) => ({ key: x.key, shape: randomShape() })));
    // شلوغ‌ترین ماژول = بیشترین صفحه؛ اندازه‌ها و ترتیبِ تصادفی‌اش آن‌قدر عوض می‌شود تا با واحدی که مجموعش را دقیقاً ۲/۳ کارت می‌کند در ناحیه جا شود
    const [busyCode, first] = [...plan.entries()].reduce((a, b) => (b[1].length > a[1].length ? b : a), ['', [] as Order] as [string, Order]);
    if (!first.length) return null;
    const target = (2 / 3) * openW * cardH;
    let busy = first;
    let unit = Math.sqrt(target / area(busy));
    let ok = fits(busy, unit);
    for (let k = 0; k < 400 && !ok; k++) { busy = reroll(first); unit = Math.sqrt(target / area(busy)); ok = fits(busy, unit); }
    // اگر هیچ ترکیبی جا نشد: واحد کمی کوچک‌تر (پوشش کمتر از ۲/۳، هرگز بیشتر)
    for (let k = 0; k < 120 && !ok; k++) { unit *= 0.99; ok = fits(busy, unit); }
    const orders = new Map<string, Order>([[busyCode, busy]]);
    // ماژول‌های دیگر با همان واحد؛ اگر ترکیب تصادفی‌شان جا نشد، دوباره تصادفی
    for (const [code, o] of plan) {
      if (code === busyCode) continue;
      let cur = o;
      for (let k = 0; k < 60 && !fits(cur, unit); k++) cur = reroll(o);
      orders.set(code, cur);
    }
    return { unit, orders, layout, layouts: new Map([...orders].map(([code, o]) => [code, layout(o, unit)])) };
  }, [plan, field, openW, cardH]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target instanceof HTMLInputElement && e.target.value)) {
        e.preventDefault();
        // راست‌به‌چپ: چپ = بعدی
        setIdx((i) => Math.min(list.length - 1, Math.max(0, i + (e.key === 'ArrowLeft' ? 1 : -1))));
      } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
        const g = list[cur]; if (g && !g.notBuilt) go(g.items.find((i) => !i.soon)?.route ?? g.firstRoute);
      }
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); if (hover.current) window.clearTimeout(hover.current); };
  }); // هر بار با list/cur تازه

  const g = list[cur];
  return createPortal(
    <div className={s.stage} role="dialog" aria-modal="true" aria-label="همه‌ی ماژول‌ها">
      <header className={s.bar}>
        <div className={s.brand}>
          <span className={s.brandMark}><BrandMark size={26} /></span>
          <span className={s.brandText}>زیرا مارکت</span>
          <span className={s.brandSep} />
          <span className={s.brandSub}>همه‌ی ماژول‌ها</span>
        </div>
        <label className={s.search}>
          <IconSearch size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی ماژول یا صفحه" aria-label="جست‌وجوی ماژول یا صفحه" />
        </label>
        <button type="button" className={s.close} onClick={onClose} aria-label="بستن"><IconX size={18} /></button>
      </header>

      <ul ref={wrap} className={s.accordion} style={{ '--open': `${openW}px`, '--pill': `${pill}px` } as CSSProperties}>
        {list.map((m, i) => {
          const on = i === cur;
          const Icon = m.icon;
          const gi = Math.max(0, groups.findIndex((x) => x.code === m.code));
          const tone = PALETTE[gi % PALETTE.length];
          return (
            <li key={m.code} style={{ '--tone': tone, ...glare[gi] } as CSSProperties} className={`${s.item} ${on ? s.on : ''} ${m.notBuilt ? s.off : ''}`}
              onMouseEnter={() => activate(i)} onMouseLeave={() => { if (hover.current) window.clearTimeout(hover.current); }}>
              <button type="button" className={s.pillBtn} onClick={() => (on ? go(m.items.find((x) => !x.soon)?.route ?? m.firstRoute) : setIdx(i))} onFocus={() => setIdx(i)}
                aria-label={m.name} aria-expanded={on} data-tip={on ? '' : m.name}>
                <span className={s.label}>{m.name}</span>
              </button>
              <div className={s.content} aria-hidden={!on}>
                <div className={s.top}>
                  <h2 className={s.heading}><span className={s.mask}><span className={s.line}>{m.name}</span></span></h2>
                  {m.code === activeCode ? <span className={s.here}>اینجا هستید</span> : null}
                </div>
                <p className={s.lead}><Icon size={18} stroke={1.6} /><span>{m.sub}</span></p>
                <div className={s.field} ref={on ? fieldRef : undefined}>
                  {m.notBuilt ? <p className={s.text}>این ماژول هنوز ساخته نشده است و به‌زودی اضافه می‌شود.</p> : mosaic ? (() => {
                    const leaf = new Map(m.items.map((it) => [it.key, it]));
                    const secOf = new Map(m.sections.flatMap((sec) => sec.items.map((it) => [it.key, sec.title] as const)));
                    const { unit } = mosaic;
                    // در جست‌وجو صفحه‌های پیداشده دوباره از گوشه‌ی پایین‌چپ چیده می‌شوند
                    const tiles = term ? mosaic.layout((mosaic.orders.get(m.code) ?? []).filter((o) => leaf.has(o.key)), unit).tiles : mosaic.layouts.get(m.code)?.tiles ?? [];
                    return tiles.map((tl, n) => {
                      const it = leaf.get(tl.key)!;
                      const PI = iconFor(it.icon);
                      const big = tl.w * tl.h >= 2;
                      const style = { left: tl.x * unit, bottom: tl.y * unit, width: tl.w * unit, height: tl.h * unit, '--n': n } as CSSProperties;
                      const tip = secOf.get(it.key);
                      return it.soon ? (
                        <span key={it.key} className={`${s.pageTile} ${s.tileSoon} ${big ? s.tileBig : ''}`} style={style} aria-disabled="true" data-tip="این صفحه هنوز در سامانه ساخته نشده است">
                          <span className={s.tileIn}><PI size={big ? 24 : 18} stroke={1.6} /><span className={s.tileName}>{it.name}</span><span className={s.soonTag}>به‌زودی</span></span>
                        </span>
                      ) : (
                        <button key={it.key} type="button" className={`${s.pageTile} ${big ? s.tileBig : ''}`} style={style} tabIndex={on ? 0 : -1} onClick={() => go(it.route)} data-tip={tip && m.sections.length > 1 ? tip : undefined}>
                          <span className={s.tileIn}><PI size={big ? 24 : 18} stroke={1.6} /><span className={s.tileName}>{it.name}</span><IconArrowUpLeft size={14} className={s.arrow} /></span>
                        </button>
                      );
                    });
                  })() : null}
                </div>
              </div>
            </li>
          );
        })}
        {list.length === 0 ? <li className={s.none}>موردی پیدا نشد.</li> : null}
      </ul>

      <footer className={s.foot}>
        <span>{g ? (g.notBuilt ? `${g.name} — به‌زودی` : 'یک ماژول را انتخاب کنید · برای بستن Esc') : ''}</span>
        <span className={s.counter} aria-live="polite" dir="ltr">{list.length ? `${pad2(cur + 1)} / ${pad2(list.length)}` : ''}</span>
      </footer>
    </div>,
    document.body,
  );
}
