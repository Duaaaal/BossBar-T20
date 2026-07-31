import { expect, type Page } from '@playwright/test';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import {
  initialEncounterEffectsState,
  type BackgroundState,
  type HealthEffect,
} from '../../../src/shared/battle';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type MultiplayerSessionSnapshot,
  type PublicBattlePresentationState,
  type PublicCombatImpact,
} from '../../../src/shared/multiplayer';
import {
  MultiplayerSessionServer,
  type SessionMediaResource,
} from '../../../src/multiplayer/session-server';
import { PlayerProfileStore } from '../../../src/multiplayer/player-profile-store';

const projectRoot = path.resolve(process.cwd());
const mediaRoot = path.join(projectRoot, 'tests', 'fixtures', 'media');
const webRoot = path.join(tmpdir(), 'bossbar-t20-web-player-dev');

export const TEST_MEDIA_IDS = {
  background: 'background-initial-0001',
  animation: 'animation-fixture-0001',
  video: 'video-fixture-0000001',
  music: 'music-fixture-0000001',
  slowBackground: 'background-slow-00001',
  fastBackground: 'background-fast-00001',
  impactSound: 'impact-sound-00000001',
} as const;

const mediaResources = new Map<string, SessionMediaResource>([
  [TEST_MEDIA_IDS.background, {
    filePath: path.join(mediaRoot, 'test-background.png'),
    contentType: 'image/png',
  }],
  [TEST_MEDIA_IDS.animation, {
    filePath: path.join(mediaRoot, 'test-animation.gif'),
    contentType: 'image/gif',
  }],
  [TEST_MEDIA_IDS.video, {
    filePath: path.join(mediaRoot, 'test-video.mp4'),
    contentType: 'video/mp4',
  }],
  [TEST_MEDIA_IDS.music, {
    filePath: path.join(mediaRoot, 'test-tone.mp3'),
    contentType: 'audio/mpeg',
  }],
  [TEST_MEDIA_IDS.slowBackground, {
    filePath: path.join(mediaRoot, 'test-background.png'),
    contentType: 'image/png',
  }],
  [TEST_MEDIA_IDS.fastBackground, {
    filePath: path.join(mediaRoot, 'test-animation.gif'),
    contentType: 'image/gif',
  }],
  [TEST_MEDIA_IDS.impactSound, {
    filePath: path.join(mediaRoot, 'test-tone.mp3'),
    contentType: 'audio/mpeg',
  }],
]);

export const createPublicBattle = ({
  battleStarted = false,
  currentHealth = 100,
  revision = 1,
}: {
  battleStarted?: boolean;
  currentHealth?: number;
  revision?: number;
} = {}): PublicBattlePresentationState => ({
  bosses: [{
    id: 'boss-e2e',
    setupStatus: 'ready',
    bossName: 'Dragão de Teste',
    maxHealth: 100,
    currentHealth,
    shield: 0,
    initiative: 10,
    nextAction: 'Investida de validação',
    actionSeverity: 'normal',
    turnCount: 0,
    activeStatuses: [],
  }],
  battleStarted,
  hudVisible: true,
  revision,
});

const playerOnlyInvite = (inviteUrl: string) => {
  const parsed = new URL(inviteUrl);
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  fragment.delete('host');
  parsed.hash = fragment.toString();
  return parsed.toString();
};

export type HostedTestSession = {
  server: MultiplayerSessionServer;
  inviteUrl: string;
  mediaRequests: Map<string, number>;
  mediaUrl: (id: string) => string;
  close: () => Promise<void>;
};

