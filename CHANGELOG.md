# Histórico de versões

## 1.0.14 — 24 de outubro de 2026

- Evita reler páginas de CAT ao abrir documentos que já têm OCR salvo.
- Salva a CAT após OCR NVIDIA e organiza os dados-chave com MiniCPM em segundo plano.
- Adiciona editor de texto formatado para atividades e atalho do responsável técnico ao perfil profissional.
- Publica Setup e Portable Windows x64.

## 1.0.13 — 24 de outubro de 2026

- Usa o endpoint NVIDIA configurado para estruturar dados-chave das páginas de CAT.
- Preserva OCR e análises já salvas; não dispara reprocessamento automático de CATs existentes.
- Publica Setup e Portable Windows x64.

## 1.0.12 — 24 de outubro de 2026

- Prioriza NVIDIA na leitura OCR visual das páginas de CAT e usa Tesseract local como fallback quando a chamada NVIDIA falha.
- Texto curto ou vazio repete a tentativa NVIDIA antes de acionar o fallback local.
- Mantém a identificação do cache OCR estável para não reler CATs já processadas ao abrir.

## 1.0.11 — 24 de outubro de 2026

- A validação da chave executa uma leitura de imagem pelo OCR local e exige uma extração em JSON pelo MiniCPM antes de exibir sucesso.
- Se o MiniCPM estiver temporariamente indisponível, a chave permanece salva com aviso claro.

## 1.0.7 — 23 de outubro de 2026

- Verifica a chave ngrok e a saúde do OCR local em toda inicialização; pede outra chave se o roteador a rejeitar.
- Preserva a chave digitada no perfil local e repassa chave e endpoint ao backend Electron.
- Limpa cache HTTP, cookies e localStorage na primeira inicialização desta versão.

## 1.0.6 — 23 de outubro de 2026

- Corrige leitura e renderização de PDFs em versões do Chromium sem `Map.prototype.getOrInsertComputed`, incluindo a execução no worker.

## 1.0.4 — 23 de outubro de 2026

- Remove a confirmação de equipe do cadastro de CATs e elimina o campo legado de registros existentes.
- Atualiza automaticamente o acervo ao salvar ou editar uma CAT, sem fechar a revisão.

## 1.0.3 — 23 de outubro de 2026

- Remove registros e memórias fictícias do workspace inicial.
- Mostra o progresso de consulta aos portais oficiais e mantém fontes independentes em paralelo; uma fonte pendente ou bloqueada não pausa as demais.

## 1.0.0 — 23 de outubro de 2026

Primeira versão desktop do Prumo Licitações para Windows x64.

- Organiza editais, propostas, itens e cotações, clientes, CATs e perfis profissionais.
- Reúne chat com contexto documental, leitura de PDFs, rotinas e captura de editais.
- Usa OpenJev System One e o serviço local Metis para classificação e assistência.
- O assistente de conexão do desktop solicita somente a chave do roteador; endpoint e modelo ficam preconfigurados.
- Distribui instalador Windows (NSIS) e versão portátil.
