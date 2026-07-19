<div align="center">
  <img src="assets/bossbar-icon.png" width="150" alt="Ícone do BossBar - Tormenta20" />

  # BossBar - Tormenta20

  **Uma apresentação audiovisual de encontros de RPG, controlada pelo mestre e transmitida aos jogadores.**

  ![Versão](https://img.shields.io/badge/versão-1.5.2-8d1f2d)
  ![Plataforma](https://img.shields.io/badge/plataforma-Windows-326ca8)
  ![Electron](https://img.shields.io/badge/Electron-43-47848f)
  ![Uso](https://img.shields.io/badge/uso-local-c99545)

  [Português](#português) · [English](#english)
</div>

---

# Português

## Sobre o BossBar

O **BossBar - Tormenta20** é um aplicativo desktop para mestres de RPG apresentarem encontros e lutas contra chefões de forma cinematográfica. O mestre controla a batalha localmente enquanto os jogadores assistem à janela de apresentação por uma transmissão no Discord ou em outro programa de captura.

Os jogadores não precisam instalar o aplicativo, criar uma conta ou se conectar a um servidor. Apenas a janela de apresentação é compartilhada; os controles permanecem com o mestre.

## Principais recursos

### Apresentação e controle

- Janela de apresentação em proporção 16:9, acompanhada por um painel de controle dedicado ao mestre.
- Janela compacta para controles globais do encontro.
- Suporte a até três chefões simultâneos, com HUDs que se reorganizam dinamicamente.
- Exibição opcional de vida atual, marcadores de fase e informações de escudo.
- Controles para mostrar ou esconder o HUD, aplicar blackout e iniciar ou encerrar a batalha.
- Histórico com até cinco ações reversíveis por `Ctrl + Z`.

### Chefões e combate

- Nome, vida atual e máxima, ataque, tiro, perícias, defesas corpo a corpo e à distância, redução de dano e escudo.
- Dano, cura e cura completa, incluindo golpes parcelados com a sintaxe `total/parcelas`.
- Redução de dano opcional e efeitos próprios para dano, crítico, cura, escudo atingido e escudo quebrado.
- Animações de impacto, barras residuais de dano e cura, números flutuantes e sequência visual de derrota.
- Ações publicadas como padrão ou grave para antecipar aos jogadores o próximo movimento do chefão.

### Condições e turnos

- 35 condições de Tormenta20, mais um status personalizado.
- Ícones, descrições e duração em turnos diretamente no HUD.
- Progressões, incompatibilidades e modificadores automáticos entre condições compatíveis.
- Dano recorrente por fórmulas de dados, incluindo expressões como `2d6 + 1d8 - 3`.
- Controle de turnos e aplicação automática dos efeitos ativos.

### Cenas e fases

- Editor de cena com até oito fases.
- Transições acionadas por limites de vida definidos pelo mestre.
- Fundos próprios por fase usando imagens, GIFs ou vídeos em loop e sem áudio.
- Transições por fade, fade para blackout ou blackout imediato.
- Alteração de chefões, atributos, ações e mídia entre fases.
- Playlists e sons de transição independentes para cada fase.

### Áudio

- Música reproduzida exclusivamente pela janela dos jogadores.
- Playlists por fase com reprodução, pausa, busca, faixa anterior/seguinte, loop e mute.
- Soundboard com até 20 atalhos MP3, reprodução simultânea e controles próprios.
- Efeitos sonoros internos e personalizados para dano, crítico, cura e escudo.
- Controles separados e persistentes para música, soundboard e efeitos sonoros.

### Biblioteca de encontros

- Salva encontros completos com chefões, atributos, vida, condições, cena, mídia, playlists e soundboard.
- Carrega encontros anteriormente preparados sem revelar antecipadamente o conteúdo aos jogadores.
- Salvamento automático periódico e salvamento adicional ao encerrar o aplicativo.
- Identificação de arquivos locais ausentes e opção de localizar substitutos.

## Instalação para jogadores e mestres

1. Abra a página da [versão mais recente](https://github.com/Duaaaal/BossBar-T20/releases/latest).
2. Baixe o instalador `.exe` disponível em **Assets**.
3. Execute o instalador e abra o **BossBar - Tormenta20**.

> O Windows pode exibir um aviso do SmartScreen quando um instalador não possui assinatura digital reconhecida. Baixe o aplicativo somente pelo canal oficial de distribuição e confira a versão antes de executá-lo.

Os jogadores não precisam realizar esses passos: somente o computador do mestre executa o BossBar.

## Uso rápido

1. Na tela inicial, escolha **Novo encontro** ou carregue um encontro salvo.
2. Preencha os dados dos chefões no painel de controle.
3. Abra **Editar cena** para configurar fases, fundos, transições e músicas.
4. Aplique e salve as alterações desejadas.
5. Clique em **Iniciar batalha**.
6. No Discord, compartilhe somente a janela **Apresentação - BossBar T20**.

Para manter os controles privados, compartilhe a janela específica do aplicativo — não a tela ou o monitor inteiro. O painel do mestre é uma janela separada e sincronizada, posicionada junto à apresentação.

## Arquivos de mídia

- Fundos: formatos comuns de imagem, GIF e vídeo, como PNG, JPEG, GIF, WebP e MP4.
- Música, transições e soundboard: arquivos MP3.
- Limite por arquivo selecionado pelo aplicativo: 100 MB.
- Vídeos de fundo são reproduzidos em loop e sem áudio.

Arquivos muito grandes ou muitas mídias simultâneas podem aumentar o consumo de memória e reduzir a fluidez do aplicativo.

## Desenvolvimento

### Requisitos

- Windows 10 ou 11, em 64 bits.
- [Node.js](https://nodejs.org/) com npm.
- Git, caso o projeto seja obtido por clone.

### Executar localmente

```powershell
git clone https://github.com/Duaaaal/BossBar-T20.git
cd BossBar-T20
npm ci
npm start
```

No PowerShell, `npm.cmd` pode ser usado no lugar de `npm` caso a política de execução impeça o carregamento de `npm.ps1`.

### Verificar e gerar o aplicativo

```powershell
npm run verify
npm run package
npm run make
```

- `verify`: executa lint, verificação de tipos e testes automatizados.
- `package`: gera uma versão local não instalável do aplicativo.
- `make`: cria os artefatos distribuíveis e o instalador para Windows.

Os arquivos gerados ficam no diretório `out/`.

## Tecnologias

- Electron e Electron Forge
- React
- TypeScript
- Vite
- Node.js

## Desenvolvimento assistido por IA

O BossBar foi idealizado e dirigido por **Brian Nascimento** e desenvolvido com a assistência de ferramentas de inteligência artificial. Essas ferramentas auxiliaram em atividades como implementação, revisão de código, documentação, testes e refatoração. As decisões sobre requisitos, experiência do usuário, validação e publicação do projeto permanecem sob responsabilidade do autor.

## Estrutura do projeto

```text
BossBar-T20/
├── assets/                  # Recursos internos distribuídos com o aplicativo
├── scripts/                 # Scripts auxiliares de build
├── src/
│   ├── main.ts              # Processo principal, janelas, estado e IPC
│   ├── preload-*.ts         # APIs isoladas por tipo de janela
│   ├── player.tsx           # Apresentação dos jogadores
│   ├── control.tsx          # Painel acoplado do mestre
│   ├── master.tsx           # Controles globais
│   ├── scene-editor.tsx     # Editor de cenas e fases
│   ├── library.tsx          # Biblioteca de encontros
│   ├── soundboard.tsx       # Gerenciador do soundboard
│   └── shared/              # Tipos, regras e utilitários compartilhados
├── tests/                   # Testes automatizados
├── forge.config.ts          # Empacotamento do Electron Forge
└── package.json             # Metadados, scripts e dependências
```

## Privacidade e segurança

- O BossBar funciona localmente e não exige conta ou servidor próprio.
- Mídias e encontros escolhidos pelo usuário permanecem no computador, salvo quando o próprio usuário os compartilha ou move.
- As janelas usam APIs de preload separadas e comunicação IPC validada entre os processos do aplicativo.
- Dependências devem ser instaladas a partir do arquivo de lock com `npm ci` e verificadas antes de cada lançamento.

Nenhum software pode oferecer segurança absoluta. Use apenas builds obtidas do canal oficial e mantenha o aplicativo atualizado.

## Licenciamento

O BossBar é um projeto **open source**, distribuído sob a [Licença MIT](LICENSE). Você pode usar, copiar, modificar, integrar, publicar, distribuir, sublicenciar e vender cópias do software, desde que o aviso de direitos autorais e o texto da licença sejam preservados nas cópias ou em partes substanciais do projeto.

Consulte o arquivo [LICENSE](LICENSE) para conhecer os termos completos. Nomes, marcas e propriedades intelectuais de terceiros mencionados pelo projeto permanecem sujeitos aos direitos de seus respectivos titulares.

## Aviso legal

BossBar é uma ferramenta independente, criada por fã, e não é afiliada nem endossada pela Jambô Editora ou pelos detentores da propriedade intelectual de Tormenta20. Tormenta20 e marcas relacionadas pertencem aos seus respectivos titulares.

Criado por **Brian Nascimento**.

---

# English

## About BossBar

**BossBar - Tormenta20** is a desktop application that helps game masters present cinematic RPG encounters and boss battles. The game master controls the battle locally while players watch the presentation window through Discord streaming or another capture application.

Players do not need to install the application, create an account, or connect to a server. Only the presentation window is shared; all controls remain with the game master.

## Main features

### Presentation and control

- A 16:9 presentation window accompanied by a dedicated game-master control panel.
- A compact window for global encounter controls.
- Support for up to three simultaneous bosses with dynamically rearranged HUDs.
- Optional current-health display, phase markers, and shield information.
- Controls to show or hide the HUD, trigger a blackout, and start or end the battle.
- Up to five reversible changes through `Ctrl + Z`.

### Bosses and combat

- Name, current and maximum health, melee attack, ranged attack, skills, melee and ranged defense, damage reduction, and shield.
- Damage, healing, and full healing, including multi-hit input using the `total/hits` syntax.
- Optional damage reduction and dedicated effects for damage, critical hits, healing, shield hits, and shield breaks.
- Impact animations, delayed damage and healing bars, floating numbers, and a defeat sequence.
- Standard or critical action announcements that warn players about the boss's next move.

### Conditions and turns

- 35 Tormenta20 conditions plus one custom status.
- Icons, descriptions, and turn duration displayed directly on the HUD.
- Automatic condition progression, incompatibility rules, and attribute modifiers.
- Recurring damage through dice formulas such as `2d6 + 1d8 - 3`.
- Turn tracking and automatic processing of active effects.

### Scenes and phases

- A scene editor supporting up to eight phases.
- Transitions triggered by health thresholds chosen by the game master.
- Per-phase backgrounds using images, animated GIFs, or muted looping videos.
- Fade, fade-to-blackout, and immediate blackout transitions.
- Per-phase changes to bosses, attributes, actions, and media.
- Independent playlists and transition sounds for each phase.

### Audio

- Music playback occurs exclusively in the players' presentation window.
- Per-phase playlists with playback, pause, seeking, previous/next track, loop, and mute controls.
- A 20-slot MP3 soundboard with concurrent playback and dedicated controls.
- Bundled and custom sound effects for damage, critical hits, healing, and shields.
- Separate persistent controls for music, soundboard, and sound-effect volume.

### Encounter library

- Saves complete encounters, including bosses, attributes, health, conditions, scenes, media, playlists, and soundboard assignments.
- Loads prepared encounters without revealing their content to players beforehand.
- Periodic autosaves and an additional save when the application closes.
- Detection of missing local files with an option to locate replacements.

## Installation for players and game masters

1. Open the [latest release](https://github.com/Duaaaal/BossBar-T20/releases/latest) page.
2. Download the `.exe` installer listed under **Assets**.
3. Run the installer and open **BossBar - Tormenta20**.

> Windows may show a SmartScreen warning when an installer does not have a recognized digital signature. Download the application only from its official distribution channel and check the version before running it.

Players do not need to follow these steps: BossBar runs only on the game master's computer.

## Quick start

1. On the launcher, choose **Novo encontro** (New encounter) or load a saved encounter.
2. Fill in the boss information in the control panel.
3. Open **Editar cena** (Edit scene) to configure phases, backgrounds, transitions, and music.
4. Apply and save the desired changes.
5. Click **Iniciar batalha** (Start battle).
6. In Discord, share only the **Apresentação - BossBar T20** window.

To keep controls private, share the specific application window rather than the entire screen or monitor. The game-master panel is a separate synchronized window positioned next to the presentation.

## Media files

- Backgrounds: common image, GIF, and video formats such as PNG, JPEG, GIF, WebP, and MP4.
- Music, transitions, and soundboard: MP3 files.
- Application file-size limit: 100 MB per selected file.
- Background videos play muted and in a loop.

Very large files or many simultaneous media assets may increase memory usage and reduce application performance.

## Development

### Requirements

- 64-bit Windows 10 or 11.
- [Node.js](https://nodejs.org/) with npm.
- Git when cloning the project.

### Run locally

```powershell
git clone https://github.com/Duaaaal/BossBar-T20.git
cd BossBar-T20
npm ci
npm start
```

In PowerShell, use `npm.cmd` instead of `npm` if the execution policy blocks `npm.ps1`.

### Verify and build

```powershell
npm run verify
npm run package
npm run make
```

- `verify`: runs linting, type checking, and automated tests.
- `package`: creates a local unpacked application build.
- `make`: creates distributable artifacts and the Windows installer.

Generated files are written to the `out/` directory.

## Technology stack

- Electron and Electron Forge
- React
- TypeScript
- Vite
- Node.js

## AI-assisted development

BossBar was conceived and directed by **Brian Nascimento** and developed with the assistance of artificial-intelligence tools. These tools supported activities such as implementation, code review, documentation, testing, and refactoring. Decisions concerning requirements, user experience, validation, and publication remain the author's responsibility.

## Project structure

```text
BossBar-T20/
├── assets/                  # Internal resources shipped with the application
├── scripts/                 # Supporting build scripts
├── src/
│   ├── main.ts              # Main process, windows, state, and IPC
│   ├── preload-*.ts         # APIs isolated by window type
│   ├── player.tsx           # Players' presentation
│   ├── control.tsx          # Docked game-master panel
│   ├── master.tsx           # Global controls
│   ├── scene-editor.tsx     # Scene and phase editor
│   ├── library.tsx          # Encounter library
│   ├── soundboard.tsx       # Soundboard manager
│   └── shared/              # Shared types, rules, and utilities
├── tests/                   # Automated tests
├── forge.config.ts          # Electron Forge packaging configuration
└── package.json             # Metadata, scripts, and dependencies
```

## Privacy and security

- BossBar runs locally and requires no account or dedicated server.
- User-selected media and encounters remain on the computer unless the user explicitly shares or moves them.
- Windows use separate preload APIs and validated IPC communication between application processes.
- Dependencies should be installed from the lockfile with `npm ci` and verified before every release.

No software can guarantee absolute security. Use builds obtained from the official distribution channel and keep the application updated.

## Licensing

BossBar is an **open-source** project distributed under the [MIT License](LICENSE). You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, provided that the copyright notice and license text remain included in copies or substantial portions of the project.

See [LICENSE](LICENSE) for the complete terms. Third-party names, trademarks, and intellectual property mentioned by the project remain subject to the rights of their respective owners.

## Legal notice

BossBar is an independent fan-made tool and is not affiliated with or endorsed by Jambô Editora or the owners of the Tormenta20 intellectual property. Tormenta20 and related trademarks belong to their respective owners.

Created by **Brian Nascimento**.