export const createEditableCharacterSheet = async ({
  characterName = 'Valora',
  playerName = 'Jogador Ferramentas',
  autoFixIssue = false,
}: {
  characterName?: string;
  playerName?: string;
  autoFixIssue?: boolean;
} = {}) => {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  const form = document.getForm();
  const values: Record<string, string> = {
    'NOME DO PERSONAGEM': characterName,
    JOGADOR: playerName,
    'RAÇA': 'Humana',
    ORIGEM: 'Guarda',
    CLASSE: 'Guerreiro',
    Lv: '1',
    For: '14', ModFor: '2',
    Des: '10', ModDes: '0',
    Con: '12', ModCon: '1',
    Int: '10', ModInt: '0',
    Sab: '10', ModSab: '0',
    Car: '10', ModCar: '0',
    'PVs Totais': '21', 'PVs Atuais': '21',
    'PMs Totais': '3', 'PMs Atuais': '3',
    CA: autoFixIssue ? '99' : '10', 'Base CA': '10', 'B.Arm': '0', 'B.Esc': '0',
    'Outros B.CA': '0', ModAtribDefe: '0',
    TesteResist: '10', ModAtribMagia: '0',
    Desloc: '9m', SeleTamanho: 'Médio', CargaTotal: '3',
    'Ataque 1': 'Espada longa', 'Bônus Atq 1': '+5',
    'Dano 1': '1d8+2', 'Crítico 1': '19/x2',
    'Tipo 1': 'Corte', 'Alcance 1': 'Corpo a corpo',
    'Descrição': '', Pa: '0', Pe: '0', ModFurtTam: '0',
  };
  for (let index = 1; index <= 30; index += 1) {
    const code = String(index * 10).padStart(3, '0');
    values[code] = '0';
    values[index === 30 ? '301' : `${String(index).padStart(2, '0')}1`] = '0';
    values[index === 30 ? '303' : `${String(index).padStart(2, '0')}3`] = '0';
    values[index === 30 ? '304' : `${String(index).padStart(2, '0')}4`] = '0';
  }
  values['270'] = '2';
  values['273'] = '2';
  for (const name of [
    'ModAtribAcro', 'ModAtribAdes', 'ModAtribAtle', 'ModAtribAtua',
    'ModAtribCava', 'ModAtribConh', 'ModAtribCura', 'ModAtribDipl',
    'ModAtribEnga', 'ModAtribFort', 'ModAtribFurt', 'ModAtribGuer',
    'ModAtribInic', 'ModAtribInti', 'ModAtribIntu', 'ModAtribInve',
    'ModAtribJoga', 'ModAtribLadi', 'ModAtribLuta', 'ModAtribMist',
    'ModAtribPilo', 'ModAtribNobr', 'ModAtribOfi1', 'ModAtribOfi2',
    'ModAtribPerc', 'ModAtribPont', 'ModAtribRefl', 'ModAtribReli',
    'ModAtribSobr', 'ModAtribVont',
  ]) values[name] = '0';
  for (const [name, value] of Object.entries(values)) {
    form.createTextField(name).setText(value);
  }
  const heavyArmor = form.createCheckBox('arm pesa');
  heavyArmor.addToPage(page, { x: 8, y: 8, width: 8, height: 8 });
  heavyArmor.check();
  const trainedReflexes = form.createCheckBox('Mar Trei refle');
  trainedReflexes.addToPage(page, { x: 20, y: 8, width: 8, height: 8 });
  trainedReflexes.check();
  return Buffer.from(await document.save({ updateFieldAppearances: false }));
};

