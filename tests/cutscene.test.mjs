import assert from 'node:assert/strict';
import test from 'node:test';
import { CutsceneCoordinator } from '../src/cutscene-coordinator.ts';
import { createScenePlan, createSceneCutscene, sceneMediaOwners, cutscenePosition, cutsceneMusicPosition, cutsceneNextMusicPosition, playlistPosition, cutsceneFade, cutsceneMediaUrls } from '../src/shared/scene.ts';
import { initialBattleState } from '../src/shared/battle.ts';
import { emptyEncounterTurnState } from '../src/shared/player-combat.ts';
import { normalizeEncounterCheckpoint, resumeEncounterTurns } from '../src/shared/encounter-checkpoint.ts';
import { toPublicSceneState } from '../src/multiplayer/public-presentation.ts';

test('controle da música preserva pausa, posição e navegação independentemente do vídeo', () => {
  const playlist = { tracks: [{ id: 'a', duration: 3 }, { id: 'b', duration: 5 }], currentTrackId: 'a', loop: false };
  assert.deepEqual(playlistPosition(playlist, 4), { track: playlist.tracks[1], time: 1 });
  assert.equal(playlistPosition(playlist, 9).track, null);
  assert.equal(playlistPosition({ ...playlist, loop: true }, 9).time, 1);
  assert.equal(playlistPosition({ ...playlist, currentTrackId: 'b' }, 2).track.id, 'b');
  const cut = { offsetSeconds: 0, startedAt: 1000, musicTransport: { position: 2, updatedAt: 3000, playing: false } };
  assert.equal(cutsceneMusicPosition(cut, 7000), 2);
  assert.equal(cutscenePosition(cut, 7000), 6);
  assert.equal(cutsceneMusicPosition({ ...cut, musicTransport: { ...cut.musicTransport, playing: true } }, 7000), 6);
  assert.equal(createSceneCutscene('cut').videoMuted, false);
});

test('fades independentes preservam arquivos antigos e limitam a duração', () => {
  const cut = { ...createSceneCutscene('cut'), transitionDurationSeconds: 2,
    visualFadeInSeconds: 0.25, visualFadeOutSeconds: 4, audioFadeInSeconds: 1, audioFadeOutSeconds: 3 };
  assert.equal(cutsceneFade(cut, 'visual', 'in'), 0.25);
  assert.equal(cutsceneFade(cut, 'visual', 'out'), 4);
  assert.equal(cutsceneFade(cut, 'audio', 'in'), 1);
  assert.equal(cutsceneFade(cut, 'audio', 'out'), 3);
  assert.equal(cutsceneFade({ ...cut, audioFadeInSeconds: undefined }, 'audio', 'in'), 2);
  assert.equal(cutsceneFade({ ...cut, audioFadeInSeconds: 99 }, 'audio', 'in'), 10);
  assert.equal(cutsceneFade({ ...cut, transition: 'blackout' }, 'audio', 'out'), 0);
});

test('a próxima trilha começa no fim da mídia e mantém transporte independente durante a saída', () => {
  const cut = { startedAt: 1000, endingAt: 31000, offsetSeconds: 0, durationSeconds: 30,
    visualFadeOutSeconds: 5, audioFadeOutSeconds: 5 };
  assert.equal(cutsceneNextMusicPosition(cut, 30000), 0);
  assert.equal(cutsceneNextMusicPosition(cut, 31000), 0);
  assert.equal(cutsceneNextMusicPosition(cut, 36000), 5);
  const paused = { ...cut, nextMusicTransport: { position: 2, updatedAt: 32000, playing: false } };
  assert.equal(cutsceneNextMusicPosition(paused, 36000), 2);
  assert.equal(cutsceneNextMusicPosition({ ...paused, nextMusicTransport: { ...paused.nextMusicTransport, playing: true } }, 36000), 6);
});

test('os clientes recebem o mesmo relógio e os fades de entrada da fase sem dados privados', () => {
  const plan = createScenePlan(initialBattleState.bosses);
  plan.phaseEntrance = { phaseId: 'phase-1', startedAt: 1000, visualSeconds: 2, audioSeconds: 3 };
  const publicScene = toPublicSceneState(plan, () => null);
  assert.deepEqual(publicScene.phaseEntrance, plan.phaseEntrance);
  assert.equal('bossSlots' in publicScene, false);
});

