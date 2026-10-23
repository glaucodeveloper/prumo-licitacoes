import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';

const HOST = process.env.PRUMO_OCR_HOST || '127.0.0.1';
const PORT = Number(process.env.PRUMO_OCR_PORT || 19202);
const OCR_MODEL = 'tesseract-lstm-por-eng-v1';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(os.homedir(), '.cache', 'prumo-licitacoes', 'tessdata');
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BASE64_CHARS = 2_000_000;
let worker;
let workQueue = Promise.resolve();

function reply(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('A requisição OCR excede 12 MB.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch {
    const error = new Error('Corpo JSON inválido.');
    error.statusCode = 400;
    throw error;
  }
}

async function prepareTessdata() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  for (const language of ['por', 'eng']) {
    const packageEntry = fileURLToPath(import.meta.resolve(`@tesseract.js-data/${language}`));
    const source = path.join(path.dirname(packageEntry), '4.0.0_best_int', `${language}.traineddata.gz`);
    const destination = path.join(CACHE_DIR, `${language}.traineddata.gz`);
    await fs.copyFile(source, destination);
  }
}

async function initializeOcr() {
  await prepareTessdata();
  worker = await createWorker('por+eng', 1, {
    langPath: CACHE_DIR,
    gzip: true,
    cacheMethod: 'none',
    logger: () => {},
  });
  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: '3',
  });
}

function imageBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match || match[1].length > MAX_IMAGE_BASE64_CHARS) {
    const error = new Error('Imagem OCR inválida ou grande demais.');
    error.statusCode = 400;
    throw error;
  }
  const data = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (!data.length) {
    const error = new Error('A imagem OCR está vazia.');
    error.statusCode = 400;
    throw error;
  }
  return data;
}

function mergeOverlappingText(parts) {
  const lines = [];
  for (const part of parts) {
    const next = String(part || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let overlap = 0;
    for (let count = Math.min(12, lines.length, next.length); count > 0; count -= 1) {
      const suffix = lines.slice(-count).map((line) => line.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'));
      const prefix = next.slice(0, count).map((line) => line.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'));
      if (suffix.every((line, index) => line === prefix[index])) { overlap = count; break; }
    }
    lines.push(...next.slice(overlap));
  }
  return lines.join('\n').slice(0, 14000);
}

async function recognizePages(payload) {
  const pages = Array.isArray(payload.pages) ? payload.pages.slice(0, 4) : [];
  if (!pages.length) {
    const error = new Error('Nenhuma imagem de página foi enviada para OCR.');
    error.statusCode = 400;
    throw error;
  }

  const recognized = [];
  for (const page of pages) {
    const image = imageBuffer(page?.dataUrl);
    const result = await worker.recognize(image);
    recognized.push({
      page: Math.max(1, Number(page?.page) || 1),
      text: String(result.data?.text || '').trim(),
      confidence: Number(result.data?.confidence) || 0,
    });
  }

  const extractedText = mergeOverlappingText(recognized.map((page) => page.text));
  const confidences = recognized.map((page) => page.confidence).filter((value) => Number.isFinite(value) && value > 0);
  const confidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length / 100 : 0;
  return {
    fields: { confidence: Math.min(1, Math.max(0, confidence)) },
    extractedText,
    pages: recognized,
    model: OCR_MODEL,
    provider: 'local-tesseract',
    reviewRequired: true,
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return reply(response, 200, { ok: true, ready: Boolean(worker), service: 'prumo-local-ocr', model: OCR_MODEL, languages: ['por', 'eng'] });
  }
  if (request.method !== 'POST' || url.pathname !== '/v1/ocr') return reply(response, 404, { error: 'Rota não encontrada.' });

  try {
    const payload = await readJson(request);
    const current = workQueue.then(() => recognizePages(payload));
    workQueue = current.then(() => {}, () => {});
    return reply(response, 200, await current);
  } catch (error) {
    return reply(response, Number(error?.statusCode) || 500, { error: error?.message || 'Falha no OCR local.' });
  }
});

server.requestTimeout = 0;
server.headersTimeout = 60_000;
server.keepAliveTimeout = 5_000;

await initializeOcr();
server.listen(PORT, HOST, () => {
  process.stdout.write(`Prumo local OCR (${OCR_MODEL}) ouvindo em http://${HOST}:${PORT}\n`);
});

async function shutdown() {
  server.close();
  await worker?.terminate();
  process.exit(0);
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
