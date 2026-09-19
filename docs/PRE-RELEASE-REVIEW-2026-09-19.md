# Revisão dos fluxos principais — 19/09/2026

Repositório existente, branch `feature/multiplayer-web`, base Git `309f04c`, versão mantida em `2.0.0-beta.4`. As alterações anteriores foram preservadas. Esta revisão não publica uma versão nem confirma execução do CI remoto.

**Complemento posterior:** instalação limpa e atualização desde 1.5.2 foram aprovadas no GitHub Actions; o CI remoto mantém quatro falhas no Firefox. Consulte [CI, instalação e atualização](CI-INSTALLATION-REVIEW-2026-09-19.md) para os resultados atuais e a recomendação de corrigir antes do lançamento.

## Correções encontradas na revisão

1. **Combate com fichas antigas aprovadas:** o servidor enviava uma lista vazia de efeitos para fichas sem o novo contexto de perícias. Isso recusava ataques e testes comuns. A lista vazia agora usa o total aprovado; efeitos não cadastrados continuam recusados. Regressão em `skill-automation.test.mjs` e fluxos de combate do servidor.
2. **Apresentação iniciada antes do acesso:** a divisão de módulos da compilação podia carregar antecipadamente o módulo do jogador, cujo código montava a interface como efeito colateral. A montagem passou a ser explícita: após a sessão estar pronta na web e pela entrada própria no Electron. O cenário de compatibilidade verifica que a cena não existe antes de concluir o acesso.
3. **Clique de atributo perdido ao sair da identidade:** a atualização no evento `change` reconstruía os botões durante o clique que tirava o foco do nível. A atualização agora acompanha a entrada dos dados. A regressão verifica imediatamente que Constituição passa a −1 e que a distribuição completa consome os dez pontos.
4. **Bônus indevido ao completar o nível importado:** o cálculo podia deduzir uma diferença usando nível ausente como base, conservando essa diferença quando o nível correto era preenchido. A reconciliação agora aguarda um nível válido. Há teste de preservação do total e ausência de bônus duplicado.
5. **Preparação do Electron para testes:** o Forge pode restaurar arquivos de desenvolvimento depois de empacotar. O comando de E2E agora extrai somente a compilação `.vite/build` e `.vite/renderer` do ASAR antes dos testes, evitando depender de um antigo `localhost:5173`. Perfis reais continuam separados dos perfis descartáveis.

Os testes antigos foram atualizados para os controles atuais: treinamento sem checkbox, quarto atalho de efeitos no HUD, Defesa somente leitura e fechamento separado de salvar. A ficha sintética antiga passou a informar seletores de atributos, treinamento obrigatório de Fortitude e carga coerente. Isso mantém as verificações reais de importação, migração e aprovação, sem reduzir as regras do aplicativo.

## Evidência desta revisão

| Verificação | Resultado |
| --- | --- |
| Suíte completa de regras, servidor e persistência, após as correções | **343/343 aprovados**, sem pulos |
| ESLint e TypeScript | Aprovados |
| Chromium | **54 cenários distintos aprovados** ao longo da revisão; falhas investigadas e reexecuções direcionadas após correções |
| PDFs reais de Nimb | Furacão Imortal, Hudson, Thok e Pythagoras: importação, correção e reabertura aprovadas |
| Edge | **12/12 aprovados**, sem retries |
| Firefox | **12/12 aprovados**, sem retries, fora do sandbox do agente |
| Electron com compilação de produção e perfis descartáveis | **7/7 aprovados**; abertura integrada repetida com sucesso após o empacotamento final |
| Loop de Ludwig no Chrome for Testing | **Aprovado**: 160,21 s observados, uma inicialização, zero reinícios, 57/57 amostras pós-loop com sinal |
| Compilação web e pacote de produção | Aprovados |
| `npm audit --omit=dev` | **0 vulnerabilidades conhecidas** nas dependências de produção consultadas |

