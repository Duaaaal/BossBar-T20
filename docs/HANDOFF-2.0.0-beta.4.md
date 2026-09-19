# BossBar - Tormenta20 — relatório de continuidade para outra conversa Codex

Data da conferência: **06/09/2026**, horário de referência **America/Sao_Paulo**.
Base de código conferida: **2.0.0-beta.4**, commit **309f04c**, branch **feature/multiplayer-web**.

> **É o mesmo projeto, no mesmo repositório e computador, continuado em outra conversa. Não é uma solicitação para criar um projeto novo, clonar outra cópia, reconstruir o aplicativo ou reimplementar funcionalidades existentes.**
>
> Leia este relatório, confira o checkout real e continue sobre ele. As mensagens antigas descrevem muitas iterações: a implementação atual e as decisões finais prevalecem sobre pedidos intermediários já substituídos.

## 1. Mensagem pronta para iniciar a próxima conversa

Copie esta mensagem e anexe este documento e o inventário complementar:

> Vamos continuar o mesmo projeto BossBar - Tormenta20 desenvolvido na conversa anterior, no diretório C:\Users\Brian\Documents\Interface chefões (Janela)\boss-battle. Não crie outro projeto nem reinicie o desenvolvimento. Leia docs/HANDOFF-2.0.0-beta.4.md e docs/HANDOFF-TECHNICAL-INVENTORY-beta.4.md, confira Git, package.json, scripts, documentação e o código atual. A base deste relatório é 2.0.0-beta.4, commit 309f04c, branch feature/multiplayer-web. Preserve master, o modo local/offline, a identidade visual, as APIs isoladas por janela, a privacidade dos jogadores e a sincronização Electron/web. Não altere versão, publique, dê commit ou push sem o pedido correspondente. O stutter de áudio e a incompatibilidade local do Firefox continuam pendentes; não os declare resolvidos pelos testes existentes. Aguarde meu próximo pedido de alteração depois de entender o contexto.

## 2. Identidade, objetivo e direção do produto

- Nome público: **BossBar - Tormenta20**.
- Nome npm: **bossbar-t20**.
- Autor e responsável pelas decisões: **Brian Nascimento**.
- Projeto independente de fã, voltado para Tormenta20, especialmente a edição **Jogo do Ano**.
- Código sob **MIT**, com LICENSE no repositório.
- Desenvolvimento explicitamente assistido por ferramentas de IA. Não ocultar esse fato na documentação pública.
- MIT do código não transfere automaticamente direitos sobre marcas, manual, ficha e outras mídias de terceiros.
- Não é uma ferramenta oficial ou endossada pela Jambô.
- Objetivo: permitir ao mestre preparar e apresentar encontros cinematográficos, com chefões, fases, cutscenes, música, SFX, condições, turnos e interação dos jogadores.
- A apresentação audiovisual da luta é central. Controles, avisos e HUDs não devem desnecessariamente encobrir o espetáculo.
- O aplicativo não se tornou obrigatoriamente online. Existem dois caminhos complementares:
  1. **Local/offline:** mestre controla o app e transmite somente a janela de apresentação por Discord ou ferramenta equivalente.
  2. **Multiplayer web:** mestre hospeda temporariamente no próprio computador; jogadores entram por navegador e interagem com seus personagens.
- Não há objetivo de manter servidor BossBar permanente, assinaturas ou infraestrutura paga obrigatória.
- Jogadores não precisam instalar Electron. Contas multiplayer são locais ao mestre, não uma conta central global.
- Habilidades de classe, poderes comprados e automação extensa de magias ainda são evolução futura, não um catálogo integral já implementado.

## 3. Diretórios e ambiente

### Diretórios principais

- Workspace externo: `C:\Users\Brian\Documents\Interface chefões (Janela)`
- **Raiz verdadeira do repositório e do package.json:** `C:\Users\Brian\Documents\Interface chefões (Janela)\boss-battle`
- Não executar npm start apenas na pasta externa: isso causa ENOENT por ausência de package.json.
- `src/`: código.
- `src/shared/`: tipos, regras, validação e algoritmos reutilizáveis.
- `src/multiplayer/`: servidor, segurança, autenticação, persistência de usuários, PDF e túnel.
- `assets/`: recursos internos empacotados.
- `tests/`: testes unitários e integrações.
- `tests/e2e/`: Playwright web/Electron, fixtures de sessão e snapshots.
- `docs/`: relatórios, resumos de release e problemas conhecidos.
- `scripts/`: make, geração de fixtures, processamento de ícones e smoke do túnel.
- `.github/workflows/`: CI.
- `node_modules/`, `.vite/`, `out/`, `coverage/`, `playwright-report/`, `test-results/`: dependências/saídas geradas, não editar como fonte.
- Também existem pastas pessoais `Imagens/`, `Icones/`, `Musica/` e `SFX/`. Não presumir que seu conteúdo deve ser distribuído.

### Ambiente verificado

- Windows, PowerShell, desenvolvimento para Windows x64.
- Node local: **v24.18.0**.
- npm local: **12.0.2**.
- packageManager declarado: **npm@12.0.2**.
- Usar `npm.cmd` e `npx.cmd` se a execução dos wrappers .ps1 for bloqueada.
- Não alterar a política de execução global do computador.
- Caminhos têm espaços, acentos e parênteses. Usar aspas e, para operações PowerShell, preferir -LiteralPath.
- Não foram encontrados AGENTS.md na raiz do repo nem na pasta imediatamente superior nesta conferência. Uma nova conversa deve conferir se surgiram instruções depois.

### PDFs fornecidos por Brian como referência

- `C:\Users\Brian\Desktop\Backup\Pasta_de_tudo\RPG\Ficha_T20_v.2.0.pdf`
- `C:\Users\Brian\Desktop\Backup\Pasta_de_tudo\RPG\T20 - Livro Básico - Jogo do Ano.pdf`
- Cópia editável distribuída pelo app: `assets/ficha-t20-v2-editavel.pdf`.
- Consultar o manual fornecido ao implementar regras novas; não inferir que todas as regras solicitadas anteriormente são reprodução literal do manual. Há decisões personalizadas, especialmente pontos de ação/heróicos.
- Não distribuir o livro integral, copiar um catálogo protegido inteiro ou enviar o PDF privado a serviços externos sem autorização.

## 4. Git, branches, releases e continuidade

### Estado conferido

- Remote origin: **https://github.com/Duaaaal/BossBar-T20.git**
- Branch atual: **feature/multiplayer-web**.
- HEAD: **309f04c — Version 2.0.0-beta.4 - attack library, validated sheets and encounter polish**.
- Tag local: **v2.0.0-beta.4**.
- Versão package.json e as duas referências da raiz do package-lock.json: **2.0.0-beta.4**.
- master local: **37421ce — Updated README**.
- Antes de criar estes documentos de passagem, o checkout estava limpo.
- Na conferência, a referência local origin/feature/multiplayer-web também apontava para 309f04c, sem indicação de ahead/behind.
- **Isso não comprova consulta atual ao GitHub:** a tentativa de git ls-remote falhou por indisponibilidade de conexão a github.com:443 neste ambiente.
- O commit da versão foi criado na conversa anterior **sem push feito pelo assistente naquele turno**. A referência remota local pode ter sido atualizada por ação posterior do usuário/ferramenta.
- Não presumir que GitHub Release, instalador anexado ou tag remota foram publicados. Conferir antes de qualquer ação de distribuição.

### Convenção de trabalho

- master permanece como linha principal pública/estável da série local.
- feature/multiplayer-web é a branch explicitamente autorizada para a continuação 2.x multiplayer.
- A antiga preferência por manter somente master foi substituída especificamente pela autorização posterior deste branch multiplayer.
- Não criar uma branch nova para cada ajuste visual ou funcional.
- Não fazer merge de multiplayer em master automaticamente.
- Não apagar branches ou tags, nem reescrever histórico, como parte de uma alteração comum.
- Não alterar a versão a cada prompt: Brian pede o lançamento quando está satisfeito.
- O próximo nome de versão só deve ser definido quando ele solicitar/autorizar. Não antecipar beta.5.
- Resumo de commit em inglês, consolidando mudanças líquidas desde o release anterior. Não listar cada tentativa intermediária de um mesmo elemento.
- `docs/COMMIT_SUMMARY.md` contém o resumo consolidado do beta.4.
- Commit, push, tag e publicação de GitHub Release são operações distintas. Não confundir.
- Em futuras alterações, preservar os commits/tags de versões já lançadas.

### Histórico recente

- 309f04c — beta.4: biblioteca de ataques, resistências, revisão visual, PDF, enquadramento e controle offline.
- aefab91 — beta.3: checkpoints completos, cutscenes e refinamento multiplayer.
- e780fb9 — sincronização/merge de histórico remoto multiplayer.
- 3de39a4 — hardening de fichas multiplayer, compatibilidade e performance.
- cc114c5 — beta.2: apresentação de combate sincronizada.
- 038b907 — expansão de apresentação de combate multiplayer.
- 5c9f549 — primeira beta multiplayer.
- 995f114 — alpha.3.
- Há tags históricas de v0.1.0 a v1.5.2, mais v2.0.0-beta.3 e v2.0.0-beta.4. Não inventar tags de versões intermediárias que não constam no Git.

