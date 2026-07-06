import sharp from 'sharp'
import { writeFile, mkdir } from 'node:fs/promises'

const BRAND = '/home/wademoney0/projects/wade-foundry/brand'
const SRC = '/home/wademoney0/.cursor/projects/empty-window/assets/wadefoundry-final-a.png'
await mkdir(`${BRAND}/export`, { recursive: true })

const ICON = 512
const CHARCOAL = '#0f1115'

// Tight mark (trim the solid black border around the artwork)
const markTrim = await sharp(SRC).trim({ threshold: 12 }).png().toBuffer()
const markMeta = await sharp(markTrim).metadata()

// --- App icon: full artwork on a rounded charcoal square ---
const roundedMask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}"><rect width="${ICON}" height="${ICON}" rx="112" fill="#fff"/></svg>`,
)
// Place artwork on charcoal (covers final-a's near-black bg), then round corners.
const iconBase = await sharp({
  create: { width: ICON, height: ICON, channels: 4, background: CHARCOAL },
})
  .composite([{ input: await sharp(SRC).resize(ICON, ICON).png().toBuffer(), blend: 'lighten' }])
  .png()
  .toBuffer()
const appIcon512 = await sharp(iconBase)
  .composite([{ input: roundedMask, blend: 'dest-in' }])
  .png()
  .toBuffer()

for (const s of [512, 192, 180, 32, 16]) {
  await writeFile(
    `${BRAND}/export/app-icon-${s}.png`,
    await sharp(appIcon512).resize(s, s).png().toBuffer(),
  )
}

// --- Square social avatar (no rounding; platforms crop) ---
await writeFile(`${BRAND}/export/avatar-512.png`, await sharp(iconBase).png().toBuffer())

// --- Mark on charcoal, tightly cropped, for reuse ---
async function markOnCharcoal(targetH) {
  const scaled = await sharp(markTrim)
    .resize({ height: targetH })
    .png()
    .toBuffer()
  const m = await sharp(scaled).metadata()
  const pad = Math.round(targetH * 0.12)
  return sharp({
    create: {
      width: m.width + pad * 2,
      height: m.height + pad * 2,
      channels: 4,
      background: CHARCOAL,
    },
  })
    .composite([{ input: scaled, top: pad, left: pad, blend: 'lighten' }])
    .png()
    .toBuffer()
}
await writeFile(`${BRAND}/export/mark-512.png`, await markOnCharcoal(512))

// --- Wordmark text -> tight-trimmed transparent PNG (Arial Black) ---
const wordSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="480">
     <text x="20" y="330" font-family="Arial Black, Arial, sans-serif" font-weight="900"
       font-size="300" letter-spacing="6" fill="#ffffff">WADE FOUNDRY</text>
   </svg>`,
)
const wordTrim = await sharp(wordSvg).trim().png().toBuffer()
const wordMeta = await sharp(wordTrim).metadata()

// --- Horizontal lockup: mark (left) + wordmark (right) on charcoal ---
const H = 560
const markH = 430
const markHpng = await sharp(markTrim).resize({ height: markH }).png().toBuffer()
const markHmeta = await sharp(markHpng).metadata()
const gap = 40
const padX = 70
const wordScale = 260 / wordMeta.height
const wordW = Math.round(wordMeta.width * wordScale)
const wordHpx = Math.round(wordMeta.height * wordScale)
const wordScaled = await sharp(wordTrim).resize(wordW, wordHpx).png().toBuffer()
const totalW = padX + markHmeta.width + gap + wordW + padX
const horizBg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${H}"><rect width="${totalW}" height="${H}" fill="${CHARCOAL}"/></svg>`,
)
await writeFile(
  `${BRAND}/export/logo-horizontal.png`,
  await sharp(horizBg)
    .composite([
      { input: markHpng, top: Math.round((H - markH) / 2), left: padX, blend: 'lighten' },
      { input: wordScaled, top: Math.round((H - wordHpx) / 2), left: padX + markHmeta.width + gap },
    ])
    .png()
    .toBuffer(),
)

// --- Stacked lockup: mark on top, wordmark below ---
const stackMarkH = 420
const stackMark = await sharp(markTrim).resize({ height: stackMarkH }).png().toBuffer()
const stackMeta = await sharp(stackMark).metadata()
const stackWordScale = 150 / wordMeta.height
const swW = Math.round(wordMeta.width * stackWordScale)
const swH = Math.round(wordMeta.height * stackWordScale)
const stackWord = await sharp(wordTrim).resize(swW, swH).png().toBuffer()
const SW = Math.max(stackMeta.width, swW) + 160
const SH = stackMarkH + swH + 150
const stackBg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><rect width="${SW}" height="${SH}" fill="${CHARCOAL}"/></svg>`,
)
await writeFile(
  `${BRAND}/export/logo-stacked.png`,
  await sharp(stackBg)
    .composite([
      { input: stackMark, top: 40, left: Math.round((SW - stackMeta.width) / 2), blend: 'lighten' },
      { input: stackWord, top: 40 + stackMarkH + 30, left: Math.round((SW - swW) / 2) },
    ])
    .png()
    .toBuffer(),
)

console.log('brand assets rendered to', `${BRAND}/export`)
console.log('mark trimmed:', markMeta.width, 'x', markMeta.height)
