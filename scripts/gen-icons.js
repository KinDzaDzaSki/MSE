/* MSE Berza — PWA icon generator (dependency-free).
 *
 * Rasterises the favicon.svg artwork into the PNG sizes a PWA needs and writes
 * them to public/. Run once (and re-run if the brand mark changes):
 *
 *     node scripts/gen-icons.js
 *
 * The artwork is three simple shapes on a 32-unit grid (same as favicon.svg):
 *   bg    rounded square #003A70
 *   line  polyline (6,23)→(12,16)→(17,19)→(26,8), stroke #D6E3FF, round caps
 *   dot   circle at (26,8) r=2.2, fill #FFD845
 *
 * Uses 4× supersampling + a minimal PNG encoder (zlib) so the output is smooth
 * without any image dependency.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public');
const SS = 4; // supersample factor
const BG = [0x00, 0x3A, 0x70];
const LINE = [0xD6, 0xE3, 0xFF];
const DOT = [0xFF, 0xD8, 0x45];
const GRID = 32; // artwork is defined on a 32×32 grid
const PTS = [[6, 23], [12, 16], [17, 19], [26, 8]];
const STROKE = 2.6;
const DOT_R = 2.2;

// ---- PNG encoder (8-bit RGBA, filter 0) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- rasteriser (premultiplied RGBA at SS resolution) ----
function makeCanvas(w, h) {
  return { w, h, data: new Float64Array(w * h * 4) };
}
function put(cv, x, y, c) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  cv.data[i] = c[0]; cv.data[i + 1] = c[1]; cv.data[i + 2] = c[2]; cv.data[i + 3] = 255;
}
function fillRoundedRect(cv, radius, color) {
  const { w, h } = cv;
  const r = Math.min(radius, w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.max(r - x, x - (w - 1 - r), 0);
      const dy = Math.max(r - y, y - (h - 1 - r), 0);
      if (dx * dx + dy * dy <= r * r) put(cv, x, y, color);
    }
  }
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function strokePolyline(cv, pts, width, color) {
  const half = width / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const x0 = Math.max(0, Math.floor(minX - half)), x1 = Math.min(cv.w - 1, Math.ceil(maxX + half));
  const y0 = Math.max(0, Math.floor(minY - half)), y1 = Math.min(cv.h - 1, Math.ceil(maxY + half));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let d = Infinity;
      for (let i = 1; i < pts.length; i++) {
        d = Math.min(d, distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
        if (d <= half) break;
      }
      if (d <= half) put(cv, x, y, color); // ≤ half → includes round caps/joins
    }
  }
}
function fillCircle(cv, cx, cy, r, color) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(cv.h - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(cv.w - 1, Math.ceil(cx + r)); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) put(cv, x, y, color);
    }
  }
}
function downsample(cv, size) {
  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * cv.w + (x * SS + sx)) * 4;
          const pa = cv.data[i + 3];
          // data is straight (put writes a=255 or 0), premultiply for averaging
          r += cv.data[i] * pa; g += cv.data[i + 1] * pa; b += cv.data[i + 2] * pa; a += pa;
        }
      }
      r /= n; g /= n; b /= n; a /= n;
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round(a);
      } else {
        out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
      }
    }
  }
  return out;
}

// size: output px · round: rounded-square bg · k: artwork scale (maskable/apple inset)
function render(size, { round, k }) {
  const W = size * SS;
  const cv = makeCanvas(W, W);
  if (round) fillRoundedRect(cv, W * (7 / GRID), BG);
  else fillRoundedRect(cv, 0, BG); // radius 0 → full-bleed square
  const sc = (W / GRID) * k;
  const P = (x, y) => [W / 2 + (x - GRID / 2) * sc, W / 2 + (y - GRID / 2) * sc];
  strokePolyline(cv, PTS.map(([x, y]) => P(x, y)), STROKE * sc, LINE);
  fillCircle(cv, ...P(26, 8), DOT_R * sc, DOT);
  return encodePNG(size, size, downsample(cv, size));
}

const targets = [
  ['icon-512.png', 512, { round: true, k: 1 }],
  ['icon-maskable-512.png', 512, { round: false, k: 0.68 }],
  ['apple-touch-icon-180.png', 180, { round: false, k: 0.74 }],
];
for (const [name, size, opts] of targets) {
  const png = render(size, opts);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`wrote public/${name} (${size}×${size}, ${png.length} bytes)`);
}
