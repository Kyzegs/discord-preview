import { arr, bool, int, num, obj, str } from './guard.ts';
import { inline } from './markdown.tsx';
import { Emo, type Look } from './shared.tsx';
import type { PreviewPoll } from './types.ts';

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const BLURPLE = '#5865F2';

// Lucide's check (https://lucide.dev, ISC License)
const Check = ({ size }: { size: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export function PollCard({ poll: raw, look }: { poll: PreviewPoll | null | undefined; look: Look }) {
  const { P } = look;
  const poll = obj(raw) ?? {};
  const multi = bool(poll.allow_multiselect);
  const answers = arr(poll.answers, 10);

  const results = obj(poll.results);
  const counts = new Map<number, { n: number; me: boolean }>();
  for (const c of arr(results?.answer_counts, 10)) {
    const id = int(c?.id);
    if (id !== undefined) counts.set(id, { n: Math.max(0, int(c?.count) ?? 0), me: bool(c?.me_voted) });
  }
  const votes = answers.map((a, i) => counts.get(int(a?.answer_id) ?? i + 1) ?? { n: 0, me: false });
  const total = votes.reduce((s, v) => s + v.n, 0);
  const top = Math.max(0, ...votes.map((v) => v.n));
  const final = bool(results?.is_finalized);
  const voted = votes.some((v) => v.me);

  // Time left: from `expiry` against look.now, or `duration` (hours) on a poll that is still being made.
  const expiry = poll.expiry ? Date.parse(str(poll.expiry, 40)) : NaN;
  const closed = final || (!Number.isNaN(expiry) && expiry <= look.now);
  let left: string;
  if (closed) left = 'Poll closed';
  else if (!Number.isNaN(expiry)) {
    const ms = expiry - look.now;
    const h = Math.ceil(ms / 3_600_000);
    left = h >= 24 ? `${Math.round(h / 24)}d left` : ms > 3_600_000 ? `${h}h left` : `${Math.max(1, Math.ceil(ms / 60_000))}m left`;
  } else {
    const h = Math.max(1, Math.round(num(poll.duration) ?? 24));
    left = `${h % 24 ? plural(h, 'hour') : plural(h / 24, 'day')} left`;
  }

  const ctl = 'rounded px-2 py-0.5 text-xs font-medium';
  return (
    <div className="flex max-w-[440px] flex-col gap-2 rounded-lg border p-3" style={{ background: P.embed, borderColor: P.sep }}>
      <div className="font-semibold" style={{ color: P.head }}>
        {inline(str(obj(poll.question)?.text, 300), look)}
      </div>
      <div className="text-xs" style={{ color: P.muted }}>
        {multi ? 'Select one or more answers' : 'Select one answer'}
      </div>
      {answers.map((a, i) => {
        const media = obj(a?.poll_media);
        const v = votes[i]!;
        const pct = total ? Math.round((v.n * 100) / total) : 0;
        const win = final && v.n > 0 && v.n === top;
        return (
          <div
            key={i}
            className="relative flex min-h-11 items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: win || v.me ? BLURPLE : P.sep, fontWeight: win ? 600 : undefined }}
          >
            {results && <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: 'rgba(88,101,242,0.3)' }} />}
            <span className="relative flex min-w-0 flex-1 items-center gap-2">
              <Emo e={media?.emoji} />
              <span className="min-w-0 flex-1 break-words">{inline(str(media?.text, 55), look)}</span>
            </span>
            {results ? (
              <span className="relative flex shrink-0 items-center gap-1.5 text-xs" style={{ color: P.muted }}>
                {win && (
                  <span style={{ color: BLURPLE }}>
                    <Check size={14} />
                  </span>
                )}
                <span>{pct}%</span>
                <span>({v.n})</span>
              </span>
            ) : null}
            {(!results || v.me) && (
              <span
                aria-hidden
                className={`relative grid size-4 shrink-0 place-items-center border-2 ${multi ? 'rounded' : 'rounded-full'}`}
                style={{ borderColor: v.me ? BLURPLE : P.muted, background: v.me ? BLURPLE : undefined, color: '#FFFFFF' }}
              >
                {v.me && <Check size={10} />}
              </span>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-1 text-xs" style={{ color: P.muted }}>
        <span className="flex-1">
          {plural(total, 'vote')} · {left}
        </span>
        {results && !closed && (
          <>
            {!voted && (
              <span className={ctl} style={{ background: P.secondary, color: P.head }}>
                Show results
              </span>
            )}
            <span className={ctl} style={{ background: voted ? P.secondary : BLURPLE, color: voted ? P.head : '#FFFFFF' }}>
              {voted ? 'Remove vote' : 'Vote'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
