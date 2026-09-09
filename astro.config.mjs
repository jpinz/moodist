import { defineConfig, fontProviders } from 'astro/config';

import react from '@astrojs/react';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  base: './',
  fonts: [
    {
      cssVariable: '--font-inter',
      name: 'Inter',
      provider: fontProviders.google(),
      styles: ['normal'],
      subsets: ['latin'],
      weights: [400, 500],
    },
    {
      cssVariable: '--font-inter-tight',
      name: 'Inter Tight',
      provider: fontProviders.google(),
      styles: ['normal'],
      subsets: ['latin'],
      weights: [600, 700],
    },
    {
      cssVariable: '--font-fraunces',
      name: 'Fraunces',
      provider: fontProviders.google(),
      styles: ['normal'],
      subsets: ['latin'],
      weights: [400, 500, 600],
    },
  ],
  integrations: [
    react(),
    AstroPWA({
      manifest: {
        background_color: '#09090b',
        description: 'Ambient sounds for focus and calm.',
        display: 'standalone',
        icons: [
          ...[72, 128, 144, 152, 192, 256, 512].map(size => ({
            sizes: `${size}x${size}`,
            src: `./assets/pwa/${size}.png`,
            type: 'image/png',
          })),
        ],
        name: 'Moodist',
        orientation: 'any',
        scope: '.',
        short_name: 'Moodist',
        start_url: '.',
        theme_color: '#09090b',
      },
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*'],
        maximumFileSizeToCacheInBytes: Number.MAX_SAFE_INTEGER,
        navigateFallback: './',
        navigateFallbackDenylist: [/^\/api\/hassio_ingress\//],
      },
    }),
  ],
});