### Mecanismo da versão

- O app consulta `app.getVersion()` por IPC validado.
- A linha de autoria/versão deve acompanhar package.json, não uma string duplicada fixa no React.
- `scripts/make.mjs` busca o último assunto de commit que casa com `Version X.Y.Z[-prerelease]`.
- Se a versão desse commit divergir de package.json, make aborta, orientando a corrigir a versão.
- Por isso manter o assunto de release começando com `Version 2.0.0-beta.N`.
- Um commit de documentação normal não deve fingir ser outro release.

## 5. Dependências e tecnologias

Valores abaixo são os declarados no package.json conferido. O lockfile é a referência para as resoluções exatas quando há ^.

| Componente | Versão declarada | Função |
| --- | --- | --- |
| Electron | 43.1.1 | Runtime desktop, BrowserWindow, IPC, protocolos locais |
| Electron Forge CLI/maker-squirrel/plugin-fuses/plugin-vite | ^7.11.2 | Desenvolvimento, empacotamento, instalador e hardening |
| @electron/fuses | ^1.8.0 | Fuses de segurança do pacote |
| React / React DOM | ^19.2.7 | Interfaces e renderer compartilhado |
| TypeScript | ^5.9.3 | Tipagem e código fonte |
| Vite | 8.1.5 | Build e servidor de desenvolvimento |
| @vitejs/plugin-react | 6.0.3 | Integração React/Vite |
| Fastify | 5.12.1 | HTTP temporário do host |
| @fastify/helmet | 13.1.0 | Cabeçalhos de segurança |
| @fastify/rate-limit | 11.1.0 | Limitação de requisições |
| @fastify/static | 10.1.2 | Cliente web estático |
| Socket.IO / socket.io-client | 4.8.3 | Eventos e estado multiplayer |
| Zod | 4.4.3 | Validação de estruturas e checkpoints |
| music-metadata | 11.14.0 | Metadados/duração de áudio |
| pdf-lib | 1.17.1 | Leitura, edição e regravação de AcroForms |
| electron-squirrel-startup | ^1.0.1 | Integração de instalação Windows |
| @playwright/test | 1.61.1 | Testes de browsers e Electron |
| c8 | 12.0.0 | Cobertura |
| ESLint | ^8.57.1 | Análise estática |
| @typescript-eslint/parser e eslint-plugin | 8.64.0 | ESLint TypeScript |
| eslint-plugin-import | ^2.32.0 | Regras de import |
| @types/react / @types/react-dom | ^19.2.17 / ^19.2.3 | Tipos React |
| @types/electron-squirrel-startup | ^1.0.2 | Tipos de startup |

- Override atual: `@electron/node-gyp: 10.2.0-electron.2`.
- `.npmrc`: `strict-allow-scripts=true`.
- Allowlist de instalação atual: `electron-winstaller@5.4.4: true`.
- Não transformar a allowlist em permissão genérica.
- `private: true` no package.json impede publicação npm acidental; não significa que o GitHub seja privado nem revoga a licença MIT.
- O projeto não precisa de banco SQL, backend SaaS, conta Cloudflare ou serviço de pagamentos para o fluxo normal atual.
- Não instalar novos pacotes quando os recursos existentes bastarem.

## 6. Arquitetura geral e fonte de autoridade

### Desktop

- `src/main.ts` é o processo principal: gerencia janelas, estado do encontro, biblioteca, persistência, protocolos de mídia, IPC, ações do mestre, fases/cutscenes e integração com servidor.
- Ainda é um arquivo grande. Há modularização importante, mas não é correto dizer que a aplicação inteira está dividida em módulos pequenos.
- `src/shared/api.ts`: contrato BossAPI.
- `src/shared/preload.ts`: whitelist por RendererRole.
- `src/preload.ts` e `src/preload-*.ts`: pontes isoladas por janela.
- Autoridade do mestre reside no main e nas rotas/serviços internos autorizados, não em dados arbitrários enviados pelo renderer.

### Multiplayer

- `src/multiplayer/session-server.ts`: servidor autoritativo da sala, sessões, HUDs, turnos, aprovações, ataques, resistências e sincronização.
- `session-roster.ts`: presença, nomes e estado de conexão.
- `session-security.ts`: credenciais temporárias e proteção de conexões.
- `player-profile-store.ts`: contas/fichas/retratos/notas locais ao host.
- `character-sheet-pdf.ts`: parsing, documento editável e validação.
- `public-presentation.ts`: projeção pública, remoção/redução de dados administrativos e reescrita de mídia.
- `quick-tunnel.ts`: download validado e ciclo de vida do cloudflared.
- `web-player.ts`: entrada/autenticação, menus e ferramentas do navegador.
- `web-player-api.ts`: adaptação de eventos/estado da rede para a apresentação compartilhada.
- `player.tsx`: apresentação React usada tanto no Electron quanto no navegador.
- **Espelho visual não significa permissão idêntica:** o mestre vê valores administrativos; jogadores recebem sua visão permitida.
- Não resolver privacidade escondendo apenas CSS. Verificar também payloads, tooltips, históricos e projeção por destinatário.
- Não enviar um checkpoint completo ao cliente: contém dados locais/privados e possivelmente PDFs incorporados.

### Fluxo conceitual

1. Usuário atua em um renderer.
2. Comando passa por IPC limitado ou evento autenticado.
3. Main/servidor valida papel, posse, turno, ficha bloqueada, recursos, alvos e fórmulas.
4. Quando necessário, aguarda decisão do mestre.
5. Só então rola dados e aplica regra/estado autoritativo.
6. Eventos e snapshots são publicados em ordem, com revisões/identificadores.
7. Clientes preparam mídias e apresentam resultado/efeitos conforme a sequência compartilhada.
8. Persistência/checkpoint/undo/histórico devem acompanhar a mudança quando aplicáveis.

## 7. Janelas e responsabilidades

### Tela inicial — launcher

- Novo encontro, Carregar encontro, Hospedar encontro.
- Carregar desabilitado se biblioteca vazia.
- Progresso de preparação da hospedagem.
- Não restaurar os textos introdutórios antigos removidos.
- Fonte: launcher.tsx / launcher.css / launcher.html / preload-launcher.ts.

### Janela do mestre — controles globais

- Cabeçalhos BossBar para Tormenta20 e Controle do mestre, alinhamento final à esquerda.
- Abrir janela de apresentação; desabilitado/Janela já aberta se existente.
- Mostrar/esconder HUD.
- Blackout/liberar blackout; saída sempre acessível quando ativo.
- Iniciar/encerrar batalha.
- Resetar: diferencia reset total dos padrões do app e reset do encontro ao seu baseline inicial.
- Voltar à tela inicial encerra encontro e hospedagem, com aviso quando necessário.
- Personalização de cena/editor de cena.
- Customização de sons.
- Biblioteca de encontros e biblioteca de ataques.
- Configurações, mute universal, notas e debugger.
- Sessão hospedada: link, contagem/ping, abrir como jogador, solicitações de entrada.
- Administração de contas, fichas, senha e exclusão confirmada.
- Categoria Jogadores: pontos, aprovações e controle de personagens desconectados.
- Autoria e versão no rodapé, sem grande espaço vazio.
- Botões de sessão/fundo/biblioteca usam estilo consistente e predominantemente contorno, com exceções de ação principal/aplicar/remover.
- A antiga janela de trilha geral e seu botão foram substituídos pelo editor/playlists e soundboard; não recriá-los por causa do histórico.

### Apresentação dos jogadores — Electron

- Renderer audiovisual principal.
- No aplicativo, visão administrativa do mestre: não esconder valores por modo privado.
- Fundo/espera, chefões, personagens, condições, resultados, turnos, efeitos e cutscenes.
- Pode executar ações de personagens controlados pelo mestre e resolver resistências autorizadas.
- A versão web compartilha renderer, mas com permissões e ferramentas de usuário.

### Painel acoplado do mestre

- Janela separada, sem barra nativa de título, colada abaixo da apresentação.
- Mesma largura, sem gap visual.
- Movimento, minimizar/fechar e foco coordenados com a apresentação.
- Não oferecer fechamento independente do painel; botão de minimizar/restaurar compacto.
- Ícone final de minimizar: traço, não os antigos ><.
- Windows admite uma janela foreground por vez; a coordenação de propriedade/foco foi ajustada cuidadosamente. Não tentar simplesmente alternar focus() em loop.
- Cantos/borda nativa/DWM tiveram várias correções; manter solução atual em main.ts, não remover frame arbitrariamente.
- Não maximizar a apresentação. Redimensionamento proporcional pelos cantos, com mínimos legíveis e ajuste ao monitor atual.
- Referência preferida do conteúdo de apresentação: largura1280 em16:9 (1280×720). O conjunto real é recalculado para caber com o painel, moldura nativa e workArea; não fixar o conjunto inteiro em1280×720 sem ler o algoritmo. Limites superiores externos:1920×1040.
- Constantes atuais em main.ts: largura mínima de conteúdo960, painel minimizado32px, painel expandido mínimo390/preferido420/máximo470px, orçamento de moldura48px e sobreposição de acoplamento1px. São parâmetros do algoritmo responsivo, não garantia de tamanho absoluto em qualquer monitor.
- Não confundir esses limites externos com resolução de mídia 1920×1080.
- Painel inteiro precisa continuar visível, sem cortar descrição/status/soundboard ao reduzir.
- Não usar proteção global de captura: ele pode ser capturado separadamente. O isolamento na transmissão vem de compartilhar somente a janela de apresentação.

