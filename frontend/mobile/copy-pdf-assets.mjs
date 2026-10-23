import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendRoot = process.cwd();
const destination = resolve(frontendRoot, 'dist-mobile/vendor/pdfjs');
mkdirSync(destination, { recursive: true });
cpSync(resolve(frontendRoot, '../vendor/pdfjs'), destination, { recursive: true });
rmSync(resolve(frontendRoot, 'mobile/index.html'), { force: true });
