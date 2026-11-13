export type VideoExt = 'mp4' | 'webm';

/** `linda-lift_YYYY-MM-DD_<lift>_<load>kg_set<N>.mp4` */
export function vbtVideoFilename(
  date: string,
  lift: string,
  loadKg: number,
  setNumber: number,
  ext: VideoExt,
): string {
  const day = date.slice(0, 10);
  const slug = lift
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'lift';
  const load = Number.isInteger(loadKg) ? String(loadKg) : String(loadKg);
  const set = Math.max(1, Math.round(setNumber));
  return `linda-lift_${day}_${slug}_${load}kg_set${set}.${ext}`;
}

export function videoExtForMime(mime: string): VideoExt {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

/**
 * iOS Photos rejects a fragmented MP4. Recording without a timeslice writes
 * one complete file when the recorder stops. WebM can still chunk.
 */
export function mediaRecorderTimeslice(mime: string): number | null {
  if (!mime || mime.includes('mp4')) return null;
  return 200;
}

/** Photos wants `video/mp4`, not a codec suffix. */
export function fileTypeForRecorderMime(mime: string): string {
  if (mime.includes('mp4')) return 'video/mp4';
  if (mime.includes('webm')) return 'video/webm';
  return mime || 'video/webm';
}
