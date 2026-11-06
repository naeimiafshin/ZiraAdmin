// قرارداد API را از بک‌اند در حال اجرا می‌گیرد و در api-schema/ ذخیره می‌کند.
// اجرا: npm run api:sync  (بک‌اند باید روی VITE_API_PROXY_TARGET بالا باشد)
import { writeFile } from 'node:fs/promises';

const target = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000';
for (const panel of ['admin', 'public']) {
  const url = `${target}/api/v1/${panel}/openapi.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  await writeFile(`api-schema/${panel}.openapi.json`, JSON.stringify(await res.json(), null, 1));
  console.log(`✓ ${panel}: ${url}`);
}
