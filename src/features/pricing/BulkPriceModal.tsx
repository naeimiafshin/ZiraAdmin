import { useMemo, useState } from 'react';
import { faNum } from '@/shared/lib/format';
import { toFaDigits, toLatinDigits } from '@/shared/lib/text';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/form';
import { Modal, Segmented, UnitHead } from '@/shared/ui/kit';
import { ROUNDING } from './labels';
import s from '@/features/catalog/catalog.module.css';

/**
 * «تغییر قیمت جمعی» ردیف‌های انتخاب‌شده‌ی یک لیست قیمت پیش‌نویس (افشین 2026-10-24، طرح خام + تکمیل Claude):
 * مبنا (قیمت فعلی کالا | قیمت جدیدِ همین لیست) · روش (درصد | مبلغ ثابت) · جهت (افزایش | کاهش) · مقدار · گرد کردن (مثل قرارداد، نیمه‌به‌بالا).
 * پیش‌نمایش زنده (تعداد، جمع تغییر، نمونه‌ی ردیف‌ها، ردیف‌های ردشده) ⇐ «اعمال» فقط قیمت جدید ردیف‌ها را در فرم عوض می‌کند (ذخیره با «ذخیره ردیف‌ها»).
 * ردیف بی‌قیمت فعلی (با مبنای قیمت فعلی) یا با نتیجه‌ی ≤ ۰ دست نمی‌خورد و گزارش می‌شود.
 */
export type BulkRow = { item_id: string; code: string; name: string; current: number | null; listNew: number };
const STEP: Record<string, number> = { NONE: 1, R1000: 1000, R10000: 10000, R100000: 100000 };
const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const groupFa = (v: string) => (v ? toFaDigits(Number(v).toLocaleString('en')).replace(/,/g, '٬') : '');

export function bulkNewPrice(base: number, mode: 'PERCENT' | 'AMOUNT', dir: 'UP' | 'DOWN', value: number, rounding: string) {
  const sign = dir === 'UP' ? 1 : -1;
  const raw = mode === 'PERCENT' ? base * (1 + (sign * value) / 100) : base + sign * value;
  return roundTo(raw, STEP[rounding] ?? 1);
}

