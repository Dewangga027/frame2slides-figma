import type { PluginToUIMessage, UIToPluginMessage } from "../shared/messages";
import type { ExportRequest, FrameSummary } from "../shared/scene";
import { buildExportSnapshot, validateFrame } from "./snapshot";

figma.showUI(__html__, { width: 420, height: 640, themeColors: true });

interface ActiveJob { id: string; snapshotDelivered: boolean }
let activeJob: ActiveJob | undefined;
let selectionLoading = false;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validMessage(value: unknown): value is UIToPluginMessage {
  if (!record(value)) return false;
  switch (value.type) {
    case "UI_READY": return true;
    case "LOAD_SELECTION": return identifier(value.requestId);
    case "EXPORT_FINISHED": return identifier(value.jobId);
    case "EXPORT":
      return identifier(value.jobId) && Array.isArray(value.frameIds) && value.frameIds.length > 0 && value.frameIds.every(identifier) && (value.format === "pptx" || value.format === "pdf") && (value.scale === 1 || value.scale === 2 || value.scale === 3);
    default: return false;
  }
}

function send(message: PluginToUIMessage): void {
  figma.ui.postMessage(message);
}

figma.ui.onmessage = async (input: unknown): Promise<void> => {
  if (!validMessage(input)) {
    send({ type: "ERROR", ...(record(input) && identifier(input.requestId) ? { requestId: input.requestId } : {}), ...(record(input) && identifier(input.jobId) && input.jobId !== activeJob?.id ? { jobId: input.jobId } : {}), message: "Invalid plugin message. Reload the plugin UI and retry; export requires a job ID, existing frame IDs, PPTX/PDF format, and raster scale 1, 2, or 3." });
    return;
  }
  if (input.type === "UI_READY") {
    send({ type: "PLUGIN_READY", payload: { pluginName: "Frame2Slides", version: "1.0.0" } });
    return;
  }
  if (input.type === "EXPORT_FINISHED") {
    if (activeJob?.id === input.jobId && activeJob.snapshotDelivered) activeJob = undefined;
    return;
  }
  if (activeJob || selectionLoading) {
    send({ type: "ERROR", ...(input.type === "LOAD_SELECTION" ? { requestId: input.requestId } : input.jobId !== activeJob?.id ? { jobId: input.jobId } : {}), message: "An export or selection load is already in progress. Wait for the current operation and file download to finish." });
    return;
  }
  if (input.type === "LOAD_SELECTION") {
    selectionLoading = true;
    try {
      const selection = [...figma.currentPage.selection];
      const frames: FrameSummary[] = [];
      const warnings: string[] = [];
      const ids = new Set<string>();
      const selectedFrames: FrameNode[] = [];
      for (const node of selection) {
        if (node.type !== "FRAME") { warnings.push(`Skipped “${node.name}” (${node.type}): only FRAME nodes can become slides.`); continue; }
        if (ids.has(node.id)) continue;
        ids.add(node.id);
        selectedFrames.push(validateFrame(node, node.id));
      }
      if (selectedFrames.length === 0) throw new Error(selection.length === 0 ? "No frames are selected. Select one or more FRAME nodes on the canvas, then load the selection." : "The selection contains no FRAME nodes. Select frames rather than groups, sections, components, or individual layers.");
      for (const selected of selectedFrames) {
        // Resolve through the async API so frames on dynamically loaded pages
        // are checked exactly like export IDs, never with deprecated sync reads.
        const frame = validateFrame(await figma.getNodeByIdAsync(selected.id), selected.id);
        const summary = { id: frame.id, name: frame.name, width: frame.width, height: frame.height };
        const visual = frame.absoluteRenderBounds;
        const longestEdge = Math.max(frame.width, frame.height, visual?.width ?? 0, visual?.height ?? 0);
        const scale = Math.min(1, 320 / longestEdge);
        let thumbnail: Uint8Array;
        try {
          thumbnail = await frame.exportAsync({ format: "PNG", contentsOnly: true, useAbsoluteBounds: true, constraint: { type: "SCALE", value: scale }, colorProfile: "SRGB" });
        } catch (error: unknown) {
          throw new Error(`Could not create the thumbnail for “${frame.name}” (${frame.id}): ${error instanceof Error ? error.message : String(error)}. Simplify the frame or select it again.`);
        }
        frames.push({ ...summary, thumbnail: new Uint8Array(thumbnail) });
      }
      send({ type: "SELECTION", requestId: input.requestId, frames, warnings });
    } catch (error: unknown) {
      send({ type: "ERROR", requestId: input.requestId, message: error instanceof Error ? error.message : String(error) });
    } finally { selectionLoading = false; }
    return;
  }
  // Acquire synchronously, before resolving even the first frame. The UI writer
  // and download remain part of this job, not merely Figma preflight/rendering.
  const job: ActiveJob = { id: input.jobId, snapshotDelivered: false };
  activeJob = job;
  const request: ExportRequest = { jobId: input.jobId, frameIds: [...new Set(input.frameIds)], format: input.format, scale: input.scale };
  try {
    const snapshot = await buildExportSnapshot(request, (completed, total, stage) => send({ type: "PROGRESS", jobId: job.id, completed, total, stage }));
    job.snapshotDelivered = true;
    send({ type: "SNAPSHOT", jobId: job.id, snapshot });
  } catch (error: unknown) {
    if (activeJob === job) activeJob = undefined;
    send({ type: "ERROR", jobId: job.id, message: error instanceof Error ? error.message : String(error) });
  }
};
