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
  assert.equal(quoted.match(/<blockquote/g)?.length, 1);
  assert.ok(text('before\n>>> first\nsecond').includes('beforefirstsecond'));
  const lists = html('3. a\n1. b\n\n1. c');
  assert.equal(lists.match(/<ol/g)?.length, 2);
  assert.ok(lists.includes('start="3"') && lists.includes('start="1"'));
});

test('markdown: consecutive > lines share one bar, and are not quoted twice', () => {
  const out = html('> one\n> two\n> > three\nafter\n> again');
  assert.equal(out.match(/<blockquote/g)?.length, 2);
  assert.ok(text('> one\n> two\n> > three').includes('&gt; three'));
  assert.match(html('> # head\n> - item'), /<blockquote[^>]*><div[^>]*font-bold[^>]*>head<\/div><div><ul/);
});

test('markdown: nested lists by indent, with Discord bullet shapes', () => {
  const out = html('- a\n  - b\n    - c\n      - d\n  - e\n- f\n  1. g\n  2. h');
  const shapes = [...out.matchAll(/<(ul|ol)[^>]*class="[^"]*(list-[a-z[\]]+)/g)].map((m) => m[2]);
  assert.deepEqual(shapes, ['list-disc', 'list-[circle]', 'list-[square]', 'list-[square]', 'list-decimal']);
  assert.match(out, /<li>a<ul[^>]*><li>b<ul[^>]*><li>c<ul[^>]*><li>d<\/li><\/ul><\/li><\/ul><\/li><li>e<\/li><\/ul><\/li><li>f<ol/);
  assert.equal(html(' - one space is not a level\n- x').match(/<ul/g)?.length, 1);
  assert.doesNotThrow(() => html(Array.from({ length: 200 }, (_, i) => `${' '.repeat(i * 2)}- x`).join('\n')));
  assert.equal(html('- a\n1. b\n- c').match(/<(ul|ol)/g)?.length, 3);
});

test('markdown: nesting of emphasis', () => {
  assert.match(html('**a *b* c**'), /<strong>a <em>b<\/em> c<\/strong>/);
  assert.match(html('__a _b_ c__'), /<u>a <em>b<\/em> c<\/u>/);
  assert.match(html('___both___'), /<u><em>both<\/em><\/u>/);
  assert.match(html('~~**x**~~'), /<s><strong>x<\/strong><\/s>/);
  assert.ok(text('**open and *a *').includes('**open and *a *'));
  assert.ok(text('*not italic *').includes('*not italic *'));
});

test('markdown: code keeps everything as typed', () => {
  assert.match(html('`**x** <@1> @everyone`'), /<code[^>]*>\*\*x\*\* &lt;@1&gt; @everyone<\/code>/);
  assert.match(html('``a ` b``'), /<code[^>]*>a ` b<\/code>/);
  assert.match(html('`` `x` ``'), /<code[^>]*>`x`<\/code>/);
  assert.match(html('```one **line**```'), /<pre[^>]*>one \*\*line\*\*<\/pre>/);
});

test('markdown: inline spoilers hide their text until revealed', () => {
  const out = html('a ||secret **bold**|| b');
  assert.match(out, /role="button" tabindex="0" aria-label="Spoiler"[^>]*><span class="invisible">secret <strong>bold<\/strong><\/span>/);
});

test('mentions: @everyone, @here, slash commands and guild navigation', () => {
  const pills = (s: string) => [...html(s).matchAll(/font-medium"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(pills('@everyone and @here, not a@everyone or @heretic or @@here'), ['@everyone', '@here']);
  assert.deepEqual(pills('</ping:1> </role add:2> </mod user ban:3>'), ['/ping', '/role add', '/mod user ban']);
  assert.deepEqual(pills('<id:customize> <id:browse> <id:guide> <id:linked-roles> <id:nope>'), ['Channels &amp; Roles', 'Browse Channels', 'Server Guide', 'Linked Roles']);
});

test('mentions: a role pill takes the role colour', () => {
  const roles = { '1': { name: 'Red', color: 0xff0000 }, '2': { name: 'Plain', color: 0 }, '3': { name: 'Bad', color: 'red;x' as unknown as number } };
  const out = html('<@&1> <@&2> <@&3>', { resolve: { roles } });
  assert.ok(out.includes('style="color:#ff0000;background:#ff00001a"'), out);
  assert.equal(out.match(/rgba\(88,101,242,0.3\)/g)?.length, 2);
});

test('links: <url>, trailing punctuation and Discord channel links', () => {
  assert.match(html('<https://example.com/a>'), /<a [^>]*href="https:\/\/example.com\/a"[^>]*>https:\/\/example.com\/a<\/a>/);
  assert.match(html('see https://example.com/a.'), /href="https:\/\/example.com\/a"[^>]*>https:\/\/example.com\/a<\/a>\.</);
  const resolve = { channels: { '22': { name: 'general' } } };
  const ch = html('https://discord.com/channels/11/22', { resolve });
  assert.match(ch, /<a [^>]*font-medium[^>]*>#general<\/a>/);
  const msg = html('https://discord.com/channels/11/22/33', { resolve });
  assert.match(msg, />#general › <svg/);
  assert.match(html('https://discord.com/channels/11/99'), />https:\/\/discord.com\/channels\/11\/99<\/a>/);
  assert.match(html('[**docs**](https://example.com)'), /<a [^>]*><strong>docs<\/strong><\/a>/);
});

test('custom emoji: an id too long to be a snowflake stays text', () => {
  assert.ok(!html('<:x:123456789012345678901>').includes('/emojis/'));
  assert.ok(html('<:x:12345>').includes('src="https://cdn.discordapp.com/emojis/12345.png"'));
});

test('timestamps follow locale, time zone and now', () => {
  assert.match(html('<t:1618935630:D>'), />April 20, 2021</);
  assert.match(html('<t:1618935630:t>', { timeZone: 'Asia/Tokyo' }), />1:20 AM</);
  assert.match(html('<t:1767265200:R>'), />1 hour ago</);
  const all = Object.fromEntries(['', 't', 'T', 'd', 'D', 'f', 'F', 's', 'S', 'R'].map((s) => [s, /title="[^"]*">([^<]+)</.exec(html(`<t:1618935630${s && `:${s}`}>`))?.[1]]));
  assert.deepEqual(all, {
    '': 'April 20, 2021 at 4:20 PM',
    t: '4:20 PM',
    T: '4:20:30 PM',
    d: '04/20/2021',
    D: 'April 20, 2021',
    f: 'April 20, 2021 at 4:20 PM',
    F: 'Tuesday, April 20, 2021 at 4:20 PM',
    s: '04/20/2021, 4:20 PM',
    S: '04/20/2021, 4:20:30 PM',
    R: '5 years ago',
  });
  assert.match(html('<t:1618935630:R>'), /title="Tuesday, April 20, 2021 at 4:20 PM"/);
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
