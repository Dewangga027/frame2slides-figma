import type { ExportSnapshot, SlideSnapshot, TextElement } from "../src/shared/scene";
import UPNG from "upng-js";

// Transparent PNG; placement tests are independent of the asset's pixel dimensions.
export const png = new Uint8Array(UPNG.encode([new Uint8Array(4 * 4 * 4).buffer], 4, 4, 0));
export function text(id: string, content: string): TextElement {
  return {
    kind: "text", id, name: id, x: 96, y: 96, width: 600, height: 120, rotation: 0, opacity: 1,
    align: "left", verticalAlign: "top", paragraphSpacing: 0,
    runs: [{ text: content, fontFace: "Arial", fontSize: 48, bold: true, italic: false,
      color: "123456", opacity: 1, underline: false, strike: false, letterSpacing: 0 }],
  };
}
export function slide(id: string, name: string, width = 1920, height = 1080): SlideSnapshot {
  return { id, name, width, height, pdfPng: png, elements: [
    { kind: "shape", id: `${id}-background`, name: "Background", shape: "rect", x: 0, y: 0,
      width, height, rotation: 0, opacity: 1, fill: { color: "FFFFFF", opacity: 1 } },
    text(`${id}-text`, name),
    { kind: "image", id: `${id}-raster`, name: "Complex vector", x: 800, y: 100,
      width: 200, height: 150, rotation: 0, opacity: 0.5, png },
  ] };
}
export function snapshot(format: "pptx" | "pdf" = "pptx"): ExportSnapshot {
  return { format, scale: 2, slides: [slide("c", "C"), slide("a", "A"), slide("b", "B")], issues: [], rasterPixels: 3 };
}
