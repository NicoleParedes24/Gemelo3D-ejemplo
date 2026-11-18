import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// API mínima para el editor durante el desarrollo:
//   GET /api/escena  -> devuelve public/escena.json
//   PUT /api/escena  -> guarda public/escena.json (y deja un respaldo en respaldos/)
// En producción esta API debe implementarla tu backend con las mismas rutas.
function escenaApi() {
  const file = path.resolve('public/escena.json');
  const backups = path.resolve('respaldos');
  return {
    name: 'escena-api',
    configureServer(server) {
      server.middlewares.use('/api/escena', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(fs.readFileSync(file, 'utf8'));
          return;
        }
        if (req.method === 'PUT') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const doc = JSON.parse(body);
              if (!Array.isArray(doc.objetos) || !Array.isArray(doc.conexiones)) throw new Error('Formato de escena inválido');
              fs.mkdirSync(backups, { recursive: true });
              if (fs.existsSync(file)) {
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                fs.copyFileSync(file, path.join(backups, `escena-${stamp}.json`));
                // conservar solo los 30 respaldos más recientes
                const old = fs.readdirSync(backups).filter((f) => f.startsWith('escena-')).sort().slice(0, -30);
                for (const f of old) fs.unlinkSync(path.join(backups, f));
              }
              fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
              res.setHeader('Content-Type', 'application/json');
              res.end('{"ok":true}');
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [escenaApi()],
  server: { watch: { ignored: ['**/public/escena.json', '**/respaldos/**'] } },
});
