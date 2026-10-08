import { defineConfig } from 'vite';

/**
 * Dirección pública, para la imagen al compartir (og:image pide una URL absoluta).
 * En Vercel sale sola; si no, SITIO=https://… al hacer el build. Sin ninguna, queda relativa.
 */
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const sitio = (process.env.SITIO ?? (vercel ? `https://${vercel}` : '')).replace(/\/$/, '');

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  server: { port: 5178, strictPort: true },
  plugins: [{ name: 'sitio', transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITIO%/', `${sitio}/`) } }],
});
