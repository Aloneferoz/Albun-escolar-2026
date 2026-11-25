import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

/**
 * Codifica un búfer RGBA en un archivo PNG válido sin dependencias externas.
 */
function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type 0
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function mixColor(bg, fg, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return [
    Math.round(bg[0] * (1 - a) + fg[0] * a),
    Math.round(bg[1] * (1 - a) + fg[1] * a),
    Math.round(bg[2] * (1 - a) + fg[2] * a),
    255,
  ];
}

function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Renderiza el emblema del birrete de graduación con borla dorada y marco circular
 * usando supermuestreo 3x3 para bordes suaves y nítidos.
 */
function renderGraduationIcon(size, isMaskable = false) {
  const rgba = Buffer.alloc(size * size * 4);
  const navyDark = [18, 44, 86];
  const navyLight = [32, 74, 138];
  const gold = [224, 173, 66];
  const ivory = [252, 250, 245];
  const shadow = [12, 28, 56];

  // Escala del emblema: más compacta en ícono maskable para respetar zona segura (15% margen)
  const scale = isMaskable ? 0.68 : 0.86;
  const cx = 0.5;
  const cy = 0.5;

  const transform = (x, y) => [cx + (x - 0.5) * scale, cy + (y - 0.5) * scale];

  // Geometría normalizada del birrete (mortarboard)
  const capTop = [
    transform(0.5, 0.27),
    transform(0.84, 0.43),
    transform(0.5, 0.59),
    transform(0.16, 0.43),
  ];

  const capCrown = [
    transform(0.28, 0.49),
    transform(0.72, 0.49),
    transform(0.72, 0.65),
    transform(0.5, 0.72),
    transform(0.28, 0.65),
  ];

  const tasselLineStart = transform(0.5, 0.43);
  const tasselLineMid = transform(0.74, 0.47);
  const tasselLineEnd = transform(0.74, 0.64);
  const tasselKnot = transform(0.74, 0.66);

  const ringRadius = 0.44 * scale;
  const ringThickness = 0.016 * scale;

  const samples = [-0.28, 0, 0.28];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nyBase = y / size;
      const nxBase = x / size;
      // Gradiente radial/diagonal sutil de fondo
      const gradT = Math.min(1, Math.max(0, (nxBase * 0.4 + nyBase * 0.6)));
      const bg = [
        Math.round(navyLight[0] * (1 - gradT) + navyDark[0] * gradT),
        Math.round(navyLight[1] * (1 - gradT) + navyDark[1] * gradT),
        Math.round(navyLight[2] * (1 - gradT) + navyDark[2] * gradT),
      ];

      let accR = 0;
      let accG = 0;
      let accB = 0;

      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = (x + 0.5 + samples[sx]) / size;
          const py = (y + 0.5 + samples[sy]) / size;

          let color = [...bg, 255];

          // Aro dorado sutil del escudo
          const distCenter = Math.hypot(px - cx, py - cy);
          if (Math.abs(distCenter - ringRadius) <= ringThickness * 0.5) {
            color = mixColor(bg, gold, 0.85);
          }

          // Copa inferior del birrete
          if (pointInPolygon(px, py, capCrown)) {
            color = [...ivory, 255];
          }

          // Sombra de separación entre tabla y copa
          const dSplit = distToSegment(px, py, capTop[3][0], capTop[3][1], capTop[2][0], capTop[2][1]);
          const dSplit2 = distToSegment(px, py, capTop[2][0], capTop[2][1], capTop[1][0], capTop[1][1]);
          if (pointInPolygon(px, py, capCrown) && (dSplit < 0.012 * scale || dSplit2 < 0.012 * scale)) {
            color = mixColor(ivory, shadow, 0.28);
          }

          // Parte superior romboidal del birrete
          if (pointInPolygon(px, py, capTop)) {
            color = [...ivory, 255];
          }

          // Cordón y borla dorada
          const dCord1 = distToSegment(
            px,
            py,
            tasselLineStart[0],
            tasselLineStart[1],
            tasselLineMid[0],
            tasselLineMid[1]
          );
          const dCord2 = distToSegment(
            px,
            py,
            tasselLineMid[0],
            tasselLineMid[1],
            tasselLineEnd[0],
            tasselLineEnd[1]
          );
          if (dCord1 <= 0.012 * scale || dCord2 <= 0.012 * scale) {
            color = [...gold, 255];
          }

          // Borla colgante
          const dKnot = Math.hypot(px - tasselKnot[0], py - tasselKnot[1]);
          if (dKnot <= 0.025 * scale) {
            color = [...gold, 255];
          }
          if (
            py >= tasselKnot[1] &&
            py <= tasselKnot[1] + 0.08 * scale &&
            Math.abs(px - tasselKnot[0]) <= 0.026 * scale * (0.6 + (py - tasselKnot[1]) * 6)
          ) {
            color = [...gold, 255];
          }

          // Botón central del birrete
          if (Math.hypot(px - tasselLineStart[0], py - tasselLineStart[1]) <= 0.02 * scale) {
            color = [...gold, 255];
          }

          accR += color[0];
          accG += color[1];
          accB += color[2];
        }
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(accR / 9);
      rgba[idx + 1] = Math.round(accG / 9);
      rgba[idx + 2] = Math.round(accB / 9);
      rgba[idx + 3] = 255;
    }
  }

  return encodePNG(size, size, rgba);
}

fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const item of targets) {
  const pngBuffer = renderGraduationIcon(item.size, item.maskable);
  fs.writeFileSync(path.join(PUBLIC_DIR, item.file), pngBuffer);
  console.log(`Generated ${item.file} (${item.size}x${item.size})`);
}