Conteúdo:
- Abas de até três chefões.
- Vida atual/máxima e contador de turno com elementos estáveis.
- Ícone de avançar/iniciar turno, não contador redesenhado a cada aba.
- Dano/cura/full heal com valor calculado entre parênteses.
- Campo de fórmula/valor que mantém expressão de dados.
- Checkbox RD; não restaurar botão separado Dano sem RD.
- Alterar perícias, escudo com aplicar, arsenal e ataque selecionado.
- Dano em jogador com modal de alvos e modo área dentro dele.
- Teste de perícia, com leitura dos valores; edição é em Alterar perícias.
- Status, duração/dano, aplicar/remover e alvos.
- Descrição, ação padrão e ação grave.
- Música da fase, volume/mute/loop e acesso emergencial à playlist.
- Soundboard com atalhos/volume/mute/loop.
- Configuração de um novo chefão só o revela depois de aplicar/salvar dados.

### Outras janelas

- Editor de cena.
- Biblioteca de encontros.
- Biblioteca de ataques independente desde beta.4.
- Soundboard.
- Debugger do encontro.
- Títulos no padrão “[nome da janela] - BossBar T20”.
- Cada janela tem preload com escopo próprio, não o BossAPI inteiro.

## 8. Identidade visual e convenções de interface

- Tema escuro de fantasia, bordas e acentos dourados/vermelhos, coerente com Tormenta20 e BossBar.
- Tipografia, tamanho de campos, foco, modais e botões padronizados em ui-theme.css e CSS dos componentes.
- Não alterar o visual do HUD para simplificar implementação funcional.
- Números sem spinners/setas nativas de incremento/decremento em todo o app.
- Tooltips próprios, acima de outras camadas, com fundo semiopaco e limite da viewport.
- Não usar title nativo para informações importantes já cobertas pelo sistema de tooltip.
- Modais fecháveis precisam de X visível e dentro do canto superior direito.
- Notificações em fila, sem sobreposição; dourado para avisos comuns, vermelho para graves.
- Solicitações persistentes aguardam decisão, enquanto avisos comuns expiram e/ou podem ser dispensados.
- Elementos desabilitados cinzentos/opacos, com explicação curta quando apropriado.
- Menus de perícias usam grade/tabela legível, não lista estreita com scroll inútil.
- Perícias treinadas têm destaque dourado sutil; treinamento não pode desalinha-las.
- Estilos responsivos devem ser testados em várias proporções; não basta screenshot da tela grande.
- Scrollbars estilizadas para o tema; evitar aspecto nativo destoante.
- Fundo de espera interno usa waiting-background.png, com vinheta escura pulsante. As antigas variantes coloridas foram descartadas.
- Barra do chefão sem extremidades ornamentadas extras e sem fogo na derrota.
- Derrota sem descrição visível não deve aguardar animações de elementos invisíveis.

## 9. Chefões, atributos, dano e condições

### Chefões

- Até três simultâneos; estado próprio por chefão.
- HUDs empilhados; com mais chefões, escala ajustada (decisão histórica final: redução de 15% por chefão adicional) e barra proporcional.
- Mortos saem do empilhamento depois da apresentação de derrota; vivos ocupam espaço e redimensionam.
- Ressuscitado retorna à ordem e escala correspondentes.
- Nome fixo, não deslocar quando aparecem condições.
- Campos internos ainda podem usar attack/rangedAttack; rótulos atuais são **Luta/Pontaria**.
- Defesas CaC/AaD distintas, RD e escudo.
- Modal Alterar perícias usa base e overrides individuais; mexer na base atualiza herdados em tempo real, salva ao aplicar.
- RD padrão zero.
- Não remover campos legados apenas por não aparecerem atualmente na UI; podem ser usados em saves.
- Visor de PV numérico do chefão é opcional, padrão desmarcado.

### Dano, cura e escudo

- Dano direto, cura, full heal e expressões compostas.
- Formato de dano parcelado total/parcelas é distinto de ataques múltiplos da biblioteca.
- RD opcional, cálculo de parcelas e mínimo por golpe seguem calculateHealthSequence e testes.
- Barra vermelha reage, amarela mantém rastro de dano e converge; cura tem verde imediatamente e vermelho alcança depois.
- Sequências rápidas não devem apagar o rastro acumulado.
- Números flutuantes com dano real e identificação do status/ator quando aplicável.
- Escudo acima de zero bloqueia golpe comum, perde durabilidade por golpe e torna barra metálica.
- Cura continua possível com escudo.
- Dano periódico de status ignora escudo.
- Quebra gera partículas metálicas; ícone some abaixo de 1.
- Durabilidade perdida tem -1 flutuante próximo ao ícone.
- O antigo crítico baseado em perder >10% da vida em um golpe foi removido: impacto crítico depende do evento crítico real.

### Catálogo de condições

36 ícones:
Abalado, Agarrado, Alquebrado, Apavorado, Atordoado, Caído, Cego, Confuso, Debilitado, Desprevenido, Doente, Em chamas, Enfeitiçado, Enjoado, Enredado, Envenenado, Esmorecido, Exausto, Fascinado, Fatigado, Fraco, Frustrado, Imóvel, Inconsciente, Indefeso, Lento, Ofuscado, Paralisado, Pasmo, Petrificado, Sangrando, Sobrecarregado, Surdo, Surpreendido, Vulnerável e Coringa.

- 36 recortes transparentes em assets/status-icons; textos inferiores da imagem original não fazem parte do ícone.
- Painel mostra ícones em duas fileiras.
- HUD limita uma fileira de condições a dez e acrescenta linhas acima, sem deslocar nome.
- Tooltip tem ícone ampliado, nome, resumo, duração, fórmula e mínimo/máximo do dano em linha separada.
- Valores semânticos coloridos: dano, perícia, PM e duração.
- Campo dano habilitado apenas para condição pertinente.
- Parser aceita múltiplos dados e +/-; não eval.
- RNG autoritativo com fonte criptográfica, testes com RNG injetável.
- Evoluções somam turnos das aplicações e eliminam combinações incompatíveis, por exemplo Abalado → Apavorado.
- Cego, Exausto, Fatigado, Inconsciente, Paralisado etc. podem aplicar condições dependentes.
- Cálculos automáticos desligados não desligam evolução/incompatibilidade.
- Ataques/Luta/Pontaria/perícias/defesas/RD podem ter derivados; vermelho para perda, verde para bônus.
- RD, escudo e defesas não negativam nos derivados do chefão; perícias/ataques podem.
- Efeitos restritos a determinadas perícias são apresentados em “Perícias afetadas”, não aplicados indiscriminadamente à base.
- Conferir status-rules.ts para relações e precedências exatas; nem todo texto descritivo implica automação completa de deslocamento, ações ou regras narrativas.
- Coringa abre biblioteca de condições personalizadas com nome/descrição, atributos afetados e condições adicionais. Duração/dano podem ser preenchidos ao aplicar.
- CustomStatusLibraryStore persiste presets. Não substituir presets por catálogo temporário em memória.

## 10. Turnos, rolagens e combate interativo

### Turnos

- Encontro começa em turno/rodada zero.
- Iniciativa é rolada por cada participante; não voltar a rolar tudo automaticamente.
- Jogador usa seu HUD; mestre gerencia chefões/NPCs.
- Iniciativa: d20 + perícia, ordenação decrescente, desempate pela perícia e rerrolagens quando necessário.
- Iniciativa inicial não tem sucesso/falha automáticos por natural 1/20.
- Só liberar primeiro turno depois de todas as iniciativas necessárias.
- Rodada avança após completar a volta dos participantes, não a cada criatura.
- Contador e tooltip “Ordem de turnos” na apresentação.
- Mestre pode avançar turno com confirmação quando pertinente; jogador só encerra próprio turno.
- Se ações do jogador já acabaram, não exigir confirmação adicional inútil.
- Chefão ativo seleciona automaticamente sua aba no painel.
- Personagens que entram atrasados dependem de aprovação; primeiro têm oportunidade limitada de iniciativa após a ação/turno atual, e só agem normalmente no próximo ciclo elegível.
- Desconexão não deve remover furtivamente o personagem da luta.
- Turno/ação manual necessária de desconectado pausa até reconexão, expulsão ou controle pelo mestre.

### Ações

- Bolinhas: livre azul, movimento verde e padrão vermelho-alaranjado.
- Brilho somente no turno do participante e quando disponível.
- Tooltip informa ação indisponível após consumo.
- Ataques consomem ação padrão.
- Testes comuns de perícia consomem padrão; sem padrão/fase imprópria podem exigir autorização.
- Resistências solicitadas pelo jogo são exceções: não gastam padrão e podem ocorrer fora do turno.
- Antes da iniciativa, apenas iniciativa é liberada normalmente; outras perícias pedem autorização ao clicar, não cursor de proibido.
- Ataque pode abrir modal sem ação padrão, mas não ser executado.
- Edição/revisão pendente de ficha bloqueia ações autoritativamente.
- Mestre recebe confirmação para intervir fora do turno do chefão.
- Recursos não podem ser consumidos/rolados antes da decisão final exigida.

