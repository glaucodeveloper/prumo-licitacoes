import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.prumo.licitacoes',
  appName: 'Prumo Licitações',
  webDir: 'dist-mobile',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
