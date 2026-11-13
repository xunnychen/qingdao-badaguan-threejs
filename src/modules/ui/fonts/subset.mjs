// Noto Serif TC subset for the UI (SIL OFL 1.1, see OFL.txt). The three woff2 files beside this script hold ONLY the
// characters the UI can show, so new copy (a POI text, a preset label, a button) may fall outside them and silently
// render in the fallback face.
//
//   node src/modules/ui/fonts/subset.mjs            check: exit 1 and list the characters missing from charset.txt
//   node src/modules/ui/fonts/subset.mjs --write    rewrite charset.txt (then rebuild the fonts, below)
//   python src/modules/ui/fonts/build.py <dir>     rebuild the woff2 files from charset.txt (see build.py for <dir>)
//
// In `npm run dev` ui.js runs the same comparison against charset.txt and warns in the console.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const CHARSET = path.join(HERE, 'charset.txt');

// Files whose literal text reaches the screen in the UI face (comments ride along: a few spare glyphs).
const SOURCES = ['index.html', 'src/main.js', 'src/modules/index.js', 'src/modules/ui.js', 'src/modules/ui/minimap.js'];
// Data fields shown by the UI (Traditional). `name` / `address` are Simplified in-scene signage and stay out.
const FIELDS = new Set(['nameT', 'title', 'sub', 'quote', 'text', 'label']);
// Weight 700 is used by two elements only (the 青島 seal and the compass 北): keep this in step with build.py and ui.css.
const BOLD = '青島北';
const EXTRA = '「」『』，。、；：？！…—–·‧（）〈〉《》％℃°〇一二三四五六七八九十百千東西南北';

export function collectStrings(value, out = [], seen = new Set(), key = '') {
  if (typeof value === 'string') { if (FIELDS.has(key)) out.push(value); return out; }
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return out;
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, out, seen, key); return out; }
  for (const k of Object.keys(value)) collectStrings(value[k], out, seen, k);
  return out;
}

async function needed() {
  const set = new Set();
  const add = (s) => { for (const c of s) { const cp = c.codePointAt(0); if (cp > 0x7e && cp !== 0xfeff && !(cp >= 0x80 && cp < 0xa0)) set.add(c); } };
  for (const f of SOURCES) add(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const { MAP } = await import(pathToFileURL(path.join(ROOT, 'src/world/map.js')).href);
  const { PRESETS } = await import(pathToFileURL(path.join(ROOT, 'src/core/presets.js')).href);
  for (const s of collectStrings(MAP)) add(s);
  for (const s of collectStrings(PRESETS)) add(s);
  add(EXTRA); add(BOLD);
  // arrows, box drawing and maths in comments are not UI text
  for (const c of [...set]) { const cp = c.codePointAt(0); if ((cp >= 0x2190 && cp < 0x2e80) || cp >= 0x1f000) set.delete(c); }
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

const want = await needed();
const have = new Set(fs.existsSync(CHARSET) ? fs.readFileSync(CHARSET, 'utf8').replace(/\s/g, '') : '');
const arg = process.argv[2];

if (!arg) {
  const missing = want.filter((c) => !have.has(c));
  if (missing.length) {
    console.error(`[ui fonts] ${missing.length} character(s) are not in the Noto Serif TC subset: ${missing.join('')}`);
    console.error('[ui fonts] run it with --write, then python src/modules/ui/fonts/build.py <dir> (see the headers of both files)');
    process.exit(1);
  }
  console.log(`[ui fonts] ok: ${want.length} characters needed, ${have.size} in the subset`);
} else if (arg === '--write') {
  const text = want.join('');
  fs.writeFileSync(CHARSET, text.replace(/(.{60})/gu, '$1\n').trimEnd() + '\n');
  console.log(`[ui fonts] charset.txt: ${want.length} characters`);
} else {
  console.error('usage: subset.mjs [--write]');
  process.exit(2);
}
