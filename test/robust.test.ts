import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToString } from '../dist/server.js';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import type { PreviewProps } from '../src/types.ts';
import { fixtures } from './fixtures.ts';

// Malformed input never throws, in either build: each fixture takes 200 seeded random mutations, a few at a time.

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REPLACEMENTS: unknown[] = [
  null,
  0,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  1e21,
  4,
  4096,
  32768,
  '',
  'x',
  'constructor',
  '__proto__',
  'attachment://a.png',
  'https://example.com/a.png',
  '<t:1:R>',
  [],
  [null],
  ['x'],
  [{}],
  [{ type: 17, components: [null, 'x', { type: 9 }] }],
  {},
  { type: 1, components: [null, { type: 3 }, { type: 8, channel_types: 'x' }] },
  { type: 2, style: 6 },
  { type: 11 },
  { type: 13, file: 5 },
  'x'.repeat(100_000),
  Array.from({ length: 5000 }, () => ({ type: 17, components: [{ type: 10, content: '**x**' }] })),
  deep(200), // structuredClone, used to copy it, stops near 500 levels
];

function deep(n: number) {
  let v: unknown = { type: 10, content: 'x' };
  for (let i = 0; i < n; i++) v = { type: i % 2 ? 17 : 9, components: [v] };
  return v;
}

type Box = Record<string, unknown> | unknown[];
function slots(v: unknown, out: [Box, string | number][] = []) {
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push([v as Box, Array.isArray(v) ? Number(k) : k]);
      slots(x, out);
    }
  }
  return out;
}

for (const { name, props } of fixtures) {
  test(`robust: ${name}`, () => {
    const rand = mulberry32([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
    for (let run = 0; run < 200; run++) {
      const mutated = structuredClone(props) as unknown as Record<string, unknown>;
      const steps = 1 + Math.floor(rand() * 3);
      for (let s = 0; s < steps; s++) {
        const all = slots(mutated);
        const [parent, key] = all[Math.floor(rand() * all.length)]!;
        if (rand() < 0.2) {
          if (Array.isArray(parent)) parent.splice(key as number, 1);
          else delete parent[key as string];
        } else (parent as Record<string | number, unknown>)[key] = structuredClone(REPLACEMENTS[Math.floor(rand() * REPLACEMENTS.length)]);
      }
      try {
        renderToStaticMarkup(createElement(DiscordPreview, mutated as unknown as PreviewProps));
        renderToString(mutated as unknown as PreviewProps);
      } catch (e) {
        throw new Error(`run ${run} threw on ${JSON.stringify(mutated)}`, { cause: e });
      }
    }
  });
}

test('robust: no payload at all', () => {
  for (const payload of [null, undefined, 5, 'x', [], { flags: 32768, components: 'x' }, { embeds: {}, poll: [], sticker_items: 3 }]) {
    renderToStaticMarkup(createElement(DiscordPreview, { payload } as unknown as PreviewProps));
    renderToString({ payload } as unknown as PreviewProps);
  }
});
