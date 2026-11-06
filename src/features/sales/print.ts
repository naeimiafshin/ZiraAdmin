import { faDate, faDateTime, faNum } from '@/shared/lib/format';
import { numberToWordsFa } from '@/shared/lib/numberWords';
import { money, qty, type ItemTraits, type SalesCompany, type SalesCustomer } from './api/common';
import type { Invoice, InvoicePrint } from './api/invoices';
import { lineMeta } from './lines';

/**
 * برگه‌های چاپی فروش: داده از `…/print` بک‌اند (که رخداد چاپ را هم ثبت می‌کند)، قالب در فرانت (راهنمای API).
 * قالب همان برگه‌ی html «INVOICE SHEET MODAL» است (همان سربرگ، مهر وضعیت، دو بلوک طرفین، جدول خط‌کشی‌شده، جمع‌ها، جای مهر و امضا و
 * دو جمله‌ی پایین برگه؛ تصمیم افشین ۱۴ آبان ۱۴۰۵: جمله‌های ثابت html بیاید). مهلت مرجوعی از تنظیمات «سیاست فروش و پرداخت» است.
 * پنجره‌ی تازه با HTML کامل و `window.print()`؛ فونت پنل با کپی استایل‌های همین صفحه می‌رسد. همه‌ی مقدارها escape می‌شوند.
 */
// HTML-special characters to escape: matches "<" in "<b>", leaves "abc" untouched. https://regex101.com/?regex=%5B%26%3C%3E%22%27%5D&testString=%3Cb%3E
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const DASH = '—';

/** جمله‌ی مرجوعی پایین برگه (html: «کالای فروخته‌شده تا ۷ روز…»)؛ عدد از تنظیمات، صفر یعنی بی‌مهلت */
export function returnSentence(days: number | null) {
  if (days === null) return 'کالای فروخته‌شده در مهلت مرجوعی با فاکتور و بسته‌بندی سالم قابل مرجوع است.';
  if (days === 0) return 'کالای فروخته‌شده با فاکتور و بسته‌بندی سالم قابل مرجوع است.';
  return `کالای فروخته‌شده تا ${faNum(days)} روز با فاکتور و بسته‌بندی سالم قابل مرجوع است.`;
}

const SHEET_CSS = `
*{box-sizing:border-box}body{margin:0;padding:0;background:#fff;color:#23232d;font-family:var(--font-body,sans-serif)}
.paper{position:relative;background:#fff;overflow:hidden}
.stripe{height:7px;background:linear-gradient(90deg,#D74E54,#DF6F73 60%,#E8AEB1);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ph{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:20px;padding:24px 32px 20px;border-bottom:2px solid #23232d}
.brand{display:flex;align-items:center;gap:12px}.logo{width:52px;height:52px;border-radius:14px;background:linear-gradient(150deg,#DF6F73,#D74E54);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.co{font-size:17px;font-weight:800}.tag{font-size:11.5px;color:#777;margin-top:3px}
.ct{text-align:center}.ct .t{font-size:20px;font-weight:800;letter-spacing:-.2px}.ct .s{font-size:11.5px;color:#999;margin-top:4px}
.meta{justify-self:end;border:1px solid #E9E4E5;border-radius:10px;overflow:hidden;min-width:250px;font-size:12px}
.meta div{display:flex;justify-content:space-between;gap:14px;padding:7px 12px;border-bottom:1px solid #F1EDEE}.meta div:last-child{border-bottom:0}
.meta span{color:#999}.meta b{font-weight:700}.meta .no{font-weight:800;color:#D74E54}
.stamp{position:absolute;top:150px;left:300px;transform:rotate(-11deg);border:3px double currentColor;border-radius:10px;padding:6px 18px;font-size:19px;font-weight:800;opacity:.78;background:rgba(255,255,255,.6)}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px 32px 4px}
.party{border:1px solid #E9E4E5;border-radius:10px;overflow:hidden}
.party h3{margin:0;background:#FBF5F5;padding:9px 14px;border-bottom:1px solid #F1E6E7;font-size:12.5px;font-weight:800;color:#B93C42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.party .g{display:grid;grid-template-columns:1fr 1fr;gap:9px 16px;padding:12px 14px}
.r{display:flex;gap:6px;font-size:12px;line-height:1.7}.r span{color:#999;white-space:nowrap}.r b{font-weight:700}.wide{grid-column:1/-1}
.sec{padding:18px 32px 4px}.sec .h{font-size:12.5px;font-weight:800;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:11px;border:1px solid #DCD4D5}
th{background:#F6F1F2;padding:8px 6px;font-weight:800;color:#5a5a64;border:1px solid #E9E4E5;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
td{padding:8px 6px;border:1px solid #E9E4E5;text-align:center}.n{text-align:center}.c{text-align:center}.code{color:#777}.disc{color:#C8841A}
td small{display:block;font-size:10px;color:#aaa;margin-top:2px}tfoot td{background:#FBF5F5;font-weight:800;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bot{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 32px}
.box{border:1px solid #E9E4E5;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.words{font-size:12px;line-height:1.9}.words span{color:#999}
.info{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:12px;border-top:1px dashed #E9E4E5;padding-top:10px}.info span{color:#999}
.note{font-size:12px;line-height:1.8;color:#5a5a64;background:#FBFAFB;border-radius:8px;padding:9px 12px}.note span{color:#999}
.tots{border:1px solid #E9E4E5;border-radius:10px;overflow:hidden;font-size:12.5px}
.tots div{display:flex;justify-content:space-between;padding:9px 16px;border-bottom:1px solid #F1EDEE}.tots span{color:#777}
.tots .g{background:#23232d;color:#fff;padding:12px 16px;border-bottom:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tots .g span{color:#fff;font-weight:700}.tots .g b{font-size:18px;font-weight:800}
.signs{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 32px 18px}.sign{border:1px dashed #d6cdce;border-radius:10px;height:92px;padding:10px 14px;font-size:11.5px;color:#999}
.pf{display:flex;justify-content:space-between;gap:12px;padding:10px 32px;background:#FBFAFB;border-top:1px solid #F1EDEE;font-size:10.5px;color:#aaa}
.printed{padding:6px 32px 0;font-size:10px;color:#aaa}
@page{size:A4 landscape;margin:8mm}`;

