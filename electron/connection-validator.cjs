'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_OCR_MODEL = 'tesseract-lstm-por-eng-v1';
const EXPECTED_MINICPM_MODEL = 'minicpm5-2b';
const OCR_PROBE_TEXT = 'CAT-TESTE-2026';
const OCR_PROBE_IMAGE = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'fixtures', 'ocr-connectivity.png')).toString('base64')}`;

function responseError(response, payload, fallback) {
  return String(payload?.error?.message || payload?.detail || payload?.error || fallback || `HTTP ${response.status}`).slice(0, 260);
}

async function readJson(response) {
  try { return await response.json(); }
  catch { return null; }
}

function parseFacts(content) {
  const raw = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((part) => String(part?.text || '')).join('\n')
      : '';
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const isFacts = (value) => value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.facts);
  try {
    const value = JSON.parse(cleaned);
    if (isFacts(value)) return value;
  } catch { }

  // Models can repeat a complete JSON object or add a short prefix/suffix. Recover
  // the first complete object instead of rejecting otherwise usable facts.
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const value = JSON.parse(cleaned.slice(start, index + 1));
          if (isFacts(value)) return value;
        } catch { }
        start = -1;
      }
    }
  }
  return null;
}

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

function warning(message) {
  return { ok: true, invalidKey: false, warning: true, message };
}

async function validateRouterConfig(candidate, { routerOrigin, fetchImpl = fetch } = {}) {
  const headers = {
    'X-Port-Router-Key': candidate.key,
    'ngrok-skip-browser-warning': '1',
    accept: 'application/json',
  };
  let response;
  try {
    response = await fetchImpl(new URL('/19202/health', routerOrigin), {
      headers, signal: AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error',
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
  const health = await readJson(response);
  if (health?.ready !== true || health?.model !== EXPECTED_OCR_MODEL) {
    return { ok: false, invalidKey: false, error: 'A chave foi aceita, mas o serviço OCR local não está pronto com o modelo esperado.' };
  }

  let ocrProbeResponse;
  try {
    ocrProbeResponse = await fetchImpl(new URL('/19202/v1/ocr', routerOrigin), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'prumo-ocr-connectivity.png', pages: [{ page: 1, dataUrl: OCR_PROBE_IMAGE }] }),
      cache: 'no-store', redirect: 'error',
    });
  } catch (error) {
    return { ok: false, invalidKey: false, error: `OCR local está ativo, mas falhou ao ler a imagem de teste: ${error.message}` };
  }
  if (ocrProbeResponse.status === 401 || ocrProbeResponse.status === 403) {
    return { ok: false, invalidKey: true, error: `O roteador recusou a chave durante a leitura de teste do OCR (HTTP ${ocrProbeResponse.status}).` };
  }
  const ocrProbe = await readJson(ocrProbeResponse);
  if (!ocrProbeResponse.ok) {
    return { ok: false, invalidKey: false, error: `OCR local não concluiu a leitura de teste: ${responseError(ocrProbeResponse, ocrProbe, 'resposta inválida')}.` };
  }
  const recognizedText = normalized(ocrProbe?.extractedText);
  if (ocrProbe?.model !== EXPECTED_OCR_MODEL || !recognizedText || !recognizedText.includes(normalized(OCR_PROBE_TEXT))) {
    return { ok: false, invalidKey: false, error: 'OCR local respondeu, mas não reconheceu o texto de teste esperado.' };
  }

  let miniCpmStatus;
  try {
    const miniResponse = await fetchImpl(new URL('/19200/v1/models', routerOrigin), {
      headers, signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error',
    });
    if (miniResponse.status === 401 || miniResponse.status === 403) {
      return { ok: false, invalidKey: true, error: `O roteador recusou a chave na rota protegida do MiniCPM (HTTP ${miniResponse.status}).` };
    }
    if (!miniResponse.ok) {
      miniCpmStatus = `endpoint protegido respondeu HTTP ${miniResponse.status}`;
    } else {
      const payload = await readJson(miniResponse);
      if (!payload) {
        miniCpmStatus = 'endpoint protegido respondeu JSON inválido';
      } else {
        const models = [...(Array.isArray(payload.data) ? payload.data : []), ...(Array.isArray(payload.models) ? payload.models : [])];
        const ids = models.map((item) => String(item?.id || item?.model || item?.name || '').trim()).filter(Boolean);
        if (!ids.some((id) => id.toLowerCase() === EXPECTED_MINICPM_MODEL)) {
          miniCpmStatus = ids.length
            ? `modelo ${EXPECTED_MINICPM_MODEL} não listado; modelos disponíveis: ${ids.slice(0, 6).join(', ')}`
            : 'endpoint protegido respondeu, mas não listou modelos';
        }
      }
    }
  } catch (error) {
    miniCpmStatus = `sem resposta do endpoint protegido (${error.message})`;
  }
  if (miniCpmStatus) {
    return warning(`Chave aceita e OCR local reconheceu o texto de teste. MiniCPM indisponível na porta 19200: ${miniCpmStatus}. A chave foi salva; confira o serviço MiniCPM no host do ngrok.`);
  }

  let completionResponse;
  try {
    completionResponse = await fetchImpl(new URL('/19200/v1/chat/completions', routerOrigin), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: EXPECTED_MINICPM_MODEL,
        messages: [
          { role: 'system', content: 'Extraia fatos explícitos de uma CAT. Não invente nem complete lacunas. Responda somente JSON válido no formato {"facts":[{"category":"Identificação","label":"Número da CAT","value":"CAT-TESTE-2026"}]}.' },
          { role: 'user', content: `Texto OCR de uma CAT de teste:\n${String(ocrProbe.extractedText).slice(0, 1200)}\n\nExtraia dados-chave e inclua o número CAT-TESTE-2026 sem alterar o valor.` },
        ],
        temperature: 0,
        max_tokens: 256,
        stream: false,
        response_format: { type: 'json_object' },
        chat_template_kwargs: { enable_thinking: false },
      }),
      cache: 'no-store', redirect: 'error',
    });
  } catch (error) {
    return warning(`Chave aceita e OCR local reconheceu o texto de teste. MiniCPM não concluiu a prova de JSON: ${error.message}. A chave foi salva; confira o serviço MiniCPM no host do ngrok.`);
  }
  if (completionResponse.status === 401 || completionResponse.status === 403) {
    return { ok: false, invalidKey: true, error: `O roteador recusou a chave durante a prova de extração do MiniCPM (HTTP ${completionResponse.status}).` };
  }
  const completionBody = await readJson(completionResponse);
  if (!completionResponse.ok) {
    miniCpmStatus = `prova de JSON respondeu HTTP ${completionResponse.status}: ${responseError(completionResponse, completionBody, 'sem detalhes')}`;
  } else {
    const content = completionBody?.choices?.[0]?.message?.content;
    const facts = parseFacts(content)?.facts || [];
    const hasProbeFact = facts.some((fact) => normalized(fact?.value).includes('cat-teste-2026'));
    if (!hasProbeFact) {
      const preview = (typeof content === 'string' ? content : JSON.stringify(content || '')).slice(0, 140).replace(/\s+/g, ' ');
      miniCpmStatus = `respondeu, mas não concluiu a extração estruturada (finish_reason=${completionBody?.choices?.[0]?.finish_reason || 'ausente'}${preview ? `; ${preview}` : ''})`;
    }
  }
  if (miniCpmStatus) {
    return warning(`Chave aceita e OCR local reconheceu o texto de teste. MiniCPM indisponível para extração estruturada: ${miniCpmStatus}. A chave foi salva; confira o serviço MiniCPM no host do ngrok.`);
  }
  return { ok: true, invalidKey: false, message: 'Chave aceita. OCR local leu a CAT de teste e MiniCPM extraiu seus dados em JSON.' };
}

module.exports = { validateRouterConfig };
