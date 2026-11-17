// Screenshot capture for SOLANO HEAT (Node 22, standard library only).
// Drives the Playwright-bundled Chromium over CDP with Node's built-in
// WebSocket: opens each ?shot= mode from shots.json at 1280x480, waits for
// window.__shotReady (set after a fixed number of fixed simulation steps,
// so the frame is deterministic), then takes a JPEG screenshot. Also
// records every network request (all must be localhost) and every console
// error. Usage:
//
//   node tools/capture-shots.mjs [out-dir] [--port 8080]
//
// The tool starts `node serve.ts` itself and stops it (exact child PID)
// when done. Run it twice into two directories and compare: the two runs
// must be byte-identical.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const outDir = process.argv[2] ?? join(here, 'screenshots');
const portArg = process.argv.indexOf('--port');
const port = portArg === -1 ? 8080 : Number(process.argv[portArg + 1]);
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const CDP_PORT = 9333;

const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, timeoutMs = 30000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // Not up yet.
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${url}`);
    await sleep(250);
  }
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.requests = [];
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.consoleErrors.push(`exception: ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ''}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      }
      if (msg.method === 'Network.requestWillBeSent') {
        this.requests.push(msg.params.request.url);
      }
    });
  }

  ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function captureOne(shot) {
  const url = `http://127.0.0.1:${port}/${shot.query}`;
  const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 480, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url });

  // Wait for the deterministic staged frame.
  const start = Date.now();
  for (;;) {
    const res = await cdp.send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
    if (res.result.value === true) break;
    if (Date.now() - start > 90000) throw new Error(`shot ${shot.name}: __shotReady never became true`);
    await sleep(300);
  }
  // One beat for the compositor to settle, then shoot.
  await sleep(400);
  const shotRes = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  const bytes = Buffer.from(shotRes.data, 'base64');
  const path = join(outDir, shot.name);
  writeFileSync(path, bytes);
  const external = cdp.requests.filter((u) => !u.startsWith(`http://127.0.0.1:${port}`) && !u.startsWith('data:') && u !== 'about:blank');
  console.log(`${shot.name}: ${bytes.length} bytes, console errors: ${cdp.consoleErrors.length}, external requests: ${external.length}`);
  for (const e of cdp.consoleErrors) console.log(`  ERROR ${e}`);
  for (const u of external) console.log(`  EXTERNAL ${u}`);
  cdp.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`);
  return { name: shot.name, bytes: bytes.length, errors: cdp.consoleErrors, external };
}

// Start the static server (exact child, killed by handle at the end).
const server = spawn(process.execPath, ['serve.ts', '--port', String(port)], { cwd: here, stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--window-size=1280,480',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'ignore' });

let code = 0;
try {
  await waitFor(`http://127.0.0.1:${port}/index.html`);
  await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const results = [];
  for (const shot of shots) results.push(await captureOne(shot));
  const bad = results.filter((r) => r.bytes > 262144 || r.errors.length > 0 || r.external.length > 0);
  if (bad.length > 0) {
    console.log(`FAIL: ${bad.map((b) => b.name).join(', ')}`);
    code = 1;
  } else {
    console.log('OK: all shots captured, no console errors, no external requests.');
  }
} catch (err) {
  console.error(`capture failed: ${err.message}`);
  code = 1;
} finally {
  chrome.kill('SIGTERM');
  server.kill('SIGTERM');
}
process.exit(code);
