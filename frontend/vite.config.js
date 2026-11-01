import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo /api se redirige al gateway nginx (puerto 8000), igual que en Docker.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.GATEWAY_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
