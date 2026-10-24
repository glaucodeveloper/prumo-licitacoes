'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  const existing = await window.prumo.getConfig();
  $('target').textContent = `${existing.remoteUrl} · OCR CAT na porta 19202 · MiniCPM na porta 19200 · chave validada automaticamente ao iniciar`;
  if (existing.startupNotice) {
    $('error').textContent = existing.startupNotice;
    $('error').style.color = existing.startupNotice.includes('MiniCPM indisponível') ? '#f2c879' : '#ff9292';
  }
  $('key').required = !existing.keyConfigured;
  $('key').placeholder = existing.keyConfigured ? 'Chave salva; deixe vazio para manter' : 'Cole apenas a chave';
  $('validate').addEventListener('click', async () => {
    $('error').textContent = '';
    $('validate').disabled = true;
    $('validate').textContent = 'Testando conexão...';
    try {
      const result = await window.prumo.validateConfig({ key: $('key').value });
      if (!result.ok) throw new Error(result.error || 'Falha na validação.');
      $('error').textContent = result.message;
      $('error').style.color = result.warning ? '#f2c879' : '#9ee0b0';
    } catch (error) {
      $('error').textContent = error.message;
      $('error').style.color = '#ff9292';
    } finally {
      $('validate').disabled = false;
      $('validate').textContent = 'Testar chave, OCR e MiniCPM';
    }
  });
  $('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('error').textContent = '';
    $('error').style.color = '#ff9292';
    $('save').disabled = true;
    $('save').textContent = 'Validando e abrindo...';
    try {
      const result = await window.prumo.saveConfig({ key: $('key').value });
      if (!result.ok) throw new Error(result.error || 'Falha ao salvar');
      if (result.warning) {
        $('error').textContent = result.message;
        $('error').style.color = '#f2c879';
        $('save').textContent = 'Prumo aberto · MiniCPM indisponível';
      }
    } catch (error) { $('error').textContent = error.message; }
    finally {
      $('save').disabled = false;
      if (!$('error').textContent.includes('MiniCPM indisponível')) $('save').textContent = 'Salvar e abrir Prumo';
    }
  });
})();
