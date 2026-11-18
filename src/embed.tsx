import { arr, bool, obj, str } from './guard.ts';
import { inline, Markdown } from './markdown.tsx';
import { dateText, hex, IMG, Img, type Look, mediaSrc, Thumb } from './shared.tsx';
import type { Path, PreviewEmbed } from './types.ts';

// When an embed's timestamp is: "now", a date Date.parse reads, or an epoch in seconds or ms.
function stamp(v: unknown, look: Look) {
  const s = str(v, 64);
  const ms = s === 'now' ? look.now : /^\d+$/.test(s) ? Number(s) * (s.length < 12 ? 1000 : 1) : Date.parse(s);
  return s && Number.isFinite(ms) ? dateText(ms, { dateStyle: 'short', timeStyle: 'short' }, look) : '';
}

export function Embed({ e: raw, path, look }: { e: PreviewEmbed | null | undefined; path: Path; look: Look }) {
  const { P, sel, ring } = look;
  const e = obj(raw) ?? {};
  const author = obj(e.author);
  const footer = obj(e.footer);
  const fields = arr(e.fields, 25);
  const authorIcon = mediaSrc(author?.icon_url, look);
  const footerIcon = mediaSrc(footer?.icon_url, look);
  const time = stamp(e.timestamp, look);
  const s = sel(path);
  return (
    <div {...s} className={`max-w-[520px] rounded-lg border-l-4 px-4 py-3 ${s.className ?? ''}`} style={{ background: P.embed, borderLeftColor: hex(e.color) ?? P.sep, ...ring(path) }}>
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {str(author?.name, 256) && (
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: P.head }}>
              {authorIcon && <img {...IMG} src={authorIcon} alt="" className="size-6 rounded-full" />}
              {str(author?.name, 256)}
            </div>
          )}
          {str(e.title) && (
            <div className="font-bold" style={{ color: str(e.url) ? '#00A8FC' : P.head }}>
              {inline(str(e.title, 256), look)}
            </div>
          )}
          {str(e.description) && <Markdown text={str(e.description, 4096)} look={look} />}
          {fields.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-xs:grid-cols-1">
              {fields.map((f, j) => (
                <div key={j} className={bool(f?.inline) ? 'min-w-0' : 'col-span-3 max-xs:col-span-1'}>
                  <div className="text-sm font-semibold" style={{ color: P.head }}>
                    {inline(str(f?.name, 256), look)}
                  </div>
                  <Markdown text={str(f?.value, 1024)} look={look} />
                </div>
              ))}
            </div>
          )}
        </div>
        {str(obj(e.thumbnail)?.url) && <Thumb url={e.thumbnail?.url} look={look} />}
      </div>
      {str(obj(e.image)?.url) && <Img url={e.image?.url} look={look} className="mt-3 max-h-72" />}
      {(str(footer?.text) || time) && (
        <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: P.muted }}>
          {footerIcon && <img {...IMG} src={footerIcon} alt="" className="size-5 rounded-full" />}
          {[str(footer?.text, 2048), time].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}
