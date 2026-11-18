import type { ReactNode } from 'react';
import { arr, LOOKUP, own, safeHref, str, TEXT } from './guard.ts';
import { emojiUrl, IMG, type Look, timestampText } from './shared.tsx';

// A safe markdown subset: React nodes only, never HTML strings.

const INLINE =
  /(\\[^\sA-Za-z0-9]|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\|\|[^|]+\|\||\*[^*\s][^*]*\*|__[^_]+__|(?<!\w)_[^_\s](?:[^_]*[^_\s])?_(?!\w)|~~[^~]+~~|`[^`]+`|<@!?\d+>|<@&\d+>|<#\d+>|<a?:\w+:\d+>|<t:-?\d+(?::[tTdDfFsSR])?>|\[[^\[\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+)/g;

const LINK = { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } as const;

// Discord refuses a masked link whose label looks like a URL, since the label could name another site than it opens.
const URLISH = /:\/\/|^\s*www\.|^\s*[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/:?#]\S*)?\s*$/i;

// A mentioned user's name: from resolve, else from the message's own mentions list.
function userName(id: string, look: Look) {
  const u = arr(look.m.mentions, LOOKUP).find((x) => x?.id === id);
  return str(own(look.resolve.users, id)?.name, 100) || str(u?.global_name, 100) || str(u?.username, 100);
}

export function inline(input: unknown, look: Look): ReactNode[] {
  const { P, resolve } = look;
  return str(input, TEXT)
    .split(INLINE)
    .map((part, i) => {
      if (!part) return null;
      const pill = (label: string) => (
        <span key={i} className="rounded-[3px] px-0.5 font-medium" style={{ background: P.mentionBg, color: P.mention }}>
          {label}
        </span>
      );
      if (part[0] === '\\' && part.length === 2) return part[1]; // a backslash shows the mark after it as typed
      if (part.startsWith('***'))
        return (
          <strong key={i}>
            <em>{inline(part.slice(3, -3), look)}</em>
          </strong>
        );
      if (part.startsWith('**')) return <strong key={i}>{inline(part.slice(2, -2), look)}</strong>;
      if (part.startsWith('||'))
        return (
          <span key={i} className="rounded-[3px]" style={{ background: P.spoiler, color: P.spoiler }} title="Spoiler">
            {part.slice(2, -2)}
          </span>
        );
      if (part.startsWith('__')) return <u key={i}>{inline(part.slice(2, -2), look)}</u>;
      if (part.startsWith('~~')) return <s key={i}>{inline(part.slice(2, -2), look)}</s>;
      if (part.startsWith('`'))
        return (
          <code key={i} className="rounded-[3px] px-1 font-mono text-[0.85em]" style={{ background: P.code }}>
            {part.slice(1, -1)}
          </code>
        );
      if (part.startsWith('*') || part.startsWith('_')) return <em key={i}>{inline(part.slice(1, -1), look)}</em>;
      if (part.startsWith('<@&')) return pill(`@${str(own(resolve.roles, part.slice(3, -1))?.name, 100) || 'unknown-role'}`);
      if (part.startsWith('<@')) return pill(`@${userName(part.replace(/\D/g, ''), look) || 'unknown-user'}`);
      if (part.startsWith('<#')) return pill(`#${str(own(resolve.channels, part.slice(2, -1))?.name, 100) || 'unknown'}`);
      const emoji = /^<(a?):(\w+):(\d+)>$/.exec(part);
      if (emoji) return <img key={i} {...IMG} src={emojiUrl(emoji[3]!, !!emoji[1])} alt={`:${emoji[2]}:`} title={`:${emoji[2]}:`} className="inline size-[1.375em] object-contain align-[-0.3em]" />;
      if (part.startsWith('<t:')) {
        const [, ts = '0', style = 'f'] = part.slice(1, -1).split(':');
        const label = timestampText(Number(ts), style, look);
        if (!label) return part; // too far out to be a date: Discord shows it as plain text too
        return (
          <span key={i} className="rounded-[3px] px-1" style={{ background: P.code }}>
            {label}
          </span>
        );
      }
      if (part.startsWith('[')) {
        const m = /^\[([^\]]+)\]\((.+)\)$/.exec(part);
        const href = safeHref(m?.[2]);
        if (!href || URLISH.test(m?.[1] ?? '')) return part;
        return (
          <a key={i} className="text-[#00A8FC] hover:underline" href={href} {...LINK}>
            {m?.[1]}
          </a>
        );
      }
      if (part.startsWith('http')) {
        const href = safeHref(part);
        if (!href) return part;
        return (
          <a key={i} className="break-all text-[#00A8FC] hover:underline" href={href} {...LINK}>
            {part}
          </a>
        );
      }
      return part;
    });
}

export function Markdown({ text, look }: { text: unknown; look: Look }) {
  const { P, classic } = look;
  const sizes = classic ? { '#': '16px', '##': '16px', '###': '15px', body: '14px' } : { '#': '24px', '##': '20px', '###': '17px', body: '15px' };
  const parts = str(text, TEXT)
    .split(/```(?:[\w+-]*\n)?([\s\S]*?)\n?```\n?/)
    .flatMap<{ code?: string; line?: string }>((part, n) => (n % 2 ? [{ code: part }] : part ? part.replace(/\n$/, '').split('\n').map((line) => ({ line })) : []));
  const deep = parts.findIndex((p) => /^>>>(?: |$)/.test(p.line ?? '')); // ">>> " quotes everything after it
  let count = 0; // Discord numbers a list on from its first item, whatever the others say
  const block = ({ code, line = '' }: { code?: string; line?: string }, i: number) => {
    if (i === deep) line = line.replace(/^>>> ?/, '');
    const ol = code === undefined ? /^(\d{1,9})\. (.*)$/.exec(line) : null;
    const num = ol ? (count ||= Number(ol[1])) : (count = 0);
    if (ol) count++;
    if (code !== undefined)
      return (
        <pre key={i} className="my-1 overflow-x-auto rounded-[4px] border p-2 font-mono text-[0.85em] whitespace-pre-wrap" style={{ background: P.code, borderColor: P.border }}>
          {code}
        </pre>
      );
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h)
      return (
        <div key={i} className="font-bold" style={{ fontSize: sizes[h[1] as '#'], color: P.head, lineHeight: '1.3' }}>
          {inline(h[2] ?? '', look)}
        </div>
      );
    if (line.startsWith('-# '))
      return (
        <div key={i} className="text-xs" style={{ color: P.muted }}>
          {inline(line.slice(3), look)}
        </div>
      );
    if (line.startsWith('> '))
      return (
        <div key={i} className="border-l-4 pl-2.5" style={{ borderColor: P.quote }}>
          {inline(line.slice(2), look)}
        </div>
      );
    if (/^[-*] /.test(line)) return <div key={i}>{['•  ', ...inline(line.slice(2), look)]}</div>;
    if (ol) return <div key={i}>{[`${num}. `, ...inline(ol[2] ?? '', look)]}</div>;
    return (
      <div key={i} className="min-h-[0.75em] whitespace-pre-wrap">
        {inline(line, look)}
      </div>
    );
  };
  return (
    <div className="break-words" style={{ fontSize: sizes.body, lineHeight: '1.375' }}>
      {parts.map((p, i) =>
        deep >= 0 && i >= deep ? (
          <div key={i} className="border-l-4 pl-2.5" style={{ borderColor: P.quote }}>
            {block(p, i)}
          </div>
        ) : (
          block(p, i)
        ),
      )}
    </div>
  );
}
