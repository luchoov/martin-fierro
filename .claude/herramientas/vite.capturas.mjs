// Servidor de desarrollo para capturas: igual que la obra, más un punto que guarda PNG en disco.
import { mkdirSync, writeFileSync } from 'node:fs';
const out = 'C:/dev/martin-fierro/.claude/herramientas/capturas';
export default {
  root: 'C:/dev/martin-fierro/obras/martin-fierro',
  server: { port: 5179, strictPort: true, fs: { allow: ['C:/dev/martin-fierro', 'C:/dev/martin-fierro/.claude/herramientas'] } },
  plugins: [
    {
      name: 'capturas',
      configureServer(s) {
        s.middlewares.use('/__captura', (req, res) => {
          const n = new URL(req.url, 'http://x').searchParams.get('n').replace(/[^a-z0-9_-]/gi, '');
          const chunks = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            mkdirSync(out, { recursive: true });
            writeFileSync(out + '/' + n + '.png', Buffer.concat(chunks));
            res.end('ok');
          });
        });
      },
    },
  ],
};
