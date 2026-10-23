import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { startApplication } from '../../src/program';
import '../../src/app.css';
import './mobile-app.css';

const ROUTER_ORIGIN = 'https://ateliotic-jann-paragonless.ngrok-free.dev';
const APP_PORT_PREFIX = '/8877';
const ROUTER_KEY_STORAGE = 'prumo_router_access_key';
const API_PATH = /^\/(?:api|v1|vendor|data)(?:\/|$)/;
const nativeFetch = window.fetch.bind(window);
let routerKey = '';
let applicationStarted = false;

const getStoredKey = async (): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    const result = await Preferences.get({ key: ROUTER_KEY_STORAGE });
    return result.value ?? '';
  }
  return window.localStorage.getItem(ROUTER_KEY_STORAGE) ?? '';
};

const saveStoredKey = async (value: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: ROUTER_KEY_STORAGE, value });
    return;
  }
  window.localStorage.setItem(ROUTER_KEY_STORAGE, value);
};

function installApiTransport(): void {
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const inputUrl = input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : input;
    const source = new URL(inputUrl, document.baseURI);
    if (source.origin !== window.location.origin || !API_PATH.test(source.pathname)) {
      return nativeFetch(input, init);
    }

    const destination = `${ROUTER_ORIGIN}${APP_PORT_PREFIX}${source.pathname}${source.search}`;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    headers.set('X-Port-Router-Key', routerKey);
    headers.set('ngrok-skip-browser-warning', '1');

    if (input instanceof Request) {
      const request = new Request(input, init);
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
      return nativeFetch(destination, {
        method: request.method,
        headers,
        body,
        signal: request.signal,
        cache: request.cache,
        credentials: 'omit',
        redirect: request.redirect,
      });
    }

    return nativeFetch(destination, { ...init, headers, credentials: 'omit' });
  }) as typeof window.fetch;
}

function ensureConnectionStyles(): void {
  document.documentElement.classList.add('prumo-mobile');
}

