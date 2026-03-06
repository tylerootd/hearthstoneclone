import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import gifFrames from 'gif-frames';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = path.join(__dirname, '..', 'public', 'sprites');
const SHEETS_DIR = path.join(SPRITES_DIR, 'sheets');
const FRAME_W = 88;
const FRAME_H = 124;
const MAX_FRAMES = 30;

if (!fs.existsSync(SHEETS_DIR)) fs.mkdirSync(SHEETS_DIR, { recursive: true });

function findGifs(dir, base = '') {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  const gifs = [];
  for (const item of items) {
    const rel = base ? `${base}/${item.name}` : item.name;
    if (item.isDirectory()) {
      gifs.push(...findGifs(path.join(dir, item.name), rel));
    } else if (item.name.endsWith('.gif')) {
      gifs.push({ rel, fullPath: path.join(dir, item.name) });
    }
  }
  return gifs;
}
const gifEntries = findGifs(SPRITES_DIR);

if (!gifEntries.length) {
  console.log('[gif-to-sheet] No GIF files found.');
  fs.writeFileSync(path.join(SHEETS_DIR, 'manifest.json'), '[]');
  process.exit(0);
}

const manifest = [];

for (const { rel, fullPath: gifPath } of gifEntries) {
  const name = rel.replace(/\.gif$/, '');
  const fileBase = name.replace(/\//g, '_');
  const sheetPath = path.join(SHEETS_DIR, `${fileBase}.png`);
  const metaPath = path.join(SHEETS_DIR, `${fileBase}.json`);

  const gifStat = fs.statSync(gifPath);
  if (fs.existsSync(sheetPath) && fs.existsSync(metaPath)) {
    const sheetStat = fs.statSync(sheetPath);
    if (sheetStat.mtimeMs >= gifStat.mtimeMs) {
      console.log(`[gif-to-sheet] ${rel} — up to date, skipping`);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      manifest.push(meta);
      continue;
    }
  }

  console.log(`[gif-to-sheet] Converting ${rel}...`);

  try {
    const frameData = await gifFrames({ url: gifPath, frames: 'all', outputType: 'png', cumulative: true });

    let step = 1;
    if (frameData.length > MAX_FRAMES) {
      step = Math.ceil(frameData.length / MAX_FRAMES);
    }
    const selected = frameData.filter((_, i) => i % step === 0).slice(0, MAX_FRAMES);
    const count = selected.length;

    console.log(`  ${frameData.length} raw frames -> ${count} selected (step=${step})`);

    const resized = [];
    for (const frame of selected) {
      const stream = frame.getImage();
      const buf = await new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
      const img = await sharp(buf).resize(FRAME_W, FRAME_H, { fit: 'fill' }).png().toBuffer();
      resized.push(img);
    }

    const sheetW = FRAME_W * count;
    const composites = resized.map((buf, i) => ({ input: buf, left: i * FRAME_W, top: 0 }));
    await sharp({ create: { width: sheetW, height: FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites)
      .png({ compressionLevel: 9 })
      .toFile(sheetPath);

    const meta = { name, file: `${fileBase}.png`, frameWidth: FRAME_W, frameHeight: FRAME_H, frameCount: count };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    manifest.push(meta);

    const sizeKB = (fs.statSync(sheetPath).size / 1024).toFixed(1);
    console.log(`  -> ${sheetPath} (${sheetW}x${FRAME_H}, ${count} frames, ${sizeKB} KB)`);
  } catch (err) {
    console.error(`  ERROR processing ${gif}:`, err.message);
  }
}

fs.writeFileSync(path.join(SHEETS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`[gif-to-sheet] Done. ${manifest.length} sheet(s) in manifest.`);
