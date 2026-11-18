import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToString } from '../dist/server.js';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import type { PreviewMessage, PreviewModal, PreviewProps } from '../src/types.ts';
import { DEFAULTS, fixtures } from './fixtures.ts';

const RENDERERS: [string, (p: PreviewProps) => string][] = [
  ['react', (p) => renderToStaticMarkup(createElement(DiscordPreview, p))],
  ['preact', renderToString],
];
const render = (payload: PreviewMessage, extra: Partial<PreviewProps> = {}) => renderToStaticMarkup(createElement(DiscordPreview, { ...DEFAULTS, bare: true, payload, ...extra }));
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

interface Node {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
}
function* elements(n: Node, inside: string[] = []): Generator<[Node, string[]]> {
  if (n.attrs) yield [n, inside];
  for (const c of n.childNodes ?? []) yield* elements(c, n.attrs ? [...inside, n.nodeName] : inside);
}
const parse = (html: string) => [...elements(parseFragment(html) as Node)];
const attrs = (html: string, name: string) => parse(html).flatMap(([el]) => (el.attrs ?? []).filter((a) => a.name === name).map((a) => a.value));
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// ---- Highlight

test('highlight: an escaping highlighter keeps a hostile block as text, in both builds', () => {
  const content = '```html\n<img src=x onerror=alert(1)><script>alert(1)</script>\n```';
  for (const [name, draw] of RENDERERS) {
    const html = draw({ ...DEFAULTS, payload: { content }, highlight: (code) => `<span class="k">${esc(code)}</span>` });
    assert.ok(html.includes('<span class="k">&lt;img'), name);
    assert.deepEqual(
      parse(html).filter(([el]) => el.nodeName === 'script' || (el.attrs ?? []).some((a) => a.name.startsWith('on'))),
      [],
      name,
    );
  }
});

test('highlight: a throwing or non-string highlighter leaves the block plain', () => {
  const props = { ...DEFAULTS, payload: { content: '```js\nx\n```' } };
  for (const bad of [
    () => {
      throw new Error('boom');
    },
    () => 42,
    () => ({ toString: () => '<b>x</b>' }),
  ])
    for (const [name, draw] of RENDERERS) assert.equal(draw({ ...props, highlight: bad as never }), draw(props), name);
});

