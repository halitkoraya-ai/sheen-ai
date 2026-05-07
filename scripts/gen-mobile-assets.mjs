// Compose mobile launch assets from src/logo.png.
//
// @capacitor/assets needs:
//   assets/icon-only.png       — 1024×1024 logo on transparent bg (already copied)
//   assets/icon-foreground.png — 1024×1024 logo centered with safe margin
//                                (Android adaptive icon trims edges aggressively;
//                                 keep the logo within ~70% of the canvas).
//   assets/splash.png          — 2732×2732 logo centered on lila background.
//   assets/splash-dark.png     — same, on deep-purple background for dark mode.
//
// We use sharp (already a devDep) to do the compositing so we don't need
// any external image editing.
import sharp from 'sharp'

const BG_LIGHT = '#E6DFED'    // C.bg     — lila, light splash background
const BG_DARK  = '#4A2070'    // C.p9     — deep purple, dark splash background

const SRC      = 'src/logo.png'
const OUT_DIR  = 'assets'

const logo1024 = await sharp(SRC)
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

// Adaptive icon foreground — Android's adaptive icon system overlays the
// foreground on a separate (configurable) background layer; we keep the
// logo at ~70% scale so it doesn't get clipped at the rounded edges.
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite([
  { input: await sharp(logo1024).resize(720, 720).toBuffer(), gravity: 'center' },
])
  .png()
  .toFile(`${OUT_DIR}/icon-foreground.png`)

// Light splash — logo on lila bg, 2732×2732 covers all device sizes.
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BG_LIGHT },
}).composite([
  { input: await sharp(logo1024).resize(900, 900).toBuffer(), gravity: 'center' },
])
  .png()
  .toFile(`${OUT_DIR}/splash.png`)

// Dark splash — same logo, deep purple bg, fired by system in dark mode.
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BG_DARK },
}).composite([
  { input: await sharp(logo1024).resize(900, 900).toBuffer(), gravity: 'center' },
])
  .png()
  .toFile(`${OUT_DIR}/splash-dark.png`)

console.log('✓ Generated icon-foreground.png, splash.png, splash-dark.png')
