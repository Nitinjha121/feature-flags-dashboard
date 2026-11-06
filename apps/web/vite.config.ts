import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Inside Docker the Playwright container reaches this server as http://web:5173;
    // Vite rejects unknown Host headers by default.
    allowedHosts: ['web', 'localhost'],
    // The browser only ever talks to Vite; /api is proxied, so no CORS is needed.
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000' },
    },
    // Docker Desktop bind mounts don't always deliver file events; polling is the fallback.
    watch: process.env.CHOKIDAR_USEPOLLING === 'true' ? { usePolling: true, interval: 300 } : {},
  },
});
