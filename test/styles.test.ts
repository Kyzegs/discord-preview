import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildCss, OUT } from '../scripts/css.ts';

test('style.css is up to date with the preview’s classes', async () => {
  assert.ok((await buildCss()) === readFileSync(OUT, 'utf8'), 'style.css is stale: run pnpm css');
});
