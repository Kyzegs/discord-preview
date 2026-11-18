import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PreviewProps } from '../src/types.ts';

// Every fixtures/<area>/<name>.json, with a fixed clock, locale and time zone so renders are the same everywhere.
const DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const DEFAULTS = { now: 1767268800000, locale: 'en-US', timeZone: 'UTC' } as const;

export const fixtures: { name: string; props: PreviewProps }[] = readdirSync(DIR, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ name: f.replaceAll('\\', '/').replace(/\.json$/, ''), props: { ...DEFAULTS, ...JSON.parse(readFileSync(join(DIR, f), 'utf8')) } }));
