import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies the API so cookies stay same-origin (no CORS/SameSite headaches).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