function buildConnectionGate(message = ''): HTMLElement {
  const existing = document.getElementById('prumo-mobile-connection');
  if (existing) {
    const status = existing.querySelector<HTMLElement>('[data-connection-status]');
    if (status) status.textContent = message;
    return existing;
  }

  const gate = document.createElement('main');
  gate.id = 'prumo-mobile-connection';
  gate.className = 'mobile-connection-shell';
  gate.innerHTML = `
    <section class="mobile-connection-card" aria-labelledby="mobile-connection-title">
      <a class="mobile-brand" href="#" aria-label="Prumo Licitações">
        <span class="mobile-brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M5 22V6h8a5 5 0 1 1 0 10H9"/><path d="m19 22-6-6"/><path d="M21 5v4"/></svg></span>
        <span><strong>prumo</strong><small>LICITAÇÕES &amp; OBRAS</small></span>
      </a>
      <div class="mobile-connection-intro">
        <span class="mobile-connection-eyebrow">ACESSO AO WORKSPACE</span>
        <h1 id="mobile-connection-title">Conectar ao Prumo</h1>
        <p>A interface e os documentos ficam neste app. Informe a chave do roteador para acessar os serviços do workspace.</p>
      </div>
      <form data-connection-form novalidate>
        <label for="mobile-router-key">Chave de acesso</label>
        <div class="mobile-key-field">
          <input id="mobile-router-key" name="router-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Cole somente a chave" required />
          <button type="button" data-toggle-key aria-label="Mostrar chave">Mostrar</button>
        </div>
        <p class="mobile-connection-help">A chave fica armazenada neste aparelho. Endereço e serviços já estão configurados.</p>
        <button class="mobile-connect-button" type="submit">Conectar e abrir</button>
        <button class="mobile-cancel-button" type="button" data-cancel-key-change hidden>Voltar ao Prumo</button>
        <p class="mobile-connection-status" data-connection-status role="status" aria-live="polite">${message}</p>
      </form>
      <footer>Interface local · conexão protegida ao servidor</footer>
    </section>`;

  document.body.append(gate);
  const form = gate.querySelector<HTMLFormElement>('[data-connection-form]')!;
  const field = gate.querySelector<HTMLInputElement>('#mobile-router-key')!;
  const status = gate.querySelector<HTMLElement>('[data-connection-status]')!;
  const submit = gate.querySelector<HTMLButtonElement>('.mobile-connect-button')!;
  const cancel = gate.querySelector<HTMLButtonElement>('[data-cancel-key-change]')!;
  const toggle = gate.querySelector<HTMLButtonElement>('[data-toggle-key]')!;

  toggle.addEventListener('click', () => {
    const reveal = field.type === 'password';
    field.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-label', reveal ? 'Ocultar chave' : 'Mostrar chave');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const candidate = field.value.trim() || (gate.dataset.requireNewKey === 'true' ? '' : routerKey);
    if (!/^[A-Za-z0-9_-]{24,256}$/.test(candidate)) {
      status.textContent = 'Chave inválida. Cole somente a chave do roteador.';
      field.focus();
      return;
    }

    submit.disabled = true;
    status.textContent = 'Validando conexão…';
    try {
      const headers = new Headers({
        'X-Port-Router-Key': candidate,
        'ngrok-skip-browser-warning': '1',
      });
      const response = await nativeFetch(`${ROUTER_ORIGIN}${APP_PORT_PREFIX}/api/health`, {
        headers,
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        status.textContent = response.status === 401
          ? 'A chave foi rejeitada pelo roteador.'
          : `O servidor respondeu com erro (${response.status}).`;
        return;
      }
      await saveStoredKey(candidate);
      routerKey = candidate;
      startWorkspace();
    } catch {
      status.textContent = 'Não consegui alcançar o servidor. Verifique o túnel e tente novamente.';
    } finally {
      submit.disabled = false;
    }
  });

  cancel.addEventListener('click', () => {
    gate.remove();
    document.querySelector('.app-shell')?.classList.remove('mobile-gated');
  });

  return gate;
}

function addKeyManagement(): void {
  const settings = document.querySelector<HTMLElement>('#settingsDialog .dialog-content');
  if (!settings || settings.querySelector('.mobile-router-settings')) return;
  const section = document.createElement('section');
  section.className = 'settings-section mobile-router-settings';
  section.innerHTML = '<div class="settings-section-head"><div><h3>Conexão com o workspace</h3><p>Atualize a chave do roteador para este aparelho.</p></div><button class="button-secondary button-sm" type="button" data-change-router-key>Trocar chave</button></div>';
  settings.append(section);
  section.querySelector<HTMLButtonElement>('[data-change-router-key]')?.addEventListener('click', () => {
    const dialog = document.getElementById('settingsDialog') as HTMLDialogElement | null;
    if (dialog?.open) dialog.close();
    const gate = buildConnectionGate('Informe a nova chave e conecte novamente.');
    gate.dataset.requireNewKey = 'true';
    gate.querySelector<HTMLButtonElement>('[data-cancel-key-change]')!.hidden = false;
    gate.querySelector<HTMLInputElement>('#mobile-router-key')?.focus();
    document.querySelector('.app-shell')?.classList.add('mobile-gated');
  });
}

function startWorkspace(): void {
  if (!routerKey) return;
  installApiTransport();
  document.getElementById('prumo-mobile-connection')?.remove();
  document.querySelector('.app-shell')?.classList.remove('mobile-gated');
  if (!applicationStarted) {
    applicationStarted = true;
    startApplication();
    addKeyManagement();
  }
}

ensureConnectionStyles();
document.querySelector('.app-shell')?.classList.add('mobile-gated');
void getStoredKey().then((savedKey) => {
  if (savedKey && /^[A-Za-z0-9_-]{24,256}$/.test(savedKey)) {
    routerKey = savedKey;
    startWorkspace();
  } else {
    buildConnectionGate();
  }
}).catch(() => buildConnectionGate('Não consegui ler a configuração salva. Informe a chave novamente.'));
