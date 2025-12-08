// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  vite: {
    // @ts-ignore
    plugins: [
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Capyte Investments',
          short_name: 'Capyte',
          description: 'Gestión inteligente de inversiones y finanzas personales',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/logo.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/logo.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          navigateFallback: '/offline',
          globPatterns: ['**/*.{css,js,html,svg,png,ico,txt}'],
          // ESTRATEGIA OFFLINE PARA DATOS (SSR)
          runtimeCaching: [
            {
              // Cachear navegación de páginas (Dashboard, etc.)
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 24 * 60 * 60 // 24 horas
                },
                networkTimeoutSeconds: 3 // Si en 3s no responde, usar caché
              }
            },
            {
              // Cachear API GET requests (para datos dinámicos fetch)
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 // 1 hora
                },
                networkTimeoutSeconds: 3
              }
            }
          ]
        },
        devOptions: {
          enabled: true,
          navigateFallbackAllowlist: [/^\/$/]
        }
      })
    ]
  },

  output: 'server',
  adapter: vercel(),
});