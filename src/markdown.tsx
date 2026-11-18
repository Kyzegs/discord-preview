import { type CSSProperties, Fragment, type ReactNode, useState } from 'react';
import { arr, LOOKUP, own, safeHref, snowflake, str, TEXT } from './guard.ts';
import { displayName, EMOJI, emojiUrl, hex, ICONS, IMG, LINK, type Look, mediaSrc, type Palette, timestampText, twemojiUrl } from './shared.tsx';

// A safe markdown subset: React nodes only, never HTML strings (the one exception is the host's highlighter, in CodeBlock).

// One capture group, so split() puts every token at an odd index and the plain text between them at even ones.
// No alternative can backtrack into itself (test/dos.test.ts times the whole pattern on uncapped hostile input), and
// input is capped at TEXT.
export const INLINE = new RegExp(
  `(${[
    String.raw`\\[^\sA-Za-z0-9]`,
    '``(?:[^`]|`(?=[^`]))+``',
    '`[^`]+`',
    String.raw`\*\*\*[^*]+\*\*\*`,
    String.raw`\*\*(?:[^*]|\*(?!\*))+?\*\*`,
    String.raw`\*[^*\s](?:[^*]*[^*\s])?\*(?!\*)`, // shortcut: no **bold** inside *italic*, which would make this scan past every *
    String.raw`\|\|(?:[^|]|\|(?!\|))+?\|\|`,
    '___[^_]+___',
    '__(?:[^_]|_(?!_))+?__',
    String.raw`(?<!\w)_[^_\s](?:[^_]*[^_\s])?_(?!\w)`,
    '~~[^~]+~~',
    String.raw`<@!?\d+>|<@&\d+>|<#\d+>`,
    String.raw`<\/[-_\p{L}\p{N}]{1,32}(?: [-_\p{L}\p{N}]{1,32}){0,2}:\d{1,20}>`,
    '<id:(?:customize|browse|guide|linked-roles)>',
    String.raw`<a?:\w+:\d+>`,
    String.raw`<t:-?\d+(?::[tTdDfFsSR])?>`,
    String.raw`(?<![\w@])@(?:everyone|here)(?!\w)`,
    String.raw`\[[^\[\]]+\]\(https?:\/\/[^()[\]\s]+\)`,
    String.raw`<https?:\/\/[^\s<>]+>`,
    String.raw`https?:\/\/[^\s<]+[^<.,:;"')\]\s]`, // trailing punctuation stays outside the link, as in Discord
  ].join('|')})`,
  'gu',
);

const LINK_CLASS = 'text-[#00A8FC] hover:underline';

// A masked link whose label names a site (a scheme, or a domain anywhere in it, once markdown marks are taken out) is
// shown as text: the label could name another site than the one it opens. Fixed-length pieces only, so linear.
const MARKS = /[*_~`|\\]/g;
const URLISH = /:\/\/|[\p{L}\p{N}-]\.\p{L}{2}/iu;
export const urlish = (label: string) => URLISH.test(label.replace(MARKS, ''));

// A link to a channel or to a message in one, shown as a pill when the channel is known.
const CHANNEL_LINK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/\d{1,20}\/(\d{1,20})(?:\/(\d{1,20}))?\/?$/;

const NAV: Record<string, string> = { customize: 'Channels & Roles', browse: 'Browse Channels', guide: 'Server Guide', 'linked-roles': 'Linked Roles' };

// A mentioned user's name: from resolve, else from the message's own mentions list.
function userName(id: string, look: Look) {
  const u = arr(look.m.mentions, LOOKUP).find((x) => x?.id === id);
  return displayName(u ?? { id }, u?.member, look, '');
}

const EMOJI_IMG = 'inline size-[1.375em] object-contain align-[-0.3em]';

// Plain text, with each unicode emoji as a Twemoji image when asked for (as text again when the host's hook drops it).
function plain(text: string, key: string, look: Look): ReactNode {
  if (!look.twemoji) return text;
  const pieces = text.split(EMOJI).map((s, j) => {
    const src = j % 2 ? mediaSrc(twemojiUrl(s), look) : undefined;
    return src ? <img key={j} {...IMG} src={src} alt={s} className={EMOJI_IMG} /> : s || null;
  });
  return <Fragment key={key}>{pieces}</Fragment>;
}

// Discord's jumbo emoji: content that is only emoji (custom or unicode, 1 to 30) and whitespace.
const EMOJI_TOKEN = /<a?:\w+:\d+>|\p{RGI_Emoji}/gv;
export function jumbo(text: string): boolean {
  let n = 0;
  return !text.replace(EMOJI_TOKEN, () => (n++, '')).trim() && n > 0 && n <= 30;
}

