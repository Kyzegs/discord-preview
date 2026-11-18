import { defineConfig } from 'tsdown';

// One source, two builds: against React for /react, and against Preact for the custom element, the server renderer
// and the Vue wrapper. In the Preact pass, react imports become external preact/compat and preact/jsx-runtime imports
// (a plain `alias` would not apply, since react is a peer dependency and so already external as written).
const PREACT: Record<string, string> = { react: 'preact/compat', 'react/jsx-runtime': 'preact/jsx-runtime' };

export default defineConfig([
  {
    entry: { react: 'src/react.ts' },
    format: 'esm',
    dts: true,
    platform: 'neutral',
    clean: false, // `pnpm build` empties dist first; the two passes run in parallel
    deps: { neverBundle: ['react', 'react/jsx-runtime'] },
  },
  {
    entry: { element: 'src/element.ts', server: 'src/server.ts', vue: 'src/vue.ts' },
    format: 'esm',
    dts: true,
    platform: 'neutral',
    clean: false,
    deps: { neverBundle: [/^preact(\/|$)/, 'preact-render-to-string', 'vue'] },
    plugins: [
      {
        name: 'react-to-preact',
        resolveId: { order: 'pre', handler: (id: string) => (PREACT[id] ? { id: PREACT[id], external: true } : null) },
      },
    ],
  },
]);
