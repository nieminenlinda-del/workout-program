export type SaveSetVideoResult = {
  setSaved: true;
  video: 'shared' | 'downloaded' | 'cancelled' | 'none';
};

/**
 * Writes the set first, then offers the clip in the same turn.
 * A cancelled share sheet does not download and does not undo the set.
 * Any other share failure, or no share sheet, downloads the file.
 */
export function saveSetThenVideo(input: {
  saveSet: () => void;
  file: File | null;
  canShare: (file: File) => boolean;
  share: (file: File) => Promise<void>;
  download: (file: File) => void;
}): Promise<SaveSetVideoResult> {
  input.saveSet();
  const file = input.file;
  if (!file) return Promise.resolve({ setSaved: true, video: 'none' });
  let pending: Promise<void> | null = null;
  if (input.canShare(file)) {
    try {
      pending = input.share(file);
    } catch (error) {
      if (isShareCancel(error)) return Promise.resolve({ setSaved: true, video: 'cancelled' });
      input.download(file);
      return Promise.resolve({ setSaved: true, video: 'downloaded' });
    }
  } else {
    input.download(file);
    return Promise.resolve({ setSaved: true, video: 'downloaded' });
  }
  return Promise.resolve(pending).then(
    () => ({ setSaved: true, video: 'shared' as const }),
    (error: unknown) => {
      if (isShareCancel(error)) return { setSaved: true, video: 'cancelled' as const };
      input.download(file);
      return { setSaved: true, video: 'downloaded' as const };
    },
  );
}

export function isShareCancel(error: unknown): boolean {
  return typeof error === 'object' && error != null && 'name' in error && (error as { name?: string }).name === 'AbortError';
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hand a file to the phone share sheet, or download it when sharing files is unavailable. */
export async function shareOrDownloadFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const result = await saveSetThenVideo({
    saveSet: () => undefined,
    file,
    canShare: (clip) => typeof nav.share === 'function' && Boolean(nav.canShare?.({ files: [clip] })),
    share: (clip) => nav.share({ files: [clip], title: clip.name }),
    download: downloadFile,
  });
  if (result.video === 'cancelled') return 'cancelled';
  return result.video === 'downloaded' ? 'downloaded' : 'shared';
}
