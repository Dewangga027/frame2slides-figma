import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { generateExport } from "../src/export/generate";
import { slide, snapshot, text } from "./fixtures";

const xml = new XMLParser({ ignoreAttributes: false, trimValues: false });
function at(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = Reflect.get(current, key);
  }
  return current;
}
async function pptx(input = snapshot()) {
  const file = await generateExport(input, new Date(2026, 9, 19));
  return { file, zip: await JSZip.loadAsync(file.bytes) };
}
async function document(zip: JSZip, path: string) {
  const entry = zip.file(path);
  if (!entry) throw new Error(`Missing output part: ${path}`);
  const source = await entry.async("string");
  expect(XMLValidator.validate(source)).toBe(true);
  const result: unknown = xml.parse(source);
  return result;
}

describe("local presentation export", () => {
  it("preserves requested slide order, native editable objects and raster paint order", async () => {
    const { zip, file } = await pptx();
    expect(file.slideCount).toBe(3);
    for (const [i, label] of ["C", "A", "B"].entries()) {
      const doc = await document(zip, `ppt/slides/slide${i + 1}.xml`);
      const tree: unknown = at(doc, "p:sld", "p:cSld", "p:spTree");
      const shapes = at(tree, "p:sp");
      expect(Array.isArray(shapes)).toBe(true);
      if (!Array.isArray(shapes)) throw new Error("Expected native slide shapes");
      expect(shapes).toHaveLength(2);
      const nativeText: unknown = shapes.find(s => at(s, "p:txBody") !== undefined);
      expect(at(nativeText, "p:txBody", "a:p", "a:r", "a:t")).toBe(label);
      expect(at(tree, "p:pic")).toBeDefined();
      const source = await zip.file(`ppt/slides/slide${i + 1}.xml`)!.async("string");
      expect(source.indexOf("<p:pic>")).toBeGreaterThan(source.lastIndexOf("</p:sp>"));
      expect(at(tree, "p:grpSp")).toBeUndefined();
    }
    const presentation = await document(zip, "ppt/presentation.xml");
    const size: unknown = at(presentation, "p:presentation", "p:sldSz");
    expect(Number(at(size, "@_cx")) / Number(at(size, "@_cy"))).toBeCloseTo(16 / 9, 6);
  });

  it("fits non-widescreen frames proportionally and keeps raster placement independent of scale", async () => {
    const input = snapshot();
    input.slides = [slide("square", "Square", 1000, 1000)];
    const inspect = async () => {
      const { zip } = await pptx(input);
      const doc = await document(zip, "ppt/slides/slide1.xml");
      const tree: unknown = at(doc, "p:sld", "p:cSld", "p:spTree");
      const background: unknown = at(tree, "p:sp", 0, "p:spPr", "a:xfrm");
      const image: unknown = at(tree, "p:pic", "p:spPr", "a:xfrm");
      return { background, image };
    };
    input.scale = 1;
    const first = await inspect();
    input.scale = 3;
    const third = await inspect();
    expect(third.image).toEqual(first.image);
    const extent: unknown = at(first.background, "a:ext");
    expect(at(extent, "@_cx")).toBe(at(extent, "@_cy"));
    expect(Number(at(first.background, "a:off", "@_x"))).toBeGreaterThan(0);
    expect(Number(at(first.background, "a:off", "@_y"))).toBe(0);
  });

  it("preserves rotation, multiplied alpha and mixed text styling as native objects", async () => {
    const input = snapshot();
    const heading = text("mixed", "Normal ");
    heading.runs[0].bold = false;
    heading.runs.push({ ...heading.runs[0], text: "Bold", bold: true, italic: true, color: "FF0000" });
    input.slides = [{ ...slide("styles", "Styles"), elements: [
      { kind: "shape", shape: "ellipse", id: "ellipse", name: "Ellipse", x: 100, y: 200,
        width: 300, height: 150, rotation: 30, opacity: 0.5, fill: { color: "00FF00", opacity: 0.5 } },
      heading,
    ] }];
    const { zip } = await pptx(input);
    const doc = await document(zip, "ppt/slides/slide1.xml");
    const shapes = at(doc, "p:sld", "p:cSld", "p:spTree", "p:sp");
    expect(Array.isArray(shapes)).toBe(true);
    if (!Array.isArray(shapes)) throw new Error("Native shapes missing");
    expect(Number(at(shapes[0], "p:spPr", "a:xfrm", "@_rot"))).toBe(30 * 60000);
    expect(Number(at(shapes[0], "p:spPr", "a:solidFill", "a:srgbClr", "a:alpha", "@_val"))).toBe(25000);
    const runs = at(shapes[1], "p:txBody", "a:p", "a:r");
    expect(Array.isArray(runs)).toBe(true);
    if (!Array.isArray(runs)) throw new Error("Mixed native text runs missing");
    expect(at(runs[0], "a:t")).toBe("Normal ");
    expect(at(runs[1], "a:t")).toBe("Bold");
    expect(Number(at(runs[1], "a:rPr", "@_b"))).toBe(1);
    expect(Number(at(runs[1], "a:rPr", "@_i"))).toBe(1);
    expect(at(runs[1], "a:rPr", "a:solidFill", "a:srgbClr", "@_val")).toBe("FF0000");
    expect(Number(at(runs[1], "a:rPr", "@_sz"))).toBe(1800);
  });

  it("writes valid 16:9 PDF pages and proportionally fits square source frames", async () => {
    const input = snapshot("pdf");
    input.slides[1] = slide("square", "Square", 1000, 1000);
    const file = await generateExport(input);
    const pdf = await PDFDocument.load(file.bytes);
    expect(pdf.getPageCount()).toBe(3);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      expect(width / height).toBeCloseTo(16 / 9, 6);
      expect(page.node.Resources()).toBeDefined();
    }
    const contents = pdf.getPages()[1].node.Contents();
    if (!(contents instanceof PDFArray)) throw new Error("Page content stream missing");
    const stream = pdf.context.lookup(contents.get(0));
    if (!(stream instanceof PDFRawStream)) throw new Error("Expected an encoded PDF page stream");
    const operators = new TextDecoder().decode(decodePDFRawStream(stream).decode());
    expect(operators).toContain("157.5 0 cm");
    expect(operators).toContain("405 0 0 405 0 0 cm");
    expect(file.mimeType).toBe("application/pdf");
  });

  it("rejects incomplete, blocked and invalid exports instead of returning partial success", async () => {
    const empty = snapshot(); empty.slides = [];
    await expect(generateExport(empty)).rejects.toThrow();
    const blocked = snapshot();
    blocked.issues.push({ severity: "error", frameId: "c", nodeId: "n", nodeName: "Backdrop", code: "BACKDROP", message: "Backdrop cannot be independently composited" });
    await expect(generateExport(blocked)).rejects.toThrow();
    const corrupt = snapshot("pdf"); corrupt.slides[1].pdfPng = undefined;
    await expect(generateExport(corrupt)).rejects.toThrow();
    const invalid = snapshot(); invalid.slides[0].elements[0].width = NaN;
    await expect(generateExport(invalid)).rejects.toThrow();
  });

  it("uses the first final-order frame and sanitizes filename for Windows", async () => {
    const input = snapshot(); input.slides[0].name = 'Cover:/\\?*<>|"\u0000';
    const file = await generateExport(input, new Date(2026, 9, 19));
    expect(file.filename).toMatch(/^Frame2Slides_Cover.*_20261019\.pptx$/);
    expect(file.filename).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/);
  });
});
