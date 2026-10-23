import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import './mobile.css';

interface PrumoConnectionPlugin {
  open(options: { url: string }): Promise<{ opened: boolean }>;
}

const PrumoConnection = registerPlugin<PrumoConnectionPlugin>('PrumoConnection');
const APP_URL = 'https://ateliotic-jann-paragonless.ngrok-free.dev/8877/';
const STORAGE_KEY = 'prumo_router_access_key';
const form = document.querySelector<HTMLFormElement>('#connect-form')!;
const keyInput = document.querySelector<HTMLInputElement>('#router-key')!;
const status = document.querySelector<HTMLParagraphElement>('#form-status')!;
const connectButton = document.querySelector<HTMLButtonElement>('#connect-button')!;
const changeButton = document.querySelector<HTMLButtonElement>('#change-key')!;
const revealButton = document.querySelector<HTMLButtonElement>('#reveal-key')!;

function setStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle('error', error);
}

async function storedKey(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const result = await Preferences.get({ key: STORAGE_KEY });
    return result.value ?? '';
  }
  return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

async function saveKey(key: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: key });
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, key);
}

async function openWorkspace(key: string): Promise<void> {
  const destination = new URL(APP_URL);
  destination.searchParams.set('key', key);
  connectButton.disabled = true;
  setStatus('Abrindo o workspace…');
  try {
    if (Capacitor.isNativePlatform()) {
      await PrumoConnection.open({ url: destination.toString() });
    } else {
      window.location.assign(destination.toString());
    }
  } catch {
    connectButton.disabled = false;
    setStatus('Não foi possível abrir o Prumo. Confira a conexão e tente novamente.', true);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const candidate = keyInput.value.trim() || await storedKey();
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(candidate)) {
    setStatus('Chave inválida. Cole somente a chave de acesso.', true);
    keyInput.focus();
    return;
  }
  await saveKey(candidate);
  await openWorkspace(candidate);
});

revealButton.addEventListener('click', () => {
  const reveal = keyInput.type === 'password';
  keyInput.type = reveal ? 'text' : 'password';
  revealButton.textContent = reveal ? 'Ocultar' : 'Mostrar';
  revealButton.setAttribute('aria-label', reveal ? 'Ocultar chave' : 'Mostrar chave');
});

changeButton.addEventListener('click', () => {
  keyInput.value = '';
  keyInput.placeholder = 'Cole a nova chave';
  keyInput.focus();
  changeButton.hidden = true;
  setStatus('Informe a nova chave e abra o Prumo.');
});

void storedKey().then((key) => {
  if (!key) return;
  keyInput.placeholder = 'Chave salva neste aparelho';
  changeButton.hidden = false;
  setStatus('Chave salva neste aparelho.');
}).catch(() => setStatus('Não foi possível ler a configuração salva.', true));
