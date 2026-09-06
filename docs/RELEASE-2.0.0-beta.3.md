# BossBar 2.0.0-beta.3

Branch: `feature/multiplayer-web`.

## Resumo

- Ficha organizada por categorias e filtros, com retratos compartilhados, campos dinâmicos e ajustes de legibilidade.
- Melhorias nos HUDs, recursos do personagem, perícias, notificações, resultados desfeitos e histórico do encontro.
- Salvamento completo de encontros, incluindo personagens, condições, recursos, ordem de turnos, fases e posições das mídias.
- Retomada condicionada ao retorno dos participantes salvos, expulsão sem apagar contas e tratamento de desconexões com HUD acinzentado e pausa quando a ação do jogador for necessária.
- Cutscenes entre fases, com imagens/vídeos, playlists, áudio do vídeo independente, blackout, término manual/automático e fades configuráveis.
- Reset do encontro separado do reset total, com recuperação dos valores iniciais.
- Pré-carregamento e reutilização de áudio, melhorias de loop e redução proporcional da música durante SFX, restaurada ao fim real do efeito.
- Entrada de imagem e HUD após o blackout, com intervalo e fade próprios.
- Atualizações da cadeia de testes/CI, fixtures de mídia e cobertura de regressões locais/multiplayer.

## Limitação conhecida

**Stutter de áudio ainda presente, confirmado pelo usuário.** A investigação foi adiada para depois desta versão. Não apresentar esta versão como livre de microcortes. Consulte [problemas conhecidos](KNOWN-ISSUES.md).

## Validação

Antes da marcação da versão: lint e TypeScript aprovados, 186 testes unitários, 39 testes web e 2 testes Electron aprovados; 18 cenários web pulados pelos filtros existentes. Chromium, Chrome e Edge foram exercitados; Firefox não foi validado localmente. Os testes não garantem ausência de stutter em arquivos/dispositivos reais.

## Commit summary

```text
Version 2.0.0-beta.3 - encounter checkpoints, cutscenes and multiplayer polish

- Organize character editing with category filters, shared portraits and dynamic fields.
- Refine HUD resources, skill presentation, notifications, undo results and fight history.
- Persist complete boss/player checkpoints, sheets, conditions, resources, turns,
  pending damage, phases, blackout and media playback positions.
- Restore saved participants on authenticated reconnect, gate encounter resumption,
  support host kicks and preserve disconnected characters as targetable combatants.
- Add synchronized intermediate cutscenes with independent visual/video audio,
  playlists, manual/automatic completion, blackout and per-phase entrance controls.
- Separate encounter restart from application reset and preserve initial baselines.
- Improve media preloading, decoder handoff, bounded gapless loops and live controls.
- Duck music proportionally during player SFX and restore on actual playback end;
  start visual/HUD fades after the cutscene blackout.
- Update Fastify and npm/CI configuration, repair media fixtures and expand
  checkpoint, browser, audio, reconnection and Electron regression coverage.
- Record continuing audio/music stutter as an unresolved known issue for follow-up.
```
