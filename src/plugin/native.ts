import type { Bounds, Paint as ScenePaint, ShapeElement, TextElement, TextRun } from "../shared/scene";

export type Matrix = readonly [readonly [number, number, number], readonly [number, number, number]];
export interface Point { x: number; y: number }
export interface NativeResult<T> { element?: T; reason?: string; warnings?: string[] }

export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1], a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1], a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2]],
  ];
}

export function inverse(m: Matrix): Matrix {
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) throw new Error("The frame has a singular transform. Restore a non-zero frame size and retry.");
  return [
    [m[1][1] / det, -m[0][1] / det, (m[0][1] * m[1][2] - m[1][1] * m[0][2]) / det],
    [-m[1][0] / det, m[0][0] / det, (m[1][0] * m[0][2] - m[0][0] * m[1][2]) / det],
  ];
}

export function point(m: Matrix, x: number, y: number): Point {
  return { x: m[0][0] * x + m[0][1] * y + m[0][2], y: m[1][0] * x + m[1][1] * y + m[1][2] };
}

export function box(m: Matrix, width: number, height: number): Bounds | undefined {
  const sx = Math.hypot(m[0][0], m[1][0]);
  const sy = Math.hypot(m[0][1], m[1][1]);
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  if (![sx, sy, width, height, ...m[0], ...m[1]].every(Number.isFinite) || sx < 1e-8 || sy < 1e-8 || det <= 0) return undefined;
  if (Math.abs(m[0][0] * m[0][1] + m[1][0] * m[1][1]) > 1e-5 * sx * sy) return undefined;
  const center = point(m, width / 2, height / 2);
  return { x: center.x - width * sx / 2, y: center.y - height * sy / 2, width: width * sx, height: height * sy, rotation: Math.atan2(m[1][0], m[0][0]) * 180 / Math.PI };
}

function solid(paints: readonly Paint[] | PluginAPI["mixed"]): NativeResult<ScenePaint> {
  if (typeof paints === "symbol") return { reason: "Mixed paint styles" };
  const visible = paints.filter(p => p.visible !== false);
  if (visible.length === 0) return {};
  if (visible.length !== 1 || visible[0].type !== "SOLID") return { reason: "Multiple, image, or gradient paints" };
  const paint = visible[0];
  if (paint.blendMode && paint.blendMode !== "NORMAL") return { reason: "Paint blending" };
  const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
  return { element: { color: channel(paint.color.r) + channel(paint.color.g) + channel(paint.color.b), opacity: paint.opacity ?? 1 } };
}

