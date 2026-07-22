import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import { tmpdir } from 'node:os';
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
  const server = await MultiplayerSessionServer.start({
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
    close: () => server.close('server-shutdown'),
  };
};

export const joinHostedSession = async (
  page: Page,
  inviteUrl: string,
  playerName: string,
) => {
  await page.goto(inviteUrl);
  await page.getByLabel('Nome do jogador').fill(playerName);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar nome' })).toBeVisible();
  await expect(page.locator('#web-player-confirmed-name')).toHaveText(playerName);
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
