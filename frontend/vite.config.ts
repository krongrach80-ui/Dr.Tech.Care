import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:5000',
    changeOrigin: true,
    secure: false,
  },
  '/uploads': {
    target: 'http://127.0.0.1:5000',
    changeOrigin: true,
    secure: false,
  },
};

export default defineConfig({
  base: '/Dr.Tech.Care/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: apiProxy,
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    proxy: apiProxy,
  },
});