// An inline ||spoiler||: hidden (not visible, selectable or clickable inside) until clicked or pressed, then shown for good.
function InlineSpoiler({ P, children }: { P: Palette; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (shown)
    return (
      <span className="rounded-[3px]" style={{ background: 'rgba(128,128,128,0.2)' }}>
        {children}
      </span>
    );
  const show = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    setShown(true);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Spoiler"
      className="cursor-pointer rounded-[3px]"
      style={{ background: P.spoiler }}
      onClick={show}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        show(e);
      }}
    >
      <span className="invisible">{children}</span>
    </span>
  );
}

function code(key: number, text: string, P: Palette) {
  return (
    <code key={key} className="rounded-[3px] px-1 font-mono text-[0.85em]" style={{ background: P.code }}>
      {text}
    </code>
  );
}

// Runs of text become one string, so the server's HTML (where they are one text node anyway) and the client's DOM match.
// `links` false (text already inside a link) leaves every link token as text, since a link can't hold another.
export function inline(input: unknown, look: Look, links = true): ReactNode[] {
  const out: ReactNode[] = [];
  for (const n of tokens(input, look, links)) {
    if (typeof n === 'string' && typeof out.at(-1) === 'string') out[out.length - 1] += n;
    else if (n !== null && n !== '') out.push(n);
  }
  return out.map((n, j) => (typeof n === 'string' ? plain(n, `t${j}`, look) : n));
}

function tokens(input: unknown, look: Look, links: boolean): ReactNode[] {
  const { P, resolve } = look;
  return str(input, TEXT)
    .split(INLINE)
    .map((part, i) => {
      if (!part) return null;
      if (i % 2 === 0) return part; // plain text between tokens
      const pill = (label: ReactNode, style: CSSProperties = { background: P.mentionBg, color: P.mention }) => (
        <span key={i} className="rounded-[3px] px-0.5 font-medium" style={style}>
          {label}
        </span>
      );
      if (part[0] === '\\') return part.slice(1); // a backslash shows the mark after it as typed
      if (part.startsWith('``')) return code(i, part.slice(2, -2).replace(/^ (?= *`)|(` *) $/g, '$1'), P); // `` `x` `` shows `x`
      if (part.startsWith('`')) return code(i, part.slice(1, -1), P);
      if (part.startsWith('***'))
        return (
          <strong key={i}>
            <em>{inline(part.slice(3, -3), look, links)}</em>
          </strong>
        );
      if (part.startsWith('**')) return <strong key={i}>{inline(part.slice(2, -2), look, links)}</strong>;
      if (part.startsWith('||'))
        return (
          <InlineSpoiler key={i} P={P}>
            {inline(part.slice(2, -2), look, links)}
          </InlineSpoiler>
        );
      if (part.startsWith('___'))
        return (
          <u key={i}>
            <em>{inline(part.slice(3, -3), look, links)}</em>
          </u>
        );
      if (part.startsWith('__')) return <u key={i}>{inline(part.slice(2, -2), look, links)}</u>;
      if (part.startsWith('~~')) return <s key={i}>{inline(part.slice(2, -2), look, links)}</s>;
      if (part.startsWith('*') || part.startsWith('_')) return <em key={i}>{inline(part.slice(1, -1), look, links)}</em>;
      if (part.startsWith('@')) return pill(part);
      if (part.startsWith('<@&')) {
        const role = own(resolve.roles, part.slice(3, -1));
        const c = hex(role?.color);
        const label = `@${str(role?.name, 100) || 'unknown-role'}`;
        return c && c !== '#000000' ? pill(label, { color: c, background: `${c}1a` }) : pill(label);
      }
      if (part.startsWith('<@')) return pill(`@${userName(part.replace(/\D/g, ''), look) || 'unknown-user'}`);
      if (part.startsWith('<#')) return pill(`#${str(own(resolve.channels, part.slice(2, -1))?.name, 100) || 'unknown'}`);
      if (part.startsWith('</')) return pill(`/${part.slice(2, part.lastIndexOf(':'))}`);
      if (part.startsWith('<id:')) return pill(NAV[part.slice(4, -1)]);
      const emoji = /^<(a?):(\w+):(\d+)>$/.exec(part);
      if (emoji) {
        const id = snowflake(emoji[3]);
        const src = id && mediaSrc(emojiUrl(id, !!emoji[1]), look);
        if (!src) return id ? `:${emoji[2]}:` : part;
        return <img key={i} {...IMG} src={src} alt={`:${emoji[2]}:`} title={`:${emoji[2]}:`} className={EMOJI_IMG} />;
      }
      if (part.startsWith('<t:')) {
        const [, ts = '0', style = 'f'] = part.slice(1, -1).split(':');
        const label = timestampText(Number(ts), style, look);
        if (!label) return part; // too far out to be a date: Discord shows it as plain text too
        return (
          <span key={i} className="rounded-[3px] px-1" style={{ background: P.code }} title={timestampText(Number(ts), 'F', look)}>
            {label}
          </span>
        );
      }
      if (part.startsWith('[')) {
        const m = /^\[([^\]]+)\]\((.+)\)$/.exec(part);
        const href = safeHref(m?.[2]);
        if (!links || !href || urlish(m?.[1] ?? '')) return part;
        return (
          <a key={i} className={LINK_CLASS} href={href} title={href} {...LINK}>
            {inline(m?.[1], look, false)}
          </a>
        );
      }
      const url = part.startsWith('<') ? part.slice(1, -1) : part; // <url> is a link without its brackets
      const href = safeHref(url);
      if (!links || !href) return part;
      const ch = CHANNEL_LINK.exec(href);
      const name = ch && str(own(resolve.channels, ch[1])?.name, 100);
      if (name)
        return (
          <a key={i} className="rounded-[3px] px-0.5 font-medium" style={{ background: P.mentionBg, color: P.mention }} href={href} {...LINK}>
            {ch[2] ? `#${name} › ` : `#${name}`}
            {ch[2] && (
              <>
                <svg aria-label="message" role="img" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="inline align-[-0.15em]">
                  <path d={ICONS.forum} />
                </svg>
              </>
            )}
          </a>
        );
      return (
        <a key={i} className={`break-all ${LINK_CLASS}`} href={href} {...LINK}>
          {url}
        </a>
      );
    });
}

