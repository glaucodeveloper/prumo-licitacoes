# Prumo — Licitações

Painel local para organizar editais, propostas, itens e cotações, clientes e perfis empresariais da Construtora Confidence e da Isocon.

## Executar

Requer Node.js 20+, npm e Chromium/Google Chrome. O servidor local faz proxy do OpenJev e executa o agente de navegador.

```sh
cd outputs/prumo-licitacoes
npm install
OPENJEV_URL=http://127.0.0.1:8765 PORT=8877 npm start
```

`npm install` instala também as dependências do frontend. `npm start` compila o TypeScript antes de abrir o servidor. Para desenvolver a interface com recarga automática, execute `npm --prefix frontend run dev`; o Vite encaminha `/api`, `/vendor` e `/data` ao servidor local em `8877`.

Se não houver Google Chrome instalado, instale o navegador do Playwright:

```sh
npx playwright install chromium
```

Abra `http://127.0.0.1:8877`. Cadastros ficam no armazenamento local do navegador. PDFs de editais e documentos das empresas ficam no IndexedDB; JSON de captura, documentos baixados dos portais e o estado da agenda ficam em `data/captures/`.

## Captura de editais por CNAE

Na página **Editais**, a rotina automática é ativada por padrão quando o workspace conecta ao servidor. Ela consulta em segundo plano a cada 24 horas, mesmo com a aba fechada, desde que o processo Node.js continue rodando. É possível pausar, escolher 6/12/24 horas e salvar portais/período na própria tela. **Capturar agora** continua disponível para uma consulta imediata. A configuração e o último resultado ficam em `data/captures/background-automation.json`; após reiniciar, a agenda retoma pelo servidor.

Para login, abra **Conexões e memória → Acessos aos portais**. O Prumo abre uma janela do portal para a equipe autenticar-se diretamente. Após o login, clique em **Salvar sessão**. O Prumo não guarda a senha; salva cookies e estado da sessão em `data/portal-sessions/`, com acesso restrito à conta local, e reutiliza essa sessão nas consultas e downloads do mesmo domínio. Salvar a sessão dispara nova captura se a rotina estiver ativa. A pasta é excluída do Git. Sessões expiradas exigem novo login; CAPTCHA, MFA e outras verificações continuam manuais.

O coletor:

