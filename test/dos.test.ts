import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordPreview } from '../dist/react.js';
import { renderToString } from '../dist/server.js';
import type { PreviewProps } from '../src/types.ts';
import { DEFAULTS } from './fixtures.ts';

// Payloads built to cost the renderer far more than a real message could. Each renders in both builds without
// throwing, in under a second, into less than 2 MB.

const V2 = 32768;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

let nested: unknown = { type: 10, content: 'deep' };
for (let i = 0; i < 5000; i++) nested = { type: 17, components: [nested] };

const CASES: Record<string, () => Omit<PreviewProps, 'now' | 'locale' | 'timeZone'>> = {
  'a row of 2000 user selects, 2000 users': () => ({
    payload: { components: [{ type: 1, components: range(2000).map(() => ({ type: 5 as const })) }] },
    resolve: { users: Object.fromEntries(range(2000).map((i) => [String(i), { name: `user ${i}` }])) },
  }),
  '200k of [': () => ({ payload: { content: '['.repeat(200_000) } }),
  '5000 nested containers': () => ({ payload: { flags: V2, components: [nested as never] } }),
  '100k mentions, 100k mentions[]': () => ({
    payload: { content: '<@1> '.repeat(100_000), mentions: range(100_000).map((i) => ({ id: String(i + 2), username: `u${i}` })) },
  }),
  '400 KB of newlines': () => ({ payload: { content: '\n'.repeat(400_000) } }),
};

const RENDERERS: [string, (p: PreviewProps) => string][] = [
  ['react', (p) => renderToStaticMarkup(createElement(DiscordPreview, p))],
  ['preact', renderToString],
];

for (const [name, build] of Object.entries(CASES)) {
  for (const [renderer, render] of RENDERERS) {
    test(`dos (${renderer}): ${name}`, () => {
      const props = { ...DEFAULTS, ...build() };
      const start = performance.now();
      const html = render(props);
      const ms = performance.now() - start;
      assert.ok(ms < 1000, `took ${Math.round(ms)} ms`);
      assert.ok(html.length < 2_000_000, `${html.length} characters`);
    });
  }
}
