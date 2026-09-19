# BossBar beta.4 — inventário técnico de continuidade

Complemento de HANDOFF-2.0.0-beta.4.md. Snapshot do checkout de 06/09/2026; não substitui leitura do código. Números de linha abaixo podem mudar após novas edições. Não contém perfis reais, credenciais de usuários ou tokens de sala.

## Git local

HEAD: `309f04c61192d40f8a505e2461fe738b2c591b7b`

~~~text
* feature/multiplayer-web 309f04c [origin/feature/multiplayer-web] Version 2.0.0-beta.4 - attack library, validated sheets and encounter polish
  master                  37421ce [origin/master] Updated README
~~~

A referência origin mostrada é local; a consulta ao GitHub falhou por conectividade nesta conferência. Nenhum push ou fetch foi feito para gerar este inventário.

## Tags locais

~~~text
v0.1.0
v0.2.0
v1.0.0
v1.0.1
v1.1.0
v1.1.1
v1.1.2
v1.2.0
v1.2.1
v1.3.0
v1.3.1
v1.4.0
v1.4.1
v1.4.2
v1.4.3
v1.4.4
v1.4.5
v1.5.0
v1.5.1
v1.5.2
v2.0.0-beta.3
v2.0.0-beta.4
~~~

## package.json completo

Versões com ^ são faixas. package-lock.json permanece a fonte da árvore resolvida; o lockfile completo já está no repositório e não foi duplicado aqui.

~~~json
{
  "name": "bossbar-t20",
  "productName": "BossBar - Tormenta20",
  "version": "2.0.0-beta.4",
  "packageManager": "npm@12.0.2",
  "description": "Painel de mestre e apresentação local ou web de chefões para sessões de RPG.",
  "main": ".vite/build/main.js",
  "private": true,
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Duaaaal/BossBar-T20.git"
  },
  "homepage": "https://github.com/Duaaaal/BossBar-T20#readme",
  "bugs": {
    "url": "https://github.com/Duaaaal/BossBar-T20/issues"
  },
  "scripts": {
    "prestart": "vite build --config vite.web.config.mts",
    "start": "electron-forge start",
    "test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/*.test.mjs",
    "coverage:netcode": "c8 --all --include=src/multiplayer/**/*.ts --include=src/shared/multiplayer.ts --include=src/web-player-api.ts --check-coverage --lines 55 --statements 55 --branches 65 --functions 55 --reporter=text --reporter=html --reporter=lcov npm test",
    "fixtures:media": "node scripts/generate-test-media.mjs",
    "build:web:test": "vite build --config vite.web.config.mts",
    "test:e2e:web": "npm run build:web:test && playwright test --config playwright.web.config.mts",
    "test:e2e:electron": "npm run package && playwright test --config playwright.electron.config.mts",
    "test:e2e": "npm run test:e2e:web && npm run test:e2e:electron",
    "smoke:tunnel": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/smoke-quick-tunnel.mjs",
    "typecheck": "tsc --noEmit",
    "verify": "npm run lint && npm run typecheck && npm test",
    "assets:status": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-status-icons.ps1",
    "package": "electron-forge package",
    "make": "node scripts/make.mjs",
    "publish": "electron-forge publish",
    "lint": "eslint --ext .ts,.tsx,.mts ."
  },
  "keywords": [
    "electron",
    "rpg",
    "bossbar-t20",
    "discord",
    "multiplayer",
    "self-hosted"
  ],
  "author": {
    "name": "Brian Nascimento"
  },
  "license": "MIT",
  "devDependencies": {
    "@electron-forge/cli": "^7.11.2",
    "@electron-forge/maker-squirrel": "^7.11.2",
    "@electron-forge/plugin-fuses": "^7.11.2",
    "@electron-forge/plugin-vite": "^7.11.2",
    "@electron/fuses": "^1.8.0",
    "@playwright/test": "1.61.1",
    "@types/electron-squirrel-startup": "^1.0.2",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@typescript-eslint/eslint-plugin": "8.64.0",
    "@typescript-eslint/parser": "8.64.0",
    "@vitejs/plugin-react": "6.0.3",
    "c8": "12.0.0",
    "electron": "43.1.1",
    "eslint": "^8.57.1",
    "eslint-plugin-import": "^2.32.0",
    "typescript": "^5.9.3",
    "vite": "8.1.5"
  },
  "dependencies": {
    "@fastify/helmet": "13.1.0",
    "@fastify/rate-limit": "11.1.0",
    "@fastify/static": "10.1.2",
    "electron-squirrel-startup": "^1.0.1",
    "fastify": "5.12.1",
    "music-metadata": "11.14.0",
    "pdf-lib": "1.17.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "socket.io": "4.8.3",
    "socket.io-client": "4.8.3",
    "zod": "4.4.3"
  },
  "overrides": {
    "@electron/node-gyp": "10.2.0-electron.2"
  },
  "allowScripts": {
    "electron-winstaller@5.4.4": true
  }
}
~~~

