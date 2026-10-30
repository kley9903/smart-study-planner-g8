// Codespaces: start one preview server per workspace, including after reconnects.
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function ready() {
  try {
    const response = await fetch('http://127.0.0.1:5173', { signal: AbortSignal.timeout(1000) });
    return response.ok && (await response.text()).includes('<title>Smart Study Planner</title>');
  } catch { return false; }
}
if (!(await ready())) {
  const log = openSync(new URL('../.preview.log', import.meta.url), 'a');
  const child = spawn(process.execPath, ['serve.mjs', '5173'], {
    cwd: root, detached: true, stdio: ['ignore', log, log], windowsHide: true,
  });
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.unref();
  closeSync(log);
  for (let attempt = 0; attempt < 20 && !(await ready()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
if (!(await ready())) {
  console.error('Preview did not start. Check .preview.log, or run npm start in the terminal.');
  process.exitCode = 1;
} else {
  console.log('Preview ready. Open Ports → 5173 → Open in Browser. Refresh after saving changes.');
}
