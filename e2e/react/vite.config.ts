import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({ cacheDir: '../node_modules/.vite/react', plugins: [react()], optimizeDeps: { include: ['react', 'react/jsx-dev-runtime', 'react-dom/client'] } });
