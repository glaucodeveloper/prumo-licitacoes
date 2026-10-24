'use strict';
const { app, BrowserWindow, ipcMain, Menu, dialog, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');

const APP_ROOT = app.getAppPath();
const DEFAULT_PORT = 8765;
const DEFAULT_ASSISTANT_PORT = 8765;
// URL fixa embutida no aplicativo; o usuário informa somente a chave.
const ROUTER_ORIGIN = 'https://ateliotic-jann-paragonless.ngrok-free.dev';
let mainWindow = null;
let settingsWindow = null;
let backend = null;
let relay = null;
let quitting = false;
let started = false;
let startTask = null;
let config = null;
let startupNotice = '';

function userFile(name) { return path.join(app.getPath('userData'), name); }
async function clearFirstRunBrowserData(origin) {
  const marker = userFile(`browser-storage-cleanup-${app.getVersion()}`);
  if (fs.existsSync(marker)) return;
  await session.defaultSession.clearCache();
  await session.defaultSession.clearStorageData({
    origin,
    storages: ['cookies', 'localstorage'],
  });
  fs.writeFileSync(marker, new Date().toISOString() + '\n', { mode: 0o600 });
}
function savedConfig() {
  try { return JSON.parse(fs.readFileSync(userFile('prumo-remote.json'), 'utf8')); }
  catch { return null; }
}
function effectiveConfig() {
  const saved = savedConfig();
  const supplied = process.env.PRUMO_ROUTER_KEY || saved?.key || '';
  if (!supplied) return null;
  try {
    return { ...normalizeConfig({ key: supplied }, saved || {}), validatedForVersion: saved?.validatedForVersion || '' };
  }
  catch (error) { log('Configuração inválida: ' + error.message); return null; }
}
function normalizeConfig(input, previous = {}) {
  const key = String(input?.key || '').trim() || String(previous.key || '').trim();
  if (!/^[A-Za-z0-9_\-]{16,256}$/.test(key)) throw new Error('Informe uma chave de roteamento válida (somente a chave, sem URL).');
  return {
    remoteUrl: ROUTER_ORIGIN,
    key,
    port: DEFAULT_PORT,
    assistantPort: DEFAULT_ASSISTANT_PORT,
    model: 'openjev-27b-q4_k_m',
  };
}
async function validateRouterConfig(candidate) {
  const url = new URL('/19202/health', ROUTER_ORIGIN);
  let response;
  try {
    response = await fetch(url, {
      headers: { 'X-Port-Router-Key': candidate.key, 'ngrok-skip-browser-warning': '1', accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch (error) {
    return { ok: false, invalidKey: false, error: `Não foi possível validar a conexão com o roteador e o OCR local: ${error.message}` };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, invalidKey: true, error: `O roteador recusou a chave informada (HTTP ${response.status}).` };
  }
  if (!response.ok) {
    return { ok: false, invalidKey: false, error: `O roteador respondeu HTTP ${response.status} ao verificar o serviço OCR na porta 19202.` };
  }
  let health;
  try { health = await response.json(); }
  catch { return { ok: false, invalidKey: false, error: 'O serviço OCR respondeu em formato inválido.' }; }
  if (health?.ready !== true || health?.model !== 'tesseract-lstm-por-eng-v1') {
    return { ok: false, invalidKey: false, error: 'A chave foi aceita, mas o serviço OCR local não está pronto com o modelo esperado.' };
  }
  return { ok: true, invalidKey: false, message: 'Chave aceita. Roteador ngrok e OCR local responderam.' };
}
function publicConfig() {
  const current = config || { remoteUrl: ROUTER_ORIGIN, key: '', port: DEFAULT_PORT, assistantPort: DEFAULT_ASSISTANT_PORT, model: 'openjev-27b-q4_k_m' };
  return { remoteUrl: ROUTER_ORIGIN, keyConfigured: Boolean(current.key), setupRequired: !current.key, startupNotice, port: current.port, assistantPort: current.assistantPort, model: current.model };
}
function persistConfig(value) {
  const file = userFile('prumo-remote.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
function log(line) {
  try { fs.appendFileSync(userFile('prumo.log'), `[${new Date().toISOString()}] ${line}\n`); } catch {}
}
function allowLocalOrigin(origin) { return origin === undefined || origin === null || origin === 'null' || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin); }
function relayRequest(req, res) {
  (async () => {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    const assistantChat = pathname === '/assistant/chat/completions';
    const openjevRequest = pathname.startsWith('/v1/');
    if (!assistantChat && !openjevRequest) { res.writeHead(404); res.end(); return; }
    if (!allowLocalOrigin(req.headers.origin)) { res.writeHead(403); res.end(); return; }
    const cfg = config || { remoteUrl: '', key: '', port: DEFAULT_PORT, assistantPort: DEFAULT_ASSISTANT_PORT };
    const targetPort = cfg.port;
    const suffix = assistantChat ? '/v1/metis/chat/completions' : (req.url || '/');
    const url = cfg.remoteUrl
      ? new URL(`/${targetPort}${suffix}`, cfg.remoteUrl)
      : new URL(suffix, `http://127.0.0.1:${targetPort}`);
    const headers = { 'ngrok-skip-browser-warning': '1' };
    if (cfg.remoteUrl && cfg.key) headers['X-Port-Router-Key'] = cfg.key;
    for (const name of ['accept', 'content-type']) if (req.headers[name]) headers[name] = req.headers[name];
    if (!assistantChat && req.headers.authorization) headers.authorization = req.headers.authorization;
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      redirect: 'manual',
      signal: AbortSignal.timeout(660000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      log(`Roteador respondeu HTTP ${upstream.status} (redirecionamento não seguido).`);
    }
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
      'cache-control': 'no-store',
      ...(upstream.headers.get('retry-after') ? { 'retry-after': upstream.headers.get('retry-after') } : {}),
    });
    if (upstream.body) Readable.fromWeb(upstream.body).on('error', (error) => res.destroy(error)).pipe(res);
    else res.end();
  })().catch((error) => {
    log('Proxy: ' + error.message);
    if (!res.headersSent) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Endpoint inacessível: ' + error.message })); }
    else res.destroy(error);
  });
}
async function listenLocal(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => { server.off('listening', onListen); reject(err); };
    const onListen = () => { server.off('error', onError); resolve(server.address().port); };
    server.once('error', onError);
    server.once('listening', onListen);
    server.listen(port, '127.0.0.1');
  });
}
async function findPort(preferred) {
  const s = net.createServer();
  let port;
  try { port = await listenLocal(s, preferred); }
  catch (err) { if (err.code !== 'EADDRINUSE') throw err; port = await listenLocal(s, 0); }
  await new Promise(resolve => s.close(resolve));
  return port;
}
async function startBackend() {
  if (started) return;
  if (startTask) return startTask;
  startTask = (async () => {
    fs.mkdirSync(userFile('data'), { recursive: true, mode: 0o700 });
    relay = http.createServer(relayRequest);
    const relayPort = await listenLocal(relay, 0);
    const port = await findPort(8877);
    const executable = process.execPath;
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PRUMO_HOST: '127.0.0.1',
      PORT: String(port),
      OPENJEV_URL: `http://127.0.0.1:${relayPort}`,
      OPENJEV_MODEL: config.model,
      ASSISTANT_URL: `http://127.0.0.1:${relayPort}/v1/metis/chat/completions`,
      ASSISTANT_MODEL: 'metis-4b:prumo-licitacoes',
      PORT_ROUTER_KEY: config.key,
      PORT_ROUTER_PUBLIC_URL: config.remoteUrl,
      PRUMO_DATA_DIR: userFile('data'),
      PRUMO_CONFIG_PATH: userFile('prumo.config.json'),
      ...(fs.existsSync(path.join(APP_ROOT, 'browsers')) ? { PLAYWRIGHT_BROWSERS_PATH: path.join(APP_ROOT, 'browsers') } : {}),
    };
    backend = spawn(executable, [path.join(APP_ROOT, 'server.mjs')], {
      cwd: APP_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    backend.stdout.on('data', (buffer) => log(buffer.toString().trim().slice(0, 3000)));
    backend.stderr.on('data', (buffer) => log('STDERR: ' + buffer.toString().trim().slice(0, 3000)));
    backend.on('error', (error) => log('Falha ao iniciar Node: ' + error.message));
    backend.on('exit', (code, signal) => {
      log(`Node encerrou: code=${code} signal=${signal}`);
      backend = null;
      if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, { type: 'error', message: 'O servidor interno do Prumo foi encerrado.', detail: `Veja ${userFile('prumo.log')}` });
      }
    });
    const baseUrl = `http://127.0.0.1:${port}/`;
    let ready = false;
    for (let i = 0; i < 75; i++) {
      if (backend === null) break;
      try {
        const response = await fetch(baseUrl, { signal: AbortSignal.timeout(600) });
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`Node não iniciou. Consulte ${userFile('prumo.log')}`);
    await clearFirstRunBrowserData(new URL(baseUrl).origin);
    mainWindow = new BrowserWindow({
      width: 1400, height: 900, minWidth: 850, minHeight: 580,
      show: false, backgroundColor: '#101218',
      icon: path.join(APP_ROOT, 'electron', 'prumo.ico'),
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(baseUrl)) { event.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); }
    });
    await mainWindow.loadURL(baseUrl);
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.show();
    started = true;
  })();
  try { await startTask; }
  finally { startTask = null; }
}
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow.focus();
  settingsWindow = new BrowserWindow({
    width: 560, height: 620, minWidth: 460, minHeight: 530,
    resizable: true, autoHideMenuBar: true,
    icon: path.join(APP_ROOT, 'electron', 'prumo.ico'),
    webPreferences: { preload: path.join(APP_ROOT, 'electron', 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(APP_ROOT, 'electron', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (!started && !startTask && !quitting) app.quit();
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('br.com.prumo.licitacoes');
  fs.mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 });
  config = effectiveConfig();
  ipcMain.handle('prumo:config', () => publicConfig());
  ipcMain.handle('prumo:validate-config', async (_event, input) => {
    try {
      const candidate = normalizeConfig(input, config || {});
      return await validateRouterConfig(candidate);
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle('prumo:save-config', async (_event, input) => {
    try {
      const candidate = normalizeConfig(input, config || {});
      const validation = await validateRouterConfig(candidate);
      if (!validation.ok) return validation;
      const next = { ...candidate, validatedForVersion: app.getVersion() };
      persistConfig(next);
      config = next;
      startupNotice = validation.message;
      if (!started) await startBackend();
      if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
      return { ok: true, message: validation.message };
    } catch (error) { log('Configuração: ' + error.message); return { ok: false, error: error.message }; }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Prumo', submenu: [
      { label: 'Configurar conexão remota', accelerator: 'CmdOrCtrl+,', click: openSettings },
      { type: 'separator' }, { role: 'quit', label: 'Sair' },
    ] },
    { label: 'Editar', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ]));
  if (!config) openSettings();
  else {
    try {
      const validation = await validateRouterConfig(config);
      if (validation.invalidKey) {
        startupNotice = validation.error;
        config = null;
        openSettings();
        return;
      }
      if (validation.ok) {
        startupNotice = validation.message;
        config = { ...config, validatedForVersion: app.getVersion() };
        persistConfig(config);
      } else {
        startupNotice = `Verificação de conexão indisponível: ${validation.error}`;
        log(startupNotice);
      }
      await startBackend();
    }
    catch (error) { log('Inicialização: ' + error.message); dialog.showErrorBox('Falha ao iniciar Prumo', error.message); app.quit(); }
  }
}).catch(error => { dialog.showErrorBox('Prumo', error.message); app.quit(); });

app.on('before-quit', () => {
  quitting = true;
  if (backend) { backend.kill('SIGTERM'); backend = null; }
  if (relay) { relay.close(); relay = null; }
});
app.on('window-all-closed', () => app.quit());
