import {
  MAX_RASTER_EDGE, MAX_RASTER_PIXELS,
  type ExportIssue, type ExportRequest, type ExportSnapshot, type ImageElement, type SlideElement, type SlideSnapshot,
} from "../shared/scene";
import { box, inverse, multiply, nativeShape, nativeText, point, textSegments, type Matrix, type Point } from "./native";

type Progress = (completed: number, total: number, stage: string) => void;
interface RasterTask {
  frame: FrameNode;
  node: SceneNode;
  slide: SlideSnapshot;
  image?: ImageElement;
  bounds: Rect;
  canvas: boolean;
}
interface Clip { node: SceneNode; inverse: Matrix; width: number; height: number; radius: number }

export class SceneExportError extends Error {
  constructor(public readonly issue: ExportIssue) {
    super(`Frame “${issue.frameId}”, ${issue.nodeName} (${issue.nodeId}): ${issue.message}`);
    this.name = "SceneExportError";
  }
}

class RasterPromotion extends Error {
  constructor(readonly node: SceneNode, readonly reason: string) {
    super(reason);
    this.name = "RasterPromotion";
  }
}

function fail(frame: FrameNode, node: SceneNode, code: string, message: string): never {
  throw new SceneExportError({ severity: "error", frameId: frame.id, nodeId: node.id, nodeName: node.name, code, message });
}

function corners(rect: Rect): Point[] {
  return [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }];
}

function visible(node: SceneNode): boolean {
  return node.visible && (!("opacity" in node) || node.opacity > 0);
}

function clipFor(node: SceneNode): Clip | undefined {
  if (!("clipsContent" in node) || !node.clipsContent) return undefined;
  const radius = "cornerRadius" in node && typeof node.cornerRadius === "number" ? Math.min(node.cornerRadius, node.width / 2, node.height / 2) : 0;
  return { node, inverse: inverse(node.absoluteTransform), width: node.width, height: node.height, radius };
}

function clipContains(clip: Clip, rect: Rect): boolean {
  const epsilon = 0.001;
  return corners(rect).every(corner => {
    const p = point(clip.inverse, corner.x, corner.y);
    if (p.x < -epsilon || p.y < -epsilon || p.x > clip.width + epsilon || p.y > clip.height + epsilon) return false;
    if (clip.radius === 0) return true;
    const x = Math.max(clip.radius, Math.min(clip.width - clip.radius, p.x));
    const y = Math.max(clip.radius, Math.min(clip.height - clip.radius, p.y));
    return Math.hypot(p.x - x, p.y - y) <= clip.radius + epsilon;
  });
}

function outsideClip(clip: Clip, rect: Rect): boolean {
  const points = corners(rect).map(p => point(clip.inverse, p.x, p.y));
  return Math.max(...points.map(p => p.x)) <= 0 || Math.min(...points.map(p => p.x)) >= clip.width || Math.max(...points.map(p => p.y)) <= 0 || Math.min(...points.map(p => p.y)) >= clip.height;
}

function renderBounds(node: SceneNode): Rect | null {
  if (!("absoluteRenderBounds" in node)) return null;
  const bounds = node.absoluteRenderBounds;
  return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
}

function assertBounds(frame: FrameNode, node: SceneNode, bounds: Rect): void {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) fail(frame, node, "INVALID_RENDER_BOUNDS", "Visual bounds are invalid. Restore finite, positive node dimensions and retry.");
}