export const startHostedTestSession = async ({
  battleStarted = false,
  preloadMediaIds = [
    TEST_MEDIA_IDS.background,
    TEST_MEDIA_IDS.animation,
    TEST_MEDIA_IDS.video,
    TEST_MEDIA_IDS.music,
  ],
}: {
  battleStarted?: boolean;
  preloadMediaIds?: string[];
} = {}): Promise<HostedTestSession> => {
  const mediaRequests = new Map<string, number>();
  const profileDirectory = path.join(
    tmpdir(),
    `bossbar-e2e-players-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const playerProfileStore = await PlayerProfileStore.open(profileDirectory);
  const server = await MultiplayerSessionServer.start({
    playerProfileStore,
    networkMode: 'loopback',
    port: 0,
    webRoot,
    webIndexFile: 'web-player.html',
    assetRoot: path.join(projectRoot, 'assets'),
    initialSnapshot: ({ mediaUrl }): MultiplayerSessionSnapshot => ({
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      revision: 1,
      battle: createPublicBattle({ battleStarted }),
      background: {
        url: mediaUrl(TEST_MEDIA_IDS.background),
        name: null,
        mediaType: 'image',
      },
      scene: {
        phaseMarkers: [],
        activePhaseIndex: 0,
        blackoutActive: false,
        revision: 1,
      },
      encounterEffects: structuredClone(initialEncounterEffectsState),
      music: {
        tracks: [{
          id: 'track-e2e',
          name: 'Trilha de teste',
          url: mediaUrl(TEST_MEDIA_IDS.music),
          duration: 1,
        }],
        currentTrackId: 'track-e2e',
        isPlaying: false,
        loop: false,
        volume: 0.8,
        muted: false,
        universalMuted: false,
        playbackVersion: 0,
        currentTime: 0,
        synchronizedAt: Date.now(),
        revision: 1,
      },
      soundboard: {
        volume: 0.8,
        muted: false,
        loop: false,
        universalMuted: false,
        revision: 1,
      },
      encounterSoundUrls: [],
    }),
    resolveMedia: ({ id }) => {
      const resource = mediaResources.get(id) ?? null;
      if (resource) mediaRequests.set(id, (mediaRequests.get(id) ?? 0) + 1);
      return resource;
    },
    preloadMediaUrls: ({ mediaUrl }) => preloadMediaIds.map(mediaUrl),
    latencyProbeIntervalMs: 500,
    latencyProbeTimeoutMs: 500,
  });
  return {
    server,
    inviteUrl: playerOnlyInvite(server.info.invite.localUrl),
    mediaRequests,
    mediaUrl: (id) => server.mediaUrl(id),
    close: async () => {
      await server.close('server-shutdown');
      await rm(profileDirectory, { recursive: true, force: true });
    },
  };
};

export const joinHostedSession = async (
  page: Page,
  inviteUrl: string,
  playerName: string,
) => {
  await page.goto(inviteUrl);
  await page.locator('#web-player-name').fill(playerName);
  await page.locator('#web-player-password').fill('test-password');
  await page.getByRole('button', { name: 'Criar acesso' }).click();
  const confirmationDialog = page.getByRole('dialog', { name: 'Confirmar usuário' });
  const creating = await confirmationDialog
    .waitFor({ state: 'visible', timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (!creating) {
    await page.getByRole('button', { name: 'Entrar' }).click();
  }
  await expect(confirmationDialog).toBeVisible();
  await expect(page.locator('#web-player-confirmed-name')).toHaveText(playerName);
  const passwordConfirmation = page.locator('#web-player-password-confirm');
  if (await passwordConfirmation.isVisible()) await passwordConfirmation.fill('test-password');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.locator('.player-stage')).toBeVisible();
};

export const damageImpact = ({
  from = 100,
  to = 75,
  soundUrl,
  id = 1,
}: {
  from?: number;
  to?: number;
  soundUrl?: string;
  id?: number;
} = {}): PublicCombatImpact => {
  const healthEffect: HealthEffect = {
    id,
    bossId: 'boss-e2e',
    type: 'damage',
    intensity: 'normal',
    from,
    to,
    maximum: 100,
    shieldFrom: 0,
    shieldTo: 0,
  };
  return {
    battle: createPublicBattle({
      battleStarted: true,
      currentHealth: to,
      revision: id + 2,
    }),
    healthEffect,
    soundEffect: soundUrl ? {
      id,
      kind: 'damage',
      url: soundUrl,
    } : null,
  };
};

export const backgroundState = (
  url: string,
  mediaType: BackgroundState['mediaType'] = 'image',
): BackgroundState => ({ url, name: null, mediaType });
