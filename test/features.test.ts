import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import { jumbo } from '../src/markdown.tsx';
import { twemojiUrl } from '../src/shared.tsx';
import type { PreviewMessage, PreviewProps } from '../src/types.ts';
import { DEFAULTS } from './fixtures.ts';

const render = (payload: PreviewMessage, extra: Partial<PreviewProps> = {}) => renderToStaticMarkup(createElement(DiscordPreview, { ...DEFAULTS, bare: true, payload, ...extra }));
const JUMBO = '[&amp;_img]:size-12';
const ZWJ = String.fromCodePoint(0x200d);
const VS16 = String.fromCodePoint(0xfe0f);

// ---- Jumbo emoji

test('jumbo: only emoji (custom or unicode, 1 to 30) and whitespace', () => {
  assert.equal(jumbo('😀'), true);
  assert.equal(jumbo(' <:wave:123> 👍🏽\n🇳🇱 <a:spin:456> '), true);
  assert.equal(jumbo('👨‍👩‍👧'), true, 'a ZWJ sequence counts once');
  assert.equal(jumbo('😀'.repeat(30)), true);
  assert.equal(jumbo('😀'.repeat(31)), false);
  assert.equal(jumbo('hi 😀'), false);
  assert.equal(jumbo('**😀**'), false);
  assert.equal(jumbo('   '), false);
  assert.equal(jumbo('1'), false, 'a digit is no emoji');
});

test('jumbo: message content only, not embeds, text displays or replies', () => {
  assert.ok(render({ content: '😀 <:wave:123>' }).includes(JUMBO));
  assert.ok(!render({ content: 'hey 😀' }).includes(JUMBO));
  assert.ok(!render({ embeds: [{ description: '😀' }] }).includes(JUMBO));
  assert.ok(!render({ flags: 32768, components: [{ type: 10, content: '😀' }] }).includes(JUMBO));
  assert.ok(!render({ type: 19, content: 'a reply', message_reference: { message_id: '1' }, referenced_message: { content: '😀' } }).includes(JUMBO));
});

// ---- Twemoji

test('twemoji: Twemoji file names for flags, skin tones and ZWJ sequences', () => {
  const name = (e: string) => twemojiUrl(e).split('/').pop();
  assert.ok(twemojiUrl('😀').startsWith('https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/'));
  assert.equal(name('🇳🇱'), '1f1f3-1f1f1.svg');
  assert.equal(name('👍🏽'), '1f44d-1f3fd.svg');
  assert.equal(name('👨‍👩‍👧'), '1f468-200d-1f469-200d-1f467.svg');
  assert.equal(name(`❤${VS16}`), '2764.svg', 'FE0F dropped without a ZWJ');
  assert.equal(name(`🏳${VS16}${ZWJ}🌈`), '1f3f3-fe0f-200d-1f308.svg', 'FE0F kept with a ZWJ');
});

const everywhere: PreviewMessage = {
  content: 'Hi 👍🏽 there',
  reactions: [{ count: 2, emoji: { name: '🇳🇱' } }],
  poll: { question: { text: 'Q' }, answers: [{ poll_media: { text: 'A', emoji: { name: '🍕' } } }] },
  components: [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: 'Go', emoji: { name: '🚀' }, custom_id: 'go' },
        { type: 3, custom_id: 's', options: [{ label: 'Party', value: 'p', emoji: { name: '🎉' } }] },
      ],
    },
  ],
};

test('twemoji: off by default, unicode emoji stay text', () => {
  const html = render(everywhere);
  assert.ok(!html.includes('jsdelivr'));
  assert.ok(html.includes('Hi 👍🏽 there'));
});

test('twemoji: markdown, reactions, poll answers, buttons and select options, with the emoji as alt', () => {
  const html = render(everywhere, { twemoji: true });
  for (const [e, file] of [
    ['👍🏽', '1f44d-1f3fd'],
    ['🇳🇱', '1f1f3-1f1f1'],
    ['🍕', '1f355'],
    ['🚀', '1f680'],
    ['🎉', '1f389'],
  ] as const) assert.ok(html.includes(`alt="${e}"`) && html.includes(`/svg/${file}.svg`), e);
  assert.ok(html.includes('Hi <img'), 'the text around an emoji stays');
  assert.ok(render({ content: '`👍` x' }, { twemoji: true }).includes('<code') && !render({ content: '`👍`' }, { twemoji: true }).includes('jsdelivr'), 'not inside code');
});

// ---- Highlight

const fenced = 'before\n```js\nlet a = 1 < 2;\n```\n```\nplain\n```\n`inline`';
const hl = (code: string, lang: string) => `<span class="hl-${lang}">${code.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</span>`;

test('highlight: off by default, every block plain text', () => {
  const html = render({ content: fenced });
  assert.ok(html.includes('let a = 1 &lt; 2;') && !html.includes('hl-'));
});

test('highlight: only a fenced block that names a language gets the HTML, inside <code>', () => {
  const calls: [string, string][] = [];
  const html = render({ content: fenced }, { highlight: (code, lang) => (calls.push([code, lang]), hl(code, lang)) });
  assert.deepEqual(calls, [['let a = 1 < 2;', 'js']]);
  assert.ok(html.includes('<code class="bg-transparent"><span class="hl-js">let a = 1 &lt; 2;</span></code>'));
  assert.ok(html.includes('>plain</pre>'), 'no language: plain');
  assert.ok(html.includes('>inline</code>'), 'inline code: plain');
});

test('highlight: a returned undefined, or anything but a function, leaves the block as it is', () => {
  const plain = render({ content: fenced });
  assert.equal(render({ content: fenced }, { highlight: () => undefined }), plain);
  for (const bad of ['<b>x</b>', { call: () => '<b>x</b>' }, 1]) assert.equal(render({ content: fenced }, { highlight: bad as never }), plain);
  // the payload has no say: a `highlight` key in it is never read
  assert.equal(render({ content: fenced, highlight: hl } as PreviewMessage), plain);
});

// ---- Media gallery

test('gallery: a Components V2 media gallery is the same mosaic as attachments', () => {
  const urls = [1, 2, 3].map((i) => `https://cdn.example/p${i}.png`);
  const gallery = render({ flags: 32768, components: [{ type: 12, items: urls.map((url) => ({ media: { url } })) }] });
  const attached = render({ attachments: urls.map((url, i) => ({ filename: `p${i}.png`, content_type: 'image/png', url })) });
  const mosaic = (html: string) => html.slice(html.indexOf('<div class="grid'), html.lastIndexOf('</div></div>'));
  assert.ok(gallery.includes('grid-rows-2') && gallery.includes('row-span-2'), 'three images: one tall and two stacked');
  assert.equal(mosaic(gallery).match(/<img/g)?.length, 3);
  assert.ok(mosaic(attached).startsWith(mosaic(gallery).slice(0, 200)));
  const one = render({ flags: 32768, components: [{ type: 12, items: [{ media: { url: urls[0], width: 1600, height: 1200 } }] }] });
  assert.ok(one.includes('width:467px') && one.includes('w-fit'), 'one image at its own size');
});
