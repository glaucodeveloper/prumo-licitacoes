import fs from 'node:fs';
import path from 'node:path';

const [sourceFile, packageFile, outputDir] = process.argv.slice(2);
if (!sourceFile || !packageFile || !outputDir) {
  throw new Error('Uso: node patch-electron-windows.mjs <server.mjs> <package.json> <output-dir>');
}

let source = fs.readFileSync(sourceFile, 'utf8');
function replaceOne(before, after) {
  if (!source.includes(before)) throw new Error(`Assinatura não encontrada em server.mjs: ${before}`);
  source = source.replace(before, after);
}

replaceOne("const APP_CONFIG_PATH = path.join(ROOT, 'prumo.config.json');", "const APP_CONFIG_PATH = process.env.PRUMO_CONFIG_PATH || path.join(ROOT, 'prumo.config.json');");
replaceOne("const CAPTURE_ROOT = path.join(ROOT, 'data', 'captures');", "const CAPTURE_ROOT = path.join(process.env.PRUMO_DATA_DIR || path.join(ROOT, 'data'), 'captures');");
replaceOne("const PORTAL_SESSION_ROOT = path.join(ROOT, 'data', 'portal-sessions');", "const PORTAL_SESSION_ROOT = path.join(process.env.PRUMO_DATA_DIR || path.join(ROOT, 'data'), 'portal-sessions');");
replaceOne('OPENJEV_CONFIG.endpoint || process.env.OPENJEV_URL', 'process.env.OPENJEV_URL || OPENJEV_CONFIG.endpoint');
replaceOne('OPENJEV_CONFIG.model || process.env.OPENJEV_MODEL', 'process.env.OPENJEV_MODEL || OPENJEV_CONFIG.model');
replaceOne('OPENJEV_CONFIG.apiKey || process.env.OPENJEV_API_KEY', 'process.env.OPENJEV_API_KEY || OPENJEV_CONFIG.apiKey');
replaceOne('endpoint: nvidia.endpoint || ASSISTANT_CONFIG.endpoint || ASSISTANT_ORIGIN,', 'endpoint: process.env.ASSISTANT_URL || nvidia.endpoint || ASSISTANT_CONFIG.endpoint || ASSISTANT_ORIGIN,');
replaceOne('  return CHROME_PATHS.find((candidate) => fs.existsSync(candidate));', '  if (process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)) return undefined;\n  return CHROME_PATHS.find((candidate) => fs.existsSync(candidate));');
replaceOne('  process.env.PRUMO_CHROME_PATH,', `  process.env.PRUMO_CHROME_PATH,
  ...(process.platform === 'win32' ? [
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : []),`);

fs.writeFileSync(sourceFile, source);
const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
pkg.name = 'prumo-licitacoes-desktop';
pkg.productName = 'Prumo Licitações';
pkg.private = true;
pkg.main = 'electron/main.cjs';
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
  directories: { output: path.resolve(outputDir) },
  files: ['**/*', '!**/.git/**', '!**/.env*', '!**/data/**', '!**/*.pem', '!**/*.key', '!**/*.zip', '!**/*.AppImage', '!**/output/**'],
  win: { icon: 'electron/prumo.ico', target: ['portable', 'nsis'], signAndEditExecutable: true },
  portable: { artifactName: 'Prumo-Licitacoes-Portable-${version}-${arch}.${ext}' },
  nsis: {
    artifactName: 'Prumo-Licitacoes-Setup-${version}-${arch}.${ext}',
    installerIcon: 'electron/prumo.ico',
    uninstallerIcon: 'electron/prumo.ico',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
};
fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