### Resultados e privacidade

- Apresentação de fórmula com cada grupo de dados e seus resultados, modificador e total.
- Resultados privados escondem modificadores/totais como ???, mas mostram dados.
- Valor final de dano causado continua público.
- Mestre na apresentação Electron pode ver todos os valores.
- Resultado inclui alvo e identificação do teste.
- Numeração # por ordem, sem caixa decorativa exagerada; reinicia no novo turno conforme sistema.
- Resultados correlacionados têm ícone de corrente; hover destaca os relacionados, sem tooltip redundante.
- Resultado de chefão acima do nome à esquerda; resultado de jogador abaixo do HUD.
- Resultados permanecem até o turno relevante e desaparecem com fade.
- Natural 1/20 pulsa vermelho/verde quando essa classificação é aplicável.
- Não exibir notificações extras apenas repetindo o resultado numérico já visível.

### Regras de acerto e crítico

- Regra geral de teste com dificuldade: 20 natural sucede, 1 natural falha, demais passam se total >= CD/Defesa.
- **Margem de ameaça não é acerto automático.** Precisa acertar a defesa e estar na margem, exceto natural 20.
- Arma fornece margem e multiplicador. Default crítico x2, não o antigo valor incorreto 20.
- Chefões têm arsenal configurável; considerar a arma selecionada, não fórmulas antigas fixas.
- Ataque bem-sucedido cria **dano pendente**, sem rolar dano automaticamente.
- Botão de causar dano próximo ao HUD, abaixo do ícone de combate do dono quando jogador.
- Dano pendente deve ser resolvido uma única vez, mesmo com cliques/reenvios.
- Crítico multiplica os dados pertinentes e mostra dados adicionais no cálculo.
- Som de rolagem não deve sobrepor o impacto na etapa de dano.

### Pontos de ação/heróicos

- Novos personagens começam com um de cada; máximo cinco pontos de ação e um heróico.
- Mestre concede e retira, com notificação ao dono.
- Não exibir recursos privados para outros jogadores.
- No HUD próprio: indicadores de cinco PA e um PH, ativos/ofuscados conforme saldo e tooltips de quantidade.
- Uso de PA requer aprovação; negar não deve rolar nem consumir.
- Um PA por ação individual; podem existir usos em ações diferentes no mesmo turno.
- Intervenção adiciona dado ao teste; proteção dá bônus temporário de defesa; rerrolagem é limitada por teste; recuperação usa patamar.
- Recuperação implementada: nível 1–4, 2d8+2 PV e 1d4+1 PM; 5–10, 4d8+4 e 2d4+2; 11–16, 6d8+6 e 3d4+3; 17+, 8d8+8 e 4d4+4.
- Extrema vantagem heróica segue a regra personalizada pedida por Brian: rola dois d20, soma limitada a 20 e interpreta como um resultado efetivo de d20, inclusive crítico/natural conforme implementação. Não trocar silenciosamente por “pegar o maior”.
- PH também pode ser consumo narrativo de poder.
- PA e PH não são combinados na mesma escolha opcional.
- Explicações dos recursos aparecem nas opções do dropdown.
- Extrema vantagem em chefão exige aviso narrativo específico.
- Não assumir que esses recursos são a totalidade das regras oficiais de classe.

## 11. Biblioteca de ataques e resistências — beta.4

- Janela própria aberta pelo mestre, com seleção contextual no editor/painel.
- Persistência de até 500 registros.
- Nome, teste Luta/Pontaria, bônus, dano, número de ataques (1–20), margem, multiplicador, tipo, alcance, tags e efeitos on-hit.
- Tags organizam e filtram; não bloqueiam uso por outro chefão/fase.
- Chefão/fase recebe cópia independente, não referência viva que altera retrospectivamente ao editar biblioteca.
- Ataques múltiplos: determinar cada acerto de cada alvo primeiro; depois etapa de danos individuais.
- Não confundir múltiplos ataques com dividir um único total.
- On-hit pode exigir teste/CD para resistir condição, duração e dano periódico.
- Resistências manuais por padrão, botão no HUD do dono e alternativa de mestre.
- Configuração pessoal permite novas resistências automáticas.
- Pendências bloqueiam avanço de turno e são salvas no checkpoint.
- Player não recebe identificadores privados de resistência de outro.
- Bônus extras do jogador são separados da base de arma/ficha, que é somente leitura.
- Alteração do par de bônus requer aprovação do mestre; mesmos bônus já aprovados não repetem solicitação, inclusive trocando arma.
- Autoridade calcula arma/fórmula a partir da ficha, não confia na fórmula base enviada pelo navegador.
- Opções de tipo de dano: Ácido, Corte, Eletricidade, Essência, Fogo, Frio, Impacto, Luz, Perfuração, Psíquico e Trevas.
- Opções de alcance: Adjacente, Pessoal, Toque, Curto (9m), Médio (30m), Longo (90m), Ilimitado, Raio, Cone, Linha, Cilindro, Esfera, Quadrado e Cubo.
- Áreas podem ter medida inteira em metros.
- Aliases inequívocos legados são normalizados; valores ambíguos não devem ser adivinhados.
- Punhos são ataque padrão disponível, salvo desativação pelo mestre. Implementação base 1d3 + Força, impacto, adjacente, não letal, crítico20/x2, com ajuste de dado por tamanho.

## 12. Personagens, HUD e sobrevivência

### HUD

- Cada jogador vê seu HUD no alto à direita e demais participantes adjacentes.
- Retrato do próprio no alto à direita; retratos dos demais no alto à esquerda.
- Retrato parcialmente fora do HUD, mas sem cortar na viewport ou sobrepor botões.
- Placeholder ? sem imagem; clique amplia a imagem.
- Retratos são públicos mesmo quando os valores da ficha são privados.
- Modo privado marcado por padrão; outros veem nome/status e ??? nos campos privados.
- Dono e mestre veem dados completos.
- PV/PM, HP temporário, valores de Luta/Pontaria e defesas via ícones.
- Defesas CaC/AaD separadas com tooltip curto.
- Derivados positivos verdes, negativos vermelhos.
- Lista expandida acima das demais camadas, com atributos, perícias, ataques, classe/nível, PV/PM/defesa, deslocamento, tamanho e carga.
- Tooltips mostram origem/cálculo, não longas justificativas de design.
- Status acima do HUD.
- HUD morto cinza/rachado.
- Desconectado cinza com “Aguardando reconexão”.
- Ações e recursos visíveis conforme dono/terceiro/mestre; não duplicar ícones laterais de PA/PH antigos.

### PV temporário e vida negativa

- PV temporário absorve dano antes dos PV comuns.
- Excesso sobre máximo é apresentado como barra azul com direção própria.
- PV pode negativar.
- Em zero ou menos: incapacitação/inconsciência, indefeso, sangramento e derivados de defesa/reflexos.
- Teste de Constituição CD15 estabiliza; falha perde 1d6.
- Cura efetiva de pelo menos 1PV interrompe sangramento.
- Outro personagem pode usar padrão e Cura CD15 para estabilizar.
- Morte em `min(-10, -ceil(PVmax/2))`, conforme implementação.
- Morte não é revertida pela cura comum; intervenção/debugger é outra via administrativa.
- Condições temporárias não reescrevem atributos permanentes no PDF.
- Mudanças permanentes de vida/mana/dados devem ser refletidas no editor/ficha autoritativa.

## 13. Fichas PDF, edição, rascunhos e aprovações

### Importação

- Modelo distribuído: assets/ficha-t20-v2-editavel.pdf, duas páginas, 332 campos canônicos AcroForm, 333 widgets.
- Modelo já foi inspecionado em campos e renderizado na validação anterior. Não foi feita nova renderização para este relatório.
- Botão “Baixar ficha vazia” junto ao upload.
- X vermelho tanto no arquivo escolhido quanto na ficha vinculada, com confirmação da remoção.
- Abrir para ajustar só disponível com ficha/importação aplicável.
- Acesso à ficha por rota/ticket autenticado; não abrir file:// arbitrário do PC do jogador.
- O navegador não fornece acesso permanente livre ao arquivo original escolhido no computador. O editor interno trabalha com a cópia importada e dados do host.
- Limite PDF: 25MB; retrato PNG/JPEG/WebP: 5MB. Não confundir com 100MB de mídia audiovisual.
- Ignorar antiga escala de atributos; modificadores são os atributos efetivos usados para Jogo do Ano.
- Não corrigir automaticamente a velha escala como se fosse o sistema atual.

### Campos do editor

