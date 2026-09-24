/** Seconds for a source locator; null distinguishes unknown from timestamp zero. */
export function timestampSeconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^\d+(?::[0-5]\d){0,2}$/.test(value)) return null;
  return value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);
}
export function mediaLocation(item) {
  const start = timestampSeconds(item.start);
  const end = timestampSeconds(item.end);
  return { start, end: end !== null && (start === null || end > start) ? end : null };
}
