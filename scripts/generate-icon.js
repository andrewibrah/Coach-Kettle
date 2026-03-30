#!/usr/bin/env node
/**
 * Generates all app icon / splash PNGs from the SVG source.
 * Usage: node scripts/generate-icon.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svgSrc = path.join(root, 'assets', 'images', 'coach_kettle.svg');

// Android adaptive icon background color (matches app.json backgroundColor)
const ANDROID_BG_HEX = '#E6F4FE';

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}

async function generateStandard(src, dest, size, label) {
  await sharp(src, { density: Math.ceil((size / 100) * 96) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(dest);
  printResult(dest, label);
}

async function generateAndroidForeground(src, dest, size, label) {
  // Icon fills ~66% of canvas (safe zone) — matches Google adaptive icon spec
  const iconSize = Math.round(size * 0.66);
  const padding = Math.round((size - iconSize) / 2);
  const iconBuf = await sharp(src, { density: Math.ceil((iconSize / 100) * 96) })
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: iconBuf, top: padding, left: padding }])
    .png()
    .toFile(dest);
  printResult(dest, label);
}

async function generateAndroidBackground(dest, size, label) {
  const bg = hexToRgb(ANDROID_BG_HEX);
  await sharp({
    create: { width: size, height: size, channels: 3, background: bg },
  })
    .png()
    .toFile(dest);
  printResult(dest, label);
}

async function generateAndroidMonochrome(src, dest, size, label) {
  // White icon on transparent background — Android 13+ themed icons
  const iconSize = Math.round(size * 0.66);
  const padding = Math.round((size - iconSize) / 2);
  const iconBuf = await sharp(src, { density: Math.ceil((iconSize / 100) * 96) })
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const whiteBuf = await sharp(iconBuf)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: whiteBuf, top: padding, left: padding, blend: 'over' }])
    .png()
    .toFile(dest);
  printResult(dest, label);
}

function printResult(dest, label) {
  const { size: bytes } = fs.statSync(dest);
  console.log(`✅ ${label}`);
  console.log(`   → ${dest} (${(bytes / 1024).toFixed(1)} KB)`);
}

(async () => {
  if (!fs.existsSync(svgSrc)) {
    console.error(`❌ Source SVG not found: ${svgSrc}`);
    process.exit(1);
  }

  console.log(`📁 Source: ${svgSrc}\n`);

  const img = path.join(root, 'assets', 'images');
  const appiconset = path.join(root, 'ios', 'CoachKettle', 'Images.xcassets', 'AppIcon.appiconset');

  // iOS app icon + app.json icon reference
  await generateStandard(svgSrc, path.join(img, 'icon.png'), 1024, 'assets/images/icon.png');
  await generateStandard(svgSrc, path.join(appiconset, 'App-Icon-1024x1024@1x.png'), 1024, 'iOS AppIcon.appiconset/App-Icon-1024x1024@1x.png');

  // Android adaptive icons
  await generateAndroidForeground(svgSrc, path.join(img, 'android-icon-foreground.png'), 1024, 'assets/images/android-icon-foreground.png');
  await generateAndroidBackground(path.join(img, 'android-icon-background.png'), 1024, 'assets/images/android-icon-background.png');
  await generateAndroidMonochrome(svgSrc, path.join(img, 'android-icon-monochrome.png'), 1024, 'assets/images/android-icon-monochrome.png');

  // Splash screen logo (expo-splash-screen plugin needs this)
  await generateStandard(svgSrc, path.join(img, 'kettlebell-logo.png'), 1024, 'assets/images/kettlebell-logo.png');

  // Web favicon
  await generateStandard(svgSrc, path.join(img, 'favicon.png'), 32, 'assets/images/favicon.png');

  console.log('\n🎉 All assets generated! Push a new EAS build.');
})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
