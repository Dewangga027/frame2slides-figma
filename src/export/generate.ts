import PptxGenJS from "pptxgenjs";
import { PDFDocument, PngEmbedder, rgb, type PDFImage } from "pdf-lib";
import {
  MAX_RASTER_PIXELS,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Bounds,
  type ExportFile,
  type ExportSnapshot,
  type Paint,
  type SlideElement,
  type SlideSnapshot,
  type TextElement,
} from "../shared/scene";
import { pngDataUri, validatePng } from "./png";

const PPTX_WIDTH = SLIDE_WIDTH / 192;
const PPTX_HEIGHT = SLIDE_HEIGHT / 192;
const PDF_WIDTH = PPTX_WIDTH * 72;
const PDF_HEIGHT = PPTX_HEIGHT * 72;
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/;

interface Fit { scale: number; x: number; y: number }

function frameFit(frame: SlideSnapshot, width: number, height: number): Fit {
  const scale = Math.min(width / frame.width, height / frame.height);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`${frameContext(frame)}: Frame dimensions cannot be represented on the output canvas.`);
  return { scale, x: (width - frame.width * scale) / 2, y: (height - frame.height * scale) / 2 };
}

function elementBounds(element: Bounds, fit: Fit) {
  return {
    x: fit.x + element.x * fit.scale,
    y: fit.y + element.y * fit.scale,
    w: element.width * fit.scale,
    h: element.height * fit.scale,
    // The adapter supplies an unrotated box about the transformed object center.
    // OOXML rotates that box clockwise about the same center, not its top-left.
    rotate: ((element.rotation % 360) + 360) % 360,
  };
}

function frameContext(frame: SlideSnapshot): string {
  return `Frame "${frame.name}" (${frame.id})`;
}

function requireNumber(value: number, label: string, context: string, minimum?: number): void {
  if (!Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    throw new Error(`${context}: ${label} must be finite${minimum === undefined ? "" : ` and at least ${minimum}`}.`);
  }
}

function requireText(value: string, label: string, context: string): void {
  if (typeof value !== "string" || INVALID_XML.test(value)) throw new Error(`${context}: ${label} contains invalid text.`);
}

// Figma layer names are metadata, not document text; remove XML-forbidden controls.
function metadataName(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");
}

function requireOpacity(value: number, context: string): void {
  requireNumber(value, "Opacity", context, 0);
  if (value > 1) throw new Error(`${context}: Opacity must be between 0 and 1.`);
}

