import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium } from 'playwright'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

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
await new Promise((r) => server.listen(4175, r))

const browser = await chromium.launch({
  executablePath: new URL('../.pw-browsers/chromium-1228/chrome-linux64/chrome', import.meta.url)
    .pathname,
  args: ['--no-sandbox'],
})

async function runExport(context) {
  const page = await context.newPage()
  await page.goto('http://localhost:4175/')
  await page.getByText('Start a walkthrough').click()
  await page.getByPlaceholder('123 Main St, Springfield').fill('9 Share Ct')
  await page.getByText('Begin walkthrough').click()
  await page.getByText('Living Room').click()
  await page.locator('input[type=file]').setInputFiles('shots/sample/living-room.jpg')
  await page.waitForTimeout(1200)
  await page.locator('.back').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByText('Export PDF report').click()
  await downloadPromise
  return page
}

// Case 1: browser supports sharing files (mocked, like iOS/Android)
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    localStorage.setItem('dp_unlocked', '1')
    window.__shared = null
    navigator.canShare = (data) => !!data?.files?.length
    navigator.share = async (data) => {
      window.__shared = {
        fileName: data.files?.[0]?.name,
        fileType: data.files?.[0]?.type,
        fileSize: data.files?.[0]?.size,
        title: data.title,
      }
    }
  })
  const page = await runExport(context)
  await page.getByText('Send it — PDF attached').click()
  const shared = await page.evaluate(() => window.__shared)
  if (!shared || shared.fileType !== 'application/pdf' || !shared.fileSize) {
    throw new Error('FAIL: share was not called with the PDF file: ' + JSON.stringify(shared))
  }
  console.log('ok: share sheet got the PDF attached:', JSON.stringify(shared))
  await context.close()
}

// Case 2: no file sharing support (desktop) -> mailto fallback
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    localStorage.setItem('dp_unlocked', '1')
    delete navigator.canShare
    delete navigator.share
  })
  const page = await runExport(context)
  const href = await page.getByText('Email it now').getAttribute('href')
  if (!href?.startsWith('mailto:')) throw new Error('FAIL: mailto fallback missing')
  console.log('ok: mailto fallback shown when sharing unsupported')
  await context.close()
}

await browser.close()
server.close()
console.log('PASS')
