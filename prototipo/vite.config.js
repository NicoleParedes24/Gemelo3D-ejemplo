import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// fs.allow '..' permite reutilizar módulos del visor v1 (fuente NATS, texturas procedurales).
// El alias de three asegura que esos módulos usen la misma copia de three que el prototipo.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { three: fileURLToPath(new URL('./node_modules/three', import.meta.url)) },
    dedupe: ['three'],
  },
  server: { fs: { allow: ['..'] } },
});
