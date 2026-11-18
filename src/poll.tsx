import { arr, bool, num, obj, str } from './guard.ts';
import { inline } from './markdown.tsx';
import { Emo, type Look } from './shared.tsx';
import type { PreviewPoll } from './types.ts';

export function PollCard({ poll: raw, look }: { poll: PreviewPoll | null | undefined; look: Look }) {
  const { P } = look;
  const poll = obj(raw) ?? {};
  const hours = Math.max(1, Math.round(num(poll.duration) ?? 24));
  const multi = bool(poll.allow_multiselect);
  return (
    <div className="flex max-w-[440px] flex-col gap-2 rounded-lg border p-3" style={{ background: P.embed, borderColor: P.sep }}>
      <div className="font-semibold" style={{ color: P.head }}>
        {inline(str(obj(poll.question)?.text, 300), look)}
      </div>
      <div className="text-xs" style={{ color: P.muted }}>
        {multi ? 'Select one or more answers' : 'Select one answer'}
      </div>
      {arr(poll.answers, 10).map((a, i) => {
        const media = obj(a?.poll_media);
        return (
          <div key={i} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: P.sep }}>
            <Emo e={media?.emoji} />
            <span className="min-w-0 flex-1 break-words">{inline(str(media?.text, 55), look)}</span>
            <span aria-hidden className={`size-4 shrink-0 border-2 ${multi ? 'rounded' : 'rounded-full'}`} style={{ borderColor: P.muted }} />
          </div>
        );
      })}
      <div className="text-xs" style={{ color: P.muted }}>
        0 votes · {hours % 24 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours / 24} day${hours === 24 ? '' : 's'}`} left
      </div>
    </div>
  );
}