Cobertura: criar acesso e reconectar; três fichas e aprovação da troca em combate; criação, importação, edição, descarte, migração e exportação editável; atributos e fontes de perícias; catálogo e variantes; ataques simples e duplos, modificadores, resistências, cura e aprovação; RD e imunidade; privacidade, turnos e presença; dez jogadores; notas e retratos; biblioteca, fases, cutscenes, retomada de encontros, preload e áudio. Capturas e verificações de limites cobrem HUDs, ficha, ataques, magia, itens, modais e painéis do mestre, incluindo telas estreitas. Isso é cobertura dos cenários existentes, não certificação de todas as combinações de regras dos livros.

As tentativas iniciais também ficam registradas: 13 falhas no primeiro Chromium e três falhas Node motivaram investigação de defeitos e fixtures desatualizadas. O primeiro Firefox falhou ao criar páginas dentro do sandbox, antes de acessar o aplicativo; a execução autorizada no host passou. O primeiro Electron usou a compilação de desenvolvimento restaurada pelo Forge; os sete casos passaram com os arquivos do pacote. Uma abertura web retornou 404 numa execução intermediária; não se repetiu na reexecução, e sua causa não foi estabelecida. Não foi removida nenhuma asserção para ocultar esse episódio.

## Artefato e reprodução

Pacote: `out/BossBar - Tormenta20-win32-x64/`.

ASAR final verificado: 28.878.829 bytes, 2.262 entradas, SHA-256 `d894fffaa466f14892feae06d78843c6e3157123afdbd6ea2c317a4c8bc324cd`. As proteções de fuses do executável foram mantidas, incluindo integridade do ASAR e restrição de carregamento ao ASAR. Os testes de janelas usam o runtime de desenvolvimento do Electron com o código extraído desse pacote; não desativam os fuses do executável distribuído.

A atualização imediata de nível, PV/PM e classe única recebeu uma última verificação dirigida junto da distribuição de atributos: seis casos aprovados, dois em cada navegador (Chromium, Edge e Firefox). O pacote foi recompilado depois desse ajuste; não houve necessidade de repetir os cenários de mestre que não dependem dele.

Os logs desta execução estão em `C:/Users/Brian/Documents/Codex/2026-09-06/lei/release-*.log`; a auditoria está em `release-audit.json`. Capturas e traces locais estão em `test-results/release-review-*`. Os arquivos pessoais de referência não foram adicionados ao repositório.

