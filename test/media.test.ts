import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { duration, fit, kind, waveform } from '../src/attachments.tsx';
import { fileSize } from '../src/shared.tsx';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import type { PreviewAttachment, PreviewEmbed, PreviewMessage, PreviewProps } from '../src/types.ts';
import { DEFAULTS } from './fixtures.ts';

const render = (payload: PreviewMessage, extra: Partial<PreviewProps> = {}) => renderToStaticMarkup(createElement(DiscordPreview, { ...DEFAULTS, bare: true, payload, ...extra }));
const png = (i: number, extra: PreviewAttachment = {}): PreviewAttachment => ({ filename: `p${i}.png`, content_type: 'image/png', url: `https://cdn.example/p${i}.png`, width: 100, height: 100, ...extra });
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

test('media: sizes, durations and fitting boxes', () => {
  assert.equal(fileSize(512), '512 bytes');
  assert.equal(fileSize(81234), '79.33 KB');
  assert.equal(fileSize(5242880), '5.00 MB');
  assert.equal(fileSize(-1), '');
  assert.equal(fileSize('9'), '');
  assert.equal(duration(7.42), '0:07');
  assert.equal(duration(3725), '1:02:05');
  assert.equal(duration(Number.NaN), '0:00');
  assert.deepEqual(fit(1600, 1200, 550, 350), { width: '467px', aspectRatio: '467 / 350' });
  assert.deepEqual(fit(40, 20, 550, 350), { width: '40px', aspectRatio: '40 / 20' });
  for (const bad of [0, -5, Number.NaN, '100', 1e9, null]) assert.equal(fit(bad, 100, 550, 350), undefined);
});

test('media: waveform decoding is defensive', () => {
  assert.deepEqual(waveform('/wAA', 3), [1, 0, 0]);
  for (const bad of ['not base64!', '', 5, '====', 'A'.repeat(100_000)]) assert.ok(waveform(bad).every((v) => v === 0), String(bad).slice(0, 20));
  assert.equal(waveform('AAAA').length, 40);
});

test('media: kind by content type, else extension', () => {
  assert.equal(kind({ content_type: 'video/mp4', filename: 'x.png' }), 'video');
  assert.equal(kind({ filename: 'a.JPG' }), 'image');
  assert.equal(kind({ content_type: 'application/octet-stream', filename: 'a.ogg' }), 'audio');
  assert.equal(kind({ filename: 'a.pdf' }), 'file');
  assert.equal(kind({ content_type: 5 as never, filename: null as never }), 'file');
});

test('media: mosaic layouts for 1 to 10 images', () => {
  const grid = (n: number) => render({ attachments: Array.from({ length: n }, (_, i) => png(i)) });
  assert.match(grid(1), /style="width:100px;aspect-ratio:100 \/ 100"/);
  assert.equal(count(grid(2), /col-span-3 aspect-square/g), 2);
  assert.ok(grid(3).includes('grid-rows-2') && grid(3).includes('row-span-2'));
  assert.equal(count(grid(4), /col-span-3 aspect-\[3\/2\]/g), 4);
  assert.equal(count(grid(5), /col-span-2 aspect-square/g), 3);
  assert.equal(count(grid(7), /col-span-6/g), 1);
  assert.equal(count(grid(10), /col-span-6/g), 1);
  assert.equal(count(grid(10), /col-span-2 aspect-square/g), 9);
  assert.equal(count(render({ attachments: Array.from({ length: 50 }, (_, i) => png(i)) }), /<img/g), 10 + 1); // + avatar
});

test('media: alt badge, spoilers, title and links', () => {
  const html = render({ attachments: [png(1, { description: 'a cat' }), png(2, { filename: 'SPOILER_x.png' }), png(3, { flags: 8 })] });
  assert.ok(html.includes('alt="a cat"') && count(html, />ALT</g) === 1);
  assert.equal(count(html, />SPOILER</g), 2);
  const file = render({ attachments: [{ filename: 'a.pdf', title: 'Nice name.pdf', size: 2048, url: 'https://cdn.example/a.pdf' }] });
  assert.ok(file.includes('Nice name.pdf') && file.includes('2.00 KB'));
  assert.equal(count(file, /rel="noopener noreferrer nofollow ugc"/g), 2);
  assert.ok(!render({ attachments: [{ filename: 'a.pdf', url: 'javascript:alert(1)' }] }).includes('<a '));
});

