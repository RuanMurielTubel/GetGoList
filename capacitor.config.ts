import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.getgolist.app',
  appName: 'GetGoList',
  webDir: 'public',
  server: {
    url: 'https://www.getgolist.com/login?app=android',
    cleartext: false,
    androidScheme: 'https',
  },
};

export default config;
