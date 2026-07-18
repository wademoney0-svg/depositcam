import { useEffect, useRef, useState } from 'react'
import type { Inspection, InspectionType, Room } from './types'
import { DEFAULT_ROOMS, SHOT_CHECKLIST, uid } from './types'
import { deleteInspection, listInspections, saveInspection } from './db'
import { processCapture } from './photo'
import { generateReport } from './pdf'
import {
  STRIPE_PAYMENT_LINK,
  UNLOCK_PRICE,
  absorbPaymentRedirect,
  clearAwaitingPayment,
  isAwaitingPayment,
  isUnlocked,
  markAwaitingPayment,
  paywallEnabled,
  rememberPendingExport,
  takePendingExport,
  wasStorageNoticeDismissed,
  dismissStorageNotice,
} from './config'
import { track } from './analytics'

type View =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'inspection'; id: string }
  | { name: 'room'; inspectionId: string; roomId: string }

function newRoom(name: string): Room {
  return { id: uid(), name, notes: '', photos: [], done: false }
}

export default function App() {
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [view, setView] = useState<View>({ name: 'home' })
  const [busy, setBusy] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [showEmailNudge, setShowEmailNudge] = useState(false)
  const [reportFile, setReportFile] = useState<File | null>(null)
  const resumeStarted = useRef(false)

  async function resumePaidExport(list: Inspection[]) {
    if (resumeStarted.current || !isUnlocked()) return
    const pendingId = takePendingExport()
    if (!pendingId) return
    const inspection = list.find((i) => i.id === pendingId)
    if (!inspection) return

    resumeStarted.current = true
    clearAwaitingPayment()
    setShowPaywall(false)
    setView({ name: 'inspection', id: inspection.id })
    setBusy(true)
    try {
      // Let the page settle after returning from Stripe before building/saving the PDF.
      await new Promise((r) => setTimeout(r, 600))
      const file = await generateReport(inspection)
      track('report-exported')
      setReportFile(file)
      setShowEmailNudge(true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    listInspections().then((loaded) => {
      setInspections(loaded)
      if (absorbPaymentRedirect()) {
        setTimeout(() => track('purchase-completed'), 2000)
        resumePaidExport(loaded)
      } else if (isAwaitingPayment() && isUnlocked()) {
        resumePaidExport(loaded)
      }
    })

    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      if (!isAwaitingPayment() || !isUnlocked()) return
      listInspections().then((loaded) => {
        setInspections(loaded)
        resumePaidExport(loaded)
      })
    }

    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [])

  async function upsert(inspection: Inspection) {
    await saveInspection(inspection)
    setInspections(await listInspections())
  }

  async function remove(id: string) {
    if (!confirm('Delete this inspection and all its photos?')) return
    await deleteInspection(id)
    setInspections(await listInspections())
    setView({ name: 'home' })
  }

  const current =
    view.name === 'inspection' || view.name === 'room'
      ? inspections.find((i) => i.id === (view.name === 'inspection' ? view.id : view.inspectionId))
      : undefined

  if (view.name === 'new') {
    return (
      <NewInspection
        onCancel={() => setView({ name: 'home' })}
          onCreate={async (inspection) => {
          track('walkthrough-started')
          await upsert(inspection)
          setView({ name: 'inspection', id: inspection.id })
        }}
      />
    )
  }

  if (view.name === 'inspection' && current) {
    return (
      <InspectionDetail
        inspection={current}
        busy={busy}
        onBack={() => setView({ name: 'home' })}
        onOpenRoom={(roomId) => setView({ name: 'room', inspectionId: current.id, roomId })}
        onAddRoom={async (name) => {
          await upsert({ ...current, rooms: [...current.rooms, newRoom(name)] })
        }}
        onDelete={() => remove(current.id)}
        showPaywall={showPaywall}
        onClosePaywall={() => setShowPaywall(false)}
        showEmailNudge={showEmailNudge}
        onCloseEmailNudge={() => setShowEmailNudge(false)}
        reportFile={reportFile}
        onExport={async () => {
          track('export-clicked')
          if (paywallEnabled() && !isUnlocked()) {
            track('paywall-shown')
            rememberPendingExport(current.id)
            markAwaitingPayment()
            setShowPaywall(true)
            return
          }
          setBusy(true)
          try {
            const file = await generateReport(current)
            track('report-exported')
            setReportFile(file)
            setShowEmailNudge(true)
          } finally {
            setBusy(false)
          }
        }}
      />
    )
  }

  if (view.name === 'room' && current) {
    const room = current.rooms.find((r) => r.id === view.roomId)
    if (room) {
      return (
        <RoomDetail
          room={room}
          onBack={() => setView({ name: 'inspection', id: current.id })}
          onChange={async (updated) => {
            await upsert({
              ...current,
              rooms: current.rooms.map((r) => (r.id === updated.id ? updated : r)),
            })
          }}
          onRemoveRoom={async () => {
            if (!confirm(`Remove "${room.name}" and its photos?`)) return
            await upsert({ ...current, rooms: current.rooms.filter((r) => r.id !== room.id) })
            setView({ name: 'inspection', id: current.id })
          }}
        />
      )
    }
  }

  return (
    <Home
      inspections={inspections}
      onNew={() => setView({ name: 'new' })}
      onOpen={(id) => setView({ name: 'inspection', id })}
    />
  )
}

function Home({
  inspections,
  onNew,
  onOpen,
}: {
  inspections: Inspection[]
  onNew: () => void
  onOpen: (id: string) => void
}) {
  const [showStorageNotice, setShowStorageNotice] = useState(() => !wasStorageNoticeDismissed())

  return (
    <div className="screen">
      <header className="hero">
        <img className="logo-badge" src="/icon.svg" alt="DepositCam logo" />
        <h1>DepositCam</h1>
        <p className="tagline">
          Timestamped photo evidence of your rental's condition, so your security deposit comes
          back to you.
        </p>
      </header>

      <button className="btn primary big" onClick={onNew}>
        Start a walkthrough
      </button>

      {inspections.length > 0 && (
        <section>
          <h2 className="section-title">Your walkthroughs</h2>
          <ul className="card-list">
            {inspections.map((i) => {
              const photos = i.rooms.reduce((n, r) => n + r.photos.length, 0)
              return (
                <li key={i.id}>
                  <button className="card" onClick={() => onOpen(i.id)}>
                    <div className="card-top">
                      <span className={`pill ${i.type}`}>
                        {i.type === 'move-in' ? 'Move-in' : 'Move-out'}
                      </span>
                      <span className="muted small">
                        {new Date(i.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="card-title">{i.address || 'Untitled property'}</div>
                    <div className="muted small">
                      {i.rooms.length} rooms · {photos} photos
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {inspections.length === 0 && (
        <section className="empty-hint">
          <h2 className="section-title">How it works</h2>
          <ol className="steps">
            <li>Walk through each room with the guided checklist.</li>
            <li>Every photo is stamped with the date, time and GPS location.</li>
            <li>Export a polished PDF report to send your landlord — or a small-claims court.</li>
          </ol>
        </section>
      )}

      <footer className="studio-credit">
        <img src="/wade-foundry-lockup.png" alt="A Wade Foundry app" />
        <a className="privacy-link" href="/privacy.html">
          Privacy
        </a>
      </footer>

      {showStorageNotice && (
        <StorageNoticeModal
          onDismiss={() => {
            dismissStorageNotice()
            setShowStorageNotice(false)
          }}
        />
      )}
    </div>
  )
}

function StorageNoticeModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your data stays on this device</h2>
        <p className="muted">
          Walkthroughs, photos, and your PDF unlock are saved in this browser — not in the cloud.
        </p>
        <p className="muted">
          <strong>Private or incognito windows</strong> usually erase everything when you close
          them.
        </p>
        <p className="muted">
          <strong>Clearing browser history or site data</strong> will delete your walkthroughs and
          unlock too. Export your PDF and keep a copy somewhere safe.
        </p>
        <button className="btn primary big" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  )
}

function NewInspection({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (i: Inspection) => void
}) {
  const [address, setAddress] = useState('')
  const [unit, setUnit] = useState('')
  const [landlord, setLandlord] = useState('')
  const [type, setType] = useState<InspectionType>('move-in')

  return (
    <div className="screen">
      <TopBar title="New walkthrough" onBack={onCancel} />
      <div className="form">
        <label>
          Property address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Springfield"
            autoFocus
          />
        </label>
        <label>
          Unit / apartment (optional)
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Apt 4B" />
        </label>
        <label>
          Landlord or management (optional)
          <input
            value={landlord}
            onChange={(e) => setLandlord(e.target.value)}
            placeholder="Acme Property Management"
          />
        </label>
        <div className="segmented">
          <button
            className={type === 'move-in' ? 'active' : ''}
            onClick={() => setType('move-in')}
          >
            Move-in
          </button>
          <button
            className={type === 'move-out' ? 'active' : ''}
            onClick={() => setType('move-out')}
          >
            Move-out
          </button>
        </div>
        <button
          className="btn primary big"
          disabled={!address.trim()}
          onClick={() => {
            const now = Date.now()
            onCreate({
              id: uid(),
              address: address.trim(),
              unit: unit.trim(),
              landlord: landlord.trim(),
              type,
              createdAt: now,
              updatedAt: now,
              rooms: DEFAULT_ROOMS.map(newRoom),
            })
          }}
        >
          Begin walkthrough
        </button>
      </div>
    </div>
  )
}

function InspectionDetail({
  inspection,
  busy,
  showPaywall,
  onClosePaywall,
  showEmailNudge,
  onCloseEmailNudge,
  reportFile,
  onBack,
  onOpenRoom,
  onAddRoom,
  onDelete,
  onExport,
}: {
  inspection: Inspection
  busy: boolean
  showPaywall: boolean
  onClosePaywall: () => void
  showEmailNudge: boolean
  onCloseEmailNudge: () => void
  reportFile: File | null
  onBack: () => void
  onOpenRoom: (roomId: string) => void
  onAddRoom: (name: string) => void
  onDelete: () => void
  onExport: () => void
}) {
  const photos = inspection.rooms.reduce((n, r) => n + r.photos.length, 0)
  const doneCount = inspection.rooms.filter((r) => r.done).length

  return (
    <div className="screen">
      <TopBar title={inspection.address || 'Walkthrough'} onBack={onBack} />
      <div className="summary-row">
        <span className={`pill ${inspection.type}`}>
          {inspection.type === 'move-in' ? 'Move-in' : 'Move-out'}
        </span>
        <span className="muted small">
          {doneCount}/{inspection.rooms.length} rooms done · {photos} photos
        </span>
      </div>

      <ul className="card-list">
        {inspection.rooms.map((room) => (
          <li key={room.id}>
            <button className="card row" onClick={() => onOpenRoom(room.id)}>
              <div>
                <div className="card-title">{room.name}</div>
                <div className="muted small">
                  {room.photos.length} photo{room.photos.length === 1 ? '' : 's'}
                  {room.notes.trim() ? ' · notes' : ''}
                </div>
              </div>
              <span className={`check ${room.done ? 'on' : ''}`}>
                {room.done ? '✓' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button
        className="btn ghost"
        onClick={() => {
          const name = prompt('Room name (e.g. Balcony, Garage)')
          if (name?.trim()) onAddRoom(name.trim())
        }}
      >
        + Add a room
      </button>

      <div className="footer-actions">
        <button className="btn primary big" onClick={onExport} disabled={busy || photos === 0}>
          {busy ? 'Building PDF…' : 'Export PDF report'}
        </button>
        <button className="btn danger-link" onClick={onDelete}>
          Delete walkthrough
        </button>
      </div>

      {showPaywall && <PaywallModal onClose={onClosePaywall} />}
      {showEmailNudge && (
        <EmailNudgeModal inspection={inspection} reportFile={reportFile} onClose={onCloseEmailNudge} />
      )}
    </div>
  )
}

function EmailNudgeModal({
  inspection,
  reportFile,
  onClose,
}: {
  inspection: Inspection
  reportFile: File | null
  onClose: () => void
}) {
  const typeLabel = inspection.type === 'move-in' ? 'Move-in' : 'Move-out'
  const place = inspection.unit ? `${inspection.address}, ${inspection.unit}` : inspection.address
  const subject = `${typeLabel} condition report — ${place}`
  const body =
    `Hi,\n\nAttached is the ${typeLabel.toLowerCase()} photo condition report for ${place}, ` +
    `documenting its condition as of ${new Date().toLocaleDateString()}. ` +
    `Each photo is stamped with the date, time and location it was taken.\n\n` +
    `Please keep this for your records.\n\n(Report attached — generated with DepositCam, depositcam.com)`
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  const canShareFile =
    reportFile !== null &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [reportFile] })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Report downloaded ✓</h2>
        <p className="muted">
          Now make it count: email it to your landlord today. Their inbox timestamp becomes
          independent proof of when this report existed — your strongest defense in a dispute.
        </p>
        {canShareFile ? (
          <>
            <p className="muted">
              The PDF gets attached for you — just pick your email app and send a copy to yourself
              too.
            </p>
            <button
              className="btn primary big"
              onClick={async () => {
                track('email-nudge-used')
                try {
                  await navigator.share({
                    files: [reportFile],
                    title: subject,
                    text: body,
                  })
                } catch {
                  // Renter dismissed the share sheet — nothing to do.
                }
              }}
            >
              Send it — PDF attached
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              Attach the PDF that just downloaded, and send a copy to yourself too.
            </p>
            <a className="btn primary big" href={mailto} onClick={() => track('email-nudge-used')}>
              Email it now
            </a>
          </>
        )}
        <button className="btn danger-link" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  )
}

function PaywallModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Unlock PDF export</h2>
        <p className="muted">
          Your walkthrough is saved on this device. A one-time payment of {UNLOCK_PRICE} unlocks
          PDF reports forever — every walkthrough, every property.
        </p>
        <ul className="perk-list">
          <li>Dispute-ready PDF with timestamped, GPS-stamped photos</li>
          <li>Unlimited exports on this device</li>
          <li>Send it to your landlord or small-claims court</li>
        </ul>
        <a
          className="btn primary big"
          href={STRIPE_PAYMENT_LINK}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markAwaitingPayment()}
        >
          Unlock for {UNLOCK_PRICE}
        </a>
        <button className="btn danger-link" onClick={onClose}>
          Not now
        </button>
      </div>
    </div>
  )
}

function RoomDetail({
  room,
  onBack,
  onChange,
  onRemoveRoom,
}: {
  room: Room
  onBack: () => void
  onChange: (room: Room) => void
  onRemoveRoom: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setProcessing(true)
    try {
      const added = []
      for (const file of Array.from(files)) {
        added.push(await processCapture(file))
      }
      onChange({ ...room, photos: [...room.photos, ...added] })
    } finally {
      setProcessing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="screen">
      <TopBar title={room.name} onBack={onBack} />

      <details className="checklist">
        <summary>What to photograph</summary>
        <ul>
          {SHOT_CHECKLIST.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </details>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        className="btn primary big"
        onClick={() => fileRef.current?.click()}
        disabled={processing}
      >
        {processing ? 'Stamping photos…' : 'Take / add photos'}
      </button>

      {room.photos.length > 0 && (
        <div className="photo-grid">
          {room.photos.map((p) => (
            <figure key={p.id}>
              <img src={p.dataUrl} alt={p.caption || 'Room photo'} />
              <input
                className="caption"
                value={p.caption}
                placeholder="Add a caption…"
                onChange={(e) =>
                  onChange({
                    ...room,
                    photos: room.photos.map((x) =>
                      x.id === p.id ? { ...x, caption: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                className="btn danger-link small"
                onClick={() => {
                  if (!confirm('Delete this photo?')) return
                  onChange({ ...room, photos: room.photos.filter((x) => x.id !== p.id) })
                }}
              >
                Delete photo
              </button>
            </figure>
          ))}
        </div>
      )}

      <label className="notes-label">
        Notes about this room
        <textarea
          value={room.notes}
          rows={3}
          placeholder="e.g. Scratch on floor near window was already there at move-in."
          onChange={(e) => onChange({ ...room, notes: e.target.value })}
        />
      </label>

      <label className="done-toggle">
        <input
          type="checkbox"
          checked={room.done}
          onChange={(e) => onChange({ ...room, done: e.target.checked })}
        />
        Mark room as done
      </label>

      <button className="btn danger-link" onClick={onRemoveRoom}>
        Remove this room
      </button>
    </div>
  )
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="topbar">
      <button className="back" onClick={onBack} aria-label="Back">
        ←
      </button>
      <h1>{title}</h1>
    </header>
  )
}