test('media: video, audio and voice messages are play buttons until pressed', () => {
  const html = render({ attachments: [{ filename: 'a.mp4', url: 'https://cdn.example/a.mp4', width: 1920, height: 1080 }, { filename: 'a.mp3', url: 'https://cdn.example/a.mp3' }] });
  assert.ok(html.includes('Play video') && html.includes('Play audio') && !html.includes('<video') && !html.includes('<audio') && !/autoplay/i.test(html));
  assert.ok(html.includes('width:550px;aspect-ratio:550 / 309'));
  const voice = render({ flags: 8192, attachments: [{ filename: 'voice-message.ogg', content_type: 'audio/ogg', url: 'https://cdn.example/v.ogg', duration_secs: 7, waveform: '/wAA' }] });
  assert.ok(voice.includes('Play voice message') && voice.includes('0:07') && !voice.includes('<audio'));
  assert.equal(count(voice, /w-\[3px\]/g), 40);
  assert.ok(render({ flags: 8192, attachments: [{ filename: 'v.ogg', content_type: 'audio/ogg', waveform: '%%%' }] }).includes('height:3px'));
});

test('media: stickers by format', () => {
  const html = render({
    sticker_items: [
      { id: '1', name: 'a', format_type: 2 },
      { id: '2', name: 'Lottie one', format_type: 3 },
      { id: '3', name: 'c', format_type: 4 },
    ],
  });
  assert.ok(html.includes('https://cdn.discordapp.com/stickers/1.png') && html.includes('https://media.discordapp.net/stickers/3.gif'));
  assert.ok(html.includes('>Lottie one<') && !html.includes('stickers/2.'));
  assert.ok(render({ sticker_ids: ['7'] }).includes('stickers/7.png'));
});

test('embeds: links, provider and types', () => {
  const rich = render({ embeds: [{ title: 'T', url: 'https://e.example', author: { name: 'Au', url: 'https://e.example/au' }, provider: { name: 'Prov', url: 'javascript:x' } }] });
  assert.equal(count(rich, /<a /g), 2);
  assert.ok(rich.includes('>Prov<'));
  assert.ok(!render({ embeds: [{ title: 'T', url: 'javascript:alert(1)' }] }).includes('<a '));

  const image = render({ embeds: [{ type: 'image', url: 'https://e.example/x.png', thumbnail: { url: 'https://e.example/x.png', width: 800, height: 600 } }] });
  assert.ok(!image.includes('border-l-4') && image.includes('width:467px'));
  const gifv = render({ embeds: [{ type: 'gifv', thumbnail: { url: 'https://e.example/t.png' }, video: { url: 'https://e.example/v.mp4', width: 400, height: 200 } }] });
  assert.ok(gifv.includes('Play video') && gifv.includes('src="https://e.example/t.png"') && !gifv.includes('border-l-4') && !gifv.includes('<video'));
  const video = render({ embeds: [{ type: 'video', url: 'https://yt.example/v', title: 'V', thumbnail: { url: 'https://yt.example/t.jpg', width: 1280, height: 720 } }] });
  assert.ok(video.includes('aria-label="Play"') && video.includes('width:400px;aspect-ratio:400 / 225') && !video.includes('<iframe'));
  const article = render({ embeds: [{ type: 'article', title: 'A', thumbnail: { url: 'https://e.example/t.png', width: 1200, height: 600 } }] });
  assert.ok(article.includes('width:400px;aspect-ratio:400 / 200'));
  const link = render({ embeds: [{ type: 'link', title: 'L', thumbnail: { url: 'https://e.example/t.png', width: 256, height: 128 } }] });
  assert.ok(link.includes('width:80px;aspect-ratio:80 / 40'));
  assert.ok(!render({ embeds: [{ type: 'poll_result', title: 'Hidden' }] }).includes('Hidden'));
});

test('embeds: consecutive embeds sharing a url merge into one gallery', () => {
  const e = (i: number, url = 'https://e.example/g'): PreviewEmbed => ({ url, title: `t${i}`, image: { url: `https://e.example/${i}.png` } });
  const html = render({ embeds: [e(0), e(1), e(2), e(3, 'https://other.example'), e(4, 'https://other.example')] });
  assert.equal(count(html, /border-l-4/g), 2);
  assert.ok(html.includes('t0') && !html.includes('t1') && html.includes('t3') && !html.includes('t4'));
  assert.ok(html.includes('grid-rows-2')); // three images: the three-image mosaic
  assert.equal(count(html, /<img/g), 5 + 1);
});