function openSheet(title: string, body: string) {
  const win = window.open('', '_blank', 'width=1220,height=900');
  if (!win) throw new Error('پنجره‌ی چاپ باز نشد؛ اجازه‌ی پنجره‌ی بازشو را بدهید.');
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('');
  win.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${esc(title)}</title>${styles}<style>${SHEET_CSS}</style></head>
<body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  win.document.close();
}

const row = (k: string, v: unknown, wide = false, latin = false) => `<div class="r${wide ? ' wide' : ''}"><span>${esc(k)}:</span><b${latin ? ' dir="ltr"' : ''}>${esc(v || DASH)}</b></div>`;

const sellerBlock = (x: SalesCompany) => `<div class="party"><h3>مشخصات فروشنده</h3><div class="g">
${row('نام', [x.name, x.branch_name].filter(Boolean).join(' — '), true)}${row('کد اقتصادی', x.economic_code, false, true)}${row('شناسه ملی', x.national_id, false, true)}
${row('تلفن', x.branch_phone, false, true)}${row('کد پستی', x.branch_postal_code, false, true)}${row('نشانی', x.branch_address || x.address, true)}</div></div>`;

const buyerBlock = (c?: SalesCustomer | null) => `<div class="party"><h3>مشخصات خریدار (طرف حساب)</h3><div class="g">
${row('نام مشتری', c?.store_name || c?.full_name, true)}${row('کد مشتری', c?.code, false, true)}${row('کد اقتصادی', c?.economic_code, false, true)}
${row('شناسه ملی', c?.national_id, false, true)}${row('تلفن', c?.phone || c?.mobile, false, true)}${row('کد پستی', c?.postal_code, false, true)}
${row('نشانی', [c?.province, c?.city, c?.address].filter(Boolean).join('، '), true)}</div></div>`;

/** متن و رنگ مهر وضعیت (همان رنگ‌های قرص وضعیت html) */
function stampOf(inv: Pick<Invoice, 'status' | 'settlement_status'>) {
  if (inv.status === 'DRAFT') return { t: 'پیش‌نویس', c: '#C8841A' };
  if (inv.status === 'VOIDED') return { t: 'ابطال شده', c: '#D74E54' };
  const m: Record<Invoice['settlement_status'], { t: string; c: string }> = {
    UNSETTLED: { t: 'در انتظار', c: '#C8841A' }, PARTIAL: { t: 'تسویه جزئی', c: '#2A6FDB' }, SETTLED: { t: 'تسویه شد', c: '#1F8A5B' },
  };
  return m[inv.settlement_status];
}

