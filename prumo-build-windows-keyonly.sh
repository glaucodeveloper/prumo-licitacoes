#!/usr/bin/env bash
# Compila Prumo Licitações (Node + frontend) como .exe Windows x64, a partir do Manjaro/Linux.
# Uso: ./prumo-build-windows-keyonly.sh [pasta-do-projeto] [--prepare-only]
set -Eeuo pipefail

ROOT="$(realpath "${1:-.}")"
PREPARE_ONLY="${2:-}"
[[ -f "$ROOT/server.mjs" && -f "$ROOT/package.json" && -f "$ROOT/index.html" ]] || {
  echo 'ERRO: execute na raiz do Prumo, onde existem server.mjs, package.json e index.html.' >&2
  exit 1
}
for tool in node npm rsync; do
  command -v "$tool" >/dev/null || { echo "ERRO: falta $tool" >&2; exit 1; }
done

STAGE="$ROOT/.prumo-electron-win-stage"
OUT="$ROOT/output/electron-windows"
if [[ "$PREPARE_ONLY" != '--prepare-only' && "${PRUMO_SKIP_FRONTEND_BUILD:-0}" != 1 ]]; then
  echo '[1/6] Compilando frontend...'
  if [[ ! -d "$ROOT/node_modules" ]]; then (cd "$ROOT" && npm ci --no-audit --no-fund); fi
  (cd "$ROOT" && npm run build:frontend)
fi

echo '[2/6] Montando pacote sem dados pessoais nem chaves...'
mkdir -p "$STAGE" "$OUT"
rsync -a --delete \
  --exclude='/.prumo-electron-stage/' --exclude='/.prumo-electron-win-stage/' --exclude='/output/' --exclude='/node_modules/' --exclude='**/node_modules/' \
  --exclude='/.git/' --exclude='**/.git/' --exclude='/.tokensave/' --exclude='/data/' \
  --exclude='/.presentation-build/' --exclude='/dist/' \
  --exclude='/prumo.config.json' --exclude='/prumo.config.example.json' --exclude='/.*' --exclude='/.env' --exclude='/.env.*' \
  --exclude='**/.env' --exclude='**/.env.*' --exclude='**/*.pem' \
  --exclude='**/*.key' --exclude='**/*credentials*.json' --exclude='**/*secrets*.json' \
  --exclude='*.AppImage' --exclude='*.exe' --exclude='*.zip' \
  "$ROOT/" "$STAGE/"
mkdir -p "$STAGE/electron"
install -D "$ROOT/assets/prumo.ico" "$STAGE/electron/prumo.ico"

# Ajustes SOMENTE na cópia de distribuição; server.mjs original não é alterado.
node - "$STAGE/server.mjs" "$STAGE/package.json" "$OUT" <<'NODE'
const fs = require('node:fs');
const [source, pkgFile, output] = process.argv.slice(2);
let code = fs.readFileSync(source, 'utf8');
function replaceOne(before, after) {
  if (!code.includes(before)) throw new Error('Assinatura não encontrada em server.mjs: ' + before);
  code = code.replace(before, after);
}
replaceOne("const APP_CONFIG_PATH = path.join(ROOT, 'prumo.config.json');", "const APP_CONFIG_PATH = process.env.PRUMO_CONFIG_PATH || path.join(ROOT, 'prumo.config.json');");
replaceOne("const CAPTURE_ROOT = path.join(ROOT, 'data', 'captures');", "const CAPTURE_ROOT = path.join(process.env.PRUMO_DATA_DIR || path.join(ROOT, 'data'), 'captures');");
replaceOne("const PORTAL_SESSION_ROOT = path.join(ROOT, 'data', 'portal-sessions');", "const PORTAL_SESSION_ROOT = path.join(process.env.PRUMO_DATA_DIR || path.join(ROOT, 'data'), 'portal-sessions');");
replaceOne("OPENJEV_CONFIG.endpoint || process.env.OPENJEV_URL", "process.env.OPENJEV_URL || OPENJEV_CONFIG.endpoint");
replaceOne("OPENJEV_CONFIG.model || process.env.OPENJEV_MODEL", "process.env.OPENJEV_MODEL || OPENJEV_CONFIG.model");
replaceOne("OPENJEV_CONFIG.apiKey || process.env.OPENJEV_API_KEY", "process.env.OPENJEV_API_KEY || OPENJEV_CONFIG.apiKey");
replaceOne("endpoint: nvidia.endpoint || ASSISTANT_CONFIG.endpoint || ASSISTANT_ORIGIN,", "endpoint: process.env.ASSISTANT_URL || nvidia.endpoint || ASSISTANT_CONFIG.endpoint || ASSISTANT_ORIGIN,");
replaceOne("  return CHROME_PATHS.find((candidate) => fs.existsSync(candidate));", "  if (process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)) return undefined;\n  return CHROME_PATHS.find((candidate) => fs.existsSync(candidate));");
// Prioriza o navegador Windows que acompanha o pacote; usa Chrome/Edge do sistema como fallback.
replaceOne("  process.env.PRUMO_CHROME_PATH,", `  process.env.PRUMO_CHROME_PATH,
  ...(process.platform === 'win32' ? [
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : []),`);

