// The page protocol every fixture app follows (see preview.spec.ts). Vite-only: it globs the repo's fixtures.
import type { Path, Pressed, PreviewProps } from 'discord-preview/react';

const files = import.meta.glob<PreviewProps>('../../fixtures/**/*.json', { eager: true, import: 'default' });
// same fixed defaults as test/fixtures.ts
const DEFAULTS = { now: 1767268800000, locale: 'en-US', timeZone: 'UTC' };

export const names = Object.keys(files)
  .map((f) => f.replace('../../fixtures/', '').replace(/\.json$/, ''))
  .sort();

// `tz/<name>` is the fixture without a time zone, to be rendered in whichever zone the process runs in
export function propsFor(name: string): PreviewProps {
  const tz = name.startsWith('tz/');
  const base = files[`../../fixtures/${tz ? name.slice(3) : name}.json`];
  if (!base) throw new Error(`unknown fixture ${name}`);
  const { timeZone, ...rest } = DEFAULTS;
  return { ...rest, ...(tz ? {} : { timeZone }), ...base };
}

export const fixtureParam = () => new URLSearchParams(location.search).get('fixture');

export const replyFor = (c: Pressed) => `Reply: ${'picked' in c ? c.picked : c.custom_id}`;

export type SetProps = (partial: Partial<PreviewProps>) => void;
export type { Path };
