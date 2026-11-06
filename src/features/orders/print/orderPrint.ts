import { faDate, faNum } from '@/shared/lib/format';
import { groupMoney } from '@/shared/lib/money';
import { numberToWordsFa } from '@/shared/lib/numberWords';
import type { OrdersPrintOut } from '../api/types';
import { DELIVERY_TYPE, ORDER_STATUS, SETTLEMENT_TYPE } from '../ordersLabels';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const SHEET_CSS = `
*{box-sizing:border-box}body{margin:0;padding:0;background:#fff;color:#23232d;font-family:var(--font-body,sans-serif);direction:rtl}
.paper{position:relative;background:#fff;overflow:hidden}
.stripe{height:7px;background:linear-gradient(90deg,#D74E54,#DF6F73 60%,#E8AEB1);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ph{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:20px;padding:24px 32px 20px;border-bottom:2px solid #23232d}
.brand{display:flex;align-items:center;gap:12px}.logo{width:52px;height:52px;border-radius:14px;background:linear-gradient(150deg,#DF6F73,#D74E54);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.co{font-size:17px;font-weight:800}.tag{font-size:11.5px;color:#777;margin-top:3px}
.ct{text-align:center}.ct .t{font-size:20px;font-weight:800;letter-spacing:-.2px}.ct .s{font-size:11.5px;color:#999;margin-top:4px}
.meta{justify-self:end;border:1px solid #E9E4E5;border-radius:10px;overflow:hidden;min-width:250px;font-size:12px}
.meta div{display:flex;justify-content:space-between;gap:14px;padding:7px 12px;border-bottom:1px solid #F1EDEE}.meta div:last-child{border-bottom:0}
.meta span{color:#999}.meta b{font-weight:700}.meta .no{font-weight:800;color:#D74E54}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px 32px 4px}
.party{border:1px solid #E9E4E5;border-radius:10px;overflow:hidden}
.party h3{margin:0;background:#FBF5F5;padding:9px 14px;border-bottom:1px solid #F1E6E7;font-size:12.5px;font-weight:800;color:#B93C42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.party .g{display:grid;grid-template-columns:1fr 1fr;gap:9px 16px;padding:12px 14px}
.r{display:flex;gap:6px;font-size:12px;line-height:1.7}.r span{color:#999;white-space:nowrap}.r b{font-weight:700}.wide{grid-column:1/-1}
.sec{padding:18px 32px 4px}.sec .h{font-size:12.5px;font-weight:800;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:11px;border:1px solid #DCD4D5}
th{background:#F6F1F2;padding:8px 6px;font-weight:800;color:#5a5a64;border:1px solid #E9E4E5;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
td{padding:8px 6px;border:1px solid #E9E4E5;text-align:center}.code{color:#777}.disc{color:#C8841A}
td small{display:block;font-size:10px;color:#aaa;margin-top:2px}tfoot td{background:#FBF5F5;font-weight:800;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bot{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 32px}
.box{border:1px solid #E9E4E5;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.words{font-size:12px;line-height:1.9}.words span{color:#999}
.info{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:12px;border-top:1px dashed #E9E4E5;padding-top:10px}.info span{color:#999}
.signs{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:18px 32px 28px}
.sign{border:1px dashed #E9E4E5;border-radius:10px;padding:14px;min-height:96px;display:flex;flex-direction:column;justify-content:space-between;font-size:11.5px;color:#777}
@media print{@page{size:A4 portrait;margin:0}body{background:#fff}.paper{box-shadow:none}}
`;