- Busca a listagem pública do [Comprasnet Bahia](https://comprasnet4.ba.gov.br/consultas/Licitacao/ListaEditais.asp) e lê detalhes públicos de cada processo.
- Abre a pesquisa pública do [Licitações-e](https://licitacoes-e2.bb.com.br/aop-inter-estatico/pesquisar-processo-publico) com Playwright, filtra Bahia, período e categorias indicadas pelo OpenJev, e percorre as páginas de resultado disponíveis.
- Consulta o [dataset diário de Licitações da Bahia](https://dados.ba.gov.br/dataset/licitacoes), baixa o `Licitacoes.zip`, cruza `VW_PROC_AQUISICAO_LIC_REQ.csv` com `VW_PROC_AQUISICAO_ITEM.csv` para filtrar pelos CNAEs usando a descrição real dos itens e gera o link oficial `https://comprasnet3.ba.gov.br/edital/{processo}.pdf` a partir de `Processo de Aquisição`. A tabela grande de itens é descompactada e percorrida em fluxo, sem manter o conteúdo inteiro em memória. O ZIP é armazenado em cache e atualizado quando o portal publica uma nova versão. Termos ambíguos são filtrados antes da triagem; cada lote aguarda até 185 segundos pelo OpenJev, e uma falha preserva os registros para revisão manual sem perder o edital baixado.
- Lê o CSV anual de [Licitações MG](https://dados.mg.gov.br/pt_BR/dataset/portal_licitacoes_mg), atualmente 2026, e usa os campos de abertura, situação, objeto e edital/retificação.
- Lê o CSV semanal de [Licitações SIGA RJ](https://dadosabertos.rj.gov.br/dataset/licitacao), com processo, objeto, status e prazo. Essa base não publica o link do PDF do edital; o Prumo mantém o link oficial da base e não fabrica link de documento.
- Consulta o [PNCP](https://pncp.gov.br/app/editais) pela API pública nacional de contratações com recebimento de propostas aberto. Percorre as modalidades e páginas nacionais dentro do prazo futuro selecionado (7, 14, 30 ou 60 dias) e cruza objeto e itens oficiais com os CNAEs verificados. Para candidatos compatíveis, lê itens e documentos nas APIs oficiais, monta o link direto do processo e baixa os anexos disponíveis. Se o PNCP responder HTTP 429, respeita `Retry-After` (ou aguarda 60 segundos quando o portal não informa prazo), tenta a página uma vez e interrompe as demais páginas bloqueadas; a coleta fica parcial e a próxima rotina reconsulta a listagem. O relatório resume o limite sem exibir o HTML de erro. A rotina é somente leitura e cobre os registros publicados no PNCP; não substitui avisos eventualmente ausentes do portal.
- Filtra as bases estaduais por prazo futuro (até 180 dias), objeto e CNAEs verificados. Os formatos são diferentes em cada estado; não presume um esquema comum. A pesquisa encontrou em Pernambuco uma exportação PEIntegrado identificada como 2025, por isso ela não entra na captura atual para evitar tratar dados históricos como oportunidade vigente.
- Usa OpenJev System One para escolher categorias permitidas da busca. Para cada edital candidato, o modelo NVIDIA configurado lê o PDF público ou os metadados e extrai propriedades estruturadas; o servidor envia esse JSON ao OpenJev para avaliar aderência CNAE/objeto, completude, CAT, urgência e revisão humana. CNAEs verificados, CATs e histórico da empresa entram como contexto.
- Inclui no radar apenas processos com prazo futuro e evidência textual ligada a CNAE verificado. CNAEs marcados **revisar** são ignorados. A captura guarda portal, URL, número, CNAEs associados, data e motivo textual em um JSON baixável na ficha do edital.
- Baixa documentos com links oficiais publicados pelas bases, restritos aos domínios de documentos configurados para cada fonte. Arquivos até 25 MB e PDF, ZIP, 7z, DOC/DOCX, XLS/XLSX, ODT ou RTF são salvos localmente e aparecem na ficha do processo. PDFs podem ser lidos no sistema; arquivos ZIP e 7z ficam disponíveis para download. A captura registra falhas de download e links sem arquivo reconhecível.
- PDFs baixados podem ser lidos na ficha: o navegador extrai até 300 páginas/80 mil caracteres e salva o original no IndexedDB local. Ao acionar **Ler com NVIDIA · estruturar no OpenJev**, o servidor envia o texto limitado ao modelo NVIDIA configurado, registra propriedades e passa esse JSON ao OpenJev System One. PDFs digitalizados sem texto não recebem OCR nesta etapa; a ficha registra essa lacuna e pede revisão humana.
- Atualiza capturas anteriores pelo identificador do processo. Editais importados aparecem com situação **Revisar** e mantêm o link da fonte oficial.

Enquanto a interface estiver aberta, ela consulta o estado do servidor e importa os resultados novos para o armazenamento local. Se a interface estiver fechada, o servidor continua capturando e salvando os dados; a tela os importa quando for aberta novamente. O estado da agenda pode ser consultado em `GET /api/automation/status`.

O Licitações-e limita a busca pública a 60 dias e 100 resultados por consulta. O painel sinaliza quando o limite impede a captura completa. O Comprasnet Bahia pode publicar objeto genérico; nesses casos a triagem descarta o registro sem correspondência CNAE clara. Se a página pública não expuser link de anexo, o sistema salva apenas os dados disponíveis e o link oficial. CAPTCHA, solicitação de login ou bloqueio encerram a automação e pedem intervenção humana. O agente não resolve CAPTCHA, não envia propostas e não altera processos.

## Fluxos incluídos

- Chat operacional com prompts de um clique para cruzar editais × CATs, comparar editais, identificar lacunas de acervo e analisar anexos em conjunto. Arrastar até cinco arquivos para o chat gera uma única consulta comparativa; a leitura mantém o nome do arquivo, método, limites e falhas de extração.
- Busca automatizada no PNCP nacional, em portais de licitação e bases estaduais de transparência da Bahia, Minas Gerais e Rio de Janeiro, classificada pelo OpenJev e filtrada por empresa/CNAE verificado.
- Triagem tipada pelo endpoint OpenJev `POST /v1/systemone`.
- Importação de PDF, extração de texto em até 300 páginas e leitura do arquivo original.
- Editais com leitura de detalhes/documentos, filtros por empresa, situação, prazo e CAT compatível com requisitos/itens de construção; avaliações e histórico de memórias por processo.
- Propostas com etapa, progresso, responsável e prazo.
- Itens e cotações: crie uma proposta de fornecedor vinculada ao item, informe preço, prazo e validade, anexe PDF/imagem e solicite leitura OCR no endpoint NVIDIA. A extração fica em rascunho e exige revisão humana antes de salvar. O original fica no IndexedDB do navegador e o texto reconhecido entra no contexto do assistente.
- Perfis de empresa com CNAEs editáveis, CATs, histórico de participação e área de arrastar/soltar documentos por empresa. Cada CAT é vinculada ao PDF de certificação técnica da empresa, fica na lista de documentos empresariais e pode ser aberta no edital; a leitura de texto do PDF entra no contexto do chat quando pertinente. Para marcar uma CAT como conferida, o PDF original precisa estar anexado. PDFs, DOCX e formatos de texto são indexados localmente para o chat.
- Memórias e rotinas editáveis armazenadas localmente no navegador.

Os editais iniciais são fictícios e aparecem separados como demonstração. Perfis, CATs, histórico, avaliações e memórias ficam no armazenamento local do navegador. O assistente usa o Metis-4B pela especialidade `prumo-licitacoes`, quando o serviço local está ativo. A correspondência de CAT compara palavras-chave cadastradas com itens e requisitos textuais do edital e exige pelo menos dois termos coincidentes em item/requisito. Isso não confirma autenticidade, quantitativos ou habilitação. Confira sempre o edital e o processo na fonte oficial.

## Conexões

Abra **Conexões e memória** na barra lateral.

- **OpenJev:** por padrão o Prumo encaminha `/v1/models` e `/v1/systemone` para `http://127.0.0.1:8765`. Mude `OPENJEV_URL` ao iniciar o servidor para usar outro endpoint local. Uma URL externa pode ser configurada no painel. O token, quando necessário, fica apenas na sessão.
- **Chat e memória:** Metis-4B é o modelo padrão para chat, propostas e leitura de documentos; a aplicação o acessa pelo serviço OpenJev em `http://127.0.0.1:8765/v1/metis/chat/completions`. A especialidade persistente do Prumo é `prumo-licitacoes`, separada da memória do Lumira. OpenJev System One atende a classificação estruturada. No chat, `/modelo qwen` inicia o serviço multimodal FreeToken; `/modelo metis` volta ao modelo principal. O contexto local e os trechos dos documentos entram na consulta.
- **Serviços locais:** `~/.local/bin/prumo-models start` inicia OpenJev e Metis; `~/.local/bin/prumo-models pause` interrompe ambos e descarrega os modelos da RAM/GPU; `~/.local/bin/prumo-models status` mostra o estado. As unidades `cognoscere-forge.service` e `cognoscere-system-model.service` ficam pausadas para não manter os serviços auxiliares do Lumira ativos.
- **OCR NVIDIA:** cotação e documentos soltos em qualquer área da página usam a configuração `NVIDIA_API_KEY`/`NVIDIA_NIM_API_KEY`, `NVIDIA_API_URL`/`NVIDIA_REASONING_API_URL` e o modelo `NVIDIA_RECORD_OCR_MODEL`, `NVIDIA_VISION_MODEL`/`NVIDIA_VLM_MODEL` ou `NVIDIA_REASONING_VISION_MODEL` do `.env` do BelaVista. O caminho pode ser definido por `BELAVISTA_ENV_PATH`; o padrão procura `~/dev/WWW/belavista-monitor/.env` e, se esse nome não existir, `~/dev/WWW/belavista-ai-monitor/.env`. A chave permanece no servidor. PDFs com texto pesquisável ainda podem ser enviados ao chat quando a chave não estiver configurada; OCR visual depende dela.
- **Nova cotação:** o formulário começa numa área ampla de anexo. Selecionar/soltar um PDF ou imagem inicia a leitura automaticamente e leva ao formulário para revisão; “Sem anexo” abre o formulário sem documento.
- **Leitura no chat:** solte PDF, imagem, DOCX ou arquivo de texto em qualquer outra área da página. O texto extraído localmente entra na conversa e segue para o modelo selecionado. Áreas próprias de documentos da empresa e da cotação mantêm seu destino específico.
- **Memória Metis:** os botões de carregar e consolidar chamam o proxy do OpenJev, que encaminha apenas para a especialidade do Prumo no Cognoscere. A chave de serviço permanece num arquivo local com permissão restrita.

As chaves da NVIDIA permanecem no servidor e não são devolvidas ao navegador.

## CNAEs iniciais

- **Confidence:** CNAE principal `4120-4/00` e atividades secundárias iniciais de construção/engenharia marcadas como verificadas. Confirme o comprovante oficial do CNPJ.
- **Isocon:** CNAE principal `4761-0/03` (papelaria). Os CNAEs secundários começam desmarcados para busca até validação documental.

Referências cadastrais preliminares: [Confidence](https://casadosdados.com.br/solucao/cnpj/confidence-construtora-ltda-28863854000110) e [Isocon](https://atlaspublico.com.br/empresa/47316277000191). Use comprovante oficial atualizado.

## Aplicativo Android

O aplicativo Android é construído com Capacitor 8. A tela local pede somente a chave do roteador; `@capacitor/preferences` a guarda no armazenamento privado do app. O runtime Capacitor abre o workspace remoto no WebView nativo e o plugin `PrumoConnection` envia o cabeçalho que evita a tela intermediária do ngrok. O endereço e a porta ficam configurados no projeto; a chave não está embutida no APK.

Para compilar uma nova versão, configure a assinatura local em `frontend/android/keystore.properties` (arquivo ignorado pelo Git) e execute:

```sh
cd frontend
npm install
npm run android:release
```

`npm run android:release` gera o bundle local da tela de conexão, sincroniza a plataforma Capacitor e compila o APK assinado em `frontend/android/app/build/outputs/apk/release/app-release.apk`. Preserve o keystore `~/.config/prumo/android-release.p12` para manter a identidade de assinatura. O workspace e as APIs continuam exigindo conexão ao servidor Prumo e ao túnel configurado.

## Arquivos

- `frontend/src/main.ts`: entrada TypeScript do frontend.
- `frontend/src/program.ts`: estado local, serviços, validações e orquestração dos fluxos.
- `frontend/src/components.ts` e `frontend/src/types.ts`: renderização formatada do assistente e contratos tipados.
- `frontend/src/app.css`: estilos do frontend; `frontend/index.html` é a entrada de desenvolvimento Vite.
- `frontend/dist/`: bundle de produção gerado por `npm run build:frontend`; o `index.html` raiz carrega esse bundle no servidor existente.
- `server.mjs`: servidor HTTP local, proxy OpenJev e adaptadores de captura.
- `package.json`: comandos do servidor e compilação do frontend; Playwright usado pelo agente de navegador.
- `vendor/pdfjs/`: PDF.js 6.4.299, licença Apache-2.0 em `vendor/pdfjs/LICENSE`.
- `SKILL.md`: instruções operacionais para triagem, portais, documentos e rotinas.
