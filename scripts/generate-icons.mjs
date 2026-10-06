/**
 * Generates simple PWA icons (192px + 512px PNG) with zero dependencies.
 * Navy rounded square + teal "catalyst" bars. Run: node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "public", "icons");
mkdirSync(root, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function roundedRect(px, x0, y0, x1, y1, r, rgb) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = Math.min(x - x0, x1 - 1 - x);
      const dy = Math.min(y - y0, y1 - 1 - y);
      if (dx < r && dy < r) {
        const cx = x0 + r - 1 - (r - 1 - dx);
        const cy = y0 + r - 1 - (r - 1 - dy);
        // simpler: distance from corner arc center
        const ax = x0 + r, ay = y0 + r;
        const bx = x1 - r, by = y1 - r;
        const nx = x < ax ? ax - x : x > bx ? x - bx : 0;
        const ny = y < ay ? ay - y : y > by ? y - by : 0;
        if (nx * nx + ny * ny > r * r) continue;
      }
      const i = (y * px.size + x) * 4;
      px.data[i] = rgb[0]; px.data[i + 1] = rgb[1]; px.data[i + 2] = rgb[2]; px.data[i + 3] = 255;
    }
  }
}

function makeIcon(size) {
  const px = { size, data: Buffer.alloc(size * size * 4) };
  // navy background
  roundedRect(px, 0, 0, size, size, Math.round(size * 0.22), [15, 42, 67]);
  // teal ascending bars (catalyst motif)
  const teal = [14, 124, 123];
  const bars = 4;
  const bw = Math.round(size * 0.11);
  const gap = Math.round(size * 0.06);
  const baseX = Math.round(size * 0.5 - (bars * bw + (bars - 1) * gap) / 2);
  const baseY = Math.round(size * 0.72);
  for (let b = 0; b < bars; b++) {
    const h = Math.round(size * (0.16 + b * 0.1));
    roundedRect(px, baseX + b * (bw + gap), baseY - h, baseX + b * (bw + gap) + bw, baseY, Math.round(bw / 2), teal);
  }
  // scanlines -> PNG
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    px.data.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

for (const size of [192, 512]) {
  const out = join(root, `icon-${size}.png`);
  writeFileSync(out, makeIcon(size));
  console.log("wrote", out);
}