export function printOrder(data: OrdersPrintOut) {
  const o = data.order;
  const co = (data.company as Record<string, string>) || {};
  const cu = (data.customer_card as Record<string, string>) || {};

  const linesHtml = (o.lines || [])
    .map(
      (ln, i) => `
    <tr>
      <td>${faNum(i + 1)}</td>
      <td class="code">${esc(ln.item_code || '—')}</td>
      <td><b>${esc(ln.item_name || '—')}</b></td>
      <td>${esc(ln.unit_name || 'عدد')}</td>
      <td><b>${faNum(ln.quantity)}</b></td>
      <td>${groupMoney(ln.unit_price)}</td>
      <td class="disc">${groupMoney(ln.line_discount)}</td>
      <td>${groupMoney(ln.tax_amount)}</td>
      <td><b>${groupMoney(ln.line_total)}</b></td>
    </tr>`
    )
    .join('');

  const settleInfo = (o.settlement_parts || [])
    .map((p) => `${esc(p.method_display)}: ${groupMoney(p.amount)} ریال ${p.due_date ? `(سررسید: ${faDate(p.due_date)})` : ''}`)
    .join(' · ');

  const totalWords = numberToWordsFa(Number(o.total_amount) || 0);

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>سفارش فروش ${esc(o.order_number)}</title>
  <style>${SHEET_CSS}</style>
</head>
<body>
  <div class="paper">
    <div class="stripe"></div>
    <div class="ph">
      <div class="brand">
        <div class="logo">ZM</div>
        <div>
          <div class="co">${esc(co.trade_name || co.legal_name || 'زیرا مارکت')}</div>
          <div class="tag">سامانه فروش عمده و بازرگانی</div>
        </div>
      </div>
      <div class="ct">
        <div class="t">برگ سفارش فروش کالا</div>
        <div class="s">${esc(ORDER_STATUS[o.status]?.label || o.status_display)}</div>
      </div>
      <div class="meta">
        <div><span>شماره سفارش:</span><b class="no">${esc(o.order_number)}</b></div>
        <div><span>تاریخ ثبت:</span><b>${faDate(o.order_date)}</b></div>
        ${o.invoice_number ? `<div><span>شماره فاکتور:</span><b>${esc(o.invoice_number)}</b></div>` : ''}
        <div><span>شعبه صادرکننده:</span><b>${esc(o.branch?.name || '—')}</b></div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>مشخصات فروشنده</h3>
        <div class="g">
          <div class="r"><span>نام شخص حقوقی:</span><b>${esc(co.legal_name || 'زیرا مارکت')}</b></div>
          <div class="r"><span>شناسه ملی:</span><b>${esc(co.national_id || '—')}</b></div>
          <div class="r"><span>کد اقتصادی:</span><b>${esc(co.economic_code || '—')}</b></div>
          <div class="r"><span>تلفن:</span><b>${esc(co.phone || '—')}</b></div>
          <div class="r wide"><span>نشانی:</span><b>${esc(co.address || '—')}</b></div>
        </div>
      </div>
      <div class="party">
        <h3>مشخصات خریدار</h3>
        <div class="g">
          <div class="r"><span>نام / فروشگاه:</span><b>${esc(o.customer?.store_name || o.customer?.full_name || '—')}</b></div>
          <div class="r"><span>کد مشتری:</span><b>${esc(o.customer?.code || '—')}</b></div>
          <div class="r"><span>تلفن همراه:</span><b>${esc(o.customer?.mobile || cu.mobile || '—')}</b></div>
          <div class="r"><span>کد ملی / شناسه:</span><b>${esc(cu.national_id || cu.national_code || '—')}</b></div>
          <div class="r wide"><span>نشانی تحویل:</span><b>${esc(o.delivery_address || cu.address || '—')}</b></div>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="h">اقلام سفارش</div>
      <table>
        <thead>
          <tr>
            <th style="width:40px">ردیف</th>
            <th style="width:100px">کد کالا</th>
            <th>شرح کالا</th>
            <th style="width:70px">واحد</th>
            <th style="width:60px">تعداد</th>
            <th style="width:110px">مبلغ واحد (ریال)</th>
            <th style="width:100px">تخفیف (ریال)</th>
            <th style="width:100px">مالیات (ریال)</th>
            <th style="width:120px">مبلغ کل (ریال)</th>
          </tr>
        </thead>
        <tbody>${linesHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">جمع کل اقلام</td>
            <td>${faNum(o.line_count)} قلم</td>
            <td>—</td>
            <td class="disc">${groupMoney(o.total_discount)}</td>
            <td>${groupMoney(o.tax_amount)}</td>
            <td>${groupMoney(o.total_amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="bot">
      <div class="box">
        <div class="words"><span>مبلغ قابل پرداخت به حروف:</span> <b>${esc(totalWords)} ریال</b></div>
        <div class="info">
          <div><span>روش تسویه:</span> <b>${esc(SETTLEMENT_TYPE[o.settlement_type]?.label || o.settlement_type_display)}</b></div>
          <div><span>نحوه تحویل:</span> <b>${esc(DELIVERY_TYPE[o.delivery_type] || o.delivery_type_display)}</b></div>
          <div style="grid-column:1/-1"><span>جزئیات پرداخت:</span> <b>${esc(settleInfo || '—')}</b></div>
        </div>
        ${o.note ? `<div class="note"><span>توضیحات:</span> ${esc(o.note)}</div>` : ''}
      </div>
      <div class="box">
        <div style="display:flex;justify-content:space-between"><span>جمع ناخالص:</span><b>${groupMoney(o.subtotal)} ریال</b></div>
        <div style="display:flex;justify-content:space-between"><span>تخفیف:</span><b style="color:#C8841A">−${groupMoney(o.total_discount)} ریال</b></div>
        ${Number(o.cash_discount_amount) > 0 ? `<div style="display:flex;justify-content:space-between"><span>تخفیف نقدی:</span><b style="color:#1F8A5B">−${groupMoney(o.cash_discount_amount)} ریال</b></div>` : ''}
        <div style="display:flex;justify-content:space-between"><span>مالیات و عوارض ارزش افزوده:</span><b>${groupMoney(o.tax_amount)} ریال</b></div>
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;color:#D74E54;border-top:1px dashed #E9E4E5;padding-top:8px">
          <span>مبلغ قابل پرداخت:</span><b>${groupMoney(o.total_amount)} ریال</b>
        </div>
        ${Number(o.prepaid_amount) > 0 ? `<div style="display:flex;justify-content:space-between"><span>بیعانه پرداختی:</span><b>${groupMoney(o.prepaid_amount)} ریال</b></div>` : ''}
        ${Number(o.remaining_amount) > 0 ? `<div style="display:flex;justify-content:space-between;color:#2A6FDB"><span>مانده حساب:</span><b>${groupMoney(o.remaining_amount)} ریال</b></div>` : ''}
      </div>
    </div>

    <div class="signs">
      <div class="sign"><span>امضا و تأیید خریدار:</span></div>
      <div class="sign"><span>مهر و امضای فروشنده:</span></div>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      window.print();
    });
  </script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}
