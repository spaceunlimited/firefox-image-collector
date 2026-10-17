// Display formatting shared by sidebar and options. Pure functions.

export function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_LABELS = {
  'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/gif': 'GIF', 'image/avif': 'AVIF',
  'image/svg+xml': 'SVG', 'image/bmp': 'BMP', 'image/x-icon': 'ICO', 'image/vnd.microsoft.icon': 'ICO',
  'image/heic': 'HEIC', 'image/jxl': 'JXL', 'image/tiff': 'TIFF',
};

// Short file type for labels: "PNG", "JPG", "SVG". Empty when unknown.
export function typeLabel(mime) {
  if (!mime) return '';
  const known = TYPE_LABELS[mime.toLowerCase()];
  if (known) return known;
  const sub = mime.split('/')[1]?.split(/[+;]/)[0];
  return sub && sub.length <= 5 ? sub.toUpperCase() : '';
}

export function formatDims(w, h) {
  return w && h ? `${w} × ${h}` : '';
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' });
const STEPS = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function relativeTime(ts, now = Date.now()) {
  const diff = ts - now;
  if (Math.abs(diff) < 45_000) return 'just now';
  for (const [unit, ms] of STEPS) {
    if (Math.abs(diff) >= ms || unit === 'minute') return rtf.format(Math.round(diff / ms), unit);
  }
  return '';
}

// Compact form for narrow tiles: "now", "14m", "3h", "2d", "5w", "4mo", "1y".
export function shortRelativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  if (diff < 45_000) return 'now';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.round(diff / 3_600_000);
  if (h < 24) return `${h}h`;
  const d = Math.round(diff / 86_400_000);
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.round(d / 7)}w`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${Math.round(d / 365)}y`;
}

export function absoluteTime(ts) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// "Today", "Yesterday", weekday name within the last week, else a date.
export function dayGroupLabel(ts, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dayKey(ts) {
  return startOfDay(ts);
}

export const FAILURE_TEXT = {
  cors: 'The site blocks access to the image file.',
  http: 'The server returned an error.',
  timeout: 'Downloading the image timed out.',
  toolarge: 'The image is too large to copy.',
  decode: 'The image could not be decoded.',
  unsupported: 'The image format is not supported.',
  clipboard: 'Firefox rejected the clipboard write.',
  nobytes: 'The image data was not available.',
  notloaded: 'The image had not finished loading.',
  missing: 'The entry no longer exists.',
  unknown: 'Unknown error.',
};
