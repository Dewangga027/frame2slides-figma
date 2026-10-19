import UPNG from "upng-js";

export function raster(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 35; rgba[i + 1] = 100; rgba[i + 2] = 200; rgba[i + 3] = 180;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], width, height, 0));
}
const solid: SolidPaint = { type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.6 }, opacity: 1, visible: true, blendMode: "NORMAL" };
export function rectangle(id: string, x = 10, y = 20, width = 80, height = 40): RectangleNode {
  const node = {
    id, name: id, type: "RECTANGLE", removed: false, visible: true, opacity: 1, blendMode: "NORMAL",
    width, height, rotation: 0, absoluteTransform: [[1, 0, x], [0, 1, y]],
    absoluteBoundingBox: { x, y, width, height }, absoluteRenderBounds: { x, y, width, height },
    fills: [solid], strokes: [], effects: [], strokeWeight: 0, strokeAlign: "INSIDE", dashPattern: [],
    cornerRadius: 0, cornerSmoothing: 0, topLeftRadius: 0, topRightRadius: 0, bottomLeftRadius: 0, bottomRightRadius: 0,
    isMask: false, maskType: "ALPHA", exportAsync: async (settings?: ExportSettings) => {
      const scale = settings && "constraint" in settings && settings.constraint?.type === "SCALE" ? settings.constraint.value : 1;
      return raster(Math.max(1, Math.ceil(width * scale)), Math.max(1, Math.ceil(height * scale)));
    },
  };
  // Fixture implements the read/export subset of Figma nodes; it intentionally exposes no mutation APIs.
  return node as unknown as RectangleNode;
}
export function frame(id: string, children: SceneNode[] = [], width = 320, height = 180, x = 0, y = 0): FrameNode {
  const base = rectangle(id, x, y, width, height);
  // Scene fixture shares Figma's geometry/paint fields, with a frame-only child list and clipping.
  return { ...base, type: "FRAME", children, clipsContent: true, itemReverseZIndex: false,
    layoutMode: "NONE", fills: [{ ...solid, color: { r: 1, g: 1, b: 1 } }] } as unknown as FrameNode;
}
export function vector(id: string, x = 30, y = 30): VectorNode {
  // Unsupported vector shape deliberately exercises Figma raster fallback instead of native conversion.
  return { ...rectangle(id, x, y, 32, 24), type: "VECTOR" } as unknown as VectorNode;
}
export function label(id: string, content: string, x = 10, y = 80, family = "Arial"): TextNode {
  const run = {
    characters: content, start: 0, end: content.length,
    fontName: { family, style: "Regular" }, fontSize: 16,
    fontWeight: 400, fills: [solid], textDecoration: "NONE", textCase: "ORIGINAL",
    letterSpacing: { unit: "PIXELS", value: 0 }, lineHeight: { unit: "AUTO" },
    listOptions: { type: "NONE" }, indentation: 0, hyperlink: null,
    paragraphIndent: 0, paragraphSpacing: 0, listSpacing: 0, openTypeFeatures: {},
    textWrapStyle: "AUTO", fontStyle: "normal",
  };
  // Text fixture supplies the styled-segment read API used by the production adapter.
  return { ...rectangle(id, x, y, 140, 50), type: "TEXT", characters: content,
    getStyledTextSegments: () => [run], fontName: run.fontName, fontSize: 16,
    textAlignHorizontal: "LEFT", textAlignVertical: "TOP", paragraphSpacing: 0, paragraphIndent: 0,
    hangingPunctuation: false, hangingList: false, leadingTrim: "NONE", hasMissingFont: false,
    textTruncation: "DISABLED", textWrapStyle: "AUTO", maxLines: null, textAutoResize: "NONE", autoRename: false,
  } as unknown as TextNode;
}
