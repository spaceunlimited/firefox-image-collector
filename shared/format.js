// Display formatting shared by sidebar and options. Pure functions.

export function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
