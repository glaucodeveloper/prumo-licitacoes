import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.prumo.licitacoes',
  appName: 'Prumo Licitações',
  webDir: 'dist-mobile',
  server: {
    allowNavigation: ['ateliotic-jann-paragonless.ngrok-free.dev'],
  },
};

export default config;
