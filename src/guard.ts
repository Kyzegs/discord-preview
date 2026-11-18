// The payload is user-generated and may not match its types: every read goes through one of these, so a
// wrong-typed field is ignored instead of throwing, and no unsafe URL reaches an href or src.

// `max` applies Discord's own limits where a field is read, so a huge payload costs no more than a real message.
export const str = (v: unknown, max = Infinity): string => (typeof v !== 'string' ? '' : v.length > max ? v.slice(0, max) : v);
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const int = (v: unknown): number | undefined => (Number.isInteger(v) ? (v as number) : undefined);
export const bool = (v: unknown): boolean => v === true;

// Elements come back possibly missing, so the compiler asks for `?.` on each.
export const arr = <T>(v: readonly T[] | null | undefined, max = Infinity): readonly (T | null | undefined)[] => (!Array.isArray(v) ? [] : v.length > max ? v.slice(0, max) : v);

// Discord's limits, and the most text any markdown is given.
export const TEXT = 4096;
export const LOOKUP = 100; // the most entries searched by a mention or attachment:// lookup

export function obj<T extends object>(v: T | null | undefined): T | undefined;
export function obj(v: unknown): Record<string, unknown> | undefined;
export function obj(v: unknown) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
}

// A record's own entry, never one from its prototype (`constructor`, `__proto__`).
export function own<T extends object>(rec: Record<string, T> | null | undefined, key: unknown): T | undefined {
  const r = obj(rec);
  return r && typeof key === 'string' && Object.hasOwn(r, key) ? obj(r[key]) : undefined;
}

// A Discord ID, the only thing put into a CDN path.
export const snowflake = (v: unknown): string | undefined => (typeof v === 'string' && /^\d{1,20}$/.test(v) ? v : undefined);

const parse = (v: unknown, base?: string) => {
  if (typeof v !== 'string' || !v) return undefined;
  try {
    return new URL(v, base);
  } catch {
    return undefined;
  }
};
const web = (u: URL | undefined) => u?.protocol === 'http:' || u?.protocol === 'https:';
export const URL_MAX = 2048; // the longest link or media URL taken; a data:image/ preview (localMedia only) may be longer
// written as http(s)://, so the value means the same to every parser that reads it next
const absolute = (v: unknown) => typeof v === 'string' && v.length <= URL_MAX && /^https?:\/\//i.test(v) && web(parse(v));

// Only an absolute http(s) URL: a relative one would point at the host page's own site.
export function safeHref(v: unknown): string | undefined {
  return absolute(v) ? (v as string) : undefined;
}

// Only an absolute http(s) URL, unless `local`: a builder previewing its own files also gets relative paths, blob: and
// data:image/ URLs. Off by default, since those make each viewer's browser request the host's own site (`/logout`).
export function safeSrc(v: unknown, local = false): string | undefined {
  if (absolute(v)) return v as string;
  if (!local) return undefined;
  const u = parse(v, 'https://relative.invalid');
  if (u?.href.startsWith('data:image/')) return v as string; // the image itself, so no URL limit: the field read caps it
  return (web(u) || u?.protocol === 'blob:') && (v as string).length <= URL_MAX ? (v as string) : undefined;
}