## Todos os arquivos versionados na base beta.4

Inclui recursos binários pelos nomes, sem copiar seu conteúdo. Não inclui node_modules, perfil de usuário e saídas ignoradas. Os dois relatórios de handoff são novos e ainda não constavam na base commitada.

~~~text
.eslintrc.json
.github/workflows/quality.yml
.github/workflows/tunnel-smoke.yml
.gitignore
.npmrc
Icones/BossBar.png
Icones/Escudo.jpg
"Icones/Ponto de a\303\247\303\243o & ponto her\303\263ico.png"
Icones/Status.png
Icones/Status_Coringa.png
Icones/a_distancia.png
Icones/cog.png
Icones/corpo_a_corpo.png
Imagens/Fundo espera 1.png
LICENSE
Musica/.gitkeep
README.md
SFX/.gitkeep
SFX/Mecanica_Cura/heal_1.mp3
SFX/Mecanica_Cura/heal_2.mp3
SFX/Mecanica_Dano/Crit_1.mp3
SFX/Mecanica_Dano/Crit_2.mp3
SFX/Mecanica_Dano/Dano_1.mp3
SFX/Mecanica_Dano/Dano_2.mp3
SFX/Mecanica_Dano/Dano_3.mp3
SFX/Mecanica_Dano/Dano_4.mp3
SFX/Mecanica_Escudo/escudo_quebrando.mp3
SFX/Mecanica_Escudo/impacto_escudo_1.mp3
SFX/Mecanica_Escudo/impacto_escudo_2.mp3
SFX/Mecanica_Escudo/impacto_escudo_3.mp3
SFX/Mecanica_Rolagem_Dados/dice_1.mp3
SFX/Mecanica_Rolagem_Dados/dice_2.mp3
SFX/Mecanica_Rolagem_Dados/dice_3.mp3
SFX/Mecanica_Rolagem_Dados/fracasso_natural_1.mp3
SFX/Mecanica_Rolagem_Dados/fracasso_natural_2.mp3
SFX/Mecanica_Rolagem_Dados/sucesso_natural_inimigo.mp3
SFX/Mecanica_Rolagem_Dados/sucesso_natural_jogador.mp3
assets/README.md
assets/SFX/Mecanica_Rolagem_Dados/dice_1.mp3
assets/SFX/Mecanica_Rolagem_Dados/dice_2.mp3
assets/SFX/Mecanica_Rolagem_Dados/dice_3.mp3
assets/SFX/Mecanica_Rolagem_Dados/fracasso_natural_1.mp3
assets/SFX/Mecanica_Rolagem_Dados/fracasso_natural_2.mp3
assets/SFX/Mecanica_Rolagem_Dados/sucesso_natural_inimigo.mp3
assets/SFX/Mecanica_Rolagem_Dados/sucesso_natural_jogador.mp3
assets/bossbar-icon.ico
assets/bossbar-icon.png
assets/cog.png
assets/ficha-t20-v2-editavel.pdf
assets/player-resource-points.png
assets/shield-icon.png
assets/status-icons/status-01-abalado.png
assets/status-icons/status-02-agarrado.png
assets/status-icons/status-03-alquebrado.png
assets/status-icons/status-04-apavorado.png
assets/status-icons/status-05-atordoado.png
assets/status-icons/status-06-caido.png
assets/status-icons/status-07-cego.png
assets/status-icons/status-08-confuso.png
assets/status-icons/status-09-debilitado.png
assets/status-icons/status-10-desprevenido.png
assets/status-icons/status-11-doente.png
assets/status-icons/status-12-em-chamas.png
assets/status-icons/status-13-enfeiticado.png
assets/status-icons/status-14-enjoado.png
assets/status-icons/status-15-enredado.png
assets/status-icons/status-16-envenenado.png
assets/status-icons/status-17-esmorecido.png
assets/status-icons/status-18-exausto.png
assets/status-icons/status-19-fascinado.png
assets/status-icons/status-20-fatigado.png
assets/status-icons/status-21-fraco.png
assets/status-icons/status-22-frustrado.png
assets/status-icons/status-23-imovel.png
assets/status-icons/status-24-inconsciente.png
assets/status-icons/status-25-indefeso.png
assets/status-icons/status-26-lento.png
assets/status-icons/status-27-ofuscado.png
assets/status-icons/status-28-paralisado.png
assets/status-icons/status-29-pasmo.png
assets/status-icons/status-30-petrificado.png
assets/status-icons/status-31-sangrando.png
assets/status-icons/status-32-sobrecarregado.png
assets/status-icons/status-33-surdo.png
assets/status-icons/status-34-surpreendido.png
assets/status-icons/status-35-vulneravel.png
assets/status-icons/status-36-coringa.png
assets/ui/a-distancia.png
assets/ui/corpo-a-corpo.png
assets/waiting-background.png
attack-library.html
control.html
docs/COMMIT_SUMMARY.md
docs/KNOWN-ISSUES.md
docs/RELEASE-2.0.0-beta.3.md
docs/attack-library-and-resistances.md
docs/encounter-checkpoints-and-cutscenes.md
docs/final-touches-and-pdf-validation.md
docs/visual-audit.md
encounter-debugger.html
forge.config.ts
forge.env.d.ts
launcher.html
library.html
master.html
package-lock.json
package.json
player.html
playwright.electron.config.mts
playwright.web.config.mts
scene-editor.html
scripts/build-status-icons.ps1
scripts/generate-test-media.mjs
scripts/make.mjs
scripts/smoke-quick-tunnel.mjs
scripts/test-fixtures/test-tone.mp3
soundboard.html
src/AttackFields.tsx
src/AttackLibrary.tsx
src/CutscenePlayer.tsx
src/FightHistory.tsx
src/PhaseEntrance.tsx
src/SceneMediaFitControl.tsx
src/StatusRichText.tsx
src/attack-library-store.ts
src/attack-library.css
src/attack-library.tsx
src/control.css
src/control.tsx
src/critical-presentation.ts
src/custom-status-library-store.ts
src/cutscene-coordinator.ts
src/cutscene.css
src/encounter-debugger.css
src/encounter-debugger.tsx
src/encounter-presence.css
src/gapless-audio-loop.ts
src/global.d.ts
src/launcher.css
src/launcher.tsx
src/library.css
src/library.tsx
src/main.ts
src/master.css
src/master.tsx
src/multiplayer/character-sheet-pdf.ts
src/multiplayer/player-profile-store.ts
src/multiplayer/public-presentation.ts
src/multiplayer/quick-tunnel.ts
src/multiplayer/session-roster.ts
src/multiplayer/session-security.ts
src/multiplayer/session-server.ts
src/notes-html.ts
src/phase-audio-handoff.ts
src/player.css
src/player.tsx
src/preload-attack-library.ts
src/preload-control.ts
src/preload-encounter-debugger.ts
src/preload-launcher.ts
src/preload-library.ts
src/preload-master.ts
src/preload-player.ts
src/preload-scene-editor.ts
src/preload-soundboard.ts
src/preload.ts
src/presentation-media-cache.ts
src/scene-editor.css
src/scene-editor.tsx
src/scrollbars.css
src/sfx-music-ducking.ts
src/shared/api.ts
src/shared/attack-options.ts
src/shared/battle.ts
src/shared/boss-attacks.ts
src/shared/boss-skills.ts
src/shared/bundled-assets.ts
src/shared/character-sheet-draft.ts
src/shared/character-sheet.ts
src/shared/client-presentation-preferences.ts
src/shared/custom-status-library.ts
src/shared/d20-rules.ts
src/shared/disabled-controls.ts
src/shared/encounter-checkpoint.ts
src/shared/encounter-debugger.ts
src/shared/encounter-history.ts
src/shared/library.ts
src/shared/media-cache.ts
src/shared/media.ts
src/shared/multiplayer.ts
src/shared/player-combat.ts
src/shared/player-defenses.ts
src/shared/player-hud-values.ts
src/shared/player-notes.ts
src/shared/player-survival.ts
src/shared/preload.ts
src/shared/resistance.ts
src/shared/scene.ts
src/shared/status-rules.ts
src/shared/status.ts
src/shared/undo-shortcut.ts
src/shared/window-layout.ts
src/soundboard.css
src/soundboard.tsx
src/status-rich-text.css
src/ui-theme.css
src/web-player-api.ts
src/web-player.css
src/web-player.ts
tests/attack-library.test.mjs
tests/battle.test.mjs
tests/boss-skills.test.mjs
tests/bundled-assets.test.mjs
tests/character-sheet-draft.test.mjs
tests/critical-presentation.test.mjs
tests/custom-status-library.test.mjs
tests/cutscene.test.mjs
tests/e2e/electron/application-flow.spec.ts
tests/e2e/electron/attack-library.spec.ts
tests/e2e/electron/encounter-checkpoint.spec.ts
tests/e2e/electron/final-touches.spec.ts
tests/e2e/electron/visual-layout.spec.ts
tests/e2e/snapshots/chromium/battle-hud.png
tests/e2e/snapshots/chromium/waiting-content.png
tests/e2e/snapshots/chromium/waiting-screen.png
tests/e2e/snapshots/firefox/battle-hud.png
tests/e2e/snapshots/firefox/waiting-content.png
tests/e2e/snapshots/firefox/waiting-screen.png
tests/e2e/support/hosted-session.ts
tests/e2e/web/attack-resistance.spec.ts
tests/e2e/web/compatibility.spec.ts
tests/e2e/web/cutscene-resume.spec.ts
tests/e2e/web/encounter-presence.spec.ts
tests/e2e/web/import-and-media-fit.spec.ts
tests/e2e/web/load.spec.ts
tests/e2e/web/network-ordering.spec.ts
tests/e2e/web/party-turns.spec.ts
tests/e2e/web/player-tools.spec.ts
tests/e2e/web/roll-undo.spec.ts
tests/e2e/web/sfx-music-ducking.spec.ts
tests/e2e/web/visual-layout.spec.ts
tests/e2e/web/visual.spec.ts
tests/encounter-debugger.test.mjs
tests/fixtures/media/test-animation.gif
tests/fixtures/media/test-background.png
tests/fixtures/media/test-tone.mp3
tests/fixtures/media/test-video.mp4
tests/gapless-audio.test.mjs
tests/media.test.mjs
tests/multiplayer.test.mjs
tests/phase-audio-handoff.test.mjs
tests/player-combat.test.mjs
tests/player-notes.test.mjs
tests/player-profile.test.mjs
tests/player-survival.test.mjs
tests/preload.test.mjs
tests/quick-tunnel.test.mjs
tests/scene.test.mjs
tests/sfx-music-ducking.test.mjs
tests/status-rules.test.mjs
tests/status.test.mjs
tests/web-player.test.mjs
tests/window-layout.test.mjs
tsconfig.json
vite.main.config.ts
vite.preload.config.ts
vite.renderer.config.mts
vite.web.config.mts
web-player.html
~~~

