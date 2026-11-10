// Local preview server with a stand-in for the Google Apps Script comments API.
//   node tools/serve.mjs [dir] [port]      (defaults: .preview 8787)
// Build for it with:  node tools/build.mjs --out .preview --endpoint http://localhost:8787/api
// Mock comments are kept in memory and vanish when the server stops.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, extname, normalize } from 'node:path';

const dir = resolve(process.argv[2] || '.preview');
const port = Number(process.argv[3] || 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' };
const comments = [];

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api') {
    if (req.method === 'GET') {
      const page = url.searchParams.get('page');
      return send(res, 200, { ok: true, comments: comments.filter((c) => !page || c.page === page) });
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    if (body.action === 'add') { comments.push({ ...body.comment, resolved: false }); return send(res, 200, { ok: true }); }
    if (body.action === 'resolve') {
      const c = comments.find((x) => x.id === body.id);
      if (!c) return send(res, 200, { ok: false, error: 'Not found' });
      c.resolved = !!body.resolved;
      return send(res, 200, { ok: true });
    }
    return send(res, 200, { ok: false, error: 'Unknown action' });
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
  const file = join(dir, p);
  if (!file.startsWith(dir)) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}`));
