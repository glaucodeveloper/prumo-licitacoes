'use strict';

const EXPECTED_OCR_MODEL = 'tesseract-lstm-por-eng-v1';
const EXPECTED_MINICPM_MODEL = 'minicpm5-2b';

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
  let health;
  try { health = await response.json(); }
  catch { return { ok: false, invalidKey: false, error: 'O serviço OCR respondeu em formato inválido.' }; }
  if (health?.ready !== true || health?.model !== EXPECTED_OCR_MODEL) {
    return { ok: false, invalidKey: false, error: 'A chave foi aceita, mas o serviço OCR local não está pronto com o modelo esperado.' };
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
      let payload;
      try { payload = await miniResponse.json(); }
      catch { miniCpmStatus = 'endpoint protegido respondeu JSON inválido'; }
      if (payload) {
        const models = [...(Array.isArray(payload.data) ? payload.data : []), ...(Array.isArray(payload.models) ? payload.models : [])];
        const ids = models.map((item) => String(item?.id || item?.model || item?.name || '').trim()).filter(Boolean);
        if (ids.some((id) => id.toLowerCase() === EXPECTED_MINICPM_MODEL)) {
          return { ok: true, invalidKey: false, message: 'Chave aceita. OCR local e MiniCPM responderam pelo roteador ngrok.' };
        }
        miniCpmStatus = ids.length
          ? `modelo ${EXPECTED_MINICPM_MODEL} não listado; modelos disponíveis: ${ids.slice(0, 6).join(', ')}`
          : 'endpoint protegido respondeu, mas não listou modelos';
      }
    }
  } catch (error) {
    miniCpmStatus = `sem resposta do endpoint protegido (${error.message})`;
  }
  return {
    ok: true,
    invalidKey: false,
    warning: true,
    message: `Chave aceita e OCR local respondeu. MiniCPM indisponível na porta 19200: ${miniCpmStatus}. A chave foi salva; confira o serviço MiniCPM no host do ngrok.`,
  };
}

module.exports = { validateRouterConfig };