Categorias/ filtros combináveis e cores discretas, com grupos contíguos:
- Personagem: identidade, raça, origem, classe, nível, divindade, atributos/modificadores e retrato.
- Combate: PV atual/máximo/temporário, PM atual/máximo, defesa logo após vitais, ataques, armaduras e escudos.
- Perícias: meio nível, atributo, treino, outros e total; checkbox junto ao nome; ofícios com seleção quando aplicável.
- Itens/inventário: quantidade/peso, carga atual/máxima e levantar.
- Magia: atributo-chave, modificadores, teste e lista dinâmica com nome/escola/execução/alcance/área/duração/resistência/efeito.
- Descrição, habilidades de raça/origem, habilidades de classe/poderes e demais campos suplementares.
- Identidade compacta; nível em espaço curto.
- Atributos com cabeçalho e valores/modificadores em linhas correspondentes.
- Perícias divididas em dois lados com divisor.
- Ataques iniciam com duas linhas, adicionáveis.
- Armaduras/escudos adicionáveis, mínimo um de cada.
- Itens mínimo três linhas; cálculo de carga por quantidade e peso.
- Magias dinâmicas; não restaurar lista fixa de vinte linhas.
- Defaults: PV temporário0, outros0, XP0, crítico x2.

### Aprovação transacional

- Uma sessão de edição é **uma solicitação**, não uma solicitação a cada tecla.
- Ao terminar/fechar, mudanças pertinentes seguem ao mestre.
- Se reverter integralmente ao estado inicial, não pedir aprovação.
- Mestre vê diff de campos e pode aprovar/rejeitar.
- Enquanto editor estiver aberto ou revisão pendente, personagem não age.
- Notificação na tela principal, não escondida dentro do editor; legível e sem sobrepor outras.
- Rejeição preserva valores aceitos; aprovação aplica estado consistente e sincronizado.

### Rascunho local

- Recuperação implementada em character-sheet-draft.ts e web-player.ts.
- localStorage do navegador, versionado e limitado: 512KiB, expiração de sete dias.
- Validar identidade/base do rascunho, não aplicar dados de outro usuário/ficha.
- É recuperação de edição, não aprovação automática.
- Remover rascunho quando descartado/obsoleto/concluído conforme fluxo.
- Armazenamento de navegador é por origem: mudança de URL aleatória do túnel limita recuperação entre origens diferentes. Não prometer portabilidade automática de localStorage entre túneis.

### Validação reforçada no beta.4

- Documento compatível com erros fica **staged**, não substitui a ficha aceita.
- Campos vermelhos com erro; conclusão bloqueada enquanto houver erros.
- Servidor repete validação final; não confiar apenas em disabled no cliente.
- Correções matemáticas inequívocas podem ser automáticas; tipo/alcance desconhecido requer escolha humana.
- Validação cobre obrigatórios, inteiros, limites, fórmulas, perícias, defesas, tipos, alcances e crítico.
- +5 legado, x3, acentos/caixa e aliases seguros são tratados.
- PV negativo válido.
- Campos Jogador legado só aparecem quando precisam de correção.
- Diferenças possíveis por raça/poder/exceção podem ser aviso, não erro bloqueante.
- PDF achatado/digitalizado sem campos não tem OCR e não vira ficha válida automaticamente.
- Scripts embutidos no PDF não são executados pelo parser.
- Isso não é antivírus de PDF nem validação de todos os poderes oficiais.
- Tests/player-profile.test.mjs e import-and-media-fit.spec.ts cobrem leitura, staging, descarte, correção incompleta rejeitada, reparo e validação final.

## 14. Notas, histórico e undo

### Notas

- Mestre e jogadores têm bloco de notas; recursos de jogador só em multiplayer.
- Texto rico simples: tamanho, negrito, itálico, sublinhado e lista numerada.
- Markdown e painel de preview separados foram removidos.
- Abas nomeadas por campo Título; adicionar/fechar e salvar.
- Limpar com confirmação.
- Modal arrastável pelo topo, redimensionável por lados/cantos, com mínimo legível.
- Não escurecer o fundo nem fechar ao perder foco.
- Elementos internos proporcionais, botões salvar/limpar alinhados.
- notes-html.ts sanitiza conteúdo permitido.
- Nome de armazenamento master-notes.md é legado; não inferir interface Markdown pelo sufixo.

### Histórico

- FightHistory.tsx e shared/encounter-history.ts.
- Histórico desde início, ações/testes/dano/cura e ator/alvo.
- Agrupamento por ciclos e turnos de criaturas.
- Numeração original e dois horários: tempo decorrido do encontro HH:MM:ss e horário real de Brasília HH:MM.
- **Mais recentes primeiro**, scroll para antigas.
- Privacidade também no histórico.
- Resultados correlacionados mantêm identidade.

### Undo

- Até cinco mudanças no histórico administrativo.
- Ctrl+Z passa pelo fluxo de estado, não só DOM/localstate.
- Deve refletir em todos os clientes, histórico e ações/efeitos aplicáveis.
- Resultado anulado fica riscado e identificado como desfeito.
- Registrar intervenção do mestre.
- Não reaplicar SFX/dano antigo por restaurar snapshot sem controle de revisão/evento.
- Reverter editor até baseline elimina dirty state quando não há mudanças reais.
- Nem toda operação externa destrutiva é necessariamente reversível: conferir cobertura antes de prometer undo para exclusão de conta/arquivo.

## 15. Cena, fases, cutscenes e enquadramento

### Editor/fases

- Até oito fases, progressão universal do encontro.
- + adiciona; excluir primeira fase não permitido.
- Excluir fase sem alterações não precisa confirmação desnecessária; alterações relevantes exigem cuidado.
- Margens em PV, com segunda linha de porcentagem; oito itens cabem sem scroll excessivo.
- Chefões em abas dentro de cada fase; inclusão não deve contaminar fases anteriores.
- Valores padrão vêm do painel; fases posteriores herdam/copiariam dados pertinentes da anterior.
- Vida atual e máxima configuráveis; primeira faixa coerente com a vida inicial.
- Nome, atributos, arsenal e ação/descrição/severidade por fase.
- Incluir/remover chefões por fase; não restaurar dropdown redundante de estado removido da UI.
- Fundo por fase, com herança quando vazio.
- Alterações de conteúdo/uploads requerem salvar; controles de transporte/volume em tempo real não devem sujar cena sem necessidade.
- Reverter ao baseline remove estado de “precisa salvar”.
- Fechar editor com mudanças pede decisão.
- Resetar editor confirma consequências.
- Marcadores de fase são configuração geral, desmarcados por padrão.
- Transição configurada na fase fica desabilitada/cinza se cutscene intermediária controla a transição.
- Última fase não executa transição inexistente; campos podem continuar presentes, desativados.
- Fade, fade-blackout e blackout; Explosão removido.
- Sem texto genérico “fase mudando” na apresentação.
- Fases têm fade de entrada visual/som e atraso/fade do HUD.
- Contagem de entrada visual/HUD começa depois do blackout de saída da cutscene.

### Cutscenes

- Checkbox cria aba intermediária entre fases.
- Foco em mídia, música/SFX e transições, não em duplicar ficha.
- Mestre escolhe término manual ou automático.
- Vídeo pode ter áudio, ligado por padrão quando aplicável, com volume/mute próprios.
- Transporte visual e áudio embutido separados para fades independentes.
- HUDs ocultos durante cutscene.
- Duração da mídia determina término; fade de saída não prolonga a duração nominal.
- Saída visual final atual é blackout temporizado, não o antigo campo de fade-out visual.
- Entrada visual e entradas/saídas de som independentes.
- Faixa da próxima fase preparada e pode começar na fronteira/overlap planejado.
- Remover/fechar aba de cutscene permitido, com proteção quando aplicável.
- cutscene-coordinator.ts coordena mídia pronta e instante comum.
- CutscenePlayer.tsx reproduz e corrige posição; PhaseEntrance.tsx controla entrada de fase.
- Mídia que falha não deve liberar transição incompleta automaticamente; existe caminho manual do mestre.

### Enquadramento — beta.4

- Recomendação de mídia: **1920×1080, 16:9**.
- Não recomendar 1920×1040 como se fosse16:9; 1040 é limite externo histórico do conjunto de janelas.
- Proporção do browser pode diferir: não é matematicamente possível preencher, mostrar tudo e não distorcer simultaneamente em qualquer formato.
- Opções persistidas/sincronizadas:
  - Original / contain: tudo visível, pode deixar barras.
  - Ampliar / cover: preenche preservando proporção, pode cortar bordas.
  - Esticar / fill: preenche, pode distorcer.
- Default do normalizador atual: fill.
- Editor inspeciona dimensão local e avisa incompatibilidade de proporção; isso não garante conhecer antecipadamente cada viewport remota.
- Opção por fase e por cutscene.

## 16. Áudio, efeitos, sincronização e limitação aberta

### Playlists/soundboard

- Músicas MP3; playlists por fase e para transição/cutscene.
- Montar playlist abre modal com adicionar/remover/limpar confirmado, ordem, play/pause, anterior/próxima, seek, duração e loop.
- Uma faixa pode repetir individualmente; anteriores tocam uma vez e avançar manualmente sai do loop.
- Não recriar controles redundantes removidos do modal, como barra de volume própria; volume é partilhado com controles de cena/painel.
- Player visual deve acompanhar áudio realmente ativo.
- Soundboard: vinte posições em5×4, upload e nome opcional Atalho N, tooltip, editar/remover confirmado, limpar todos, stop universal, volume/mute/loop.
- Múltiplos SFX simultâneos e repetição rápida do mesmo atalho.
- Excluir/trocar arquivo deve parar as vozes correspondentes.
- Abrir/fechar soundboard não deve reposicionar janelas desnecessariamente.
- Música não inicia enquanto batalha não iniciada, salvo contexto explícito de prévia.
- Resetar/encerrar não deixa trilha antiga sobrevivendo ao próximo encontro.