/** «صورتحساب فروش کالا» — همان برگه‌ی مودال مشاهده */
export function printInvoice(d: InvoicePrint, returnDays: number | null, traits: Map<string, ItemTraits> = new Map()) {
  const inv = d.invoice;
  const st = stampOf(inv);
  const rows = (inv.lines ?? []).map((l) => `<tr><td class="c">${faNum(l.row_no)}</td><td class="code" dir="ltr">${esc(l.item?.code)}</td>
<td><b>${esc(l.item?.display_name)}</b><small>${esc(lineMeta(l.item, traits.get(l.item?.id ?? '')))}</small></td><td class="c"><b>${faNum(qty(l.quantity))}</b></td><td>${esc(l.item?.unit_name)}</td>
<td class="n">${money(l.unit_price)}</td><td class="n">${money(l.unit_discount)}</td><td class="n disc">${money(l.line_discount)}</td><td class="n">${money(l.unit_tax_duty)}</td>
<td class="n">${money(l.line_tax_duty)}</td><td class="n"><b>${money(l.line_total)}</b></td><td class="code" dir="ltr">${esc(l.warehouse?.code)}</td><td>${esc(l.warehouse?.name)}</td></tr>`).join('');
  const wh = inv.delivery_warehouse ? `${inv.delivery_warehouse.name} (${inv.delivery_warehouse.code})` : DASH;
  const body = `<div class="paper"><div class="stripe"></div>
<div class="ph"><div class="brand"><div class="logo">ز</div><div><div class="co">${esc(d.seller.name || 'زیرا مارکت')}</div><div class="tag">${esc(d.seller.branch_name)}</div></div></div>
<div class="ct"><div class="t">صورتحساب فروش کالا</div><div class="s">فاکتور فروش عمده · مبالغ به ریال</div></div>
<div class="meta"><div><span>شماره فاکتور</span><b class="no" dir="ltr">${esc(inv.invoice_number || 'پیش‌نویس')}</b></div><div><span>تاریخ صدور</span><b>${esc(faDate(inv.date))}</b></div>
<div><span>نوع تحویل</span><b>${esc(inv.delivery_type_display)}</b></div><div><span>انبار</span><b>${esc(wh)}</b></div></div></div>
<div class="stamp" style="color:${st.c}">${esc(st.t)}</div>
<div class="parties">${sellerBlock(d.seller)}${buyerBlock(inv.customer)}</div>
<div class="sec"><div class="h">مشخصات کالا</div><table><thead><tr><th>ردیف</th><th>کد محصول</th><th>نام محصول</th><th>تعداد</th><th>واحد فروش</th><th>فی واحد</th>
<th>تخفیف واحد</th><th>تخفیف کل</th><th>مالیات و عوارض واحد</th><th>مالیات و عوارض کل</th><th>مبلغ کل</th><th>کد انبار</th><th>نام انبار</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">جمع کل</td><td class="c">${faNum(qty(d.total_quantity))}</td><td colspan="3"></td><td class="n disc">${money(inv.total_discount)}</td><td></td>
<td class="n">${money(inv.total_tax_duty)}</td><td class="n" style="color:#D74E54">${money(inv.total_amount)}</td><td colspan="2"></td></tr></tfoot></table></div>
<div class="bot"><div class="box"><div class="words"><span>مبلغ قابل پرداخت به حروف: </span><b>${esc(numberToWordsFa(inv.total_amount))} ریال</b></div>
<div class="info"><div><span>نحوه تسویه: </span><b>${esc(inv.settlement_method_display)}</b></div><div><span>وضعیت تسویه: </span><b style="color:${st.c}">${esc(st.t)}</b></div>
<div><span>صادرکننده: </span><b>${esc(inv.issuer?.full_name || DASH)}</b></div><div><span>تعداد اقلام: </span><b>${faNum(inv.lines?.length ?? inv.line_count)} قلم / ${faNum(qty(d.total_quantity))} واحد</b></div></div>
<div class="note"><span>توضیحات: </span>${esc(inv.note || DASH)}</div></div>
<div class="tots"><div><span>مجموع اولیه</span><b>${money(inv.subtotal)}</b></div><div><span>تخفیف کل</span><b class="disc">${money(inv.total_discount)}</b></div>
<div><span>مالیات و عوارض کل</span><b>${money(inv.total_tax_duty)}</b></div><div class="g"><span>مبلغ قابل پرداخت</span><b>${money(inv.total_amount)}</b></div></div></div>
<div class="signs"><div class="sign">مهر و امضای فروشنده</div><div class="sign">مهر و امضای خریدار</div></div>
<div class="pf"><span>این صورتحساب توسط سامانه فروش زیرا مارکت صادر شده است.</span><span>${esc(returnSentence(returnDays))}</span></div>
<div class="printed">زمان چاپ: ${esc(faDateTime(d.printed_at))}</div></div>`;
  openSheet(`فاکتور فروش ${inv.invoice_number ?? ''}`, body);
}
