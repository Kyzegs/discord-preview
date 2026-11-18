import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import type { PreviewProps } from '../src/types.ts';
import { DEFAULTS } from './fixtures.ts';

const render = (props: PreviewProps) => renderToStaticMarkup(createElement(DiscordPreview, { ...DEFAULTS, bare: true, ...props }));
const html = (content: string, extra: Partial<PreviewProps> = {}) => render({ payload: { flags: 32768, components: [{ type: 10, content }] }, ...extra });
const text = (content: string, extra: Partial<PreviewProps> = {}) => html(content, extra).replace(/<[^>]+>/g, '');

test('markdown: emphasis and escapes', () => {
  assert.match(html('_one_ and *two*'), /<em>one<\/em> and <em>two<\/em>/);
  assert.match(html('***both***'), /<strong><em>both<\/em><\/strong>/);
  assert.match(html('__under__ snake_case_word'), /<u>under<\/u> snake_case_word/);
  assert.ok(text('\\*not italic\\* \\_ \\# x').includes('*not italic* _ # x'));
  assert.ok(text('Hi {user.name}').includes('Hi {user.name}'));
});

test('markdown: multi-line quotes and numbered lists', () => {
  const quoted = html('before\n>>> first\nsecond');
  assert.equal(quoted.match(/border-l-4/g)?.length, 2);
  assert.ok(text('before\n>>> first\nsecond').includes('beforefirstsecond'));
  assert.ok(text('3. a\n1. b\n\n1. c').includes('3. a4. b1. c'));
});

test('timestamps follow locale, time zone and now', () => {
  assert.match(html('<t:1618935630:D>'), />April 20, 2021</);
  assert.match(html('<t:1618935630:t>', { timeZone: 'Asia/Tokyo' }), />1:20 AM</);
  assert.match(html('<t:1767265200:R>'), />1 hour ago</);
  assert.ok(text('<t:99999999999999999:f>').includes('&lt;t:99999999999999999:f&gt;'));
  assert.doesNotThrow(() => html('<t:1:f>', { locale: 'not a locale', timeZone: 'Nowhere/Else' }));
});

test('the author line', () => {
  const author = { id: '80351110224678912', username: 'ana', global_name: 'Ana', avatar: 'abc123' };
  const page = render({ payload: { author, content: 'hi', timestamp: '2026-01-01T09:30:00Z' } });
  assert.ok(page.includes('Ana') && page.includes('src="https://cdn.discordapp.com/avatars/80351110224678912/abc123.png?size=80"') && !page.includes('APP'));
  assert.ok(page.includes('Today at 9:30 AM'));
  assert.ok(render({ payload: { author: { ...author, bot: true }, content: 'hi', timestamp: '2025-12-31T09:30:00Z' } }).includes('APP'));
  assert.ok(render({ payload: { content: 'hi', timestamp: '2025-12-31T09:30:00Z' } }).includes('12/31/25, 9:30 AM'));
  assert.ok(render({ payload: { author, content: 'hi' }, resolve: { users: { [author.id]: { name: 'Resolved' } } } }).includes('Resolved'));
  assert.ok(render({ payload: { content: 'hi' } }).includes('Unknown') && render({ payload: {} }).includes('embed/avatars/0.png'));
});

test('mentions resolve names, or say they are unknown', () => {
  const resolve = { users: { '1': { name: 'One' } }, roles: { '2': { name: 'Mods' } }, channels: { '3': { name: 'rules' } } };
  const out = text('<@1> <@!4> <@5> <@&2> <@&6> <#3> <#7>', { resolve, payload: { flags: 32768, mentions: [{ id: '4', username: 'four' }], components: [{ type: 10, content: '<@1> <@!4> <@5> <@&2> <@&6> <#3> <#7>' }] } });
  assert.ok(out.includes('@One @four @unknown-user @Mods @unknown-role #rules #unknown'), out);
});

test('links: only http(s), opened safely', () => {
  const out = html('[a](https://example.com/x) https://example.com/y');
  assert.equal(out.match(/rel="noopener noreferrer nofollow ugc"/g)?.length, 2);
  assert.equal(out.match(/target="_blank"/g)?.length, 2);
  assert.ok(!html('[a](javascript:alert(1))').includes('<a '));
});

test('links: a masked link whose label looks like a URL stays plain text', () => {
  for (const label of ['https://discord.com/login', 'www.discord.com', 'discord.com', 'discord.com/login']) assert.ok(!html(`[${label}](https://evil.example/x)`).includes('<a '), label);
  assert.ok(html('[the docs](https://example.com)').includes('<a '));
  assert.ok(html('[version 2.0](https://example.com)').includes('<a '));
});