A faixa real `Ludwig fase 2.mp3` tem 146,8865 s. O teste atravessou a primeira volta e observou o trecho posterior com PCM no grafo de áudio. O resultado cobre continuidade e ausência de reinício nessa execução; não mede o driver, a saída física ou a transmissão do Discord.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build:web:test
npx.cmd playwright test --config=playwright.web.config.mts --project=chromium --workers=1 --retries=0
npm.cmd run test:e2e:electron
```

Para repetir a mídia real, definir `BOSSBAR_REAL_LOOP_MEDIA` com o caminho local e executar apenas `real-music-loop` no projeto `chrome`. Os projetos de navegador devem executar em sequência, sem recompilar a pasta web usada por uma sessão ativa. Consultar também `TESTING-STRATEGY.md`.

## Limites antes da publicação

- Os microcortes continuam abertos em `KNOWN-ISSUES.md`. Medição de PCM e eventos não substitui a escuta no dispositivo do jogador e no Discord. A transição real cutscene → fase não recebeu nova medição física nesta revisão.
- Instalação/atualização sobre uma versão anterior, assinatura e CI remoto não foram executados nesta tarefa. O empacotamento local foi validado; nenhuma publicação foi realizada.
- O 404 isolado merece monitoramento numa sessão de homologação. Não há reprodução suficiente para atribuir sua causa à aplicação ou ao ambiente.

## Complemento: matriz obrigatória e preparação do commit

A revisão pré-versão passa a ser requisito permanente em `AGENTS.md`, `RELEASE-CHECKLIST.md` e `TESTING-STRATEGY.md`. O CI web foi dividido por navegador, com no máximo dois jobs simultâneos, sem retries. O YAML e a seleção de projetos foram conferidos localmente; o CI remoto continua pendente de publicação autorizada do commit.

A nova matriz cria salas de **1, 3, 5 e 10 jogadores**, cada qual com acesso independente e ficha persistida própria. As fichas sintéticas representam guerreiros de nível 1, Constituição 1 e Força 2, com armas e RD diferenciadas. Importação real, outras classes, níveis, fontes e progressões permanecem cobertos pela revisão anterior e pela suíte de regras. O preparo dos perfis ocorre antes de abrir o servidor e não desativa proteções de upload.

Cada participante entra pela interface, rola iniciativa, aguarda seu turno real, realiza ataque com modificadores de dados e números, solicita aprovação, rola dano, recebe dano físico reduzido pela própria RD e solicita cura para o próximo jogador (ou para si na sala individual). As expectativas são aritméticas independentes: PV 20 + 1, PM 3, ataque 4 + 5 + 2 + 4 + 1 = 16, dano 4 + 2 + índice + 4 − 1, dano recebido 11 − RD e cura 2 × 4 + 1 = 9, limitada ao PV máximo. O teste confere consumo de ação, manutenção de PM, rejeição de aprovação repetida, privacidade das fichas, ausência de pendências e preservação de PV após sair/reautenticar.

Duas hipóteses incorretas do teste novo foram corrigidas: recarregar a página exige autenticar novamente; iniciativas iguais exigem desempate. A matriz passou a usar iniciativas distintas e a completar o login de retorno. Nenhuma regra da aplicação foi relaxada para acomodar esses testes.

A suíte Node foi executada novamente com cobertura: **343/343 aprovados**, zero pulos; cobertura do conjunto configurado de servidor/transporte: **68,34% linhas, 78,35% ramos e 77,88% funções**, acima dos gates existentes. ESLint e TypeScript aprovados. Os cenários de Electron, PDF real, áudio e empacotamento já aprovados nesta mesma revisão foram preservados: este complemento altera testes, documentação e CI, sem mudança de comportamento da aplicação.

### Resultado final da matriz

| Navegador | Salas 1 / 3 / 5 / 10 | Resultado |
| --- | --- | --- |
| Chromium | 4 cenários | 4/4 aprovados |
| Chrome for Testing | 4 cenários | 4/4 aprovados |
| Edge | 4 cenários | 4/4 aprovados |
| Firefox | 4 cenários | 4/4 aprovados |

**16/16 aprovados, sem retries ou pulos**, totalizando 76 participações com ficha própria, 76 ataques e 76 solicitações de cura. Chromium concluiu em 2,0 min; os outros três projetos, executados em sequência, em 6,6 min. A execução de Firefox ocorreu no host, devido à incompatibilidade já identificada com o sandbox do agente. Logs: `release-matrix-verified.log`, `release-matrix-browsers.log` e `release-coverage-final.log`, no diretório de trabalho da conversa informado acima.

A revisão do índice Git confirmou ausência de manuais completos, perfis, credenciais reconhecíveis, executáveis e logs no commit. O PDF adicionado é o template vazio solicitado, e o vídeo adicionado é uma fixture sintética dos testes. `git diff --cached --check` aprovado. O lockfile permaneceu inalterado.

## Parecer para a próxima versão

- **Correção obrigatória no código:** nenhum novo defeito bloqueante confirmado após as correções e as verificações descritas. Os gates locais aprovados permitem registrar o trabalho em commit.
- **Antes de publicar:** conferir instalação/atualização em ambiente descartável e CI remoto; realizar uma sessão curta de escuta com Ludwig e transição de fase no equipamento dos jogadores. O áudio segue como problema conhecido, sem alegação de solução definitiva. Se a repetição travada retornar, investigar antes do lançamento.
- **Pode aguardar a próxima versão:** expansão da automação integral de poderes/magias e outras melhorias de conveniência já fora deste escopo. Não são necessárias para os fluxos aprovados aqui.
- **Monitoramento:** registrar horário, navegador e rota caso o 404 isolado volte a ocorrer; não foi reproduzido de forma suficiente para atribuir uma causa.

Este parecer aprova o commit local do trabalho revisado, mas não declara a publicação concluída nem substitui as verificações externas pendentes. A versão permanece `2.0.0-beta.4`, sem tag ou push nesta tarefa.