type Part = { code?: string; lang?: string; line?: string; quote?: boolean };
type Item = { level: number; ol: number; text: string };

// "- a", "* a" or "1. a", indented by spaces for nesting.
const LIST = /^( *)(?:[-*]|(\d{1,9})\.) (.*)$/;
const DEPTH = 10;
const BULLETS = ['list-disc', 'list-[circle]', 'list-[square]'];

// One <ul> or <ol> from items[at], with the deeper items after each one nested in its <li>; returns it and the index after it.
function list(items: Item[], at: number, level: number, look: Look): [ReactNode, number] {
  const first = items[at]!;
  const lis: ReactNode[] = [];
  let i = at;
  do {
    const it = items[i++]!;
    const kids: ReactNode[] = [];
    while (i < items.length && items[i]!.level > level) {
      const [kid, next] = list(items, i, level + 1, look);
      kids.push(kid);
      i = next;
    }
    lis.push(
      <li key={i}>
        {inline(it.text, look)}
        {kids}
      </li>,
    );
  } while (i < items.length && items[i]!.level === level && !items[i]!.ol === !first.ol);
  if (!first.ol)
    return [
      <ul key={at} className={`ml-4 ${BULLETS[Math.min(level, 2)]}`}>
        {lis}
      </ul>,
      i,
    ];
  // Discord numbers a list on from its first item, whatever the others say, and widens the gutter for long numbers.
  const digits = String(first.ol + lis.length - 1).length;
  return [
    <ol key={at} start={first.ol} className="list-decimal" style={{ marginLeft: `calc(0.4em + ${digits}ch)` }}>
      {lis}
    </ol>,
    i,
  ];
}

// A level per two or more spaces of indent more than the item it follows.
function lists(lines: string[], look: Look): ReactNode[] {
  const stack: number[] = []; // the indents of the open levels
  const items = lines.map((line): Item => {
    const [, sp = '', ol, text = ''] = LIST.exec(line) ?? [];
    while (stack.length > 1 && sp.length < stack.at(-1)!) stack.pop();
    if (!stack.length || (sp.length >= stack.at(-1)! + 2 && stack.length < DEPTH)) stack.push(sp.length);
    return { level: stack.length - 1, ol: ol ? Number(ol) : 0, text };
  });
  const out: ReactNode[] = [];
  for (let i = 0; i < items.length; ) {
    const [node, next] = list(items, i, 0, look);
    out.push(node);
    i = next;
  }
  return out;
}

// The most code handed to the host's highlighter in one call; a longer block stays plain text.
const HIGHLIGHT_MAX = 4000;

