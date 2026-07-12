import { contextBridge, ipcRenderer } from 'electron';
import type {
  BackgroundSelectionResult,
  BackgroundState,
  BattleCommand,
  BattleState,
  HealthEffect,
} from './shared/battle';

let latestBattleState: BattleState | null = null;
const stateSubscribers = new Set<(state: BattleState) => void>();
let latestBackground: BackgroundState | null = null;
const backgroundSubscribers = new Set<(state: BackgroundState) => void>();

ipcRenderer.on('battle:state-changed', (_event, state: BattleState) => {
  latestBattleState = state;
  for (const subscriber of stateSubscribers) {
    subscriber(state);
  }
});

ipcRenderer.on('background:changed', (_event, background: BackgroundState) => {
  latestBackground = background;
  for (const subscriber of backgroundSubscribers) {
    subscriber(background);
  }
});

contextBridge.exposeInMainWorld('bossAPI', {
  getState: async (): Promise<BattleState> => {
    const state = (await ipcRenderer.invoke('battle:get-state')) as BattleState;
    latestBattleState = state;
    return state;
  },
  dispatch: (command: BattleCommand) => {
    ipcRenderer.send('battle:dispatch', command);
  },
  openPresentation: (): Promise<boolean> =>
    ipcRenderer.invoke('presentation:open'),
  chooseBackground: (): Promise<BackgroundSelectionResult> =>
    ipcRenderer.invoke('background:choose'),
  clearBackground: (): Promise<boolean> =>
    ipcRenderer.invoke('background:clear'),
  getBackground: async (): Promise<BackgroundState> => {
    const background = (await ipcRenderer.invoke(
      'background:get',
    )) as BackgroundState;
    latestBackground = background;
    return background;
  },
  presentationReady: () => {
    ipcRenderer.send('presentation:ready');
  },
  reportBackgroundError: (message: string) => {
    ipcRenderer.send('background:load-error', message);
  },
  subscribe: (callback: (state: BattleState) => void) => {
    stateSubscribers.add(callback);

    if (latestBattleState) {
      callback(latestBattleState);
    }

    return () => stateSubscribers.delete(callback);
  },
  subscribeBackground: (callback: (state: BackgroundState) => void) => {
    backgroundSubscribers.add(callback);

    if (latestBackground) {
      callback(latestBackground);
    }

    return () => backgroundSubscribers.delete(callback);
  },
  subscribeBackgroundError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message);
    };
    ipcRenderer.on('background:error', listener);
    return () => ipcRenderer.removeListener('background:error', listener);
  },
  subscribeHealthEffect: (callback: (effect: HealthEffect) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, effect: HealthEffect) => {
      callback(effect);
    };
    ipcRenderer.on('health:effect', listener);
    return () => ipcRenderer.removeListener('health:effect', listener);
  },
});
