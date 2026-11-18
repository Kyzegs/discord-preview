import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// no framework plugin; Tailwind only matters for the hostile page
export default defineConfig({ cacheDir: '../node_modules/.vite/html', plugins: [tailwindcss()], optimizeDeps: { include: ['preact', 'preact/hooks', 'preact/compat', 'preact/jsx-runtime'] } });
