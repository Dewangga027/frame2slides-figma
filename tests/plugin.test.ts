import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import UPNG from "upng-js";
import { buildExportSnapshot } from "../src/plugin/snapshot";
import { generateExport } from "../src/export/generate";
import type { ExportRequest } from "../src/shared/scene";
import type { PluginToUIMessage } from "../src/shared/messages";
import { frame, label, rectangle, vector } from "./figma-fixtures";

let nodes: Map<string, FrameNode>;
const request = (ids: string[], scale: 1 | 2 | 3 = 2): ExportRequest => ({ jobId: "test", frameIds: ids, format: "pptx", scale });
beforeEach(() => {
  nodes = new Map();
  vi.stubGlobal("figma", { mixed: Symbol("mixed"), getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null });
});
afterEach(() => vi.unstubAllGlobals());
function register(node: FrameNode) { nodes.set(node.id, node); return node; }

describe("Figma-to-file conversion", () => {
  it("keeps native text and shapes editable around a raster fallback in original paint order without source writes", async () => {
    const source = register(frame("slide", [rectangle("back"), vector("complex"), label("caption", "Editable caption")]));
    const before = JSON.stringify(source);
    const scene = await buildExportSnapshot(request([source.id]), () => {});
    expect(JSON.stringify(source)).toBe(before);
    expect(scene.slides[0].elements.map(element => element.id)).toEqual(["slide", "back", "complex", "caption"]);
    expect(scene.slides[0].elements.map(element => element.kind)).toEqual(["shape", "shape", "image", "text"]);
    expect(scene.issues.some(issue => issue.nodeId === "complex" && issue.severity === "warning")).toBe(true);
    const file = await generateExport(scene);
    const zip = await JSZip.loadAsync(file.bytes);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toContain("Editable caption");
    expect(xml.indexOf("<p:pic>")).toBeLessThan(xml.indexOf("Editable caption"));
  });

  it("uses final absolute geometry for nested Auto Layout and omits hidden objects", async () => {
    const child = label("nested-text", "Fixed layout", 70, 60);
    const hidden = { ...rectangle("hidden"), visible: false };
    const nested = frame("nested", [child, hidden], 200, 100, 50, 40);
    register(frame("slide", [nested]));
    const scene = await buildExportSnapshot(request(["slide"]), () => {});
    const result = scene.slides[0].elements.find(element => element.id === child.id);
    expect(result?.kind).toBe("text");
    expect(result?.x).toBe(70);
    expect(result?.y).toBe(60);
    expect(scene.slides[0].elements.some(element => element.id === "hidden")).toBe(false);
  });

  it("changes PNG pixels at 1x/2x/3x without changing physical placement or other native nodes", async () => {
    register(frame("slide", [vector("complex"), label("caption", "Native")]));
    const placements = [];
    for (const scale of [1, 2, 3] as const) {
      const scene = await buildExportSnapshot(request(["slide"], scale), () => {});
      const image = scene.slides[0].elements.find(element => element.kind === "image");
      if (!image || image.kind !== "image") throw new Error("Raster missing");
      const decoded = UPNG.decode(new Uint8Array(image.png).buffer);
      expect(decoded.width).toBe(32 * scale);
      expect(decoded.height).toBe(24 * scale);
      placements.push([image.x, image.y, image.width, image.height]);
    }
    expect(placements[0]).toEqual(placements[1]);
    expect(placements[1]).toEqual(placements[2]);
  });

  it("blocks backdrop compositing and clipping leakage rather than silently emitting a misleading slide", async () => {
    const backdrop = { ...vector("blend"), blendMode: "MULTIPLY" as const };
    register(frame("backdrop", [rectangle("back"), backdrop]));
    await expect(buildExportSnapshot(request(["backdrop"]), () => {})).rejects.toThrow();
    register(frame("clipped", [rectangle("outside", 300, 20, 60, 40)]));
    await expect(buildExportSnapshot(request(["clipped"]), () => {})).rejects.toThrow();
  });

  it("rejects deleted frame IDs and oversized raster allocation with no partial output", async () => {
    register(frame("good", [rectangle("native")]));
    await expect(buildExportSnapshot(request(["good", "deleted"]), () => {})).rejects.toThrow();
    const giant = { ...vector("giant"), width: 20000, height: 20000,
      absoluteRenderBounds: { x: 0, y: 0, width: 20000, height: 20000 } };
    register(frame("huge", [giant], 20000, 20000));
    await expect(buildExportSnapshot(request(["huge"]), () => {})).rejects.toThrow();
  });

  it("rasterizes a self-contained mask once while preserving editable siblings", async () => {
    const mask = { ...rectangle("mask"), isMask: true };
    const nested = frame("masked", [mask, label("masked-copy", "Inside mask")], 200, 160);
    register(frame("slide", [label("editable", "Editable below"), nested]));
    const scene = await buildExportSnapshot(request(["slide"]), () => {});
    expect(scene.slides[0].elements.map(element => element.id)).toEqual(["slide", "editable", "masked"]);
    expect(scene.slides[0].elements[1].kind).toBe("text");
    expect(scene.slides[0].elements[2].kind).toBe("image");
    expect(scene.issues.some(issue => issue.nodeId === "masked" && issue.message.includes("Mask"))).toBe(true);
  });

  it("substitutes a nonportable font with an explicit report rather than rasterizing basic text", async () => {
    register(frame("slide", [label("font", "Readable and editable", 10, 80, "Design Only Font")]));
    const scene = await buildExportSnapshot(request(["slide"]), () => {});
    const element = scene.slides[0].elements.find(item => item.id === "font");
    if (element?.kind !== "text") throw new Error("Basic text must remain native");
    expect(element.runs[0].fontFace).toBe("Arial");
    expect(scene.issues.some(issue => issue.nodeId === "font" && issue.message.includes("Design Only Font") && issue.message.includes("Arial"))).toBe(true);
  });

  it("rejects a design changed during asynchronous rasterization instead of mixing snapshots", async () => {
    const asset = vector("asset");
    const source = register(frame("slide", [asset, label("title", "Original text")]));
    const render = asset.exportAsync.bind(asset);
    Object.defineProperty(asset, "exportAsync", {
      value: async (settings?: ExportSettings) => {
        source.name = "Edited by the user while rendering";
        return render(settings);
      },
    });
    await expect(buildExportSnapshot(request(["slide"]), () => {})).rejects.toThrow(/changed/i);
  });
});

