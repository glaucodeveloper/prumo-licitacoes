'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { validateRouterConfig } = require('./connection-validator.cjs');

let server;
let routerOrigin;
let ocrHealth = { ready: true, model: 'tesseract-lstm-por-eng-v1' };
let miniStatus = 200;
let miniPayload = { data: [{ id: 'minicpm5-2b' }] };
const seen = [];

before(async () => {
  server = http.createServer((request, response) => {
    seen.push({ path: request.url, key: request.headers['x-port-router-key'] });
    if (request.headers['x-port-router-key'] !== 'test-router-key') {
      response.writeHead(403).end();
      return;
    }
    if (request.url === '/19202/health') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(ocrHealth));
      return;
    }
    if (request.url === '/19200/v1/models') {
      response.writeHead(miniStatus, { 'content-type': 'application/json' }).end(JSON.stringify(miniPayload));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  routerOrigin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('valida a chave nas rotas protegidas, OCR local e MiniCPM', async () => {
  seen.length = 0;
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, true);
  assert.equal(result.warning, undefined);
  assert.match(result.message, /OCR local e MiniCPM responderam/);
  assert.deepEqual(seen.map(({ path }) => path), ['/19202/health', '/19200/v1/models']);
  assert.ok(seen.every(({ key }) => key === 'test-router-key'));
});

test('mantém a chave salva e avisa quando MiniCPM não lista o modelo esperado', async () => {
  miniPayload = { data: [{ id: 'other-local-model' }] };
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, true);
  assert.equal(result.warning, true);
  assert.match(result.message, /MiniCPM indisponível/);
  assert.match(result.message, /other-local-model/);
  miniPayload = { data: [{ id: 'minicpm5-2b' }] };
});

test('recusa chave que falha na rota MiniCPM mesmo quando o OCR respondeu', async () => {
  miniStatus = 403;
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, false);
  assert.equal(result.invalidKey, true);
  assert.match(result.error, /rota protegida do MiniCPM/);
  miniStatus = 200;
});

test('não aceita conexão sem o modelo OCR local esperado', async () => {
  ocrHealth = { ready: false, model: 'other-ocr' };
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, false);
  assert.match(result.error, /OCR local não está pronto/);
  ocrHealth = { ready: true, model: 'tesseract-lstm-por-eng-v1' };
});
