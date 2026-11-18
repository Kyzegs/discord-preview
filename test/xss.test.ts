import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToString } from '../dist/server.js';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import type { PreviewProps } from '../src/types.ts';
import { fixtures } from './fixtures.ts';

const ATTACKS = [
  'javascript:alert(1)',
  '"><img src=x onerror=alert(1)>',
  '</script><script>alert(1)</script>',
  "' onmouseover='alert(1)",
  'data:text/html,<script>alert(1)</script>',
  'jav&#x09;ascript:alert(1)',
  'java\tscript:alert(1)',
  // through the markdown link paths too
  '[x](https://e.com/"onmouseover="alert(1))',
  'https://e.com/\'><script>alert(1)</script>',
  '[x](javascript:alert(1))',
  '[x](data:text/html,x)',
  '[x](//evil.example)',
  '[x](/logout)',
];
const MARKDOWN = /[[\]*_~`|]|https?:|^[#>-]/;

// Judged on the raw attribute, not with the package's own guards: with localMedia unset, only absolute http(s) URLs.
const WEB = /^https?:\/\//;

const replaceStrings = (v: unknown, s: string): unknown =>
  typeof v === 'string' ? s : Array.isArray(v) ? v.map((x) => replaceStrings(x, s)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replaceStrings(x, s)])) : v;

// Every string but the ones used to look something up (ids, attachment://, mention tokens), so the looked-up names,
// avatars, SKUs, channel names, mentions[] names and attachment URLs receive the attack instead.
const KEYS = new Set(['id', 'channel_id', 'sku_id', 'filename', 'guildId']);
const replaceKeeping = (v: unknown, s: string, key = ''): unknown =>
  typeof v === 'string'
    ? KEYS.has(key) || v.startsWith('attachment://') || /<[@#]/.test(v)
      ? v
      : s
    : Array.isArray(v)
      ? v.map((x) => replaceKeeping(x, s))
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replaceKeeping(x, s, k)]))
        : v;

const COLOURS = new Set(['color', 'accent_color']);
const DROP = Symbol('drop');
const colours = (v: unknown, to: unknown | typeof DROP): unknown =>
  Array.isArray(v)
    ? v.map((x) => colours(x, to))
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).flatMap(([k, x]) => (COLOURS.has(k) ? (to === DROP ? [] : [[k, to]]) : [[k, colours(x, to)]])))
      : v;

interface Node {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
  content?: Node;
}
function* elements(n: Node): Generator<Node> {
  if (n.attrs) yield n;
  for (const c of n.childNodes ?? []) yield* elements(c);
  if (n.content) yield* elements(n.content);
}
const parse = (html: string) => [...elements(parseFragment(html) as Node)];

function check(html: string, attack: string | null) {
  for (const el of parse(html)) {
    assert.notEqual(el.nodeName, 'script', `${attack}: a script element`);
    for (const { name, value } of el.attrs ?? []) {
      assert.ok(!name.toLowerCase().startsWith('on'), `${attack}: attribute ${name}`);
      // React's preload <link> hints included
      if (name === 'href' || name === 'src') assert.match(value, WEB, `${attack}: ${el.nodeName} ${name} ${value}`);
      if (name === 'style' && attack !== null) assert.ok(!value.includes(attack), `${attack}: style ${value}`);
    }
  }
}
const structure = (html: string) => {
  const tags = new Set<string>();
  const attrs = new Set<string>();
  for (const el of parse(html)) {
    tags.add(el.nodeName);
    for (const a of el.attrs ?? []) attrs.add(a.name);
  }
  return { tags: [...tags].sort(), attrs: [...attrs].sort() };
};
const styles = (html: string) => [...new Set(parse(html).flatMap((el) => (el.attrs ?? []).filter((a) => a.name === 'style').map((a) => a.value)))].sort();

// Both builds: React escapes and blocks javascript: URLs itself, Preact does neither, so the source's guards must.
const RENDERERS: [string, (p: PreviewProps) => string][] = [
  ['react', (p) => renderToStaticMarkup(createElement(DiscordPreview, p))],
  ['preact', renderToString],
];

for (const { name, props: base } of fixtures) {
  const props = { ...base, localMedia: undefined };
  for (const [renderer, render] of RENDERERS) {
    const draw = (p: unknown) => render(p as PreviewProps);
    test(`xss (${renderer}): ${name}`, () => {
      check(draw(props), null);
      const benign = structure(draw(replaceStrings(props, 'benign text')));
      for (const attack of ATTACKS) {
        const hostile = draw(replaceStrings(props, attack));
        check(hostile, attack);
        check(draw(replaceKeeping(props, attack)), attack);
        if (!MARKDOWN.test(attack)) assert.deepEqual(structure(hostile), benign, `${attack}: the markup's shape changed`);
      }
    });

    test(`xss colours (${renderer}): ${name}`, () => {
      const plain = styles(draw(colours(props, DROP)));
      for (const bad of ['red;position:fixed;inset:0', 1.5, -1, 16777216]) assert.deepEqual(styles(draw(colours(props, bad))), plain, `colour ${String(bad)}`);
    });
  }
}

for (const [renderer, render] of RENDERERS) {
  test(`xss (${renderer}): prototype keys look nothing up`, () => {
    const html = render({ payload: { author: { id: 'constructor' }, channel_id: 'toString', content: 'x' }, resolve: { users: {}, channels: {} } } as PreviewProps);
    const text = html.replace(/<[^>]+>/g, '|');
    assert.match(text, /\|Unknown\|/);
    assert.match(text, /\|general\|/);
  });
}
