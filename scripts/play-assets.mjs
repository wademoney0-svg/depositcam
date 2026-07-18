/**
 * Generate Play Store / TWA PNG icons from public/icon.svg
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const PUBLIC = join(ROOT, 'public')
const SVG = join(PUBLIC, 'icon.svg')

await mkdir(PUBLIC, { recursive: true })

for (const size of [192, 512]) {
  await sharp(SVG)
    .resize(size, size)
    .png()
    .toFile(join(PUBLIC, `icon-${size}.png`))
  console.log(`wrote icon-${size}.png`)
}

// Maskable: full-bleed charcoal square (Play adaptive icon safe zone)
for (const size of [192, 512]) {
  const pad = Math.round(size * 0.1)
  const inner = size - pad * 2
  const icon = await sharp(SVG).resize(inner, inner).png().toBuffer()
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: '#0f1115',
    },
  })
    .composite([{ input: icon, top: pad, left: pad }])
    .png()
    .toFile(join(PUBLIC, `icon-maskable-${size}.png`))
  console.log(`wrote icon-maskable-${size}.png`)
}

console.log('play assets ready')
