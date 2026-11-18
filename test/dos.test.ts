import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordPreview } from '../dist/react.js';
import { renderToString } from '../dist/server.js';
import type { PreviewProps } from '../src/types.ts';
import { INLINE, jumbo, urlish } from '../src/markdown.tsx';
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
  'broken emoji sequences, as Twemoji': () => ({ payload: { content: ('👩' + String.fromCodePoint(0x200d, 0x1f3fd, 0xfe0f)).repeat(100_000) }, twemoji: true }),
  'emoji-only content, 100k long': () => ({ payload: { content: '😀 <:a:1>'.repeat(100_000) } }),
  // Whole messages at every per-field limit: the per-message text totals keep these small.
  '10 maxed embeds of <@1>': () => ({ payload: { content: fill('<@1>', 4000), embeds: embeds('<@1>') } }),
  '10 maxed embeds of newlines': () => ({ payload: { content: fill('\n', 4000), embeds: embeds('\n') } }),
  '10 maxed embeds of emoji, as Twemoji': () => ({ payload: { content: fill('😀', 4000), embeds: embeds('😀') }, twemoji: true }),
  '10 maxed embeds of <@1>, and a forwarded copy': () => ({ payload: forwarded('<@1>') }),
  '10 maxed embeds of newlines, and a forwarded copy': () => ({ payload: forwarded('\n') }),
  '10 maxed embeds of emoji, and a forwarded copy, as Twemoji': () => ({ payload: forwarded('😀'), twemoji: true }),
  '40 text displays of newlines': () => ({ payload: { flags: V2, components: range(40).map(() => ({ type: 10 as const, content: fill('\n', 4000) })) } }),
  'a maxed modal': () => ({
    payload: {},
    modal: {
      title: fill('<@1>', 45),
      components: [
        { type: 10, content: fill('\n', 4000) },
        { type: 10, content: fill('<@1>', 4000) },
        { type: 18, label: fill('x', 45), component: { type: 4, style: 2, value: fill('\n', 4000), max_length: 4000 } },
        { type: 18, label: 'r', component: { type: 21, options: range(10).map((i) => ({ value: String(i), label: fill('<@1>', 100), description: fill('x', 100) })) } },
        { type: 18, label: 's', component: { type: 3, max_values: 25, options: range(25).map((i) => ({ value: String(i), label: fill('x', 100), description: fill('x', 100), default: true })) } },
      ],
    },
  }),
  'maxed polls, reactions and attachments': () => ({
    payload: {
      poll: { question: { text: fill('<@1>', 300) }, answers: range(10).map((i) => ({ answer_id: i + 1, poll_media: { text: fill('<@1>', 55), emoji: { id: '1' } } })), results: { answer_counts: range(10).map((i) => ({ id: i + 1, count: 1e9 })) } },
      reactions: range(20).map(() => ({ count: 1e9, count_details: { burst: 1e9, normal: 1e9 }, burst_colors: range(8).map(() => '#ffffff'), emoji: { id: '1', name: 'x' } })),
      attachments: range(10).map((i) => ({ filename: `${fill('x', 250)}${i}.${['png', 'mp4', 'mp3', 'zip'][i % 4]}`, url: `https://e.example/${i}`, size: 1e9, width: 1e5, height: 1, description: fill('x', 1024) })),
      sticker_items: range(3).map(() => ({ id: '1', name: fill('x', 30), format_type: 3 })),
    },
  }),
};

function fill(s: string, length: number) {
  return s.repeat(Math.ceil(length / s.length)).slice(0, length);
}
function embeds(s: string) {
  const field = { name: fill(s, 256), value: fill(s, 1024) };
  return range(10).map(() => ({ title: fill(s, 256), description: fill(s, 4096), fields: range(25).map(() => field), footer: { text: fill(s, 2048) }, author: { name: fill(s, 256) } }));
}
function forwarded(s: string) {
  const copy = { content: fill(s, 4000), embeds: embeds(s) };
  return { ...copy, message_reference: { type: 1 }, message_snapshots: [{ message: copy }] };
}

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

// The patterns themselves, on input far past any cap (the renderer cuts text before they run, so a quadratic
// alternative would never show above): 100k characters built to make each alternative scan and fail.
const HOSTILE = [
  '*',
  '**a',
  '*a',
  '_a',
  '__a',
  '___a',
  '||a',
  '|',
  '~~a',
  '`',
  '``a',
  '\\',
  '[a',
  '[a](',
  '[a](https://',
  '<https://a',
  'https://a.',
  '<@',
  '<@&1',
  '</a:',
  '</a b c d:',
  '<a:b:',
  '<t:-1:',
  '<id:',
  '@everyone',
  'a.',
  'a.b',
  ':/',
  '```',
  '```a\n',
  '> ',
  '1. ',
  '  - ',
  '👩‍',
];
for (const piece of HOSTILE) {
  test(`dos regex: ${JSON.stringify(piece)} x 100k characters`, () => {
    const input = piece.repeat(Math.ceil(100_000 / piece.length));
    const start = performance.now();
    input.split(INLINE);
    urlish(input);
    jumbo(input);
    input.split(/```(?:([\w+-]*)\n)?([\s\S]*?)\n?```\n?/); // the code block split in Markdown
    const ms = performance.now() - start;
    assert.ok(ms < 1000, `took ${Math.round(ms)} ms`);
  });
}
