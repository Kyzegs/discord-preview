import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import { isSystemMessage, welcomeIndex } from '../src/system.tsx';
import type { PreviewMessage, PreviewProps } from '../src/types.ts';
import { DEFAULTS } from './fixtures.ts';

const text = (payload: PreviewMessage, extra: Partial<PreviewProps> = {}) =>
  renderToStaticMarkup(createElement(DiscordPreview, { ...DEFAULTS, bare: true, payload, ...extra })).replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'");
const ana = { id: '1', username: 'ana', global_name: 'Ana' };
const ts = '2026-01-01T09:30:00.000Z';
const sys = (type: number, extra: Partial<PreviewMessage> = {}) => text({ type, author: ana, timestamp: ts, ...extra });
const f = (name: string, value: string) => ({ name, value });

test('which types are system messages', () => {
  for (const t of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 21, 22, 24, 25, 26, 27, 28, 29, 31, 32, 36, 37, 38, 39, 44, 46]) assert.ok(isSystemMessage({ type: t }), String(t));
  for (const t of [0, 19, 20, 23, 13, 99, -1, 1.5]) assert.ok(!isSystemMessage({ type: t }), String(t));
  assert.ok(!isSystemMessage({}) && !isSystemMessage({ type: 'x' as never }) && !isSystemMessage({ type: '__proto__' as never }));
});

test('sentences', () => {
  const mentions = [{ id: '2', username: 'bob' }];
  assert.ok(sys(1, { mentions }).includes('Ana added bob to the group.'));
  assert.ok(sys(2, { mentions }).includes('Ana removed bob from the group.'));
  assert.ok(sys(3, { call: { ended_timestamp: '2026-01-01T09:35:00Z' } }).includes('started a call that lasted 5 minutes.'));
  assert.ok(sys(3, { call: { ended_timestamp: 'x' } }).includes('Ana started a call.'));
  assert.ok(sys(4, { content: 'planning' }).includes('changed the channel name: planning'));
  assert.ok(sys(6).includes('Ana pinned a message to this channel. See all pinned messages.'));
  assert.ok(sys(8, { content: '3' }).includes('Ana just boosted the server 3 times!'));
  assert.ok(sys(10).includes('has achieved Level 2!'));
  assert.ok(sys(18, { content: 'Notes' }).includes('Ana started a thread: Notes. See all threads.'));
  assert.ok(sys(21).includes("couldn't load the first message"));
  assert.ok(sys(21, { referenced_message: { author: { username: 'bob' }, content: 'first' } }).includes('bobfirst'));
  assert.ok(sys(25, { role_subscription_data: { tier_name: 'Gold', total_months_subscribed: 6, is_renewal: true } }).includes('Ana renewed Gold and has been a subscriber of this server for 6 months!'));
  assert.ok(sys(31, { content: 'Hello' }).includes('changed the Stage topic: Hello'));
  assert.ok(sys(7).includes('Today at 9:30 AM'));
});

test('the join sentence depends only on the timestamp', () => {
  assert.equal(sys(7), sys(7));
  assert.equal(welcomeIndex(Date.parse(ts)), Date.parse(ts) % 13);
  const seen = new Set(Array.from({ length: 13 }, (_, i) => sys(7, { timestamp: new Date(Date.parse(ts) + i).toISOString() }).replace(/Today at.*/, '')));
  assert.equal(seen.size, 13);
});

test('automod and poll result cards', () => {
  const am = sys(24, { embeds: [{ type: 'auto_moderation_message', description: 'spoiler', fields: [f('rule_name', 'No spoilers'), f('keyword', 'finale')] }] });
  assert.ok(am.includes('Rule: No spoilers') && am.includes('Keyword: finale') && am.includes('spoiler'));
  const poll = sys(46, { embeds: [{ type: 'poll_result', fields: [f('poll_question_text', 'Q?'), f('victor_answer_text', 'Yes'), f('victor_answer_votes', '1'), f('total_votes', '4')] }] });
  assert.ok(poll.includes("Ana's poll Q? has closed") && poll.includes('Yes') && poll.includes('1 vote · 25%'));
});

test('malformed input does not throw', () => {
  for (const type of [3, 21, 24, 25, 44, 46]) assert.doesNotThrow(() => sys(type, { author: 5, mentions: 'x', call: 3, embeds: [null, 4, { fields: 'x' }], role_subscription_data: { total_months_subscribed: 1e300 }, referenced_message: [] } as never));
});
