import {
  createWebPlayerApi,
  type WebPlayerConnectionState,
} from './web-player-api';
import './web-player.css';

window.__BOSS_WEB_PLAYER__ = true;

const statusElement = document.getElementById('web-player-status');
const joinElement = document.getElementById('web-player-join');
const closedElement = document.getElementById('web-player-closed');
const joinForm = document.getElementById('web-player-join-form');
const nameInput = document.getElementById('web-player-name');
const nameConfirmElement = document.getElementById('web-player-name-confirm');
const confirmedNameElement = document.getElementById('web-player-confirmed-name');
const nameBackButton = document.getElementById('web-player-name-back');
const nameSubmitButton = document.getElementById('web-player-name-submit');
const pendingElement = document.getElementById('web-player-pending');
const pendingTitleElement = document.getElementById('web-player-pending-title');
const pendingMessageElement = document.getElementById('web-player-pending-message');
const changeNameButton = document.getElementById('web-player-change-name');
let hideStatusTimer: ReturnType<typeof setTimeout> | null = null;
let playerMounted = false;
let sessionReady = false;
let sessionClosed = false;
let unmountPlayer: (() => void) | null = null;

const showConnectionState = ({
  state,
  message,
}: WebPlayerConnectionState) => {
  if (!statusElement) return;
  if (hideStatusTimer) clearTimeout(hideStatusTimer);
  hideStatusTimer = null;
  statusElement.dataset.state = state;
  statusElement.dataset.visible = 'true';
  statusElement.textContent = message;
  if (state === 'closed') {
    sessionClosed = true;
    unmountPlayer?.();
    unmountPlayer = null;
    playerMounted = false;
    joinElement?.setAttribute('hidden', '');
    nameConfirmElement?.setAttribute('hidden', '');
    pendingElement?.setAttribute('hidden', '');
    changeNameButton?.setAttribute('hidden', '');
    closedElement?.removeAttribute('hidden');
    statusElement.dataset.visible = 'false';
    return;
  }
  closedElement?.setAttribute('hidden', '');
  if (state === 'awaiting-approval' || state === 'preloading' || state === 'connecting') {
    joinElement?.setAttribute('hidden', '');
    nameConfirmElement?.setAttribute('hidden', '');
    pendingElement?.removeAttribute('hidden');
    if (pendingTitleElement) {
      pendingTitleElement.textContent = state === 'awaiting-approval'
        ? 'Aguardando o mestre'
        : 'Preparando encontro';
    }
    if (pendingMessageElement) pendingMessageElement.textContent = message;
    statusElement.dataset.visible = 'false';
    return;
  }
  pendingElement?.setAttribute('hidden', '');
  if (state === 'connected') {
    joinElement?.setAttribute('hidden', '');
    hideStatusTimer = setTimeout(() => {
      statusElement.dataset.visible = 'false';
      hideStatusTimer = null;
    }, 2_200);
  } else if (state === 'error' && !sessionReady) {
    joinElement?.removeAttribute('hidden');
    nameConfirmElement?.setAttribute('hidden', '');
    if (nameInput instanceof HTMLInputElement) nameInput.readOnly = false;
    const submit = joinForm?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (submit) submit.disabled = false;
    nameSubmitButton?.removeAttribute('disabled');
  }
};

const { api, canConnect, connect, leave, dispose, socket } = createWebPlayerApi({
  onConnectionState: showConnectionState,
  onSessionReady: () => {
    sessionReady = true;
    mountPlayer();
    queueMicrotask(() => {
      void api.getState().then((state) => {
        changeNameButton?.toggleAttribute(
          'hidden',
          !socket?.connected || state.battleStarted,
        );
      });
    });
  },
});
window.bossAPI = api;

const mountPlayer = () => {
  if (playerMounted) return;
  playerMounted = true;
  void import('./player').then((module) => {
    unmountPlayer = module.unmountPlayer;
    if (sessionClosed) {
      unmountPlayer();
      unmountPlayer = null;
      playerMounted = false;
    }
  }).catch((error: unknown) => {
    console.error('Falha ao carregar a apresentação web.', error);
    showConnectionState({
      state: 'error',
      message: 'A apresentação não pôde ser carregada. Atualize a página.',
    });
  });
};

if (nameInput instanceof HTMLInputElement) {
  nameInput.value = window.localStorage.getItem('bossbar.multiplayer.player-name') ?? '';
  nameInput.focus();
}

if (!canConnect && joinForm instanceof HTMLFormElement) {
  const submit = joinForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
}

joinForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!(nameInput instanceof HTMLInputElement)) return;
  const requestedName = nameInput.value.trim().slice(0, 40);
  if (!requestedName) return;
  if (confirmedNameElement) confirmedNameElement.textContent = requestedName;
  joinElement?.setAttribute('hidden', '');
  nameConfirmElement?.removeAttribute('hidden');
  nameSubmitButton?.focus();
});

nameBackButton?.addEventListener('click', () => {
  nameConfirmElement?.setAttribute('hidden', '');
  joinElement?.removeAttribute('hidden');
  nameInput?.focus();
});

nameSubmitButton?.addEventListener('click', () => {
  if (!(nameInput instanceof HTMLInputElement)) return;
  if (!connect(nameInput.value)) return;
  nameSubmitButton.setAttribute('disabled', '');
  const submit = joinForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  nameInput.readOnly = true;
  nameConfirmElement?.setAttribute('hidden', '');
});

api.subscribe((state) => {
  if (!changeNameButton) return;
  const canChangeName = sessionReady && socket?.connected && !state.battleStarted;
  changeNameButton.toggleAttribute('hidden', !canChangeName);
});

changeNameButton?.addEventListener('click', () => {
  leave();
  sessionReady = false;
  changeNameButton.setAttribute('hidden', '');
  pendingElement?.setAttribute('hidden', '');
  nameConfirmElement?.setAttribute('hidden', '');
  joinElement?.removeAttribute('hidden');
  if (nameInput instanceof HTMLInputElement) {
    nameInput.readOnly = false;
    nameInput.select();
  }
  const submit = joinForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = false;
  nameSubmitButton?.removeAttribute('disabled');
  if (statusElement) statusElement.dataset.visible = 'false';
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || nameConfirmElement?.hasAttribute('hidden')) return;
  nameBackButton?.click();
});

window.addEventListener('beforeunload', () => {
  if (hideStatusTimer) clearTimeout(hideStatusTimer);
  unmountPlayer?.();
  dispose();
}, { once: true });