function inspectIndependent(frame: FrameNode, node: SceneNode): void {
  if (!visible(node)) return;
  if ("blendMode" in node && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") fail(frame, node, "BACKDROP_BLEND", `Blend mode ${node.blendMode} depends on underlying layers. Change it to Normal/Pass through or prepare an independently composited asset; this exporter will not flatten the slide.`);
  for (const key of ["fills", "strokes"] as const) {
    if (!(key in node)) continue;
    const paints: unknown = Reflect.get(node, key);
    if (typeof paints === "symbol") continue;
    // Figma's discriminated union gives mixed fills on text; the runtime array
    // check also keeps the boundary safe for older plugin API implementations.
    if (Array.isArray(paints)) {
      const safePaints: unknown[] = paints;
      for (const paint of safePaints) {
        if (typeof paint !== "object" || paint === null) continue;
        const blend: unknown = Reflect.get(paint, "blendMode");
        const paintVisible: unknown = Reflect.get(paint, "visible");
        if (paintVisible !== false && typeof blend === "string" && blend !== "NORMAL") fail(frame, node, "BACKDROP_PAINT", `${key} use ${blend} blending, which cannot be composed independently over editable siblings. Use Normal paints or an independent asset.`);
      }
    }
  }
  if ("effects" in node) {
    for (const effect of node.effects) {
      if (!effect.visible) continue;
      if (effect.type === "BACKGROUND_BLUR" || effect.type === "GLASS" || effect.type === "SHADER") fail(frame, node, "BACKDROP_EFFECT", `${effect.type} may sample the backdrop and cannot be exported as an independent transparent node. Remove that effect or prepare an independent asset.`);
      if ("blendMode" in effect && effect.blendMode !== "NORMAL") fail(frame, node, "BACKDROP_EFFECT_BLEND", `Effect blending (${effect.blendMode}) cannot be composed faithfully over editable siblings. Set the effect blend to Normal or use an independent asset.`);
    }
  }
  if ("children" in node) for (const child of node.children) inspectIndependent(frame, child);
}

const FINGERPRINT_FIELDS = [
  "id", "name", "type", "visible", "opacity", "blendMode", "absoluteTransform", "absoluteRenderBounds", "width", "height", "fills", "strokes", "effects", "strokeWeight", "strokeTopWeight", "strokeBottomWeight", "strokeLeftWeight", "strokeRightWeight", "strokeAlign", "strokeCap", "strokeJoin", "strokeMiterLimit", "dashPattern", "cornerRadius", "cornerSmoothing", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius", "clipsContent", "isMask", "maskType", "arcData", "vectorPaths", "vectorNetwork", "booleanOperation", "characters", "textAlignHorizontal", "textAlignVertical", "paragraphSpacing", "paragraphIndent", "hangingPunctuation", "leadingTrim", "hasMissingFont", "textTruncation", "maxLines", "itemReverseZIndex", "boundVariables",
] as const;

function fingerprint(node: SceneNode): string {
  const capture = (current: SceneNode): unknown => {
    const properties: Record<string, unknown> = {};
    for (const key of FINGERPRINT_FIELDS) if (key in current) properties[key] = Reflect.get(current, key);
    if (current.type === "TEXT") properties.runs = textSegments(current);
    if ("children" in current) properties.children = current.children.map(capture);
    return properties;
  };
  return JSON.stringify(capture(node), (_key: string, value: unknown) => typeof value === "symbol" ? "FIGMA_MIXED" : value);
}

export function validateFrame(node: BaseNode | null, id: string): FrameNode {
  if (!node || node.type !== "FRAME") throw new Error(`Frame ${id} is missing or is no longer a FRAME. Reload the selection and choose existing frames.`);
  if (!Number.isFinite(node.width) || !Number.isFinite(node.height) || node.width <= 0 || node.height <= 0) throw new Error(`Frame “${node.name}” (${id}) must have positive finite width and height.`);
  if (node.removed) throw new Error(`Frame “${node.name}” (${id}) was removed. Reload the selection.`);
  return node;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 || bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10 || bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) throw new Error("Figma returned an invalid PNG instead of a complete image.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export async function buildExportSnapshot(request: ExportRequest, progress: Progress): Promise<ExportSnapshot> {
  const ids = [...new Set(request.frameIds)];
  if (ids.length === 0) throw new Error("Choose at least one frame before exporting.");
  const frames: FrameNode[] = [];
  for (let i = 0; i < ids.length; i++) {
    progress(i, ids.length, `Reading frame ${i + 1} of ${ids.length}`);
    frames.push(validateFrame(await figma.getNodeByIdAsync(ids[i]), ids[i]));
  }
  // All layout/style reads and conversion decisions happen synchronously before
  // the first render. No returned scene element retains a live Figma style.
  const snapshot: ExportSnapshot = { format: request.format, scale: request.scale, slides: [], issues: [], rasterPixels: 0 };
  const tasks: RasterTask[] = [];
  const originals = frames.map(frame => fingerprint(frame));
  const warn = (frame: FrameNode, node: SceneNode, code: string, message: string) => {
    snapshot.issues.push({ severity: "warning", frameId: frame.id, nodeId: node.id, nodeName: node.name, code, message });
  };
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    progress(index, frames.length, `Planning “${frame.name}”`);
    if (!visible(frame)) fail(frame, frame, "HIDDEN_FRAME", "The selected frame is hidden or fully transparent. Make it visible or remove it from the export list.");
    const rootGeometry = box(frame.absoluteTransform, frame.width, frame.height);
    if (!rootGeometry || Math.abs(rootGeometry.width - frame.width) > 0.001 || Math.abs(rootGeometry.height - frame.height) > 0.001) fail(frame, frame, "FRAME_TRANSFORM", "The source frame uses shear, reflection, or transform scaling. Restore a regular frame transform before exporting.");
    const frameInverse = inverse(frame.absoluteTransform);
    const canvas: Clip = { node: frame, inverse: frameInverse, width: frame.width, height: frame.height, radius: 0 };
    const slide: SlideSnapshot = { id: frame.id, name: frame.name, width: frame.width, height: frame.height, elements: [] };
    snapshot.slides.push(slide);

    const raster = (node: SceneNode, reason: string) => {
      if (node.id === frame.id) fail(frame, node, "WHOLE_SLIDE_FALLBACK", `${reason} requires rendering the source frame, which would remove editable children. Move that visual into an independent nested frame/group, simplify the feature, or use PDF.`);
      const transform = node.absoluteTransform;
      if (Math.abs(transform[0][0] - 1) > 1e-6 || Math.abs(transform[1][1] - 1) > 1e-6 || Math.abs(transform[0][1]) > 1e-6 || Math.abs(transform[1][0]) > 1e-6) throw new RasterPromotion(node, reason);
      const bounds = renderBounds(node);
      if (!bounds) fail(frame, node, "MISSING_RENDER_BOUNDS", "Figma did not provide visual bounds for this visible fallback node. Make it independently exportable and retry.");
      assertBounds(frame, node, bounds);
      const imageBox = box(frameInverse, bounds.width, bounds.height);
      if (!imageBox) fail(frame, node, "RASTER_TRANSFORM", "This visual cannot be placed through the frame transform without shear/reflection. Restore a regular frame transform.");
      const center = point(frameInverse, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      const image: ImageElement = { kind: "image", id: node.id, name: node.name, ...imageBox, x: center.x - imageBox.width / 2, y: center.y - imageBox.height / 2, opacity: 1, png: new Uint8Array() };
      slide.elements.push(image);
      tasks.push({ frame, node, slide, image, bounds, canvas: false });
      warn(frame, node, "RASTER_FALLBACK", `${reason}; exported this independent node/subtree as an alpha PNG (${request.scale}×). Descendants are not duplicated.`);
    };

    // Non-clipping frame overflow must not leak into 16:9 padding, or stretch the
    // whole-frame PDF bitmap placement. This is a controlled, actionable failure.
    if (!frame.clipsContent) {
      for (const child of frame.children) {
        if (!visible(child)) continue;
        const bounds = renderBounds(child);
        if (bounds && !clipContains(canvas, bounds)) fail(frame, child, "NON_CLIPPING_OVERFLOW", "Content extends outside a non-clipping source frame. Enable Clip content on the source frame or move the overflowing content inside its canvas, then retry.");
      }
    }

    if (request.format === "pdf") {
      if (Math.abs(rootGeometry.rotation) > 0.001) fail(frame, frame, "PDF_ROTATED_CANVAS", "A rotated source frame cannot be guaranteed to export as its exact unrotated canvas without changing the document. Use a non-rotated source frame for PDF.");
      if (frame.blendMode !== "NORMAL" && frame.blendMode !== "PASS_THROUGH") fail(frame, frame, "PDF_EXTERNAL_BACKDROP", "The source frame itself blends with layers outside the frame. Use Normal blending so its whole render is independent.");
      if (frame.effects.some(effect => effect.visible && (effect.type === "BACKGROUND_BLUR" || effect.type === "GLASS" || effect.type === "SHADER"))) fail(frame, frame, "PDF_EXTERNAL_BACKDROP", "The source frame effect may require layers outside its canvas. Remove the backdrop-dependent frame effect before exporting.");
      tasks.push({ frame, node: frame, slide, bounds: { x: frame.absoluteTransform[0][2], y: frame.absoluteTransform[1][2], width: frame.width, height: frame.height }, canvas: true });
      continue;
    }

    inspectIndependent(frame, frame);
    const convert = (node: SceneNode, clips: Clip[]): void => {
      if (!visible(node)) return;
      const bounds = renderBounds(node);
      if (node.id !== frame.id && bounds) {
        if (clips.some(clip => outsideClip(clip, bounds))) return;
        const crossing = clips.find(clip => !clipContains(clip, bounds));
        if (crossing) fail(frame, node, "ANCESTOR_CLIP_INTERSECTION", `Visual bounds intersect clip “${crossing.node.name}” (${crossing.node.id}). Exporting this node alone cannot include that ancestor's clip. Contain the visual inside the clip, put the clipped composition in an independent nested frame, or use PDF.`);
      }
      const geometry = box(multiply(frameInverse, node.absoluteTransform), node.width, node.height);
      if (!geometry) { raster(node, "Shear or reflected transform is not a native PowerPoint object"); return; }
      const allChildren = "children" in node ? node.children : [];
      const children = allChildren.filter(visible);
      if ("isMask" in node && node.isMask) fail(frame, node, "UNCONTAINED_MASK", "This mask affects sibling layers outside an independently renderable subtree. Put the mask and its content in a nested group/frame, or use PDF.");
      // Even a transparent/hidden mask can change which siblings contribute;
      // delegate that visibility decision to Figma's self-contained renderer.
      const mask = allChildren.find(child => "isMask" in child && child.isMask);
      if (mask) { raster(node, `Mask composition containing “${mask.name}”`); return; }
      if ("opacity" in node && node.opacity < 1 && children.length > 0) { raster(node, "Container opacity must be composited once across its overlapping children"); return; }
      if ("effects" in node && node.effects.some(effect => effect.visible)) { raster(node, "Visible effects require Figma's renderer and visual effect bounds"); return; }
      const clip = clipFor(node);
      if (clip) {
        const relative = multiply(frameInverse, node.absoluteTransform);
        const axisAligned = Math.abs(relative[0][1]) < 1e-6 && Math.abs(relative[1][0]) < 1e-6;
        const complexCorners = "cornerRadius" in node && (typeof node.cornerRadius !== "number" || ("cornerSmoothing" in node && node.cornerSmoothing !== 0));
        const crossing = children.some(child => {
          const childBounds = renderBounds(child);
          return childBounds !== null && !outsideClip(clip, childBounds) && !clipContains(clip, childBounds);
        });
        if (!axisAligned || complexCorners || crossing) { raster(node, "Clipping boundary requires rendering the smallest self-contained clipping ancestor"); return; }
      }
      if (node.type === "TEXT") {
        const text = nativeText(node, geometry);
        if (text.reason) raster(node, text.reason);
        else if (text.element) {
          slide.elements.push(text.element);
          for (const message of text.warnings ?? []) warn(frame, node, "FONT_SUBSTITUTION", message);
        }
        return;
      }
      if (node.type === "GROUP") {
        for (const child of children) visit(child, clips);
        return;
      }
      const shape = nativeShape(node, geometry);
      if (shape.reason) { raster(node, shape.reason); return; }
      const borders: SlideElement[] = [];
      if (shape.element) {
        if (shape.element.shape === "rect" && shape.element.stroke) {
          const { stroke, ...background } = shape.element;
          if (background.fill) slide.elements.push(background);
          const align = "strokeAlign" in node ? node.strokeAlign : "CENTER";
          const outside = align === "OUTSIDE" ? stroke.width : align === "CENTER" ? stroke.width / 2 : 0;
          const inside = align === "INSIDE" ? stroke.width : align === "CENTER" ? stroke.width / 2 : 0;
          if (node.id === frame.id && outside > 0) fail(frame, node, "FRAME_OUTWARD_STROKE", "The source-frame border extends beyond its exact canvas. Set the frame stroke alignment to Inside, or put that border on an independently exportable nested rectangle.");
          if (inside * 2 > Math.min(geometry.width, geometry.height)) fail(frame, node, "OVERSIZED_BORDER", "This border consumes the entire rectangle. Reduce its width or use an independently composited nested asset.");
          const thickness = outside + inside;
          const strips = [
            { x: -outside, y: -outside, width: geometry.width + 2 * outside, height: thickness },
            { x: -outside, y: geometry.height - inside, width: geometry.width + 2 * outside, height: thickness },
            { x: -outside, y: inside, width: thickness, height: geometry.height - 2 * inside },
            { x: geometry.width - inside, y: inside, width: thickness, height: geometry.height - 2 * inside },
          ];
          const angle = geometry.rotation * Math.PI / 180;
          for (const strip of strips) {
            if (strip.width <= 0 || strip.height <= 0) continue;
            const dx = strip.x + strip.width / 2 - geometry.width / 2;
            const dy = strip.y + strip.height / 2 - geometry.height / 2;
            const cx = geometry.x + geometry.width / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy;
            const cy = geometry.y + geometry.height / 2 + Math.sin(angle) * dx + Math.cos(angle) * dy;
            borders.push({ kind: "shape", shape: "rect", id: node.id, name: node.name, x: cx - strip.width / 2, y: cy - strip.height / 2, width: strip.width, height: strip.height, rotation: geometry.rotation, opacity: shape.element.opacity, fill: { color: stroke.color, opacity: stroke.opacity } });
          }
        } else if (children.length > 0 && shape.element.stroke) {
          const { fill: _fill, ...outline } = shape.element;
          borders.push(outline);
          if (shape.element.fill) {
            const { stroke: _stroke, ...background } = shape.element;
            slide.elements.push(background);
          }
        } else slide.elements.push(shape.element);
      }
      const nextClips = clip ? [...clips, clip] : clips;
      if ("itemReverseZIndex" in node && node.itemReverseZIndex) children.reverse();
      for (const child of children) visit(child, nextClips);
      slide.elements.push(...borders);
    };
    const visit = (node: SceneNode, clips: Clip[]): void => {
      const elementCount = slide.elements.length;
      const taskCount = tasks.length;
      const issueCount = snapshot.issues.length;
      try { convert(node, clips); }
      catch (error: unknown) {
        if (!(error instanceof RasterPromotion)) throw error;
        // Roll back every tentative descendant before promoting to the closest
        // independently exportable axis-aligned ancestor. Keep paint order and
        // avoid ever duplicating native descendants underneath its bitmap.
        slide.elements.length = elementCount;
        tasks.length = taskCount;
        snapshot.issues.length = issueCount;
        if (node.id === frame.id) fail(frame, error.node, "AMBIGUOUS_RASTER_TRANSFORM", `${error.reason}. The isolated PNG canvas for this transformed node cannot be placed faithfully, and there is no independent axis-aligned ancestor short of the whole slide. Put the visual in an axis-aligned, unscaled nested frame/group, or use PDF. Native text/simple shapes still retain rotations.`);
        raster(node, `${error.reason}; promoted the transformed visual “${error.node.name}” to its smallest independent axis-aligned ancestor`);
      }
    };
    visit(frame, []);
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const expectedWidth = Math.ceil(task.bounds.width * request.scale);
    const expectedHeight = Math.ceil(task.bounds.height * request.scale);
    if (expectedWidth > MAX_RASTER_EDGE || expectedHeight > MAX_RASTER_EDGE || expectedWidth * expectedHeight + snapshot.rasterPixels > MAX_RASTER_PIXELS) fail(task.frame, task.node, "RASTER_BUDGET", `This PNG would allocate about ${expectedWidth}×${expectedHeight} pixels; the limit is ${MAX_RASTER_EDGE} per edge and ${MAX_RASTER_PIXELS.toLocaleString()} total pixels. Choose a lower raster scale, simplify the visual, or export fewer slides.`);
    progress(i, tasks.length, `Rendering “${task.frame.name}” / “${task.node.name}”`);
    let bytes: Uint8Array;
    try {
      bytes = await task.node.exportAsync({ format: "PNG", contentsOnly: true, useAbsoluteBounds: task.canvas, constraint: { type: "SCALE", value: request.scale }, colorProfile: "SRGB" });
    } catch (error: unknown) {
      fail(task.frame, task.node, "FIGMA_RENDER_FAILED", `Figma could not render this PNG: ${error instanceof Error ? error.message : String(error)}. Reduce the raster scale or simplify this node.`);
    }
    let size: { width: number; height: number };
    try { size = pngSize(bytes); }
    catch (error: unknown) { fail(task.frame, task.node, "INVALID_PNG", error instanceof Error ? error.message : String(error)); }
    if (size.width < 1 || size.height < 1 || size.width > MAX_RASTER_EDGE || size.height > MAX_RASTER_EDGE || snapshot.rasterPixels + size.width * size.height > MAX_RASTER_PIXELS) fail(task.frame, task.node, "RASTER_BUDGET", "Figma's actual PNG dimensions exceed the export pixel budget. Lower the raster scale or export fewer slides.");
    if (Math.abs(size.width - task.bounds.width * request.scale) > 1 || Math.abs(size.height - task.bounds.height * request.scale) > 1) fail(task.frame, task.node, task.canvas ? "PDF_CANVAS_MISMATCH" : "RASTER_BOUNDS_MISMATCH", `Figma returned ${size.width}×${size.height} pixels, but ${Math.round(task.bounds.width * request.scale)}×${Math.round(task.bounds.height * request.scale)} were required for exact visual bounds. Effects, rotation, ancestor clipping, or overflow make placement ambiguous; use an axis-aligned self-contained frame and retry.`);
    snapshot.rasterPixels += size.width * size.height;
    if (task.image) task.image.png = new Uint8Array(bytes);
    else task.slide.pdfPng = new Uint8Array(bytes);
    progress(i + 1, tasks.length, `Rendered “${task.frame.name}” / “${task.node.name}”`);
  }
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].removed || fingerprint(frames[i]) !== originals[i]) fail(frames[i], frames[i], "SOURCE_CHANGED", "The frame changed while its immutable snapshot was being rendered. Wait until editing stops, then export again.");
  }
  // Freeze records and arrays, not typed-array buffers (which JS cannot freeze).
  // PNG storage is newly owned by this snapshot and never aliases Figma data.
  for (const slide of snapshot.slides) {
    for (const element of slide.elements) {
      if (element.kind === "text") { element.runs.forEach(Object.freeze); Object.freeze(element.runs); }
      if (element.kind === "shape") { if (element.fill) Object.freeze(element.fill); if (element.stroke) Object.freeze(element.stroke); }
      Object.freeze(element);
    }
    Object.freeze(slide.elements);
    Object.freeze(slide);
  }
  snapshot.issues.forEach(Object.freeze);
  Object.freeze(snapshot.issues);
  Object.freeze(snapshot.slides);
  progress(frames.length, frames.length, "Snapshot ready for local file generation");
  return Object.freeze(snapshot);
}
