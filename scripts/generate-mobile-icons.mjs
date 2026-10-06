/**
 * Generates the mobile app's store-required image assets with zero
 * dependencies (pure-Node PNG writer, same approach as
 * scripts/generate-icons.mjs — fully local, no external image services,
 * no network).
 *
 * Design language matches the web PWA icons: navy (#0f2a43) rounded
 * square + teal (#0e7c7b) ascending "catalyst" bars.
 *
 * Outputs (all into apps/mobile/assets/):
 *   icon.png                1024x1024  store listing icon + Expo `icon`
 *                                     (App Store 1024x1024 requirement)
 *   adaptive-icon.png       1024x1024  Android adaptive-icon foreground:
 *                                     mark centered inside the 66%-diameter
 *                                     safe zone on a transparent background
 *                                     (Expo `android.adaptiveIcon.foregroundImage`)
 *   splash.png              1024x1024  Expo `splash.image` — centered with
 *                                     `resizeMode: contain` over the navy
 *                                     `backgroundColor`, so a square logo
 *                                     is the correct asset here
 *   favicon.png             48x48      Expo web favicon
 *
 * Run: node scripts/generate-mobile-icons.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "mobile", "assets");
mkdirSync(outDir, { recursive: true });

const NAVY = [15, 42, 67];
const TEAL = [14, 124, 123];

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

function newCanvas(size) {
  // RGBA, transparent by default (alpha 0)
  return { size, data: Buffer.alloc(size * size * 4) };
}

function roundedRect(px, x0, y0, x1, y1, r, rgb) {
  const { size } = px;
  for (let y = y0; y < y1; y++) {
    if (y < 0 || y >= size) continue;
    for (let x = x0; x < x1; x++) {
      if (x < 0 || x >= size) continue;
      const ax = x0 + r, ay = y0 + r;
      const bx = x1 - r, by = y1 - r;
      const nx = x < ax ? ax - x : x > bx ? x - bx : 0;
      const ny = y < ay ? ay - y : y > by ? y - by : 0;
      if (nx * nx + ny * ny > r * r) continue;
      const i = (y * size + x) * 4;
      px.data[i] = rgb[0]; px.data[i + 1] = rgb[1]; px.data[i + 2] = rgb[2]; px.data[i + 3] = 255;
    }
  }
}

/** Teal ascending bars centered in a rectangle of the canvas. */
function catalystBars(px, x0, y0, w, h) {
  const bars = 4;
  const bw = Math.round(w * 0.17);
  const gap = Math.round(w * 0.095);
  const baseX = Math.round(x0 + (w - (bars * bw + (bars - 1) * gap)) / 2);
  const baseY = Math.round(y0 + h * 0.68);
  for (let b = 0; b < bars; b++) {
    const bh = Math.round(h * (0.22 + b * 0.13));
    const bx = baseX + b * (bw + gap);
    roundedRect(px, bx, baseY - bh, bx + bw, baseY, Math.max(2, Math.round(bw / 2)), TEAL);
  }
}

function toPng(px) {
  const { size } = px;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter type 0
    px.data.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Full-bleed store icon: navy rounded square + centered teal bars. */
function makeStoreIcon(size) {
  const px = newCanvas(size);
  roundedRect(px, 0, 0, size, size, Math.round(size * 0.22), NAVY);
  catalystBars(px, size * 0.28, size * 0.28, size * 0.44, size * 0.44);
  return px;
}

/**
 * Adaptive-icon foreground: transparent background; the mark occupies the
 * central ~66% safe zone (Google keyline requirement) so launchers never
 * crop the bars.
 */
function makeAdaptiveForeground(size) {
  const px = newCanvas(size);
  const mark = Math.round(size * 0.66); // safe-zone diameter
  const x0 = Math.round((size - mark) / 2);
  roundedRect(px, x0, x0, x0 + mark, x0 + mark, Math.round(mark * 0.22), NAVY);
  catalystBars(px, x0 + mark * 0.24, x0 + mark * 0.24, mark * 0.52, mark * 0.52);
  return px;
}

/** Splash: navy full-bleed with a smaller centered mark. */
function makeSplash(size) {
  const px = newCanvas(size);
  roundedRect(px, 0, 0, size, size, 0, NAVY);
  catalystBars(px, size * 0.34, size * 0.32, size * 0.32, size * 0.36);
  return px;
}

const jobs = [
  ["icon.png", makeStoreIcon(1024)],
  ["adaptive-icon.png", makeAdaptiveForeground(1024)],
  ["splash.png", makeSplash(1024)],
  ["favicon.png", makeStoreIcon(48)],
];

for (const [name, px] of jobs) {
  const out = join(outDir, name);
  writeFileSync(out, toPng(px));
  console.log("wrote", out, `${px.size}x${px.size}`);
}
