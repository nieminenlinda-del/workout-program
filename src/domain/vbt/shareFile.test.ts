import { describe, expect, it } from 'vitest';
import { anchorDownloadLikelyWorks, saveSetThenVideo } from './shareFile';

function clip(): File {
  return new File(['frames'], 'linda-lift_2026-11-03_bench-press_40kg_set1.webm', { type: 'video/webm' });
}

describe('save set and video together', () => {
  it('writes the set before opening the share sheet', async () => {
    const order: string[] = [];
    const result = await saveSetThenVideo({
      saveSet: () => order.push('set'),
      file: clip(),
      canShare: () => true,
      share: () => {
        order.push('share');
        return Promise.resolve();
      },
      download: () => order.push('download'),
    });
    expect(order).toEqual(['set', 'share']);
    expect(result).toEqual({ setSaved: true, video: 'shared' });
  });

  it('keeps the set when the share sheet is cancelled and does not download', async () => {
    let saved = false;
    let downloaded = false;
    const cancel = new Error('The user aborted a request.');
    cancel.name = 'AbortError';
    const result = await saveSetThenVideo({
      saveSet: () => {
        saved = true;
      },
      file: clip(),
      canShare: () => true,
      share: () => Promise.reject(cancel),
      download: () => {
        downloaded = true;
      },
    });
    expect(saved).toBe(true);
    expect(downloaded).toBe(false);
    expect(result).toEqual({ setSaved: true, video: 'cancelled' });
  });

  it('keeps the set and downloads when share is unavailable or fails', async () => {
    const unavailable = await saveSetThenVideo({
      saveSet: () => undefined,
      file: clip(),
      canShare: () => false,
      share: () => Promise.reject(new Error('should not be called')),
      download: () => undefined,
    });
    expect(unavailable).toEqual({ setSaved: true, video: 'downloaded' });

    let downloaded = false;
    const failed = await saveSetThenVideo({
      saveSet: () => undefined,
      file: clip(),
      canShare: () => true,
      share: () => Promise.reject(new Error('share broke')),
      download: () => {
        downloaded = true;
      },
    });
    expect(downloaded).toBe(true);
    expect(failed).toEqual({ setSaved: true, video: 'downloaded' });
  });

  it('keeps the set when iPhone share fails and does not pretend the video was downloaded', async () => {
    let saved = false;
    let downloaded = false;
    const denied = new Error('share not allowed');
    denied.name = 'NotAllowedError';
    const result = await saveSetThenVideo({
      saveSet: () => {
        saved = true;
      },
      file: clip(),
      canShare: () => true,
      share: () => Promise.reject(denied),
      download: () => {
        downloaded = true;
      },
      downloadWorks: false,
    });
    expect(saved).toBe(true);
    expect(downloaded).toBe(false);
    expect(result).toEqual({ setSaved: true, video: 'failed' });
    expect(anchorDownloadLikelyWorks('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
    expect(anchorDownloadLikelyWorks('Mozilla/5.0 (Windows NT 10.0)')).toBe(true);
  });

  it('saves the set when there is no clip', async () => {
    let saved = false;
    const result = await saveSetThenVideo({
      saveSet: () => {
        saved = true;
      },
      file: null,
      canShare: () => true,
      share: () => Promise.reject(new Error('no clip')),
      download: () => undefined,
    });
    expect(saved).toBe(true);
    expect(result).toEqual({ setSaved: true, video: 'none' });
  });
});
