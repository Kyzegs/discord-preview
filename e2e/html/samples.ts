// The playground's mediaUrl: the fixtures' made-up media URLs (fake ids on Discord's CDN, example.com) become one of
// the local pictures in public/samples, picked by the kind of media and, within a kind, by the URL, so a reload shows
// the same picture. URLs that load for real (default avatars, Twemoji), audio, video and local ones are left alone.

const SAMPLES = {
  avatar: ['avatar-1', 'avatar-2', 'avatar-3'],
  emoji: ['emoji-star', 'emoji-heart'],
  sticker: ['sticker'],
  decoration: ['decoration'],
  image: ['image-wide', 'image-tall', 'image-square'],
  thumbnail: ['image-square'],
};
type Kind = keyof typeof SAMPLES;

// [what the URL looks like, its kind]; the first match wins
const KINDS: [RegExp, Kind | null][] = [
  [/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\//, null],
  [/^https:\/\/cdn\.jsdelivr\.net\//, null],
  [/\.(mp4|webm|mov|mp3|ogg|wav)(\?|$)/i, null],
  [/\/avatars\//, 'avatar'],
  [/\/(emojis|role-icons|guild-tag-badges|clan-badges)\//, 'emoji'],
  [/\/stickers\//, 'sticker'],
  [/\/avatar-decoration-presets\//, 'decoration'],
  [/thumb/i, 'thumbnail'],
  [/^https?:\/\//, 'image'],
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function sampleMedia(url: string): string {
  const kind = KINDS.find(([re]) => re.test(url))?.[1];
  if (!kind) return url;
  const list = SAMPLES[kind];
  return `/samples/${list[hash(url) % list.length]}.svg`;
}
