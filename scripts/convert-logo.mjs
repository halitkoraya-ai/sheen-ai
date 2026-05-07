import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'

const src = 'public/logo.webp'
const out = 'public/logo.png'

const input = await readFile(src)

// 1. Trim white background, 2. make remaining white pixels transparent, 3. output PNG
const trimmed = await sharp(input).trim({ threshold: 10 }).toBuffer()
const meta = await sharp(trimmed).metadata()
const { width, height } = meta
const size = Math.max(width, height)

// Pad to square so the logo is centered, then output as transparent PNG
const squared = await sharp(trimmed)
  .resize({
    width: size,
    height: size,
    fit: 'contain',
    background: { r: 255, g: 255, b: 255, alpha: 0 },
  })
  .png()
  .toBuffer()

// Convert any remaining near-white pixels to transparent
const { data, info } = await sharp(squared).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2]
  if (r > 245 && g > 245 && b > 245) data[i + 3] = 0
}

await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile(out)

console.log(`Wrote ${out} at ${info.width}x${info.height}`)
