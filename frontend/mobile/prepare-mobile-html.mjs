import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const frontendRoot = process.cwd();
const sourcePath = resolve(frontendRoot, 'index.html');
const outputPath = resolve(frontendRoot, 'mobile/index.html');
const source = await readFile(sourcePath, 'utf8');
const expectedEntry = '<script type="module" src="/src/main.ts"></script>';
if (!source.includes(expectedEntry)) {
  throw new Error('Não encontrei a entrada principal esperada no frontend/index.html.');
}
await writeFile(outputPath, source.replace(expectedEntry, '<script type="module" src="/src/mobile-app.ts"></script>'));
