'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { validateRouterConfig } = require('./connection-validator.cjs');

let server;
let routerOrigin;
let ocrHealth = { ready: true, model: 'tesseract-lstm-por-eng-v1' };
let ocrStatus = 200;
let ocrPayload = { model: 'tesseract-lstm-por-eng-v1', extractedText: 'Número da CAT: CAT-TESTE-2026' };
let miniStatus = 200;
let miniPayload = { data: [{ id: 'minicpm5-2b' }] };
let completionStatus = 200;
let completionPayload = {
  model: 'minicpm5-2b',
  choices: [{ finish_reason: 'stop', message: { content: '{"facts":[{"category":"Identificação","label":"Número da CAT","value":"CAT-TESTE-2026"}]}' } }],
};
const seen = [];

before(async () => {
  server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      seen.push({ path: request.url, method: request.method, key: request.headers['x-port-router-key'], body });
      if (request.headers['x-port-router-key'] !== 'test-router-key') {
        response.writeHead(403).end();
        return;
      }
      if (request.url === '/19202/health') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(ocrHealth));
        return;
      }
      if (request.url === '/19202/v1/ocr') {
        response.writeHead(ocrStatus, { 'content-type': 'application/json' }).end(JSON.stringify(ocrPayload));
        return;
      }
      if (request.url === '/19200/v1/models') {
        response.writeHead(miniStatus, { 'content-type': 'application/json' }).end(JSON.stringify(miniPayload));
        return;
      }
      if (request.url === '/19200/v1/chat/completions') {
        response.writeHead(completionStatus, { 'content-type': 'application/json' }).end(JSON.stringify(completionPayload));
        return;
      }
      response.writeHead(404).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  routerOrigin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function resetResponses() {
  seen.length = 0;
  ocrHealth = { ready: true, model: 'tesseract-lstm-por-eng-v1' };
  ocrStatus = 200;
  ocrPayload = { model: 'tesseract-lstm-por-eng-v1', extractedText: 'Número da CAT: CAT-TESTE-2026' };
  miniStatus = 200;
  miniPayload = { data: [{ id: 'minicpm5-2b' }] };
  completionStatus = 200;
  completionPayload = {
    model: 'minicpm5-2b',
    choices: [{ finish_reason: 'stop', message: { content: '{"facts":[{"category":"Identificação","label":"Número da CAT","value":"CAT-TESTE-2026"}]}' } }],
  };
}

test('validação da conexão ngrok', { concurrency: false }, async (suite) => {
await suite.test('só marca OCR e MiniCPM como OK depois de validar OCR e JSON estruturado', async () => {
  seen.length = 0;
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, true);
  assert.equal(result.warning, undefined);
  assert.match(result.message, /OCR local leu a CAT de teste e MiniCPM extraiu seus dados em JSON/);
  assert.deepEqual(seen.map(({ path }) => path), [
    '/19202/health', '/19202/v1/ocr', '/19200/v1/models', '/19200/v1/chat/completions',
  ]);
  assert.ok(seen.every(({ key }) => key === 'test-router-key'));
  const ocrRequest = JSON.parse(seen.find(({ path }) => path === '/19202/v1/ocr').body);
  assert.equal(ocrRequest.pages[0].page, 1);
  assert.match(ocrRequest.pages[0].dataUrl, /^data:image\/png;base64,/);
  const miniRequest = JSON.parse(seen.find(({ path }) => path === '/19200/v1/chat/completions').body);
  assert.equal(miniRequest.model, 'minicpm5-2b');
  assert.deepEqual(miniRequest.chat_template_kwargs, { enable_thinking: false });
  assert.deepEqual(miniRequest.response_format, { type: 'json_object' });
});

await suite.test('não apresenta MiniCPM como OK quando o modelo listado falha na extração JSON', async () => {
  resetResponses();
  completionPayload.choices[0].message.content = 'Não consegui extrair o dado.';
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, true);
  assert.equal(result.warning, true);
  assert.match(result.message, /não concluiu a extração estruturada/);
  assert.doesNotMatch(result.message, /MiniCPM extraiu seus dados em JSON/);
});

await suite.test('aceita objeto de fatos completo cercado por prefixo e uma resposta duplicada', async () => {
  resetResponses();
  completionPayload.choices[0].message.content = 'Resultado: {"facts":[{"category":"Identificação","label":"Número da CAT","value":"CAT-TESTE-2026"}]} {"facts":[]}';
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, true);
  assert.equal(result.warning, undefined);
});

await suite.test('não apresenta OCR como OK quando a rota não reconhece o texto de teste', async () => {
  resetResponses();
  ocrPayload.extractedText = '';
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, false);
  assert.match(result.error, /não reconheceu o texto de teste esperado/);
  assert.equal(seen.some(({ path }) => path === '/19200/v1/chat/completions'), false);
});

await suite.test('mantém a chave salva e avisa se o MiniCPM não lista o modelo esperado', async () => {
  resetResponses();
  miniPayload = { data: [{ id: 'other-local-model' }] };
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, true);
  assert.equal(result.warning, true);
  assert.match(result.message, /MiniCPM indisponível/);
  assert.match(result.message, /other-local-model/);
});

await suite.test('recusa uma chave que falha em uma rota protegida mesmo com OCR disponível', async () => {
  resetResponses();
  miniStatus = 403;
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, false);
  assert.equal(result.invalidKey, true);
  assert.match(result.error, /rota protegida do MiniCPM/);
});

await suite.test('não aceita conexão sem o modelo OCR local esperado', async () => {
  resetResponses();
  ocrHealth = { ready: false, model: 'other-ocr' };
  const result = await validateRouterConfig({ key: 'test-router-key' }, { routerOrigin });
  assert.equal(result.ok, false);
  assert.match(result.error, /OCR local não está pronto/);
  assert.equal(seen.some(({ path }) => path === '/19202/v1/ocr'), false);
});
});
