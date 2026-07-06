import http from 'node:http'
import { readFile, mkdir, rm, cp } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium } from 'playwright'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const OUT = join(ROOT, 'shots', 'reel')
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const server = http.createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const data = await readFile(join(DIST, path))
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    const data = await readFile(join(DIST, 'index.html'))
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(data)
  }
})
await new Promise((r) => server.listen(4176, r))

const browser = await chromium.launch({
  executablePath: new URL('../.pw-browsers/chromium-1228/chrome-linux64/chrome', import.meta.url)
    .pathname,
  args: ['--no-sandbox'],
})

const context = await browser.newContext({
  viewport: { width: 540, height: 960 }, // exact 9:16
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  geolocation: { latitude: 41.8858, longitude: -87.6229 },
  permissions: ['geolocation'],
  recordVideo: { dir: OUT, size: { width: 540, height: 960 } },
})

// Unlock (skip paywall) + mock native share so the "PDF attached" button shows.
await context.addInitScript(() => {
  try {
    localStorage.setItem('dp_unlocked', '1')
  } catch {}
  try {
    navigator.canShare = (d) => !!d?.files?.length
    navigator.share = async () => {}
  } catch {}
})

// Idempotent overlay setup, injected after load and re-checked before use.
const REEL_SETUP = () => {
  if (window.__reel) return
  const root = document.body || document.documentElement
  const style = document.createElement('style')
  style.textContent = `
    #reel-cap, #reel-card {
      position: fixed; left: 0; right: 0; z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: none; transition: opacity .35s ease;
    }
    #reel-cap {
      bottom: 70px; margin: 0 22px; padding: 18px 20px;
      background: rgba(12,14,18,.82); color: #fff; border-radius: 18px;
      font-size: 31px; font-weight: 800; line-height: 1.25; text-align: center;
      box-shadow: 0 10px 40px rgba(0,0,0,.45); opacity: 0;
      -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    }
    #reel-cap .sub { display:block; font-size: 20px; font-weight: 600; color:#9fe8b0; margin-top:8px; }
    #reel-card {
      inset: 0; bottom: auto; height: 100%;
      background: linear-gradient(160deg, #0f1115 0%, #12351f 140%);
      color: #fff; display: flex; flex-direction: column; align-items: center;
      justify-content: center; text-align: center; padding: 0 44px; opacity: 1;
    }
    #reel-card h1 { font-size: 52px; font-weight: 900; line-height: 1.12; margin: 0; }
    #reel-card p { font-size: 26px; font-weight: 600; color: #a9b3bd; margin: 22px 0 0; }
    #reel-card .emoji { font-size: 72px; margin-bottom: 18px; }
    #reel-card .appicon {
      width: 136px; height: 136px; margin-bottom: 24px; border-radius: 30px;
      box-shadow: 0 14px 44px rgba(0,0,0,.55);
    }
    #reel-card .studio {
      position: absolute; bottom: 70px; left: 0; right: 0;
      display: flex; align-items: center; justify-content: center; gap: 13px; opacity: .9;
    }
    #reel-card .studio img { width: 46px; height: 46px; border-radius: 12px; }
    #reel-card .studio span { font-size: 23px; font-weight: 700; color: #cbd5e1; }
  `
  root.appendChild(style)
  const cap = document.createElement('div')
  cap.id = 'reel-cap'
  const card = document.createElement('div')
  card.id = 'reel-card'
  card.innerHTML =
    '<div class="emoji">💸</div><h1>How I get my<br>FULL deposit back</h1><p>Free. No account. 30 seconds.</p>'
  root.appendChild(cap)
  root.appendChild(card)
  window.__reel = {
    caption(main, sub) {
      cap.innerHTML = sub ? main + '<span class="sub">' + sub + '</span>' : main
      cap.style.opacity = '1'
    },
    hideCaption() {
      cap.style.opacity = '0'
    },
    card(html) {
      card.innerHTML = html
      card.style.opacity = '1'
    },
    hideCard() {
      card.style.opacity = '0'
    },
  }
}

const page = await context.newPage()
const wait = (ms) => page.waitForTimeout(ms)
const ensure = () => page.evaluate(REEL_SETUP)
const cap = (m, s) => page.evaluate(([m, s]) => window.__reel.caption(m, s), [m, s ?? null])
const hideCap = () => page.evaluate(() => window.__reel.hideCaption())
const card = (html) => page.evaluate((h) => window.__reel.card(h), html)
const hideCard = () => page.evaluate(() => window.__reel.hideCard())

await page.goto('http://localhost:4176/', { waitUntil: 'domcontentloaded' })
await ensure() // paints the hook card over the app immediately
await wait(2200) // dwell on hook title card
await hideCard()
await wait(700)

cap('This is DepositCam', 'timestamped move-out evidence')
await wait(2000)
hideCap()
await wait(300)

await page.getByText('Start a walkthrough').click()
await wait(500)
cap('Start a walkthrough')
await page.getByPlaceholder('123 Main St, Springfield').pressSequentially('482 Maple Ave', { delay: 70 })
await page.getByPlaceholder('Apt 4B').pressSequentially('Apt 3B', { delay: 60 })
await wait(700)
hideCap()
await page.getByText('Begin walkthrough').click()
await wait(600)

cap('Every room, guided', 'nothing gets missed ✅')
await wait(2200)
hideCap()
await page.getByText('Living Room').click()
await wait(500)
await page.getByText('What to photograph').click()
await wait(400)
cap('It tells you what to shoot')
await wait(2300)
hideCap()
await wait(200)

await page.locator('input[type=file]').setInputFiles('shots/sample/living-room.jpg')
await wait(1600)
cap('Date + GPS burned into', 'every single photo 📍')
await wait(2600)
hideCap()
await page.getByPlaceholder('Add a caption…').first().fill('West wall + window')
await wait(700)
await page.getByText('Mark room as done').click()
await wait(500)
await page.locator('.back').click()
await wait(700)

cap('One tap →', 'a dispute-ready PDF')
await wait(1600)
const dl = page.waitForEvent('download').catch(() => null)
await page.getByText('Export PDF report').click()
await dl
await wait(1800)
hideCap()
await wait(300)

// Share/email prompt should now be visible
cap('Email it to your landlord', 'their inbox = proof it existed')
await wait(2600)
hideCap()
await wait(300)

card(
  `<img class="appicon" src="/icon.svg" alt=""><h1>DepositCam</h1><p>Protect your deposit.<br>depositcam.com</p>` +
    `<div class="studio"><img src="/wade-foundry-icon.png" alt=""><span>A Wade Foundry app</span></div>`,
)
await wait(2400)

await context.close() // finalizes the video file
const src = await page.video().path()
await cp(src, join(OUT, 'walkthrough.webm'))
await browser.close()
server.close()
console.log('raw video:', join(OUT, 'walkthrough.webm'))
