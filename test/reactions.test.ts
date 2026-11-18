import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import type { PreviewMessage } from '../src/types.ts';
import { DEFAULTS } from './fixtures.ts';

// DEFAULTS.now is 2026-01-01T12:00:00Z
const page = (payload: PreviewMessage) => renderToStaticMarkup(createElement(DiscordPreview, { ...DEFAULTS, bare: true, payload }));
const poll = (p: object) => page({ poll: { question: { text: 'Q' }, answers: [{ answer_id: 1, poll_media: { text: 'A' } }, { answer_id: 2, poll_media: { text: 'B' } }], ...p } });
const text = (h: string) => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
const pills = (h: string) => h.match(/h-\[30px\]/g)?.length;

test('reactions: counts, highlight, cap', () => {
  const h = page({ reactions: [{ count: 3, me: true, emoji: { name: '🎉' } }, { count: -2, emoji: { name: 'x' } }, { count: 1500, emoji: { name: 'y' } }] });
  assert.ok(h.includes('border-color:#5865F2') && h.includes('>3<') && h.includes('>0<') && h.includes('>1.5K<'));
  assert.equal(pills(page({ reactions: Array.from({ length: 50 }, () => ({ count: 1, emoji: { name: 'a' } })) })), 20);
});

test('reactions: super pill colour is validated', () => {
  const r = (c: string) => page({ reactions: [{ count: 2, emoji: { name: 'a' }, count_details: { burst: 2, normal: 0 }, burst_colors: [c] }] });
  assert.equal(pills(r('#aabbcc')), 1);
  assert.ok(r('#aabbcc').includes('border-color:#aabbcc') && r('#aabbcc').includes('background:#aabbcc26'));
  const bad = r('red;background:url(//evil)');
  assert.ok(!bad.includes('evil') && bad.includes('#ff73fa'));
  assert.equal(pills(page({ reactions: [{ count: 7, emoji: { name: 'a' }, count_details: { burst: 3, normal: 4 } }] })), 2);
});

test('poll: time left', () => {
  assert.ok(text(poll({ duration: 48 })).includes('0 votes · 2 days left'));
  assert.ok(text(poll({ expiry: '2026-01-02T11:00:00Z' })).includes('23h left'));
  assert.ok(text(poll({ expiry: '2026-01-03T12:00:00Z' })).includes('2d left'));
  assert.ok(text(poll({ expiry: '2025-12-31T12:00:00Z' })).includes('Poll closed'));
  assert.doesNotThrow(() => poll({ expiry: 'garbage', duration: 'x' }));
});

test('poll: results, percentages, markers, winner', () => {
  const results = (is_finalized: boolean) => ({
    is_finalized,
    answer_counts: [
      { id: 1, count: 1 },
      { id: 2, count: 3, me_voted: true },
    ],
  });
  const open = text(poll({ expiry: '2026-01-02T12:00:00Z', results: results(false) }));
  assert.ok(open.includes('25%|(1)') && open.includes('75%|(3)') && open.includes('4 votes') && open.includes('Remove vote'));
  const fin = poll({ expiry: '2026-01-02T12:00:00Z', results: results(true) });
  assert.equal(fin.match(/<path d="M20 6 9 17l-5-5"/g)?.length, 2); // winner check plus the voted marker
  assert.ok(text(fin).includes('Poll closed') && !text(fin).includes('Remove vote'));
  const none = text(poll({ expiry: '2026-01-02T12:00:00Z', results: { answer_counts: [] } }));
  assert.ok(none.includes('0%|(0)') && none.includes('Show results') && none.includes('Vote'));
  assert.doesNotThrow(() => poll({ results: { answer_counts: [{ id: 1, count: -5 }, null, { id: 'x', count: 1e999 }] } } as never));
});

test('poll: multiselect', () => {
  assert.ok(poll({ allow_multiselect: true }).includes('Select one or more answers') && poll({ allow_multiselect: true }).includes('border-2 rounded"'));
  assert.ok(poll({}).includes('Select one answer') && poll({}).includes('rounded-full'));
});
