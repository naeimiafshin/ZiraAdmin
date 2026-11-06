/**
 * قانون نمایش (افشین): همه‌ی عددهای نمایش‌داده‌شده فارسی‌اند (جدول، برچسب، متن بک‌اند، …).
 * یک MutationObserver سراسری رقم‌های لاتین/عربی گره‌های متنی را فارسی می‌کند.
 * فقط نمایش است: داده‌ی ارسالی به بک‌اند با clean/toLatinDigits لاتین می‌شود.
 * استثنا: هر عنصر داخل [data-latin] (و script/style/textarea).
 */
const LATIN = /[0-9٠-٩]/;
const FA = '۰۱۲۳۴۵۶۷۸۹';
const digitsFa = (s: string) => s.replace(/[0-9]/g, (d) => FA[Number(d)]!).replace(/[٠-٩]/g, (d) => FA[d.charCodeAt(0) - 0x0660]!);
/**
 * شناسه‌هایی که داخل متن آزاد (پیام خطا، toast) لاتین می‌مانند (2026-10-31): کد پیگیری UUID و کد سند/موجودیت «حروف-رقم».
 * matches: "17e1b56e-9412-4d18-a328-7588d088eeff"، "SP-000003"، "PI-5042" — rejects: "۱۴۰۵/۰۸/۰۹"، "12 ردیف".
 * tester: https://regex101.com/?regex=%5BA-Za-z%5D%2B-%5B0-9%5D%2B&testString=SP-000003
 */
const KEEP_LATIN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z]+-[0-9]+)/gi;
const toFa = (s: string) => s.split(KEEP_LATIN).map((part, i) => (i % 2 ? part : digitsFa(part))).join('');

function skip(node: Node): boolean {
  const el = node.parentElement;
  return !el || !!el.closest('[data-latin],script,style,textarea,noscript');
}
function fixText(node: Text) {
  const v = node.nodeValue;
  if (v && LATIN.test(v) && !skip(node)) {
    const next = toFa(v);
    if (next !== v) node.nodeValue = next;
  }
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return fixText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) fixText(n as Text);
}

export function startPersianDigits(root: HTMLElement = document.body) {
  walk(root);
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') fixText(m.target as Text);
      else m.addedNodes.forEach(walk);
    }
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true });
  return () => obs.disconnect();
}