fs.writeFileSync(source, code);
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.name = 'prumo-licitacoes-desktop';
pkg.productName = 'Prumo Licitações';
pkg.main = 'electron/main.cjs';
pkg.private = true;
pkg.devDependencies = {
  ...(pkg.devDependencies || {}),
  electron: '^38.0.0',
  'electron-builder': '^26.0.12',
};
pkg.scripts = { ...(pkg.scripts || {}), 'build:electron:win': 'electron-builder --win --x64 --publish never' };
pkg.build = {
  appId: 'br.com.prumo.licitacoes',
  productName: 'Prumo Licitações',
  asar: false,
  npmRebuild: false,
  directories: { output },
  files: ['**/*', '!**/.git/**', '!**/.env*', '!**/data/**', '!**/*.pem', '!**/*.key', '!**/*.zip', '!**/*.AppImage', '!**/output/**'],
  win: { icon: 'electron/prumo.ico', target: ['portable', 'nsis'], signAndEditExecutable: true },
  portable: { artifactName: 'Prumo-Licitacoes-Portable-${version}-${arch}.${ext}' },
  nsis: { artifactName: 'Prumo-Licitacoes-Setup-${version}-${arch}.${ext}', installerIcon: 'electron/prumo.ico', uninstallerIcon: 'electron/prumo.ico', oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
};
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
// npm install atualizará o lock mantendo as versões previamente resolvidas do projeto.
NODE

cat > "$STAGE/electron/main.cjs" <<'MAIN'
'use strict';
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
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

function userFile(name) { return path.join(app.getPath('userData'), name); }
function savedConfig() {
  try { return JSON.parse(fs.readFileSync(userFile('prumo-remote.json'), 'utf8')); }
  catch { return null; }
}
function effectiveConfig() {
  const saved = savedConfig();
  const supplied = process.env.PRUMO_ROUTER_KEY || saved?.key || '';
  if (!supplied) return null;
  try { return normalizeConfig({ key: supplied }, saved || {}); }
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
function publicConfig() {
  const current = config || { remoteUrl: ROUTER_ORIGIN, key: '', port: DEFAULT_PORT, assistantPort: DEFAULT_ASSISTANT_PORT, model: 'openjev-27b-q4_k_m' };
  return { remoteUrl: ROUTER_ORIGIN, keyConfigured: Boolean(current.key), port: current.port, assistantPort: current.assistantPort, model: current.model };
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
  ipcMain.handle('prumo:save-config', async (_event, input) => {
    try {
      const next = normalizeConfig(input, config || {});
      const file = userFile('prumo-remote.json');
      fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
      fs.chmodSync(file, 0o600);
      config = next;
      if (!started) await startBackend();
      if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
      return { ok: true };
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
    try { await startBackend(); }
    catch (error) { log('Inicialização: ' + error.message); dialog.showErrorBox('Falha ao iniciar Prumo', error.message); app.quit(); }
  }
}).catch(error => { dialog.showErrorBox('Prumo', error.message); app.quit(); });

app.on('before-quit', () => {
  quitting = true;
  if (backend) { backend.kill('SIGTERM'); backend = null; }
  if (relay) { relay.close(); relay = null; }
});
app.on('window-all-closed', () => app.quit());
MAIN

cat > "$STAGE/electron/preload.cjs" <<'PRELOAD'
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('prumo', {
  getConfig: () => ipcRenderer.invoke('prumo:config'),
  saveConfig: (value) => ipcRenderer.invoke('prumo:save-config', value),
});
PRELOAD

cat > "$STAGE/electron/settings.html" <<'HTML'
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'self';">
<title>Prumo - Chave de acesso</title><style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;color:#e9e9ec;background:#141820;padding:30px}
h1{font-size:24px;margin:0 0 8px}p{color:#b2b9c6;line-height:1.55}label{display:block;margin:22px 0 7px;font-weight:600}
input{width:100%;border:1px solid #50586a;border-radius:10px;background:#202632;color:#fff;padding:12px 13px;font:inherit}
input:focus{outline:2px solid #7198ea}small{display:block;color:#9aa6b9;line-height:1.5;margin-top:9px;overflow-wrap:anywhere}
button{margin-top:20px;border:0;border-radius:10px;padding:13px 17px;background:#edf0f7;color:#101218;font-weight:700;cursor:pointer;width:100%}
#error{color:#ff9292;min-height:22px;margin:13px 0 0}.panel{border:1px solid #384354;border-radius:12px;background:#202632;padding:14px;margin-top:22px}
</style></head><body><h1>Chave de acesso</h1>
<p>Informe somente a chave de acesso ngrok. O Prumo conecta ao OpenJev e ao assistente Metis pelo serviço protegido na porta 8765.</p>
<form id="form"><label for="key">Chave do roteador</label><input id="key" type="password" required autocomplete="off" placeholder="Cole somente ROUTER_KEY" spellcheck="false">
<div class="panel"><strong>Conexão configurada</strong><small id="target"></small><small>A chave fica no perfil local do Windows e segue em cabeçalho de autenticação. Ela não é incluída no executável.</small></div>
<button type="submit" id="save">Salvar e abrir Prumo</button><p id="error" role="alert"></p></form>
<script src="settings.js"></script></body></html>
HTML

cat > "$STAGE/electron/settings.js" <<'SETTINGS'
'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  const existing = await window.prumo.getConfig();
  $('target').textContent = `${existing.remoteUrl} · OpenJev ${existing.port} (${existing.model}) · Metis no OpenJev ${existing.port}`;
  $('key').required = !existing.keyConfigured;
  $('key').placeholder = existing.keyConfigured ? 'Chave salva; deixe vazio para manter' : 'Cole apenas a chave';
  $('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('error').textContent = '';
    $('save').disabled = true;
    $('save').textContent = 'Abrindo...';
    try {
      const result = await window.prumo.saveConfig({ key: $('key').value });
      if (!result.ok) throw new Error(result.error || 'Falha ao salvar');
    } catch (error) { $('error').textContent = error.message; }
    finally { $('save').disabled = false; $('save').textContent = 'Salvar e abrir Prumo'; }
  });
})();
SETTINGS

node --check "$STAGE/server.mjs"
node --check "$STAGE/electron/main.cjs"
node --check "$STAGE/electron/preload.cjs"
node --check "$STAGE/electron/settings.js"

echo "[3/6] Arquivos preparados em: $STAGE"
if [[ "$PREPARE_ONLY" == '--prepare-only' ]]; then
  echo 'Modo --prepare-only: sintaxe validada; nenhuma dependência foi baixada e nenhum EXE foi criado.'
  exit 0
fi

if [[ "$(uname -s)" == Linux ]] && ! command -v wine >/dev/null 2>&1; then
  echo 'ERRO: Wine não encontrado. No Manjaro: sudo pacman -S --needed wine' >&2
  echo 'Também é possível compilar numa imagem Docker electronuserland/builder:wine.' >&2
  exit 1
fi

echo '[4/6] Instalando Electron, electron-builder e dependências da aplicação...'
(cd "$STAGE" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund)

if [[ "${PRUMO_BUNDLE_BROWSER:-1}" == 1 ]]; then
  echo '[5/6] Baixando Chromium de WINDOWS do Playwright (não o binário Linux)...'
  (cd "$STAGE" && PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=win64 PLAYWRIGHT_BROWSERS_PATH="$STAGE/browsers" ./node_modules/.bin/playwright install chromium)
  if ! find "$STAGE/browsers" -type f -iname '*.exe' -print -quit | grep -q .; then
    echo 'ERRO: Playwright não gerou binários Windows; desative o bundle (PRUMO_BUNDLE_BROWSER=0) ou verifique o override win64.' >&2
    exit 1
  fi
else
  echo '[5/6] Chromium não incluído (PRUMO_BUNDLE_BROWSER=0): exige Google Chrome ou Microsoft Edge no Windows.'
fi

echo '[6/6] Compilando executável portátil e instalador Windows x64...'
(cd "$STAGE" && ./node_modules/.bin/electron-builder --win --x64 --publish never)
if [[ "${PRUMO_BUNDLE_BROWSER:-1}" == 1 ]]; then
  # Confere se o empacotador realmente colocou o navegador do Windows no app.
  if ! find "$OUT/win-unpacked/resources/app/browsers" -type f -iname '*.exe' -print -quit 2>/dev/null | grep -q .; then
    echo 'ERRO: O browser Windows não apareceu no aplicativo empacotado!' >&2
    exit 1
  fi
fi
echo
echo 'Concluído. Arquivo(s) gerado(s):'
find "$OUT" -maxdepth 1 -type f -name '*.exe' -printf '  %p\n'
echo 'Na primeira execução, cole SOMENTE a chave ROUTER_KEY (URL e porta 8765 já estão fixas no aplicativo).'

# Requisitos: Manjaro + node + npm + rsync + wine. Não inclui código nem arquivos pessoais do projeto no script.
