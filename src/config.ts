/**
 * Paste your Stripe Payment Link here to enable the paid PDF export.
 * While this is empty, exporting stays free (the paywall is disabled).
 *
 * In Stripe: create a Payment Link for a one-time price, and set its
 * confirmation behavior to redirect to:
 *   https://depositcam.com/?paid=1
 */
export const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/eVq6oB4OAfcm3dXbwzfUQ00'

export const UNLOCK_PRICE = '$4.99'

const UNLOCK_KEY = 'dp_unlocked'

export function paywallEnabled(): boolean {
  return STRIPE_PAYMENT_LINK.length > 0
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode / storage blocked — unlock won't persist across sessions.
  }
}

export function isUnlocked(): boolean {
  return storageGet(UNLOCK_KEY) === '1'
}

export function markUnlocked(): void {
  storageSet(UNLOCK_KEY, '1')
}

/** Detects the ?paid=1 redirect from Stripe and persists the unlock. */
export function absorbPaymentRedirect(): boolean {
  const url = new URL(window.location.href)
  if (url.searchParams.get('paid') !== '1') return false

  markUnlocked()
  // Always strip ?paid=1 so a refresh can't re-trigger the post-purchase flow.
  url.searchParams.delete('paid')
  const clean = url.pathname + url.search + url.hash
  try {
    window.history.replaceState(null, '', clean)
  } catch {
    window.location.replace(clean)
  }
  return true
}

export function rememberPendingExport(inspectionId: string): void {
  storageSet('dp_pending_export', inspectionId)
}

export function takePendingExport(): string | null {
  const id = storageGet('dp_pending_export')
  if (id) {
    try {
      localStorage.removeItem('dp_pending_export')
    } catch {}
  }
  return id
}

export const AWAITING_PAYMENT_KEY = 'dp_awaiting_payment'

export function markAwaitingPayment(): void {
  try {
    sessionStorage.setItem(AWAITING_PAYMENT_KEY, '1')
  } catch {}
}

export function clearAwaitingPayment(): void {
  try {
    sessionStorage.removeItem(AWAITING_PAYMENT_KEY)
  } catch {}
}

export function isAwaitingPayment(): boolean {
  try {
    return sessionStorage.getItem(AWAITING_PAYMENT_KEY) === '1'
  } catch {
    return false
  }
}

const STORAGE_NOTICE_KEY = 'dp_storage_notice_dismissed'

export function wasStorageNoticeDismissed(): boolean {
  return storageGet(STORAGE_NOTICE_KEY) === '1'
}

export function dismissStorageNotice(): void {
  storageSet(STORAGE_NOTICE_KEY, '1')
}