### Fontes e customização de SFX

- Dano comum, crítico, cura, impacto de escudo, quebra de escudo, rolagem, fracasso natural, sucesso natural de jogador/inimigo e ação grave.
- Categorias em dropdown com até oito visíveis e scroll acima disso; popup não preso no modal.
- Amostras por item, habilitar/desabilitar, uploads próprios.
- Sons padrão não removíveis; uploads próprios removíveis.
- Sorteio evita repetição imediata quando houver alternativas.
- A antiga regra de cooldown global de um segundo foi removida.
- Ação grave tem categoria pronta; não inventar arquivo de som não fornecido.
- Alguns SFX vêm de pastas do usuário/fallback, e os assets efetivamente empacotados devem ser conferidos. Não afirmar que todo arquivo pessoal de SFX já está em assets.

### Volume atual

Função compartilhada volumeToGain:
- Entrada0..1.
- Até0,8: ganho = (volume/0,8)^2.
- Em0,8: ganho1, volume original.
- De0,8 a1: até+6dB, ganho =10^(dB/20).
- Não restaurar versões antigas lineares por causa dos primeiros pedidos.
- Música, soundboard e efeitos têm controles separados; mute independente do valor do slider.
- Mute universal do mestre avisa o usuário.
- Player tem preferências pessoais de som/efeitos sem alterar a sala.
- Desativar efeitos sofisticados não remove as barras residuais amarela/verde.

### Crítico cinematográfico do chefão

- Só disparar ameaça depois que mestre clicar em causar dano pendente de um acerto crítico.
- Resultado de ataque já foi determinado corretamente.
- Ameaça por **3 segundos**: tremor contínuo crescente e vermelho crescente na tela/HUDs alvos.
- SFX sucesso_natural_inimigo no início dessa ameaça, inclusive crítico válido de margem.
- Música desce em1segundo e permanece reduzida durante ameaça; não confundir 20% do slider com multiplicação de amplitude.
- Dano só calculado/aplicado ao final da ameaça.
- Impacto gera SFX/efeito crítico e mudança real de PV.
- Música volta em0,5s após janela de impacto/SFX pertinente, sem mute ou longa lacuna artificial.
- Constantes: ameaça3000ms, fade duck1000ms, impacto mínimo1100ms, restauração500ms.
- critical-presentation.ts, main.ts, player.tsx e eventos do servidor precisam continuar alinhados.
- O dono do turno não limita quem pode ser alvo visual; espectadores, Electron e demais browsers também veem a ameaça.

### Ducking de outros SFX

- Natural1/20 e críticos selecionados reduzem música durante efeito.
- Controlador sfx-music-ducking usa conjunto de efeitos ativos; ganho atual reduzido0,35, ataque0,12s e retorno0,25s.
- Impede um SFX terminar e restaurar música enquanto outro ainda precisa da redução.
- Não mascarar volume escolhido pelo usuário nem conflitar com envelope específico do chefão.

### Sincronização e caches

- Fila ordenada de eventos, revisões e preparação antes da apresentação.
- Áudio e HP/efeitos devem ser apresentados juntos mesmo que cliente tenha latência.
- Relógio estimado por amostras RTT/offset e programação compartilhada.
- Cutscene aguarda confirmação de mídia decodificável dos participantes relevantes.
- Pré-carregamento de mídias do encontro no Electron e clientes conectados.
- Não é possível pré-carregar no dispositivo de quem ainda não acessou a URL.
- Cache por item20MiB, limite global1GiB; mídia audiovisual selecionada pode ter100MB.
- Arquivos maiores seguem estratégia de transferência/streaming sem manter todos em RAM JS.
- Configurações mostram indicador de cache, não uso completo real de RAM do sistema.
- Encerrar sessão limpa recursos/caches temporários; não apagar biblioteca/perfis/assets persistentes.
- gapless-audio-loop.ts: loops decodificados limitados.
- phase-audio-handoff.ts: transferência do player/graph sem pausa/seek/load desnecessários.
- presentation-media-cache.ts: preparação e cache.

### PROBLEMA CONHECIDO — NÃO DECLARAR RESOLVIDO

**Brian ainda escuta stutter/microcortes de som/música, principalmente cutscene → próxima fase.**
Foi explicitamente adiado e release aceito com essa limitação.
Passar testes de transporte, ganho e seek **não prova** ausência de defeito audível.
Próxima investigação precisa de mídias reais, gravação/escuta de saída Electron/browser e correlação de rede, decode, schedulers, loop, handoff e silêncio contido no arquivo.
Não prometer “sincronização perfeita em qualquer internet” ou “zero stutter”.

## 17. Hospedagem, contas, privacidade e reconexão

### Hospedagem

- Host clicou Hospedar: prepara servidor local loopback e Cloudflare Quick Tunnel.
- Porta padrão interna:43120, conforme session-server; conferir alocação real e testes antes de fixar externamente.
- cloudflared fixado no código em **2026.7.2**, Windows AMD64.
- Binário baixado do release oficial GitHub, limite120MiB, hash SHA-256 verificado.
- Hash esperado: cdb5d4432f6ae1595654a692a51308b69d2bf7af961f5578d9391837cf072df9.
- Hash é integridade frente ao valor confiado no código, não certificado Authenticode nem antivírus.
- URL temporária https://*.trycloudflare.com.
- Usuário normal não configura IP, DNS, NAT/port-forward ou certificado.
- Fallback técnico loopback/lan e base pública manual preservado internamente; não é fluxo primário visível.
- Fechar sala/app encerra servidor/túnel e informa jogadores.
- Quick Tunnel é serviço externo temporário, não SLA do BossBar. Revalidar termos/limites na documentação oficial se tomar decisões de produção.

### Autenticação

- Até dez jogadores simultâneos.
- Username único normalizado por sala/perfil; não permitir várias pessoas com mesmo usuário ativo.
- Registro em modal separado com usuário e duas senhas; login existente.
- Implementação atual valida senha3..128 caracteres e usuário1..40.
- Senhas persistidas com salt e scrypt, comparação timingSafeEqual; não texto puro.
- Room code8 caracteres e tokens aleatórios32bytes para host/player.
- Autorização também por sessão/identidade, não apenas saber URL de arquivo.
- Mestre pode ver fichas, redefinir senha e excluir conta com confirmação.
- Excluir conta é distinto de expulsar da sala.
- Não expor hashes/salts/tokens em logs, relatório ou commit.

### Entrada e reconexão

- Durante batalha, nova entrada exige aprovação explícita antes de entrar.
- Reconexão da mesma identidade não é “novo usuário grátis”; preservar vínculo/estado com validação.
- Checkpoint registra participantes esperados; ao restaurar, não materializa HUD de quem ainda não entrou.
- Encontro retomado espera participantes salvos, salvo expulsos/liberados pelo mestre.
- Queda temporária mantém HUD cinza, personagem alvo e estado; pode bloquear turno manual.
- Mestre pode expulsar para liberar vaga e expectativa.
- Beta.4: mestre pode assumir desconectado e agir pelo HUD Electron.
- Reconectar não devolve controle automaticamente; mestre clica para devolver.
- Enquanto controlado pelo mestre, dono não pode agir nem editar ficha.
- Controle delegado é temporário; não reaplicar em outro encontro salvo.
- Autenticação e presença administrativa não devem vazar ficha privada a terceiros.

## 18. Persistência, biblioteca e segurança dos dados

### Perfil real

Fonte: app.getPath('userData'). Não fixar AppData presumido: o nome histórico do pacote e ambiente podem afetar diretório real.

Arquivos/pastas relevantes relativos a userData:
- boss-library.json — biblioteca de encontros; nome legado não significa biblioteca só de um chefão.
- master-notes.md — armazenamento de notas do mestre, nome legado.
- encounter-effects-settings.json — efeitos/preferências.
- encounter-sound-customization.json — escolhas de SFX.
- custom-encounter-sounds/ — sons importados.
- attack-library.json — biblioteca de ataques.
- custom-status-library.json — condições personalizadas.
- multiplayer-players/profiles.json — perfis locais do mestre.
- multiplayer-players/<profileId>/character-sheet.pdf — ficha aceita.
- multiplayer-players/<profileId>/portrait.<ext> — retrato.

**Não abrir ou divulgar conteúdo dos perfis para uma revisão genérica, nem limpar o perfil real para testar.**

### Biblioteca de encontros/checkpoints

- Salva mais que nome/HP: chefões, condições, escudo, ficha/base/overrides, fases, cutscenes, playlists, soundboard e mídia.
- Salva vida/PM/temporários/condições/recursos dos jogadores, participantes, turno, ações, iniciativa, histórico e resultados.
- Inclui danos e resistências pendentes e elegibilidade de entrada tardia.
- Posições de música/background, blackout e progressão/fila de fases.
- Pode incorporar documento de ficha em base64 no checkpoint local. Nunca enviar essa estrutura integral como estado público.
- Carregar continua de onde salvou, não recomeça iniciativa nem reaplica HP de fase indiscriminadamente.
- Baseline inicial separado permite Resetar encontro voltar à preparação original.
- Reset total volta aos padrões do app.
- Autosave exclusivo a cada5min e antes de encerrar.
- Notificação breve de autosave não pode bloquear a sessão.
- Ausência de arquivos: localizar substituto, continuar sem quando permitido ou cancelar.
- Cancelar seletor de arquivos não deve travar próximas tentativas.
- Ao fechar batalha ativa: salvar e fechar, fechar sem novo save de biblioteca, cancelar; autosave adicional continua.
- Falha de gravação mantém app aberto; sobrescrita pede confirmação.

