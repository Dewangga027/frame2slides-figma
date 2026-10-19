import { MAX_RASTER_EDGE, MAX_RASTER_PIXELS } from "../shared/scene";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < CRC_TABLE.length; n++) {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  CRC_TABLE[n] = crc >>> 0;
}

/** Checks structure and dimensions before a decoder can allocate image buffers. */
export function validatePng(bytes: Uint8Array, context: string): { width: number; height: number } {
  const fail = (message: string): never => { throw new Error(`${context}: ${message}`); };
  if (!(bytes instanceof Uint8Array) || bytes.length < 45) fail("PNG asset is missing or truncated.");
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) fail("Asset is not a PNG image.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let hasData = false;
  let hasPalette = false;
  let endedData = false;
  let colorType = -1;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) fail("PNG chunk is truncated.");
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) fail("PNG chunk exceeds the asset length.");
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (!/^[A-Za-z]{4}$/.test(type)) fail("PNG has an invalid chunk type.");
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end - 4; index++) crc = CRC_TABLE[(crc ^ bytes[index]) & 255] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end - 4)) fail(`PNG ${type} checksum is corrupt.`);
    if (offset === 8 && type !== "IHDR") fail("PNG must begin with IHDR.");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) fail("PNG has an invalid IHDR.");
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (!width || !height || width > MAX_RASTER_EDGE || height > MAX_RASTER_EDGE || width * height > MAX_RASTER_PIXELS) {
        fail(`PNG dimensions ${width}×${height} exceed the raster safety budget.`);
      }
      const depth = bytes[offset + 16];
      colorType = bytes[offset + 17];
      const depths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[colorType]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) {
        fail("PNG has unsupported or invalid image encoding.");
      }
    } else if (type === "PLTE") {
      if (hasPalette || hasData || !length || length % 3 !== 0 || length > 768) fail("PNG palette is invalid.");
      hasPalette = true;
    } else if (type === "IDAT") {
      if (endedData || (colorType === 3 && !hasPalette)) fail("PNG image data or palette ordering is invalid.");
      hasData = true;
    } else if (type === "IEND") {
      if (length !== 0 || !hasData || end !== bytes.length) fail("PNG image data or end marker is invalid.");
      return { width, height };
    } else {
      if (type === "acTL" || type === "fcTL" || type === "fdAT") fail("Animated PNG assets are not supported.");
      if (type[0] === type[0].toUpperCase()) fail(`Unsupported critical PNG chunk ${type}.`);
    }
    if (hasData && type !== "IDAT") endedData = true;
    offset = end;
  }
  return fail("PNG end marker is missing.");
}

/** All assets are embedded data; no path/URL is ever passed to the writer. */
export function pngDataUri(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return `data:image/png;base64,${btoa(parts.join(""))}`;
}