describe("plugin job lifecycle", () => {
  it("deduplicates selection by ID and keeps export locked until generation finishes", async () => {
    const first = register(frame("a", [label("title", "A")]));
    const second = register(frame("b", [label("title-b", "B")]));
    first.name = second.name = "Duplicate frame name";
    const posted: PluginToUIMessage[] = [];
    const ui: { onmessage?: (message: unknown) => Promise<void>; postMessage: (message: PluginToUIMessage) => void } = {
      postMessage: message => { posted.push(message); },
    };
    vi.stubGlobal("__html__", "");
    vi.stubGlobal("figma", {
      mixed: Symbol("mixed"), showUI: () => {},
      currentPage: { selection: [first, first, second, rectangle("not-a-frame")] }, ui,
      getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
    });
    vi.resetModules();
    // Exercise module startup after installing the host globals; static import would execute before the test host exists.
    await import("../src/plugin/main");
    if (!ui.onmessage) throw new Error("Plugin handler missing");
    await ui.onmessage({ type: "LOAD_SELECTION", requestId: "selection" });
    const selection = posted.find(message => message.type === "SELECTION");
    if (!selection || selection.type !== "SELECTION") throw new Error("Selection did not load");
    expect(selection.frames.map(item => item.id)).toEqual(["a", "b"]);
    expect(selection.frames.map(item => item.name)).toEqual(["Duplicate frame name", "Duplicate frame name"]);
    expect(selection.warnings).toHaveLength(1);
    const exportMessage = { type: "EXPORT", ...request(["a"]), format: "pdf", jobId: "one" };
    await ui.onmessage(exportMessage);
    await ui.onmessage({ ...exportMessage, jobId: "two" });
    expect(posted.filter(message => message.type === "SNAPSHOT")).toHaveLength(1);
    expect(posted.some(message => message.type === "ERROR" && message.jobId === "two")).toBe(true);
    await ui.onmessage({ type: "EXPORT_FINISHED", jobId: "wrong" });
    await ui.onmessage({ ...exportMessage, jobId: "three" });
    expect(posted.filter(message => message.type === "SNAPSHOT")).toHaveLength(1);
    await ui.onmessage({ type: "EXPORT_FINISHED", jobId: "one" });
    await ui.onmessage({ ...exportMessage, jobId: "four" });
    expect(posted.filter(message => message.type === "SNAPSHOT")).toHaveLength(2);
  });
});