test('highlight: prototype names as languages reach the function as plain strings', () => {
  const seen: string[] = [];
  const html = render({ content: ['constructor', '__proto__', 'toString'].map((l) => `\`\`\`${l}\ncode ${l}\n\`\`\``).join('\n') }, { highlight: (code, lang) => (seen.push(lang), `<i>${esc(code)}</i>`) });
  assert.deepEqual(seen, ['constructor', '__proto__', 'toString']);
  assert.equal(count(html, /<code class="block [^>]*><i>/g), 3);
});

test('highlight: never for an empty block, and for at most 10 blocks a render', () => {
  let calls = 0;
  const highlight = (code: string) => (calls++, esc(code));
  render({ content: '```js\n```\n```js\n\n```' }, { highlight });
  assert.equal(calls, 0);
  const blocks = Array.from({ length: 300 }, (_, i) => `\`\`\`js\n${i}\n\`\`\``).join('\n');
  render({ content: blocks, embeds: [{ description: blocks }], flags: 0 }, { highlight });
  assert.equal(calls, 10);
  calls = 0;
  render({ flags: 32768, components: Array.from({ length: 40 }, () => ({ type: 10 as const, content: blocks })) }, { highlight });
  assert.equal(calls, 10);
});

// ---- mediaUrl

const PROXY = 'https://proxy.example/m?u=';
const proxied = (url: string) => `${PROXY}${encodeURIComponent(url)}`;
const media = (html: string) => [...attrs(html, 'src'), ...attrs(html, 'poster')];

test('mediaUrl: every image source in every fixture goes through the hook, which sees only checked URLs', () => {
  for (const { name, props } of fixtures) {
    const seen: string[] = [];
    const html = render(props.payload, { ...props, twemoji: true, mediaUrl: (u) => (seen.push(u), proxied(u)) });
    for (const src of media(html)) assert.ok(src.startsWith(PROXY), `${name}: ${src}`);
    for (const u of seen) assert.match(u, props.localMedia ? /^(?:https?:\/\/|data:image\/|blob:)/ : /^https?:\/\//, name);
  }
  const all = render(
    {
      author: { id: '1', avatar: '0123456789abcdef0123456789abcdef', avatar_decoration_data: { asset: '0123456789abcdef0123456789abcdef' } },
      content: '<:wave:123> 👍',
      sticker_items: [{ id: '5', format_type: 1 }],
      reactions: [{ count: 1, emoji: { id: '6', name: 'x' } }],
      attachments: [{ filename: 'a.png', url: 'https://cdn.example/a.png', width: 10, height: 10 }],
      embeds: [{ author: { name: 'A', icon_url: 'https://cdn.example/i.png' }, thumbnail: { url: 'https://cdn.example/t.png' }, image: { url: 'https://cdn.example/b.png' } }],
    },
    { twemoji: true, mediaUrl: proxied },
  );
  assert.equal(media(all).length, 10); // avatar, decoration, emoji, Twemoji, attachment, author icon, thumbnail, image, sticker, reaction
  assert.ok(media(all).every((s) => s.startsWith(PROXY)));
});

test('mediaUrl: undefined, a throw, javascript: or a relative URL drops the media', () => {
  const { props } = fixtures.find((f) => f.name === 'media/images-4')!;
  assert.ok(media(render(props.payload, props)).length > 1);
  for (const hook of [
    () => undefined,
    () => {
      throw new Error('no');
    },
    () => 'javascript:alert(1)',
    () => '/logout',
  ])
    for (const [, draw] of RENDERERS) assert.deepEqual(media(draw({ ...props, mediaUrl: hook })), []);
  assert.deepEqual(media(render({ content: '<:wave:123>', reactions: [{ emoji: { id: '6', name: 'x' } }] }, { mediaUrl: () => undefined })), []);
});

test('mediaUrl: a non-function, or one in the payload, is ignored', () => {
  const { props } = fixtures.find((f) => f.name === 'media/images-2')!;
  const plain = render(props.payload, props);
  assert.equal(render(props.payload, { ...props, mediaUrl: 'https://proxy.example/' as never }), plain);
  assert.equal(render({ ...props.payload, mediaUrl: () => undefined } as PreviewMessage, props), plain);
});

// ---- Masked links and nested links

test('masked links: a label naming a site renders as text; ordinary labels still link', () => {
  for (const label of ['**discord.com/login**', '_discord.com_', '`discord.com`', 'discord.com.', '(discord.com)', 'Go to discord.com/login', 'https://x', '~~ex.am~~ple.org']) {
    const html = render({ content: `[${label}](https://evil.example)` });
    assert.ok(!html.includes('<a '), label);
  }
  for (const label of ['click here', 'the docs', 'v2.0 notes']) assert.ok(render({ content: `[${label}](https://example.com)` }).includes('href="https://example.com"'), label);
});

test('links never nest: a linked embed title shows its own links as text', () => {
  const html = render({ embeds: [{ url: 'https://a.example', title: 'See [x](https://b.example) and https://c.example' }] });
  assert.deepEqual(
    parse(html).filter(([el, inside]) => el.nodeName === 'a' && inside.includes('a')),
    [],
  );
  assert.ok(html.includes('See [x](https://b.example) and https://c.example'));
  for (const { name, props } of fixtures) assert.deepEqual(parse(render(props.payload, props)).filter(([el, inside]) => el.nodeName === 'a' && inside.includes('a')), [], name);
});

// ---- Text totals

const letters = (html: string) => count(html.replace(/<[^>]+>/g, ''), /q/g);

test("text totals: Discord's per-message limits, each counted once", () => {
  const embed = { title: 'q'.repeat(256), description: 'q'.repeat(4096), fields: Array.from({ length: 25 }, () => ({ name: 'q'.repeat(256), value: 'q'.repeat(1024) })), footer: { text: 'q'.repeat(2048) }, author: { name: 'q'.repeat(256) } };
  assert.equal(letters(render({ embeds: Array.from({ length: 10 }, () => embed) })), 6000);
  assert.equal(letters(render({ content: 'q'.repeat(5000) })), 4000);
  assert.equal(letters(render({ flags: 32768, components: Array.from({ length: 40 }, () => ({ type: 10 as const, content: 'q'.repeat(4000) })) })), 4000);
  const snapshot = { content: 'q'.repeat(4000), embeds: [embed, embed] };
  assert.equal(letters(render({ content: 'q'.repeat(4000), message_reference: { type: 1 }, message_snapshots: [{ message: snapshot }] })), 4000 + 4000 + 6000);
  const modal: PreviewModal = { title: 'M', components: Array.from({ length: 5 }, () => ({ type: 10 as const, content: 'q'.repeat(4000) })) };
  assert.equal(letters(render({}, { modal })), 4000);
});

test('text totals: a spoiler opened later still shows its text', async () => {
  const { Window } = await import('happy-dom');
  const win = new Window();
  try {
    for (const k of ['window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'Event', 'Node', 'MutationObserver'] as const) Object.defineProperty(globalThis, k, { value: k === 'window' ? win : win[k], configurable: true, writable: true });
    const { DiscordPreviewElement } = await import('../dist/element.js');
    const el = new DiscordPreviewElement();
    Object.assign(el, DEFAULTS, { payload: { flags: 32768, components: [{ type: 17, spoiler: true, components: [{ type: 10, content: 'hidden words' }] }] } });
    document.body.append(el as unknown as HTMLElement);
    await new Promise((r) => setTimeout(r, 0));
    ((el as unknown as HTMLElement).querySelector('button') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal((el as unknown as HTMLElement).querySelector('.blur-xl'), null, 'opened');
    assert.ok((el as unknown as HTMLElement).textContent?.includes('hidden words'));
  } finally {
    await win.happyDOM.close();
  }
});

// ---- Style values

const COLOR = '#[0-9A-Fa-f]{6}(?:1a|26)?';
const VALUE = new RegExp(
  `^(?:${[
    COLOR,
    String.raw`\d+(?:\.\d+)?(?:px|%|ch|em)?`,
    String.raw`\d+ / \d+`,
    String.raw`0 0 0 2px var\(--dp-ring\)`,
    `4px solid ${COLOR}`,
    String.raw`calc\(0\.4em \+ \d+ch\)`,
    String.raw`linear-gradient\(to right(?:, ${COLOR}){2,4}\)`,
    String.raw`rgba\(\d{1,3},\d{1,3},\d{1,3},0?\.\d+\)`,
    'transparent',
    String.raw`var\(--dsel-(?:bg|line|muted|text)\)`,
  ].join('|')})$`,
);
const PROPERTY = /^(?:--dsel-(?:bg|line|muted|text)|[a-z]+(?:-[a-z]+)*)$/;

function checkStyles(html: string, what: string) {
  for (const style of attrs(html, 'style'))
    for (const decl of style.split(';').filter((d) => d.trim())) {
      const at = decl.indexOf(':');
      assert.match(decl.slice(0, at).trim(), PROPERTY, `${what}: ${decl}`);
      assert.match(decl.slice(at + 1).trim(), VALUE, `${what}: ${decl}`);
    }
}

const HOSTILE = ['red;position:fixed', '#fff;position:fixed', 1.5, -1, 16777216, 1e308, 'url(x)', '1e3'];
const SIZES = ['100;position:fixed', '1e9', 1e308, -5, 0.5, 'NaN'];

test('style values: only colours, lengths and the fixed forms the source writes, whatever the payload says', () => {
  for (const [, draw] of RENDERERS) {
    for (const { name, props } of fixtures) checkStyles(draw(props), name);
    for (const bad of HOSTILE) {
      const roles = { '1': { name: 'R', position: 1, colors: { primary_color: bad, secondary_color: bad, tertiary_color: bad } as never, color: bad as never } };
      const payload: PreviewMessage = {
        author: { id: '9', username: 'u' },
        member: { roles: ['1'] },
        content: '<@&1>',
        reactions: [{ count: bad as never, burst_colors: [String(bad), '#fff;position:fixed', '#12345g'], count_details: { burst: bad as never, normal: bad as never } }],
        poll: { question: { text: 'q' }, answers: [{ answer_id: 1, poll_media: { text: 'a' } }], results: { answer_counts: [{ id: 1, count: bad as never }] } },
        embeds: [{ color: bad as never, title: 't' }],
      };
      checkStyles(draw({ ...DEFAULTS, payload, resolve: { roles } }), String(bad));
    }
    for (const size of SIZES) {
      const payload: PreviewMessage = {
        flags: 8192,
        attachments: [
          { filename: 'a.png', url: 'https://e.example/a.png', width: size as never, height: size as never },
          { filename: 'v.mp4', url: 'https://e.example/v.mp4', width: size as never, height: size as never },
          { filename: 'voice.ogg', content_type: 'audio/ogg', url: 'https://e.example/v.ogg', duration_secs: size as never, waveform: 'AAAA' },
        ],
        embeds: [{ image: { url: 'https://e.example/i.png', width: size as never, height: size as never }, thumbnail: { url: 'https://e.example/t.png', width: size as never, height: size as never } }],
      };
      checkStyles(draw({ ...DEFAULTS, payload }), String(size));
    }
    for (const n of [1e308, -1e308, 2 ** 53, -1]) {
      const html = draw({ ...DEFAULTS, payload: { poll: { answers: [{ answer_id: 1 }, { answer_id: 2 }], results: { answer_counts: [{ id: 1, count: n }, { id: 2, count: n }] } }, reactions: [{ count: n, emoji: { name: 'x' } }] } });
      assert.ok(!/Infinity|NaN|e\+/.test(html), String(n));
      checkStyles(html, String(n));
    }
  }
});
