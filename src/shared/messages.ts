import type { ExportRequest, ExportSnapshot, FrameSummary } from "./scene";

export type UIToPluginMessage =
  | { type: "UI_READY" }
  | { type: "LOAD_SELECTION"; requestId: string }
  | ({ type: "EXPORT" } & ExportRequest)
  | { type: "EXPORT_FINISHED"; jobId: string };

export type PluginToUIMessage =
  | { type: "PLUGIN_READY"; payload: { pluginName: string; version: string } }
  | { type: "SELECTION"; requestId: string; frames: FrameSummary[]; warnings: string[] }
  | { type: "PROGRESS"; jobId: string; completed: number; total: number; stage: string }
  | { type: "SNAPSHOT"; jobId: string; snapshot: ExportSnapshot }
  | { type: "ERROR"; jobId?: string; requestId?: string; message: string };