test('próxima música entra no pré-carregamento e suas URLs também são opacas', () => {
  const plan = createScenePlan(initialBattleState.bosses);
  plan.cutscenePlayback = { ...createSceneCutscene('cut'), backgroundUrl: null, music: null, sound: null,
    nextMusic: { tracks: [{ id: 'next', url: 'boss-media://scene-audio/next', duration: 12 }], currentTrackId: 'next' } };
  assert.deepEqual(cutsceneMediaUrls(plan.cutscenePlayback), ['boss-media://scene-audio/next']);
  assert.equal(toPublicSceneState(plan, () => '/opaque').cutscenePlayback.nextMusic.tracks[0].url, '/opaque');
});

test('a cutscene só inicia depois da apresentação e de todos os navegadores', () => {
  const coordinator = new CutsceneCoordinator();
  let starts = 0;
  coordinator.prepare('one', ['electron', 'alice', 'bob'], () => starts++);
  assert.equal(coordinator.acknowledge('obsolete', 'alice'), false);
  coordinator.acknowledge('one', 'electron');
  coordinator.acknowledge('one', 'alice');
  assert.equal(starts, 0);
  coordinator.acknowledge('one', 'bob');
  coordinator.acknowledge('one', 'bob');
  assert.equal(starts, 1);
});

test('desconexão libera a barreira e cancelamento impede reprodução atrasada', () => {
  const coordinator = new CutsceneCoordinator();
  let starts = 0;
  coordinator.prepare('one', ['alice', 'bob'], () => starts++);
  coordinator.acknowledge('one', 'alice');
  coordinator.updateParticipants(['alice']);
  assert.equal(starts, 1);
  coordinator.prepare('two', ['bob'], () => starts++);
  coordinator.cancel();
  coordinator.acknowledge('two', 'bob');
  assert.equal(starts, 1);
});

test('cutscenes ficam entre fases sem contar como fases ou herdar chefões', () => {
  const plan = createScenePlan(initialBattleState.bosses);
  plan.phases.push({ ...plan.phases[0], id: 'phase-2' });
  plan.phases[0].cutscene = createSceneCutscene('cut-1');
  plan.phases[1].cutscene = createSceneCutscene('cut-unused');
  assert.deepEqual(sceneMediaOwners(plan.phases).map(({ id }) => id), ['phase-1', 'cut-1', 'phase-2']);
  assert.equal('bosses' in plan.phases[0].cutscene, false);
});

test('linha do tempo conserva posição no salvamento e reescreve URLs sem revelar cena futura', () => {
  const plan = createScenePlan(initialBattleState.bosses);
  plan.cutscenePlayback = { id: 'take-1', cutsceneId: 'cut-1', targetPhaseIndex: 1,
    stage: 'playing', startedAt: 1000, offsetSeconds: 4, durationSeconds: 30,
    advanceMode: 'manual', backgroundUrl: 'boss-media://scene-background/cut-1', mediaType: 'video',
    music: null, sound: null, transition: 'fade', transitionDurationSeconds: 1 };
  assert.equal(cutscenePosition(plan.cutscenePlayback, 4000), 7);
  assert.equal(cutscenePosition({ ...plan.cutscenePlayback, startedAt: null }, 4000), 4);
  const publicScene = toPublicSceneState(plan, () => '/session-media/opaque-token');
  assert.equal(publicScene.cutscenePlayback.backgroundUrl, '/session-media/opaque-token');
  assert.equal('phases' in publicScene, false);
});

test('checkpoint mantém rodada e elapsed sem contar o intervalo entre sessões', () => {
  const turns = { ...emptyEncounterTurnState(), round: 4, started: true, startedAt: 1000 };
  const checkpoint = { savedAt: 11_000, battleStarted: true, hudVisible: false,
    musicPlaying: true, musicTime: 17.5, backgroundTime: 0, activeBackgroundPath: null,
    pendingBlackoutPhaseIndex: 1, queuedPhaseIndexes: [2], resumeMusicAfterBlackout: true,
    multiplayer: { players: [], turns } };
  assert.deepEqual(normalizeEncounterCheckpoint(checkpoint), checkpoint);
  assert.equal(resumeEncounterTurns(turns, 11_000, 111_000).startedAt, 101_000);
  assert.equal(turns.startedAt, 1000);
  assert.equal(normalizeEncounterCheckpoint({ ...checkpoint, musicTime: -1 }), null);
  assert.equal(normalizeEncounterCheckpoint({ ...checkpoint, multiplayer: { ...checkpoint.multiplayer, players: [{}] } }), null);
});