export function BulkPriceModal({ rows, onClose, onApply }: { rows: BulkRow[]; onClose: () => void; onApply: (prices: Record<string, string>) => void }) {
  const [basis, setBasis] = useState<'CURRENT' | 'LIST'>('CURRENT');
  const [mode, setMode] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [dir, setDir] = useState<'UP' | 'DOWN'>('UP');
  const [val, setVal] = useState('');
  const [rounding, setRounding] = useState('R1000');
  const value = Number(val) || 0;
  const invalid = !value ? 'مقدار را وارد کنید.' : mode === 'PERCENT' && dir === 'DOWN' && value >= 100 ? 'کاهش درصدی باید کمتر از ۱۰۰٪ باشد.' : mode === 'PERCENT' && value > 999.99 ? 'حداکثر ۹۹۹٫۹۹٪.' : null;
  const res = useMemo(() => {
    const ok: { r: BulkRow; base: number; nv: number }[] = []; const noBase: BulkRow[] = []; const nonPos: BulkRow[] = [];
    if (!value) return { ok, noBase, nonPos };
    for (const r of rows) {
      const base = basis === 'CURRENT' ? r.current : r.listNew;
      if (!base) { noBase.push(r); continue; }
      const nv = bulkNewPrice(base, mode, dir, value, rounding);
      if (nv <= 0) nonPos.push(r); else ok.push({ r, base, nv });
    }
    return { ok, noBase, nonPos };
  }, [rows, basis, mode, dir, value, rounding]);
  const delta = res.ok.reduce((a, x) => a + (x.nv - x.r.listNew), 0);
  const apply = () => { if (invalid || !res.ok.length) return; onApply(Object.fromEntries(res.ok.map((x) => [x.r.item_id, String(x.nv)]))); };
  const desc = value ? `${dir === 'UP' ? 'افزایش' : 'کاهش'} ${mode === 'PERCENT' ? `${toFaDigits(val)}٪` : `${groupFa(String(value))} ریال`} روی ${basis === 'CURRENT' ? 'قیمت فعلی کالا' : 'قیمت جدید لیست'}` : '';
  return (
    <Modal open onClose={onClose} title={`تغییر قیمت جمعی — ${faNum(rows.length)} ردیف`} width={720}
      footer={<><Button variant="secondary" onClick={onClose}>انصراف</Button><Button onClick={apply} disabled={!!invalid || !res.ok.length} data-bulk-apply>اعمال روی {faNum(res.ok.length)} ردیف</Button></>}>
      <div data-bulk>
        <div className={s.filterRow} style={{ gridTemplateColumns: '1fr 1fr', margin: '0 0 12px' }}>
          <Field label="مبنای محاسبه"><Segmented value={basis} onChange={setBasis} options={[{ value: 'CURRENT', label: 'قیمت فعلی کالا' }, { value: 'LIST', label: 'قیمت جدید همین لیست' }]} /></Field>
          <Field label="روش تغییر"><Segmented value={mode} onChange={(v) => { setMode(v); setVal(''); }} options={[{ value: 'PERCENT', label: 'درصدی (٪)' }, { value: 'AMOUNT', label: 'مبلغ ثابت (ریال)' }]} /></Field>
        </div>
        <div className={s.filterRow} style={{ gridTemplateColumns: '1fr 1fr 1fr', margin: '0 0 12px', alignItems: 'start' }}>
          <Field label="جهت"><Segmented value={dir} onChange={setDir} options={[{ value: 'UP', label: 'افزایش' }, { value: 'DOWN', label: 'کاهش' }]} /></Field>
          <Input label={mode === 'PERCENT' ? 'مقدار (٪)' : 'مبلغ (ریال)'} required dir="ltr" inputMode="decimal" aria-label="مقدار تغییر" placeholder="۰"
            value={mode === 'PERCENT' ? toFaDigits(val) : groupFa(val)}
            onChange={(e) => { const v = toLatinDigits(e.target.value); setVal(mode === 'PERCENT' ? v.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d{0,2}).*$/, '$1') : v.replace(/[^0-9]/g, '')); }} />
          <Select label="گرد کردن نتیجه" value={rounding} onChange={(e) => setRounding(e.target.value)} options={Object.keys(STEP).map((k) => ({ value: k, label: ROUNDING[k] ?? k }))} />
        </div>
        {invalid && val ? <div className={s.formErr}><Alert>{invalid}</Alert></div> : null}
        {value && !invalid ? (
          <>
            <div className={s.expandGrid} data-bulk-summary>
              <div className={s.kv}><span>تغییر</span><b>{desc}</b></div>
              <div className={s.kv}><span>ردیف‌های تغییرکننده</span><b className="tnum">{faNum(res.ok.length)} از {faNum(rows.length)}</b></div>
              <div className={s.kv}><span>جمع تغییر نسبت به لیست</span><b className="tnum" style={{ color: delta < 0 ? 'var(--danger)' : 'var(--success)' }}><bdi dir="ltr">{delta > 0 ? '+' : delta < 0 ? '−' : ''}{faNum(Math.abs(delta))}</bdi><span className={s.rial}>ریال</span></b></div>
              <div className={s.kv}><span>گرد کردن</span><b>{ROUNDING[rounding]}</b></div>
            </div>
            <div className={`${s.compBox} ${s.compCenter}`} style={{ maxHeight: 240, overflow: 'auto' }}>
              <table><thead><tr><th>کد</th><th>نام کالا</th><th><UnitHead>مبنا</UnitHead></th><th><UnitHead>قیمت جدید</UnitHead></th><th><UnitHead>تغییر</UnitHead></th></tr></thead>
                <tbody>{res.ok.slice(0, 30).map((x) => { const d = x.nv - x.base; return (
                  <tr key={x.r.item_id}><td className={s.muted} data-latin>{x.r.code}</td><td><span className={s.famName} style={{ maxWidth: 220 }} data-tip={x.r.name}>{x.r.name}</span></td><td className="tnum">{faNum(x.base)}</td><td className="tnum"><b data-bulk-new>{faNum(x.nv)}</b></td><td className="tnum" style={{ color: d < 0 ? 'var(--danger)' : 'var(--success)' }}><bdi dir="ltr">{d > 0 ? '+' : d < 0 ? '−' : ''}{faNum(Math.abs(d))}</bdi></td></tr>
                ); })}</tbody></table>
            </div>
            {res.ok.length > 30 ? <p className={s.sub}>نمونه‌ی ۳۰ ردیف اول؛ همه‌ی {faNum(res.ok.length)} ردیف تغییر می‌کنند.</p> : null}
            {res.noBase.length ? <p className={s.warnText}>{faNum(res.noBase.length)} ردیف قیمت فعلی ندارد و دست نمی‌خورد: <span data-latin>{res.noBase.slice(0, 8).map((r) => r.code).join('، ')}</span>{res.noBase.length > 8 ? '…' : ''}</p> : null}
            {res.nonPos.length ? <p className={s.warnText}>{faNum(res.nonPos.length)} ردیف با این تغییر به صفر یا کمتر می‌رسد و دست نمی‌خورد.</p> : null}
          </>
        ) : <p className={s.sub}>روش و مقدار را انتخاب کنید تا پیش‌نمایش قیمت‌های جدید نمایش داده شود.</p>}
        <p className={s.sub} style={{ marginTop: 8 }}>«اعمال» فقط قیمت جدید ردیف‌ها را در این صفحه عوض می‌کند؛ با «ذخیره ردیف‌ها» در لیست ثبت و با انتشار لیست روی قیمت کالاها اعمال می‌شود.</p>
      </div>
    </Modal>
  );
}
