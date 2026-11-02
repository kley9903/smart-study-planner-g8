// 本機預覽：在 src/web 執行 `node serve.mjs`（不用安裝任何套件），再打開 http://localhost:5173
// 網站本身在 dist/，沒有 build 步驟；這個檔案不會被發布。
// /api/syllabus 跑跟 Cloudflare 上同一份 functions/api/syllabus.js；要試 AI 讀大綱，先設定環境變數 DIFY_API_KEY。
import http from 'node:http';
import { Readable } from 'node:stream';
import { onRequestPost as readSyllabus } from './functions/api/syllabus.js';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 5173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

http
  .createServer(async (req, res) => {
    if (req.url.split('?')[0] === '/api/syllabus') {
      if (req.method !== 'POST') return res.writeHead(405).end();
      const url = `http://${req.headers.host}${req.url}`;
      const request = new Request(url, { method: 'POST', headers: req.headers, body: Readable.toWeb(req), duplex: 'half' });
      const reply = await readSyllabus({ request, env: process.env });
      res.writeHead(reply.status, Object.fromEntries(reply.headers));
      return Readable.fromWeb(reply.body).pipe(res); // 逐行轉送，網頁才看得到每一步的進度
    }
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('找不到檔案');
    }
  })
  .listen(port, () => console.log(`Smart Study Planner 原型：http://localhost:${port}`));
