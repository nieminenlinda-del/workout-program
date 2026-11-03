import { useEffect, useRef, useState } from 'react';
import { barHeightM } from '../domain/vbt/calibration';
import { demoDurationMs, demoHeightAt, demoTrace } from '../domain/vbt/demo';
import { detectReps, isSideView, type CameraView, type VbtLiftKind, type VbtSample } from '../domain/vbt/reps';
import { shareOrDownloadFile } from '../domain/vbt/shareFile';
import { findPlateCircle, type LumaFrame } from '../domain/vbt/tracker';
import { defaultVelocityLossPct, summarizeSet, velocityEstimate, type LoadVelocityPoint, type VbtSetSummary } from '../domain/vbt/velocity';
import { videoExtForMime, vbtVideoFilename } from '../domain/vbt/videoFile';
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
  onSave: (summary: VbtSetSummary, view: CameraView) => void;
}) {
  const [source, setSource] = useState<Source>('pick');
  const [denied, setDenied] = useState(false);
  const [muted, setMuted] = useState(false);
  const [view, setView] = useState<CameraView>('side');
  const [recordVideo, setRecordVideo] = useState(true);
  const [threshold, setThreshold] = useState(() => defaultVelocityLossPct(kind));
  const [summary, setSummary] = useState<VbtSetSummary | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [recordNote, setRecordNote] = useState<string | null>(null);
  const [hud, setHud] = useState({ reps: 0, velocity: 0, loss: 0, warn: false });
  const [platePx, setPlatePx] = useState(72);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const samplesRef = useRef<VbtSample[]>([]);
  const pathRef = useRef<{ x: number; y: number }[]>([]);
  const lockRef = useRef<{ cx: number; cy: number; r: number } | null>(null);
  const originRef = useRef<number | null>(null);
  const spokenRef = useRef(0);
  const mutedRef = useRef(muted);
  const thresholdRef = useRef(threshold);
  const viewRef = useRef(view);
  const recordRef = useRef(recordVideo);
  const recorderRef = useRef<MediaRecorder | null>(null);
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
    spokenRef.current = 0;
    const trace = source === 'demo' ? demoTrace(kind) : [];
    const started = performance.now();
    let raf = 0;
    let lastHud = 0;

    const tick = (now: number) => {
      const width = canvas.clientWidth || 390;
      const height = canvas.clientHeight || 520;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.fillStyle = '#101218';
      ctx.fillRect(0, 0, width, height);
      let point: { x: number; y: number } | null = null;
      if (source === 'demo') {
        const elapsed = now - started;
        const yM = demoHeightAt(trace, Math.min(elapsed, demoDurationMs(trace)));
        const radius = platePx / 2;
        const pixelsPerMeter = platePx / 0.45;
        const x = width * 0.62;
        const y = height * 0.72 - yM * pixelsPerMeter;
        point = { x, y };
        drawGym(ctx, width, height);
        drawPlate(ctx, x, y, radius);
        samplesRef.current.push({ t_ms: elapsed, y_m: yM });
      } else {
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, width, height);
          const small = downscale(ctx, width, height);
          const hint = lockRef.current;
          const found = findPlateCircle(
            small.frame,
            hint
              ? {
                  cx: hint.cx / small.scale,
                  cy: hint.cy / small.scale,
                  r: hint.r / small.scale,
                  windowPx: 18,
                }
              : undefined,
          );
          if (found) {
            const circle = {
              cx: found.cx * small.scale,
              cy: found.cy * small.scale,
              r: hint?.r ?? found.r * small.scale,
            };
            lockRef.current = circle;
            if (originRef.current == null) originRef.current = circle.cy;
            const metres = barHeightM(circle.cy, originRef.current, platePx);
            if (metres != null) samplesRef.current.push({ t_ms: now - started, y_m: metres });
            point = { x: circle.cx, y: circle.cy };
            drawPlate(ctx, circle.cx, circle.cy, circle.r);
          }
        }
      }
      if (point) {
        pathRef.current.push(point);
        if (pathRef.current.length > 240) pathRef.current.shift();
      }
      if (isSideView(viewRef.current)) drawPath(ctx, pathRef.current);
      if (recordRef.current) startRecorder(canvas);
      if (now - lastHud > 120) {
        lastHud = now;
        const reps = detectReps(samplesRef.current, { kind });
        const next = summarizeSet(reps, thresholdRef.current);
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
        const stream = target.captureStream(30);
        const mime = preferredMime();
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.start(200);
        recorderRef.current = recorder;
      } catch {
        recorderRef.current = null;
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
        chunksRef.current = [];
      }
    };
  }, [source, summary, kind, platePx, targetReps]);

  const finish = () => {
    const reps = detectReps(samplesRef.current, { kind });
    const next = summarizeSet(reps, threshold);
    const recorder = recorderRef.current;
    finishingRef.current = true;
    const publish = (file: File | null) => {
      setVideoFile(file);
      setSummary(next);
    };
    if (recordVideo && recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File(
          [blob],
          vbtVideoFilename(date, liftName, loadKg, setNumber, videoExtForMime(mime)),
          { type: mime },
        );
        publish(blob.size > 0 ? file : null);
      };
      recorder.stop();
      return;
    }
    publish(null);
  };

  const side = isSideView(view);
  const estimate =
    summary == null || !side
      ? null
      : velocityEstimate(
          [
            ...priorPoints,
            ...(summary.best_velocity_m_s > 0 && loadKg > 0
              ? [{ load_kg: loadKg, mean_velocity_m_s: summary.best_velocity_m_s }]
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
          <p className="vbt-reps" data-testid="vbt-result-reps">
            {summary.rep_count}
          </p>
          <p className="muted">{side ? 'reps counted' : 'reps counted · speed needs the side view'}</p>
          {side ? (
            <>
              <dl className="vbt-stats">
                <div>
                  <dt>Best</dt>
                  <dd>{summary.best_velocity_m_s.toFixed(2)} m/s</dd>
                </div>
                <div>
                  <dt>Last</dt>
                  <dd>{summary.last_velocity_m_s.toFixed(2)} m/s</dd>
                </div>
                <div>
                  <dt>Loss</dt>
                  <dd>{summary.velocity_loss_pct.toFixed(0)}%</dd>
                </div>
                <div>
                  <dt>Cutoff</dt>
                  <dd>{summary.threshold_pct}%</dd>
                </div>
              </dl>
              {summary.stopped_for_loss ? (
                <p className="vbt-warn">Speed drop. Rack it.</p>
              ) : (
                <p className="muted">Under the {summary.threshold_pct}% loss cutoff.</p>
              )}
            </>
          ) : (
            <p className="vbt-warn">Speed needs the side view. This {view} view counted reps only.</p>
          )}
          {side ? <PathTrace samples={samplesRef.current} /> : null}
          {side && summary.reps.length > 0 ? (
            <ul className="vbt-rep-list">
              {summary.reps.map((rep) => (
                <li key={rep.rep}>
                  Rep {rep.rep} · {rep.mean_velocity_m_s.toFixed(2)} m/s mean · {rep.peak_velocity_m_s.toFixed(2)} peak ·{' '}
                  {(rep.rom_m * 100).toFixed(0)} cm · {(rep.concentric_ms / 1000).toFixed(2)} s
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No full rep yet. The bar has to travel far enough to count.</p>
          )}
          {side && estimate?.status === 'ready' ? (
            <p className="vbt-estimate">
              Estimated 1RM {estimate.load_kg.toFixed(1)} kg from bar speed. Estimate only. Not a training max.
            </p>
          ) : null}
          {side && estimate?.status === 'need_more_loads' ? (
            <p className="muted">Need more loads for an estimated max.</p>
          ) : null}
          {recordVideo ? (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              data-testid="vbt-save-video"
              onClick={() => {
                if (!videoFile) {
                  setRecordNote('No video file for this set.');
                  return;
                }
                void shareOrDownloadFile(videoFile).then((how) => {
                  setRecordNote(how === 'shared' ? 'Shared the video.' : `Downloaded ${videoFile.name}.`);
                });
              }}
            >
              Save video
            </button>
          ) : null}
          {recordNote ? <p className="muted">{recordNote}</p> : null}
          <button type="button" className="btn btn-primary btn-block" data-testid="vbt-save" onClick={() => onSave(summary, view)}>
            Save to set
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
              if (source !== 'camera') return;
              const bounds = event.currentTarget.getBoundingClientRect();
              lockRef.current = {
                cx: event.clientX - bounds.left,
                cy: event.clientY - bounds.top,
                r: platePx / 2,
              };
              originRef.current = null;
            }}
          />
          <div className="vbt-hud">
            <p className="kicker">{liftName} · {view} view</p>
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
              <p className="muted">Tap the plate. Size the circle to the 45 cm plate, then lift.</p>
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
                <button type="button" className="btn btn-ghost" onClick={() => setPlatePx((value) => Math.min(160, value + 8))}>
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
  ctx.fillStyle = '#1a1d25';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#323744';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.62, height * 0.15);
  ctx.lineTo(width * 0.62, height * 0.88);
  ctx.stroke();
}

function drawPlate(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#c45c26';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#e8a04a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.22, 0, Math.PI * 2);
  ctx.strokeStyle = '#f4f0e6';
  ctx.stroke();
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

function downscale(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): { frame: LumaFrame; scale: number } {
  const target = 160;
  const scale = width / target;
  const smallW = target;
  const smallH = Math.max(8, Math.round(height / scale));
  const data = ctx.getImageData(0, 0, width, height).data;
  const luma = new Uint8ClampedArray(smallW * smallH);
  for (let y = 0; y < smallH; y += 1) {
    for (let x = 0; x < smallW; x += 1) {
      const sx = Math.min(width - 1, Math.round(x * scale));
      const sy = Math.min(height - 1, Math.round(y * scale));
      const index = (sy * width + sx) * 4;
      luma[y * smallW + x] = Math.round(0.3 * (data[index] ?? 0) + 0.59 * (data[index + 1] ?? 0) + 0.11 * (data[index + 2] ?? 0));
    }
  }
  return { frame: { width: smallW, height: smallH, data: luma }, scale };
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
