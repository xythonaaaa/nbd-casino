import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${rel}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

const errors = [];

const styles = read('css/styles.css');
const casinoHome = read('css/casino-home.css');
const common = read('js/common.js');

// --- css/styles.css = main layout (large file, CSS reset first) ---
if (!styles.startsWith('*, *::before')) {
  errors.push(
    'css/styles.css is wrong — must start with "*, *::before" (main layout CSS). You may have uploaded casino-home.css here by mistake.'
  );
}

if (styles.includes('premium lobby atmosphere')) {
  errors.push(
    'css/styles.css contains casino-home content — restore the full main styles.css file (layout, header, sidebar, etc.).'
  );
}

if (styles.length < 50000) {
  errors.push(
    `css/styles.css looks too small (${styles.length} bytes). The real file should be ~90KB+. You may have uploaded the wrong file.`
  );
}

if (!styles.includes('.casino-jackpot-bar')) {
  errors.push('css/styles.css is missing homepage jackpot styles — use the latest styles.css from your project.');
}

// --- css/casino-home.css = theme overrides (comment header, smaller file) ---
if (!casinoHome.includes('premium lobby atmosphere')) {
  errors.push('css/casino-home.css looks wrong — expected the casino theme file (comment: "premium lobby atmosphere").');
}

if (!casinoHome.includes('.home-hero-stack') || !casinoHome.includes('.casino-jackpot-bar')) {
  errors.push(
    'css/casino-home.css is missing homepage jackpot layout — deploy the latest casino-home.css (jackpot grid must live here too).'
  );
}

if (casinoHome.startsWith('*, *::before')) {
  errors.push(
    'css/casino-home.css is wrong — it looks like main styles.css. Upload the real casino-home.css theme file here.'
  );
}

if (casinoHome.startsWith('const CHAT_STORAGE_KEY') || casinoHome.includes('CHAT_POLL_MS')) {
  errors.push(
    'css/casino-home.css is wrong — it contains js/common.js. Restore the real casino-home.css theme file.'
  );
}

if (casinoHome.length > styles.length) {
  errors.push(
    'css/casino-home.css is larger than styles.css — files may be swapped. styles.css should be the bigger main layout file.'
  );
}

// --- js/common.js = browser bundle (not a Netlify function) ---
if (common.startsWith('import ')) {
  errors.push(
    'js/common.js is wrong — contains server code (Netlify function). Use the browser common.js from js/, not netlify/functions/*.mjs.'
  );
}

if (!common.startsWith('const CHAT_STORAGE_KEY')) {
  errors.push('js/common.js must start with "const CHAT_STORAGE_KEY".');
}

if (common.length < 50000) {
  errors.push(
    `js/common.js looks too small (${common.length} bytes). You may have uploaded the wrong file or a truncated copy.`
  );
}

if (errors.length) {
  console.error('Deploy verification FAILED:\n');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

console.log('Deploy verification OK');
console.log(`  css/styles.css     ${styles.length.toLocaleString()} bytes`);
console.log(`  css/casino-home.css ${casinoHome.length.toLocaleString()} bytes`);
console.log(`  js/common.js       ${common.length.toLocaleString()} bytes`);
