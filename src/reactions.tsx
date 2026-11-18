import type { ReactNode } from 'react';
import { arr, bool, int, obj } from './guard.ts';
import { Emo, PALETTES, type AreaProps } from './shared.tsx';

const MAX_REACTIONS = 20;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SUPER = '#ff73fa'; // Discord's default super-reaction pink, when no valid burst colour came with the payload

// 1234 -> 1.2K, as the client shortens big counts
const short = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
const MAX_COUNT = 1e9; // a count past this is a bad payload, not a real reaction
const count = (v: unknown) => Math.min(Math.max(0, int(v) ?? 0), MAX_COUNT);

// Display only: no click behaviour.
export function Reactions({ m, look }: AreaProps): ReactNode {
  const dark = look.P === PALETTES.dark;
  const pills: ReactNode[] = [];
  arr(m.reactions, MAX_REACTIONS).forEach((r, i) => {
    const d = obj(r?.count_details);
    const burst = count(d?.burst);
    const normal = d && int(d.normal) !== undefined ? count(d.normal) : Math.max(0, count(r?.count) - burst);
    const total = burst ? normal : count(r?.count);
    const pill = (key: string, n: number, on: boolean, tint?: string) => (
      <span
        key={key}
        className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border px-1.5 text-sm font-medium"
        style={{
          background: tint ? `${tint}26` : on ? 'rgba(88,101,242,0.15)' : dark ? '#2B2D31' : '#F2F3F5',
          borderColor: tint ?? (on ? '#5865F2' : 'transparent'),
          color: on ? (dark ? '#DEE0FC' : '#5865F2') : look.P.muted,
        }}
      >
        <span className="inline-flex items-center text-base leading-none">
          <Emo e={r?.emoji} look={look} />
        </span>
        <span>{short(n)}</span>
      </span>
    );
    if (!burst || normal) pills.push(pill(`n${i}`, total, bool(r?.me)));
    if (burst) {
      const tint = arr(r?.burst_colors, 8).find((c): c is string => typeof c === 'string' && HEX.test(c)) ?? SUPER;
      pills.push(pill(`b${i}`, burst, bool(r?.me_burst), tint));
    }
  });
  return pills.length ? <div className="mt-1 flex flex-wrap gap-1">{pills}</div> : null;
}
