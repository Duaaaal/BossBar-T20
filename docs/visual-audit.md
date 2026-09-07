# Auditoria visual — trabalho não lançado

## Escopo

Revisão visual de 06/09/2026 no branch `feature/multiplayer-web`, preservando a versão `2.0.0-beta.3` e as funcionalidades em desenvolvimento. Nenhum commit, push ou incremento de versão faz parte desta revisão.

A inspeção combinou leitura dos componentes, capturas reais dos renderers Electron e navegadores e verificações automatizadas de limites, sobreposições e fluxos de interação. Foram utilizados perfis e encontros descartáveis; os encontros e arquivos do usuário não foram modificados.

## Padronização aplicada

- Tokens compartilhados para fontes de controles, foco de teclado, cores e bordas. Títulos ornamentais permanecem distintos de campos e valores; a linguagem escura, vinho, dourado e violeta foi preservada.
- Biblioteca de ataques: formulário sem fonte serifada, ações consistentes, busca com estado vazio, tags, divisão entre lista/editor, campos de resistência organizados, confirmação de exclusão e rodapé de salvar acessível em janelas estreitas.
- Mestre: cabeçalho sem quebra indesejada, botões de personalização organizados, biblioteca de ataques integrada à hierarquia visual, configurações e notas limitadas à área útil, rótulos de formatação agrupados com os respectivos campos e melhor leitura dos usuários cadastrados.
- Painel: modal de arsenal com cabeçalho, lista e rodapé bem delimitados; seleção de arma clara e botões coerentes com o restante dos controles.
- Editor de cena: arsenal em uma seção própria, sem ocupar indevidamente a grade da descrição; rádios, seletores, cartões de mídia, controles de áudio, fades, playlist e navegação de fases com espaçamento e tipografia consistentes. Conteúdo adicional permanece acessível por rolagem interna quando necessário.
- Jogadores: combate, ficha, notas e configurações com campos legíveis e limites de viewport; agrupamento de atributos e recursos no HUD; disposição compacta para grupos grandes, com espaço para os retratos; HUD sem ficha posicionado sem reservar uma área para um HUD próprio inexistente. Em resoluções menores, a barra do chefão não avança sobre o contador de turnos.
- Soundboard e biblioteca de encontros: controles acessíveis nos tamanhos mínimos; modais do soundboard com fechamento explícito; colunas compactas sem corte horizontal.
- Tooltips de controles: largura estável junto às bordas e fechamento ao clicar/abrir um modal, evitando avisos antigos sobre a nova janela.

## Verificação reproduzível

Resultado final local: lint e TypeScript aprovados; 189 testes unitários aprovados; 48 testes web aprovados (Chromium, Chrome e Edge) e 18 pulados pelos filtros já existentes de matriz; quatro testes Electron aprovados; empacotamento e `git diff --check` aprovados. Os testes não apontaram regressões nos cenários executados. Firefox não está incluído nesses números.

```powershell
npm.cmd run verify
npm.cmd run test:e2e:web
npm.cmd run test:e2e:electron
git diff --check
```

Os cenários novos em `tests/e2e/web/visual-layout.spec.ts` cobrem HUDs, combate, perícias, upload/edição de ficha, notas e preferências em 1280×720 e 960×640. O cenário de carga também confere a disposição de dez clientes em 960×540, incluindo retratos, HUDs e separação do contador de turnos. O limite de oito uploads por minuto por IP é preservado: oito clientes possuem ficha e dois exercitam os HUDs sem ficha.

O cenário `tests/e2e/electron/visual-layout.spec.ts` cobre launcher, mestre, painel, apresentação, biblioteca de ataques estreita/larga, configurações, notas, sons, oito fases, cutscene, playlist, arsenal, atributos, soundboard, biblioteca de encontros e depurador. Inclui a biblioteca com janela de 900 px e o soundboard com janela de 560×560.

As capturas são produzidas em `test-results/web` e `test-results/electron`. As referências de tela inteira do Chromium foram comparadas visualmente e atualizadas para a mudança intencional de disposição dos HUDs; a referência do conteúdo central de espera foi mantida.

## Limites da validação

- A simulação multiplayer é local, com clientes independentes, atrasos e reconexões simulados; não representa medição por túnel em redes residenciais reais.
- Firefox falhou antes de abrir a página tanto no ambiente local habitual quanto na tentativa isolada com Node 22.23.2. A referência de tela inteira do Firefox precisa ser atualizada em um ambiente funcional; o teste não foi removido nem sua referência foi fabricada. Ver `KNOWN-ISSUES.md`.
- O problema já conhecido de stutter de áudio permanece aberto; esta revisão não altera a lógica de reprodução nem declara o problema resolvido.
- Os testes verificam os cenários descritos, não todas as combinações possíveis de resolução, escala do sistema e conteúdo. A avaliação estética final continua sendo do usuário.

## Resumo sugerido em inglês — revisão visual

```text
Polish and standardize the encounter UI across Electron and web players

- Unify control typography, focus states, buttons, borders and spacing.
- Redesign attack-library editing with responsive panes and accessible save actions.
- Integrate phase arsenals, media controls and playlists into the scene-editor layout.
- Fix clipped dialogs, orphaned labels and stale control tooltips.
- Improve character HUD density, portrait spacing and turn-counter clearance.
- Refine master settings, notes, encounter tables and soundboard dialogs.
- Add viewport, overlap and screenshot checks for desktop windows and web clients.
```

As funcionalidades de ataques, resistências e loop individual que já estavam em desenvolvimento estão descritas em `attack-library-and-resistances.md`; devem integrar o resumo consolidado do próximo commit, sem repetir a sequência de ajustes intermediários de cada elemento.
