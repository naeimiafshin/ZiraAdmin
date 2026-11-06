import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// توابع نرمال‌سازی و ساخت آدرس
const DEFAULT_API_BASE = 'https://api.ziramarket.ir/api/v1';

function normalizeApiBase(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return DEFAULT_API_BASE;
  const trimmed = rawUrl.trim();
  if (!trimmed) return DEFAULT_API_BASE;
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  try {
    const parsed = new URL(withoutTrailing);
    if (!['http:', 'https:'].includes(parsed.protocol)) return DEFAULT_API_BASE;
    return withoutTrailing;
  } catch {
    return DEFAULT_API_BASE;
  }
}

function buildUrl(panel, path, query, base = DEFAULT_API_BASE) {
  const url = `${base}/${panel}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null || v === '') continue;
      params.append(key, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function resolveMediaUrl(url, mediaBase) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^(?:https?:|\/\/|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const envMedia = mediaBase?.trim();

  if (envMedia) {
    return `${envMedia.replace(/\/+$/, '')}${cleanPath}`;
  }

  return cleanPath;
}

describe('API Base URL Normalization', () => {
  test('returns default API base for undefined, null, or whitespace', () => {
    assert.equal(normalizeApiBase(undefined), DEFAULT_API_BASE);
    assert.equal(normalizeApiBase(null), DEFAULT_API_BASE);
    assert.equal(normalizeApiBase(''), DEFAULT_API_BASE);
    assert.equal(normalizeApiBase('   '), DEFAULT_API_BASE);
  });

  test('removes trailing slashes from base URL', () => {
    assert.equal(normalizeApiBase('https://api.ziramarket.ir/api/v1/'), 'https://api.ziramarket.ir/api/v1');
    assert.equal(normalizeApiBase('https://api.ziramarket.ir/api/v1///'), 'https://api.ziramarket.ir/api/v1');
  });

  test('preserves valid custom base URL', () => {
    assert.equal(normalizeApiBase('https://staging.ziramarket.ir/api/v1/'), 'https://staging.ziramarket.ir/api/v1');
    assert.equal(normalizeApiBase('http://127.0.0.1:8000/api/v1'), 'http://127.0.0.1:8000/api/v1');
  });

  test('falls back to default for invalid protocols or garbage strings', () => {
    assert.equal(normalizeApiBase('ftp://invalid.com/api/v1'), DEFAULT_API_BASE);
    assert.equal(normalizeApiBase('not-a-valid-url'), DEFAULT_API_BASE);
  });
});

describe('API URL Construction', () => {
  test('constructs admin endpoint correctly with and without leading slash', () => {
    assert.equal(buildUrl('admin', 'catalog/brands'), 'https://api.ziramarket.ir/api/v1/admin/catalog/brands');
    assert.equal(buildUrl('admin', '/catalog/brands'), 'https://api.ziramarket.ir/api/v1/admin/catalog/brands');
  });

  test('constructs public endpoint correctly', () => {
    assert.equal(buildUrl('public', 'auth/staff/login'), 'https://api.ziramarket.ir/api/v1/public/auth/staff/login');
  });

  test('constructs customer endpoint correctly', () => {
    assert.equal(buildUrl('customer', 'profile'), 'https://api.ziramarket.ir/api/v1/customer/profile');
  });

  test('never duplicates /api/v1', () => {
    const url = buildUrl('admin', 'auth/me');
    const occurrences = (url.match(/\/api\/v1/g) || []).length;
    assert.equal(occurrences, 1);
  });

  test('encodes query parameters and ignores empty values', () => {
    const url = buildUrl('admin', 'catalog/items', {
      page: 1,
      page_size: 20,
      search: 'تست',
      empty: '',
      skipped: null,
      missing: undefined,
      tags: ['a', 'b'],
    });
    assert.equal(
      url,
      'https://api.ziramarket.ir/api/v1/admin/catalog/items?page=1&page_size=20&search=%D8%AA%D8%B3%D8%AA&tags=a&tags=b',
    );
  });
});

describe('Media URL Resolution', () => {
  test('returns null for empty input', () => {
    assert.equal(resolveMediaUrl(null), null);
    assert.equal(resolveMediaUrl(undefined), null);
    assert.equal(resolveMediaUrl(''), null);
    assert.equal(resolveMediaUrl('   '), null);
  });

  test('preserves absolute URLs, blob URLs and data URLs', () => {
    assert.equal(resolveMediaUrl('https://cdn.example.com/photo.jpg'), 'https://cdn.example.com/photo.jpg');
    assert.equal(resolveMediaUrl('http://cdn.example.com/photo.jpg'), 'http://cdn.example.com/photo.jpg');
    assert.equal(resolveMediaUrl('blob:http://localhost:5173/uuid-test'), 'blob:http://localhost:5173/uuid-test');
    assert.equal(resolveMediaUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  });

  test('keeps relative media path for local Vite dev server when mediaBase is empty', () => {
    assert.equal(resolveMediaUrl('/media/catalog/items/2026/10/7.jpg'), '/media/catalog/items/2026/10/7.jpg');
    assert.equal(resolveMediaUrl('media/catalog/brands/logo.png'), '/media/catalog/brands/logo.png');
  });

  test('prepends mediaBase when configured', () => {
    assert.equal(
      resolveMediaUrl('/media/catalog/items/2026/10/7.jpg', 'https://api.ziramarket.ir'),
      'https://api.ziramarket.ir/media/catalog/items/2026/10/7.jpg',
    );
    assert.equal(
      resolveMediaUrl('/media/catalog/items/2026/10/7.jpg', 'https://api.ziramarket.ir/'),
      'https://api.ziramarket.ir/media/catalog/items/2026/10/7.jpg',
    );
  });
});
