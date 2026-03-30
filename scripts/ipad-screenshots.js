/**
 * ipad-screenshots.js
 *
 * Converts iPhone screenshots → iPad 13" App Store size (2064 × 2752 px)
 * Centers the iPhone screenshot on Coach Kettle's dark background.
 *
 * Usage:
 *   1. Drop your iPhone screenshots into:  scripts/iphone-shots/
 *   2. Run:  node scripts/ipad-screenshots.js
 *   3. Find iPad-sized outputs in:         scripts/ipad-shots/
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const IPAD_W   = 2064;   // iPad Pro 13" portrait width  (App Store requirement)
const IPAD_H   = 2752;   // iPad Pro 13" portrait height
const BG_COLOR = { r: 26, g: 26, b: 46, alpha: 1 }; // #1a1a2e — Coach Kettle dark bg

const INPUT_DIR  = path.join(__dirname, 'iphone-shots');
const OUTPUT_DIR = path.join(__dirname, 'ipad-shots');
// ─────────────────────────────────────────────────────────────────────────────

const EXTS = new Set(['.png', '.jpg', '.jpeg']);

async function convertToIpad(inputPath, outputPath) {
  const img     = sharp(inputPath);
  const meta    = await img.metadata();
  const srcW    = meta.width;
  const srcH    = meta.height;

  // Scale the iPhone shot so it fits inside the iPad canvas with 60px margin on each side
  const margin  = 60;
  const maxW    = IPAD_W - margin * 2;
  const maxH    = IPAD_H - margin * 2;
  const scale   = Math.min(maxW / srcW, maxH / srcH);
  const newW    = Math.round(srcW * scale);
  const newH    = Math.round(srcH * scale);

  // Resize the source image
  const resized = await sharp(inputPath)
    .resize(newW, newH, { fit: 'fill' })
    .png()
    .toBuffer();

  // Composite centered onto iPad canvas
  const left = Math.round((IPAD_W - newW) / 2);
  const top  = Math.round((IPAD_H - newH) / 2);

  await sharp({
    create: {
      width:      IPAD_W,
      height:     IPAD_H,
      channels:   4,
      background: BG_COLOR,
    },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(`  ✓  ${path.basename(inputPath)}  →  ${path.basename(outputPath)}  (${newW}×${newH} centered)`);
}

async function main() {
  // Ensure folders exist
  if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
    console.log(`\nCreated input folder: scripts/iphone-shots/`);
    console.log('Drop your iPhone screenshots in there, then re-run this script.\n');
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs.readdirSync(INPUT_DIR).filter(f => EXTS.has(path.extname(f).toLowerCase()));

  if (files.length === 0) {
    console.log('\nNo screenshots found in scripts/iphone-shots/ — add your PNG/JPG files and re-run.\n');
    return;
  }

  console.log(`\nConverting ${files.length} screenshot(s) to iPad 13" (${IPAD_W}×${IPAD_H})...\n`);

  for (const file of files) {
    const name  = path.parse(file).name;
    const input = path.join(INPUT_DIR, file);
    const out   = path.join(OUTPUT_DIR, `${name}_ipad.png`);
    await convertToIpad(input, out);
  }

  console.log(`\nDone! iPad screenshots saved to: scripts/ipad-shots/\n`);
  console.log('Upload those files to App Store Connect → Distribution → iPad → 13" Display.\n');
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
