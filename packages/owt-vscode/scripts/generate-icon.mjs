#!/usr/bin/env node
// Renders images/icon.png (128x128, the marketplace icon) without any image dependency:
// shapes are rasterized with 4x4 supersampling and encoded as an RGBA PNG with zlib.
//
//   node scripts/generate-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 128;
const SAMPLES = 4;

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const BG_FROM = hex('#7c3aed');
const BG_TO = hex('#2563eb');
const WHITE = [255, 255, 255];
const ACCENT = hex('#facc15');

/** Signed distance to a rounded square centred in the canvas. */
function roundedSquare(x, y, half, radius) {
  const qx = Math.abs(x - SIZE / 2) - (half - radius);
  const qy = Math.abs(y - SIZE / 2) - (half - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Colour (RGBA, premultiplied later) of one sample point. */
function sample(x, y) {
  if (roundedSquare(x, y, 60, 26) > 0) return [0, 0, 0, 0];
  const t = (x + y) / (2 * SIZE);
  let color = BG_FROM.map((c, i) => lerp(c, BG_TO[i], t));
  // the "O": a thick ring
  const d = Math.hypot(x - 60, y - 66);
  if (d <= 38 && d >= 22) color = WHITE;
  // the reactive "spark": a dot orbiting the ring
  if (Math.hypot(x - 96, y - 32) <= 12) color = ACCENT;
  return [...color, 255];
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const [r, g, b, a] = sample(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES);
        acc[0] += (r * a) / 255;
        acc[1] += (g * a) / 255;
        acc[2] += (b * a) / 255;
        acc[3] += a;
      }
    }
    const n = SAMPLES * SAMPLES;
    const alpha = acc[3] / n;
    const offset = (py * SIZE + px) * 4;
    for (let i = 0; i < 3; i++) pixels[offset + i] = alpha === 0 ? 0 : Math.round((acc[i] / n) * (255 / alpha));
    pixels[offset + 3] = Math.round(alpha);
  }
}

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // colour type: RGBA
header[10] = 0; // compression
header[11] = 0; // filter
header[12] = 0; // interlace

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(root, 'images', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`wrote ${path.relative(root, out)} (${png.length} bytes)`);
