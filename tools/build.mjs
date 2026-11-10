// Builds the password-protected site into docs/ (what GitHub Pages serves).
//
//   node tools/build.mjs                      # asks for the password
//   DONELINES_PASSWORD=... node tools/build.mjs
//
// Options:
//   --out <dir>        write somewhere other than docs/ (e.g. a local test build)
//   --endpoint <url>   override the comments endpoint from feedback.config.json
//
// Each page in mockups/ gets the feedback layer added, is encrypted with
// AES-256-GCM (key from the password via PBKDF2-SHA256), and is wrapped in
// gate/unlock.html. Only ciphertext goes into the output folder.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const { subtle } = globalThis.crypto;
const getRandomValues = (a) => globalThis.crypto.getRandomValues(a);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITERATIONS = 600000;

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const outDir = resolve(root, flag('--out') || 'docs');

// Page order and labels for the direction switcher.
const PAGES = [
  { slug: 'a-calm', short: 'A', title: 'A · Calm & Focused' },
  { slug: 'b-bold', short: 'B', title: 'B · Bold & Confident' },
  { slug: 'c-warm', short: 'C', title: 'C · Warm & Approachable' },
];

// ---- config ----
const cfgPath = join(root, 'feedback.config.json');
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const endpoint = flag('--endpoint') ?? cfg.endpoint ?? '';
const token = cfg.token ?? '';
if (!endpoint) console.warn('! No comments endpoint set: comments will be saved only in each viewer\'s browser (local mode).');

// The salt isn't secret. Keeping it fixed means a remembered unlock survives rebuilds.
const saltPath = join(root, 'gate', 'salt.json');
if (!existsSync(saltPath)) {
  writeFileSync(saltPath, JSON.stringify({ salt: Buffer.from(getRandomValues(new Uint8Array(16))).toString('base64') }, null, 2) + '\n');
}
const salt = JSON.parse(readFileSync(saltPath, 'utf8')).salt;

// ---- password ----
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
  return new Promise((res) => rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); res(a); }));
}
let password = process.env.DONELINES_PASSWORD;
if (!password) {
  password = await ask('Password for the mockups: ');
  const again = await ask('Type it again: ');
  if (password !== again) { console.error('Passwords didn\'t match.'); process.exit(1); }
}
if (!password || password.length < 10) {
  console.error('Use a password of at least 10 characters (a few random words works well).');
  process.exit(1);
}

// ---- crypto ----
const baseKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await subtle.deriveKey(
  { name: 'PBKDF2', salt: Buffer.from(salt, 'base64'), iterations: ITERATIONS, hash: 'SHA-256' },
  baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);

async function encrypt(html) {
  const iv = getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(html));
  return { salt, iterations: ITERATIONS, iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64') };
}

// ---- build ----
const shell = readFileSync(join(root, 'gate', 'unlock.html'), 'utf8');
const feedbackJs = readFileSync(join(root, 'feedback', 'feedback.js'), 'utf8');
const marker = /\/\*DATA\*\/null\/\*END\*\//;
if (!marker.test(shell)) throw new Error('gate/unlock.html is missing the /*DATA*/null/*END*/ marker');

const scriptSafe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const files = readdirSync(join(root, 'mockups')).filter((f) => f.endsWith('.html'));
for (const f of files) {
  let html = readFileSync(join(root, 'mockups', f), 'utf8');
  const slug = f.replace(/\.html$/, '');
  const page = PAGES.find((p) => p.slug === slug);
  if (page) {
    const config = { page: slug, pageTitle: page.title, pages: PAGES, endpoint, token };
    const inject = `<script>window.FEEDBACK_CONFIG=${scriptSafe(JSON.stringify(config))};</script>\n<script>\n${scriptSafe(feedbackJs)}\n</script>\n`;
    if (!html.includes('</body>')) throw new Error(`${f}: no </body>`);
    html = html.replace('</body>', inject + '</body>');
  }
  const data = await encrypt(html);
  writeFileSync(join(outDir, f), shell.replace(marker, () => JSON.stringify(data)));
  console.log(`${f.padEnd(14)} encrypted${page ? ' + feedback' : ''}`);
}

writeFileSync(join(outDir, '.nojekyll'), '');
writeFileSync(join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// Safety check: nothing readable from the mockups should be in the output.
for (const f of readdirSync(outDir)) {
  const out = readFileSync(join(outDir, f), 'utf8');
  for (const probe of ['DONELines', 'deadline', endpoint, token].filter((p) => p && p.length > 4)) {
    if (out.toLowerCase().includes(probe.toLowerCase())) throw new Error(`Plaintext "${probe}" found in ${f}. Not publishing.`);
  }
}
console.log(`\nDone → ${outDir}`);
