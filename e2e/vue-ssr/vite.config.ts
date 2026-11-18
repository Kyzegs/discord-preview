import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({ cacheDir: '../node_modules/.vite/vue-ssr', plugins: [vue()], optimizeDeps: { include: ['vue', 'preact', 'preact/hooks', 'preact/compat', 'preact/jsx-runtime'] } });
