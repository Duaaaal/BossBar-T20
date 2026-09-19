# CI, instalação e atualização — 19/09/2026

O primeiro CI do commit `43596af` foi consultado no run `35469997975`. Regras, tipos, cobertura e pacote foram aprovados. O Electron revelou dependências indevidas dos testes no computador do mantenedor: navegador Chromium ausente no job integrado, consulta de um manual local não disponível no runner e uma asserção que exigia caber integralmente um formulário rolável numa tela de 720p. As verificações foram corrigidas preservando acesso ao PDF por range, alcance dos controles e limites do contêiner.

O teste de ducking também capturava rampas de todos os canais: a transferência do decodificador nativo para o loop decodificado inclui uma rampa legítima para zero. A sonda agora identifica o AudioParam do ducking e exige redução, restauração e ausência de mute nesse mesmo canal. O código de áudio não foi alterado nesta tarefa.

Validação local inicial: três cenários Electron e dois cenários de áudio (Chromium e Chrome) aprovados, sem retries; TypeScript, ESLint dos testes alterados, parser PowerShell, sintaxe JavaScript e YAML aprovados.

O CI seguinte mostrou também que o job Electron precisava compilar explicitamente o cliente web usado pelo teste integrado. A consulta de versão do instalador foi movida da janela inicial para o mestre, respeitando a restrição de APIs por janela. O editor de perícias do chefão tinha largura mínima implícita e cortava campos em 514 px: a grade agora encolhe, reorganiza as colunas e permite rolagem vertical. A seleção de atributos no teste usa o controle HTML, sem depender do popup nativo do sistema operacional.

## Instalação real em ambiente descartável

A matriz Chrome revelou uma busca redundante de perfil quando a notificação da troca de personagem chegava depois da resposta HTTP. A notificação identifica agora a ficha selecionada, evitando buscar novamente o perfil já recebido. O teste mantém a exigência de zero buscas adicionais. Os testes também aguardam a interface reconhecer o turno e a navegação do leitor de PDF; a criação de acesso aguarda conclusão explícita, sem iniciar outro login após um prazo arbitrário de 1,5 segundo. Oito cenários Chrome (incluindo salas de 1, 3, 5 e 10 jogadores) e oito testes de fichas passaram localmente, sem retries.

`scripts/test-installed-upgrade.ps1` recusa execução fora de runners Windows hospedados pelo GitHub. O job gera o instalador a partir do pacote já verificado, instala do zero, confere registro no Windows, executável, atualizador e interface; depois instala a versão pública `1.5.2`, atualiza para a versão do checkout e confere preservação das notas tanto no arquivo quanto na interface do mestre.

A versão `1.5.2` é a única release pública com instalador disponível no momento desta consulta. Seu SHA-256 publicado é verificado antes da execução: `d0602a0ddab2579839772dd2f8b4947d4b0f1dbf4da7a6d57ef8d2abeb5be64d`. Isso não equivale a testar atualização a partir de todas as versões intermediárias. A versão do projeto continua `2.0.0-beta.4`.

A interface instalada é inspecionada pelo protocolo Chromium local, mantendo os fuses de produção. Não se habilita Node no executável nem se modifica o ASAR. Dados usados são sintéticos; a instalação e os perfis reais do mantenedor não são tocados.

## Evidência remota confirmada

Commit de código testado: `24f2e92b372fc502d98488a9cfa4ebd2882ba928`.

Execução: https://github.com/Duaaaal/BossBar-T20/actions/runs/35471762375

- Qualidade: 343 testes unitários aprovados, lint e tipos aprovados, cobertura de linhas 68,31%, ramos 78,35%, funções 77,88%; auditoria de produção sem vulnerabilidades.
- Electron: sete cenários aprovados, sem retries.
- Chromium: 57 aprovados e dois pulos previstos, sem retries.
- Chrome: 48 aprovados e 11 pulos previstos, sem retries.
- Edge: 48 aprovados e 11 pulos previstos, sem retries.
- Firefox: 52 aprovados, quatro falhas e três pulos, sem retries. O resultado global do CI é **falha**.
- Instalação limpa: aprovada; aplicativo e renderizadores ativos, registro do Windows, atualizador e versão conferidos.
- Versão pública 1.5.2: instalação e abertura aprovadas.
- Atualização para 2.0.0-beta.4: aprovada; interface do mestre acessível e notas preservadas.
- Preservação: um arquivo de notas em um único perfil; SHA-256 inalterado e conteúdo conferido pela API da janela do mestre.

O artefato `bossbar-disposable-package` contém `installation-report.json` com as quatro etapas aprovadas. A grafia `2.0.0-beta4` no relatório é a versão de diretório normalizada pelo Squirrel; a API do aplicativo confirmou `2.0.0-beta.4`. Não foi criada tag nem publicada release.

Os pulos incluem mídia e PDFs reais não enviados ao CI, além de cenários executados somente no projeto Chromium. Isso não substitui escuta da mídia da mesa ou inspeção dos manuais locais.

## Pendências antes do lançamento

O job Firefox `105973881300` manteve quatro falhas:

1. `cutscene-resume.spec.ts:143`: o ganho do áudio do vídeo permaneceu em 1 quando deveria cair abaixo de 0,001 após silenciar o vídeo.
2. `cutscene-resume.spec.ts:381`: o contexto de áudio compartilhado foi preservado, mas estava `suspended`, não `running`, após a troca de faixa.
3. `release-room-matrix.spec.ts:135`, três jogadores: o cenário excedeu 120 s durante a recarga para conferir reconexão, depois das verificações de combate, cura e privacidade.
4. `release-room-matrix.spec.ts:49`, dez jogadores: o nome do personagem não apareceu no HUD próprio dentro do prazo de 12 s durante a entrada dos participantes.

`AudioEndpointBuilder` e `Audiosrv` foram confirmados em execução no runner. Isso não eliminou as falhas de áudio. Os três cenários de `cutscene-resume.spec.ts` passaram no Firefox local nesta tarefa; a diferença entre ambientes ainda exige investigação. Não há evidência suficiente para atribuir as quatro falhas exclusivamente ao ambiente ou ao aplicativo. As asserções foram mantidas e não foram acrescentados pulos ou retries para ocultar falhas.

**Avaliação: corrigir antes de lançar.** Instalação e atualização estão aprovadas no cenário descrito, mas a compatibilidade remota de Firefox ainda não está aprovada. Também permanece necessária a escuta de Ludwig e das transições no equipamento dos jogadores, conforme a revisão anterior. Nenhuma release foi publicada.
