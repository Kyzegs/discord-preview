import { BLUE, fit, LINK, Mosaic, Video } from './attachments.tsx';
import { arr, bool, obj, safeHref, str } from './guard.ts';
import { inline, Markdown } from './markdown.tsx';
import { dateText, hex, IMG, Img, type Look, mediaSrc, Thumb } from './shared.tsx';
import type { Path, PreviewEmbed } from './types.ts';

type Media = { url?: string; width?: number; height?: number } | undefined;

// When an embed's timestamp is: "now", a date Date.parse reads, or an epoch in seconds or ms.
function stamp(v: unknown, look: Look) {
  const s = str(v, 64);
  const ms = s === 'now' ? look.now : /^\d+$/.test(s) ? Number(s) * (s.length < 12 ? 1000 : 1) : Date.parse(s);
  return s && Number.isFinite(ms) ? dateText(ms, { dateStyle: 'short', timeStyle: 'short' }, look) : '';
}

// A large embed image, its space reserved from the payload's size when there is one.
function Big({ m, look, maxW = 400, maxH = 300 }: { m: Media; look: Look; maxW?: number; maxH?: number }) {
  const box = fit(m?.width, m?.height, maxW, maxH);
  const src = mediaSrc(m?.url, look);
  if (!box) return <Img url={m?.url} look={look} className="max-h-72" />;
  if (!src) return <div aria-hidden className="max-w-full rounded-lg" style={{ ...box, background: look.P.bg }} />;
  return <img {...IMG} src={src} alt="" className="block max-w-full rounded-lg object-cover" style={box} />;
}

// The small image at the top right, at most 80 by 80.
function SideThumb({ m, look }: { m: Media; look: Look }) {
  const box = fit(m?.width, m?.height, 80, 80);
  const src = mediaSrc(m?.url, look);
  if (!box || !src) return <Thumb url={m?.url} look={look} />;
  return <img {...IMG} src={src} alt="" className="shrink-0 self-start rounded-lg object-contain" style={box} />;
}

// A video embed's thumbnail with a play button over it, linking to the video (no player is embedded).
function Play({ m, href, look }: { m: Media; href?: string; look: Look }) {
  const button = (
    <span className="grid size-12 place-items-center rounded-full bg-black/60 text-white">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 4v16l13-8z" />
      </svg>
    </span>
  );
  return (
    <div className="relative w-fit max-w-full">
      <Big m={m} look={look} maxH={225} />
      {href ? (
        <a {...LINK} href={href} aria-label="Play" className="absolute inset-0 grid place-items-center">
          {button}
        </a>
      ) : (
        <div className="absolute inset-0 grid place-items-center">{button}</div>
      )}
    </div>
  );
}

export function Embed({ e: raw, path, look }: { e: PreviewEmbed | null | undefined; path: Path; look: Look }) {
  const { P, sel, ring } = look;
  const e = obj(raw) ?? {};
  const type = str(e.type, 32);
  if (type === 'poll_result') return null; // rendered with the poll
  const s = sel(path);

  // An image gallery: embeds in a row sharing a url show all their images in the first, and nothing themselves.
  const siblings = arr(look.m.embeds, 10);
  const at = raw ? siblings.indexOf(raw) : -1;
  const url = str(e.url, 2048);
  const same = (x: PreviewEmbed | null | undefined) => url !== '' && str(obj(x)?.url, 2048) === url;
  if (at > 0 && same(siblings[at - 1])) return null;
  const group: PreviewEmbed[] = [e];
  for (let j = at + 1; at >= 0 && j < siblings.length && same(siblings[j]); j++) group.push(obj(siblings[j])!);
  const images = group.flatMap((x) => (str(obj(x.image)?.url) ? [obj(x.image)!] : []));

  const thumb = obj(e.thumbnail);
  const video = obj(e.video);

  // Just the media, no box.
  if (type === 'image' || type === 'gifv') {
    const pic = str(thumb?.url) ? thumb : obj(e.image);
    return (
      <div {...s} style={ring(path)}>
        {type === 'gifv' && mediaSrc(video?.url, look) ? (
          <Video url={video?.url} poster={thumb?.url} width={video?.width} height={video?.height} loop look={look} />
        ) : (
          <Mosaic items={[{ url: pic?.url, width: pic?.width, height: pic?.height }]} look={look} />
        )}
      </div>
    );
  }

  const author = obj(e.author);
  const footer = obj(e.footer);
  const provider = obj(e.provider);
  const fields = arr(e.fields, 25);
  const authorIcon = mediaSrc(author?.icon_url, look);
  const footerIcon = mediaSrc(footer?.icon_url, look);
  const time = stamp(e.timestamp, look);
  const href = safeHref(url);
  const authorHref = safeHref(author?.url);
  const providerHref = safeHref(provider?.url);
  const playable = type === 'video';
  // Video and article embeds show their thumbnail large, below the text; the others keep it small at the side.
  const bigThumb = (playable || type === 'article') && str(thumb?.url) !== '';
  const title = str(e.title, 256);
  return (
    <div {...s} className={`max-w-[520px] rounded-lg border-l-4 px-4 py-3 ${s.className ?? ''}`} style={{ background: P.embed, borderLeftColor: hex(e.color) ?? P.sep, ...ring(path) }}>
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {str(provider?.name) && (
            <div className="text-xs" style={{ color: P.muted }}>
              {providerHref ? (
                <a {...LINK} href={providerHref} className="hover:underline">
                  {str(provider?.name, 256)}
                </a>
              ) : (
                str(provider?.name, 256)
              )}
            </div>
          )}
          {str(author?.name) && (
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: P.head }}>
              {authorIcon && <img {...IMG} src={authorIcon} alt="" className="size-6 rounded-full" />}
              {authorHref ? (
                <a {...LINK} href={authorHref} className="hover:underline">
                  {str(author?.name, 256)}
                </a>
              ) : (
                str(author?.name, 256)
              )}
            </div>
          )}
          {title && (
            <div className="font-bold" style={{ color: href ? BLUE : P.head }}>
              {href ? (
                <a {...LINK} href={href} className="hover:underline">
                  {inline(title, look)}
                </a>
              ) : (
                inline(title, look)
              )}
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
        {!bigThumb && str(thumb?.url) && <SideThumb m={thumb} look={look} />}
      </div>
      {images.length > 1 ? (
        <div className="mt-3">
          <Mosaic items={images} look={look} />
        </div>
      ) : (
        images[0] && (
          <div className="mt-3">
            <Big m={images[0]} look={look} />
          </div>
        )
      )}
      {bigThumb ? (
        <div className="mt-3">{playable ? <Play m={thumb} href={href} look={look} /> : <Big m={thumb} look={look} />}</div>
      ) : (
        playable &&
        mediaSrc(video?.url, look) && (
          <div className="mt-3">
            <Video url={video?.url} width={video?.width} height={video?.height} maxW={400} maxH={300} look={look} />
          </div>
        )
      )}
      {(str(footer?.text) || time) && (
        <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: P.muted }}>
          {footerIcon && <img {...IMG} src={footerIcon} alt="" className="size-5 rounded-full" />}
          {[str(footer?.text, 2048), time].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}