## Registro IPC do main

Busca textual de registros diretos ipcMain.handle/on. Consulte corpo de cada handler, validação de remetente e whitelist do papel antes de expandir acesso. Ter um método em BossAPI não significa que todas as janelas podem chamá-lo.

~~~text
4989:ipcMain.handle('scene:continue-cutscene', (event) => isMasterSender(event.sender.id) && finishCutscene());
4990:ipcMain.handle('presentation:media', (event) => {
4994:ipcMain.on('scene:cutscene-ready', (event, id: unknown, duration: unknown) => {
5276:ipcMain.handle('battle:get-state', (event) => {
5280:ipcMain.handle('multiplayer:get-player-huds', (event) => {
5288:ipcMain.handle('multiplayer:get-turn-state', (event) => {
5296:ipcMain.handle(
5353:ipcMain.handle(
5384:ipcMain.handle(
5484:ipcMain.handle('app:get-version', (event) => {
5488:ipcMain.handle('app:undo', (event) => {
5499:ipcMain.handle('presentation:is-open', (event) => {
5504:ipcMain.handle('control:set-minimized', (event, minimized: unknown) => {
5535:ipcMain.on('app:confirm-close', (event) => {
5546:ipcMain.handle('encounter-debugger:open-window', (event) => {
5552:ipcMain.handle('encounter-debugger:get-snapshot', (event) => {
5557:ipcMain.handle(
5567:ipcMain.handle('app:return-to-launcher', async (event) => {
5582:ipcMain.handle(
5590:ipcMain.handle(
5641:ipcMain.handle('background:clear', (event) => {
5650:ipcMain.handle('presentation:open', (event) => {
5661:ipcMain.handle('scene:open-window', (event) => {
5667:ipcMain.handle('scene:open-active-playlist', (event) => {
5688:ipcMain.handle('scene:release-blackout', (event) =>
5698:ipcMain.handle('scene:activate-blackout', (event) =>
5708:ipcMain.handle(
5745:ipcMain.on('scene:confirm-close', (event) => {
5753:ipcMain.handle('scene:get-state', (event) => {
5762:ipcMain.handle('scene:reset-draft', (event): ScenePlanDraft | null => {
5790:ipcMain.handle('scene:save', (event, value: unknown): SceneSaveResult => {
5800:ipcMain.handle(
5892:ipcMain.handle(
5926:ipcMain.handle('soundboard:open-window', (event) => {
5932:ipcMain.handle(
6003:ipcMain.on('scene-playlist:dispatch', (
6165:ipcMain.handle('library:open-window', (event) => {
6172:ipcMain.handle('library:has-entries', (event) => {
6197:ipcMain.handle('launcher:new-encounter', (event) => {
6205:ipcMain.handle('custom-status-library:get', async (event) => {
6210:ipcMain.handle('attack-library:open', (event) => {
6215:ipcMain.handle('multiplayer:set-player-control', (event, playerId: unknown, controlled: unknown) => {
6220:ipcMain.handle('multiplayer:controlled-player-action', (event, playerId: unknown, request: unknown) => {
6225:ipcMain.on('attack-library:close', (event) => {
6228:ipcMain.handle('attack-library:get', async (event) => {
6232:ipcMain.handle('player:roll-resistance', (event, id: unknown) => {
6237:ipcMain.handle('attack-library:save', async (event, attack: unknown, remove: unknown) => {
6244:ipcMain.handle(
6269:ipcMain.handle(
6296:ipcMain.handle(
6311:ipcMain.handle('multiplayer:get-session', (event): HostedSessionState => {
6321:ipcMain.handle('multiplayer:approve-player', (event, requestId: unknown) => {
6328:ipcMain.handle('multiplayer:kick-player', (event, playerId: unknown) => {
6333:ipcMain.handle(
6348:ipcMain.handle(
6361:ipcMain.handle(
6374:ipcMain.handle(
6387:ipcMain.handle(
6400:ipcMain.handle(
6413:ipcMain.handle(
6434:ipcMain.handle('multiplayer:reject-player', (event, requestId: unknown) => {
6441:ipcMain.handle(
6476:ipcMain.handle('multiplayer:copy-link', (event, requestedLink: unknown) => {
6491:ipcMain.handle('multiplayer:open-local-player', async (event) => {
6503:ipcMain.handle('multiplayer:open-player-sheet', async (event, playerId: unknown) => {
6510:ipcMain.handle(
6529:ipcMain.handle(
6556:ipcMain.handle(
6582:ipcMain.handle('multiplayer:get-player-profiles', async (event) => {
6587:ipcMain.handle('multiplayer:open-profile-sheet', async (event, profileId: unknown) => {
6594:ipcMain.handle(
6624:ipcMain.handle(
6651:ipcMain.handle('notes:get-master', async (event) => {
6661:ipcMain.handle(
6692:ipcMain.handle(
6752:ipcMain.handle(
6782:ipcMain.handle('library:get-entries', (event): BossLibraryEntrySummary[] => {
6787:ipcMain.handle(
7136:ipcMain.handle('encounter:reset', async (event) => {
7160:ipcMain.handle(
7199:ipcMain.handle(
7389:ipcMain.on('library:close-window', (event) => {
7393:ipcMain.handle('music:get-state', (event): MusicState => {
7397:ipcMain.handle('scene:music-control', (event, ownerId: unknown, command: unknown) => {
7428:ipcMain.on('music:control', (event, value: unknown) => {
7506:ipcMain.handle('soundboard:get-state', (event): SoundboardState => {
7514:ipcMain.handle('encounter-effects:get-state', (event) => {
7521:ipcMain.handle('encounter-sounds:get-state', (event) => {
7525:ipcMain.handle(
7611:ipcMain.handle(
7647:ipcMain.handle(
7684:ipcMain.on('audio:set-universal-muted', (event, muted: unknown) => {
7698:ipcMain.on('encounter-effects:set-volume', (event, volume: unknown) => {
7734:ipcMain.on(
7758:ipcMain.on(
7782:ipcMain.on(
7808:ipcMain.handle(
7904:ipcMain.on('soundboard:dispatch', (event, command: unknown) => {
7985:ipcMain.on('soundboard:playback-finished', (event, effectId: unknown) => {
7995:ipcMain.on(
8007:ipcMain.on(
8019:ipcMain.on(
8058:ipcMain.on('music:track-ended', (event) => {
8065:ipcMain.on('music:progress', (event, playback: unknown) => {
8092:ipcMain.on('music:fadeout-complete', (event) => {
8104:ipcMain.on('presentation:ready', (event) => {
8116:ipcMain.on('background:progress', (event, url: unknown, time: unknown) => {
8120:ipcMain.handle('multiplayer:get-pending-boss-damage', (event, bossId: unknown) => {
8126:ipcMain.on('background:load-error', (event, message: unknown) => {
8421:ipcMain.handle(
8514:ipcMain.handle(
8535:ipcMain.handle(
8563:ipcMain.handle(
8599:ipcMain.handle(
8780:ipcMain.on('battle:dispatch', (event, command: unknown) => {
~~~

## Listeners Socket.IO do servidor

Inventário textual de socket.on; eventos emitidos e estruturas estão em shared/multiplayer.ts e session-server.ts. Não é uma especificação completa de protocolo.

~~~text
4577:    socket.on('disconnect', () => {
4658:    socket.on('session:clock', (acknowledge) => {
4661:    socket.on('presentation:cutscene-ready', (id, duration) => {
4733:    socket.on('player:set-sheet-editor-open', (open, acknowledge) => {
4744:    socket.on('player:set-private', (privateMode, acknowledge) => {
4753:    socket.on('player:roll-resistance', (id, acknowledge) => {
4758:    socket.on('player:auto-resistance', (enabled, acknowledge) => {
4764:    socket.on('player:use-action', (action, acknowledge) => {
4821:    socket.on('encounter:end-own-turn', (acknowledge) => {
4855:    socket.on('encounter:roll-initiative', (extremeAdvantage, acknowledge) => {
4866:    socket.on('encounter:combat-action', async (request, acknowledge) => {
~~~

## Rotas HTTP registradas diretamente

Rotas de plugins/mídia também devem ser conferidas; não assumir que esta busca lista todas as rotas do Fastify.

~~~text
984:    app.get('/api/health', {
993:    app.get('/api/session', {
1005:    app.post('/api/player/account-status', {
1022:    app.post('/api/player/authenticate', {
1059:    app.get('/api/player/profile', {
1098:    app.post('/api/player/portrait', {
1136:    app.delete('/api/player/portrait', {
1146:    app.put('/api/player/notes', {
1167:    app.get('/api/player/blank-sheet', {
1189:    app.post('/api/player/sheet/view-ticket', {
1210:    app.get('/api/player/sheet/view', {
1235:    app.get('/api/player/sheet/editor', {
1246:    app.put('/api/player/sheet/editor', {
1267:    app.delete('/api/player/sheet/import', {
1279:    app.delete('/api/player/sheet', {
1297:    app.post('/api/player/sheet', {
1335:    app.post('/api/player/sheet/autofix', {
1355:    app.get('/api/preload', {
1383:    app.post('/api/session-cache/clear', {
1507:      app.get('/', async (_request, reply) => reply
~~~

## Pontos de entrada do contrato BossAPI

Inventário textual dos membros; assinaturas multilinha completas estão em src/shared/api.ts. A separação de privilégios está em src/shared/preload.ts.

~~~text
92:  openAttackLibrary: () => Promise<boolean>;
93:  setHostedPlayerControl: (playerId: string, controlled: boolean) => Promise<boolean>;
94:  requestControlledPlayerAction: (playerId: string, request: PlayerCombatActionRequest) => Promise<PlayerCombatActionResult>;
95:  closeAttackLibrary: () => void;
96:  rollResistance: (id: string) => Promise<{ ok: boolean; error?: string }>;
97:  setAutomaticResistance: (enabled: boolean) => Promise<boolean>;
98:  getAttackLibrary: () => Promise<import('./boss-attacks').BossAttack[]>;
99:  saveLibraryAttack: (attack: import('./boss-attacks').BossAttack, remove?: boolean) => Promise<{ ok: boolean; attacks?: import('./boss-attacks').BossAttack[]; error?: string }>;
100:  resetEncounter: () => Promise<boolean>;
101:  getPresentationMedia: () => Promise<string[]>;
102:  controlSceneMusic: (ownerId: string, command: { type: 'toggle' } | { type: 'seek'; time: number }) => Promise<boolean>;
103:  getState: () => Promise<BattleState>;
104:  getAppVersion: () => Promise<string>;
105:  undoLastChange: () => Promise<boolean>;
106:  confirmAppClose: () => void;
107:  dispatch: (command: BattleCommand) => void;
108:  applyHealthSequence: (
111:  applyAreaDamage: (request: AreaDamageRequest) => Promise<AreaDamageResult>;
112:  applyDirectPlayerDamage: (
115:  resolveDirectPlayerDamage: (
118:  applyPlayerStatus: (
121:  getPlayerHuds: () => Promise<PlayerHudState[]>;
122:  getPendingBossDamage: (bossId: string) => Promise<PendingBossDamageSummary | null>;
123:  getEncounterTurnState: () => Promise<EncounterTurnState>;
124:  advanceEncounterTurn: (
127:  rollEncounterInitiative: (
131:  rollEncounterFormula: (
134:  requestPlayerCombatAction: (
137:  approveActionPointRequest: (
140:  rejectActionPointRequest: (
143:  grantHostedHeroPoint: (
146:  grantHostedActionPoint: (
149:  revokeHostedHeroPoint: (
152:  revokeHostedActionPoint: (
155:  setHostedUnarmedStrikeEnabled: (
159:  setCharacterPrivate: (
162:  usePlayerAction: (
165:  openPresentation: () => Promise<boolean>;
166:  isPresentationOpen: () => Promise<boolean>;
167:  setControlPanelMinimized: (minimized: boolean) => Promise<boolean>;
168:  getCustomStatusLibrary: () => Promise<CustomStatusPreset[]>;
169:  createCustomStatusPreset: (
172:  deleteCustomStatusPreset: (
175:  openSoundboardWindow: () => Promise<boolean>;
176:  openSceneEditor: () => Promise<boolean>;
177:  confirmSceneEditorClose: () => void;
178:  getScenePlan: () => Promise<ScenePlan>;
179:  saveScenePlan: (draft: ScenePlanDraft) => Promise<SceneSaveResult>;
180:  resetSceneDraft: () => Promise<ScenePlanDraft | null>;
181:  chooseScenePhaseMedia: (
185:  clearScenePhaseMedia: (
189:  openScenePhasePlaylist: (
195:  addScenePhasePlaylistTracks: (
199:  dispatchScenePhasePlaylist: (
204:  openBossLibrary: () => Promise<boolean>;
205:  openEncounterDebugger: () => Promise<boolean>;
206:  getEncounterDebugSnapshot: () => Promise<EncounterDebugSnapshot>;
207:  overwriteEncounterDebugCreature: (
210:  hasEncounterLibraryEntries: () => Promise<boolean>;
211:  startNewEncounter: () => Promise<boolean>;
212:  startHostedEncounter: () => Promise<HostedEncounterStartResult>;
213:  returnToLauncher: () => Promise<boolean>;
214:  getHostedSessionState: () => Promise<HostedSessionState>;
215:  setHostedSessionPublicUrl: (
218:  copyHostedSessionLink: (link?: string) => Promise<boolean>;
219:  openHostedSessionAsPlayer: () => Promise<boolean>;
220:  approveHostedPlayer: (requestId: string) => Promise<boolean>;
221:  kickHostedPlayer: (playerId: string) => Promise<boolean>;
222:  rejectHostedPlayer: (requestId: string) => Promise<boolean>;
223:  openHostedPlayerSheet: (playerId: string) => Promise<boolean>;
224:  resetHostedPlayerPassword: (
228:  deleteHostedPlayerAccount: (
231:  getPlayerProfiles: () => Promise<PlayerProfileSummary[]>;
232:  openPlayerProfileSheet: (profileId: string) => Promise<boolean>;
233:  resetPlayerProfilePassword: (
237:  deletePlayerProfile: (
240:  decidePlayerSheetChanges: (
244:  getMasterNotes: () => Promise<string>;
245:  saveMasterNotes: (content: string) => Promise<NotesSaveResult>;
246:  getBossLibraryEntries: () => Promise<BossLibraryEntrySummary[]>;
247:  saveBossToLibrary: (
251:  saveBossAutosave: (
254:  loadBossFromLibrary: (
258:  replaceBossLibraryFile: (
262:  deleteBossLibraryEntry: (
265:  closeBossLibrary: () => void;
266:  getMusicState: () => Promise<MusicState>;
267:  dispatchMusicControl: (command: MusicControlCommand) => void;
268:  openActivePhasePlaylist: () => Promise<boolean>;
269:  setUniversalMute: (muted: boolean) => void;
270:  getEncounterEffectsState: () => Promise<EncounterEffectsState>;
271:  setEncounterEffectsVolume: (volume: number) => void;
272:  setEncounterGeneralEnabled: (
276:  setEncounterSoundEnabled: (
280:  setEncounterVisualEffectEnabled: (
284:  getEncounterSoundCustomization: () => Promise<EncounterSoundCustomizationState>;
285:  addEncounterSound: (
288:  setEncounterSoundOptionEnabled: (
292:  removeEncounterSound: (
295:  getSoundboardState: () => Promise<SoundboardState>;
296:  assignSoundboardSlot: (
301:  dispatchSoundboard: (command: SoundboardCommand) => void;
302:  releaseSceneBlackout: () => Promise<boolean>;
303:  continueCutscene: () => Promise<boolean>;
304:  reportCutsceneReady: (id: string, duration: number | null) => void;
305:  getPresentationTime: () => number;
306:  activateSceneBlackout: () => Promise<boolean>;
307:  soundEffectFinished: (effectId: number) => void;
308:  reportSoundEffectError: (effectId: number, index: number) => void;
309:  encounterEffectFinished: (effectId: number) => void;
310:  encounterEffectStarted: (effectId: number) => void;
311:  musicTrackEnded: () => void;
312:  musicFadeoutComplete: () => void;
313:  reportMusicProgress: (state: MusicPlaybackState) => void;
314:  chooseBackground: () => Promise<BackgroundSelectionResult>;
315:  clearBackground: () => Promise<boolean>;
316:  getBackground: () => Promise<BackgroundState>;
317:  presentationReady: () => void;
318:  reportBackgroundError: (message: string) => void;
319:  reportBackgroundProgress: (url: string, time: number) => void;
320:  subscribe: (callback: (state: BattleState) => void) => () => void;
321:  subscribeBackground: (
324:  subscribeBackgroundError: (
327:  subscribeHealthEffect: (
330:  subscribeAppCloseRequested: (callback: () => void) => () => void;
331:  subscribePresentationOpen: (callback: (open: boolean) => void) => () => void;
332:  subscribeBossLoaded: (
335:  subscribeBossLibraryChanged: (callback: () => void) => () => void;
336:  subscribeHostedSession: (
339:  subscribePlayerHuds: (
342:  subscribePlayerResourceNotice: (
345:  subscribeEncounterTurn: (
348:  subscribeHostedSessionStartupProgress: (
351:  subscribeMusic: (callback: (state: MusicState) => void) => () => void;
352:  subscribeMusicSeek: (callback: (time: number) => void) => () => void;
353:  subscribeMusicFadeOut: (
356:  subscribeMusicDuck: (
359:  subscribeSoundboard: (
362:  subscribeSoundEffect: (
365:  subscribeSoundboardStop: (
368:  subscribeSoundboardError: (
371:  subscribeEncounterEffects: (
374:  subscribeEncounterEffect: (
377:  subscribeScenePlan: (callback: (state: ScenePlan) => void) => () => void;
378:  subscribeSceneEditorCloseRequested: (callback: () => void) => () => void;
379:  subscribeScenePhasePlaylist: (
382:  subscribeActivePhasePlaylistRequested: (
385:  subscribeSceneTransition: (
~~~

## Navegação recomendada

1. Para uma mudança de estado: tipos shared → reducer/servidor/main → IPC/API → projeção pública → renderer → checkpoint/testes.
2. Para UI: renderer e CSS correspondente → estilos comuns → viewport tests e screenshots → fluxo Electron/web.
3. Para áudio: transporte autoritativo → preparação de mídia → player/graph/ducking → eventos de fim → handoff e registro de saída real.
4. Para PDF: campos do modelo → parser/validador → editor/staging → aprovação → perfil aceito → HUD/checkpoint → regressão de round-trip.
5. Para segurança: nunca transformar a API administrativa em API pública para resolver um problema de sincronização.
