import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { generateExport } from "../export/generate";
import type { PluginToUIMessage, UIToPluginMessage } from "../shared/messages";
import type { ExportFormat, ExportIssue, ExportSnapshot, FrameSummary, RasterScale } from "../shared/scene";
import "./style.css";

type ListedFrame = Omit<FrameSummary, "thumbnail"> & { thumbnailUrl: string };
type Operation =
  | { kind: "selection"; id: string }
  | { kind: "export"; id: string; phase: "snapshot" | "writing"; frameIds: string[]; format: ExportFormat; scale: RasterScale; startedAt: number };
type Status = { kind: "idle" | "ready" | "loading" | "progress" | "success" | "error"; message: string };
type Report = {
  createdAt: string;
  format: ExportFormat;
  scale: RasterScale;
  frames: { id: string; name: string }[];
  issues: ExportIssue[];
  durationMs: number | null;
  fileBytes: number | null;
  slideCount: number;
  rasterPixels: number;
  peakMemoryBytes: null;
};

function send(message: UIToPluginMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isPluginMessage(value: unknown): value is PluginToUIMessage {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  switch (value.type) {
    case "PLUGIN_READY":
      return "payload" in value && value.payload !== null && typeof value.payload === "object" &&
        "pluginName" in value.payload && typeof value.payload.pluginName === "string" &&
        "version" in value.payload && typeof value.payload.version === "string";
    case "SELECTION":
      return "requestId" in value && typeof value.requestId === "string" &&
        "frames" in value && Array.isArray(value.frames) &&
        value.frames.every((frame: unknown) => frame !== null && typeof frame === "object" &&
          "id" in frame && typeof frame.id === "string" && "name" in frame && typeof frame.name === "string" &&
          "width" in frame && typeof frame.width === "number" && Number.isFinite(frame.width) &&
          "height" in frame && typeof frame.height === "number" && Number.isFinite(frame.height) &&
          "thumbnail" in frame && frame.thumbnail instanceof Uint8Array) &&
        "warnings" in value && Array.isArray(value.warnings) &&
        value.warnings.every((warning: unknown) => typeof warning === "string");
    case "PROGRESS":
      return "jobId" in value && typeof value.jobId === "string" &&
        "stage" in value && typeof value.stage === "string" &&
        "completed" in value && typeof value.completed === "number" && Number.isFinite(value.completed) &&
        "total" in value && typeof value.total === "number" && Number.isFinite(value.total);
    case "SNAPSHOT": {
      if (!("snapshot" in value) || !value.snapshot || typeof value.snapshot !== "object") return false;
      const snapshot = value.snapshot;
      return "jobId" in value && typeof value.jobId === "string" &&
        "format" in snapshot && (snapshot.format === "pptx" || snapshot.format === "pdf") &&
        "scale" in snapshot && (snapshot.scale === 1 || snapshot.scale === 2 || snapshot.scale === 3) &&
        "rasterPixels" in snapshot && typeof snapshot.rasterPixels === "number" &&
        "slides" in snapshot && Array.isArray(snapshot.slides) &&
        snapshot.slides.every((slide: unknown) => slide !== null && typeof slide === "object" &&
          "id" in slide && typeof slide.id === "string" && "name" in slide && typeof slide.name === "string" &&
          "width" in slide && typeof slide.width === "number" && "height" in slide && typeof slide.height === "number" &&
          "elements" in slide && Array.isArray(slide.elements)) &&
        "issues" in snapshot && Array.isArray(snapshot.issues) &&
        snapshot.issues.every((issue: unknown) => issue !== null && typeof issue === "object" &&
          "severity" in issue && (issue.severity === "warning" || issue.severity === "error") &&
          "frameId" in issue && typeof issue.frameId === "string" && "nodeId" in issue && typeof issue.nodeId === "string" &&
          "nodeName" in issue && typeof issue.nodeName === "string" && "code" in issue && typeof issue.code === "string" &&
          "message" in issue && typeof issue.message === "string");
    }
    case "ERROR":
      return "message" in value && typeof value.message === "string" &&
        (!("jobId" in value) || value.jobId === undefined || typeof value.jobId === "string") &&
        (!("requestId" in value) || value.requestId === undefined || typeof value.requestId === "string");
    default:
      return false;
  }
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [frames, setFrames] = useState<ListedFrame[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("pptx");
  const [scale, setScale] = useState<RasterScale>(2);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "Waiting for the Figma connection." });
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [selectionWarnings, setSelectionWarnings] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const connectedRef = useRef(false);
  const operationRef = useRef<Operation | null>(null);
  const framesRef = useRef<ListedFrame[]>([]);
  const thumbnailUrls = useRef<string[]>([]);
  const downloadUrls = useRef(new Map<string, number>());
  const draggedId = useRef<string | null>(null);
  const mounted = useRef(false);
  const sequence = useRef(0);

  function nextId(prefix: string) {
    sequence.current += 1;
    return `${prefix}-${Date.now()}-${sequence.current}`;
  }

  function replaceFrames(next: ListedFrame[]) {
    framesRef.current = next;
    setFrames(next);
  }

  function download(bytes: Uint8Array, filename: string, mimeType: string) {
    const blob = new Blob([new Uint8Array(bytes).buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Browsers need time to consume a download URL after the click.
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 60_000);
      downloadUrls.current.set(url, timer);
    }
  }

  function finishExport(jobId: string) {
    try {
      send({ type: "EXPORT_FINISHED", jobId });
    } finally {
      if (operationRef.current?.id === jobId) {
        operationRef.current = null;
        if (mounted.current) {
          setBusy(false);
          setProgress(null);
        }
      }
    }
  }

  async function writeSnapshot(job: Extract<Operation, { kind: "export" }>, snapshot: ExportSnapshot) {
    job.phase = "writing";
    setProgress(null);
    setReport({
      createdAt: new Date().toISOString(),
      format: snapshot.format,
      scale: snapshot.scale,
      frames: snapshot.slides.map(({ id, name }) => ({ id, name })),
      issues: snapshot.issues,
      durationMs: null,
      fileBytes: null,
      slideCount: snapshot.slides.length,
      rasterPixels: snapshot.rasterPixels,
      peakMemoryBytes: null,
    });
    setStatus({ kind: "progress", message: `Building ${job.format.toUpperCase()} locally…` });
    try {
      if (snapshot.issues.some((issue) => issue.severity === "error")) {
        throw new Error("Preflight found blocking issues. Review the report below; no file was downloaded.");
      }
      if (snapshot.format !== job.format || snapshot.scale !== job.scale ||
          snapshot.slides.length !== job.frameIds.length ||
          snapshot.slides.some((slide, index) => slide.id !== job.frameIds[index])) {
        throw new Error("The snapshot does not match the requested frames, order, or settings. Reload the selection and try again.");
      }
      const file = await generateExport(snapshot);
      if (!file.bytes.byteLength || file.slideCount !== job.frameIds.length) {
        throw new Error("The generator did not return a complete file. No download was started.");
      }
      if (!mounted.current) return;
      download(file.bytes, file.filename, file.mimeType);
      const durationMs = performance.now() - job.startedAt;
      setReport((current) => current ? { ...current, durationMs, fileBytes: file.bytes.byteLength, slideCount: file.slideCount } : null);
      setStatus({
        kind: "success",
        message: `${file.filename} is ready (${file.slideCount} ${job.format === "pdf" ? "pages" : "slides"}). Download requested; check your downloads.`,
      });
    } catch (error) {
      if (mounted.current) {
        const durationMs = performance.now() - job.startedAt;
        setReport((current) => current ? { ...current, durationMs } : null);
        setStatus({ kind: "error", message: `${job.format.toUpperCase()} export failed: ${errorMessage(error)}` });
      }
    } finally {
      finishExport(job.id);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object" || !("pluginMessage" in event.data)) return;
      const message = event.data.pluginMessage;
      if (!isPluginMessage(message)) return;
      if (message.type === "PLUGIN_READY") {
        if (!connectedRef.current) {
          connectedRef.current = true;
          setConnected(true);
          setStatus({ kind: "ready", message: "Connected. Select frames in Figma, then load your selection." });
        }
        return;
      }
      const operation = operationRef.current;
      if (message.type === "SELECTION") {
        if (operation?.kind !== "selection" || message.requestId !== operation.id) return;
        const urls: string[] = [];
        try {
          const seen = new Set<string>();
          const next = message.frames.map((frame) => {
            if (seen.has(frame.id) || frame.width <= 0 || frame.height <= 0 || !frame.thumbnail.byteLength) {
              throw new Error(`Invalid frame or thumbnail: ${frame.name} (${frame.id}).`);
            }
            seen.add(frame.id);
            const thumbnailUrl = URL.createObjectURL(new Blob([new Uint8Array(frame.thumbnail).buffer], { type: "image/png" }));
            urls.push(thumbnailUrl);
            return { id: frame.id, name: frame.name, width: frame.width, height: frame.height, thumbnailUrl };
          });
          thumbnailUrls.current.forEach((url) => URL.revokeObjectURL(url));
          thumbnailUrls.current = urls;
          replaceFrames(next);
          setLoaded(true);
          setSelectionWarnings(message.warnings);
          setStatus({
            kind: "ready",
            message: next.length ? `${next.length} ${next.length === 1 ? "frame" : "frames"} loaded. Arrange the order, then export.` : "No supported frames selected. Select frames in Figma and load the selection again.",
          });
        } catch (error) {
          urls.forEach((url) => URL.revokeObjectURL(url));
          setStatus({ kind: "error", message: `Could not load the selection: ${errorMessage(error)}` });
        } finally {
          operationRef.current = null;
          setBusy(false);
        }
        return;
      }
      if (message.type === "PROGRESS") {
        if (operation?.kind !== "export" || operation.phase !== "snapshot" || message.jobId !== operation.id) return;
        const total = Math.max(0, message.total);
        const completed = Math.min(total, Math.max(0, message.completed));
        setProgress({ completed, total });
        setStatus({ kind: "progress", message: message.stage });
        return;
      }
      if (message.type === "SNAPSHOT") {
        if (operation?.kind !== "export" || operation.phase !== "snapshot" || message.jobId !== operation.id) return;
        void writeSnapshot(operation, message.snapshot);
        return;
      }
      if (message.type === "ERROR") {
        if (operation?.kind === "selection" && message.requestId === operation.id) {
          operationRef.current = null;
          setBusy(false);
          setStatus({ kind: "error", message: `Could not load the selection: ${message.message}` });
        } else if (operation?.kind === "export" && operation.phase === "snapshot" && message.jobId === operation.id) {
          setStatus({ kind: "error", message: `${operation.format.toUpperCase()} preflight failed: ${message.message}` });
          finishExport(operation.id);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    send({ type: "UI_READY" });
    return () => {
      mounted.current = false;
      window.removeEventListener("message", handleMessage);
      thumbnailUrls.current.forEach((url) => URL.revokeObjectURL(url));
      downloadUrls.current.forEach((timer, url) => {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      });
      downloadUrls.current.clear();
    };
  }, []);

  function loadSelection() {
    if (!connectedRef.current || operationRef.current) return;
    const requestId = nextId("selection");
    operationRef.current = { kind: "selection", id: requestId };
    setBusy(true);
    setReport(null);
    setSelectionWarnings([]);
    setProgress(null);
    setStatus({ kind: "loading", message: "Loading selected frames and thumbnails from Figma…" });
    try {
      send({ type: "LOAD_SELECTION", requestId });
    } catch (error) {
      operationRef.current = null;
      setBusy(false);
      setStatus({ kind: "error", message: `Could not request the selection: ${errorMessage(error)}` });
    }
  }

  function exportFrames() {
    if (!connectedRef.current || operationRef.current || !framesRef.current.length) return;
    const jobId = nextId("export");
    const frameIds = framesRef.current.map((frame) => frame.id);
    operationRef.current = { kind: "export", id: jobId, phase: "snapshot", frameIds, format, scale, startedAt: performance.now() };
    setBusy(true);
    setReport(null);
    setProgress(null);
    setStatus({ kind: "progress", message: "Preflighting frames and collecting export assets…" });
    try {
      send({ type: "EXPORT", jobId, frameIds, format, scale });
    } catch (error) {
      setStatus({ kind: "error", message: `Could not start the export: ${errorMessage(error)}` });
      finishExport(jobId);
    }
  }

  function moveFrame(id: string, target: number) {
    if (operationRef.current) return;
    const current = framesRef.current;
    const source = current.findIndex((frame) => frame.id === id);
    if (source < 0 || target < 0 || target >= current.length || source === target) return;
    const next = [...current];
    const [frame] = next.splice(source, 1);
    next.splice(target, 0, frame);
    replaceFrames(next);
    setStatus({ kind: "ready", message: `${frame.name} moved to position ${target + 1} of ${next.length}.` });
  }

  function removeFrame(id: string) {
    if (operationRef.current) return;
    const removed = framesRef.current.find((frame) => frame.id === id);
    if (!removed) return;
    replaceFrames(framesRef.current.filter((frame) => frame.id !== id));
    URL.revokeObjectURL(removed.thumbnailUrl);
    thumbnailUrls.current = thumbnailUrls.current.filter((url) => url !== removed.thumbnailUrl);
    setStatus({ kind: "ready", message: `${removed.name} removed from the export list. The Figma frame is unchanged.` });
  }

  function dropFrame(event: DragEvent<HTMLLIElement>, target: number) {
    if (operationRef.current || !draggedId.current) return;
    event.preventDefault();
    moveFrame(draggedId.current, target);
    draggedId.current = null;
    setDraggingId(null);
  }

  function downloadReport() {
    if (!report || operationRef.current) return;
    try {
      download(new TextEncoder().encode(JSON.stringify(report, null, 2)), "Frame2Slides_report.json", "application/json");
    } catch (error) {
      setStatus({ kind: "error", message: `Could not download the report: ${errorMessage(error)}` });
    }
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>Frame2Slides</h1>
          <p>Your frames. Presentation-ready.</p>
        </div>
        <span className="version">v1.0.0</span>
      </header>

      <div className="connection-status">
        <span className={`connection-dot${connected ? " connected" : ""}`} aria-hidden="true" />
        {connected ? "Connected to Figma" : "Waiting for Figma"}
        <span className="local-note">Local-only export</span>
      </div>

      <section className="section" aria-labelledby="frames-heading">
        <div className="section-heading">
          <h2 id="frames-heading">Selected frames <span className="count">{frames.length}</span></h2>
          <button className="secondary-button compact" type="button" onClick={loadSelection} disabled={!connected || busy}>
            {loaded ? "Reload selection" : "Load selected frames"}
          </button>
        </div>
        <p className="section-help">Load explicitly from Figma. Reloading replaces this list; canvas selection changes never change your order.</p>
        {frames.length === 0 ? (
          <div className="empty-state">
            <strong>{loaded ? "No frames in your export list" : "Start with your Figma frames"}</strong>
            <p>Select frames on the canvas, then choose “{loaded ? "Reload selection" : "Load selected frames"}”. One frame becomes one slide or page.</p>
          </div>
        ) : (
          <>
            <p className="list-help" id="reorder-help">Drag to reorder, or use each frame’s up and down buttons.</p>
            <ol className="frame-list" aria-describedby="reorder-help">
              {frames.map((frame, index) => (
                <li
                  className={`frame-card${draggingId === frame.id ? " dragging" : ""}`}
                  key={frame.id}
                  draggable={!busy}
                  onDragStart={(event) => {
                    if (operationRef.current) { event.preventDefault(); return; }
                    draggedId.current = frame.id;
                    setDraggingId(frame.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", frame.id);
                  }}
                  onDragOver={(event) => {
                    if (!operationRef.current && draggedId.current) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => dropFrame(event, index)}
                  onDragEnd={() => { draggedId.current = null; setDraggingId(null); }}
                >
                  <span className="frame-number" aria-label={`Position ${index + 1}`}>{index + 1}</span>
                  <img className="frame-preview" src={frame.thumbnailUrl} alt="" draggable={false} />
                  <div className="frame-details">
                    <strong title={frame.name}>{frame.name}</strong>
                    <span>{Math.round(frame.width)} × {Math.round(frame.height)}</span>
                  </div>
                  <div className="frame-actions">
                    <button type="button" className="icon-button" aria-label={`Move ${frame.name}, position ${index + 1}, up`} title="Move up" disabled={busy || index === 0} onClick={() => moveFrame(frame.id, index - 1)}><span aria-hidden="true">↑</span></button>
                    <button type="button" className="icon-button" aria-label={`Move ${frame.name}, position ${index + 1}, down`} title="Move down" disabled={busy || index === frames.length - 1} onClick={() => moveFrame(frame.id, index + 1)}><span aria-hidden="true">↓</span></button>
                    <button type="button" className="icon-button remove-button" aria-label={`Remove ${frame.name}, position ${index + 1}, from export`} title="Remove from export" disabled={busy} onClick={() => removeFrame(frame.id)}><span aria-hidden="true">×</span></button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
        {selectionWarnings.length > 0 && (
          <aside className="selection-warnings" aria-label="Selection warnings">
            <strong>Selection notes</strong>
            <ul>{selectionWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
          </aside>
        )}
      </section>

      <section className="section settings-section" aria-labelledby="settings-heading">
        <div className="section-heading"><h2 id="settings-heading">Export settings</h2><span className="muted">16:9 · proportional fit</span></div>
        <div className="settings-grid">
          <div className="field">
            <label htmlFor="export-format">File format</label>
            <select id="export-format" value={format} disabled={busy} onChange={(event) => {
              const value = event.target.value;
              if (value === "pptx" || value === "pdf") setFormat(value);
            }}>
              <option value="pptx">PowerPoint (.pptx)</option>
              <option value="pdf">PDF (.pdf)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="raster-scale">Raster quality</label>
            <select id="raster-scale" value={scale} disabled={busy} onChange={(event) => {
              const value = Number(event.target.value);
              if (value === 1 || value === 2 || value === 3) setScale(value);
            }}>
              <option value={1}>1× · smaller</option>
              <option value={2}>2× · default</option>
              <option value={3}>3× · larger</option>
            </select>
          </div>
        </div>
        <p className="section-help">{format === "pptx" ? "Supported text and shapes stay editable. Complex layers use PNG fallbacks with a conversion report." : "PDF uses complete Figma renders for visual fidelity; page content is not selectable text."} Raster quality affects images, not slide size.</p>
      </section>

      <footer className="app-footer">
        <div className={`job-status status-${status.kind}`}>
          {status.kind === "error" ? <p role="alert">{status.message}</p> : <p role="status" aria-live="polite" aria-atomic="true">{status.message}</p>}
          {busy && progress && progress.total > 0 && <progress aria-label="Export snapshot progress" value={progress.completed} max={progress.total} />}
        </div>
        <button className="primary-button" type="button" onClick={exportFrames} disabled={!connected || frames.length === 0 || busy}>
          {busy ? (status.kind === "loading" ? "Loading selection…" : "Exporting…") : `Export ${format.toUpperCase()}${frames.length ? ` · ${frames.length} ${frames.length === 1 ? "frame" : "frames"}` : ""}`}
        </button>
        <p className="footer-note">Preflight first. Download only when the complete file is ready.</p>
      </footer>

      {report && (
        <section className="section report-section" aria-labelledby="report-heading">
          <div className="section-heading">
            <h2 id="report-heading">Conversion report <span className="count">{report.issues.length}</span></h2>
            <button type="button" className="secondary-button compact" disabled={busy} onClick={downloadReport}>Download JSON</button>
          </div>
          <p className="report-metrics">
            {report.slideCount} {report.format === "pdf" ? "pages" : "slides"} · {report.rasterPixels.toLocaleString()} raster pixels
            {report.durationMs !== null && <> · {(report.durationMs / 1000).toFixed(2)} s</>}
            {report.fileBytes !== null && <> · {report.fileBytes.toLocaleString()} bytes</>}
          </p>
          <p className="section-help">Local run measurements, not a compatibility or performance guarantee. Peak memory is not measured.</p>
          {report.issues.length === 0 && <p className="report-clear">No conversion warnings reported.</p>}
          <ul className="issue-list">
            {report.issues.map((issue, index) => (
              <li key={`${issue.frameId}-${issue.nodeId}-${issue.code}-${index}`}>
                <strong>{issue.severity === "error" ? "Error" : "Warning"}: {report.frames.find((frame) => frame.id === issue.frameId)?.name ?? issue.frameId}</strong>
                <span>{issue.nodeName} · frame {issue.frameId} / node {issue.nodeId}</span>
                <p>{issue.message}</p>
                <code>{issue.code}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