export function nativeShape(node: SceneNode, geometry: Bounds): NativeResult<ShapeElement> {
  if (!(node.type === "RECTANGLE" || node.type === "ELLIPSE" || node.type === "LINE" || node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE" || node.type === "COMPONENT_SET")) return { reason: `${node.type.toLowerCase()} geometry` };
  const fill: NativeResult<ScenePaint> = node.type === "LINE" ? {} : solid(node.fills);
  const stroke = solid(node.strokes);
  if (fill.reason || stroke.reason) return { reason: fill.reason ?? stroke.reason };
  if (stroke.element && (typeof node.strokeWeight !== "number" || node.dashPattern.length > 0)) return { reason: "Mixed or dashed strokes" };
  if (stroke.element && node.type === "ELLIPSE" && node.strokeAlign !== "CENTER") return { reason: "Inside/outside ellipse strokes require visual baking" };
  if (stroke.element && "strokeJoin" in node && node.type !== "LINE" && node.type !== "ELLIPSE" && node.strokeJoin !== "MITER") return { reason: "Rounded or beveled stroke joins" };
  if (stroke.element && fill.element && node.opacity < 1) return { reason: "Whole-shape opacity requires compositing fill and stroke together" };
  if (Math.abs(geometry.width - node.width) > 0.001 || Math.abs(geometry.height - node.height) > 0.001) return { reason: "Scaled transform needs baked stroke and paint metrics" };
  if (stroke.element && "strokeCap" in node && node.strokeCap !== "NONE") return { reason: "Non-default stroke caps" };
  if ("strokeTopWeight" in node && stroke.element && (node.strokeTopWeight !== node.strokeBottomWeight || node.strokeTopWeight !== node.strokeLeftWeight || node.strokeTopWeight !== node.strokeRightWeight)) return { reason: "Per-edge strokes" };
  if (!fill.element && !stroke.element) return {};
  if (node.type === "ELLIPSE" && (node.arcData.startingAngle !== 0 || Math.abs(node.arcData.endingAngle - 2 * Math.PI) > 1e-6 || node.arcData.innerRadius !== 0)) return { reason: "Partial ellipse or donut geometry" };
  let radius = 0;
  if ("cornerRadius" in node) {
    if (typeof node.cornerRadius !== "number" || node.cornerSmoothing !== 0) return { reason: "Mixed or smoothed corners" };
    radius = node.cornerRadius;
  }
  // The shared writer supports PowerPoint's adjustable roundRect, but its corner
  // profile differs from arbitrary Figma radii. Bake rounded outlines faithfully.
  if (radius > 0) return { reason: "Rounded shape corner profile" };
  return {
    element: {
      kind: "shape", id: node.id, name: node.name, ...geometry, opacity: node.opacity,
      shape: node.type === "ELLIPSE" ? "ellipse" : node.type === "LINE" ? "line" : "rect",
      ...(fill.element ? { fill: fill.element } : {}),
      ...(stroke.element && typeof node.strokeWeight === "number" ? { stroke: { ...stroke.element, width: node.strokeWeight } } : {}),
    },
  };
}

const TARGET_FONTS: Record<string, true> = { arial: true, calibri: true, "times new roman": true, georgia: true, verdana: true, tahoma: true, "trebuchet ms": true, "courier new": true };

export function textSegments(node: TextNode) {
  return node.getStyledTextSegments([
    "fontName", "fontSize", "fontWeight", "fontStyle", "fills", "textDecoration", "textCase", "lineHeight", "letterSpacing", "listOptions", "indentation", "paragraphIndent", "paragraphSpacing", "listSpacing", "openTypeFeatures", "textDecorationStyle", "textDecorationOffset", "textDecorationThickness", "textDecorationColor", "textDecorationSkipInk", "textWrapStyle",
  ]);
}

export function nativeText(node: TextNode, geometry: Bounds): NativeResult<TextElement> {
  if (!node.characters) return {};
  if (Math.abs(geometry.width - node.width) > 0.001 || Math.abs(geometry.height - node.height) > 0.001) return { reason: "Scaled text transforms require baked glyph geometry" };
  if (node.strokes.some(p => p.visible !== false)) return { reason: "Text outlines" };
  if (node.paragraphIndent !== 0 || node.hangingPunctuation || node.leadingTrim !== "NONE") return { reason: "Paragraph indentation, hanging punctuation, or leading trim" };
  if (node.textTruncation !== "DISABLED" || node.maxLines !== null) return { reason: "Truncated text" };
  if ("textPath" in node && node.textPath) return { reason: "Text on a path" };
  const segments = textSegments(node);
  const runs: TextRun[] = [];
  const warnings = new Set<string>();
  let lineHeight: number | undefined;
  let automaticLineHeight: boolean | undefined;
  let paragraphSpacing: number | undefined;
  for (const segment of segments) {
    if (segment.textCase !== "ORIGINAL" || segment.listOptions.type !== "NONE" || segment.indentation !== 0 || segment.paragraphIndent !== 0 || segment.listSpacing !== 0) return { reason: "Case transformation or list typography" };
    if (segment.textWrapStyle !== "AUTO") return { reason: "Balanced or non-default text wrapping" };
    if (Object.values(segment.openTypeFeatures).some(Boolean) || segment.fontName.variationSettings) return { reason: "OpenType overrides or variable-font axes" };
    if (segment.fontWeight !== 400 && segment.fontWeight !== 700) return { reason: "Font weight other than regular or bold" };
    if (!/^(regular|normal|book|roman|bold|italic|oblique|bold italic|bold oblique)$/i.test(segment.fontName.style)) return { reason: "Font style not representable as regular/bold/italic" };
    if (segment.textDecoration !== "NONE" && ((segment.textDecorationStyle !== null && segment.textDecorationStyle !== "SOLID") || (segment.textDecorationOffset !== null && segment.textDecorationOffset.unit !== "AUTO") || (segment.textDecorationThickness !== null && segment.textDecorationThickness.unit !== "AUTO") || (segment.textDecorationColor !== null && segment.textDecorationColor.value !== "AUTO"))) return { reason: "Custom text decoration" };
    const fill = solid(segment.fills);
    if (fill.reason) return { reason: fill.reason };
    const height = segment.lineHeight.unit === "AUTO" ? undefined : segment.lineHeight.unit === "PIXELS" ? segment.lineHeight.value : segment.fontSize * segment.lineHeight.value / 100;
    const isAuto = height === undefined;
    if (automaticLineHeight !== undefined && (automaticLineHeight !== isAuto || (!isAuto && Math.abs((lineHeight ?? 0) - (height ?? 0)) > 1e-6))) return { reason: "Mixed line heights" };
    automaticLineHeight = isAuto;
    lineHeight = height;
    if (paragraphSpacing !== undefined && paragraphSpacing !== segment.paragraphSpacing) return { reason: "Mixed paragraph spacing" };
    paragraphSpacing = segment.paragraphSpacing;
    let fontFace = segment.fontName.family;
    if (node.hasMissingFont || !TARGET_FONTS[fontFace.toLowerCase()]) {
      warnings.add(`Font “${fontFace}” is missing or is not a portable target font; substituted Arial. Check wrapping in the target presentation app.`);
      fontFace = "Arial";
    }
    runs.push({
      text: segment.characters, fontFace, fontSize: segment.fontSize,
      bold: segment.fontWeight === 700, italic: /italic|oblique/i.test(segment.fontName.style),
      color: fill.element?.color ?? "000000", opacity: fill.element?.opacity ?? 0,
      underline: segment.textDecoration === "UNDERLINE", strike: segment.textDecoration === "STRIKETHROUGH",
      letterSpacing: segment.letterSpacing.unit === "PIXELS" ? segment.letterSpacing.value : segment.fontSize * segment.letterSpacing.value / 100,
    });
  }
  if (runs.map(run => run.text).join("") !== node.characters) return { reason: "Styled runs do not cover the complete source text" };
  return {
    element: {
      kind: "text", id: node.id, name: node.name, ...geometry, opacity: node.opacity, runs,
      align: node.textAlignHorizontal === "JUSTIFIED" ? "justify" : node.textAlignHorizontal === "CENTER" ? "center" : node.textAlignHorizontal === "RIGHT" ? "right" : "left",
      verticalAlign: node.textAlignVertical === "CENTER" ? "middle" : node.textAlignVertical === "BOTTOM" ? "bottom" : "top",
      ...(lineHeight === undefined ? {} : { lineHeight }), paragraphSpacing: paragraphSpacing ?? 0,
    }, warnings: [...warnings],
  };
}
