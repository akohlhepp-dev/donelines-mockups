// Converts the Claude Design canvas files (design-source/*.dc.html) into plain,
// standalone HTML pages in mockups/. Run again whenever the canvas changes:
//   node tools/export-dc.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'design-source');
const outDir = join(root, 'mockups');
mkdirSync(outDir, { recursive: true });

// design-source file -> published slug
const NAMES = { 'Main.dc.html': 'a-calm', 'Bold.dc.html': 'b-bold', 'Warm.dc.html': 'c-warm' };

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.dc.html'))) {
  const src = readFileSync(join(srcDir, file), 'utf8');
  const pick = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error(`${file}: could not find ${label}`);
    return m[1];
  };
  const title = pick(/<title>([\s\S]*?)<\/title>/, '<title>');
  const helmet = pick(/<helmet>([\s\S]*?)<\/helmet>/, '<helmet>');
  const body = pick(/<\/helmet>([\s\S]*?)<\/x-dc>/, 'body content');

  // Fill template holes ({{accent}} etc.) with each prop's default value.
  const props = JSON.parse(pick(/data-props='([^']*)'/, 'data-props'));
  const vals = Object.fromEntries(
    Object.entries(props).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, v.default])
  );
  const filled = body.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in vals)) throw new Error(`${file}: no default for {{${k}}}`);
    return vals[k];
  });

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
${helmet.trim()}
</head>
<body>
${filled.trim()}
</body>
</html>
`;
  const slug = NAMES[file] ?? file.replace('.dc.html', '').toLowerCase();
  writeFileSync(join(outDir, `${slug}.html`), html);
  console.log(`mockups/${slug}.html  (accent ${Object.values(vals).join(', ')})`);
}
