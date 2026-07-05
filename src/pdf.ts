import { jsPDF } from 'jspdf'
import type { Inspection } from './types'
import { formatStamp } from './photo'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const CONTENT_W = PAGE_W - MARGIN * 2

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.width, h: img.height })
    img.src = dataUrl
  })
}

export async function generateReport(inspection: Inspection): Promise<File> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const created = new Date(inspection.createdAt)
  const typeLabel = inspection.type === 'move-in' ? 'Move-In' : 'Move-Out'
  const photoCount = inspection.rooms.reduce((n, r) => n + r.photos.length, 0)
  const doneCount = inspection.rooms.filter((r) => r.done).length

  // Cover page
  doc.setFillColor(15, 17, 21)
  doc.rect(0, 0, PAGE_W, 70, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text(`${typeLabel} Condition Report`, MARGIN, 30)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 190, 200)
  doc.text('Prepared with DepositCam', MARGIN, 40)

  doc.setTextColor(20, 20, 20)
  let y = 88
  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value || '—', MARGIN + 45, y)
    y += 9
  }
  row('Property', inspection.address)
  row('Unit', inspection.unit)
  row('Landlord / Mgmt', inspection.landlord)
  row('Inspection type', typeLabel)
  row('Date recorded', created.toLocaleString())
  row('Rooms documented', String(doneCount))
  row('Photos', String(photoCount))

  y += 6
  doc.setFontSize(9.5)
  doc.setTextColor(90, 90, 90)
  const disclaimer = doc.splitTextToSize(
    'Each photo in this report carries a timestamp (and GPS coordinates where available) that was burned into the image at the moment of capture. This report documents the condition of the property as observed on the date above.',
    CONTENT_W,
  )
  doc.text(disclaimer, MARGIN, y)

  // Room pages
  for (const room of inspection.rooms) {
    if (room.photos.length === 0 && !room.notes.trim()) continue
    doc.addPage()
    doc.setFillColor(15, 17, 21)
    doc.rect(0, 0, PAGE_W, 22, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(room.name, MARGIN, 14)

    let cy = 32
    if (room.notes.trim()) {
      doc.setTextColor(20, 20, 20)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Notes', MARGIN, cy)
      cy += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      const lines = doc.splitTextToSize(room.notes, CONTENT_W)
      doc.text(lines, MARGIN, cy)
      cy += lines.length * 5 + 6
    }

    for (const photo of room.photos) {
      const { w, h } = await imageSize(photo.dataUrl)
      const captionH = 12
      // Cap height so a portrait photo always fits on a page below the room
      // header with room for its caption; keep aspect ratio and center it.
      const maxH = PAGE_H - MARGIN * 2 - captionH - 22
      let drawW = CONTENT_W
      let drawH = (h / w) * drawW
      if (drawH > maxH) {
        drawH = maxH
        drawW = (w / h) * drawH
      }

      if (cy + drawH + captionH > PAGE_H - MARGIN) {
        doc.addPage()
        cy = MARGIN
      }
      doc.addImage(photo.dataUrl, 'JPEG', MARGIN + (CONTENT_W - drawW) / 2, cy, drawW, drawH)
      cy += drawH + 5
      doc.setFontSize(9)
      doc.setTextColor(90, 90, 90)
      const meta = formatStamp(photo.takenAt, photo.lat, photo.lng)
      doc.text(photo.caption ? `${photo.caption} — ${meta}` : meta, MARGIN, cy)
      cy += 10
    }
  }

  // Page numbers
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8.5)
    doc.setTextColor(140, 140, 140)
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' })
  }

  const slug = inspection.address.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'report'
  const filename = `depositcam-${inspection.type}-${slug}.pdf`
  doc.save(filename)
  // Also hand the PDF back as a File so it can be attached to the native
  // share sheet (email with the report already attached).
  return new File([doc.output('blob')], filename, { type: 'application/pdf' })
}
