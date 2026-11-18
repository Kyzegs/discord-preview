import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import type { PreviewMessage, PreviewProps } from '../src/types.ts';
import { DEFAULTS } from './fixtures.ts';

const render = (props: PreviewProps) => renderToStaticMarkup(createElement(DiscordPreview, { ...DEFAULTS, bare: true, ...props }));
const page = (payload: PreviewMessage, extra: Partial<PreviewProps> = {}) => render({ payload, ...extra });
const text = (payload: PreviewMessage, extra: Partial<PreviewProps> = {}) => page(payload, extra).replace(/<[^>]+>/g, '');

const ana = { id: '80351110224678912', username: 'ana', global_name: 'Ana' };
const HASH = '0123456789abcdef0123456789abcdef';

test('reply header: snippet, deleted, not loaded, attachment', () => {
  const ref = { message_reference: { message_id: '1' }, content: 'reply' };
  const out = text({ ...ref, referenced_message: { author: ana, content: '**bold**\nsecond line' } });
  assert.ok(out.includes('@Ana') && out.includes('bold second line'), out);
  assert.ok(text({ ...ref, referenced_message: null }).includes('Original message was deleted'));
  assert.ok(text(ref).includes('Message could not be loaded'));
  assert.ok(text({ ...ref, referenced_message: { author: ana, attachments: [{ id: '1' }] } }).includes('Click to see attachment'));
  assert.ok(text({ type: 19, referenced_message: { author: ana, content: 'x' } }).includes('@Ana'));
  // a forward, a crosspost and a system message are not replies
  assert.ok(!text({ message_reference: { type: 1 }, referenced_message: null }).includes('deleted'));
  assert.ok(!text({ flags: 2, message_reference: {}, referenced_message: null }).includes('deleted'));
  assert.ok(!text({ type: 6, message_reference: {}, referenced_message: null }).includes('deleted'));
  // the snippet is capped, whatever the referenced message holds
  assert.ok(page({ ...ref, referenced_message: { content: 'x'.repeat(100_000) } }).length < 5000);
});

test('interaction header names the command, or says a command', () => {
  const user = ana;
  assert.ok(text({ interaction_metadata: { user }, interaction: { name: 'ping' } }).includes('Anaused/ping'));
  assert.ok(text({ interaction_metadata: { user } }).includes('Anaused a command'));
});

test('forwarded: snapshot content, channel and time, never a nested snapshot', () => {
  const snap = { content: 'inner', timestamp: '2026-01-01T08:00:00Z', message_snapshots: [{ message: { content: 'nested' } }], message_reference: { type: 1 } };
  const out = text({ message_reference: { type: 1, channel_id: '5' }, message_snapshots: [{ message: snap }] }, { resolve: { channels: { '5': { name: 'news' } } } });
  assert.ok(out.includes('Forwarded') && out.includes('inner') && out.includes('#news • Today at 8:00 AM'), out);
  assert.ok(!out.includes('nested'));
  assert.ok(!text({ message_reference: { type: 0 }, message_snapshots: [{ message: snap }] }).includes('Forwarded'));
});

test('author tags: APP, verified, server tag', () => {
  const tag = { identity_guild_id: '1', identity_enabled: true, tag: 'KYZO', badge: HASH };
  const out = page({ author: { ...ana, bot: true, public_flags: 1 << 16, primary_guild: tag } });
  assert.ok(out.includes('APP') && out.includes('viewBox="0 0 16 15.2"') && out.includes(`guild-tag-badges/1/${HASH}.png`) && out.includes('KYZO'));
  assert.ok(page({ webhook_id: '9', author: ana }).includes('APP'));
  assert.ok(!page({ author: { ...ana, primary_guild: { ...tag, identity_enabled: false } } }).includes('KYZO'));
  assert.ok(!page({ author: { ...ana, primary_guild: { ...tag, badge: '../../x' } } }).includes('guild-tag-badges'));
});

test('display name and colour: resolve, nick, roles, gradients', () => {
  const roles = {
    '1': { name: 'low', color: 0x111111, position: 1, unicode_emoji: '🌟' },
    '2': { name: 'high', position: 5, colors: { primary_color: 0x222222, secondary_color: 0x333333 } },
    '3': { name: 'top', position: 9, colors: { primary_color: 0 }, icon: HASH },
  };
  const member = { nick: 'Nick', roles: ['1', '2', '3'] };
  const out = page({ author: ana, member }, { resolve: { roles } });
  assert.ok(out.includes('Nick') && out.includes('linear-gradient(to right, #222222, #333333)'), out);
  assert.ok(out.includes(`role-icons/3/${HASH}.png`));
  assert.ok(page({ author: ana, member: { roles: ['1'] } }, { resolve: { roles } }).includes('color:#111111') && text({ author: ana, member: { roles: ['1'] } }, { resolve: { roles } }).includes('🌟'));
  const holo = { '4': { name: 'h', colors: { primary_color: 11127295, secondary_color: 16759788, tertiary_color: 16761760 } } };
  assert.ok(page({ author: ana, member: { roles: ['4'] } }, { resolve: { roles: holo } }).includes('linear-gradient(to right, #a9c9ff, #ffbbec, #ffc3a0, #a9c9ff)'));
  assert.ok(text({ author: ana, member }, { resolve: { users: { [ana.id]: { name: 'Resolved', color: 0xff0000 } }, roles } }).includes('Resolved'));
});

test('avatar decoration needs a strict asset hash', () => {
  assert.ok(page({ author: { ...ana, avatar_decoration_data: { asset: `a_${HASH}` } } }).includes(`avatar-decoration-presets/a_${HASH}.png`));
  assert.ok(!page({ author: { ...ana, avatar_decoration_data: { asset: '../evil' } } }).includes('avatar-decoration-presets'));
});

test('edited, ephemeral, thinking, thread', () => {
  assert.ok(text({ content: 'hi', edited_timestamp: '2026-01-01T00:00:00Z' }).includes('hi(edited)'));
  assert.ok(!text({ content: 'hi' }).includes('(edited)'));
  assert.ok(text({ content: 'hi', flags: 64 }).includes('Only you can see this'));
  const thinking = text({ author: ana, content: 'hidden', flags: 128 });
  assert.ok(thinking.includes('Ana is thinking...') && !thinking.includes('hidden'));
  assert.ok(text({ thread: { name: 'Talk', message_count: 1 } }).includes('Talk1 Message ›'));
  assert.ok(text({ thread: { name: 'Talk', message_count: 999 } }).includes('50+ Messages ›'));
  assert.ok(text({ thread: {} }).includes('See Thread ›'));
});