### Modelo de segurança

- BrowserWindow com isolamento de contexto, nodeIntegration desativado e sandbox conforme papel.
- IPCs somente leitura também validam remetente.
- Preload por papel, não expor API administrativa inteira ao player web.
- Protocolos boss-media: e boss-asset: com validação de caminho/tipo e origem.
- Não restaurar Access-Control-Allow-Origin:* por conveniência.
- CSP de produção mais restrita que desenvolvimento; suporte blob/local só onde necessário.
- Fastify/Socket.IO validam tokens/origem/payload e limitam conexões/requisições.
- PDF, retrato e mídia com limites distintos.
- Rotas autenticadas de ficha; ticket de visualização evita link file:// bloqueado.
- Tratamento de fórmulas sem execução de JS arbitrário.
- Operações críticas sequenciadas para evitar duplicar dano, resistência ou aprovação.
- Teste de segurança funcional não equivale a pentest completo.
- Ao revisar privacidade, auditar os campos efetivamente publicados: algumas informações do chefão necessárias à apresentação fazem parte do payload. Não prometer ausência de todo dado interno sem inspeção específica.

## 19. Assets e empacotamento

### Conteúdo interno

- assets/bossbar-icon.png e .ico.
- assets/waiting-background.png.
- assets/shield-icon.png.
- assets/cog.png transparente.
- assets/player-resource-points.png.
- assets/ui/corpo-a-corpo.png e a-distancia.png.
- assets/status-icons/ com36 recortes.
- assets/ficha-t20-v2-editavel.pdf.
- assets/SFX/Mecanica_Rolagem_Dados/ com dice1/2/3, fracasso_natural1/2, sucesso_natural_jogador/inimigo.

### Regras

- Tudo em assets é distribuído com instalador.
- Imagens/Icones/Musica/SFX pessoais não entram automaticamente.
- Pedidos antigos moveram originais para pastas pessoais; não quebrar referências dos processados internos.
- Arquivos de usuário devem ser escolhidos/importados/resolvidos em runtime, não hardcodes de Brian em build público.
- Conferir permissões/direitos antes de adicionar recursos externos ao pacote.
- Ícones processados não devem ser substituídos por originais com fundo branco.
- Script assets:status é relevante apenas ao modificar as fontes correspondentes.

### Forge

- Vite multipage: launcher, master, player, control, library, attack-library, scene-editor, soundboard, encounter-debugger e web-player.
- Build separado de todos os preloads.
- concurrent:false evita disputa de diretório entre alvos Forge/Vite.
- music-metadata e pdf-lib externos ao bundle main, com whitelist das transitivas necessárias no pacote. Não incluir node_modules inteiro.
- assets copiado como extraResource para resources/assets, fora de ASAR.
- ASAR configurado para streaming/seek de mídia.
- Ícone Windows .ico próprio.
- Squirrel mantém nome interno **boss_battle** para continuidade de instalações antigas.
- Setup: **BossBar-Tormenta20-Setup.exe**.
- Não mudar identificador interno só para coincidir com nome público.
- Fuses: RunAsNode false, CookieEncryption true, NodeOptions false, NodeCliInspect false, EmbeddedAsarIntegrity true, OnlyLoadAppFromAsar true.
- Vite8: patch de configuração do preload remove inlineDynamicImports e usa codeSplitting:false. Não reintroduzir o warning antigo.
- BOSS_BUILD_OUT permite saída isolada.

### make e caminho com acentos

- Problema histórico: rcedit/Squirrel “Unable to load file” em caminho contendo chefões.
- make.mjs cria build em diretório temporário, valida versão e só promove resultados para out ao terminar.
- Usa staging out.next/out.previous e recuperação de falhas/arquivos em uso.
- Não contornar apagando perfis/dados do usuário.
- `npm.cmd run package` não é criação/publicação completa do instalador.
- `npm.cmd run make` produz distribuíveis em out/make.
- `npm.cmd run publish` existe, mas é publicação externa e exige autorização/configuração; não executar como teste.

## 20. Comandos operacionais

Executar a partir da raiz real:

~~~powershell
Set-Location -LiteralPath 'C:\Users\Brian\Documents\Interface chefões (Janela)\boss-battle'

git status --short
git branch --show-current
git log -5 --oneline

node --version
npm.cmd --version
npm.cmd ci

npm.cmd start
~~~

start executa prestart para gerar cliente web estático atualizado em TEMP/bossbar-t20-web-player-dev; depois inicia Forge.

### Verificação

~~~powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run verify

npm.cmd run coverage:netcode
npm.cmd audit --omit=dev
npm.cmd ls --all
git diff --check
~~~

- audit não foi reexecutado para produzir este relatório. Não inventar contagem atual de vulnerabilidades.
- Não usar npm audit fix --force.
- Não instalar scripts não revisados para contornar strict-allow-scripts.

### Web

~~~powershell
npm.cmd run build:web:test
npx.cmd playwright test --config playwright.web.config.mts --project=chromium --project=chrome --project=edge

npm.cmd run test:e2e:web
~~~

- npm run test:e2e:web inclui build.
- workers:1 para testes com mídia/múltiplos clientes.
- Configuração pode filtrar Firefox no Windows Node24 fora CI; sucesso do comando não significa Firefox executado.
- Chrome do projeto é Chrome for Testing via channel chromium, não necessariamente o Chrome pessoal.
- Edge usa msedge; precisa estar disponível.
- Instalação de browsers quando necessária: npx.cmd playwright install chromium firefox. Não reinstalar sem motivo como tentativa cega.

### Electron/build

~~~powershell
npm.cmd run package
npx.cmd playwright test --config playwright.electron.config.mts

npm.cmd run test:e2e:electron
npm.cmd run test:e2e

npm.cmd run make
~~~

- test:e2e:electron inclui package.
- Testes Electron usam perfil descartável e variáveis próprias.
- Não executar testes que modificam dados sobre userData real.

### Auxiliares

~~~powershell
npm.cmd run fixtures:media
npm.cmd run assets:status
npm.cmd run smoke:tunnel
~~~

- Fixtures: PNG/GIF/MP3/MP4 sintéticos para teste.
- smoke:tunnel utiliza rede/serviço externo; executar apenas quando realmente quiser validar hospedagem.
- Sem refazer assets/fixtures indiscriminadamente e aceitar mudança de snapshots sem revisão.

## 21. Testes, CI e evidências reais

### Última validação da implementação beta.4

- Lint: aprovado.
- TypeScript: aprovado.
- **192 testes unitários: aprovados.**
- **54 testes web: aprovados** em Chromium/Chrome/Edge.
- **18 casos web pulados** por filtros de escopo já existentes.
- **5 testes Electron: aprovados.**
- Empacotamento: aprovado.
- Antes do commit beta.4, lint/types/192 testes foram executados novamente e passaram.
- Não se executou toda a matriz novamente apenas para escrever este relatório.
- Não confundir packaging aprovado com instalador beta.4 publicado.

### Cobertura

- Script atual exige linhas55%, statements55%, branches65%, funções55%.
- Usa c8 em src/multiplayer/**/*.ts, shared/multiplayer.ts e web-player-api.ts.
- Em etapa anterior da biblioteca, gate passou com65,23% linhas/72,59% branches.
- Esse percentual é evidência daquela execução, não cobertura total de todo projeto nem nova medição beta.4.
- Nenhum número de cobertura permite afirmar que não há bugs.

### Cenários existentes

- Regras: batalha, status/evoluções, d20, perícias, combate, sobrevivência, recursos, debugger.
- Segurança/preload e projeção.
- PDF/importação/rascunho/notes.
- Library/arsenais, cópia por fase, fórmulas, limites, loop individual.
- Checkpoint/restart/retomada.
- Cutscene readiness, playback, atraso artificial, handoff/loop/ducking.
- Ordem de eventos e rede degradada.
- Dez clientes simultâneos.
- Retratos compartilhados.
- Aprovações/privacidade/turnos/undo.
- Resistências manuais/automáticas e dano duplicado rejeitado.
- Layouts de viewports, overlay, screenshots.
- Electron launcher/master/player/control/editor/libraries, fechamento/salvamento.

### Firefox — problema não resolvido

- Playwright1.61.1 falha em browserContext.newPage antes do BossBar:
  `Cannot read properties of undefined (reading '_page')`.
- Windows/Node24.18.0 reproduziu até about:blank.
- Uma tentativa local com Node22.23.2 também falhou.
- Não afirmar que só trocar Node22 resolve neste PC.
- Configuração CI web usa Node22 para tentar isolar combinação; resultado remoto atual não confirmado.
- Snapshots Firefox existem, mas os de tela inteira precisam revisão em runner funcional após mudanças visuais.
- Não gerar imagens artificiais como se fossem capturas Firefox.
- Não excluir testes só para pintar a matriz de verde.

