import { useEffect, useRef, useState } from 'react';
import { barHeightM } from '../domain/vbt/calibration';
import { demoDurationMs, demoHeightAt, demoTrace } from '../domain/vbt/demo';
import {
  CAMERA_MOVE_SHIFT,
  PLATE_STEADY_MS,
  gateReps,
  markerRadiusPx,
  overlayStatus,
  type GateSample,
} from '../domain/vbt/gate';
import {
  changeRepCount,
  correctedSummary,
  extraRepCount,
  initialCorrection,
  toggleExcluded,
  type RepCorrection,
} from '../domain/vbt/correction';
import { isSideView, type CameraView, type VbtLiftKind, type VbtSample } from '../domain/vbt/reps';
import { anchorDownloadLikelyWorks, downloadFile, saveSetThenVideo } from '../domain/vbt/shareFile';
import { followBarPoint } from '../domain/vbt/path';
import { acquirePlate, analysisSize, containRect, diagnosticsLine, type LumaFrame } from '../domain/vbt/tracker';
import { defaultVelocityLossPct, summarizeSet, velocityEstimate, type LoadVelocityPoint, type VbtSetSummary } from '../domain/vbt/velocity';
import { fileTypeForRecorderMime, mediaRecorderTimeslice, videoExtForMime, vbtVideoFilename } from '../domain/vbt/videoFile';
import { repPhrase } from '../domain/vbt/voice';

type Source = 'pick' | 'camera' | 'demo';

