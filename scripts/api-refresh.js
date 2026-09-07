// Re-downloads the OSAMAH API HUB reference libraries from their upstreams
// into reference/api-lists/ and writes reference/api-lists/.meta.json.
// Run: npm run api:refresh
// Requires network. Never deletes the bulk api-mega-list folder on failure —
// it re-fetches category READMEs and updates meta last.
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'reference', 'api-lists');

const MEGA_OWNER = 'cporter202';
const MEGA_REPO = 'API-mega-list';
const MEGA_REF = 'main';

const KEPLOY_URL = 'https://raw.githubusercontent.com/keploy/public-apis-collection/main/README.md';
const PAL_URL = 'https://raw.githubusercontent.com/public-api-lists/public-api-lists/master/README.md';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'osamah-api-refresh', Accept: 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => req.destroy(new Error('timeout')));
  });
}

async function getJson(url) {
  const buf = await get(url);
  return JSON.parse(buf.toString('utf8'));
}

async function download(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const buf = await get(url);
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

async function refreshMegaList(meta) {
  const base = `https://api.github.com/repos/${MEGA_OWNER}/${MEGA_REPO}/contents?ref=${MEGA_REF}`;
  const dirs = (await getJson(base)).filter((e) => e.type === 'dir');
  let ok = 0;
  let bytes = 0;
  const failed = [];
  for (const d of dirs) {
    try {
      const files = await getJson(d.url);
      const readme = files.find((f) => f.name.toLowerCase() === 'readme.md');
      if (!readme) continue;
      const out = path.join(DEST, 'api-mega-list', d.name, 'README.md');
      bytes += await download(readme.download_url, out);
      ok += 1;
    } catch (err) {
      failed.push(`${d.name}: ${err.message}`);
    }
  }
  fs.mkdirSync(path.join(DEST, 'api-mega-list'), { recursive: true });
  meta.mega = { categories: ok, bytes, at: new Date().toISOString(), failed };
  console.log(`api-mega-list: ${ok} categories, ${(bytes / 1024 / 1024).toFixed(1)} MB`, failed.length ? `failed: ${failed.join('; ')}` : '');
}

async function main() {
  fs.mkdirSync(DEST, { recursive: true });
  const metaPath = path.join(DEST, '.meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

  try {
    await refreshMegaList(meta);
  } catch (err) {
    meta.mega = { ...(meta.mega ?? {}), error: err.message };
    console.error('mega-list refresh failed:', err.message);
  }

  for (const [key, url, rel] of [
    ['keploy', KEPLOY_URL, 'keploy/README.md'],
    ['public-api-lists', PAL_URL, 'public-api-lists/README.md'],
  ]) {
    try {
      const bytes = await download(url, path.join(DEST, rel));
      meta[key] = { bytes, at: new Date().toISOString() };
      console.log(`${key}: ${(bytes / 1024).toFixed(1)} KB`);
    } catch (err) {
      meta[key] = { ...(meta[key] ?? {}), error: err.message };
      console.error(`${key} failed:`, err.message);
    }
  }

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log('done → reference/api-lists/.meta.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});