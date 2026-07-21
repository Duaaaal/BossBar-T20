import {
  createWebPlayerApi,
  type WebPlayerConnectionState,
} from './web-player-api';
import './web-player.css';

window.__BOSS_WEB_PLAYER__ = true;

const statusElement = document.getElementById('web-player-status');
const joinElement = document.getElementById('web-player-join');
const joinForm = document.getElementById('web-player-join-form');
const nameInput = document.getElementById('web-player-name');
let hideStatusTimer: ReturnType<typeof setTimeout> | null = null;
let playerMounted = false;

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
  if (state === 'connected') {
    joinElement?.setAttribute('hidden', '');
    hideStatusTimer = setTimeout(() => {
      statusElement.dataset.visible = 'false';
      hideStatusTimer = null;
    }, 2_200);
  } else if (state === 'error' && !joinElement?.hasAttribute('hidden')) {
    if (nameInput instanceof HTMLInputElement) nameInput.readOnly = false;
    const submit = joinForm?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (submit) submit.disabled = false;
  }
};

const { api, canConnect, connect, socket } = createWebPlayerApi({
  onConnectionState: showConnectionState,
});
window.bossAPI = api;

const mountPlayer = () => {
  if (playerMounted) return;
  playerMounted = true;
  void import('./player').catch((error: unknown) => {
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
  if (!connect(nameInput.value)) return;
  const submit = joinForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  nameInput.readOnly = true;
  mountPlayer();
});

window.addEventListener('beforeunload', () => {
  if (hideStatusTimer) clearTimeout(hideStatusTimer);
  socket?.disconnect();
}, { once: true });
