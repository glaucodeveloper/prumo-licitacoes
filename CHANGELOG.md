# Histórico de versões

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