// The host's HTML for a block, or undefined for plain text: only for a block with a language and some code, for at
// most look.budget.highlights blocks per render (a block already asked about in this render, say after a spoiler
// opens, reuses its answer), and never a throw.
function highlighted(code: string, lang: string | undefined, look: Look): string | undefined {
  const { highlight, budget } = look;
  if (!lang || !highlight || !code || code.length > HIGHLIGHT_MAX) return undefined;
  const key = `${lang}\n${code}`;
  if (budget.highlighted.has(key)) return budget.highlighted.get(key);
  if (budget.highlights <= 0) return undefined;
  budget.highlights--;
  let html: unknown;
  try {
    html = highlight(code, lang);
  } catch {}
  const out = typeof html === 'string' ? html : undefined;
  budget.highlighted.set(key, out);
  return out;
}

// A fenced block. When it names a language and the host gave a highlighter, the highlighter's HTML goes inside <code>:
// the package's one raw-HTML path. The function only ever comes from the host's props (a property, never JSON), so its
// output is trusted as written; it must escape the code it is given.
function CodeBlock({ code, lang, look }: { code: string; lang?: string; look: Look }) {
  const { P } = look;
  const html = highlighted(code, lang, look);
  return (
    <pre className="my-1 overflow-x-auto rounded-[4px] border p-2 font-mono text-[0.85em] whitespace-pre-wrap" style={{ background: P.code, borderColor: P.border }}>
      {typeof html === 'string' ? <code className="bg-transparent" dangerouslySetInnerHTML={{ __html: html }} /> : code}
    </pre>
  );
}

// `jumbo` draws the emoji at Discord's large size: only for a message's own content that passes jumbo().
export function Markdown({ text, look, jumbo = false }: { text: unknown; look: Look; jumbo?: boolean }) {
  const { P, classic } = look;
  const sizes = classic ? { '#': '16px', '##': '16px', '###': '15px', body: '14px' } : { '#': '24px', '##': '20px', '###': '17px', body: '15px' };
  // split() puts each block's language (or undefined) at 3k+1 and its code at 3k+2
  const pieces = str(text, TEXT).split(/```(?:([\w+-]*)\n)?([\s\S]*?)\n?```\n?/);
  const raw = pieces.flatMap<Part>((part = '', n) =>
    n % 3 === 1 ? [] : n % 3 === 2 ? [{ code: part, lang: pieces[n - 1] || undefined }] : part ? part.replace(/\n$/, '').split('\n').map((line) => ({ line })) : [],
  );
  const deep = raw.findIndex((p) => /^>>>(?: |$)/.test(p.line ?? '')); // ">>> " quotes everything after it
  const parts = raw.map((p, i): Part => {
    if (deep >= 0 && i >= deep) return { ...p, quote: true, line: i === deep ? p.line?.replace(/^>>> ?/, '') : p.line };
    return p.line?.startsWith('> ') ? { line: p.line.slice(2), quote: true } : p;
  });

  const single = ({ code, lang, line = '' }: Part, i: number) => {
    if (code !== undefined) return <CodeBlock key={i} code={code} lang={lang} look={look} />;
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
    return (
      <div key={i} className="min-h-[0.75em] whitespace-pre-wrap">
        {inline(line, look)}
      </div>
    );
  };

  // Consecutive quoted lines share one bar (and are not quoted again inside it); consecutive list lines make one list.
  const blocks = (ps: Part[]): ReactNode[] => {
    const out: ReactNode[] = [];
    for (let i = 0; i < ps.length; ) {
      const p = ps[i]!;
      let j = i + 1;
      if (p.quote) {
        while (j < ps.length && ps[j]!.quote) j++;
        out.push(
          <div key={i} className="flex">
            <div className="w-1 shrink-0 rounded-[4px]" style={{ background: P.quote }} />
            <blockquote className="min-w-0 flex-1 pr-2 pl-3">{blocks(ps.slice(i, j).map((q) => ({ ...q, quote: false })))}</blockquote>
          </div>,
        );
      } else if (p.line !== undefined && LIST.test(p.line)) {
        while (j < ps.length && !ps[j]!.quote && LIST.test(ps[j]!.line ?? '')) j++;
        out.push(<div key={i}>{lists(ps.slice(i, j).map((q) => q.line ?? ''), look)}</div>);
      } else out.push(single(p, i));
      i = j;
    }
    return out;
  };

  return (
    // jumbo: 48px emoji images, and unicode emoji drawn as text at about that size
    <div className={`break-words ${jumbo ? '[&_img]:size-12 [&_img]:align-bottom' : ''}`} style={jumbo ? { fontSize: '40px', lineHeight: '48px' } : { fontSize: sizes.body, lineHeight: '1.375' }}>
      {blocks(parts)}
    </div>
  );
}
