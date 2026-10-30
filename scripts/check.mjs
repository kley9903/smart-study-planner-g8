// Dependency-free CI checks. These catch syntax, missing assets and broken HTTP serving;
// they do not replace manually trying the planner in a browser.
import assert from 'node:assert/strict';
import { readdir, readFile, access } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative, isAbsolute } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : path;
  }))).flat();
}
const files = await walk(dist);
const jsFiles = files.filter((path) => path.endsWith('.js'));
for (const file of [...jsFiles, resolve(root, 'serve.mjs'), ...await walk(resolve(root, 'scripts'))]) {
  if (!/\.m?js$/.test(file)) continue;
  const parsed = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr || `Cannot check ${file}`);
}
let refs = 0;
async function asset(from, reference) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) return;
  const clean = reference.split(/[?#]/)[0];
  if (!clean) return;
  const target = resolve(clean.startsWith('/') ? dist : dirname(from), clean.replace(/^\//, ''));
  const path = relative(dist, target);
  assert.ok(path !== '..' && !path.startsWith('..' + '/') && !path.startsWith('..' + '\\') && !isAbsolute(path), `Asset outside dist: ${reference}`);
  await access(target);
  refs++;
}
for (const file of jsFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\b(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    await asset(file, match[1]);
  }
}
const index = resolve(dist, 'index.html');
for (const match of (await readFile(index, 'utf8')).matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
  await asset(index, match[1]);
}

// Ask the OS for an unused port instead of colliding with the developer's preview.
const probe = createServer();
await new Promise((done) => probe.listen(0, '127.0.0.1', done));
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const server = spawn(process.execPath, ['serve.mjs', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let serverError;
let stderr = '';
server.on('error', (error) => { serverError = error; });
server.stderr.on('data', (data) => { stderr += data; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Server exited: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<title>Smart Study Planner<\/title>/);
      ready = true;
      break;
    } catch { await new Promise((done) => setTimeout(done, 100)); }
  }
  assert.ok(ready, `Preview server did not start: ${stderr}`);
  for (const file of files) {
    const path = relative(dist, file).split('\\').join('/');
    const response = await fetch(`http://127.0.0.1:${port}/${path}`);
    assert.equal(response.status, 200, path);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(file), path);
    if (file.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
  }
  assert.equal((await fetch(`http://127.0.0.1:${port}/missing-file`)).status, 404);
} finally {
  if (server.exitCode === null) {
    await new Promise((done) => { server.once('exit', done); server.kill(); });
  }
}
console.log(`Passed: ${jsFiles.length} JavaScript files, ${refs} local references, ${files.length} served assets, and missing-file response.`);