export function VbtTracker({
  kind,
  liftName,
  targetReps,
  loadKg,
  priorPoints,
  minVelocity,
  date,
  setNumber,
  onCancel,
  onSave,
  onVideoSkipped,
  onVideoFailed,
}: {
  kind: VbtLiftKind;
  liftName: string;
  targetReps: number;
  loadKg: number;
  priorPoints: readonly LoadVelocityPoint[];
  minVelocity: number;
  date: string;
  setNumber: number;
  onCancel: () => void;
  onSave: (summary: VbtSetSummary, view: CameraView, correction: RepCorrection) => void;
  onVideoSkipped?: () => void;
  onVideoFailed?: () => void;
}) {
  const [source, setSource] = useState<Source>('pick');
  const [denied, setDenied] = useState(false);
  const [muted, setMuted] = useState(false);
  const [view, setView] = useState<CameraView>('side');
  const [recordVideo, setRecordVideo] = useState(true);
  const [threshold, setThreshold] = useState(() => defaultVelocityLossPct(kind));
  const [summary, setSummary] = useState<VbtSetSummary | null>(null);
  const [correction, setCorrection] = useState<RepCorrection | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [hud, setHud] = useState({ reps: 0, velocity: 0, loss: 0, warn: false });
  const [platePx, setPlatePx] = useState(96);
  const [diagnosticsOn, setDiagnosticsOn] = useState(false);
  const [tapArmed, setTapArmed] = useState(false);
  const [closeHint, setCloseHint] = useState(false);
  const [diagLine, setDiagLine] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const samplesRef = useRef<GateSample[]>([]);
  const statusRef = useRef('waiting for plate');
  const [statusText, setStatusText] = useState('waiting for plate');
  const pathRef = useRef<{ x: number; y: number }[]>([]);
  const lockRef = useRef<{ cx: number; cy: number; r: number } | null>(null);
  const originRef = useRef<number | null>(null);
  const steadyRef = useRef(0);
  const lastNowRef = useRef(0);
  const everRef = useRef(false);
  const reacquireRef = useRef(false);
  const diagnosticsOnRef = useRef(false);
  const tapArmedRef = useRef(false);
  const manualRef = useRef(false);
  const tappedAtRef = useRef<number | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const diagRef = useRef('');
  const closeRef = useRef(false);
  diagnosticsOnRef.current = diagnosticsOn;
  tapArmedRef.current = tapArmed;
  const spokenRef = useRef(0);
  const mutedRef = useRef(muted);
  const thresholdRef = useRef(threshold);
  const viewRef = useRef(view);
  const recordRef = useRef(recordVideo);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureTrackRef = useRef<MediaStreamTrack | null>(null);
  const holdRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const finishingRef = useRef(false);
  mutedRef.current = muted;
  thresholdRef.current = threshold;
  viewRef.current = view;
  recordRef.current = recordVideo;

  useEffect(() => {
    if (source !== 'camera') return;
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        video.srcObject = next;
        return video.play();
      })
      .catch(() => {
        if (!cancelled) setDenied(true);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [source]);

  useEffect(() => {
    if (source === 'pick' || summary) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    samplesRef.current = [];
    pathRef.current = [];
    lockRef.current = null;
    originRef.current = null;
    steadyRef.current = 0;
    lastNowRef.current = 0;
    everRef.current = false;
    reacquireRef.current = false;
    manualRef.current = false;
    tappedAtRef.current = null;
    spokenRef.current = 0;
    const trace = source === 'demo' ? demoTrace(kind) : [];
    const rackY = trace[0]?.y_m ?? 0;
    const started = performance.now();
    let raf = 0;
    let lastHud = 0;
    let previousLuma: Uint8ClampedArray | null = null;

    const liveStatus = (ready: boolean, barMoving: boolean, now: number, cameraMoved = false) => {
      if (tapArmedRef.current && !manualRef.current) return 'Tap the plate';
      if (tappedAtRef.current != null && now - tappedAtRef.current < 1200) return 'Plate found';
      return overlayStatus({
        guidance: ready ? 'locked' : 'searching',
        steadyMs: ready ? PLATE_STEADY_MS : 0,
        cameraMoved,
        barMoving,
      });
    };
    const tick = (now: number) => {
      const width = canvas.clientWidth || 390;
      const height = canvas.clientHeight || 520;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.fillStyle = '#101218';
      ctx.fillRect(0, 0, width, height);
      const dt = lastNowRef.current ? Math.min(80, now - lastNowRef.current) : 0;
      lastNowRef.current = now;
      let point: { x: number; y: number } | null = null;
      if (source === 'demo') {
        const elapsed = now - started;
        const playing = Math.max(0, elapsed - PLATE_STEADY_MS);
        const yM =
          elapsed < PLATE_STEADY_MS ? rackY : demoHeightAt(trace, Math.min(playing, demoDurationMs(trace)));
        const marker = markerRadiusPx(Math.min(width, height) * 0.19, width, height);
        const pixelsPerMeter = (marker * 2) / 0.45;
        const x = width * 0.58;
        const y = height * 0.5 - (yM - rackY) * pixelsPerMeter;
        point = { x, y };
        drawGym(ctx, width, height);
        drawPlateBody(ctx, x, y, marker);
        drawMarker(ctx, x, y, marker);
        const barMoving = Math.abs(yM - rackY) >= 0.05;
        if (diagnosticsOnRef.current) {
          diagRef.current = diagnosticsLine({
            diameterPx: marker * 2,
            frameWidth: width,
            trackWidth: Math.round(width),
            trackHeight: Math.round(height),
            confidence: 0.95,
          });
        } else {
          diagRef.current = '';
        }
        closeRef.current = marker * 2 >= Math.min(width, height) * 0.32;
        statusRef.current = liveStatus(elapsed >= PLATE_STEADY_MS, barMoving, now);
        if (elapsed >= PLATE_STEADY_MS) {
          samplesRef.current.push({
            t_ms: playing,
            y_m: yM,
            radius_px: marker,
            confidence: 0.95,
            scene_shift: 0,
            occluded: false,
          });
        }
      } else {
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const trackW = video.videoWidth || width;
          const trackH = video.videoHeight || height;
          const fit = containRect(trackW, trackH, width, height);
          ctx.drawImage(video, fit.x, fit.y, fit.width, fit.height);
          const small = videoLuma(video, sampleCanvasRef);
          const shift = small ? sceneShift(previousLuma, small.frame.data) : 0;
          if (small) previousLuma = small.frame.data;
          const hint = lockRef.current;
          const wide = manualRef.current && tappedAtRef.current != null && now - tappedAtRef.current < 800;
          const acquired = small
            ? acquirePlate(
                small.frame,
                hint
                  ? {
                      cx: ((hint.cx - fit.x) / Math.max(1, fit.width)) * small.frame.width,
                      cy: ((hint.cy - fit.y) / Math.max(1, fit.height)) * small.frame.height,
                      r: (hint.r / Math.max(1, fit.width)) * small.frame.width,
                      windowPx: wide ? 48 : 22,
                      wide,
                    }
                  : undefined,
              )
            : { circle: null, guidance: 'searching' as const, close: false };
          const cameraMoved = shift >= CAMERA_MOVE_SHIFT;
          const fromTrack =
            acquired.circle && small
              ? {
                  cx: fit.x + (acquired.circle.cx / small.frame.width) * fit.width,
                  cy: fit.y + (acquired.circle.cy / small.frame.height) * fit.height,
                  r: markerRadiusPx((acquired.circle.r / small.frame.width) * fit.width, width, height),
                  confidence: Math.min(1, acquired.circle.score / 40),
                  close: acquired.close,
                }
              : null;
          const manualCircle =
            !fromTrack && manualRef.current && hint && !cameraMoved
              ? {
                  cx: hint.cx,
                  cy: hint.cy,
                  r: markerRadiusPx(hint.r, width, height),
                  confidence: 0.8,
                  close: hint.r * 2 >= Math.min(width, height) * 0.32,
                }
              : null;
          const held =
            !fromTrack &&
            !manualCircle &&
            hint != null &&
            !cameraMoved &&
            holdRef.current < 8 &&
            shift < CAMERA_MOVE_SHIFT;
          const circle =
            fromTrack ??
            manualCircle ??
            (held
              ? {
                  cx: hint.cx,
                  cy: hint.cy,
                  r: hint.r,
                  confidence: 0.6,
                  close: hint.r * 2 >= Math.min(width, height) * 0.32,
                }
              : null);
          if (fromTrack || manualCircle) holdRef.current = 0;
          else if (held) holdRef.current += 1;
          else holdRef.current = 0;
          const jumped =
            hint != null &&
            fromTrack != null &&
            !wide &&
            Math.hypot(fromTrack.cx - hint.cx, fromTrack.cy - hint.cy) > Math.min(width, height) * 0.28;
          const slipped = hint != null && fromTrack != null && !wide && hint.r > 0 && Math.abs(fromTrack.r - hint.r) / hint.r > 0.3;
          const good = circle != null && !cameraMoved && !jumped && !slipped;
          closeRef.current = Boolean(circle?.close);
          diagRef.current = diagnosticsOnRef.current
            ? diagnosticsLine({
                diameterPx: circle ? (circle.r * 2 * trackW) / Math.max(1, fit.width) : null,
                frameWidth: trackW,
                trackWidth: trackW,
                trackHeight: trackH,
                confidence: circle?.confidence ?? null,
              })
            : '';
          if (!good) {
            if (everRef.current) {
              samplesRef.current.push({
                t_ms: now - started,
                y_m: null,
                radius_px: slipped && circle ? circle.r : null,
                confidence: jumped || slipped ? 0.1 : 0,
                scene_shift: shift,
                occluded: jumped,
              });
              reacquireRef.current = true;
              everRef.current = false;
            }
            if (!manualRef.current || cameraMoved) {
              steadyRef.current = 0;
              lockRef.current = null;
              originRef.current = null;
              if (cameraMoved) manualRef.current = false;
            }
            statusRef.current = liveStatus(false, false, now, cameraMoved);
          } else if (circle) {
            steadyRef.current += dt;
            lockRef.current = { cx: circle.cx, cy: circle.cy, r: circle.r };
            if (originRef.current == null) originRef.current = circle.cy;
            const origin = originRef.current ?? circle.cy;
            const metres = barHeightM(circle.cy, origin, circle.r * 2) ?? 0;
            const ready = steadyRef.current >= PLATE_STEADY_MS || manualRef.current;
            if (reacquireRef.current || ready) {
              samplesRef.current.push({
                t_ms: now - started,
                y_m: metres,
                radius_px: circle.r,
                confidence: circle.confidence,
                scene_shift: shift,
                occluded: false,
              });
            }
            if (ready) {
              everRef.current = true;
              reacquireRef.current = false;
            }
            point = { x: circle.cx, y: circle.cy };
            drawMarker(ctx, circle.cx, circle.cy, circle.r);
            statusRef.current = liveStatus(ready, Math.abs(metres) >= 0.05, now);
          }
        }
      }
      if (point) {
        const previous = pathRef.current[pathRef.current.length - 1] ?? null;
        pathRef.current.push(followBarPoint(previous, point));
        if (pathRef.current.length > 600) pathRef.current.shift();
      }
      if (isSideView(viewRef.current)) drawPath(ctx, pathRef.current);
      drawBurnIn(
        ctx,
        statusRef.current,
        samplesRef.current,
        kind,
        source === 'demo' ? rackY : undefined,
        diagnosticsOnRef.current ? diagRef.current : '',
      );
      if (recordRef.current) startRecorder(canvas);
      const captured = captureTrackRef.current as (MediaStreamTrack & { requestFrame?: () => void }) | null;
      captured?.requestFrame?.();
      if (now - lastHud > 120) {
        lastHud = now;
        const reps = gateReps(samplesRef.current, kind, source === 'demo' ? rackY : undefined).reps;
        const next = summarizeSet(reps, thresholdRef.current);
        setStatusText(statusRef.current);
        setCloseHint(closeRef.current);
        setDiagLine(diagRef.current);
        const side = isSideView(viewRef.current);
        const velocity = next.last_velocity_m_s;
        const warn = side && next.stopped_for_loss;
        setHud({ reps: next.rep_count, velocity, loss: next.velocity_loss_pct, warn });
        if (next.rep_count > spokenRef.current) {
          const newest = next.rep_count;
          const justDropped = side && firstDropped(reps.map((rep) => rep.mean_velocity_m_s), thresholdRef.current, newest);
          speak(repPhrase(newest, targetReps > 0 ? targetReps : null, justDropped), mutedRef.current);
          spokenRef.current = newest;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    const startRecorder = (target: HTMLCanvasElement) => {
      if (recorderRef.current || typeof MediaRecorder === 'undefined') return;
      try {
        const stream = openRecordingStream(target, videoRef.current);
        if (!stream) return;
        const mime = preferredMime();
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        const slice = mediaRecorderTimeslice(mime);
        if (slice == null) recorder.start();
        else recorder.start(slice);
        recorderRef.current = recorder;
        captureTrackRef.current = stream.getVideoTracks()[0] ?? null;
      } catch {
        recorderRef.current = null;
        captureTrackRef.current = null;
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      const recorder = recorderRef.current;
      if (!finishingRef.current && recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
        recorderRef.current = null;
        captureTrackRef.current = null;
        chunksRef.current = [];
      }
    };
  }, [source, summary, kind, platePx, targetReps]);

  const finish = () => {
    const reps = gateReps(samplesRef.current, kind, source === 'demo' ? demoTrace(kind)[0]?.y_m : undefined).reps;
    const next = summarizeSet(reps, threshold);
    const recorder = recorderRef.current;
    finishingRef.current = true;
    const publish = (file: File | null) => {
      setVideoFile(file);
      setCorrection(initialCorrection(reps));
      setSummary(next);
    };
    if (recordVideo && recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const mime = recorder.mimeType || preferredMime() || 'video/webm';
        const type = fileTypeForRecorderMime(mime);
        const blob = new Blob(chunksRef.current, { type });
        const file = new File(
          [blob],
          vbtVideoFilename(date, liftName, loadKg, setNumber, videoExtForMime(type)),
          { type },
        );
        publish(blob.size > 0 ? file : null);
      };
      recorder.stop();
      return;
    }
    publish(null);
  };

  const side = isSideView(view);
  const shown = correction ? correctedSummary(correction, threshold) : summary;
  const estimate =
    shown == null || !side
      ? null
      : velocityEstimate(
          [
            ...priorPoints,
            ...(shown.best_velocity_m_s > 0 && loadKg > 0
              ? [{ load_kg: loadKg, mean_velocity_m_s: shown.best_velocity_m_s }]
              : []),
          ],
          minVelocity,
        );

  return (
    <div className="vbt-screen" role="dialog" aria-label="Camera bar speed">
      <video ref={videoRef} className="vbt-video" playsInline muted />
      {summary ? (
        <section className="vbt-result">
          <p className="kicker">Bar speed</p>
          <h1>{liftName}</h1>
          <div className="vbt-count-row">
            <button
              type="button"
              className="btn btn-ghost vbt-count-btn"
              data-testid="vbt-rep-minus"
              onClick={() => correction && setCorrection(changeRepCount(correction, -1))}
            >
              −
            </button>
            <p className="vbt-reps" data-testid="vbt-result-reps">
              {shown?.rep_count ?? summary.rep_count}
            </p>
            <button
              type="button"
              className="btn btn-ghost vbt-count-btn"
              data-testid="vbt-rep-plus"
              onClick={() => correction && setCorrection(changeRepCount(correction, 1))}
            >
              +
            </button>
          </div>
          <p className="muted">
            {side ? 'reps saved' : 'reps saved · speed needs the side view'}
            {correction ? ` · camera counted ${correction.detected.length}` : ''}
          </p>
          {side ? (
            <>
              <dl className="vbt-stats">
                <div>
                  <dt>Best</dt>
                  <dd>{(shown ?? summary).best_velocity_m_s.toFixed(2)} m/s</dd>
                </div>
                <div>
                  <dt>Last</dt>
                  <dd>{(shown ?? summary).last_velocity_m_s.toFixed(2)} m/s</dd>
                </div>
                <div>
                  <dt>Loss</dt>
                  <dd>{(shown ?? summary).velocity_loss_pct.toFixed(0)}%</dd>
                </div>
                <div>
                  <dt>Cutoff</dt>
                  <dd>{summary.threshold_pct}%</dd>
                </div>
              </dl>
              {(shown ?? summary).stopped_for_loss ? (
                <p className="vbt-warn">Speed drop. Rack it.</p>
              ) : (
                <p className="muted">Under the {summary.threshold_pct}% loss cutoff.</p>
              )}
            </>
          ) : (
            <p className="vbt-warn">Speed needs the side view. This {view} view counted reps only.</p>
          )}
          {side ? (
            <PathTrace samples={samplesRef.current.filter((sample): sample is GateSample & { y_m: number } => sample.y_m != null)} />
          ) : null}
          {side && correction && correction.detected.length > 0 ? (
            <ul className="vbt-rep-list">
              {correction.detected.map((rep) => {
                const excluded = correction.excluded.includes(rep.rep);
                return (
                  <li key={rep.rep}>
                    <button
                      type="button"
                      className={`vbt-drop${excluded ? ' excluded' : ''}`}
                      data-testid={`vbt-drop-${rep.rep}`}
                      onClick={() => setCorrection(toggleExcluded(correction, rep.rep))}
                    >
                      Rep {rep.rep} · {rep.mean_velocity_m_s.toFixed(2)} m/s mean · {rep.peak_velocity_m_s.toFixed(2)} peak ·{' '}
                      {(rep.rom_m * 100).toFixed(0)} cm · {(rep.concentric_ms / 1000).toFixed(2)} s
                      {excluded ? ' · excluded' : ''}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {side && correction && extraRepCount(correction) > 0 ? (
            <p className="muted">
              {extraRepCount(correction)} added rep{extraRepCount(correction) === 1 ? '' : 's'} with no bar speed.
            </p>
          ) : null}
          {side && correction && correction.detected.length === 0 ? (
            <p className="muted">No full rep yet. The bar has to travel far enough to count.</p>
          ) : null}
          {side && estimate?.status === 'ready' ? (
            <p className="vbt-estimate">
              Estimated 1RM {estimate.load_kg.toFixed(1)} kg from bar speed. Estimate only. Not a training max.
            </p>
          ) : null}
          {side && estimate?.status === 'need_more_loads' ? (
            <p className="muted">Need more loads for an estimated max.</p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-block"
            data-testid="vbt-save"
            onClick={() => {
              if (!correction) return;
              const summary = correctedSummary(correction, threshold);
              const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
              void saveSetThenVideo({
                saveSet: () => onSave(summary, view, correction),
                file: videoFile,
                canShare: () => typeof nav.share === 'function',
                share: (clip) => {
                  if (!nav.share) return Promise.reject(new Error('share unavailable'));
                  return nav.share({ files: [clip], title: clip.name });
                },
                download: downloadFile,
                downloadWorks: anchorDownloadLikelyWorks(
                  navigator.userAgent,
                  navigator.maxTouchPoints,
                  navigator.platform,
                ),
              }).then((result) => {
                if (result.video === 'cancelled') onVideoSkipped?.();
                if (result.video === 'failed') onVideoFailed?.();
              });
            }}
          >
            {videoFile ? 'Save set + video' : 'Save to set'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>
            Discard
          </button>
        </section>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className="vbt-canvas"
            data-testid="vbt-camera"
            onPointerDown={(event) => {
              if (source === 'pick') return;
              const bounds = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - bounds.left;
              const y = event.clientY - bounds.top;
              lockRef.current = {
                cx: x,
                cy: y,
                r: Math.max(platePx / 2, Math.min(bounds.width, bounds.height) * 0.18),
              };
              originRef.current = null;
              manualRef.current = true;
              tapArmedRef.current = false;
              tappedAtRef.current = performance.now();
              setTapArmed(false);
            }}
          />
          <div className="vbt-hud">
            <p className="kicker">{liftName} · {view} view</p>
            <p className="vbt-status" data-testid="vbt-status">{source === 'pick' ? 'waiting for plate' : tapArmed ? 'Tap the plate' : statusText}</p>
            <p className="muted" data-testid="vbt-hint">
              Side-on, level with the bar, as far back as the room allows. About 1–3 m is fine. Whole plate in view if you can.
            </p>
            {closeHint && source !== 'pick' && !tapArmed ? (
              <p className="muted" data-testid="vbt-close-hint">A bit close. Whole plate in view if you can.</p>
            ) : null}
            {diagnosticsOn && diagLine ? (
              <p className="muted" data-testid="vbt-diagnostics">{diagLine}</p>
            ) : null}
            <p className="vbt-reps" data-testid="vbt-reps">
              {hud.reps}
            </p>
            {side ? (
              <p className="vbt-speed">
                {hud.velocity.toFixed(2)} m/s
                <span> · loss {hud.loss.toFixed(0)}%</span>
              </p>
            ) : (
              <p className="vbt-warn">Speed needs the side view.</p>
            )}
            {hud.warn ? <p className="vbt-warn">Speed drop, rack it</p> : null}
            {source === 'pick' ? (
              <p className="muted">Phone on a stand or the floor, filming the plates from the side.</p>
            ) : null}
            {denied ? (
              <p className="vbt-warn">Camera permission is off. You can use the demo bar, or allow the camera and try again.</p>
            ) : null}
            {source === 'camera' ? (
              <p className="muted">Tap the plate to lock it, then lift. Use Plate + if the ring should be larger.</p>
            ) : null}
          </div>
          <div className="vbt-controls">
            {source === 'pick' || denied ? (
              <>
                <button type="button" className="btn btn-primary btn-block" data-testid="vbt-demo" onClick={() => { setDenied(false); setSource('demo'); }}>
                  Demo bar
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => { setDenied(false); setSource('camera'); }}>
                  Use camera
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-block" data-testid="vbt-done" onClick={finish}>
                Done
              </button>
            )}
            {source !== 'pick' ? (
              <button
                type="button"
                className={`btn ${tapArmed ? 'btn-primary' : 'btn-ghost'} btn-block`}
                data-testid="vbt-tap-plate"
                onClick={() => {
                  manualRef.current = false;
                  tappedAtRef.current = null;
                  tapArmedRef.current = true;
                  setTapArmed(true);
                }}
              >
                Tap the plate
              </button>
            ) : null}
            <div className="vbt-row" role="group" aria-label="Camera view">
              {(['side', 'front', 'back'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  data-testid={`vbt-view-${item}`}
                  className={`btn ${view === item ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setView(item)}
                >
                  {item === 'side' ? 'Side' : item === 'front' ? 'Front' : 'Back'}
                </button>
              ))}
            </div>
            <div className="vbt-row">
              <button type="button" className="btn btn-ghost" onClick={() => setMuted((value) => !value)}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                className={`btn ${diagnosticsOn ? 'btn-primary' : 'btn-ghost'}`}
                data-testid="vbt-diagnostics-toggle"
                onClick={() => setDiagnosticsOn((value) => !value)}
              >
                {diagnosticsOn ? 'Diagnostics on' : 'Diagnostics'}
              </button>
              <button
                type="button"
                className={`btn ${recordVideo ? 'btn-primary' : 'btn-ghost'}`}
                data-testid="vbt-record"
                onClick={() => setRecordVideo((value) => !value)}
              >
                {recordVideo ? 'Record video' : 'Video off'}
              </button>
              {side ? (
                <button type="button" className="btn btn-ghost" onClick={() => setThreshold((value) => Math.max(10, value - 5))}>
                  Loss {threshold}% −
                </button>
              ) : null}
              {side ? (
                <button type="button" className="btn btn-ghost" onClick={() => setThreshold((value) => Math.min(40, value + 5))}>
                  +
                </button>
              ) : null}
              {source === 'camera' ? (
                <button type="button" className="btn btn-ghost" onClick={() => setPlatePx((value) => Math.min(280, value + 12))}>
                  Plate +
                </button>
              ) : null}
            </div>
            <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PathTrace({ samples }: { samples: readonly VbtSample[] }) {
  if (samples.length < 2) return null;
  const width = 320;
  const height = 88;
  const minY = Math.min(...samples.map((sample) => sample.y_m));
  const maxY = Math.max(...samples.map((sample) => sample.y_m));
  const span = Math.max(0.05, maxY - minY);
  const lastT = samples[samples.length - 1]?.t_ms ?? 1;
  const points = samples
    .map((sample) => {
      const x = (sample.t_ms / Math.max(1, lastT)) * width;
      const y = height - ((sample.y_m - minY) / span) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="vbt-trace" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar path">
      <polyline points={points} fill="none" stroke="#e8a04a" strokeWidth="3" />
    </svg>
  );
}

function drawGym(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#d7d3cb';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#1c1e24';
  ctx.fillRect(width * 0.08, height * 0.12, 18, height * 0.76);
  ctx.strokeStyle = '#8a909c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(width * 0.1, height * 0.46);
  ctx.lineTo(width * 0.7, height * 0.46);
  ctx.stroke();
}

/** The iron plate itself. The tracker stroke is drawn on top, never as a fill. */
function drawPlateBody(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#3c414c';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#d7d3cb';
  ctx.fill();
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(4, radius - 1.5), 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(232, 160, 74, 0.85)';
  ctx.stroke();
}

function drawBurnIn(
  ctx: CanvasRenderingContext2D,
  status: string,
  samples: readonly GateSample[],
  kind: VbtLiftKind,
  rackY: number | undefined,
  diagnostics: string,
) {
  const count = gateReps(samples, kind, rackY).reps.length;
  const box = Math.min(ctx.canvas.width - 24, 360);
  const height = diagnostics ? 96 : 70;
  const top = Math.max(12, ctx.canvas.height - height - 16);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(12, top, box, height);
  ctx.fillStyle = '#f4f0e6';
  ctx.font = '48px sans-serif';
  ctx.fillText(String(count), 24, top + 50);
  ctx.font = '18px sans-serif';
  ctx.fillText(status, 84, top + 46);
  if (diagnostics) {
    ctx.font = '13px sans-serif';
    ctx.fillText(diagnostics, 20, top + 78);
  }
}

function sceneShift(previous: Uint8ClampedArray | null, next: Uint8ClampedArray): number {
  if (!previous || previous.length !== next.length) return 0;
  let total = 0;
  let count = 0;
  for (let index = 0; index < next.length; index += 8) {
    total += Math.abs((next[index] ?? 0) - (previous[index] ?? 0));
    count += 1;
  }
  return count === 0 ? 0 : total / count / 255;
}

function drawPath(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
  if (points.length < 2) return;
  ctx.beginPath();
  const first = points[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = '#e6c34a';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function videoLuma(
  video: HTMLVideoElement,
  canvasRef: { current: HTMLCanvasElement | null },
): { frame: LumaFrame } | null {
  const trackW = video.videoWidth;
  const trackH = video.videoHeight;
  if (trackW < 2 || trackH < 2) return null;
  const size = analysisSize(trackW, trackH);
  const canvas = canvasRef.current ?? document.createElement('canvas');
  canvasRef.current = canvas;
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, size.width, size.height);
  const pixels = ctx.getImageData(0, 0, size.width, size.height).data;
  const luma = new Uint8ClampedArray(size.width * size.height);
  for (let index = 0; index < luma.length; index += 1) {
    const pixel = index * 4;
    luma[index] = Math.round(
      0.3 * (pixels[pixel] ?? 0) + 0.59 * (pixels[pixel + 1] ?? 0) + 0.11 * (pixels[pixel + 2] ?? 0),
    );
  }
  return { frame: { width: size.width, height: size.height, data: luma } };
}

function firstDropped(means: number[], threshold: number, rep: number): boolean {
  let best = 0;
  for (let index = 0; index < means.length; index += 1) {
    const mean = means[index] ?? 0;
    if (mean > best) best = mean;
    if (index + 1 !== rep || index === 0 || !(best > 0)) continue;
    return ((best - mean) / best) * 100 >= threshold;
  }
  return false;
}

function openRecordingStream(canvas: HTMLCanvasElement, video: HTMLVideoElement | null): MediaStream | null {
  const capture = canvas.captureStream?.bind(canvas);
  if (capture) {
    try {
      return capture(0);
    } catch {
      /* The camera stream is the fallback when the canvas cannot be recorded. */
    }
  }
  const source = video?.srcObject;
  return source instanceof MediaStream ? source : null;
}

function preferredMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return options.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? '';
}

function speak(text: string, muted: boolean) {
  if (muted || typeof window === 'undefined' || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