function color(value: string): string {
  return value.replace(/^#/, "").toUpperCase();
}

function requireColor(value: string, context: string): void {
  if (typeof value !== "string" || !/^#?[0-9a-f]{6}$/i.test(value)) throw new Error(`${context}: Expected a six-digit RGB color.`);
}

function requirePaint(paint: Paint | undefined, context: string): void {
  if (!paint) return;
  requireColor(paint.color, context);
  requireOpacity(paint.opacity, context);
}

function validateElement(frame: SlideSnapshot, element: SlideElement): void {
  const context = `${frameContext(frame)}, node "${element.name}" (${element.id})`;
  requireText(element.id, "Node ID", context);
  if (typeof element.name !== "string") throw new Error(`${context}: Node name must be a string.`);
  requireNumber(element.x, "X coordinate", context);
  requireNumber(element.y, "Y coordinate", context);
  requireNumber(element.width, "Width", context, 0);
  requireNumber(element.height, "Height", context, 0);
  requireNumber(element.rotation, "Rotation", context);
  requireOpacity(element.opacity, context);
  const isLine = element.kind === "shape" && element.shape === "line";
  if ((!isLine && (!element.width || !element.height)) || (isLine && !element.width && !element.height)) {
    throw new Error(`${context}: Object bounds must have positive dimensions (a line may have one zero dimension).`);
  }
  if (element.kind === "shape") {
    if (!["rect", "ellipse", "line", "roundRect"].includes(element.shape)) throw new Error(`${context}: Unsupported native shape.`);
    requirePaint(element.fill, context);
    requirePaint(element.stroke, context);
    if (element.stroke) requireNumber(element.stroke.width, "Stroke width", context, 0);
    if (element.radius !== undefined) requireNumber(element.radius, "Corner radius", context, 0);
  } else if (element.kind === "text") {
    if (!Array.isArray(element.runs) || !element.runs.length) throw new Error(`${context}: Native text must contain at least one styled run.`);
    if (!["left", "center", "right", "justify"].includes(element.align) || !["top", "middle", "bottom"].includes(element.verticalAlign)) {
      throw new Error(`${context}: Unsupported text alignment.`);
    }
    if (element.lineHeight !== undefined) {
      requireNumber(element.lineHeight, "Line height", context, 0);
      if (!element.lineHeight) throw new Error(`${context}: Line height must be positive.`);
    }
    requireNumber(element.paragraphSpacing, "Paragraph spacing", context, 0);
    for (const run of element.runs) {
      requireText(run.text, "Text run", context);
      requireText(run.fontFace, "Font family", context);
      if (!run.fontFace.trim()) throw new Error(`${context}: Font family is missing.`);
      requireNumber(run.fontSize, "Font size", context, 0);
      if (!run.fontSize) throw new Error(`${context}: Font size must be positive.`);
      requireNumber(run.letterSpacing, "Letter spacing", context);
      requireColor(run.color, context);
      requireOpacity(run.opacity, context);
    }
  } else if (element.kind !== "image") {
    throw new Error(`${context}: Unsupported slide element.`);
  }
}

function validateSnapshot(snapshot: ExportSnapshot): void {
  if (snapshot.format !== "pptx" && snapshot.format !== "pdf") throw new Error("Unsupported export format.");
  if (!Array.isArray(snapshot.slides) || !snapshot.slides.length) throw new Error("Select at least one frame before exporting.");
  if (!Array.isArray(snapshot.issues)) throw new Error("Export snapshot is missing its conversion report.");
  const issue = snapshot.issues.find((item) => item.severity === "error");
  if (issue) throw new Error(`Frame ${issue.frameId}, node "${issue.nodeName}" (${issue.nodeId}): ${issue.message}`);
  if (![1, 2, 3].includes(snapshot.scale)) throw new Error("Raster scale must be 1×, 2× or 3×.");
  requireNumber(snapshot.rasterPixels, "Raster pixel usage", "Export", 0);
  if (snapshot.rasterPixels > MAX_RASTER_PIXELS) throw new Error(`Export exceeds the ${MAX_RASTER_PIXELS.toLocaleString("en-US")} raster pixel safety budget.`);
  for (const frame of snapshot.slides) {
    const context = frameContext(frame);
    requireText(frame.id, "Frame ID", context);
    if (typeof frame.name !== "string") throw new Error(`${context}: Frame name must be a string.`);
    requireNumber(frame.width, "Frame width", context, 0);
    requireNumber(frame.height, "Frame height", context, 0);
    if (!frame.width || !frame.height) throw new Error(`${context}: Frame dimensions must be positive.`);
    if (!Array.isArray(frame.elements)) throw new Error(`${context}: Paint-order elements are missing.`);
    for (const element of frame.elements) validateElement(frame, element);
    if (snapshot.format === "pdf" && !frame.pdfPng) throw new Error(`${context}: Complete Figma PNG render is missing for PDF export.`);
  }
}

function transparency(opacity: number): number {
  return (1 - opacity) * 100;
}

// PptxGenJS escapes text/object names itself, but interpolates font family names
// directly into XML attributes. Escape that attribute exactly once here.
function fontAttribute(fontFace: string): string {
  return fontFace.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function textRuns(element: TextElement, pointsPerPixel: number): PptxGenJS.TextProps[] {
  return element.runs.map((run) => ({
    text: run.text,
    options: {
      fontFace: fontAttribute(run.fontFace),
      fontSize: run.fontSize * pointsPerPixel,
      bold: run.bold,
      italic: run.italic,
      color: color(run.color),
      transparency: transparency(element.opacity * run.opacity),
      underline: { style: run.underline ? "sng" : "none" },
      strike: run.strike,
      charSpacing: run.letterSpacing * pointsPerPixel,
    },
  }));
}

function assetBudget() {
  const validated = new WeakSet<Uint8Array>();
  let pixels = 0;
  return (bytes: Uint8Array, context: string): boolean => {
    if (validated.has(bytes)) return false;
    const dimensions = validatePng(bytes, context);
    pixels += dimensions.width * dimensions.height;
    if (pixels > MAX_RASTER_PIXELS) throw new Error(`${context}: PNG assets exceed the total raster pixel safety budget.`);
    validated.add(bytes);
    return true;
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function generatePptx(snapshot: ExportSnapshot): Promise<Uint8Array> {
  const presentation = new PptxGenJS();
  presentation.defineLayout({ name: "FRAME2SLIDES", width: PPTX_WIDTH, height: PPTX_HEIGHT });
  presentation.layout = "FRAME2SLIDES";
  presentation.author = "Frame2Slides";
  presentation.subject = "Local Figma frame export";
  presentation.title = metadataName(snapshot.slides[0].name);
  presentation.company = "";
  const checkAsset = assetBudget();
  const imageData = new WeakMap<Uint8Array, string>();
  for (const frame of snapshot.slides) {
    const slide = presentation.addSlide();
    slide.background = { color: "FFFFFF" };
    const fit = frameFit(frame, PPTX_WIDTH, PPTX_HEIGHT);
    const pointsPerPixel = fit.scale * 72;
    // Every add call is a flat slide object in the adapter's absolute paint order.
    for (const element of frame.elements) {
      const context = `${frameContext(frame)}, node "${element.name}" (${element.id})`;
      try {
        const bounds = elementBounds(element, fit);
        requireNumber(bounds.x, "Normalized X coordinate", context);
        requireNumber(bounds.y, "Normalized Y coordinate", context);
        requireNumber(bounds.w, "Normalized width", context);
        requireNumber(bounds.h, "Normalized height", context);
        const objectName = metadataName(`${element.name} (${element.id})`);
        if (element.kind === "image") {
          if (checkAsset(element.png, context)) await PngEmbedder.for(element.png);
          let data = imageData.get(element.png);
          if (!data) {
            data = pngDataUri(element.png);
            imageData.set(element.png, data);
          }
          slide.addImage({ ...bounds, objectName, data, transparency: transparency(element.opacity), altText: metadataName(element.name) });
        } else if (element.kind === "text") {
          slide.addText(textRuns(element, pointsPerPixel), {
            ...bounds,
            objectName,
            isTextBox: true,
            margin: 0,
            fit: "none",
            wrap: true,
            align: element.align,
            valign: element.verticalAlign,
            lineSpacing: element.lineHeight === undefined ? undefined : element.lineHeight * pointsPerPixel,
            paraSpaceAfter: element.paragraphSpacing * pointsPerPixel,
            paraSpaceBefore: 0,
            breakLine: false,
          });
        } else {
          const radius = Math.min(element.radius ?? Math.min(element.width, element.height) / 6, Math.min(element.width, element.height) / 2);
          const shape = element.shape === "roundRect" && radius === 0 ? "rect" : element.shape;
          slide.addShape(presentation.ShapeType[shape], {
            ...bounds,
            objectName,
            // Despite the declaration's 0–1 wording, v4 serializes rectRadius as
            // physical inches / shortest side, so provide the actual inch radius.
            rectRadius: shape === "roundRect" ? radius * fit.scale : undefined,
            fill: element.fill && shape !== "line"
              ? { color: color(element.fill.color), transparency: transparency(element.opacity * element.fill.opacity) }
              : { type: "none" },
            line: element.stroke && element.stroke.width > 0
              ? { color: color(element.stroke.color), transparency: transparency(element.opacity * element.stroke.opacity), width: element.stroke.width * pointsPerPixel }
              : { type: "none" },
          });
        }
      } catch (error) {
        throw new Error(`${context}: PPTX object generation failed: ${errorMessage(error)}`);
      }
    }
  }
  try {
    const result = await presentation.write({ outputType: "uint8array", compression: true });
    if (!(result instanceof Uint8Array) || !result.length) throw new Error("Writer did not return file bytes.");
    return result;
  } catch (error) {
    throw new Error(`PPTX serialization failed: ${errorMessage(error)}`);
  }
}

async function generatePdf(snapshot: ExportSnapshot, date: Date): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(metadataName(snapshot.slides[0].name));
  document.setCreator("Frame2Slides");
  document.setProducer("Frame2Slides / pdf-lib");
  document.setCreationDate(date);
  document.setModificationDate(date);
  const checkAsset = assetBudget();
  const images = new WeakMap<Uint8Array, PDFImage>();
  for (const frame of snapshot.slides) {
    const context = frameContext(frame);
    try {
      const bytes = frame.pdfPng!;
      checkAsset(bytes, context);
      let image = images.get(bytes);
      if (!image) {
        image = await document.embedPng(bytes);
        images.set(bytes, image);
      }
      const page = document.addPage([PDF_WIDTH, PDF_HEIGHT]);
      page.drawRectangle({ x: 0, y: 0, width: PDF_WIDTH, height: PDF_HEIGHT, color: rgb(1, 1, 1) });
      const fit = frameFit(frame, PDF_WIDTH, PDF_HEIGHT);
      // The embedded PNG retains its alpha mask over an explicitly white page.
      page.drawImage(image, { x: fit.x, y: fit.y, width: frame.width * fit.scale, height: frame.height * fit.scale });
    } catch (error) {
      throw new Error(`${context}: PDF page generation failed: ${errorMessage(error)}`);
    }
  }
  try {
    return await document.save();
  } catch (error) {
    throw new Error(`PDF serialization failed: ${errorMessage(error)}`);
  }
}

function filename(firstFrame: string, date: Date, extension: "pptx" | "pdf"): string {
  let name = firstFrame.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, "_").trim().replace(/[. ]+$/g, "");
  if (!name) name = "Untitled";
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) name = `_${name}`;
  name = Array.from(name).slice(0, 100).join("").replace(/[. ]+$/g, "");
  const stamp = `${String(date.getFullYear()).padStart(4, "0")}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `Frame2Slides_${name}_${stamp}.${extension}`;
}

/** Builds local file bytes only: no download, filesystem access, or network calls. */
export async function generateExport(snapshot: ExportSnapshot, date = new Date()): Promise<ExportFile> {
  validateSnapshot(snapshot);
  if (!Number.isFinite(date.getTime())) throw new Error("Export date is invalid.");
  const bytes = snapshot.format === "pptx" ? await generatePptx(snapshot) : await generatePdf(snapshot, date);
  return {
    bytes,
    filename: filename(snapshot.slides[0].name, date, snapshot.format),
    mimeType: snapshot.format === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/pdf",
    slideCount: snapshot.slides.length,
  };
}