### CI

quality.yml em push/pull_request:
1. Lint/types/unit/cobertura/audit de produção.
2. Matriz web.
3. Fluxo Electron.
4. Package/smoke em Windows descartável.

- actions fixadas por hash, permissões contents:read.
- Node24 para quality/Electron/package; Node22 para web.
- npm12.0.2 explicitamente instalado.
- npm ci com política estrita.
- Artefatos de cobertura/diagnóstico e pacote temporário.
- tunnel-smoke.yml semanal/manual para túnel; não prender todo push ao serviço externo.
- E-mails de CI falho já ocorreram. Verificar logs do run, não concluir que testes locais significam Actions verde.
- Consulta GitHub desta conferência bloqueada por rede; nenhum run remoto foi revalidado.

## 22. Mapa dos principais módulos

| Área | Arquivos |
| --- | --- |
| Orquestração desktop | src/main.ts |
| Contrato/isolamento | src/shared/api.ts, src/shared/preload.ts, src/preload*.ts |
| UI global/painel | src/master.tsx, src/control.tsx e CSS |
| Apresentação comum | src/player.tsx, src/player.css |
| Entrada/ficha web | src/web-player.ts, src/web-player.css, web-player.html |
| Adaptador web | src/web-player-api.ts |
| Servidor | src/multiplayer/session-server.ts |
| Presença/segurança | session-roster.ts, session-security.ts |
| Túnel | quick-tunnel.ts |
| Perfis e PDF | player-profile-store.ts, character-sheet-pdf.ts |
| Estado público | public-presentation.ts, shared/multiplayer.ts |
| Chefões/dano | shared/battle.ts |
| Perícias/armas | shared/boss-skills.ts, boss-attacks.ts, attack-options.ts |
| Biblioteca ataques | AttackLibrary.tsx, AttackFields.tsx, attack-library.tsx, attack-library-store.ts |
| Condições | shared/status.ts, status-rules.ts, StatusRichText.tsx |
| Biblioteca Coringa | shared/custom-status-library.ts, custom-status-library-store.ts |
| Personagens/combate | shared/player-combat.ts, player-survival.ts, player-defenses.ts, player-hud-values.ts |
| Dados | shared/d20-rules.ts e parser em shared/status.ts |
| Cena | scene-editor.tsx, shared/scene.ts, SceneMediaFitControl.tsx |
| Cutscenes | CutscenePlayer.tsx, cutscene-coordinator.ts, cutscene.css |
| Entrada de fase | PhaseEntrance.tsx |
| Áudio | gapless-audio-loop.ts, phase-audio-handoff.ts, sfx-music-ducking.ts |
| Crítico | critical-presentation.ts |
| Cache | presentation-media-cache.ts, shared/media-cache.ts |
| Biblioteca/checkpoint | library.tsx, shared/library.ts, encounter-checkpoint.ts |
| Histórico/undo | FightHistory.tsx, shared/encounter-history.ts, shared/undo-shortcut.ts |
| Debugger | encounter-debugger.tsx, shared/encounter-debugger.ts |
| Ficha/rascunho | shared/character-sheet.ts, character-sheet-draft.ts |
| Notas | notes-html.ts, shared/player-notes.ts |
| Preferências pessoais | shared/client-presentation-preferences.ts |
| Responsividade/janelas | shared/window-layout.ts, main.ts |
| Padrões visuais | ui-theme.css, scrollbars.css, shared/disabled-controls.ts |

O inventário complementar lista arquivos versionados, canais IPC, listeners Socket.IO e métodos BossAPI para busca direta.

## 23. Documentação e divergências conhecidas

Ler como contexto, não substituir checkout por narrativa antiga:
- docs/COMMIT_SUMMARY.md: resumo consolidado beta.4.
- docs/final-touches-and-pdf-validation.md: seis últimos ajustes e escopo da validação.
- docs/attack-library-and-resistances.md: arsenais, resistências e testes da etapa.
- docs/visual-audit.md: revisão visual.
- docs/encounter-checkpoints-and-cutscenes.md: checkpoints e mídia.
- docs/RELEASE-2.0.0-beta.3.md: release anterior.
- docs/KNOWN-ISSUES.md: áudio e Firefox.
- assets/README.md: fontes processadas/empacotamento.
- README.md: apresentação bilíngue, instalação/licença, porém não totalmente atualizado.

**Divergências observadas nesta conferência documental, sem corrigir o código/README:**
- Badge README ainda mostra beta.2.
- README afirma que jogador não precisa criar conta; no multiplayer atual há acesso local com usuário/senha. Correto é não precisar conta externa/central nem instalar app.
- Documentos de etapas ainda têm frases “sem alteração de versão/commit” referentes ao momento da implementação; já foram incluídos no commit beta.4.
- KNOWN-ISSUES intitula áudio como beta.3; problema permanece em beta.4.
- Comentário CI sugere isolamento com Node22, mas tentativa local Node22 também falhou.
- Resumos/testes históricos têm números menores; preferir evidência beta.4 e reexecutar quando necessário.

Não fazer correção silenciosa desses documentos como se já tivesse sido pedido um novo release.

## 24. O que não foi implementado integralmente / não prometer

- Catálogo completo automatizado de habilidades/poderes oficiais.
- Motor completo de magia/efeitos de todas as classes.
- OCR de ficha digitalizada ou parser universal de qualquer PDF.
- Correção automática de ambiguidades de regras, equipamento ou poderes não cadastrados.
- Servidor público permanente ou conta global BossBar.
- Controle automático do arquivo original do PC do jogador fora das permissões do navegador.
- Zero latência física, sincronização audiovisual perfeita em qualquer conexão/browser.
- Ausência de stutter comprovada por escuta.
- Firefox local validado nesta máquina.
- CI remoto atual verde, sem consultar Actions.
- Segurança absoluta/pentest completo.
- Suporte validado de desktop Linux/macOS; Windows é alvo atual.
- NPC como sistema de criação completo não deve ser presumido só porque existem tipos actorKind npc e caminhos de controle.
- Perda de rede real em túnel externo não equivale a atraso simulado em loopback.
- Snapshot integral privado pode conter dados sensíveis; não exportar a jogadores.

## 25. Próximas prioridades, sem iniciar automaticamente

1. Reproduzir e investigar áudio stutter/microcortes com mídia real em Electron e browser, especialmente cutscene → fase.
2. Resolver/contornar ambiente Playwright Firefox em runner funcional; revisar snapshots e executar a matriz real.
3. Validar hospedagem pública com múltiplas redes, latência real, desconexão/reconexão, mídia grande e encerramento.
4. Atualizar README/relatórios históricos inconsistentes com beta.4, sem misturar com alterações funcionais.
5. Continuar modularização dirigida por testes de main.ts/session-server.ts quando autorizada; preservar contratos e estado salvo, não fazer reescrita ampla por estética.

Roadmap futuro de poderes/habilidades:
- Primeiro catálogo local autorizado e seleção manual das capacidades possuídas.
- Depois efeitos declarativos limitados (bônus, custos, duração, alvos).
- Integrar recursos de classe, PM, ação, reação e efeitos sustentados.
- Expandir por grupos de regras com testes e fallback narrativo.
- Servidor continua autoritativo no multiplayer.
- Usar manual/pacote de regras fornecido pelo usuário ou fonte autorizada; não embutir livro protegido inteiro.

## 26. Procedimento recomendado para a próxima alteração

1. Confirmar cwd/branch/HEAD/dirty state e instruções novas.
2. Ler arquivos relacionados e testes existentes; não só main.ts inteiro.
3. Identificar se muda estado persistido, payload público, autoridade, timer, áudio ou visual.
4. Preservar save antigo com normalização/defaults e testar round-trip.
5. Validar IPC e rede para a mesma funcionalidade; atualizar whitelist somente para papéis necessários.
6. Atualizar projeções administrativas/públicas e privacidade.
7. Testar local/offline e web com pelo menos dois clientes quando refletir na apresentação.
8. Testar filtros por dono/outro/mestre, reconexão, duplo clique/reenvio e undo quando relevantes.
9. Fazer teste visual real para layout; não aceitar snapshot novo sem olhar.
10. Rodar lint/types/unit, testes direcionados e regressão proporcional à mudança.
11. Antes de release, Electron completo, package, matriz disponível e checagens de versão/segurança.
12. Atualizar resumo consolidado inglês e pendências reais.
13. Só versionar/commitar/push/publicar quando Brian pedir.
14. Comunicar o que passou, foi pulado, não foi executado e o que permanece pendente.

## 27. Estado final deste handoff

- Este relatório é documentação de transferência de contexto.
- Não alterou funcionalidades, dependências, versão, perfis de jogadores ou dados dos encontros.
- Não executou novo build nem testes completos para fingir uma nova certificação.
- Não criou commit/push de documentação.
- A nova conversa deve tratar estes arquivos como alterações documentais ainda não commitadas, caso o usuário não os tenha commitado depois.
- O código completo e o histórico Git são a fonte final de detalhe; nenhum relatório textual substitui a inspeção do código para modificar uma regra específica.
- As fontes consultadas foram o checkout atual, documentos versionados, package/scripts/configuração e o histórico desta conversa; referências antigas foram identificadas como históricas.
