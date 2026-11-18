import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({ cacheDir: '../node_modules/.vite/svelte', plugins: [svelte()], optimizeDeps: { include: ['preact', 'preact/hooks', 'preact/compat', 'preact/jsx-runtime'] } });
