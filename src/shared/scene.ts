export type ExportFormat = "pptx" | "pdf";
export type RasterScale = 1 | 2 | 3;
export interface FrameSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  thumbnail: Uint8Array;
}
export interface ExportIssue {
  severity: "warning" | "error";
  frameId: string;
  nodeId: string;
  nodeName: string;
  code: string;
  message: string;
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export interface Paint {
  color: string;
  opacity: number;
}
export interface ElementBase extends Bounds {
  id: string;
  name: string;
  opacity: number;
}
export interface ShapeElement extends ElementBase {
  kind: "shape";
  shape: "rect" | "ellipse" | "line" | "roundRect";
  fill?: Paint;
  stroke?: Paint & { width: number };
  radius?: number;
}
export interface TextRun {
  text: string;
  fontFace: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  opacity: number;
  underline: boolean;
  strike: boolean;
  letterSpacing: number;
}
export interface TextElement extends ElementBase {
  kind: "text";
  runs: TextRun[];
  align: "left" | "center" | "right" | "justify";
  verticalAlign: "top" | "middle" | "bottom";
  lineHeight?: number;
  paragraphSpacing: number;
}
export interface ImageElement extends ElementBase {
  kind: "image";
  png: Uint8Array;
}
export type SlideElement = ShapeElement | TextElement | ImageElement;
export interface SlideSnapshot {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: SlideElement[];
  /** PDF uses Figma's complete visual render, never this as a PPTX shortcut. */
  pdfPng?: Uint8Array;
}
export interface ExportSnapshot {
  format: ExportFormat;
  scale: RasterScale;
  slides: SlideSnapshot[];
  issues: ExportIssue[];
  rasterPixels: number;
}
export interface ExportRequest {
  jobId: string;
  frameIds: string[];
  format: ExportFormat;
  scale: RasterScale;
}
export interface ExportFile {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  slideCount: number;
}
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;
/** Conservative safety budgets, not benchmark-derived performance promises. */
export const MAX_RASTER_PIXELS = 100_000_000;
export const MAX_RASTER_EDGE = 16_384;
